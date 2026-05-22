import type { ModelDescriptor } from '@agentmesh/core-types';
import type { ModelProvider } from './providers/base.js';
import type { ChatOptions, ChatResult, StreamChunk } from './types.js';

/**
 * ModelRegistry — 模型注册表
 *
 * 管理所有已发现的模型及其 Provider。
 */
export class ModelRegistry {
  private providers = new Map<string, ModelProvider>();
  private models = new Map<string, { descriptor: ModelDescriptor; providerName: string }>();

  /** 注册一个 Provider */
  register(provider: ModelProvider): void {
    this.providers.set(provider.name, provider);
  }

  /** 注册多个 Provider */
  registerMany(providers: ModelProvider[]): void {
    for (const p of providers) this.register(p);
  }

  /** 从所有 Provider 发现并注册模型（并行） */
  async refresh(): Promise<ModelDescriptor[]> {
    this.models.clear();
    const all: ModelDescriptor[] = [];
    const entries = Array.from(this.providers.entries());

    const results = await Promise.allSettled(
      entries.map(async ([name, provider]) => {
        const discovered = await provider.discover();
        return { name, discovered };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const m of result.value.discovered) {
          this.models.set(m.id, { descriptor: m, providerName: result.value.name });
          all.push(m);
        }
      } else {
        console.warn('[ModelRegistry] discover failed:', result.reason);
      }
    }

    return all;
  }

  /** 获取所有模型 */
  getAll(): ModelDescriptor[] {
    return Array.from(this.models.values()).map(e => e.descriptor);
  }

  /** 获取指定模型 */
  get(modelId: string): ModelDescriptor | undefined {
    return this.models.get(modelId)?.descriptor;
  }

  /** 调用模型（自动 release 负载计数） */
  async chat(modelId: string, messages: unknown[], options?: ChatOptions): Promise<ChatResult | null> {
    const entry = this.models.get(modelId);
    if (!entry) return null;
    const provider = this.providers.get(entry.providerName);
    if (!provider) return null;
    try {
      return await provider.chat(modelId, messages, options);
    } finally {
      this.schedulerRef?.releaseLoad(modelId);
    }
  }

  /**
   * 流式调用模型。
   * 如果 Provider 支持 stream()，则委托给它；否则回退到 chat() 包装为单块流。
   */
  async *chatStream(modelId: string, messages: unknown[], options?: ChatOptions): AsyncIterable<StreamChunk> {
    const entry = this.models.get(modelId);
    if (!entry) throw new Error(`Model ${modelId} not found`);
    const provider = this.providers.get(entry.providerName);
    if (!provider) throw new Error(`Provider ${entry.providerName} not found`);
    if (provider.stream) {
      yield* provider.stream(modelId, messages, options);
    } else {
      const result = await provider.chat(modelId, messages, options);
      yield { id: result.id, model: result.model, content: result.content, finishReason: result.finishReason };
    }
  }

  /** 关联调度器，用于 load tracking */
  private schedulerRef?: import('./scheduler.js').ModelScheduler;

  setScheduler(s: import('./scheduler.js').ModelScheduler): void {
    this.schedulerRef = s;
  }

  /** 获取模型所在的 Provider */
  getProvider(modelId: string): ModelProvider | undefined {
    const entry = this.models.get(modelId);
    if (!entry) return undefined;
    return this.providers.get(entry.providerName);
  }

  /** 获取所有已注册 Provider */
  getProviders(): ModelProvider[] {
    return Array.from(this.providers.values());
  }

  /** 健康检查指定 Provider */
  async healthCheck(providerName: string): Promise<boolean> {
    const provider = this.providers.get(providerName);
    if (!provider) return false;
    return provider.health();
  }
}
