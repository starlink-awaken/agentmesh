/**
 * PromptCompressor - 即时Prompt压缩
 *
 * 基于CAMPHOR论文的即时Prompt压缩技术
 * 将函数定义压缩为单个token
 *
 * @author PAI
 */

import type { CompressionConfig } from './types.js';

/**
 * 函数定义
 */
interface FunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * 压缩后的函数表示
 */
interface CompressedFunction {
  name: string;
  token: string;  // 压缩后的token
  embedding?: number[];
}

/**
 * 即时Prompt压缩器
 */
export class PromptCompressor {
  private config: CompressionConfig;
  private functionTokens: Map<string, CompressedFunction> = new Map();

  constructor(config: CompressionConfig) {
    this.config = config;
  }

  /**
   * 压缩函数定义
   */
  compress(functions: FunctionDefinition[]): CompressedFunction[] {
    switch (this.config.method) {
      case 'token':
        return this.compressToToken(functions);
      case 'summary':
        return this.compressToSummary(functions);
      case 'hybrid':
      default:
        return this.compressHybrid(functions);
    }
  }

  /**
   * 压缩为单个token（CAMPHOR方法）
   */
  private compressToToken(functions: FunctionDefinition[]): CompressedFunction[] {
    return functions.map((fn) => {
      // 检查缓存
      const cached = this.functionTokens.get(fn.name);
      if (cached) return cached;

      // 生成压缩token（模拟：取函数名首字母+hash）
      const token = this.generateToken(fn);

      // 生成embedding（模拟：使用函数名的embedding）
      const embedding = this.generateEmbedding(fn.name);

      const compressed: CompressedFunction = {
        name: fn.name,
        token,
        embedding,
      };

      this.functionTokens.set(fn.name, compressed);
      return compressed;
    });
  }

  /**
   * 压缩为摘要
   */
  private compressToSummary(functions: FunctionDefinition[]): CompressedFunction[] {
    return functions.map((fn) => ({
      name: fn.name,
      token: this.summarize(fn),
      embedding: this.generateEmbedding(this.summarize(fn)),
    }));
  }

  /**
   * 混合压缩
   */
  private compressHybrid(functions: FunctionDefinition[]): CompressedFunction[] {
    // 长函数用摘要，短函数用token
    return functions.map((fn) => {
      const isLong = fn.description.length > 100;

      if (isLong) {
        return {
          name: fn.name,
          token: this.summarize(fn),
          embedding: this.generateEmbedding(this.summarize(fn)),
        };
      }

      return this.compressToToken([fn])[0];
    });
  }

  /**
   * 生成token
   */
  private generateToken(fn: FunctionDefinition): string {
    // 简单实现：取函数名首字母 + 描述hash的前4位
    const firstChar = fn.name.charAt(0).toUpperCase();
    const hash = this.simpleHash(fn.description);
    return `${firstChar}${hash.slice(0, 4)}`;
  }

  /**
   * 简单hash函数
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 生成摘要
   */
  private summarize(fn: FunctionDefinition): string {
    // 提取关键信息
    const keyWords = fn.description.split(' ').slice(0, 5).join(' ');
    const params = Object.keys(fn.parameters).join(', ');
    return `${fn.name}: ${keyWords}. Params: ${params}`;
  }

  /**
   * 生成embedding（模拟）
   */
  private generateEmbedding(text: string): number[] {
    // 模拟embedding生成
    const dim = 128;
    const embedding = new Array(dim);

    // 使用文本生成伪随机但一致的embedding
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed = (seed * 31 + text.charCodeAt(i)) % 1000000;
    }

    for (let i = 0; i < dim; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      embedding[i] = (seed / 0x7fffffff) * 2 - 1;
    }

    return embedding;
  }

  /**
   * 解压缩（用于调试）
   */
  decompress(compressed: CompressedFunction): FunctionDefinition | null {
    // 在实际应用中，这里需要维护反向映射
    // 暂时返回null
    return null;
  }

  /**
   * 获取压缩统计信息
   */
  getStats(originalFunctions: FunctionDefinition[]): {
    originalTokens: number;
    compressedTokens: number;
    ratio: number;
  } {
    const compressed = this.compress(originalFunctions);

    // 估算原始token数（简单计算）
    const originalTokens = originalFunctions.reduce(
      (sum, fn) => sum + fn.name.length + fn.description.length / 4,
      0
    );

    // 压缩后token数（每个函数1个token）
    const compressedTokens = compressed.length;

    return {
      originalTokens: Math.round(originalTokens),
      compressedTokens,
      ratio: originalTokens / compressedTokens,
    };
  }
}

/**
 * 创建Prompt压缩器的工厂函数
 */
export function createPromptCompressor(
  method: 'token' | 'summary' | 'hybrid' = 'token'
): PromptCompressor {
  return new PromptCompressor({
    method,
    targetRatio: method === 'token' ? 0.04 : 0.5, // token方法可达96%压缩率
  });
}
