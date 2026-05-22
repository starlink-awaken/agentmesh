import type { ModelDescriptor } from '@agentmesh/core-types';
import { OllamaProvider } from '../providers/ollama.js';
import { LMStudioProvider } from '../providers/lm-studio.js';
import { LlamaCppProvider } from '../providers/llama-cpp.js';

/**
 * LocalModelDiscoverer — 本地模型自动发现
 *
 * 扫描本地环境中的所有可用模型服务，包括：
 * - Ollama API（默认端口 11434）
 * - LM Studio API（默认端口 1234）
 * - llama.cpp 实例（常见端口 8080-8000）
 */
export class LocalModelDiscoverer {
  private ollama: OllamaProvider;
  private lmStudio: LMStudioProvider;
  private llamaCpp: LlamaCppProvider;

  constructor(config?: {
    ollamaUrl?: string;
    lmStudioUrl?: string;
    llamaInstances?: { name: string; port: number; modelPath: string }[];
  }) {
    this.ollama = new OllamaProvider(config?.ollamaUrl);
    this.lmStudio = new LMStudioProvider(config?.lmStudioUrl);
    this.llamaCpp = new LlamaCppProvider(config?.llamaInstances);
  }

  /**
   * 发现所有本地模型
   * 依次探测各服务，合并结果去重
   */
  async discoverAll(): Promise<ModelDescriptor[]> {
    const results = await Promise.allSettled([
      this.ollama.discover(),
      this.lmStudio.discover(),
      this.llamaCpp.discover(),
    ]);

    const models: ModelDescriptor[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const model of result.value) {
          if (!seen.has(model.id)) {
            seen.add(model.id);
            models.push(model);
          }
        }
      }
    }

    return models;
  }

  /**
   * 快速健康检查——至少一个服务在线
   */
  async anyAlive(): Promise<boolean> {
    const results = await Promise.all([
      this.ollama.health(),
      this.lmStudio.health(),
      this.llamaCpp.health(),
    ]);
    return results.some(r => r);
  }
}
