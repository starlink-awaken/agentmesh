/**
 * RunnableParallel - 并行执行多个 Runnable
 *
 * 并行执行多个 Runnable 并合并结果
 *
 * @author PAI
 * @version 1.0.0
 */

import type { RunnableConfig, RunnableInterface } from './types.js';
import { Runnable } from './Runnable.js';

/**
 * RunnableParallel - 并行执行
 *
 * 并行执行多个 Runnable，收集所有结果
 *
 * @example
 * ```typescript
 * const parallel = new RunnableParallel({
 *   length: new RunnableLambda<string, number>({ func: (s) => s.length }),
 *   upper: new RunnableLambda<string, string>({ func: (s) => s.toUpperCase() })
 * });
 *
 * const result = await parallel.invoke("hello");
 * // result: { length: 5, upper: "HELLO" }
 * ```
 */
export class RunnableParallel<Input = unknown> extends Runnable<Input, Record<string, unknown>> {
  private runnables: Map<string, RunnableInterface<Input, unknown>>;

  constructor(
    runnables: Record<string, RunnableInterface<Input, unknown>>
  ) {
    super({ name: 'RunnableParallel' });
    this.runnables = new Map(Object.entries(runnables));
  }

  /**
   * 单次执行 - 并行执行所有 Runnables
   */
  async invoke(input: Input, config?: RunnableConfig): Promise<Record<string, unknown>> {
    const entries = Array.from(this.runnables.entries());

    // 并行执行所有 Runnables
    const promises = entries.map(async ([name, runnable]) => {
      try {
        const result = await runnable.invoke(input, config);
        return { name, result, success: true };
      } catch (error) {
        return { name, error, success: false };
      }
    });

    const results = await Promise.all(promises);

    // 合并结果
    const output: Record<string, unknown> = {};

    for (const { name, result, error, success } of results) {
      if (success) {
        output[name] = result;
      } else {
        output[name] = { error: error instanceof Error ? error.message : String(error) };
      }
    }

    return output;
  }

  /**
   * 流式执行 - 并行流式执行所有 Runnables
   */
  async *stream(
    input: Input,
    config?: RunnableConfig
  ): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const entries = Array.from(this.runnables.entries());

    // 为每个 Runnable 创建一个生成器
    const generators = entries.map(([name, runnable]) => ({
      name,
      generator: runnable.stream(input, config),
      current: undefined as unknown,
      done: false,
    }));

    // 收集所有初始结果
    for (const gen of generators) {
      const { value, done } = await gen.generator.next();
      gen.current = value;
      gen.done = done ?? false;
    }

    // 持续yield直到所有生成器完成
    while (!generators.every(g => g.done)) {
      const output: Record<string, unknown> = {};

      for (const gen of generators) {
        if (!gen.done) {
          output[gen.name] = gen.current;
        }
      }

      if (Object.keys(output).length > 0) {
        yield output;
      }

      // 继续所有未完成的生成器
      const nextPromises = generators.map(async (gen) => {
        if (!gen.done) {
          const { value, done } = await gen.generator.next();
          gen.current = value;
          gen.done = done ?? false;
        }
      });

      await Promise.all(nextPromises);
    }
  }

  /**
   * 批量执行 - 对每个输入并行执行所有 Runnables
   */
  async batch(inputs: Input[], config?: RunnableConfig): Promise<Record<string, unknown>[]> {
    return Promise.all(inputs.map(input => this.invoke(input, config)));
  }

  /**
   * 管道组合 - 不支持，会返回新的 RunnableParallel
   */
  pipe<NewOutput>(
    next: RunnableInterface<Record<string, unknown>, NewOutput>
  ): RunnableInterface<Input, NewOutput> {
    // 返回一个组合了当前并行执行和下一个的 Runnable
    return new RunnableParallelAndThen({
      parallel: this,
      next,
    });
  }

  /**
   * 添加一个新的 Runnable 到并行执行
   */
  add<NewOutput>(
    name: string,
    runnable: RunnableInterface<Input, NewOutput>
  ): RunnableParallel<Input> {
    const newRunnables = Object.fromEntries(this.runnables);
    newRunnables[name] = runnable;
    return new RunnableParallel(newRunnables);
  }

  /**
   * 移除一个 Runnable
   */
  remove(name: string): RunnableParallel<Input> {
    const newRunnables = Object.fromEntries(this.runnables);
    delete newRunnables[name];
    return new RunnableParallel(newRunnables);
  }

  /**
   * 获取所有 Runnable 的名称
   */
  getKeys(): string[] {
    return Array.from(this.runnables.keys());
  }

  /**
   * 获取 Runnable 数量
   */
  get size(): number {
    return this.runnables.size;
  }

  /**
   * 创建空并行执行
   */
  static empty<Input = unknown>(): RunnableParallel<Input> {
    return new RunnableParallel({});
  }

  /**
   * 合并多个 RunnableParallel
   */
  static merge<Input = unknown>(
    ...parallels: RunnableParallel<Input>[]
  ): RunnableParallel<Input> {
    const merged: Record<string, RunnableInterface<Input, unknown>> = {};

    for (const parallel of parallels) {
      for (const [name, runnable] of parallel.runnables) {
        if (merged[name]) {
          throw new Error(`重复的键名: ${name}`);
        }
        merged[name] = runnable;
      }
    }

    return new RunnableParallel(merged);
  }
}

/**
 * RunnableParallelAndThen - 并行执行后接下一个 Runnable
 */
class RunnableParallelAndThen<Input = unknown, Middle = Record<string, unknown>, Output = unknown>
  extends Runnable<Input, Output>
{
  private parallel: RunnableParallel<Input>;
  private next: RunnableInterface<Middle, Output>;

  constructor(config: {
    parallel: RunnableParallel<Input>;
    next: RunnableInterface<Middle, Output>;
  }) {
    super({ name: 'RunnableParallelAndThen' });
    this.parallel = config.parallel;
    this.next = config.next;
  }

  async invoke(input: Input, config?: RunnableConfig): Promise<Output> {
    const middleResult = await this.parallel.invoke(input, config);
    return this.next.invoke(middleResult as Middle, config);
  }

  async *stream(input: Input, config?: RunnableConfig): AsyncGenerator<Output, void, unknown> {
    for await (const chunk of this.parallel.stream(input, config)) {
      // 将并行结果转换为输出
      const output = await this.next.invoke(chunk as Middle, config);
      yield output;
    }
  }
}

/**
 * 类型辅助函数 - 提取输入类型
 */
type RunnableInputType<R extends RunnableInterface> = R extends RunnableInterface<infer I, unknown> ? I : never;

/**
 * 类型辅助函数 - 提取输出类型
 */
type RunnableOutputType<R extends RunnableInterface> = R extends RunnableInterface<unknown, infer O> ? O : never;

export default RunnableParallel;
