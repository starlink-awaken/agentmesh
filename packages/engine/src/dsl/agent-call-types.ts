/**
 * Honeycomb DSL Compiler - Agent 调用集成类型定义
 *
 * 定义 Agent、Skill、Tool 调用相关的核心类型和接口。
 * 与 Runtime Executor 模式保持一致。
 *
 * @module dsl/agent-call-types
 */

import type { AgentState, AgentStatus } from '../types.js';
import type { DSLExpression } from './types.js';

// ============================================================
// 执行上下文
// ============================================================

/**
 * 执行上下文 - 在 Runtime Executor 之间传递状态
 *
 * 职责：
 * - 保存原始输入数据
 * - 管理局部变量（由 loop、condition 等语句创建）
 * - 缓存调用结果（用于跨语句数据传递）
 * - 维护追踪信息和统计数据
 * - 支持嵌套语句的上下文隔离
 */
export interface ExecutionContext {
  /** 原始输入数据 */
  input: Record<string, unknown>;
  /** 局部变量（由 loop、condition 等语句创建） */
  locals: Map<string, unknown>;
  /** 调用结果缓存（用于跨语句数据传递） */
  results: Map<string, unknown>;
  /** 当前 trace_id（用于分布式追踪） */
  traceId: string;
  /** 嵌套深度（用于防止无限递归） */
  depth: number;
  /** 执行统计 */
  stats: ExecutionStats;
  /** 父上下文（用于嵌套语句） */
  parent?: ExecutionContext;
  /** 执行追踪记录（用于循环和条件执行） */
  trace?: TraceEntry[];
  /** 执行选项（用于循环控制） */
  options?: ExecutionOptions;
  /** 最大嵌套深度限制（用于防止栈溢出） */
  MAX_NESTING_DEPTH?: number;
}

/**
 * 执行统计
 */
export interface ExecutionStats {
  /** 总执行时间（毫秒） */
  totalDurationMs: number;
  /** Agent 调用次数 */
  agentCalls: number;
  /** Skill 调用次数 */
  skillCalls: number;
  /** Tool 调用次数 */
  toolCalls: number;
  /** 总 Token 使用量 */
  totalTokens: number;
  /** 成功调用数 */
  successfulCalls: number;
  /** 失败调用数 */
  failedCalls: number;
}

// ============================================================
// 调用配置
// ============================================================

/**
 * Agent 调用配置
 */
export interface AgentCallConfig {
  /** 调用类型标识 */
  type: 'agent';
  /** Agent 名称 */
  name: string;
  /** 输入参数（表达式或字面量） */
  inputs: Record<string, DSLExpression>;
  /** 输出映射（可选） */
  outputs?: Record<string, string>;
  /** 重试配置 */
  retry?: RetryConfig;
  /** 超时配置（毫秒） */
  timeout?: number;
}

/**
 * Skill 调用配置
 */
export interface SkillCallConfig {
  /** 调用类型标识 */
  type: 'skill';
  /** Skill ID */
  skillId: string;
  /** 输入参数（表达式或字面量） */
  inputs: Record<string, DSLExpression>;
  /** 输出映射（可选） */
  outputs?: Record<string, string>;
  /** 重试配置 */
  retry?: RetryConfig;
  /** 超时配置（毫秒） */
  timeout?: number;
}

/**
 * Tool 调用配置（预留）
 */
export interface ToolCallConfig {
  /** 调用类型标识 */
  type: 'tool';
  /** Tool 名称 */
  name: string;
  /** 输入参数（表达式或字面量） */
  inputs: Record<string, DSLExpression>;
  /** 输出映射（可选） */
  outputs?: Record<string, string>;
  /** 重试配置 */
  retry?: RetryConfig;
  /** 超时配置（毫秒） */
  timeout?: number;
}

/**
 * 联合调用配置类型
 */
export type CallConfig = AgentCallConfig | SkillCallConfig | ToolCallConfig;

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数（默认 3） */
  maxRetries?: number;
  /** 初始退避时间（毫秒，默认 1000） */
  baseDelayMs?: number;
  /** 最大退避时间（毫秒，默认 10000） */
  maxDelayMs?: number;
  /** 退避倍数（默认 2） */
  backoffMultiplier?: number;
  /** 是否抖动（默认 true） */
  jitter?: boolean;
}

// ============================================================
// 调用结果
// ============================================================

/**
 * 调用结果
 */
export interface CallResult {
  /** 是否成功 */
  success: boolean;
  /** 结果数据 */
  data?: unknown;
  /** 错误信息（失败时） */
  error?: string;
  /** 执行耗时（毫秒） */
  durationMs: number;
  /** Token 使用量 */
  tokensUsed?: number;
  /** 重试次数 */
  retryCount: number;
  /** 输出映射后的结果 */
  outputs?: Record<string, unknown>;
}

// ============================================================
// 错误处理
// ============================================================

/**
 * Agent 调用错误代码
 */
export enum AgentCallErrorCode {
  /** Agent 未找到 */
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  /** Skill 未找到 */
  SKILL_NOT_FOUND = 'SKILL_NOT_FOUND',
  /** Tool 未找到 */
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  /** 参数验证失败 */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** 执行超时 */
  TIMEOUT = 'TIMEOUT',
  /** 最大重试次数耗尽 */
  MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED',
  /** 执行错误 */
  EXECUTION_ERROR = 'EXECUTION_ERROR',
  /** 变量未定义 */
  UNDEFINED_VARIABLE = 'UNDEFINED_VARIABLE',
  /** 类型不匹配 */
  TYPE_MISMATCH = 'TYPE_MISMATCH',
}

/**
 * Agent 调用错误
 */
export class AgentCallError extends Error {
  constructor(
    public code: AgentCallErrorCode,
    message: string,
    public stepName?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'AgentCallError';
  }
}

/**
 * 错误处理策略
 */
export enum ErrorHandlingStrategy {
  /** 立即失败（默认） */
  FAIL_FAST = 'fail_fast',
  /** 跳过并继续 */
  SKIP_AND_CONTINUE = 'skip_and_continue',
  /** 使用默认值 */
  USE_DEFAULT = 'use_default',
  /** 重试 */
  RETRY = 'retry',
}

/**
 * Step 级别的错误处理配置
 */
export interface StepErrorHandling {
  /** 错误处理策略 */
  strategy?: ErrorHandlingStrategy;
  /** 默认值（USE_DEFAULT 时使用） */
  defaultValue?: unknown;
  /** 是否忽略错误 */
  ignoreError?: boolean;
}

// ============================================================
// 执行追踪
// ============================================================

/**
 * 调用追踪记录
 */
export interface CallTrace {
  /** 追踪 ID */
  traceId: string;
  /** 父追踪 ID（用于嵌套调用） */
  parentTraceId?: string;
  /** Step 名称 */
  stepName: string;
  /** 调用类型 */
  callType: 'agent' | 'skill' | 'tool';
  /** 调用目标（agent/skill/tool 名称） */
  target: string;
  /** 开始时间戳 */
  startTime: number;
  /** 结束时间戳 */
  endTime: number;
  /** 执行耗时（毫秒） */
  durationMs: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（失败时） */
  error?: string;
  /** Token 使用量 */
  tokensUsed?: number;
  /** 重试次数 */
  retryCount: number;
  /** 输入参数摘要 */
  inputSummary?: Record<string, unknown>;
  /** 输出摘要 */
  outputSummary?: Record<string, unknown>;
}

/**
 * 执行追踪器接口
 */
export interface IExecutionTracer {
  /** 开始追踪 */
  startTrace(
    stepName: string,
    callType: 'agent' | 'skill' | 'tool',
    target: string
  ): string;

  /** 结束追踪 */
  endTrace(
    traceId: string,
    result: CallResult
  ): CallTrace;

  /** 获取所有追踪记录 */
  getTraces(): CallTrace[];

  /** 获取指定 trace_id 的追踪记录 */
  getTrace(traceId: string): CallTrace | undefined;

  /** 清除所有追踪记录 */
  clear(): void;
}

// ============================================================
// Executor 接口
// ============================================================

/**
 * 调用执行器接口
 * 所有 Agent/Skill/Tool 执行器必须实现此接口
 */
export interface ICallExecutor {
  /**
   * 执行调用
   * @param config 调用配置
   * @param context 执行上下文
   * @returns 调用结果
   */
  execute(
    config: CallConfig,
    context: ExecutionContext
  ): Promise<CallResult>;

  /**
   * 验证调用配置
   * @param config 调用配置
   * @returns 验证错误列表（空数组表示验证通过）
   */
  validate(
    config: CallConfig
  ): string[];
}

/**
 * Step 执行器接口
 */
export interface IStepExecutor {
  /**
   * 执行 step 语句
   * @param step step 语句 AST 节点
   * @param context 执行上下文
   * @param dependencies 外部依赖
   * @returns 更新后的执行上下文
   */
  executeStep(
    step: DSLStep,
    context: ExecutionContext,
    dependencies: ExecutionDependencies
  ): Promise<ExecutionContext>;
}

/**
 * DSL Step 类型（与 parser.ts 保持一致）
 */
export interface DSLStep {
  type: 'step';
  name?: string;
  description?: string;
  call?: {
    type: 'agent' | 'skill' | 'tool';
    name?: string;      // for agent/tool
    skill_id?: string;  // for skill
    inputs?: Record<string, DSLExpression>;
    outputs?: Record<string, string>;
    retry?: RetryConfig;
    timeout?: number;
  };
  loc?: {
    file: string;
    line: number;
    column: number;
  };
}

/**
 * 执行依赖
 * 提供执行所需的外部组件
 */
export interface ExecutionDependencies {
  /** Agent Runner */
  agentRunner: any; // AgentRunner（避免循环依赖）
  /** Skills Manager */
  skillsManager: any; // SkillsManager（避免循环依赖）
  /** Message Bus */
  messageBus: any;
  /** Logger */
  logger: any;
  /** 可选：执行追踪器 */
  tracer?: IExecutionTracer;
  /** 可选：Tool Registry（未来实现） */
  toolRegistry?: unknown;
}

// ============================================================
// MessageBus 事件
// ============================================================

/**
 * Agent 调用事件
 */
export interface AgentCallEvent {
  /** 事件 ID */
  id: string;
  /** 事件类型 */
  type: 'agent_call_started' | 'agent_call_completed' | 'agent_call_failed';
  /** 来源 */
  from: string;
  /** 目标 */
  to: string;
  /** 优先级 */
  priority: number;
  /** 事件负载 */
  payload: {
    /** trace_id */
    trace_id: string;
    /** Step 名称 */
    step_name: string;
    /** 调用类型 */
    call_type: 'agent' | 'skill' | 'tool';
    /** 调用目标 */
    target: string;
    /** 开始时间（completed/failed 事件） */
    start_time?: number;
    /** 结束时间（completed/failed 事件） */
    end_time?: number;
    /** 执行耗时（completed/failed 事件） */
    duration_ms?: number;
    /** 是否成功（completed/failed 事件） */
    success?: boolean;
    /** 错误信息（failed 事件） */
    error?: string;
    /** Token 使用量（completed 事件） */
    tokens_used?: number;
    /** 重试次数（completed/failed 事件） */
    retry_count?: number;
  };
  /** 上下文分片 */
  context_shards: string[];
  /** 时间戳 */
  timestamp: number;
  /** Trace ID */
  trace_id: string;
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建新的执行上下文
 */
export function createExecutionContext(
  input: Record<string, unknown>,
  parent?: ExecutionContext
): ExecutionContext {
  return {
    input,
    locals: new Map(),
    results: new Map(),
    traceId: parent?.traceId ?? crypto.randomUUID(),
    depth: parent ? parent.depth + 1 : 0,
    stats: {
      totalDurationMs: 0,
      agentCalls: 0,
      skillCalls: 0,
      toolCalls: 0,
      totalTokens: 0,
      successfulCalls: 0,
      failedCalls: 0,
    },
    parent,
  };
}

/**
 * 解析变量值
 * 按优先级：locals > results > input > parent
 */
export function resolveVariable(
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
    return resolveVariable(name, context.parent);
  }

  throw new AgentCallError(
    AgentCallErrorCode.UNDEFINED_VARIABLE,
    `Undefined variable: ${name}`
  );
}

// 引入 crypto（仅在模块顶层）
import * as crypto from 'node:crypto';

// ============================================================
// 执行结果与追踪（用于 Runtime Executor）
// ============================================================

/**
 * 追踪条目 - 记录语句执行过程
 */
export interface TraceEntry {
  /** 时间戳 */
  timestamp: number;
  /** 语句类型 */
  statementType: string;
  /** 源码位置（可选） */
  location?: {
    file: string;
    line: number;
    column: number;
  };
  /** 执行结果（成功/失败） */
  status: 'success' | 'failure';
  /** 额外数据（可选） */
  data?: Record<string, unknown>;
}

/**
 * 执行结果 - 语句执行的返回值和追踪信息
 */
export interface ExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 返回值（成功时） */
  value?: unknown;
  /** 执行追踪 */
  trace: TraceEntry[];
  /** 错误列表（失败时） */
  errors: Error[];
  /** 输出变量映射（可选） */
  outputs?: Record<string, unknown>;
}

/**
 * 执行选项 - 控制执行行为
 */
export interface ExecutionOptions {
  /** 最大迭代次数（仅 loop 使用，默认 10000） */
  maxIterations?: number;
  /** 最大嵌套深度（默认 100） */
  maxNestingDepth?: number;
  /** 是否启用追踪 */
  enableTracing?: boolean;
  /** 最大并发数（仅 parallel 使用） */
  maxConcurrency?: number;
}
