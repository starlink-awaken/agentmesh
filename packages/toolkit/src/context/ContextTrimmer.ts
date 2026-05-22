/**
 * Context Trimmer - 上下文窗口动态裁剪
 *
 * @description 提供多种策略的上下文裁剪能力，支持 token 计数、优先级标记和滑动窗口
 */

import type { TrimConfig, ContextItem } from './types.js';

/**
 * 默认 token 估算器
 * 简单按字符估算：平均每 4 个字符一个 token（中文约 1-2 字符/token，英文约 4 字符/token）
 */
function defaultTokenizer(text: string): number {
  if (!text) return 0;

  // 估算逻辑：
  // - 中文字符：每个字符约 1-1.5 token
  // - 英文字符：约 4 个字符 1 token
  // 简化处理：对于混合文本，使用 3.5 作为估算因子
  const chineseCharCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherCharCount = text.length - chineseCharCount;

  // 中文字符按 1.3 估算，英文按 4 估算
  return Math.ceil(chineseCharCount * 1.3 + otherCharCount / 4);
}

/**
 * ContextTrimmer 配置
 */
export interface ContextTrimmerConfig {
  /**
   * 自定义 token 估算函数
   */
  tokenizer?: (text: string) => number;
  /**
   * 默认最大 token 数
   */
  defaultMaxTokens?: number;
}

/**
 * 上下文裁剪器
 *
 * @example
 * ```typescript
 * const trimmer = new ContextTrimmer();
 *
 * const messages: ContextItem[] = [
 *   { content: 'Hello', role: 'user' },
 *   { content: 'Hi there!', role: 'assistant' },
 * ];
 *
 * const result = trimmer.trim(messages, {
 *   maxTokens: 10,
 *   strategy: 'head',
 * });
 * ```
 */
export class ContextTrimmer {
  private tokenizer: (text: string) => number;
  private defaultMaxTokens: number;

  constructor(config: ContextTrimmerConfig = {}) {
    this.tokenizer = config.tokenizer ?? defaultTokenizer;
    this.defaultMaxTokens = config.defaultMaxTokens ?? 4096;
  }

  /**
   * 估算文本的 token 数量
   *
   * @param text - 要估算的文本
   * @returns 估算的 token 数量
   */
  estimateTokens(text: string): number {
    return this.tokenizer(text);
  }

  /**
   * 计算消息列表的总 token 数
   *
   * @param messages - 消息列表
   * @returns 总 token 数
   */
  calculateTotalTokens(messages: ContextItem[]): number {
    return messages.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0);
  }

  /**
   * 裁剪上下文消息
   *
   * @param messages - 消息列表
   * @param config - 裁剪配置
   * @returns 裁剪后的消息列表
   */
  trim(messages: ContextItem[], config: Partial<TrimConfig>): ContextItem[] {
    if (messages.length === 0) return [];

    const fullConfig: TrimConfig = {
      maxTokens: config.maxTokens ?? this.defaultMaxTokens,
      strategy: config.strategy ?? 'head',
      preservePatterns: config.preservePatterns ?? [],
      overlapTokens: config.overlapTokens ?? 0,
    };

    // 检查是否需要裁剪
    const totalTokens = this.calculateTotalTokens(messages);
    if (totalTokens <= fullConfig.maxTokens) {
      return [...messages];
    }

    // 分离必需消息（pinned）和可裁剪消息
    const { pinned, removable } = this.separatePinnedMessages(messages, fullConfig.preservePatterns ?? []);

    // 计算保留消息的 token
    const pinnedTokens = this.calculateTotalTokens(pinned);
    const availableTokens = fullConfig.maxTokens - pinnedTokens;

    if (availableTokens <= 0) {
      // 只有 pinned 消息能保留
      return pinned;
    }

    // 根据策略裁剪
    let trimmedRemovable: ContextItem[];
    switch (fullConfig.strategy) {
      case 'head':
        trimmedRemovable = this.trimHead(removable, availableTokens, fullConfig.overlapTokens);
        break;
      case 'tail':
        trimmedRemovable = this.trimTail(removable, availableTokens, fullConfig.overlapTokens);
        break;
      case 'importance':
        trimmedRemovable = this.trimByImportance(removable, availableTokens);
        break;
      case 'summary':
        trimmedRemovable = this.trimWithSummary(removable, availableTokens);
        break;
      default:
        trimmedRemovable = this.trimHead(removable, availableTokens, fullConfig.overlapTokens);
    }

    // 合并结果
    return [...pinned, ...trimmedRemovable];
  }

  /**
   * 分离 pinned 消息和可移除消息
   */
  private separatePinnedMessages(
    messages: ContextItem[],
    preservePatterns: RegExp[]
  ): { pinned: ContextItem[]; removable: ContextItem[] } {
    const pinned: ContextItem[] = [];
    const removable: ContextItem[] = [];

    for (const msg of messages) {
      // 检查是否匹配保留模式
      const matchesPattern = preservePatterns.some(pattern => pattern.test(msg.content));

      if (msg.pinned || matchesPattern || msg.role === 'system') {
        pinned.push(msg);
      } else {
        removable.push(msg);
      }
    }

    return { pinned, removable };
  }

  /**
   * Head 裁剪策略：保留开头，删除中间
   */
  private trimHead(
    messages: ContextItem[],
    maxTokens: number,
    overlapTokens: number = 0
  ): ContextItem[] {
    const result: ContextItem[] = [];
    let currentTokens = 0;

    // 从开头开始添加
    for (const msg of messages) {
      const msgTokens = this.estimateTokens(msg.content);

      if (currentTokens + msgTokens <= maxTokens) {
        result.push(msg);
        currentTokens += msgTokens;
      } else {
        break;
      }
    }

    // 如果需要 overlap，尝试从末尾添加一些
    if (overlapTokens > 0 && messages.length > result.length) {
      const fromEnd: ContextItem[] = [];
      let overlapUsed = 0;

      for (let i = messages.length - 1; i >= 0 && overlapUsed < overlapTokens; i--) {
        if (!result.includes(messages[i])) {
          const msgTokens = this.estimateTokens(messages[i].content);
          if (overlapUsed + msgTokens <= overlapTokens) {
            fromEnd.unshift(messages[i]);
            overlapUsed += msgTokens;
          }
        }
      }

      return [...result, ...fromEnd];
    }

    return result;
  }

  /**
   * Tail 裁剪策略：保留结尾，删除开头
   */
  private trimTail(
    messages: ContextItem[],
    maxTokens: number,
    overlapTokens: number = 0
  ): ContextItem[] {
    // 从末尾开始选择
    const result: ContextItem[] = [];
    let currentTokens = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgTokens = this.estimateTokens(msg.content);

      if (currentTokens + msgTokens <= maxTokens) {
        result.unshift(msg);
        currentTokens += msgTokens;
      } else {
        break;
      }
    }

    // 如果需要 overlap，尝试从开头添加一些
    if (overlapTokens > 0 && messages.length > result.length) {
      const fromStart: ContextItem[] = [];
      let overlapUsed = 0;

      for (let i = 0; i < messages.length && overlapUsed < overlapTokens; i++) {
        if (!result.includes(messages[i])) {
          const msgTokens = this.estimateTokens(messages[i].content);
          if (overlapUsed + msgTokens <= overlapTokens) {
            fromStart.push(messages[i]);
            overlapUsed += msgTokens;
          }
        }
      }

      return [...fromStart, ...result];
    }

    return result;
  }

  /**
   * Importance 裁剪策略：基于重要性排序保留
   */
  private trimByImportance(messages: ContextItem[], maxTokens: number): ContextItem[] {
    // 为没有 importance 的消息设置默认值
    const scored = messages.map((msg, index) => {
      let importance = msg.importance ?? 0.5;

      // 调整 importance：assistant 消息通常更重要
      if (msg.role === 'assistant') {
        importance = Math.max(importance, 0.6);
      }

      // 越近的消息权重越高
      const recencyBoost = 1 + (index / messages.length) * 0.3;

      return {
        msg,
        score: importance * recencyBoost,
        tokens: this.estimateTokens(msg.content),
      };
    });

    // 按分数降序排序
    scored.sort((a, b) => b.score - a.score);

    // 从高到低选择，直到达到 token 限制
    const result: ContextItem[] = [];
    let currentTokens = 0;

    for (const item of scored) {
      if (currentTokens + item.tokens <= maxTokens) {
        result.push(item.msg);
        currentTokens += item.tokens;
      }
    }

    // 保持原始顺序
    result.sort((a, b) => messages.indexOf(a) - messages.indexOf(b));

    return result;
  }

  /**
   * Summary 裁剪策略：压缩为摘要
   */
  private trimWithSummary(messages: ContextItem[], maxTokens: number): ContextItem[] {
    // 优先保留重要消息
    const important: ContextItem[] = [];
    const others: ContextItem[] = [];

    for (const msg of messages) {
      if (msg.importance && msg.importance >= 0.8) {
        important.push(msg);
      } else {
        others.push(msg);
      }
    }

    const importantTokens = this.calculateTotalTokens(important);
    const availableForOthers = maxTokens - importantTokens;

    // 保留高重要性消息
    const result: ContextItem[] = [...important];
    let currentTokens = importantTokens;

    // 对其他消息进行摘要处理
    for (const msg of others) {
      const msgTokens = this.estimateTokens(msg.content);

      if (currentTokens + msgTokens <= maxTokens) {
        result.push(msg);
        currentTokens += msgTokens;
      } else {
        // 尝试压缩剩余内容
        const remaining = maxTokens - currentTokens;
        if (remaining > 10) {
          // 创建一个压缩版本
          const compressed = this.compressMessage(msg, remaining);
          result.push(compressed);
          currentTokens += this.estimateTokens(compressed.content);
        }
      }
    }

    // 保持原始顺序
    return result.sort((a, b) => messages.indexOf(a) - messages.indexOf(b));
  }

  /**
   * 压缩单个消息
   */
  private compressMessage(msg: ContextItem, maxTokens: number): ContextItem {
    const originalTokens = this.estimateTokens(msg.content);

    if (originalTokens <= maxTokens) {
      return msg;
    }

    // 简单压缩：保留开头和关键部分
    const content = msg.content;

    // 按句子分割
    const sentences = content.split(/[。！？.\n]/).filter(s => s.trim());

    if (sentences.length <= 1) {
      // 无法压缩，返回截断版本
      const ratio = maxTokens / originalTokens;
      const chars = Math.floor(content.length * ratio * 0.9);
      return {
        ...msg,
        content: content.substring(0, chars) + '...',
        metadata: {
          ...msg.metadata,
          compressed: true,
          originalTokens,
        },
      };
    }

    // 保留第一句和最后一句
    const compressedContent = sentences[0] + '。' + (sentences.length > 1 ? sentences[sentences.length - 1] : '');

    return {
      ...msg,
      content: compressedContent,
      metadata: {
        ...msg.metadata,
        compressed: true,
        originalTokens,
        compressedTo: this.estimateTokens(compressedContent),
      },
    };
  }
}

/**
 * 创建 ContextTrimmer 实例的工厂函数
 *
 * @param config - 配置选项
 * @returns ContextTrimmer 实例
 *
 * @example
 * ```typescript
 * const trimmer = createContextTrimmer({
 *   tokenizer: (text) => Math.ceil(text.length / 4),
 *   defaultMaxTokens: 8192,
 * });
 * ```
 */
export function createContextTrimmer(config: ContextTrimmerConfig = {}): ContextTrimmer {
  return new ContextTrimmer(config);
}

// Re-export types
export type {
  TrimConfig,
  ContextItem,
} from './types.js';
