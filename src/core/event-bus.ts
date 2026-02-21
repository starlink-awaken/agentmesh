import { EventEmitter } from 'events';
import type { AgentMessage, EventType } from '../types/index.js';

interface EventBusOptions {
  logger?: Console;
}

export class EventBus extends EventEmitter {
  private logger: Console;

  constructor(options: EventBusOptions = {}) {
    super();
    this.logger = options.logger || console;
    this.setMaxListeners(100);
  }

  /**
   * 发布事件
   */
  publish(eventType: EventType, data: AgentMessage): void {
    const event = {
      type: eventType,
      data,
      timestamp: Date.now()
    };
    this.emit(eventType, event);
    this.logger.info(`[EventBus] Published: ${eventType}`, { id: data.id });
  }

  /**
   * 订阅事件
   */
  subscribe(eventType: EventType, handler: (event: { type: EventType; data: AgentMessage; timestamp: number }) => void): () => void {
    this.on(eventType, handler);
    this.logger.info(`[EventBus] Subscribed to: ${eventType}`);

    // 返回取消订阅函数
    return () => {
      this.off(eventType, handler);
      this.logger.info(`[EventBus] Unsubscribed from: ${eventType}`);
    };
  }

  /**
   * 发布任务事件
   */
  publishTaskEvent(eventType: Exclude<EventType, 'agent.registered' | 'agent.unregistered'>, message: AgentMessage): void {
    this.publish(eventType, message);
  }

  /**
   * 发布 Agent 事件
   */
  publishAgentEvent(eventType: 'agent.registered' | 'agent.unregistered', message: AgentMessage): void {
    this.publish(eventType, message);
  }

  /**
   * 获取所有事件类型
   */
  getEventTypes(): EventType[] {
    return [
      'agent.registered',
      'agent.unregistered',
      'task.submitted',
      'task.assigned',
      'task.started',
      'task.progress',
      'task.completed',
      'task.failed',
      'context.updated'
    ];
  }
}

export const eventBus = new EventBus();
