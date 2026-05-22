/**
 * Honeycomb LLM Integration - Main Entry Point
 *
 * 本模块提供统一的 LLM API 集成入口。
 * 支持多个 LLM 提供者（Claude、OpenAI、本地模型），
 * 提供缓存、批处理、速率限制等性能优化功能。
 *
 * 主要导出：
 * - LLMClient: 统一入口
 * - LLMProvider: Provider 接口
 * - ClaudeProvider: Claude API 实现
 * - OpenAIProvider: OpenAI API 实现
 * - SimulationProvider: 模拟 Provider（用于测试）
 *
 * @example
 * ```typescript
 * import { LLMClient } from './llm/index.js';
 *
 * const client = new LLMClient({
 *   provider: 'claude',
 *   claude: { apiKey: 'sk-ant-xxxxx' },
 *   cache: { enabled: true },
 * }, logger);
 *
 * const result = await client.complete('Hello, Honeycomb!');
 * console.log(result.content);
 * ```
 */

// 类型定义
export type {
  // Provider 接口
  LLMProvider,

  // 完成选项和结果
  CompletionOptions,
  CompletionResult,
  CompletionRequest,
  CompletionChunk,

  // 工具定义
  Tool,
  ToolCall,

  // Provider 配置
  ProviderConfig,

  // LLM 配置
  LLMConfig,
  ClaudeConfig,
  OpenAIConfig,

  // 性能组件配置
  BatchConfig,
  CacheConfig,
  CacheStats,
  RateLimitConfig,

  // Token 统计
  TokenUsage,
  TokenReport,

  // 流式响应
  StreamCallback,
  StreamOptions,

  // 模拟
  SimulationConfig,
  SimulationResult,
} from './types.js';

// 错误类型
export {
  LLMError,
  RateLimitError,
  AuthenticationError,
  TokenBudgetError,
} from './types.js';

// Provider 实现
export { ClaudeProvider } from './claude.js';
export { OpenAIProvider } from './openai.js';
export { SimulationProvider } from './simulation.js';

// 性能组件
export { RequestBatcher, type BatchStats, type ExtendedBatchConfig } from './batcher.js';
export { ResponseCache, CacheKeyGenerator } from './cache.js';
export { RateLimiter, TokenBucketRateLimiter } from './rate-limiter.js';
export { TokenTracker } from './tracker.js';

// Provider Manager
export { ProviderManager } from './provider.js';

// ============================================================
// LLM Client - 统一入口
// ============================================================

import * as crypto from 'node:crypto';

import type {
  LLMConfig,
  CompletionOptions,
  CompletionResult,
  CompletionChunk,
  CompletionRequest,
  TokenReport,
} from './types.js';
import { ProviderManager } from './provider.js';
import { RequestBatcher } from './batcher.js';
import { ResponseCache, CacheKeyGenerator } from './cache.js';
import { RateLimiter } from './rate-limiter.js';
import { TokenTracker } from './tracker.js';

// LLMMetrics 在本文件底部定义，使用前向声明

/**
 * LLM Client - 统一入口
 *
 * 负责协调所有 LLM 相关操作，包括：
 * - Provider 选择和管理
 * - 请求缓存
 * - 批处理
 * - 速率限制
 * - Token 统计
 */
export class LLMClient {
  private providerManager: ProviderManager;
  private batcher: RequestBatcher;
  private cache: ResponseCache;
  private rateLimiter: RateLimiter;
  private tokenTracker: TokenTracker;
  private metrics: LLMMetrics;
  private logger: any;
  private config: LLMConfig;

  constructor(config: LLMConfig, logger: any) {
    this.config = config;
    this.logger = logger;

    // 初始化组件
    this.providerManager = new ProviderManager(config, logger);
    this.cache = new ResponseCache(config.cache || {}, logger);
    this.rateLimiter = new RateLimiter(config.rateLimit || {}, logger);
    this.tokenTracker = new TokenTracker(logger);
    this.metrics = new LLMMetrics(logger);

    // 初始化批处理器（在 Provider 初始化后设置 Provider）
    this.batcher = new RequestBatcher(
      config.batch || {},
      logger,
      this.providerManager.getProvider()
    );
  }

  /**
   * 执行 LLM 完成
   */
  async complete(
    prompt: string,
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const startTime = Date.now();

    // 1. 检查缓存
    if (!options?.skipCache && this.config.cache?.enabled) {
      const cacheKey = await CacheKeyGenerator.generate(prompt, options);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.metrics.recordCacheHit(prompt.length);
        this.logger.debug('Cache hit', { promptLength: prompt.length });
        return { ...cached, cached: true };
      }
    }

    // 2. 获取 Provider
    const provider = options?.metadata?.agentName
      ? this.providerManager.getProvider(options.metadata.agentName)
      : this.providerManager.getProvider();

    // 3. 速率限制
    if (this.config.rateLimit?.enabled) {
      await this.rateLimiter.waitUntilAllowed(provider.name);
    }

    // 4. 执行请求
    let result: CompletionResult;
    if (
      this.config.batch?.enabled &&
      !options?.stream &&
      provider.getConfig().supportsBatch
    ) {
      // 批处理模式
      const requestId = crypto.randomUUID();
      result = await this.batcher.add({ id: requestId, prompt, options });
    } else {
      // 直接调用
      result = await provider.complete(prompt, options);
    }

    // 5. 缓存结果
    if (this.config.cache?.enabled && result.finishReason === 'stop') {
      const cacheKey = await CacheKeyGenerator.generate(prompt, options);
      this.cache.setByKey(cacheKey, result);
    }

    // 6. 记录指标
    result.duration = Date.now() - startTime;
    this.tokenTracker.record(
      provider.name,
      result.inputTokens,
      result.outputTokens,
      options?.metadata
    );
    this.metrics.recordCompletion(result);

    return result;
  }

  /**
   * 流式完成
   */
  async *stream(
    prompt: string,
    options?: CompletionOptions
  ): AsyncIterable<CompletionChunk> {
    const provider = this.providerManager.getProvider();

    // 速率限制
    if (this.config.rateLimit?.enabled) {
      await this.rateLimiter.waitUntilAllowed(provider.name);
    }

    let totalTokens = 0;

    for await (const chunk of provider.stream(prompt, options)) {
      this.metrics.recordChunk(chunk.delta.length);
      totalTokens += chunk.delta.length;
      yield chunk;
    }

    // 记录 Token 使用（流式响应可能不返回精确 Token 数）
    const estimatedTokens = Math.ceil(prompt.length / 4) + totalTokens;
    this.tokenTracker.record(provider.name, Math.ceil(prompt.length / 4), totalTokens);
  }

  /**
   * 批量完成
   */
  async batch(requests: CompletionRequest[]): Promise<CompletionResult[]> {
    const provider = this.providerManager.getProvider();
    return provider.batch(requests);
  }

  /**
   * 估算 Token
   */
  estimateTokens(text: string, provider?: string): number {
    const p = this.providerManager.getProvider(provider);
    return p.estimateTokens(text);
  }

  /**
   * 获取 Token 使用统计
   */
  getTokenStats(provider?: string): TokenUsage {
    return this.tokenTracker.getTotal(provider);
  }

  /**
   * 检查预算
   */
  checkBudget(budget: number, provider?: string): boolean {
    return this.tokenTracker.checkBudget(budget, provider);
  }

  /**
   * 获取 Token 报告
   */
  getTokenReport(): TokenReport {
    return this.tokenTracker.getReport();
  }

  /**
   * 估算成本
   */
  estimateCost(provider?: string): {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    currency: string;
  } {
    return this.tokenTracker.estimateCost(provider);
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * 刷新批处理队列
   */
  async flush(): Promise<void> {
    await this.batcher.flush();
  }

  /**
   * 获取指标
   */
  getMetrics() {
    return this.metrics.getMetrics();
  }

  /**
   * 重置指标
   */
  resetMetrics(): void {
    this.metrics.reset();
  }

  /**
   * 检查 Provider 可用性
   */
  async checkHealth(providerName?: string): Promise<Record<string, boolean>> {
    return this.providerManager.checkHealth(providerName);
  }

  /**
   * 设置主 Provider
   */
  setPrimaryProvider(name: string): void {
    this.providerManager.setPrimaryProvider(name);
  }

  /**
   * 获取可用 Provider
   */
  async getAvailableProvider() {
    return this.providerManager.getAvailableProvider();
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.providerManager.dispose();
    this.cache.clear();
    this.rateLimiter.reset();
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建 LLM Client
 */
export function createLLMClient(config: LLMConfig, logger: any): LLMClient {
  return new LLMClient(config, logger);
}

/**
 * 从环境变量创建 LLM Client
 */
export function createLLMClientFromEnv(logger: any): LLMClient {
  const config: LLMConfig = {
    provider: (process.env.HONEYCOMB_LLM_PROVIDER as any) || 'simulation',
    claude: process.env.HONEYCOMB_LLM_CLAUDE_API_KEY
      ? {
          apiKey: process.env.HONEYCOMB_LLM_CLAUDE_API_KEY,
          model: process.env.HONEYCOMB_LLM_CLAUDE_MODEL,
          baseUrl: process.env.HONEYCOMB_LLM_CLAUDE_BASE_URL,
        }
      : undefined,
    openai: process.env.HONEYCOMB_LLM_OPENAI_API_KEY
      ? {
          apiKey: process.env.HONEYCOMB_LLM_OPENAI_API_KEY,
          model: process.env.HONEYCOMB_LLM_OPENAI_MODEL,
          baseUrl: process.env.HONEYCOMB_LLM_OPENAI_BASE_URL,
        }
      : undefined,
    cache: {
      enabled: process.env.HONEYCOMB_LLM_CACHE_ENABLED === 'true',
      maxSize: parseInt(process.env.HONEYCOMB_LLM_CACHE_MAX_SIZE || '1000'),
      ttl: parseInt(process.env.HONEYCOMB_LLM_CACHE_TTL || '3600000'),
    },
    rateLimit: {
      enabled: process.env.HONEYCOMB_LLM_RATE_LIMIT_ENABLED === 'true',
      requestsPerMinute: parseInt(
        process.env.HONEYCOMB_LLM_RATE_LIMIT_RPM || '60'
      ),
    },
    batch: {
      enabled: process.env.HONEYCOMB_LLM_BATCH_ENABLED === 'true',
      maxBatchSize: parseInt(process.env.HONEYCOMB_LLM_BATCH_MAX_SIZE || '10'),
      maxWaitTime: parseInt(process.env.HONEYCOMB_LLM_BATCH_MAX_WAIT || '100'),
    },
  };

  return new LLMClient(config, logger);
}

// ============================================================
// LLM Metrics
// ============================================================

/**
 * LLM 指标收集器
 */
class LLMMetrics {
  private metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalDuration: 0,
    errors: 0,
  };

  private logger: any;

  constructor(logger: any) {
    this.logger = logger;
  }

  recordCompletion(result: CompletionResult): void {
    this.metrics.totalRequests++;
    this.metrics.totalTokens += result.totalTokens;
    this.metrics.inputTokens += result.inputTokens;
    this.metrics.outputTokens += result.outputTokens;
    if (result.duration) {
      this.metrics.totalDuration += result.duration;
    }
  }

  recordCacheHit(promptLength: number): void {
    this.metrics.cacheHits++;
  }

  recordChunk(deltaLength: number): void {
    this.metrics.totalTokens += deltaLength / 4; // 粗略估算
  }

  recordError(): void {
    this.metrics.errors++;
  }

  getMetrics() {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalDuration: 0,
      errors: 0,
    };
  }

  getSummary() {
    return {
      averageTokensPerRequest:
        this.metrics.totalRequests > 0
          ? this.metrics.totalTokens / this.metrics.totalRequests
          : 0,
      averageDuration:
        this.metrics.totalRequests > 0
          ? this.metrics.totalDuration / this.metrics.totalRequests
          : 0,
      cacheHitRate:
        this.metrics.cacheHits + this.metrics.cacheMisses > 0
          ? this.metrics.cacheHits /
            (this.metrics.cacheHits + this.metrics.cacheMisses)
          : 0,
      errorRate:
        this.metrics.totalRequests > 0
          ? this.metrics.errors / this.metrics.totalRequests
          : 0,
    };
  }
}

// TokenUsage 类型导入
type TokenUsage = import('./types.js').TokenUsage;
