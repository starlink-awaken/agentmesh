import type { ModelDescriptor } from '@agentmesh/core-types';
import type { ModelProvider } from './base.js';
import { healthCheck, httpPost, checkedJson, parseOpenAIResponse } from './base.js';
import type { ChatOptions, ChatResult } from '../types.js';

export class LlamaCppProvider implements ModelProvider {
  readonly name = 'llama-cpp';
  readonly type = 'llama-cpp';
  private instances: { name: string; port: number; modelPath: string }[];

  constructor(instances?: { name: string; port: number; modelPath: string }[]) {
    this.instances = instances || [];
  }

  addInstance(name: string, port: number, modelPath: string): void {
    this.instances.push({ name, port, modelPath });
  }

  async discover(): Promise<ModelDescriptor[]> {
    const models: ModelDescriptor[] = [];
    for (const inst of this.instances) {
      models.push({
        id: `llama-cpp/${inst.name}`,
        name: inst.name,
        provider: 'llama-cpp' as const,
        location: 'local' as const,
        capabilities: ['chat' as const, 'completion' as const],
        contextWindow: 4096,
        isAvailable: await this.isPortAlive(inst.port),
        metadata: { port: inst.port, modelPath: inst.modelPath },
      });
    }
    if (this.instances.length === 0) {
      const ports = [8080, 8081, 8082, 8000];
      const portResults = await Promise.allSettled(ports.map(async p => (await this.isPortAlive(p)) ? p : null));
      for (const r of portResults) {
        if (r.status === 'fulfilled' && r.value) {
          models.push({
            id: `llama-cpp/port-${r.value}`,
            name: `llama.cpp (port ${r.value})`,
            provider: 'llama-cpp' as const,
            location: 'local' as const,
            capabilities: ['chat' as const, 'completion' as const],
            contextWindow: 4096,
            isAvailable: true,
            metadata: { port: r.value },
          });
        }
      }
    }
    return models;
  }

  async health(): Promise<boolean> {
    const checks = this.instances.map(inst => this.isPortAlive(inst.port));
    return (await Promise.all(checks)).some(r => r);
  }

  async chat(model: string, messages: unknown[], options?: ChatOptions): Promise<ChatResult> {
    const port = this.extractPort(model);
    const res = await httpPost(`http://localhost:${port}/v1/chat/completions`, {
      messages, temperature: options?.temperature, max_tokens: options?.maxTokens,
    });
    const body = await checkedJson<any>(res, 'llama.cpp chat');
    return parseOpenAIResponse(body, model);
  }

  private async isPortAlive(port: number): Promise<boolean> {
    return healthCheck(`http://localhost:${port}/health`, undefined, 2000)
      || healthCheck(`http://localhost:${port}/v1/models`, undefined, 2000);
  }

  private extractPort(modelId: string): number {
    const match = modelId.match(/port-(\d+)/);
    return match ? parseInt(match[1]!, 10) : 8080;
  }
}
