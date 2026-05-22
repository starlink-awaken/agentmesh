/**
 * EventBus — @agentmesh/toolkit EventEmitter 桥接包装
 *
 * API 向后兼容 @starlink-awaken/agentmesh v1.x 的 EventBus
 * 底层使用 @agentmesh/toolkit 的 EventEmitter
 */
import { EventEmitter } from '@agentmesh/toolkit';
import type { AgentMessage, EventType } from '../types/index.js';

export class EventBus {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter({ maxListeners: 100 });
  }

  publish(eventType: EventType, data: AgentMessage): void {
    const event = { type: eventType, data, timestamp: Date.now() };
    this.emitter.emit(eventType, event);
  }

  subscribe(eventType: EventType, handler: (event: { type: EventType; data: AgentMessage; timestamp: number }) => void): () => void {
    this.emitter.on(eventType, handler);
    return () => { this.emitter.off(eventType, handler); };
  }

  publishTaskEvent(eventType: Exclude<EventType, 'agent.registered' | 'agent.unregistered'>, message: AgentMessage): void {
    this.publish(eventType, message);
  }

  publishAgentEvent(eventType: 'agent.registered' | 'agent.unregistered', message: AgentMessage): void {
    this.publish(eventType, message);
  }

  getEventTypes(): EventType[] {
    return [
      'agent.registered', 'agent.unregistered',
      'task.submitted', 'task.assigned', 'task.started',
      'task.progress', 'task.completed', 'task.failed',
      'context.updated',
    ];
  }

  /** 移除所有监听器（用于 dispose） */
  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}

export const eventBus = new EventBus();
