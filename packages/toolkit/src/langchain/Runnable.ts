/**
 * Runnable - LangChain 风格 Runnable 抽象基类
 *
 * 提供 LangChain 风格的 Runnable 接口实现
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  RunnableConfig,
  RunnableInterface,
  RunnableInput,
  RunnableOutput,
  StreamEvent,
} from './types.js';

/**
 * 类型辅助函数 - 提取输入类型
 */
type RunnableInputType<R extends RunnableInterface> = R extends RunnableInterface<infer I, unknown> ? I : never;

/**
 * 类型辅助函数 - 提取输出类型
 */
type RunnableOutputType<R extends RunnableInterface> = R extends RunnableInterface<unknown, infer O> ? O : never;

/**
 * Runnable 抽象基类
 *
 * 所有 Runnable 组件的基类，提供统一的接口实现
 *
 * @example
 * ```typescript
 * class MyRunnable extends Runnable<{query: string}, string> {
 *   async invoke(input: {query: string}, config?: RunnableConfig): Promise<string> {
 *     return `Processed: ${input.query}`;
 *   }
 * }
 * ```
 */
export abstract class Runnable<Input = unknown, Output = unknown>
  implements RunnableInterface<Input, Output>
{
  /**
   * Runnable 的唯一标识
   */
  public name: string;

  /**
   * 描述信息
   */
  public description: string;

  constructor(config: { name?: string; description?: string } = {}) {
    this.name = config.name ?? this.constructor.name;
    this.description = config.description ?? '';
  }

  /**
   * 单次执行 - 核心方法
   * 子类必须实现此方法
   */
  abstract invoke(input: Input, config?: RunnableConfig): Promise<Output>;

  /**
   * 批量执行
   *
   * @param inputs - 输入数组
   * @param config - 运行配置
   */
  async batch(inputs: Input[], config?: RunnableConfig): Promise<Output[]> {
    const results: Output[] = [];

    for (const input of inputs) {
      try {
        const result = await this.invoke(input, config);
        results.push(result);
      } catch (error) {
        // 如果配置允许失败则继续，否则抛出
        if (!config?.maxRetries || config.maxRetries <= 0) {
          throw error;
        }
        // 重试逻辑
        let retries = config.maxRetries;
        while (retries > 0) {
          try {
            const result = await this.invoke(input, { ...config, maxRetries: retries - 1 });
            results.push(result);
            break;
          } catch (retryError) {
            retries--;
            if (retries === 0) {
              results.push(undefined as unknown as Output);
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * 流式执行
   *
   * @param input - 输入
   * @param config - 运行配置
   */
  async *stream(input: Input, config?: RunnableConfig): AsyncGenerator<Output, void, unknown> {
    // 默认实现：调用 invoke 并包装为单个流事件
    const output = await this.invoke(input, config);
    yield output;
  }

  /**
   * 管道组合 - 将当前 Runnable 与下一个 Runnable 连接
   *
   * @example
   * ```typescript
   * const chain = runnableA.pipe(runnableB).pipe(runnableC);
   * const result = await chain.invoke(input);
   * ```
   */
  pipe<NewOutput>(
    next: RunnableInterface<Output, NewOutput>
  ): RunnableInterface<Input, NewOutput> {
    // 返回一个新的 RunnableSequence
    return new RunnableSequence({
      first: this,
      middle: [],
      last: next,
    });
  }

  /**
   * 创建带配置的绑定
   */
  withConfig(config: RunnableConfig): RunnableInterface<Input, Output> {
    // 返回一个绑定了配置的代理
    return new RunnableBinding({
      runnable: this,
      config,
    });
  }

  /**
   * 执行前的钩子
   */
  protected async beforeInvoke(input: Input, config?: RunnableConfig): Promise<void> {
    const callbacks = config?.callbacks;
    if (!callbacks) return;

    const callbackList = Array.isArray(callbacks) ? callbacks : [callbacks];
    for (const cb of callbackList) {
      if (cb.onStart) {
        await cb.onStart(input);
      }
    }
  }

  /**
   * 执行后的钩子
   */
  protected async afterInvoke(output: Output, config?: RunnableConfig): Promise<void> {
    const callbacks = config?.callbacks;
    if (!callbacks) return;

    const callbackList = Array.isArray(callbacks) ? callbacks : [callbacks];
    for (const cb of callbackList) {
      if (cb.onEnd) {
        await cb.onEnd(output);
      }
    }
  }

  /**
   * 错误处理钩子
   */
  protected async onError(error: Error, config?: RunnableConfig): Promise<void> {
    const callbacks = config?.callbacks;
    if (!callbacks) return;

    const callbackList = Array.isArray(callbacks) ? callbacks : [callbacks];
    for (const cb of callbackList) {
      if (cb.onError) {
        await cb.onError(error);
      }
    }
  }

  /**
   * 将当前 Runnable 转换为可管道形式
   */
  protected get pipeable(): {
    invoke: (input: Input, config?: RunnableConfig) => Promise<Output>;
    pipe: <NewOutput>(next: RunnableInterface<Output, NewOutput>) => RunnableInterface<Input, NewOutput>;
  } {
    const self = this;
    return {
      invoke: (input: Input, config?: RunnableConfig) => self.invoke(input, config),
      pipe: function<NewOutput>(next: RunnableInterface<Output, NewOutput>) {
        return self.pipe(next);
      },
    };
  }
}

/**
 * RunnableBinding - 绑定配置的 Runnable
 */
class RunnableBinding<Input = unknown, Output = unknown> extends Runnable<Input, Output> {
  private runnable: RunnableInterface<Input, Output>;
  private config: RunnableConfig;

  constructor({
    runnable,
    config,
  }: {
    runnable: RunnableInterface<Input, Output>;
    config: RunnableConfig;
  }) {
    super({ name: runnable.name });
    this.runnable = runnable;
    this.config = config;
  }

  async invoke(input: Input, config?: RunnableConfig): Promise<Output> {
    const mergedConfig = { ...this.config, ...config };
    return this.runnable.invoke(input, mergedConfig);
  }

  async *stream(input: Input, config?: RunnableConfig): AsyncGenerator<Output, void, unknown> {
    const mergedConfig = { ...this.config, ...config };
    yield* this.runnable.stream(input, mergedConfig);
  }

  async batch(inputs: Input[], config?: RunnableConfig): Promise<Output[]> {
    const mergedConfig = { ...this.config, ...config };
    return this.runnable.batch(inputs, mergedConfig);
  }
}

/**
 * RunnableSequence - 顺序执行的 Runnable 组合
 */
export class RunnableSequence<Input = unknown, Output = unknown> extends Runnable<Input, Output> {
  private first: RunnableInterface<Input, unknown>;
  private middle: RunnableInterface<unknown, unknown>[];
  private last: RunnableInterface<unknown, Output>;

  constructor(config: {
    first: RunnableInterface<Input, unknown>;
    middle?: RunnableInterface<unknown, unknown>[];
    last: RunnableInterface<unknown, Output>;
  }) {
    super({ name: 'RunnableSequence' });
    this.first = config.first;
    this.middle = config.middle ?? [];
    this.last = config.last;
  }

  async invoke(input: Input, config?: RunnableConfig): Promise<Output> {
    let currentInput: unknown = input;

    // 执行第一个
    currentInput = await this.first.invoke(currentInput as Input, config);

    // 执行中间步骤
    for (const runnable of this.middle) {
      currentInput = await runnable.invoke(currentInput, config);
    }

    // 执行最后一个
    return this.last.invoke(currentInput, config);
  }

  async *stream(input: Input, config?: RunnableConfig): AsyncGenerator<Output, void, unknown> {
    let currentInput: unknown = input;

    // 流式执行第一个
    for await (const chunk of this.first.stream(currentInput as Input, config)) {
      currentInput = chunk;
      yield chunk as Output;
    }

    // 流式执行中间步骤
    for (const runnable of this.middle) {
      const generator = runnable.stream(currentInput, config);
      for await (const chunk of generator) {
        currentInput = chunk;
      }
    }

    // 流式执行最后一个
    yield* this.last.stream(currentInput, config);
  }

  /**
   * 静态工厂方法 - 从多个 Runnable 创建顺序链
   */
  static from<Runnables extends RunnableInterface<any, any>[]>(
    runnables: Runnables
  ): RunnableInterface<
    RunnableInputType<Runnables[0]>,
    RunnableOutputType<Runnables[number]>
  > {
    if (runnables.length === 0) {
      throw new Error('至少需要提供一个 Runnable');
    }

    if (runnables.length === 1) {
      return runnables[0];
    }

    const first = runnables[0];
    const last = runnables[runnables.length - 1];
    const middle = runnables.slice(1, -1);

    return new RunnableSequence({
      first,
      middle,
      last,
    });
  }

  /**
   * 获取第一个 Runnable
   */
  getFirst(): RunnableInterface {
    return this.first;
  }

  /**
   * 获取最后一个 Runnable
   */
  getLast(): RunnableInterface {
    return this.last;
  }

  /**
   * 获取中间的 Runnables
   */
  getMiddle(): RunnableInterface[] {
    return this.middle;
  }
}

export default Runnable;
