/**
 * RunnableSequence - 顺序链实现
 *
 * 串联多个 Runnable，按顺序执行
 *
 * @author PAI
 * @version 1.0.0
 */

import type { RunnableConfig, RunnableInterface } from './types.js';
import { Runnable } from './Runnable.js';

/**
 * 类型辅助函数 - 提取输入类型
 */
type RunnableInputType<R extends RunnableInterface> = R extends RunnableInterface<infer I, unknown> ? I : never;

/**
 * 类型辅助函数 - 提取输出类型
 */
type RunnableOutputType<R extends RunnableInterface> = R extends RunnableInterface<unknown, infer O> ? O : never;

/**
 * RunnableSequence - 顺序链
 *
 * 将多个 Runnable 串联起来，按顺序执行
 *上一个的输出作为下一个的输入
 *
 * @example
 * ```typescript
 * const step1 = new RunnableLambda<string, number>({ func: (s) => s.length });
 * const step2 = new RunnableLambda<number, string>({ func: (n) => String(n) });
 *
 * const sequence = new RunnableSequence({
 *   first: step1,
 *   last: step2
 * });
 *
 * const result = await sequence.invoke("hello"); // 5
 * ```
 */
export class RunnableSequence<Input = unknown, Output = unknown> extends Runnable<Input, Output> {
  private first: RunnableInterface<Input, unknown>;
  private middle: Array<RunnableInterface<unknown, unknown>>;
  private last: RunnableInterface<unknown, Output>;

  constructor(config: {
    /** 第一个 Runnable */
    first: RunnableInterface<Input, unknown>;
    /** 中间的 Runnables（可选） */
    middle?: Array<RunnableInterface<unknown, unknown>>;
    /** 最后一个 Runnable */
    last: RunnableInterface<unknown, Output>;
  }) {
    super({ name: 'RunnableSequence' });
    this.first = config.first;
    this.middle = config.middle ?? [];
    this.last = config.last;
  }

  /**
   * 单次执行 - 顺序执行所有 Runnables
   */
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

  /**
   * 流式执行
   */
  async *stream(input: Input, config?: RunnableConfig): AsyncGenerator<Output, void, unknown> {
    let currentInput: unknown = input;

    // 流式执行第一个
    for await (const chunk of this.first.stream(currentInput as Input, config)) {
      currentInput = chunk;
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
   * 批量执行
   */
  async batch(inputs: Input[], config?: RunnableConfig): Promise<Output[]> {
    const results: Output[] = [];

    for (const input of inputs) {
      const result = await this.invoke(input, config);
      results.push(result);
    }

    return results;
  }

  /**
   * 管道组合 - 将当前序列与下一个 Runnable 连接
   */
  pipe<NewOutput>(next: RunnableInterface<Output, NewOutput>): RunnableSequence<Input, NewOutput> {
    // 创建一个新的序列，将当前最后一个作为新的中间步骤
    return new RunnableSequence({
      first: this.first,
      middle: [...this.middle, this.last as RunnableInterface<unknown, unknown>],
      last: next,
    });
  }

  /**
   * 静态工厂方法 - 从多个 Runnable 创建顺序链
   *
   * @example
   * ```typescript
   * const chain = RunnableSequence.from(
   *   runnableA,
   *   runnableB,
   *   runnableC
   * );
   * ```
   */
  static from<Runnables extends RunnableInterface<any, any>[]>(
    runnables: Runnables
  ): RunnableInterface<
    RunnableInputType<Runnables[0]>,
    RunnableOutputType<Runnables[number]>
  > {
    if (runnables.length === 0) {
      throw new Error('RunnableSequence.from 至少需要提供一个 Runnable');
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
   * 创建两元组序列的便捷方法
   */
  static combine<Input, Middle, Output>(
    first: RunnableInterface<Input, Middle>,
    last: RunnableInterface<Middle, Output>
  ): RunnableSequence<Input, Output> {
    return new RunnableSequence({
      first,
      last,
    });
  }

  /**
   * 获取第一个 Runnable
   */
  getFirst(): RunnableInterface<Input, unknown> {
    return this.first;
  }

  /**
   * 获取最后一个 Runnable
   */
  getLast(): RunnableInterface<unknown, Output> {
    return this.last;
  }

  /**
   * 获取中间的 Runnables
   */
  getMiddle(): Array<RunnableInterface<unknown, unknown>> {
    return [...this.middle];
  }

  /**
   * 获取序列长度
   */
  get length(): number {
    return 1 + this.middle.length + 1;
  }

  /**
   * 将序列转换为数组
   */
  toArray(): RunnableInterface[] {
    return [this.first, ...this.middle, this.last];
  }
}

export default RunnableSequence;
