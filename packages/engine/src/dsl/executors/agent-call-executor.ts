/**
 * Honeycomb DSL - Agent 调用执行器
 *
 * 负责执行 DSL 中的 Agent 调用，集成 AgentRunner 并提供：
 * - 超时控制
 * - 重试机制（指数退避）
 * - 结果映射和缓存
 * - 执行追踪
 *
 * @module dsl/executors/agent-call-executor
 */

import type { AgentDefinition, AgentStatus } from '../../types.js';
import type {
  AgentCallConfig,
  CallResult,
  ExecutionContext,
  ExecutionDependencies,
  ICallExecutor,
  IExecutionTracer,
  RetryConfig,
} from '../agent-call-types.js';
import { AgentCallError, AgentCallErrorCode } from '../agent-call-types.js';

// ============================================================
// 默认配置常量
// ============================================================

/** 默认超时时间（毫秒） - 5 分钟 */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** 默认最大重试次数 */
const DEFAULT_MAX_RETRIES = 3;

/** 默认初始退避时间（毫秒） */
const DEFAULT_BASE_DELAY_MS = 1000;

/** 默认最大退避时间（毫秒） */
const DEFAULT_MAX_DELAY_MS = 30000;

/** 默认退避倍数 */
const DEFAULT_BACKOFF_MULTIPLIER = 2;

/** 默认是否抖动 */
const DEFAULT_JITTER = true;

// ============================================================
// 辅助函数
// ============================================================

/**
 * 计算退避延迟时间（带可选抖动）
 *
 * @param attempt - 当前重试次数（从 0 开始）
 * @param config - 重试配置
 * @returns 延迟时间（毫秒）
 */
function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const baseDelay = config.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelay = config.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const multiplier = config.backoffMultiplier ?? DEFAULT_BACKOFF_MULTIPLIER;
  const jitter = config.jitter ?? DEFAULT_JITTER;

  // 指数退避：baseDelay * (multiplier ^ attempt)
  let delay = baseDelay * Math.pow(multiplier, attempt);

  // 限制最大延迟
  delay = Math.min(delay, maxDelay);

  // 添加抖动（±25%）
  if (jitter) {
    const jitterRange = delay * 0.25;
    delay = delay - jitterRange + Math.random() * jitterRange * 2;
  }

  return Math.max(0, Math.floor(delay));
}

/**
 * 创建带超时的 Promise
 *
 * @param promise - 原始 Promise
 * @param timeoutMs - 超时时间（毫秒）
 * @param errorMessage - 超时错误消息
 * @returns 带超时控制的 Promise
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

// ============================================================
// AgentCallExecutor
// ============================================================

/**
 * Agent 调用执行器
 *
 * 实现了 ICallExecutor 接口，负责执行 DSL 中的 Agent 调用。
 * 通过 AgentRunner.runAgent() 执行 Agent，并提供超时控制、重试机制等功能。
 *
 * 主要功能：
 * 1. 解析输入表达式并构建任务字符串
 * 2. 从 AgentPool 获取 AgentDefinition
 * 3. 通过 AgentRunner.runAgent() 执行 Agent
 * 4. 支持超时控制（timeout 配置）
 * 5. 支持重试机制（RetryConfig）
 * 6. 返回 CallResult 包含 success/value/error/metadata
 *
 * 错误处理：
 * - AgentNotFoundError: Agent 不存在
 * - TimeoutError: 超时
 * - InvalidInputError: 输入验证失败
 * - ExecutionFailedError: Agent 执行失败
 *
 * @example
 * ```ts
 * const executor = new AgentCallExecutor(dependencies);
 * const result = await executor.execute(
 *   { type: 'agent', name: 'researcher', timeout: 30000 },
 *   context
 * );
 * if (result.success) {
 *   console.log('Agent output:', result.data);
 * }
 * ```
 */
export class AgentCallExecutor implements ICallExecutor {
  /** AgentRunner 实例（从 dependencies 注入） */
  private readonly agentRunner: any;

  /** IExecutionTracer 实例（用于追踪） */
  private readonly tracer: IExecutionTracer;

  /** Logger 实例 */
  private readonly logger: any;

  /**
   * 创建 AgentCallExecutor 实例
   *
   * @param dependencies - 执行依赖（包含 AgentRunner 和可选的 Tracer）
   */
  constructor(dependencies: ExecutionDependencies) {
    this.agentRunner = dependencies.agentRunner;
    this.tracer = dependencies.tracer || this.createDefaultTracer();
    this.logger = dependencies.logger || this.createDefaultLogger();
  }

  // ============================================================
  // ICallExecutor 接口实现
  // ============================================================

  /**
   * 执行 Agent 调用
   *
   * @param config - Agent 调用配置
   * @param context - 执行上下文
   * @returns 调用结果
   */
  async execute(
    config: AgentCallConfig,
    context: ExecutionContext
  ): Promise<CallResult> {
    // 开始追踪
    const traceId = this.tracer.startTrace(
      config.name || 'agent',
      'agent',
      config.name
    );

    const startTime = Date.now();
    let retryCount = 0;
    let lastError: Error | undefined;

    try {
      // 验证配置
      const validationErrors = this.validate(config);
      if (validationErrors.length > 0) {
        throw new AgentCallError(
          AgentCallErrorCode.VALIDATION_ERROR,
          `Invalid AgentCallConfig: ${validationErrors.join(', ')}`
        );
      }

      // 获取 AgentDefinition（从 AgentPool 或直接传入）
      const agentDefinition = await this.getAgentDefinition(config.name);

      // 解析输入表达式
      const resolvedInputs = await this.resolveInputs(config.inputs || {}, context);

      // 构建任务字符串
      const task = this.buildTaskString(config.name, resolvedInputs);

      // 获取重试配置
      const retryConfig = config.retry || {};

      // 执行 Agent（带重试）
      let agentState: any;

      for (let attempt = 0; attempt <= (retryConfig.maxRetries ?? DEFAULT_MAX_RETRIES); attempt++) {
        try {
          // 计算超时时间
          const timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;

          // 执行 Agent（带超时控制）
          agentState = await withTimeout(
            this.agentRunner.runAgent(agentDefinition, task, this.buildContextString(resolvedInputs)),
            timeout,
            `Agent '${config.name}' execution timeout after ${timeout}ms`
          );

          // 成功执行，跳出重试循环
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          retryCount = attempt;

          // 检查是否应该重试
          const maxRetries = retryConfig.maxRetries ?? DEFAULT_MAX_RETRIES;
          if (attempt >= maxRetries) {
            // 达到最大重试次数，抛出错误
            throw new AgentCallError(
              AgentCallErrorCode.MAX_RETRIES_EXCEEDED,
              `Agent '${config.name}' failed after ${maxRetries} retries`,
              config.name,
              lastError
            );
          }

          // 计算退避延迟并等待
          const delay = calculateBackoffDelay(attempt, retryConfig);
          this.logger.debug('AgentCallExecutor', `Retrying agent '${config.name}' after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await this.sleep(delay);
        }
      }

      // 处理输出映射
      const outputs = this.processOutputs(config.outputs, agentState);

      // 构建成功结果
      const result: CallResult = {
        success: agentState.status === 'completed' || agentState.status === 'COMPLETED',
        data: agentState.output,
        durationMs: Date.now() - startTime,
        tokensUsed: agentState.token_usage || 0,
        retryCount,
        outputs,
      };

      // 结束追踪
      this.tracer.endTrace(traceId, result);

      // 更新执行上下文
      this.updateContext(context, config.name, result);

      return result;
    } catch (error) {
      // 构建失败结果
      const agentCallError = error instanceof AgentCallError
        ? error
        : new AgentCallError(
          AgentCallErrorCode.EXECUTION_ERROR,
          error instanceof Error ? error.message : String(error),
          config.name,
          error instanceof Error ? error : undefined
        );

      const result: CallResult = {
        success: false,
        error: agentCallError.message,
        durationMs: Date.now() - startTime,
        retryCount,
      };

      // 结束追踪（记录失败）
      this.tracer.endTrace(traceId, result);

      // 更新统计
      context.stats.failedCalls++;

      throw agentCallError;
    }
  }

  /**
   * 验证 Agent 调用配置
   *
   * @param config - 调用配置
   * @returns 验证错误列表（空数组表示验证通过）
   */
  validate(config: AgentCallConfig): string[] {
    const errors: string[] = [];

    // 检查 type
    if (config.type !== 'agent') {
      errors.push(`Expected type 'agent', got '${config.type}'`);
    }

    // 检查 name
    if (!config.name || typeof config.name !== 'string') {
      errors.push('Agent name is required and must be a string');
    }

    // 检查 timeout
    if (config.timeout !== undefined) {
      if (typeof config.timeout !== 'number' || config.timeout <= 0) {
        errors.push('Timeout must be a positive number');
      }
    }

    // 检查 retry 配置
    if (config.retry) {
      if (config.retry.maxRetries !== undefined) {
        if (typeof config.retry.maxRetries !== 'number' || config.retry.maxRetries < 0) {
          errors.push('Retry maxRetries must be a non-negative number');
        }
      }
      if (config.retry.baseDelayMs !== undefined) {
        if (typeof config.retry.baseDelayMs !== 'number' || config.retry.baseDelayMs < 0) {
          errors.push('Retry baseDelayMs must be a non-negative number');
        }
      }
      if (config.retry.maxDelayMs !== undefined) {
        if (typeof config.retry.maxDelayMs !== 'number' || config.retry.maxDelayMs < 0) {
          errors.push('Retry maxDelayMs must be a non-negative number');
        }
      }
      if (config.retry.backoffMultiplier !== undefined) {
        if (typeof config.retry.backoffMultiplier !== 'number' || config.retry.backoffMultiplier <= 0) {
          errors.push('Retry backoffMultiplier must be a positive number');
        }
      }
    }

    return errors;
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 获取 AgentDefinition
   *
   * 从 AgentPool 获取 AgentDefinition，如果不存在则抛出错误。
   *
   * @param agentName - Agent 名称
   * @returns AgentDefinition
   * @throws AgentCallError 如果 Agent 不存在
   */
  private async getAgentDefinition(agentName: string): Promise<any> {
    // 尝试从 AgentRunner 获取 AgentPool
    let agentPool: any;

    // 检查 agentRunner 是否有 getPool 方法或可以访问 pool
    if (typeof this.agentRunner.getPool === 'function') {
      agentPool = this.agentRunner.getPool();
    }

    if (agentPool && typeof agentPool.getAgent === 'function') {
      const definition = agentPool.getAgent(agentName);
      if (definition) {
        return definition;
      }
    }

    // 如果没有找到，抛出错误
    throw new AgentCallError(
      AgentCallErrorCode.AGENT_NOT_FOUND,
      `Agent '${agentName}' not found in AgentPool`
    );
  }

  /**
   * 解析输入表达式
   *
   * 将 DSL 表达式解析为实际值。
   *
   * @param inputs - 输入表达式映射
   * @param context - 执行上下文
   * @returns 解析后的输入值映射
   */
  private async resolveInputs(
    inputs: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<Record<string, unknown>> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(inputs)) {
      // 简化实现：假设输入已经是解析后的值
      // 完整实现需要遍历表达式树并求值
      if (typeof value === 'string' && value.startsWith('$')) {
        // 变量引用
        const varName = value.slice(1);
        try {
          resolved[key] = this.resolveVariable(varName, context);
        } catch (error) {
          // 变量未定义，保留原值
          resolved[key] = value;
        }
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * 解析变量值
   *
   * 按优先级：locals > results > input > parent
   *
   * @param name - 变量名
   * @param context - 执行上下文
   * @returns 变量值
   * @throws AgentCallError 如果变量未定义
   */
  private resolveVariable(name: string, context: ExecutionContext): unknown {
    // 1. 检查 locals
    if (context.locals.has(name)) {
      return context.locals.get(name);
    }

    // 2. 检查 results
    if (context.results.has(name)) {
      return context.results.get(name);
    }

    // 3. 检查 input
    if (name in context.input) {
      return context.input[name];
    }

    // 4. 递归检查父上下文
    if (context.parent) {
      return this.resolveVariable(name, context.parent);
    }

    throw new AgentCallError(
      AgentCallErrorCode.UNDEFINED_VARIABLE,
      `Undefined variable: ${name}`
    );
  }

  /**
   * 构建任务字符串
   *
   * @param agentName - Agent 名称
   * @param inputs - 解析后的输入值
   * @returns 任务字符串
   */
  private buildTaskString(agentName: string, inputs: Record<string, unknown>): string {
    const parts: string[] = [`Execute agent: ${agentName}`];

    if (Object.keys(inputs).length > 0) {
      parts.push('Inputs:');
      for (const [key, value] of Object.entries(inputs)) {
        const valueStr = typeof value === 'object'
          ? JSON.stringify(value, null, 2)
          : String(value);
        parts.push(`  ${key}: ${valueStr}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * 构建上下文字符串
   *
   * @param inputs - 解析后的输入值
   * @returns 上下文字符串
   */
  private buildContextString(inputs: Record<string, unknown>): string {
    if (Object.keys(inputs).length === 0) {
      return '';
    }

    return JSON.stringify(inputs, null, 2);
  }

  /**
   * 处理输出映射
   *
   * 根据配置的 outputs 映射，将 Agent 执行结果映射到变量。
   *
   * @param outputs - 输出映射配置
   * @param agentState - Agent 执行状态
   * @returns 映射后的输出值
   */
  private processOutputs(
    outputs: Record<string, string> | undefined,
    agentState: any
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (!outputs) {
      // 没有输出映射，返回完整输出
      result.output = agentState.output;
      return result;
    }

    for (const [targetKey, sourcePath] of Object.entries(outputs)) {
      // 简化实现：支持直接返回 output
      if (sourcePath === 'output' || sourcePath === '.') {
        result[targetKey] = agentState.output;
      } else if (sourcePath.startsWith('output.')) {
        // 支持属性访问（如 output.result）
        const path = sourcePath.slice(7);
        result[targetKey] = this.getProperty(agentState.output, path);
      } else {
        // 其他路径（如 tokens_used）
        result[targetKey] = this.getProperty(agentState, sourcePath);
      }
    }

    return result;
  }

  /**
   * 获取对象属性值（支持嵌套路径）
   *
   * @param obj - 对象
   * @param path - 属性路径（如 'a.b.c'）
   * @returns 属性值
   */
  private getProperty(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * 更新执行上下文
   *
   * 将执行结果存储到上下文的 results 中。
   *
   * @param context - 执行上下文
   * @param agentName - Agent 名称
   * @param result - 执行结果
   */
  private updateContext(
    context: ExecutionContext,
    agentName: string,
    result: CallResult
  ): void {
    // 存储结果到上下文
    context.results.set(agentName, result.data);

    // 更新统计
    context.stats.agentCalls++;
    context.stats.totalTokens += result.tokensUsed || 0;
    context.stats.totalDurationMs += result.durationMs;

    if (result.success) {
      context.stats.successfulCalls++;
    } else {
      context.stats.failedCalls++;
    }
  }

  /**
   * 延迟执行（用于重试退避）
   *
   * @param ms - 延迟时间（毫秒）
   * @returns Promise
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================
  // 默认实现（用于依赖注入失败时的降级）
  // ============================================================

  /**
   * 创建默认追踪器
   *
   * @returns 默认 IExecutionTracer 实现
   */
  private createDefaultTracer(): IExecutionTracer {
    const traces: any[] = [];

    return {
      startTrace: (stepName: string, callType: 'agent' | 'skill' | 'tool', target: string): string => {
        return `trace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      },
      endTrace: (traceId: string, result: CallResult): any => {
        traces.push({
          traceId,
          result,
          endTime: Date.now(),
        });
        return traces[traces.length - 1];
      },
      getTraces: (): any[] => traces,
      getTrace: (traceId: string): any => traces.find(t => t.traceId === traceId),
      clear: (): void => {
        traces.length = 0;
      },
    };
  }

  /**
   * 创建默认日志记录器
   *
   * @returns 默认 Logger 实现
   */
  private createDefaultLogger(): any {
    return {
      debug: (category: string, message: string, meta?: Record<string, unknown>): void => {
        // 默认不输出
      },
      info: (category: string, message: string, meta?: Record<string, unknown>): void => {
        // 默认不输出
      },
      warn: (category: string, message: string, meta?: Record<string, unknown>): void => {
        // 默认不输出
      },
      error: (category: string, message: string, meta?: Record<string, unknown>): void => {
        // 默认不输出
      },
    };
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建 AgentCallExecutor 实例
 *
 * @param dependencies - 执行依赖
 * @returns AgentCallExecutor 实例
 */
export function createAgentCallExecutor(
  dependencies: ExecutionDependencies
): AgentCallExecutor {
  return new AgentCallExecutor(dependencies);
}
