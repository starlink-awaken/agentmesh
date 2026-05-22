/**
 * Honeycomb DSL Compiler - Execution Tracer
 *
 * 执行追踪器，负责记录 Agent/Skill/Tool 调用的完整追踪信息。
 * 支持分布式追踪、性能监控和错误诊断。
 *
 * @module dsl/execution-tracer
 */

import type { MessageBus } from '../message-bus.js';
import type {
  CallTrace,
  IExecutionTracer,
  CallResult,
} from './agent-call-types.js';
import type { AgentMessage, MessageType } from '../types.js';

// ============================================================
// 类型定义
// ============================================================

/**
 * 调用追踪事件类型（用于 MessageBus payload）
 */
export type TraceEventType =
  | 'agent_call_start'
  | 'agent_call_end'
  | 'skill_call_start'
  | 'skill_call_end'
  | 'tool_call_start'
  | 'tool_call_end';

/**
 * 追踪中的调用记录（未完成）
 */
interface PendingTrace {
  /** 追踪 ID */
  traceId: string;
  /** 父追踪 ID */
  parentTraceId?: string;
  /** Step 名称 */
  stepName: string;
  /** 调用类型 */
  callType: 'agent' | 'skill' | 'tool';
  /** 调用目标 */
  target: string;
  /** 开始时间戳 */
  startTime: number;
  /** 输入参数摘要 */
  inputSummary?: Record<string, unknown>;
}

/**
 * 追踪事件 Payload 结构
 */
interface TraceEventPayload {
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
}

// ============================================================
// ExecutionTracer 类
// ============================================================

/**
 * 执行追踪器实现
 *
 * 职责：
 * - 记录所有 Agent/Skill/Tool 调用的完整生命周期
 * - 生成唯一的 trace_id 用于分布式追踪
 * - 发布 MessageBus 事件以支持实时监控
 * - 提供追踪记录查询接口
 *
 * 线程安全：单线程环境（Node.js/Bun）无需额外锁机制
 */
export class ExecutionTracer implements IExecutionTracer {
  /** 已完成的追踪记录（traceId -> CallTrace） */
  private readonly traces: Map<string, CallTrace>;

  /** 进行中的追踪记录（traceId -> PendingTrace） */
  private readonly pendingTraces: Map<string, PendingTrace>;

  /** MessageBus 实例（用于发布事件） */
  private readonly messageBus: MessageBus;

  /** 是否启用事件发布 */
  private readonly eventsEnabled: boolean;

  /**
   * 创建 ExecutionTracer 实例
   *
   * @param messageBus - MessageBus 实例
   * @param eventsEnabled - 是否启用事件发布（默认 true）
   */
  constructor(messageBus: MessageBus, eventsEnabled: boolean = true) {
    this.traces = new Map();
    this.pendingTraces = new Map();
    this.messageBus = messageBus;
    this.eventsEnabled = eventsEnabled;
  }

  // ----------------------------------------------------------
  // IExecutionTracer 接口实现
  // ----------------------------------------------------------

  /**
   * 开始追踪一个调用
   *
   * @param stepName - Step 名称
   * @param callType - 调用类型（agent/skill/tool）
   * @param target - 调用目标名称
   * @returns 生成的 trace_id
   */
  startTrace(
    stepName: string,
    callType: 'agent' | 'skill' | 'tool',
    target: string
  ): string {
    const traceId = crypto.randomUUID();
    const startTime = Date.now();

    const pendingTrace: PendingTrace = {
      traceId,
      parentTraceId: undefined, // 可从上下文获取
      stepName,
      callType,
      target,
      startTime,
    };

    this.pendingTraces.set(traceId, pendingTrace);

    // 发布开始事件
    if (this.eventsEnabled) {
      this.publishStartEvent(traceId, callType, target, stepName, startTime);
    }

    return traceId;
  }

  /**
   * 结束追踪并记录结果
   *
   * @param traceId - 追踪 ID
   * @param result - 调用结果
   * @returns 完整的追踪记录
   * @throws Error 如果 traceId 不存在
   */
  endTrace(traceId: string, result: CallResult): CallTrace {
    const pending = this.pendingTraces.get(traceId);
    if (!pending) {
      throw new Error(`Trace not found: ${traceId}`);
    }

    const endTime = Date.now();
    const durationMs = endTime - pending.startTime;

    const callTrace: CallTrace = {
      traceId: pending.traceId,
      parentTraceId: pending.parentTraceId,
      stepName: pending.stepName,
      callType: pending.callType,
      target: pending.target,
      startTime: pending.startTime,
      endTime,
      durationMs,
      success: result.success,
      error: result.error,
      tokensUsed: result.tokensUsed,
      retryCount: result.retryCount,
      inputSummary: pending.inputSummary,
      outputSummary: result.outputs,
    };

    // 从进行中移到已完成
    this.pendingTraces.delete(traceId);
    this.traces.set(traceId, callTrace);

    // 发布结束事件
    if (this.eventsEnabled) {
      this.publishEndEvent(
        traceId,
        pending.callType,
        pending.target,
        pending.stepName,
        endTime,
        callTrace
      );
    }

    return callTrace;
  }

  /**
   * 获取所有追踪记录
   *
   * @returns 所有已完成的追踪记录数组
   */
  getTraces(): CallTrace[] {
    return Array.from(this.traces.values());
  }

  /**
   * 获取指定 trace_id 的追踪记录
   *
   * @param traceId - 追踪 ID
   * @returns 追踪记录，如果不存在则返回 undefined
   */
  getTrace(traceId: string): CallTrace | undefined {
    return this.traces.get(traceId);
  }

  /**
   * 清除所有追踪记录
   */
  clear(): void {
    this.traces.clear();
    this.pendingTraces.clear();
  }

  // ----------------------------------------------------------
  // 扩展方法
  // ----------------------------------------------------------

  /**
   * 获取统计信息
   *
   * @returns 追踪统计摘要
   */
  getStats(): TracerStats {
    const stats: TracerStats = {
      totalTraces: this.traces.size,
      pendingTraces: this.pendingTraces.size,
      agentCalls: 0,
      skillCalls: 0,
      toolCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalDurationMs: 0,
      totalTokens: 0,
    };

    // 使用 Array.from 避免迭代器问题
    const traceArray = Array.from(this.traces.values());
    for (const trace of traceArray) {
      switch (trace.callType) {
        case 'agent':
          stats.agentCalls++;
          break;
        case 'skill':
          stats.skillCalls++;
          break;
        case 'tool':
          stats.toolCalls++;
          break;
      }

      if (trace.success) {
        stats.successfulCalls++;
      } else {
        stats.failedCalls++;
      }

      stats.totalDurationMs += trace.durationMs;
      stats.totalTokens += trace.tokensUsed ?? 0;
    }

    return stats;
  }

  /**
   * 获取指定目标的追踪记录
   *
   * @param target - 目标名称
   * @returns 该目标的追踪记录数组
   */
  getTracesByTarget(target: string): CallTrace[] {
    return this.getTraces().filter((t) => t.target === target);
  }

  /**
   * 获取指定类型的追踪记录
   *
   * @param callType - 调用类型
   * @returns 该类型的追踪记录数组
   */
  getTracesByType(callType: 'agent' | 'skill' | 'tool'): CallTrace[] {
    return this.getTraces().filter((t) => t.callType === callType);
  }

  /**
   * 获取失败的追踪记录
   *
   * @returns 失败的追踪记录数组
   */
  getFailedTraces(): CallTrace[] {
    return this.getTraces().filter((t) => !t.success);
  }

  // ----------------------------------------------------------
  // 私有方法
  // ----------------------------------------------------------

  /**
   * 发布调用开始事件
   *
   * @param traceId - 追踪 ID
   * @param callType - 调用类型
   * @param target - 目标名称
   * @param stepName - Step 名称
   * @param startTime - 开始时间戳
   */
  private publishStartEvent(
    traceId: string,
    callType: 'agent' | 'skill' | 'tool',
    target: string,
    stepName: string,
    startTime: number
  ): void {
    const payload: TraceEventPayload = {
      trace_id: traceId,
      step_name: stepName,
      call_type: callType,
      target,
      start_time: startTime,
    };

    // 创建符合 MessageBus.broadcast 要求的消息
    this.messageBus.broadcast({
      id: crypto.randomUUID(),
      type: 'event',
      payload,
      from: 'execution-tracer',
      priority: 1,
      context_shards: [],
      timestamp: Date.now(),
      trace_id: traceId,
    });
  }

  /**
   * 发布调用结束事件
   *
   * @param traceId - 追踪 ID
   * @param callType - 调用类型
   * @param target - 目标名称
   * @param stepName - Step 名称
   * @param endTime - 结束时间戳
   * @param trace - 完整追踪记录
   */
  private publishEndEvent(
    traceId: string,
    callType: 'agent' | 'skill' | 'tool',
    target: string,
    stepName: string,
    endTime: number,
    trace: CallTrace
  ): void {
    const payload: TraceEventPayload = {
      trace_id: traceId,
      step_name: stepName,
      call_type: callType,
      target,
      start_time: trace.startTime,
      end_time: endTime,
      duration_ms: trace.durationMs,
      success: trace.success,
      error: trace.error,
      tokens_used: trace.tokensUsed,
      retry_count: trace.retryCount,
    };

    // 创建符合 MessageBus.broadcast 要求的消息
    this.messageBus.broadcast({
      id: crypto.randomUUID(),
      type: 'event',
      payload,
      from: 'execution-tracer',
      priority: 1,
      context_shards: [],
      timestamp: Date.now(),
      trace_id: traceId,
    });
  }
}

// ============================================================
// 辅助类型
// ============================================================

/**
 * 追踪器统计信息
 */
export interface TracerStats {
  /** 总追踪数 */
  totalTraces: number;
  /** 进行中追踪数 */
  pendingTraces: number;
  /** Agent 调用次数 */
  agentCalls: number;
  /** Skill 调用次数 */
  skillCalls: number;
  /** Tool 调用次数 */
  toolCalls: number;
  /** 成功调用次数 */
  successfulCalls: number;
  /** 失败调用次数 */
  failedCalls: number;
  /** 总执行耗时（毫秒） */
  totalDurationMs: number;
  /** 总 Token 使用量 */
  totalTokens: number;
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建 ExecutionTracer 实例
 *
 * @param messageBus - MessageBus 实例
 * @param eventsEnabled - 是否启用事件发布（默认 true）
 * @returns ExecutionTracer 实例
 */
export function createExecutionTracer(
  messageBus: MessageBus,
  eventsEnabled: boolean = true
): ExecutionTracer {
  return new ExecutionTracer(messageBus, eventsEnabled);
}
