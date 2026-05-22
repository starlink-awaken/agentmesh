/**
 * Honeycomb DSL Compiler - Tool 调用执行器
 *
 * 负责执行 DSL 中的 Tool 调用（step 语句中的 type: 'tool'）。
 * 实现 ICallExecutor 接口，提供统一的 Tool 调用能力。
 *
 * 核心功能：
 * - 接收 ToolCallConfig 和 ExecutionContext
 * - 通过 AgentRunner 执行 Tool（通过 Skills 系统）
 * - 支持超时控制
 * - 支持重试机制（指数退避）
 * - 返回 CallResult
 *
 * @module dsl/executors/tool-call-executor
 */

import type {
  ToolCallConfig,
  CallResult,
  ExecutionContext,
  RetryConfig,
  ICallExecutor,
  IExecutionTracer,
  CallConfig,
} from '../agent-call-types.js';
import {
  AgentCallErrorCode,
  AgentCallError,
  createExecutionContext,
  resolveVariable,
} from '../agent-call-types.js';
import type { DSLExpression } from '../types.js';
import { ErrorCode } from '../error-system.js';

// ============================================================
// 常量定义
// ============================================================

/** 默认超时时间（毫秒） */
const DEFAULT_TIMEOUT_MS = 30000;

/** 默认重试配置 */
const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
};

/** 最大嵌套深度（防止无限递归） */
const MAX_DEPTH = 100;

// ============================================================
// 工具函数
// ============================================================

/**
 * 计算退避延迟（指数退避 + 可选抖动）
 *
 * @param attempt - 当前尝试次数（从 0 开始）
 * @param retryConfig - 重试配置
 * @returns 延迟毫秒数
 */
function calculateBackoff(attempt: number, retryConfig: RetryConfig): number {
  const baseDelay = retryConfig.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs!;
  const maxDelay = retryConfig.maxDelayMs ?? DEFAULT_RETRY.maxDelayMs!;
  const multiplier = retryConfig.backoffMultiplier ?? DEFAULT_RETRY.backoffMultiplier!;
  const jitter = retryConfig.jitter ?? DEFAULT_RETRY.jitter!;

  // 计算指数退避
  let delay = baseDelay * Math.pow(multiplier, attempt);

  // 限制最大延迟
  delay = Math.min(delay, maxDelay);

  // 添加随机抖动（±25%）
  if (jitter) {
    const jitterRange = delay * 0.25;
    delay = delay - jitterRange + Math.random() * jitterRange * 2;
  }

  return Math.floor(delay);
}

/**
 * 带超时的 Promise 执行
 *
 * @param promise - 要执行的 Promise
 * @param timeoutMs - 超时时间（毫秒）
 * @param toolName - Tool 名称（用于错误消息）
 * @returns 带超时的 Promise
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  toolName: string
): Promise<T> {
  // 创建超时 Promise
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    setTimeout(() => {
      reject(
        new AgentCallError(
          AgentCallErrorCode.TIMEOUT,
          `Tool '${toolName}' execution timeout after ${timeoutMs}ms`
        )
      );
    }, timeoutMs);
  });

  // 竞赛：执行完成 vs 超时
  return Promise.race([promise, timeoutPromise]);
}

/**
 * 解析 DSL 表达式为实际值
 *
 * @param expr - DSL 表达式
 * @param context - 执行上下文
 * @returns 解析后的值
 */
function resolveExpression(expr: DSLExpression, context: ExecutionContext): unknown {
  switch (expr.type) {
    case 'literal':
      return expr.value;

    case 'variable':
      return resolveVariable(expr.name, context);

    case 'binary_op': {
      const left = resolveExpression(expr.left, context);
      const right = resolveExpression(expr.right, context);
      return evaluateBinaryOp(expr.operator, left, right);
    }

    case 'unary_op': {
      const operand = resolveExpression(expr.operand, context);
      return evaluateUnaryOp(expr.operator, operand);
    }

    case 'property_access': {
      const obj = resolveExpression(expr.object, context);
      if (obj === null || obj === undefined) {
        throw new AgentCallError(
          AgentCallErrorCode.EXECUTION_ERROR,
          `Cannot access property '${expr.property}' of ${obj === null ? 'null' : 'undefined'}`
        );
      }
      if (typeof obj !== 'object') {
        throw new AgentCallError(
          AgentCallErrorCode.TYPE_MISMATCH,
          `Cannot access property '${expr.property}' on non-object value`
        );
      }
      return (obj as Record<string, unknown>)[expr.property];
    }

    case 'array_literal':
      return expr.elements.map(e => resolveExpression(e, context));

    case 'template_string': {
      return expr.parts
        .map(part => {
          if (typeof part === 'string') {
            return part;
          }
          return String(resolveExpression(part, context));
        })
        .join('');
    }

    case 'conditional_expression': {
      const test = resolveExpression(expr.test, context);
      if (test) {
        return resolveExpression(expr.consequent, context);
      } else {
        return resolveExpression(expr.alternate, context);
      }
    }

    default:
      throw new AgentCallError(
        AgentCallErrorCode.EXECUTION_ERROR,
        `Unsupported expression type: ${(expr as DSLExpression).type}`
      );
  }
}

/**
 * 求值二元操作
 */
function evaluateBinaryOp(operator: string, left: unknown, right: unknown): unknown {
  switch (operator) {
    case '+':
      return (left as number) + (right as number);
    case '-':
      return (left as number) - (right as number);
    case '*':
      return (left as number) * (right as number);
    case '/':
      return (left as number) / (right as number);
    case '%':
      return (left as number) % (right as number);
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '<':
      return (left as number) < (right as number);
    case '>':
      return (left as number) > (right as number);
    case '<=':
      return (left as number) <= (right as number);
    case '>=':
      return (left as number) >= (right as number);
    case '&&':
      return Boolean(left && right);
    case '||':
      return left || right;
    default:
      throw new AgentCallError(
        AgentCallErrorCode.EXECUTION_ERROR,
        `Unknown binary operator: ${operator}`
      );
  }
}

/**
 * 求值一元操作
 */
function evaluateUnaryOp(operator: string, operand: unknown): unknown {
  switch (operator) {
    case '!':
      return !operand;
    case '-':
      return -(operand as number);
    case '+':
      return +(operand as number);
    default:
      throw new AgentCallError(
        AgentCallErrorCode.EXECUTION_ERROR,
        `Unknown unary operator: ${operator}`
      );
  }
}

/**
 * 应用输出映射
 *
 * @param rawResult - 原始执行结果
 * @param outputs - 输出映射配置
 * @returns 映射后的输出
 */
function applyOutputMapping(
  rawResult: unknown,
  outputs?: Record<string, string>
): Record<string, unknown> {
  if (!outputs || Object.keys(outputs).length === 0) {
    return { result: rawResult };
  }

  const mapped: Record<string, unknown> = {};

  if (rawResult === null || rawResult === undefined) {
    // 如果结果为空，使用默认值
    for (const [targetKey] of Object.entries(outputs)) {
      mapped[targetKey] = undefined;
    }
    return mapped;
  }

  if (typeof rawResult !== 'object') {
    // 非对象结果直接映射
    for (const [targetKey] of Object.entries(outputs)) {
      mapped[targetKey] = rawResult;
    }
    return mapped;
  }

  const resultObj = rawResult as Record<string, unknown>;

  // 对象结果：按路径映射
  for (const [targetKey, sourcePath] of Object.entries(outputs)) {
    if (sourcePath === '') {
      // 空路径表示使用整个结果
      mapped[targetKey] = rawResult;
    } else {
      // 支持嵌套路径访问（如 'data.user.name'）
      const pathParts = sourcePath.split('.');
      let value: unknown = resultObj;
      for (const part of pathParts) {
        if (value !== null && value !== undefined && typeof value === 'object' && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          value = undefined;
          break;
        }
      }
      mapped[targetKey] = value;
    }
  }

  return mapped;
}

// ============================================================
// ToolCallOptions
// ============================================================

/**
 * Tool 调用执行器配置选项
 */
export interface ToolCallExecutorOptions {
  /** AgentRunner 实例（用于执行 Tool/Skill） */
  agentRunner: {
    executeSkill: (request: {
      skillId: string;
      input: Record<string, unknown>;
      timeout?: number;
    }) => Promise<{
      success: boolean;
      output?: unknown;
      error?: string;
      tokensUsed?: number;
    }>;
  };
  /** 执行追踪器（可选） */
  tracer?: IExecutionTracer;
  /** 默认超时时间（毫秒） */
  defaultTimeout?: number;
  /** 是否启用详细日志 */
  verbose?: boolean;
}

// ============================================================
// ToolCallExecutor 类
// ============================================================

/**
 * Tool 调用执行器
 *
 * 负责执行 DSL 中的 Tool 调用，实现 ICallExecutor 接口。
 *
 * 核心职责：
 * 1. 接收 ToolCallConfig 和 ExecutionContext
 * 2. 解析输入参数（DSL 表达式求值）
 * 3. 通过 AgentRunner/SkillsManager 执行 Tool
 * 4. 处理超时和重试逻辑
 * 5. 应用输出映射
 * 6. 返回 CallResult
 *
 * 错误处理：
 * - ToolNotFoundError: Tool 不存在
 * - TimeoutError: 超时
 * - InvalidInputError: 输入验证失败
 * - ExecutionFailedError: Tool 执行失败
 *
 * @example
 * ```ts
 * const executor = new ToolCallExecutor({
 *   agentRunner: myAgentRunner,
 *   tracer: myTracer,
 *   defaultTimeout: 30000,
 * });
 *
 * const config: ToolCallConfig = {
 *   type: 'tool',
 *   name: 'data-analysis',
 *   inputs: { dataset: { type: 'variable', name: 'inputData' } },
 *   timeout: 60000,
 *   retry: { maxRetries: 3 },
 * };
 *
 * const result = await executor.execute(config, context);
 * ```
 */
export class ToolCallExecutor implements ICallExecutor {
  /** AgentRunner 实例 */
  private readonly agentRunner: ToolCallExecutorOptions['agentRunner'];

  /** 执行追踪器 */
  private readonly tracer?: IExecutionTracer;

  /** 默认超时时间 */
  private readonly defaultTimeout: number;

  /** 详细日志开关 */
  private readonly verbose: boolean;

  /**
   * 构造 Tool 调用执行器
   *
   * @param options - 配置选项
   */
  constructor(options: ToolCallExecutorOptions) {
    this.agentRunner = options.agentRunner;
    this.tracer = options.tracer;
    this.defaultTimeout = options.defaultTimeout ?? DEFAULT_TIMEOUT_MS;
    this.verbose = options.verbose ?? false;
  }

  // ============================================================
  // ICallExecutor 接口实现
  // ============================================================

  /**
   * 执行 Tool 调用
   *
   * @param config - 调用配置（ToolCallConfig）
   * @param context - 执行上下文
   * @returns 调用结果
   * @throws {AgentCallError} 如果配置无效或执行失败
   */
  async execute(
    config: CallConfig,
    context: ExecutionContext
  ): Promise<CallResult> {
    // 类型守卫：确认是 Tool 调用
    if (config.type !== 'tool') {
      throw new AgentCallError(
        AgentCallErrorCode.VALIDATION_ERROR,
        `Invalid call type: expected 'tool', got '${config.type}'`
      );
    }

    const toolConfig = config as ToolCallConfig;

    // 验证嵌套深度
    if (context.depth >= MAX_DEPTH) {
      throw new AgentCallError(
        AgentCallErrorCode.EXECUTION_ERROR,
        `Maximum nesting depth (${MAX_DEPTH}) exceeded`
      );
    }

    // 开始追踪
    const traceId = this.tracer?.startTrace(
      toolConfig.name ?? 'unknown',
      'tool',
      toolConfig.name ?? 'unknown'
    );

    const startTime = Date.now();
    let retryCount = 0;
    let lastError: Error | undefined;
    const maxRetries = toolConfig.retry?.maxRetries ?? DEFAULT_RETRY.maxRetries!;

    try {
      // 解析输入参数
      const resolvedInputs = this.resolveInputs(toolConfig.inputs ?? {}, context);

      // 带重试的执行
      let result: Awaited<ReturnType<typeof this.executeOnce>> | undefined;
      let lastErrorStr: string | undefined;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        retryCount = attempt;

        try {
          result = await this.executeOnce(toolConfig, resolvedInputs, context);
          break; // 成功，退出重试循环
        } catch (error) {
          const err = error as Error;
          lastError = err;
          lastErrorStr = err.message;

          // 检查是否应该重试
          if (attempt < maxRetries && this.shouldRetry(err)) {
            const delay = calculateBackoff(attempt, toolConfig.retry ?? DEFAULT_RETRY);
            if (this.verbose) {
              console.log(`Tool '${toolConfig.name}' attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
            }
            await this.sleep(delay);
            continue;
          }

          // 最后一次尝试或不可重试的错误
          throw error;
        }
      }

      // 确保结果已定义（TypeScript 类型守卫）
      if (!result) {
        throw new AgentCallError(
          AgentCallErrorCode.EXECUTION_ERROR,
          `Tool '${toolConfig.name}' execution failed${lastErrorStr ? `: ${lastErrorStr}` : ': no result'}`
        );
      }

      // 应用输出映射
      const mappedOutputs = applyOutputMapping(result.output, toolConfig.outputs);

      // 计算执行时间
      const durationMs = Date.now() - startTime;

      // 构建成功结果
      const callResult: CallResult = {
        success: true,
        data: result.output,
        durationMs,
        tokensUsed: result.tokensUsed,
        retryCount,
        outputs: mappedOutputs,
      };

      // 结束追踪
      if (this.tracer && traceId) {
        this.tracer.endTrace(traceId, callResult);
      }

      return callResult;
    } catch (error) {
      // 构建失败结果
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const callResult: CallResult = {
        success: false,
        error: errorMessage,
        durationMs,
        retryCount,
      };

      // 结束追踪（失败）
      if (this.tracer && traceId) {
        this.tracer.endTrace(traceId, callResult);
      }

      return callResult;
    }
  }

  /**
   * 验证调用配置
   *
   * @param config - 调用配置
   * @returns 验证错误列表（空数组表示验证通过）
   */
  validate(config: CallConfig): string[] {
    const errors: string[] = [];

    if (config.type !== 'tool') {
      errors.push(`Invalid call type: expected 'tool', got '${config.type}'`);
      return errors;
    }

    const toolConfig = config as ToolCallConfig;

    // 验证 Tool 名称
    if (!toolConfig.name || typeof toolConfig.name !== 'string') {
      errors.push('Tool name is required and must be a string');
    }

    // 验证超时配置
    if (toolConfig.timeout !== undefined) {
      if (typeof toolConfig.timeout !== 'number' || toolConfig.timeout <= 0) {
        errors.push('Timeout must be a positive number');
      }
    }

    // 验证重试配置
    if (toolConfig.retry) {
      if (toolConfig.retry.maxRetries !== undefined) {
        if (typeof toolConfig.retry.maxRetries !== 'number' || toolConfig.retry.maxRetries < 0) {
          errors.push('maxRetries must be a non-negative number');
        }
      }
      if (toolConfig.retry.baseDelayMs !== undefined) {
        if (typeof toolConfig.retry.baseDelayMs !== 'number' || toolConfig.retry.baseDelayMs < 0) {
          errors.push('baseDelayMs must be a non-negative number');
        }
      }
      if (toolConfig.retry.maxDelayMs !== undefined) {
        if (typeof toolConfig.retry.maxDelayMs !== 'number' || toolConfig.retry.maxDelayMs < 0) {
          errors.push('maxDelayMs must be a non-negative number');
        }
      }
    }

    return errors;
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * 执行单次 Tool 调用
   *
   * @param config - Tool 调用配置
   * @param inputs - 已解析的输入参数
   * @param context - 执行上下文
   * @returns 执行结果
   * @throws {AgentCallError} 如果执行失败
   */
  private async executeOnce(
    config: ToolCallConfig,
    inputs: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<{
    output: unknown;
    tokensUsed?: number;
  }> {
    const timeout = config.timeout ?? this.defaultTimeout;

    // 通过 Skills 系统执行 Tool
    // Tool 在 Honeycomb 中被实现为 Skill
    const executePromise = this.agentRunner.executeSkill({
      skillId: config.name,
      input: inputs,
      timeout,
    });

    // 应用超时
    try {
      const result = await withTimeout(executePromise, timeout, config.name);

      if (!result.success) {
        throw new AgentCallError(
          AgentCallErrorCode.EXECUTION_ERROR,
          result.error ?? `Tool '${config.name}' execution failed`
        );
      }

      return {
        output: result.output,
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      if (error instanceof AgentCallError) {
        throw error;
      }

      // 转换其他错误类型
      // 将 unknown 类型错误转换为 Error 类型以便处理
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const errorCode = this.isTimeoutError(errorObj)
        ? AgentCallErrorCode.TIMEOUT
        : AgentCallErrorCode.EXECUTION_ERROR;

      throw new AgentCallError(
        errorCode,
        `Tool '${config.name}' execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 解析输入参数
   *
   * @param inputs - 输入参数表达式映射
   * @param context - 执行上下文
   * @returns 解析后的输入值
   */
  private resolveInputs(
    inputs: Record<string, DSLExpression>,
    context: ExecutionContext
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, expr] of Object.entries(inputs)) {
      try {
        resolved[key] = resolveExpression(expr, context);
      } catch (error) {
        throw new AgentCallError(
          AgentCallErrorCode.VALIDATION_ERROR,
          `Failed to resolve input '${key}': ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return resolved;
  }

  /**
   * 判断错误是否应该重试
   *
   * @param error - 错误对象
   * @returns 是否应该重试
   */
  private shouldRetry(error: Error): boolean {
    // 超时错误可以重试
    if (this.isTimeoutError(error)) {
      return true;
    }

    // 执行错误根据错误码判断
    if (error instanceof AgentCallError) {
      // 这些错误不应该重试
      const nonRetryableCodes = [
        AgentCallErrorCode.TOOL_NOT_FOUND,
        AgentCallErrorCode.VALIDATION_ERROR,
        AgentCallErrorCode.UNDEFINED_VARIABLE,
        AgentCallErrorCode.TYPE_MISMATCH,
      ];
      return !nonRetryableCodes.includes(error.code);
    }

    // 默认不重试未知错误
    return false;
  }

  /**
   * 判断错误是否为临时性错误（可重试）
   *
   * @param error - 错误对象
   * @returns 是否为临时性错误
   */
  private isTransientError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    const transientKeywords = [
      'timeout',
      'timed out',
      'econnrefused',
      'econnreset',
      'etimedout',
      'network',
      'temporary',
      'try again',
    ];

    return transientKeywords.some(keyword => errorMessage.includes(keyword));
  }

  /**
   * 判断是否为超时错误
   *
   * @param error - 错误对象
   * @returns 是否为超时错误
   */
  private isTimeoutError(error: Error): boolean {
    if (error instanceof AgentCallError) {
      return error.code === AgentCallErrorCode.TIMEOUT;
    }
    return error.message.includes('timeout') || error.message.includes('TIMEDOUT');
  }

  /**
   * 休眠指定毫秒数
   *
   * @param ms - 休眠毫秒数
   * @returns Promise
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================
  // 配置方法
  // ============================================================

  /**
   * 设置执行追踪器
   *
   * @param tracer - 执行追踪器
   */
  setTracer(tracer?: IExecutionTracer): void {
    (this as unknown as { tracer: IExecutionTracer | undefined }).tracer = tracer;
  }

  /**
   * 设置详细日志开关
   *
   * @param verbose - 是否启用详细日志
   */
  setVerbose(verbose: boolean): void {
    (this as unknown as { verbose: boolean }).verbose = verbose;
  }

  /**
   * 设置默认超时时间
   *
   * @param timeout - 超时时间（毫秒）
   */
  setDefaultTimeout(timeout: number): void {
    if (timeout <= 0) {
      throw new Error('Default timeout must be positive');
    }
    (this as unknown as { defaultTimeout: number }).defaultTimeout = timeout;
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建 Tool 调用执行器
 *
 * @param options - 配置选项
 * @returns ToolCallExecutor 实例
 */
export function createToolCallExecutor(
  options: ToolCallExecutorOptions
): ToolCallExecutor {
  return new ToolCallExecutor(options);
}
