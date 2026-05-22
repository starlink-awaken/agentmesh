/**
 * EmbeddingProvider - 向量嵌入提供者
 *
 * 提供文本到向量的转换能力，支持语义相似度计算
 * 包含本地实现（TF-IDF 风格）和 OpenAI API 接口
 */

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 计算余弦相似度
 * 衡量两个向量之间的角度相似性
 *
 * @param a - 向量 A
 * @param b - 向量 B
 * @returns 相似度值 [-1, 1]，1 表示完全相同，-1 表示完全相反
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  // 长度不匹配时返回 0
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  // 避免除零
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * 归一化向量（使其模长为 1）
 */
function normalizeVector(vec: number[]): number[] {
  const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) {
    return vec.map(() => 0);
  }
  return vec.map((val) => val / magnitude);
}

// ============================================================================
// EmbeddingProvider 接口
// ============================================================================

/**
 * EmbeddingProvider 接口
 * 定义所有 embedding 提供者必须实现的方法
 */
export interface EmbeddingProvider {
  /**
   * 将单个文本转换为向量
   * @param text - 输入文本
   * @returns 向量表示
   */
  embed(text: string): Promise<number[]>;

  /**
   * 批量将文本转换为向量
   * @param texts - 输入文本数组
   * @returns 向量数组
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * 计算两个文本之间的相似度
   * @param a - 文本 A 或 向量 A
   * @param b - 文本 B 或 向量 B
   * @returns 相似度值 [0, 1] (文本输入) 或 [-1, 1] (向量输入)
   */
  similarity(a: string | number[], b: string | number[]): Promise<number> | number;

  /**
   * 清除缓存（可选）
   */
  clearCache?(): void;

  /**
   * 获取缓存统计（可选）
   */
  getCacheStats?(): { size: number; maxSize: number; enabled: boolean };
}

// ============================================================================
// LocalEmbeddingProvider 配置
// ============================================================================

export interface LocalEmbeddingProviderConfig {
  /** 向量维度（默认 128） */
  dimensions?: number;
  /** 是否启用缓存（默认 true） */
  cacheEnabled?: boolean;
  /** 最大缓存条目数（默认 1000） */
  maxCacheSize?: number;
}

// ============================================================================
// LocalEmbeddingProvider 实现
// ============================================================================

/**
 * 本地向量嵌入提供者
 *
 * 使用简化的 TF-IDF 风格算法生成文本嵌入：
 * 1. 文本分词（支持中英文）
 * 2. 基于 token 的哈希生成稀疏向量
 * 3. 降维到指定维度
 * 4. 归一化输出
 *
 * 特点：
 * - 无需外部 API 调用
 * - 速度快，适合开发测试
 * - 语义质量低于专业 embedding 模型
 * - 可通过缓存提升性能
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  private readonly dimensions: number;
  private readonly cacheEnabled: boolean;
  private readonly maxCacheSize: number;
  private cache: Map<string, number[]> = new Map();

  // 简单的停用词列表
  private static readonly STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also',
    '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都',
    '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你',
    '会', '着', '没有', '看', '好', '自己', '这', '那', '她', '他',
  ]);

  constructor(config?: LocalEmbeddingProviderConfig) {
    this.dimensions = config?.dimensions ?? 128;
    this.cacheEnabled = config?.cacheEnabled ?? true;
    this.maxCacheSize = config?.maxCacheSize ?? 1000;
  }

  /**
   * 将文本转换为向量
   */
  async embed(text: string): Promise<number[]> {
    // 检查缓存
    if (this.cacheEnabled && this.cache.has(text)) {
      return this.cache.get(text)!;
    }

    // 生成嵌入向量
    const embedding = this.generateEmbedding(text);

    // 缓存结果
    if (this.cacheEnabled) {
      this.addToCache(text, embedding);
    }

    return embedding;
  }

  /**
   * 批量将文本转换为向量
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }

  /**
   * 计算两个文本之间的相似度，或两个向量之间的相似度
   */
  async similarity(a: string | number[], b: string | number[]): Promise<number> {
    // 如果是向量输入，直接计算
    if (Array.isArray(a) && Array.isArray(b)) {
      return cosineSimilarity(a, b);
    }

    // 文本输入：先转换为向量
    const [vecA, vecB] = await Promise.all([this.embed(a as string), this.embed(b as string)]);
    // 将余弦相似度从 [-1, 1] 映射到 [0, 1]
    const sim = cosineSimilarity(vecA, vecB);
    return (sim + 1) / 2;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { size: number; maxSize: number; enabled: boolean } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      enabled: this.cacheEnabled,
    };
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 生成文本的嵌入向量
   */
  private generateEmbedding(text: string): number[] {
    // 1. 分词
    const tokens = this.tokenize(text);

    // 2. 初始化向量
    const vec = new Array(this.dimensions).fill(0);

    // 3. 基于 token 更新向量
    for (const token of tokens) {
      // 跳过停用词
      if (LocalEmbeddingProvider.STOP_WORDS.has(token.toLowerCase())) {
        continue;
      }

      // 使用哈希函数确定向量位置
      const positions = this.hashToPositions(token, 4); // 每个 token 影响 4 个位置

      for (const pos of positions) {
        vec[pos % this.dimensions] += 1;
      }
    }

    // 4. 应用位置加权（模拟位置编码）
    for (let i = 0; i < this.dimensions; i++) {
      // 使用递减权重，让前面的维度更重要
      const weight = 1 - (i / this.dimensions) * 0.5;
      vec[i] *= weight;
    }

    // 5. 归一化
    return normalizeVector(vec);
  }

  /**
   * 文本分词（支持中英文混合）
   */
  private tokenize(text: string): string[] {
    const tokens: string[] = [];

    // 简单的分词策略：
    // 1. 英文按空格和标点分割
    // 2. 中文字符单独处理

    // 英文单词
    const words = text.toLowerCase().match(/[a-z]+/g) || [];
    tokens.push(...words);

    // 中文字符和词组（简单处理：每 2 个字符为一组）
    const chinese = text.match(/[\u4e00-\u9fa5]+/g) || [];
    for (const segment of chinese) {
      // 单字
      for (const char of segment) {
        tokens.push(char);
      }
      // 双字词组
      for (let i = 0; i < segment.length - 1; i++) {
        tokens.push(segment.substring(i, i + 2));
      }
    }

    // 数字
    const numbers = text.match(/\d+/g) || [];
    tokens.push(...numbers);

    return tokens;
  }

  /**
   * 将 token 哈希到多个向量位置
   * 使用简单的哈希函数模拟特征映射
   */
  private hashToPositions(token: string, count: number): number[] {
    const positions: number[] = [];

    // 使用 djb2 哈希算法的变体
    let hash1 = 5381;
    let hash2 = 0;

    for (let i = 0; i < token.length; i++) {
      const char = token.charCodeAt(i);
      hash1 = ((hash1 << 5) + hash1) ^ char;
      hash2 = ((hash2 << 5) + hash2) ^ (char * (i + 1));
    }

    // 生成 count 个位置
    for (let i = 0; i < count; i++) {
      positions.push(Math.abs(hash1 + hash2 * i));
    }

    return positions;
  }

  /**
   * 添加到缓存（LRU 策略）
   */
  private addToCache(text: string, embedding: number[]): void {
    // 如果超过最大缓存大小，删除最旧的条目
    if (this.cache.size >= this.maxCacheSize) {
      // 获取第一个键（最旧）
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(text, embedding);
  }
}

// ============================================================================
// OpenAI Embedding Provider（可选实现）
// ============================================================================

export interface OpenAIEmbeddingProviderConfig {
  /** OpenAI API Key */
  apiKey: string;
  /** 模型名称（默认 text-embedding-3-small） */
  model?: string;
  /** 向量维度（可选，某些模型支持） */
  dimensions?: number;
  /** 请求超时（毫秒，默认 30000） */
  timeout?: number;
  /** 是否启用缓存 */
  cacheEnabled?: boolean;
  /** 最大缓存条目数 */
  maxCacheSize?: number;
  /** 自定义 base URL */
  baseUrl?: string;
}

/**
 * OpenAI Embedding API 响应
 */
interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI Embedding Provider
 *
 * 使用 OpenAI 的 embedding API 生成高质量向量嵌入
 * 支持 text-embedding-3-small 和 text-embedding-3-large 模型
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly dimensions?: number;
  private readonly timeout: number;
  private readonly cacheEnabled: boolean;
  private readonly maxCacheSize: number;
  private readonly baseUrl: string;
  private cache: Map<string, number[]> = new Map();

  constructor(config: OpenAIEmbeddingProviderConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.apiKey = config.apiKey;
    this.model = config.model ?? 'text-embedding-3-small';
    this.dimensions = config.dimensions;
    this.timeout = config.timeout ?? 30000;
    this.cacheEnabled = config.cacheEnabled ?? true;
    this.maxCacheSize = config.maxCacheSize ?? 1000;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  }

  /**
   * 将文本转换为向量
   */
  async embed(text: string): Promise<number[]> {
    // 检查缓存
    if (this.cacheEnabled && this.cache.has(text)) {
      return this.cache.get(text)!;
    }

    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  /**
   * 批量将文本转换为向量
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    // 检查哪些需要从 API 获取
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];
    const results: (number[] | null)[] = new Array(texts.length).fill(null);

    for (let i = 0; i < texts.length; i++) {
      if (this.cacheEnabled && this.cache.has(texts[i])) {
        results[i] = this.cache.get(texts[i])!;
      } else {
        uncachedTexts.push(texts[i]);
        uncachedIndices.push(i);
      }
    }

    // 如果有未缓存的文本，调用 API
    if (uncachedTexts.length > 0) {
      const newEmbeddings = await this.callAPI(uncachedTexts);

      for (let i = 0; i < uncachedTexts.length; i++) {
        const idx = uncachedIndices[i];
        results[idx] = newEmbeddings[i];

        // 缓存结果
        if (this.cacheEnabled) {
          this.addToCache(uncachedTexts[i], newEmbeddings[i]);
        }
      }
    }

    return results as number[][];
  }

  /**
   * 计算两个文本之间的相似度，或两个向量之间的相似度
   */
  async similarity(a: string | number[], b: string | number[]): Promise<number> {
    // 如果是向量输入，直接计算
    if (Array.isArray(a) && Array.isArray(b)) {
      return cosineSimilarity(a, b);
    }

    // 文本输入：先转换为向量
    const [vecA, vecB] = await Promise.all([this.embed(a as string), this.embed(b as string)]);
    return cosineSimilarity(vecA, vecB);
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { size: number; maxSize: number; enabled: boolean } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      enabled: this.cacheEnabled,
    };
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 调用 OpenAI API
   */
  private async callAPI(texts: string[]): Promise<number[][]> {
    const body: Record<string, unknown> = {
      input: texts,
      model: this.model,
    };

    if (this.dimensions) {
      body.dimensions = this.dimensions;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as OpenAIEmbeddingResponse;

      // 按 index 排序并提取 embedding
      const sorted = data.data.sort((a, b) => a.index - b.index);
      return sorted.map((item) => item.embedding);
    } catch (error) {
      clearTimeout(timeoutId);

      if ((error as Error).name === 'AbortError') {
        throw new Error('OpenAI API request timed out');
      }

      throw error;
    }
  }

  /**
   * 添加到缓存（LRU 策略）
   */
  private addToCache(text: string, embedding: number[]): void {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(text, embedding);
  }
}
