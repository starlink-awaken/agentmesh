/**
 * Context 模块类型定义
 *
 * @description 定义上下文裁剪相关的接口和类型
 */

/**
 * 裁剪策略类型
 */
export type TrimStrategy = 'head' | 'tail' | 'summary' | 'importance';

/**
 * 裁剪配置
 */
export interface TrimConfig {
  /**
   * 最大 token 数
   */
  maxTokens: number;

  /**
   * 裁剪策略
   * - head: 保留开头，删除中间
   * - tail: 保留结尾，删除开头
   * - summary: 压缩为摘要
   * - importance: 基于重要性排序保留
   */
  strategy: TrimStrategy;

  /**
   * 不可删除的内容模式（正则表达式数组）
   * 匹配这些模式的内容会被强制保留
   */
  preservePatterns?: RegExp[];

  /**
   * 滑动窗口重叠 token 数
   * 用于在裁剪时保持上下文连续性
   */
  overlapTokens?: number;
}

/**
 * 上下文项（消息）
 */
export interface ContextItem {
  /**
   * 消息内容
   */
  content: string;

  /**
   * 消息角色
   */
  role: 'user' | 'assistant' | 'system';

  /**
   * 重要性评分 (0-1)
   * 1 为最高，用于 importance 策略
   */
  importance?: number;

  /**
   * 是否强制保留
   * 标记为 true 的消息在任何裁剪策略下都不会被删除
   */
  pinned?: boolean;

  /**
   * 额外元数据
   */
  metadata?: Record<string, unknown>;
}

/**
 * 裁剪结果
 */
export interface TrimResult {
  /**
   * 裁剪后的消息
   */
  messages: ContextItem[];

  /**
   * 原始 token 数
   */
  originalTokens: number;

  /**
   * 裁剪后 token 数
   */
  trimmedTokens: number;

  /**
   * 删除的消息数
   */
  removedCount: number;
}

/**
 * Token 估算器函数类型
 */
export type Tokenizer = (text: string) => number;
