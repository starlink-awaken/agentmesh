/**
 * EventEmitter - 事件发射器
 *
 * 用于模块间通信的轻量级事件系统
 *
 * @author PAI
 * @version 1.0.0
 */

import type { EventListener, EventEmitterOptions, EventType } from './types.js';

/**
 * EventEmitter - 事件发射器类
 *
 * 支持同步/异步事件发射、事件监听、优先级、一次性监听等功能
 */
export class EventEmitter {
  private events: Map<EventType, EventListener[]> = new Map();
  private maxListeners: number;
  private verbose: boolean;

  constructor(options: EventEmitterOptions = {}) {
    this.maxListeners = options.maxListeners ?? 10;
    this.verbose = options.verbose ?? false;
  }

  /**
   * 监听事件
   */
  on(type: EventType, handler: (...args: any[]) => void, priority: number = 0): this {
    return this.addListener(type, handler, false, priority);
  }

  /**
   * 一次性监听事件
   */
  once(type: EventType, handler: (...args: any[]) => void, priority: number = 0): this {
    return this.addListener(type, handler, true, priority);
  }

  /**
   * 添加监听器
   */
  private addListener(
    type: EventType,
    handler: (...args: any[]) => void,
    once: boolean,
    priority: number = 0
  ): this {
    if (!this.events.has(type)) {
      this.events.set(type, []);
    }

    const listeners = this.events.get(type)!;

    if (listeners.length >= this.maxListeners) {
      console.warn(
        `[EventEmitter] Warning: Possible EventEmitter memory leak detected. ${listeners.length + 1} ${String(type)} listeners added.`
      );
    }

    const listener: EventListener = { handler, once, priority };
    listeners.push(listener);

    // 按优先级排序
    listeners.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    if (this.verbose) {
      console.log(`[EventEmitter] Listener added for event: ${String(type)}`);
    }

    return this;
  }

  /**
   * 取消监听
   */
  off(type: EventType, handler?: (...args: any[]) => void): this {
    if (!this.events.has(type)) {
      return this;
    }

    if (handler === undefined) {
      // 移除所有该类型的监听器
      this.events.delete(type);
      if (this.verbose) {
        console.log(`[EventEmitter] All listeners removed for event: ${String(type)}`);
      }
      return this;
    }

    const listeners = this.events.get(type)!;
    const filtered = listeners.filter((l) => l.handler !== handler);
    this.events.set(type, filtered);

    if (this.verbose && filtered.length < listeners.length) {
      console.log(`[EventEmitter] Listener removed for event: ${String(type)}`);
    }

    return this;
  }

  /**
   * 移除所有监听器
   */
  removeAllListeners(type?: EventType): this {
    if (type === undefined) {
      this.events.clear();
      if (this.verbose) {
        console.log('[EventEmitter] All listeners removed');
      }
    } else {
      this.events.delete(type);
      if (this.verbose) {
        console.log(`[EventEmitter] All listeners removed for event: ${String(type)}`);
      }
    }
    return this;
  }

  /**
   * 发射事件
   */
  emit(type: EventType, ...args: any[]): boolean {
    if (!this.events.has(type)) {
      return false;
    }

    const listeners = this.events.get(type)!;
    const argsCopy = [...args];

    // 复制数组以避免在发射过程中修改导致的问题
    const toEmit = [...listeners];

    for (const listener of toEmit) {
      try {
        listener.handler(...argsCopy);
      } catch (error) {
        console.error(`[EventEmitter] Error in event handler for "${String(type)}":`, error);
      }

      if (listener.once) {
        this.off(type, listener.handler);
      }
    }

    return true;
  }

  /**
   * 异步发射事件
   */
  async emitAsync(type: EventType, ...args: any[]): Promise<boolean> {
    if (!this.events.has(type)) {
      return false;
    }

    const listeners = this.events.get(type)!;
    const argsCopy = [...args];
    const toEmit = [...listeners];

    const promises = toEmit.map(async (listener) => {
      try {
        const result = listener.handler(...argsCopy) as unknown;
        if (result && typeof result === 'object' && 'then' in result) {
          await result;
        }
      } catch (error) {
        console.error(`[EventEmitter] Error in async event handler for "${String(type)}":`, error);
      }

      if (listener.once) {
        this.off(type, listener.handler);
      }
    });

    await Promise.all(promises);
    return true;
  }

  /**
   * 获取监听器数量
   */
  listenerCount(type: EventType): number {
    return this.events.get(type)?.length ?? 0;
  }

  /**
   * 获取所有事件类型
   */
  eventNames(): EventType[] {
    return Array.from(this.events.keys());
  }

  /**
   * 获取指定事件的监听器
   */
  listeners(type: EventType): Function[] {
    return this.events.get(type)?.map((l) => l.handler) ?? [];
  }

  /**
   * 设置最大监听器数量
   */
  setMaxListeners(n: number): this {
    this.maxListeners = n;
    return this;
  }

  /**
   * 获取最大监听器数量
   */
  getMaxListeners(): number {
    return this.maxListeners;
  }
}

/**
 * 创建事件发射器的便捷函数
 */
export function createEventEmitter(options?: EventEmitterOptions): EventEmitter {
  return new EventEmitter(options);
}
