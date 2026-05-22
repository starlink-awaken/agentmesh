/**
 * Honeycomb v2 - 消息总线
 *
 * 提供异步 Agent 间通信，支持发布/订阅、请求/响应模式，
 * 以及支持追踪的消息历史记录。
 *
 * 纯内存实现 — 无外部依赖。
 *
 * @since v2.0.0
 */

import { randomUUID } from 'node:crypto';
import type { AgentMessage, MessageType, MessagePriority } from './types.js';

// ============================================================
// Constants
// ============================================================

/** Maximum messages retained in history (FIFO eviction) */
const MAX_HISTORY = 10_000;

/** Default timeout for request/response (ms) */
const DEFAULT_REQUEST_TIMEOUT = 30_000;

// ============================================================
// Internal types
// ============================================================

export type MessageHandler = (msg: AgentMessage) => void;

interface PendingRequest {
  resolve: (msg: AgentMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface BusStats {
  total: number;
  byType: Record<string, number>;
  byAgent: Record<string, number>;
}

// ============================================================
// MessageBus
// ============================================================

export class MessageBus {
  /** Per-agent subscribers: agentName -> Set<handler> */
  private agentSubscribers = new Map<string, Set<MessageHandler>>();

  /** Per-type subscribers: MessageType -> Set<handler> */
  private typeSubscribers = new Map<string, Set<MessageHandler>>();

  /** Ordered message history (newest at end) */
  private history: AgentMessage[] = [];

  /** Pending request/response correlation: messageId -> resolver */
  private pendingRequests = new Map<string, PendingRequest>();

  // ----------------------------------------------------------
  // Message factory
  // ----------------------------------------------------------

  /**
   * Create a well-formed AgentMessage with auto-generated id and timestamp.
   */
  createMessage(
    from: string,
    to: string,
    type: MessageType,
    payload: unknown,
    traceId?: string,
  ): AgentMessage {
    return {
      id: randomUUID(),
      from,
      to,
      type,
      priority: 1 as MessagePriority, // NORMAL
      payload,
      context_shards: [],
      timestamp: Date.now(),
      trace_id: traceId ?? this.generateTraceId(),
    };
  }

  /**
   * Generate a globally-unique trace ID.
   */
  generateTraceId(): string {
    return randomUUID();
  }

  // ----------------------------------------------------------
  // Publish
  // ----------------------------------------------------------

  /**
   * Send a message to a specific agent.
   * The message is recorded in history and dispatched to:
   *   1. All handlers subscribed to `message.to`
   *   2. All handlers subscribed to `message.type`
   *   3. Pending request resolvers (if reply_to matches)
   */
  send(message: AgentMessage): void {
    this.record(message);

    // Resolve pending request/response if this is a reply
    if (message.reply_to && this.pendingRequests.has(message.reply_to)) {
      const pending = this.pendingRequests.get(message.reply_to)!;
      clearTimeout(pending.timer);
      this.pendingRequests.delete(message.reply_to);
      pending.resolve(message);
    }

    // Dispatch to agent-name subscribers
    const agentHandlers = this.agentSubscribers.get(message.to);
    if (agentHandlers) {
      for (const handler of agentHandlers) {
        this.safeInvoke(handler, message);
      }
    }

    // Dispatch to type subscribers
    const typeHandlers = this.typeSubscribers.get(message.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        this.safeInvoke(handler, message);
      }
    }
  }

  /**
   * Broadcast a message to ALL agent-name subscribers and matching type subscribers.
   * The `to` field is set to '*' to denote a broadcast.
   */
  broadcast(message: Omit<AgentMessage, 'to'>): void {
    const fullMessage: AgentMessage = { ...message, to: '*' } as AgentMessage;
    this.record(fullMessage);

    // Dispatch to every agent subscription
    for (const handlers of this.agentSubscribers.values()) {
      for (const handler of handlers) {
        this.safeInvoke(handler, fullMessage);
      }
    }

    // Dispatch to type subscribers
    const typeHandlers = this.typeSubscribers.get(fullMessage.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        this.safeInvoke(handler, fullMessage);
      }
    }
  }

  // ----------------------------------------------------------
  // Subscribe
  // ----------------------------------------------------------

  /**
   * Subscribe to messages addressed to a specific agent.
   * Returns an unsubscribe function.
   */
  subscribe(agentName: string, handler: MessageHandler): () => void {
    if (!this.agentSubscribers.has(agentName)) {
      this.agentSubscribers.set(agentName, new Set());
    }
    const handlers = this.agentSubscribers.get(agentName)!;
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.agentSubscribers.delete(agentName);
      }
    };
  }

  /**
   * Subscribe to messages of a specific type (across all agents).
   * Returns an unsubscribe function.
   */
  subscribeToType(type: MessageType, handler: MessageHandler): () => void {
    if (!this.typeSubscribers.has(type)) {
      this.typeSubscribers.set(type, new Set());
    }
    const handlers = this.typeSubscribers.get(type)!;
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.typeSubscribers.delete(type);
      }
    };
  }

  // ----------------------------------------------------------
  // Request / Response
  // ----------------------------------------------------------

  /**
   * Send a request message and wait for a correlated response.
   *
   * The callee should reply by sending a message with `reply_to` set to the
   * original request's `id`.
   *
   * @param from   - Requesting agent name
   * @param to     - Target agent name
   * @param payload - Request payload
   * @param timeout - Milliseconds to wait before rejecting (default 30 s)
   * @returns The response AgentMessage
   */
  request(
    from: string,
    to: string,
    payload: unknown,
    timeout: number = DEFAULT_REQUEST_TIMEOUT,
  ): Promise<AgentMessage> {
    const message = this.createMessage(from, to, 'request', payload);

    return new Promise<AgentMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(new Error(`MessageBus request timed out after ${timeout}ms (id=${message.id})`));
      }, timeout);

      this.pendingRequests.set(message.id, { resolve, reject, timer });

      // Send the request (also records history + dispatches)
      this.send(message);
    });
  }

  // ----------------------------------------------------------
  // History
  // ----------------------------------------------------------

  /**
   * Retrieve message history.
   *
   * @param agentName - If provided, filter to messages sent by or addressed to this agent.
   * @param limit     - Maximum number of messages to return (most recent first).
   */
  getHistory(agentName?: string, limit?: number): AgentMessage[] {
    let result = this.history;

    if (agentName) {
      result = result.filter(
        (m) => m.from === agentName || m.to === agentName,
      );
    }

    // Return newest first
    const reversed = [...result].reverse();

    if (limit !== undefined && limit > 0) {
      return reversed.slice(0, limit);
    }
    return reversed;
  }

  /**
   * Return all messages sharing the same trace_id, ordered chronologically.
   */
  getMessagesByTraceId(traceId: string): AgentMessage[] {
    return this.history.filter((m) => m.trace_id === traceId);
  }

  // ----------------------------------------------------------
  // Stats
  // ----------------------------------------------------------

  /**
   * Return aggregate statistics about the message bus.
   */
  getStats(): BusStats {
    const byType: Record<string, number> = {};
    const byAgent: Record<string, number> = {};

    for (const msg of this.history) {
      byType[msg.type] = (byType[msg.type] ?? 0) + 1;
      byAgent[msg.from] = (byAgent[msg.from] ?? 0) + 1;
      if (msg.to !== '*') {
        byAgent[msg.to] = (byAgent[msg.to] ?? 0) + 1;
      }
    }

    return {
      total: this.history.length,
      byType,
      byAgent,
    };
  }

  // ----------------------------------------------------------
  // Housekeeping
  // ----------------------------------------------------------

  /**
   * Clear all history, subscriptions, and pending requests.
   */
  clear(): void {
    this.history = [];

    // Reject any pending requests so callers don't hang
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('MessageBus cleared while request was pending'));
    }
    this.pendingRequests.clear();

    this.agentSubscribers.clear();
    this.typeSubscribers.clear();
  }

  // ----------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------

  /**
   * Append a message to history with FIFO eviction.
   */
  private record(message: AgentMessage): void {
    this.history.push(message);
    if (this.history.length > MAX_HISTORY) {
      this.history.splice(0, this.history.length - MAX_HISTORY);
    }
  }

  /**
   * Invoke a handler without letting exceptions propagate to the sender.
   */
  private safeInvoke(handler: MessageHandler, message: AgentMessage): void {
    try {
      handler(message);
    } catch {
      // Swallow subscriber errors to protect the bus.
      // In production, pipe to a logger.
    }
  }
}
