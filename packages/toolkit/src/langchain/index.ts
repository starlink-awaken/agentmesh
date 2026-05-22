/**
 * LangChain 模块 - 统一入口
 *
 * LangChain 风格的 Runnable 接口实现
 *
 * @author PAI
 * @version 1.0.0
 */

import { Runnable, RunnableSequence as RS } from './Runnable.js';
import { RunnableSequence } from './RunnableSequence.js';
import { RunnableParallel } from './RunnableParallel.js';
import {
  RunnableLambda,
  RunnableAssign,
  RunnablePick,
  RunnableMap,
} from './RunnableLambda.js';
import {
  SkillRunnable,
  SkillRunnableSequence,
  createSkillRunnable,
} from './SkillRunnable.js';

import type { RunnableInterface } from './types.js';
import type { LambdaFunc, RunnableLambdaConfig } from './RunnableLambda.js';
import type {
  SkillRunnableConfig,
  SkillExecutorFunc,
  SkillInput,
  SkillOutput,
} from './SkillRunnable.js';
import type { RunnableConfig } from './types.js';

// 类型导出
export type {
  RunnableConfig,
  RunnableCallback,
  RunnableInput,
  RunnableOutput,
  ChainResult,
  ChainStepResult,
  BatchResult,
  StreamEvent,
  StreamEventType,
  RunnableInterface,
  RunnableBindingConfig,
  PipeableRunnable,
  RunnableInputType,
  RunnableOutputType,
} from './types.js';

// 核心类导出
export { Runnable };
export { RunnableSequence };
export { RunnableSequence as Sequence } from './RunnableSequence.js';
export { RunnableParallel };
export { RunnableLambda };
export { RunnableAssign };
export { RunnablePick };
export { RunnableMap };
export { SkillRunnable };
export { SkillRunnableSequence };
export { createSkillRunnable };

// 类型导出
export type { LambdaFunc, StreamLambdaFunc, RunnableLambdaConfig } from './RunnableLambda.js';
export type {
  SkillRunnableConfig,
  SkillExecutorFunc,
  SkillInput,
  SkillOutput,
} from './SkillRunnable.js';

// 便捷函数

/**
 * 创建简单的 RunnableLambda
 *
 * @example
 * ```typescript
 * const upper = createLambda<string, string>(
 *   (s) => s.toUpperCase()
 * );
 * const result = await upper.invoke("hello"); // "HELLO"
 * ```
 */
export function createLambda<Input, Output>(
  func: LambdaFunc<Input, Output>,
  config?: { name?: string; description?: string }
): RunnableLambda<Input, Output> {
  return new RunnableLambda({ func, ...config });
}

/**
 * 创建异步 RunnableLambda
 *
 * @example
 * ```typescript
 * const fetchData = createAsyncLambda<string, string>(
 *   async (url) => {
 *     const res = await fetch(url);
 *     return res.text();
 *   }
 * );
 * ```
 */
export function createAsyncLambda<Input, Output>(
  func: (input: Input, config?: RunnableConfig) => Promise<Output>,
  config?: { name?: string; description?: string }
): RunnableLambda<Input, Output> {
  return new RunnableLambda({ func, ...config });
}

/**
 * 创建并行执行的 Runnable
 *
 * @example
 * ```typescript
 * const parallel = createParallel({
 *   length: (s: string) => s.length,
 *   upper: (s: string) => s.toUpperCase()
 * });
 * ```
 */
export function createParallel<Input>(
  runnables: Record<string, (input: Input, config?: RunnableConfig) => unknown>
): RunnableParallel<Input> {
  const wrapped: Record<string, RunnableInterface<Input, unknown>> = {};

  for (const [key, func] of Object.entries(runnables)) {
    wrapped[key] = new RunnableLambda({
      name: key,
      func: func as LambdaFunc<Input, unknown>,
    });
  }

  return new RunnableParallel(wrapped);
}

/**
 * 创建顺序链
 *
 * @example
 * ```typescript
 * const chain = createSequence(
 *   (s: string) => s.length,
 *   (n: number) => String(n)
 * );
 * ```
 */
export function createSequence<Input, Output>(
  ...funcs: Array<(input: unknown, config?: RunnableConfig) => unknown>
): RunnableInterface<Input, Output> {
  if (funcs.length === 0) {
    throw new Error('至少需要一个函数');
  }

  if (funcs.length === 1) {
    return new RunnableLambda({ func: funcs[0] as LambdaFunc<Input, Output> });
  }

  const lambdas = funcs.map((func, i) =>
    new RunnableLambda({
      name: `step${i}`,
      func: func as LambdaFunc<unknown, unknown>,
    })
  );

  return RS.from(lambdas) as RunnableInterface<Input, Output>;
}

/**
 * 管道操作符 | 的类型支持
 *
 * @example
 * ```typescript
 * const result = await (runnableA | runnableB | runnableC).invoke(input);
 * ```
 */
export function pipe<Input, Middle, Output>(
  first: RunnableInterface<Input, Middle>,
  second: RunnableInterface<Middle, Output>
): RunnableInterface<Input, Output> {
  return first.pipe(second);
}

// 重新导出所有类型以便使用
export type { RunnableConfig as Config } from './types.js';
