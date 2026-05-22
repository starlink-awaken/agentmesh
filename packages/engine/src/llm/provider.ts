/**
 * Honeycomb LLM Integration - Provider Manager
 *
 * Provider Manager 负责管理和选择 LLM Provider。
 * 支持多 Provider 配置、健康检查和自动故障转移。
 *
 * 设计原则：
 * - 插件化：支持动态添加 Provider
 * - 健康检查：定期检查 Provider 可用性
 * - 故障转移：主 Provider 失败时自动切换
 */

import type {
  LLMProvider,
  LLMConfig,
  ProviderConfig,
  ClaudeConfig,
  OpenAIConfig,
} from './types.js';
import { ClaudeProvider } from './claude.js';
import { OpenAIProvider } from './openai.js';
import { SimulationProvider } from './simulation.js';

// ============================================================
// Provider Manager
// ============================================================

/**
 * Provider Manager
 * 管理所有 LLM Provider 的注册、选择和健康检查
 */
export class ProviderManager {
  private providers: Map<string, LLMProvider> = new Map();
  private primaryProvider: string;
  private config: LLMConfig;
  private logger: any;
  private healthCheckInterval?: ReturnType<typeof setInterval>;

  constructor(config: LLMConfig, logger: any) {
    this.config = config;
    this.logger = logger;
    this.primaryProvider = config.provider;

    // 初始化默认 Providers
    this.initializeProviders();

    // 启动健康检查
    this.startHealthCheck();
  }

  /**
   * 获取 Provider（按名称）
   */
  getProvider(name?: string): LLMProvider {
    const providerName = name || this.primaryProvider;

    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    return provider;
  }

  /**
   * 设置主 Provider
   */
  setPrimaryProvider(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Provider not found: ${name}`);
    }
    this.primaryProvider = name;
    this.logger.info('Primary provider changed', { provider: name });
  }

  /**
   * 注册自定义 Provider
   */
  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
    this.logger.info('Provider registered', { name: provider.name, type: provider.type });
  }

  /**
   * 获取所有已注册的 Providers
   */
  getAllProviders(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * 检查 Provider 健康状态
   */
  async checkHealth(providerName?: string): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    if (providerName) {
      const provider = this.providers.get(providerName);
      if (provider) {
        results[providerName] = await provider.isAvailable();
      }
    } else {
      // 使用 forEach 避免迭代器问题
      this.providers.forEach(async (provider, name) => {
        results[name] = await provider.isAvailable();
      });
      // 等待所有异步操作完成
      await Promise.all(
        Array.from(this.providers.entries()).map(async ([name, provider]) => {
          results[name] = await provider.isAvailable();
        })
      );
    }

    return results;
  }

  /**
   * 获取可用的 Provider
   */
  async getAvailableProvider(): Promise<LLMProvider | null> {
    // 首先检查主 Provider
    const primary = this.providers.get(this.primaryProvider);
    if (primary && await primary.isAvailable()) {
      return primary;
    }

    // 检查其他 Providers
    const providerEntries = Array.from(this.providers.entries());
    for (const [name, provider] of providerEntries) {
      if (name !== this.primaryProvider && await provider.isAvailable()) {
        this.logger.warn('Primary provider unavailable, using fallback', {
          primary: this.primaryProvider,
          fallback: name,
        });
        return provider;
      }
    }

    return null;
  }

  /**
   * 停止健康检查
   */
  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.stopHealthCheck();
    this.providers.clear();
  }

  // ==================== 私有方法 ====================

  /**
   * 初始化默认 Providers
   */
  private initializeProviders(): void {
    // 初始化 Claude Provider
    if (this.config.claude?.apiKey) {
      const claude = new ClaudeProvider(this.config.claude, this.logger);
      this.providers.set('claude', claude);
    }

    // 初始化 OpenAI Provider
    if (this.config.openai?.apiKey) {
      const openai = new OpenAIProvider(this.config.openai, this.logger);
      this.providers.set('openai', openai);
    }

    // 初始化模拟 Provider（始终可用）
    const simulation = new SimulationProvider({}, this.logger);
    this.providers.set('simulation', simulation);

    this.logger.info('Providers initialized', {
      available: Array.from(this.providers.keys()),
      primary: this.primaryProvider,
    });
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    // 每 5 分钟检查一次
    this.healthCheckInterval = setInterval(async () => {
      const health = await this.checkHealth();
      this.logger.debug('Provider health check', health);
    }, 5 * 60 * 1000);
  }
}

// ProviderManager 已通过 export class 导出，无需重复导出
