/**
 * PromptCompressor - Prompt 压缩器
 *
 * 利用本地小模型压缩 Prompt，节约 50-70% Token
 * 源自 Advanced RAG 架构 - LLMLingua 思想
 */

import type { CompressionConfig } from './types.js';

/**
 * 压缩结果
 */
export interface CompressionResult {
  original: string;
  compressed: string;
  ratio: number;
  preservedKeywords: string[];
}

/**
 * Prompt 压缩器
 */
export class PromptCompressor {
  private config: Required<CompressionConfig>;

  constructor(config: CompressionConfig = {}) {
    this.config = {
      ratio: config.ratio ?? 0.4,        // 压缩到 40%
      keepKeywords: config.keepKeywords ?? true,
      keepNumbers: config.keepNumbers ?? true,
    };
  }

  /**
   * 压缩文本（本地小模型调用）
   * 注意：实际实现需要调用 LLM
   */
  async compress(
    text: string,
    llmGenerate?: (prompt: string) => Promise<string>
  ): Promise<CompressionResult> {
    // 如果提供了 LLM，使用 LLM 压缩
    if (llmGenerate) {
      return this.compressWithLLM(text, llmGenerate);
    }

    // 否则使用规则压缩
    return this.compressWithRules(text);
  }

  /**
   * 使用 LLM 压缩
   */
  private async compressWithLLM(
    text: string,
    generate: (prompt: string) => Promise<string>
  ): Promise<CompressionResult> {
    const compressionPrompt = `Compress the following text to ${Math.round(this.config.ratio * 100)}% of its original length while preserving:

${this.config.keepKeywords ? '- Key technical terms and concepts\n' : ''}${this.config.keepNumbers ? '- Important numbers and statistics\n' : ''}- Core meaning and intent
- Action items and decisions

Original text:
---
${text}
---

Compressed text (keep it as concise as possible):`;

    const compressed = await generate(compressionPrompt);

    return {
      original: text,
      compressed: compressed.trim(),
      ratio: compressed.length / text.length,
      preservedKeywords: this.extractKeywords(text),
    };
  }

  /**
   * 使用规则压缩（无需 LLM）
   */
  private compressWithRules(text: string): CompressionResult {
    let compressed = text;

    // 1. 移除多余空白
    compressed = compressed.replace(/\s+/g, ' ');

    // 2. 移除常见填充词
    const fillerWords = [
      '基本上', '实际上', '事实上', '可以说', '大家知道',
      'as you know', 'basically', 'actually', 'in fact', 'obviously',
      'of course', 'certainly', 'undoubtedly',
    ];
    for (const word of fillerWords) {
      compressed = compressed.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
    }

    // 3. 简化连接词
    compressed = compressed.replace(/\b(而且|并且|同时|此外|另外)\b/g, ',');
    compressed = compressed.replace(/\b(但是|然而|不过|可是|不过)\b/g, ' but ');
    compressed = compressed.replace(/\b(因为|由于|所以|因此|故)\b/g, ' since ');

    // 4. 移除重复形容词
    compressed = compressed.replace(/\b(\w+)\s+\1\b/gi, '$1');

    // 5. 移除括号内的解释（可选）
    compressed = compressed.replace(/\([^)]*\)/g, '');

    // 6. 移除 markdown 格式标记
    compressed = compressed.replace(/[#*_`~\[\]]/g, '');

    // 7. 压缩到目标长度
    const targetLength = Math.round(text.length * this.config.ratio);
    if (compressed.length > targetLength) {
      // 保留开头和结尾
      const half = Math.floor(targetLength / 2);
      compressed = compressed.substring(0, half) + '...' + compressed.substring(compressed.length - half);
    }

    // 清理
    compressed = compressed.replace(/\.\.\./g, '...').replace(/\s+/g, ' ').trim();

    return {
      original: text,
      compressed,
      ratio: compressed.length / text.length,
      preservedKeywords: this.extractKeywords(text),
    };
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    const keywords = new Set<string>();

    // 提取技术术语（驼峰/蛇命）
    const termMatches = text.match(/[a-zA-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+/g) || [];
    termMatches.forEach(t => keywords.add(t));

    // 提取中文术语
    const cnTerms = text.match(/[\u4e00-\u9fff]{2,}/g) || [];
    cnTerms.forEach(t => keywords.add(t));

    // 提取数字
    if (this.config.keepNumbers) {
      const numbers = text.match(/\d+(?:\.\d+)?/g) || [];
      numbers.forEach(n => keywords.add(n));
    }

    return Array.from(keywords).slice(0, 20);
  }

  /**
   * 批量压缩
   */
  async compressBatch(
    texts: string[],
    llmGenerate?: (prompt: string) => Promise<string>
  ): Promise<CompressionResult[]> {
    return Promise.all(texts.map(t => this.compress(t, llmGenerate)));
  }
}

/**
 * 创建 PromptCompressor
 */
export function createPromptCompressor(config?: CompressionConfig): PromptCompressor {
  return new PromptCompressor(config);
}
