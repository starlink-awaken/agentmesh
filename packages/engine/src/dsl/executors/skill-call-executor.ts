/**
 * Honeycomb DSL Compiler - Skill 调用执行器
 *
 * 负责 Skill 调用的执行，实现 ICallExecutor 接口。
 *
 * 核心功能：
 * - 接收 SkillCallConfig 和 ExecutionContext
 * - 通过 SkillsManager 执行 Skill
 * - 支持超时控制
 * - 支持重试机制（指数退避）
 * - 返回 CallResult
 * - 完整的错误处理
 *
 * @module dsl/executors/skill-call-executor
 */

import * as crypto from 'node:crypto';

import type {
  AgentCallError,
  AgentCallErrorCode,
  CallConfig,
  CallResult,
  ExecutionContext,
  ExecutionDependencies,
  ICallExecutor,
  IExecutionTracer,
  RetryConfig,
  SkillCallConfig,
} from '../agent-call-types.js';

import type {
  SkillExecutionRequest,
  SkillExecutionResult,
} from '../../workflow-skills-types.js';

// ============================================================
// 自定义错误类型
// ============================================================

/**
 * Skill 未找到错误
 */
export class SkillNotFoundError extends Error {
  constructor(public skillId: string) {
    super(`Skill not found: ${skillId}`);
    this.name = 'SkillNotFoundError';
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends Error {
  constructor(public skillId: string, public timeoutMs: number) {
    super(`Skill execution timeout: ${skillId} after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * 输入验证失败错误
 */
export class InvalidInputError extends Error {
  constructor(
    public skillId: string,
    public validationErrors: string[]
  ) {
    super(`Invalid input for skill ${skillId}: ${validationErrors.join(', ')}`);
    this.name = 'InvalidInputError';
  }
}

/**
 * Skill 执行失败错误
 */
export class ExecutionFailedError extends Error {
  constructor(
    public skillId: string,
    public originalError: Error | string
  ) {
    super(
      `Skill execution failed: ${skillId} - ${
        originalError instanceof Error ? originalError.message : String(originalError)
      }`
    );
    this.name = 'ExecutionFailedError';
    this.cause = originalError;
  }
}

// ============================================================
// Skill 调用执行器
// ============================================================

/**
 * Skill 调用执行器配置
 */
export interface SkillCallExecutorConfig {
  /** 默认超时时间（毫秒） */
  defaultTimeoutMs?: number;
  /** 是否启用追踪 */
  enableTracing?: boolean;
  /** 最大嵌套深度 */
  maxDepth?: number;
}

/**
 * Skill 调用执行器
 *
 * 负责 Skill 调用的执行和生命周期管理。
 *
 * @example
 * ```ts
 * const executor = new SkillCallExecutor({
 *   defaultTimeoutMs: 30000,
 *   enableTracing: true,
 * });
 *
 * const config: SkillCallConfig = {
 *   type: 'skill',
 *   skillId: 'honeycomb.code.review',
 *   inputs: { code: '...', language: 'typescript' },
 *   timeout: 10000,
 * };
 *
 * const result = await executor.execute(config, context);
 * ```
 */
export class SkillCallExecutor implements ICallExecutor {
  /** 执行依赖 */
  private dependencies: ExecutionDependencies;

  /** 执行追踪器（可选） */
  private tracer: IExecutionTracer | null;

  /** 配置 */
  private config: Required<SkillCallExecutorConfig>;

  /**
   * 创建 Skill 调用执行器
   *
   * @param dependencies 执行依赖
   * @param executorConfig 执行器配置
   * @param tracer 执行追踪器（可选）
   */
  constructor(
    dependencies: ExecutionDependencies,
    executorConfig: SkillCallExecutorConfig = {},
    tracer?: IExecutionTracer
  ) {
    this.dependencies = dependencies;
    this.tracer = tracer ?? null;
    this.config = {
      defaultTimeoutMs: executorConfig.defaultTimeoutMs ?? 30000,
      enableTracing: executorConfig.enableTracing ?? true,
      maxDepth: executorConfig.maxDepth ?? 100,
    };
  }

  // ----------------------------------------------------------
  // ICallExecutor 接口实现
  // ----------------------------------------------------------

  /**
   * 执行 Skill 调用
   *
   * @param config 调用配置
   * @param context 执行上下文
   * @returns 调用结果
   * @throws {SkillNotFoundError} Skill 不存在
   * @throws {TimeoutError} 执行超时
   * @throws {InvalidInputError} 输入验证失败
   * @throws {ExecutionFailedError} 执行失败
   */
  async execute(
    config: CallConfig,
    context: ExecutionContext
  ): Promise<CallResult> {
    // 验证配置类型
    if (config.type !== 'skill') {
      throw new Error(`Invalid config type for SkillCallExecutor: ${config.type}`);
    }

    const skillConfig = config as SkillCallConfig;

    // 验证配置
    const validationErrors = this.validate(skillConfig);
    if (validationErrors.length > 0) {
      throw new InvalidInputError(skillConfig.skillId, validationErrors);
    }

    // 检查嵌套深度
    if (context.depth >= this.config.maxDepth) {
      throw new Error(`Maximum nesting depth (${this.config.maxDepth}) exceeded`);
    }

    // 开始追踪
    const traceId = this.config.enableTracing && this.tracer
      ? this.tracer.startTrace(
          skillConfig.skillId,
          'skill',
          skillConfig.skillId
        )
      : context.traceId;

    const startTime = Date.now();
    let retryCount = 0;
    let lastError: Error | null = null;

    // 获取重试配置
    const retryConfig = this.normalizeRetryConfig(skillConfig.retry);

    // 执行重试循环
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        // 计算退避延迟
        if (attempt > 0) {
          const delay = this.calculateBackoff(attempt, retryConfig);
          await this.sleep(delay);
        }

        // 执行 Skill
        const result = await this.executeSkill(skillConfig, context);

        // 结束追踪
        if (this.config.enableTracing && this.tracer) {
          this.tracer.endTrace(traceId, result);
        }

        // 更新统计
        context.stats.skillCalls++;
        context.stats.totalDurationMs += result.durationMs;
        if (result.tokensUsed) {
          context.stats.totalTokens += result.tokensUsed;
        }
        if (result.success) {
          context.stats.successfulCalls++;
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount = attempt;

        // 检查是否应该重试
        if (attempt >= retryConfig.maxRetries) {
          break;
        }

        // 某些错误不应重试
        if (
          error instanceof SkillNotFoundError ||
          error instanceof InvalidInputError
        ) {
          break;
        }
      }
    }

    // 所有重试都失败
    const failedResult: CallResult = {
      success: false,
      error: lastError?.message ?? 'Unknown error',
      durationMs: Date.now() - startTime,
      retryCount,
    };

    // 结束追踪（失败）
    if (this.config.enableTracing && this.tracer) {
      this.tracer.endTrace(traceId, failedResult);
    }

    // 更新统计
    context.stats.skillCalls++;
    context.stats.failedCalls++;
    context.stats.totalDurationMs += failedResult.durationMs;

    // 抛出执行失败错误
    throw new ExecutionFailedError(
      skillConfig.skillId,
      lastError ?? 'Execution failed after retries'
    );
  }

  /**
   * 验证 Skill 调用配置
   *
   * @param config 调用配置
   * @returns 验证错误列表（空数组表示验证通过）
   */
  validate(config: CallConfig): string[] {
    const errors: string[] = [];

    if (config.type !== 'skill') {
      errors.push(`Expected type 'skill', got '${config.type}'`);
      return errors;
    }

    const skillConfig = config as SkillCallConfig;

    // 验证 skillId
    if (!skillConfig.skillId || typeof skillConfig.skillId !== 'string') {
      errors.push('skillId is required and must be a string');
    }

    // 验证 inputs
    if (!skillConfig.inputs || typeof skillConfig.inputs !== 'object') {
      errors.push('inputs must be an object');
    }

    // 验证 timeout
    if (
      skillConfig.timeout !== undefined &&
      (typeof skillConfig.timeout !== 'number' || skillConfig.timeout <= 0)
    ) {
      errors.push('timeout must be a positive number');
    }

    // 验证 retry 配置
    if (skillConfig.retry) {
      const retry = skillConfig.retry;
      if (
        retry.maxRetries !== undefined &&
        (typeof retry.maxRetries !== 'number' || retry.maxRetries < 0)
      ) {
        errors.push('retry.maxRetries must be a non-negative number');
      }
      if (
        retry.baseDelayMs !== undefined &&
        (typeof retry.baseDelayMs !== 'number' || retry.baseDelayMs < 0)
      ) {
        errors.push('retry.baseDelayMs must be a non-negative number');
      }
      if (
        retry.maxDelayMs !== undefined &&
        (typeof retry.maxDelayMs !== 'number' || retry.maxDelayMs < 0)
      ) {
        errors.push('retry.maxDelayMs must be a non-negative number');
      }
    }

    return errors;
  }

  // ----------------------------------------------------------
  // 内部执行方法
  // ----------------------------------------------------------

  /**
   * 执行单个 Skill
   *
   * @param config Skill 调用配置
   * @param context 执行上下文
   * @returns 调用结果
   * @throws {SkillNotFoundError} Skill 不存在
   * @throws {TimeoutError} 执行超时
   * @throws {ExecutionFailedError} 执行失败
   */
  private async executeSkill(
    config: SkillCallConfig,
    context: ExecutionContext
  ): Promise<CallResult> {
    const startTime = Date.now();

    // 获取 SkillsManager
    const skillsManager = this.dependencies.skillsManager;
    if (!skillsManager) {
      throw new Error('SkillsManager not available in execution dependencies');
    }

    // 检查 Skill 是否存在
    const skillExists = await skillsManager.hasSkill(config.skillId);
    if (!skillExists) {
      throw new SkillNotFoundError(config.skillId);
    }

    // 解析输入参数（从表达式转换为值）
    const resolvedInputs = await this.resolveInputs(config.inputs, context);

    // 验证输入参数
    await this.validateInputs(config.skillId, resolvedInputs);

    // 构建执行请求
    const request: SkillExecutionRequest = {
      skill_id: config.skillId,
      inputs: resolvedInputs,
      options: {
        timeout_ms: config.timeout ?? this.config.defaultTimeoutMs,
      },
    };

    // 设置 Trace ID
    if (skillsManager.setCurrentTraceId) {
      skillsManager.setCurrentTraceId(context.traceId);
    }

    // 执行 Skill（带超时控制）
    const timeoutMs = config.timeout ?? this.config.defaultTimeoutMs;
    const executionPromise = skillsManager.executeSkill(request);

    let result: SkillExecutionResult;
    try {
      result = await this.withTimeout(executionPromise, timeoutMs);
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw error;
      }
      throw new ExecutionFailedError(config.skillId, error as Error);
    }

    // 构建调用结果
    const durationMs = Date.now() - startTime;
    const callResult: CallResult = {
      success: result.status === 'completed',
      data: result.output,
      durationMs,
      tokensUsed: result.token_usage,
      retryCount: 0,
      outputs: this.applyOutputMapping(
        result.output,
        config.outputs
      ),
    };

    // 如果执行失败，设置错误信息
    if (result.status !== 'completed' && result.error) {
      callResult.error = result.error.message;
    }

    // 发送事件到 MessageBus
    this.sendEvent('skill_call_completed', {
      skill_id: config.skillId,
      duration_ms: durationMs,
      success: callResult.success,
      tokens_used: result.token_usage,
    });

    return callResult;
  }

  /**
   * 解析输入参数（从表达式转换为值）
   *
   * @param inputs 输入参数表达式
   * @param context 执行上下文
   * @returns 解析后的输入值
   */
  private async resolveInputs(
    inputs: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<Record<string, unknown>> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(inputs)) {
      // 如果是字面量，直接使用
      if (this.isLiteral(value)) {
        resolved[key] = value;
        continue;
      }

      // 如果是表达式，求值
      // 这里简化处理，实际应该调用表达式求值器
      // 对于变量引用，尝试从上下文解析
      if (this.isVariableReference(value)) {
        try {
          resolved[key] = this.resolveVariableValue(
            value as string,
            context
          );
        } catch (error) {
          // 变量未找到，使用原始值
          resolved[key] = value;
        }
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * 验证输入参数
   *
   * @param skillId Skill ID
   * @param inputs 输入参数
   * @throws {InvalidInputError} 输入验证失败
   */
  private async validateInputs(
    skillId: string,
    inputs: Record<string, unknown>
  ): Promise<void> {
    const skillsManager = this.dependencies.skillsManager;
    if (!skillsManager) {
      return; // 无法验证，跳过
    }

    try {
      const skill = await skillsManager.getSkill(skillId);
      if (!skill) {
        return; // Skill 不存在是 executeSkill 的问题，这里跳过
      }

      // 验证必需参数
      const errors: string[] = [];
      for (const inputDef of skill.inputs) {
        if (inputDef.required && !(inputDef.name in inputs)) {
          errors.push(`Missing required parameter: ${inputDef.name}`);
        }
      }

      if (errors.length > 0) {
        throw new InvalidInputError(skillId, errors);
      }
    } catch (error) {
      if (error instanceof InvalidInputError) {
        throw error;
      }
      // 验证失败不是致命错误，记录日志后继续
      this.log('warn', `Input validation skipped for ${skillId}: ${error}`);
    }
  }

  /**
   * 应用输出映射
   *
   * @param output 原始输出
   * @param outputMapping 输出映射
   * @returns 映射后的输出
   */
  private applyOutputMapping(
    output: unknown,
    outputMapping?: Record<string, string>
  ): Record<string, unknown> | undefined {
    if (!outputMapping) {
      return undefined;
    }

    if (typeof output !== 'object' || output === null) {
      return undefined;
    }

    const mapped: Record<string, unknown> = {};
    const outputObj = output as Record<string, unknown>;

    for (const [sourceKey, targetKey] of Object.entries(outputMapping)) {
      if (sourceKey in outputObj) {
        mapped[targetKey] = outputObj[sourceKey];
      }
    }

    return mapped;
  }

  // ----------------------------------------------------------
  // 工具方法
  // ----------------------------------------------------------

  /**
   * 规范化重试配置
   *
   * @param retry 原始重试配置
   * @returns 规范化后的重试配置
   */
  private normalizeRetryConfig(retry?: RetryConfig): Required<RetryConfig> {
    return {
      maxRetries: retry?.maxRetries ?? 3,
      baseDelayMs: retry?.baseDelayMs ?? 1000,
      maxDelayMs: retry?.maxDelayMs ?? 10000,
      backoffMultiplier: retry?.backoffMultiplier ?? 2,
      jitter: retry?.jitter ?? true,
    };
  }

  /**
   * 计算退避延迟
   *
   * @param attempt 当前重试次数
   * @param config 重试配置
   * @returns 延迟时间（毫秒）
   */
  private calculateBackoff(
    attempt: number,
    config: Required<RetryConfig>
  ): number {
    // 指数退避
    let delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);

    // 限制最大延迟
    delay = Math.min(delay, config.maxDelayMs);

    // 添加抖动
    if (config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  /**
   * 带超时的 Promise 执行
   *
   * @param promise 要执行的 Promise
   * @param timeoutMs 超时时间（毫秒）
   * @returns Promise 结果
   * @throws {TimeoutError} 执行超时
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError('skill', timeoutMs));
      }, timeoutMs);
      // 确保 timer 被清理
      timer.unref();
    });

    return Promise.race([promise, timeout]);
  }

  /**
   * 睡眠指定时间
   *
   * @param ms 睡眠时间（毫秒）
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 检查值是否为字面量
   *
   * @param value 要检查的值
   * @returns 是否为字面量
   */
  private isLiteral(value: unknown): boolean {
    return (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      Array.isArray(value)
    );
  }

  /**
   * 检查值是否为变量引用
   *
   * @param value 要检查的值
   * @returns 是否为变量引用
   */
  private isVariableReference(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    // 简单的变量引用模式：$var 或 ${var}
    return /^\$[\w.]+$/.test(value) || /^\$\{[\w.]+\}$/.test(value);
  }

  /**
   * 解析变量值
   *
   * @param ref 变量引用
   * @param context 执行上下文
   * @returns 变量值
   */
  private resolveVariableValue(
    ref: string,
    context: ExecutionContext
  ): unknown {
    // 移除 $ 前缀和 {} 包裹
    const varName = ref.replace(/^\$\{?|\}?$/g, '');

    // 按优先级解析：locals > results > input > parent
    if (context.locals.has(varName)) {
      return context.locals.get(varName);
    }
    if (context.results.has(varName)) {
      return context.results.get(varName);
    }
    if (varName in context.input) {
      return context.input[varName];
    }
    if (context.parent) {
      return this.resolveVariableValue(ref, context.parent);
    }

    throw new Error(`Undefined variable: ${varName}`);
  }

  /**
   * 发送事件到 MessageBus
   *
   * @param eventType 事件类型
   * @param payload 事件负载
   */
  private sendEvent(
    eventType: string,
    payload: Record<string, unknown>
  ): void {
    const { messageBus } = this.dependencies;
    if (!messageBus) {
      return;
    }

    try {
      messageBus.send({
        id: crypto.randomUUID(),
        from: 'SkillCallExecutor',
        to: '*',
        type: 'event' as const,
        priority: 1,
        payload: {
          event: eventType,
          ...payload,
        },
        context_shards: [],
        timestamp: Date.now(),
        trace_id: crypto.randomUUID(),
      });
    } catch (error) {
      // 事件发送失败不影响主流程
      this.log('warn', `Failed to send event: ${error}`);
    }
  }

  /**
   * 记录日志
   *
   * @param level 日志级别
   * @param message 日志消息
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    const { logger } = this.dependencies;
    if (logger && typeof logger[level] === 'function') {
      logger[level]('SkillCallExecutor', message);
    }
  }

  // ----------------------------------------------------------
  // Getter/Setter
  // ----------------------------------------------------------

  /**
   * 获取执行依赖
   */
  getDependencies(): ExecutionDependencies {
    return this.dependencies;
  }

  /**
   * 设置执行依赖
   */
  setDependencies(dependencies: ExecutionDependencies): void {
    this.dependencies = dependencies;
  }

  /**
   * 获取执行追踪器
   */
  getTracer(): IExecutionTracer | null {
    return this.tracer;
  }

  /**
   * 设置执行追踪器
   */
  setTracer(tracer: IExecutionTracer | null): void {
    this.tracer = tracer;
  }

  /**
   * 获取配置
   */
  getConfig(): Required<SkillCallExecutorConfig> {
    return this.config;
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建 Skill 调用执行器
 *
 * @param dependencies 执行依赖
 * @param config 执行器配置
 * @param tracer 执行追踪器（可选）
 * @returns SkillCallExecutor 实例
 */
export function createSkillCallExecutor(
  dependencies: ExecutionDependencies,
  config?: SkillCallExecutorConfig,
  tracer?: IExecutionTracer
): SkillCallExecutor {
  return new SkillCallExecutor(dependencies, config, tracer);
}
