/**
 * RunnableLambda - 函数包装为 Runnable
 *
 * 将普通函数或异步函数包装为 Runnable 接口
 *
 * @author PAI
 * @version 1.0.0
 */

import type { RunnableConfig, RunnableInterface } from './types.js';
import { Runnable } from './Runnable.js';

/**
 * LambdaFunc - Lambda 函数类型
 */
export type LambdaFunc<Input, Output> = (
  input: Input,
  config?: RunnableConfig
) => Output | Promise<Output>;

/**
 * StreamLambdaFunc - 流式 Lambda 函数类型
 */
export type StreamLambdaFunc<Input, Output> = (
  input: Input,
  config?: RunnableConfig
) => AsyncGenerator<Output, void, unknown> | Promise<AsyncGenerator<Output, void, unknown>>;

/**
 * RunnableLambdaConfig - RunnableLambda 配置
 */
export interface RunnableLambdaConfig<Input, Output> {
  /** 函数体 */
  func: LambdaFunc<Input, Output>;
  /** 流式函数（可选） */
  streamFunc?: StreamLambdaFunc<Input, Output>;
  /** 名称 */
  name?: string;
  /** 描述 */
  description?: string;
}

/**
 * RunnableLambda - 函数包装器
 *
 * 将普通函数包装为 Runnable 接口
 *
 * @example
 * ```typescript
 * // 简单函数
 * const length = new RunnableLambda<string, number>({
 *   func: (s) => s.length
 * });
 *
 * // 异步函数
 * const fetchData = new RunnableLambda<string, Promise<string>>({
 *   func: async (url) => {
 *     const response = await fetch(url);
 *     return response.text();
 *   }
 * });
 *
 * // 带配置的函数
 * const process = new RunnableLambda<string, string>({
 *   func: (input, config) => {
 *     console.log('Processing with config:', config?.metadata);
 *     return input.toUpperCase();
 *   }
 * });
 * ```
 */
export class RunnableLambda<Input = unknown, Output = unknown> extends Runnable<Input, Output> {
  private func: LambdaFunc<Input, Output>;
  private streamFunc?: StreamLambdaFunc<Input, Output>;

  constructor(config: RunnableLambdaConfig<Input, Output>) {
    super({
      name: config.name,
      description: config.description,
    });
    this.func = config.func;
    this.streamFunc = config.streamFunc;
  }

  /**
   * 单次执行 - 调用包装的函数
   */
  async invoke(input: Input, config?: RunnableConfig): Promise<Output> {
    await this.beforeInvoke(input, config);

    try {
      const result = await this.func(input, config);
      await this.afterInvoke(result, config);
      return result;
    } catch (error) {
      await this.onError(error instanceof Error ? error : new Error(String(error)), config);
      throw error;
    }
  }

  /**
   * 流式执行
   */
  async *stream(input: Input, config?: RunnableConfig): AsyncGenerator<Output, void, unknown> {
    // 如果提供了流式函数，使用它
    if (this.streamFunc) {
      const generator = await this.streamFunc(input, config);
      yield* generator;
      return;
    }

    // 否则，调用普通函数并返回单个结果
    const output = await this.invoke(input, config);
    yield output;
  }

  /**
   * 批量执行
   */
  async batch(inputs: Input[], config?: RunnableConfig): Promise<Output[]> {
    return Promise.all(inputs.map(input => this.invoke(input, config)));
  }

  /**
   * 获取原始函数
   */
  getFunc(): LambdaFunc<Input, Output> {
    return this.func;
  }

  /**
   * 创建 RunnableLambda 的便捷工厂方法
   */
  static from<Input, Output>(
    func: LambdaFunc<Input, Output>,
    config?: { name?: string; description?: string }
  ): RunnableLambda<Input, Output> {
    return new RunnableLambda({ func, ...config });
  }

  /**
   * 创建异步 RunnableLambda 的便捷工厂方法
   */
  static fromAsync<Input, Output>(
    func: LambdaFunc<Input, Output>,
    config?: { name?: string; description?: string }
  ): RunnableLambda<Input, Output> {
    return new RunnableLambda({ func, ...config });
  }

  /**
   * 将函数管道化 - 创建新的 RunnableLambda 组合
   */
  pipeFunc<NewOutput>(
    nextFunc: LambdaFunc<Output, NewOutput>
  ): RunnableLambda<Input, NewOutput> {
    const firstFunc = this.func;

    return new RunnableLambda({
      name: `${this.name}->${nextFunc.name || 'lambda'}`,
      func: async (input, config) => {
        const middle = await firstFunc(input, config);
        return nextFunc(middle, config);
      },
    });
  }
}

/**
 * RunnableAssign - 赋值 Runnable
 *
 * 用于在并行执行中分配值
 *
 * @example
 * ```typescript
 * const assign = new RunnableAssign({
 *   key: 'greeting',
 *   func: (input: string) => `Hello, ${input}!`
 * });
 *
 * const result = await assign.invoke("World");
 * // result: { greeting: "Hello, World!" }
 * ```
 */
export class RunnableAssign<Input = unknown, Additional = unknown>
  extends Runnable<Input, Input & Additional>
{
  private key: string;
  private func: LambdaFunc<Input, Additional>;

  constructor(config: {
    key: string;
    func: LambdaFunc<Input, Additional>;
    name?: string;
  }) {
    super({ name: config.name ?? `assign:${config.key}` });
    this.key = config.key;
    this.func = config.func;
  }

  async invoke(input: Input, config?: RunnableConfig): Promise<Input & Additional> {
    const additional = await this.func(input, config);
    return { ...input, [this.key]: additional } as Input & Additional;
  }
}

/**
 * RunnablePick -  pick Runnable
 *
 * 从输入中选取特定键
 *
 * @example
 * ```typescript
 * const pick = new RunnablePick<string[], string[]>({
 *   keys: [0, 2]
 * });
 *
 * const result = await pick.invoke(["a", "b", "c", "d"]);
 * // result: ["a", "c"]
 * ```
 */
export class RunnablePick<Input extends Record<string | number, unknown>, Keys extends keyof Input>
  extends Runnable<Input, Pick<Input, Keys>>
{
  private keys: Keys[];

  constructor(config: { keys: Keys[]; name?: string }) {
    super({ name: config.name ?? 'pick' });
    this.keys = config.keys;
  }

  async invoke(input: Input, config?: RunnableConfig): Promise<Pick<Input, Keys>> {
    const result = {} as Pick<Input, Keys>;
    for (const key of this.keys) {
      result[key] = input[key];
    }
    return result;
  }
}

/**
 * RunnableMap - Map Runnable
 *
 * 转换输入并返回新对象
 *
 * @example
 * ```typescript
 * const mapper = new RunnableMap<string, { length: number; upper: string }>({
 *   func: (s) => ({
 *     length: s.length,
 *     upper: s.toUpperCase()
 *   })
 * });
 * ```
 */
export class RunnableMap<Input = unknown, Output = unknown> extends Runnable<Input, Output> {
  private func: LambdaFunc<Input, Output>;

  constructor(config: {
    func: LambdaFunc<Input, Output>;
    name?: string;
    description?: string;
  }) {
    super({ name: config.name, description: config.description });
    this.func = config.func;
  }

  async invoke(input: Input, config?: RunnableConfig): Promise<Output> {
    return this.func(input, config);
  }
}

export default RunnableLambda;
