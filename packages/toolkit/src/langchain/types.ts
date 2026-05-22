/**
 * LangChain Runnable 类型定义
 *
 * 提供 LangChain 风格的 Runnable 接口实现
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * RunnableConfig - 运行配置
 * 用于配置 Runnable 的执行行为
 */
export interface RunnableConfig {
  /** 最大执行时间（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 回调函数 */
  callbacks?: RunnableCallback | RunnableCallback[];
  /** 标签 */
  tags?: string[];
  /** 元数据 */
  metadata?: Record<string, unknown>;
  /** 是否启用调试 */
  debug?: boolean;
  /** 递归深度限制 */
  recursionLimit?: number;
}

/**
 * RunnableCallback - 回调函数类型
 */
export interface RunnableCallback {
  onStart?: (input: unknown) => void | Promise<void>;
  onEnd?: (output: unknown) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
  onChunk?: (chunk: unknown) => void | Promise<void>;
}

/**
 * RunnableInput - Runnable 输入类型
 * 使用泛型进行类型推断
 */
export type RunnableInput<T = unknown> = T;

/**
 * RunnableOutput - Runnable 输出类型
 * 使用泛型进行类型推断
 */
export type RunnableOutput<T = unknown> = T;

/**
 * ChainResult - 链式调用结果
 */
export interface ChainResult<T = unknown> {
  /** 是否成功 */
  success: boolean;
  /** 输出结果 */
  output: T;
  /** 错误信息 */
  error?: string;
  /** 执行时间（毫秒） */
  duration?: number;
  /** 中间步骤结果 */
  steps?: ChainStepResult[];
}

/**
 * ChainStepResult - 链式调用中间步骤结果
 */
export interface ChainStepResult {
  /** 步骤名称 */
  name: string;
  /** 输入 */
  input: unknown;
  /** 输出 */
  output: unknown;
  /** 执行时间 */
  duration: number;
}

/**
 * BatchResult - 批量执行结果
 */
export interface BatchResult<Input, Output> {
  /** 成功的结果 */
  successful: Array<{ input: Input; output: Output }>;
  /** 失败的结果 */
  failed: Array<{ input: Input; error: Error }>;
}

/**
 * StreamEvent - 流式事件类型
 */
export type StreamEventType = 'start' | 'chunk' | 'end' | 'error';

/**
 * StreamEvent - 流式事件
 */
export interface StreamEvent<T = unknown> {
  /** 事件类型 */
  event: StreamEventType;
  /** 事件数据 */
  data: T;
  /** 时间戳 */
  timestamp: number;
}

/**
 * RunnableInterface - Runnable 接口定义
 */
export interface RunnableInterface<Input = unknown, Output = unknown> {
  /** Runnable 名称 */
  name: string;

  /**
   * 单次执行
   */
  invoke(input: Input, config?: RunnableConfig): Promise<Output>;

  /**
   * 批量执行
   */
  batch(inputs: Input[], config?: RunnableConfig): Promise<Output[]>;

  /**
   * 流式执行
   */
  stream(input: Input, config?: RunnableConfig): AsyncGenerator<Output, void, unknown>;

  /**
   * 链式组合
   */
  pipe<NewOutput>(next: RunnableInterface<Output, NewOutput>): RunnableInterface<Input, NewOutput>;

  /**
   * 获取绑定配置的方法
   */
  withConfig(config: RunnableConfig): RunnableInterface<Input, Output>;
}

/**
 * RunnableBindingConfig - Runnable 绑定配置
 */
export interface RunnableBindingConfig extends RunnableConfig {
  /** 绑定的 Runnable */
  bound: RunnableInterface;
}

/**
 * PipeableRunnable - 可管道的 Runnable
 */
export type PipeableRunnable<Input = unknown, Output = unknown> = {
  invoke: (input: Input, config?: RunnableConfig) => Promise<Output>;
  pipe: <NewOutput>(next: RunnableInterface<Output, NewOutput>) => RunnableInterface<Input, NewOutput>;
};

/**
 * Helper type to extract input type from a Runnable
 */
export type RunnableInputType<R extends RunnableInterface> = R extends RunnableInterface<infer I, unknown> ? I : never;

/**
 * Helper type to extract output type from a Runnable
 */
export type RunnableOutputType<R extends RunnableInterface> = R extends RunnableInterface<unknown, infer O> ? O : never;
