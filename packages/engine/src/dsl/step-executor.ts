/**
 * Honeycomb DSL Compiler - StepExecutor 类
 *
 * 负责执行 DSL step 语句，协调 Agent/Skill/Tool 调用。
 *
 * @module dsl/step-executor
 */

import * as crypto from 'node:crypto';

import type {
  DSLExpression,
  DSLStep,
} from './types.js';

import type {
  AgentCallConfig,
  AgentCallError,
  AgentCallErrorCode,
  CallConfig,
  CallResult,
  CallTrace,
  ExecutionContext,
  ExecutionDependencies,
  ExecutionResult,
  ICallExecutor,
  TraceEntry,
} from './agent-call-types.js';

// ============================================================
// 输出映射相关错误
// ============================================================

/**
 * 输出映射失败错误
 *
 * 当将 Agent/Skill/Tool 的返回值映射到输出变量时发生错误。
 */
export class OutputMappingFailedError extends Error {
  /** 目标变量名 */
  public readonly targetVariable: string;
  /** 源路径 */
  public readonly sourcePath: string;
  /** 原始错误 */
  public readonly originalError?: Error;

  constructor(
    targetVariable: string,
    sourcePath: string,
    message: string,
    originalError?: Error
  ) {
    super(message);
    this.name = 'OutputMappingFailedError';
    this.targetVariable = targetVariable;
    this.sourcePath = sourcePath;
    this.originalError = originalError;
  }
}

// ============================================================
// 表达式求值器接口
// ============================================================

/**
 * 表达式求值器接口
 *
 * 用于在执行过程中求值 DSL 表达式。
 */
export interface IExpressionEvaluator {
  /**
   * 求值表达式
   * @param expr 表达式
   * @param context 执行上下文
   * @returns 求值结果
   */
  evaluate(expr: DSLExpression, context: ExecutionContext): unknown;
}

// ============================================================
// StepExecutor 类
// ============================================================

/**
 * Step 执行器
 *
 * 负责执行 DSL step 语句，包括：
 * - 解析 inputs 表达式（使用 resolveVariable）
 * - 根据 call.type 选择执行器（Agent/Skill/Tool）
 * - 执行调用并获取结果
 * - 将结果映射到 outputs 变量
 * - 更新 ExecutionContext 的 locals 和 results
 * - 返回 ExecutionResult
 *
 * 变量解析顺序：
 * 1. locals（本地变量）
 * 2. results（之前语句的结果）
 * 3. input（输入参数）
 * 4. parent（父上下文）
 * 5. default（默认值）
 */
export class StepExecutor {
  /** Agent 执行器 */
  private readonly agentExecutor: ICallExecutor;
  /** Skill 执行器 */
  private readonly skillExecutor: ICallExecutor;
  /** Tool 执行器（可选） */
  private readonly toolExecutor?: ICallExecutor;
  /** 表达式求值器 */
  private readonly expressionEvaluator: IExpressionEvaluator;
  /** 执行依赖 */
  private readonly dependencies: ExecutionDependencies;
  /** 变量解析函数 */
  private readonly resolveVariableFn: (name: string, context: ExecutionContext) => unknown;

  /**
   * 创建 Step 执行器
   *
   * @param dependencies 执行依赖
   * @param expressionEvaluator 表达式求值器
   * @param agentExecutor Agent 执行器
   * @param skillExecutor Skill 执行器
   * @param toolExecutor Tool 执行器（可选）
   * @param resolveVariableFn 变量解析函数
   */
  constructor(
    dependencies: ExecutionDependencies,
    expressionEvaluator: IExpressionEvaluator,
    agentExecutor: ICallExecutor,
    skillExecutor: ICallExecutor,
    toolExecutor?: ICallExecutor,
    resolveVariableFn?: (name: string, context: ExecutionContext) => unknown
  ) {
    this.dependencies = dependencies;
    this.expressionEvaluator = expressionEvaluator;
    this.agentExecutor = agentExecutor;
    this.skillExecutor = skillExecutor;
    this.toolExecutor = toolExecutor;
    this.resolveVariableFn = resolveVariableFn ?? this.defaultResolveVariable;
  }

  /**
   * 默认的变量解析实现
   *
   * @param name 变量名
   * @param context 执行上下文
   * @returns 变量值
   */
  private defaultResolveVariable(
    name: string,
    context: ExecutionContext
  ): unknown {
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
      return this.defaultResolveVariable(name, context.parent);
    }
    throw new Error(`Undefined variable: ${name}`);
  }

  /**
   * 执行 step 语句
   *
   * @param step step 语句 AST 节点
   * @param context 执行上下文
   * @returns 更新后的执行上下文
   */
  async executeStep(
    step: DSLStep,
    context: ExecutionContext
  ): Promise<ExecutionContext> {
    const stepName = step.name || 'anonymous';
    const startTime = Date.now();

    try {
      // 1. 验证 step 结构
      if (!step.call) {
        throw new Error(`Step '${stepName}' has no call configuration`);
      }

      // 2. 解析 inputs 表达式
      const resolvedInputs = await this.resolveInputs(step, context);

      // 3. 构建 CallConfig
      const callConfig = this.buildCallConfig(step, resolvedInputs);

      // 4. 选择执行器并执行调用
      const callResult = await this.executeCall(callConfig, context);

      // 5. 映射输出变量
      if (callResult.success && step.outputs) {
        await this.mapOutputs(step.outputs, callResult, context);
      }

      // 6. 更新执行上下文
      this.updateContext(context, callResult, stepName);

      // 7. 创建执行追踪
      const trace = this.createTrace(stepName, callConfig, callResult, startTime, context);

      // 8. 记录到 MessageBus
      this.recordToMessageBus(trace, callConfig);

      // 9. 返回更新后的上下文
      return context;

    } catch (error) {
      // 处理执行错误
      const durationMs = Date.now() - startTime;
      const trace: CallTrace = {
        traceId: context.traceId,
        parentTraceId: context.parent?.traceId,
        stepName,
        callType: step.call?.type ?? 'agent',
        target: this.getCallTarget(step.call),
        startTime,
        endTime: Date.now(),
        durationMs,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        retryCount: 0,
      };

      // 记录错误到日志
      this.logError(step, error, context);

      // 抛出错误或返回失败结果（取决于错误处理策略）
      throw error;
    }
  }

  /**
   * 获取调用目标名称
   *
   * @param call DSLCall 对象
   * @returns 目标名称
   */
  private getCallTarget(call: DSLStep['call']): string {
    if (!call) return 'unknown';
    if (call.type === 'agent' || call.type === 'tool') {
      return call.name;
    }
    if (call.type === 'skill') {
      return call.skill_id;
    }
    return 'unknown';
  }

  /**
   * 解析 inputs 表达式
   *
   * @param step step 语句
   * @param context 执行上下文
   * @returns 解析后的输入值
   */
  private async resolveInputs(
    step: DSLStep,
    context: ExecutionContext
  ): Promise<Record<string, unknown>> {
    const resolvedInputs: Record<string, unknown> = {};

    if (!step.inputs) {
      return resolvedInputs;
    }

    for (const [key, expr] of Object.entries(step.inputs)) {
      try {
        // 使用表达式求值器求值
        const value = this.expressionEvaluator.evaluate(expr, context);
        resolvedInputs[key] = value;
      } catch (error) {
        throw new Error(
          `Failed to resolve input '${key}' for step '${step.name || 'anonymous'}': ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return resolvedInputs;
  }

  /**
   * 构建 CallConfig
   *
   * @param step step 语句
   * @param resolvedInputs 解析后的输入值
   * @returns 调用配置
   */
  private buildCallConfig(
    step: DSLStep,
    resolvedInputs: Record<string, unknown>
  ): CallConfig {
    const callType = step.call?.type ?? 'agent';

    // 根据调用类型构建配置
    switch (callType) {
      case 'agent': {
        const agentName = step.call.type === 'agent' ? step.call.name : undefined;
        if (!agentName) {
          throw new Error('Agent call must specify a name');
        }
        return {
          type: 'agent',
          name: agentName,
          inputs: step.inputs,
          outputs: step.outputs,
          retry: step.retry ? {
            maxRetries: step.retry.max_attempts,
            baseDelayMs: step.retry.backoff_ms,
          } : undefined,
        } as AgentCallConfig;
      }

      case 'skill': {
        const skillId = step.call.type === 'skill' ? step.call.skill_id : undefined;
        if (!skillId) {
          throw new Error('Skill call must specify a skill_id');
        }
        return {
          type: 'skill',
          skillId,
          inputs: step.inputs,
          outputs: step.outputs,
          retry: step.retry ? {
            maxRetries: step.retry.max_attempts,
            baseDelayMs: step.retry.backoff_ms,
          } : undefined,
        } satisfies import('./agent-call-types.js').SkillCallConfig;
      }

      case 'tool': {
        const toolName = step.call.type === 'tool' ? step.call.name : undefined;
        if (!toolName) {
          throw new Error('Tool call must specify a name');
        }
        return {
          type: 'tool',
          name: toolName,
          inputs: step.inputs,
          outputs: step.outputs,
          retry: step.retry ? {
            maxRetries: step.retry.max_attempts,
            baseDelayMs: step.retry.backoff_ms,
          } : undefined,
        } satisfies import('./agent-call-types.js').ToolCallConfig;
      }

      default:
        throw new Error(`Unsupported call type: ${callType}`);
    }
  }

  /**
   * 执行调用
   *
   * @param callConfig 调用配置
   * @param context 执行上下文
   * @returns 调用结果
   */
  private async executeCall(
    callConfig: CallConfig,
    context: ExecutionContext
  ): Promise<CallResult> {
    // 根据 call.type 选择执行器
    switch (callConfig.type) {
      case 'agent':
        return this.agentExecutor.execute(callConfig, context);

      case 'skill':
        return this.skillExecutor.execute(callConfig, context);

      case 'tool':
        if (!this.toolExecutor) {
          throw new Error('Tool executor not configured');
        }
        return this.toolExecutor.execute(callConfig, context);

      default:
        throw new Error(`Unsupported call type: ${(callConfig as { type: string }).type}`);
    }
  }

  /**
   * 映射输出变量
   *
   * 将 Agent/Skill/Tool 的返回值映射到 outputs 变量。
   * 支持嵌套属性访问（如 `output.user.name`）。
   *
   * @param outputs 输出映射配置
   * @param callResult 调用结果
   * @param context 执行上下文
   * @throws OutputMappingFailedError 映射失败时抛出
   */
  private async mapOutputs(
    outputs: Record<string, string>,
    callResult: CallResult,
    context: ExecutionContext
  ): Promise<void> {
    if (!callResult.success || callResult.data === undefined) {
      // 没有数据可以映射
      return;
    }

    const data = callResult.data as Record<string, unknown>;

    for (const [targetVar, sourcePath] of Object.entries(outputs)) {
      try {
        // 解析源路径（支持嵌套属性访问）
        const value = this.getNestedProperty(data, sourcePath);

        // 设置到上下文的 locals
        context.locals.set(targetVar, value);

        // 如果有 outputs 映射，也设置到 results
        if (callResult.outputs) {
          callResult.outputs[targetVar] = value;
        } else {
          callResult.outputs = { [targetVar]: value };
        }
      } catch (error) {
        throw new OutputMappingFailedError(
          targetVar,
          sourcePath,
          `Failed to map output '${sourcePath}' to variable '${targetVar}': ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined
        );
      }
    }
  }

  /**
   * 获取嵌套属性值
   *
   * 支持路径如 `user.name` 或 `data.items[0].id`。
   *
   * @param obj 目标对象
   * @param path 属性路径
   * @returns 属性值
   * @throws Error 路径无效时抛出
   */
  private getNestedProperty(obj: unknown, path: string): unknown {
    if (obj === null || obj === undefined) {
      throw new Error(`Cannot access property '${path}' on null/undefined`);
    }

    // 分割路径（支持 `.` 分隔和数组索引）
    const parts = path.split(/\.|\[|\]/).filter(p => p !== '');

    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        throw new Error(`Cannot access property '${part}' on null/undefined`);
      }

      if (typeof current !== 'object') {
        throw new Error(`Cannot access property '${part}' on non-object type`);
      }

      // 检查是否是数组索引
      const index = parseInt(part, 10);
      if (!isNaN(index) && Array.isArray(current)) {
        if (index >= current.length || index < 0) {
          throw new Error(`Array index ${index} out of bounds`);
        }
        current = current[index];
      } else {
        // 检查属性是否存在
        if (!(part in (current as Record<string, unknown>))) {
          throw new Error(`Property '${part}' does not exist on object`);
        }
        current = (current as Record<string, unknown>)[part];
      }
    }

    return current;
  }

  /**
   * 更新执行上下文
   *
   * @param context 执行上下文
   * @param callResult 调用结果
   * @param stepName 步骤名称
   */
  private updateContext(
    context: ExecutionContext,
    callResult: CallResult,
    stepName: string
  ): void {
    // 更新统计信息
    if (callResult.success) {
      context.stats.successfulCalls++;
    } else {
      context.stats.failedCalls++;
    }

    context.stats.totalDurationMs += callResult.durationMs;
    if (callResult.tokensUsed) {
      context.stats.totalTokens += callResult.tokensUsed;
    }

    // 根据调用类型更新统计
    // （这里需要根据 callConfig.type 来判断，但由于接口限制，我们在 executeCall 中处理）

    // 存储调用结果到 results
    context.results.set(stepName, callResult);
  }

  /**
   * 创建调用追踪记录
   *
   * @param stepName 步骤名称
   * @param callConfig 调用配置
   * @param callResult 调用结果
   * @param startTime 开始时间
   * @param context 执行上下文
   * @returns 追踪记录
   */
  private createTrace(
    stepName: string,
    callConfig: CallConfig,
    callResult: CallResult,
    startTime: number,
    context: ExecutionContext
  ): CallTrace {
    const endTime = Date.now();
    const durationMs = endTime - startTime;

    let target = 'unknown';
    if (callConfig.type === 'agent' || callConfig.type === 'tool') {
      target = callConfig.name;
    } else if (callConfig.type === 'skill') {
      target = callConfig.skillId;
    }

    return {
      traceId: this.generateTraceId(),
      parentTraceId: context.parent?.traceId,
      stepName,
      callType: callConfig.type,
      target,
      startTime,
      endTime,
      durationMs,
      success: callResult.success,
      error: callResult.error,
      tokensUsed: callResult.tokensUsed,
      retryCount: callResult.retryCount,
      inputSummary: this.summarizeInputs(callConfig.inputs),
      outputSummary: callResult.outputs,
    };
  }

  /**
   * 生成追踪 ID
   *
   * @returns 追踪 ID
   */
  private generateTraceId(): string {
    return crypto.randomUUID();
  }

  /**
   * 摘要化输入参数
   *
   * @param inputs 输入参数
   * @returns 摘要（限制大小）
   */
  private summarizeInputs(inputs: Record<string, DSLExpression> | unknown): Record<string, unknown> | undefined {
    if (!inputs || typeof inputs !== 'object') {
      return undefined;
    }

    const summary: Record<string, unknown> = {};
    const maxKeys = 10;
    const maxStringLength = 100;

    let keyCount = 0;
    for (const [key, value] of Object.entries(inputs)) {
      if (keyCount >= maxKeys) {
        summary._more = `... (${Object.keys(inputs).length - maxKeys} more keys)`;
        break;
      }

      if (typeof value === 'string' && value.length > maxStringLength) {
        summary[key] = value.substring(0, maxStringLength) + '...';
      } else {
        summary[key] = value;
      }

      keyCount++;
    }

    return summary;
  }

  /**
   * 记录到 MessageBus
   *
   * @param trace 追踪记录
   * @param callConfig 调用配置
   */
  private recordToMessageBus(trace: CallTrace, callConfig: CallConfig): void {
    const messageBus = this.dependencies.messageBus;
    if (!messageBus) {
      return;
    }

    const eventType = trace.success
      ? 'agent_call_completed'
      : 'agent_call_failed';

    const event = {
      id: crypto.randomUUID(),
      type: eventType,
      from: 'step-executor',
      to: callConfig.type === 'agent' ? callConfig.name :
          callConfig.type === 'skill' ? callConfig.skillId :
          callConfig.type === 'tool' ? callConfig.name : 'unknown',
      priority: 1,
      payload: {
        trace_id: trace.traceId,
        step_name: trace.stepName,
        call_type: trace.callType,
        target: trace.target,
        start_time: trace.startTime,
        end_time: trace.endTime,
        duration_ms: trace.durationMs,
        success: trace.success,
        error: trace.error,
        tokens_used: trace.tokensUsed,
        retry_count: trace.retryCount,
      },
      context_shards: [],
      timestamp: Date.now(),
      trace_id: trace.traceId,
    };

    // 发送事件到 MessageBus
    try {
      if (typeof messageBus.send === 'function') {
        messageBus.send(event);
      } else if (typeof messageBus.publish === 'function') {
        messageBus.publish(event);
      }
    } catch (error) {
      // 记录错误但不中断执行
      if (this.dependencies.logger && typeof this.dependencies.logger.warn === 'function') {
        this.dependencies.logger.warn('Failed to send event to MessageBus', { error });
      }
    }
  }

  /**
   * 记录错误到日志
   *
   * @param step step 语句
   * @param error 错误
   * @param context 执行上下文
   */
  private logError(step: DSLStep, error: unknown, context: ExecutionContext): void {
    const logger = this.dependencies.logger;
    if (!logger) {
      return;
    }

    const stepName = step.name || 'anonymous';
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (typeof logger.error === 'function') {
      logger.error(`Step '${stepName}' execution failed`, {
        step: stepName,
        traceId: context.traceId,
        error: errorMessage,
        location: step.loc,
      });
    }
  }

  /**
   * 销毁执行器，释放资源
   */
  dispose(): void {
    // 清理资源
    // 执行器本身不持有需要释放的资源
    // 由依赖的 executor 各自管理自己的生命周期
  }
}

// ============================================================
// 错误类工厂函数
// ============================================================

/**
 * 创建 AgentNotFoundError
 *
 * @param agentName Agent 名称
 * @returns 错误实例
 */
export function createAgentNotFoundError(agentName: string): AgentCallError {
  const error = new Error(
    `Agent not found: ${agentName}`
  ) as AgentCallError;
  error.name = 'AgentCallError';
  error.code = 'AGENT_NOT_FOUND' as AgentCallErrorCode;
  error.stepName = agentName;
  return error;
}

/**
 * 创建 SkillNotFoundError
 *
 * @param skillId Skill ID
 * @returns 错误实例
 */
export function createSkillNotFoundError(skillId: string): AgentCallError {
  const error = new Error(
    `Skill not found: ${skillId}`
  ) as AgentCallError;
  error.name = 'AgentCallError';
  error.code = 'SKILL_NOT_FOUND' as AgentCallErrorCode;
  error.stepName = skillId;
  return error;
}

/**
 * 创建 ToolNotFoundError
 *
 * @param toolName Tool 名称
 * @returns 错误实例
 */
export function createToolNotFoundError(toolName: string): AgentCallError {
  const error = new Error(
    `Tool not found: ${toolName}`
  ) as AgentCallError;
  error.name = 'AgentCallError';
  error.code = 'TOOL_NOT_FOUND' as AgentCallErrorCode;
  error.stepName = toolName;
  return error;
}

// ============================================================
// 导出
// ============================================================

/**
 * 创建 StepExecutor 实例的工厂函数
 *
 * @param dependencies 执行依赖
 * @param expressionEvaluator 表达式求值器
 * @param agentExecutor Agent 执行器
 * @param skillExecutor Skill 执行器
 * @param toolExecutor Tool 执行器（可选）
 * @returns StepExecutor 实例
 */
export function createStepExecutor(
  dependencies: ExecutionDependencies,
  expressionEvaluator: IExpressionEvaluator,
  agentExecutor: ICallExecutor,
  skillExecutor: ICallExecutor,
  toolExecutor?: ICallExecutor
): StepExecutor {
  return new StepExecutor(
    dependencies,
    expressionEvaluator,
    agentExecutor,
    skillExecutor,
    toolExecutor
  );
}
