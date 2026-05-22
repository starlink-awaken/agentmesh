import type { ModelDescriptor } from '@agentmesh/core-types';
import type { ModelProvider } from './base.js';
import { httpPost, checkedJson, healthCheck, parseOpenAIResponse } from './base.js';
import type { ChatOptions, ChatResult } from '../types.js';

export class OpenRouterProvider implements ModelProvider {
  readonly name = 'openrouter';
  readonly type = 'openrouter';
  private authHeader: string;

  constructor(apiKey: string) {
    this.authHeader = `Bearer ${apiKey}`;
  }

  async discover(): Promise<ModelDescriptor[]> {
    const url = 'https://openrouter.ai/api/v1/models';
    if (!(await healthCheck(url, { Authorization: this.authHeader }, 5000))) return [];
    const body = await (await fetch(url, { headers: { Authorization: this.authHeader } })).json() as { data: { id: string; name: string; context_length: number; pricing: { prompt: string; completion: string } }[] };
    return body.data.map(m => ({
      id: `openrouter/${m.id}`,
      name: m.name || m.id,
      provider: 'openrouter' as const,
      location: 'cloud' as const,
      capabilities: ['chat' as const, 'streaming' as const],
      contextWindow: m.context_length || 4096,
      costPer1KTokens: { input: parseFloat(m.pricing?.prompt || '0') * 1000, output: parseFloat(m.pricing?.completion || '0') * 1000 },
      isAvailable: true,
      metadata: { originalId: m.id },
    }));
  }

  async health(): Promise<boolean> {
    return healthCheck('https://openrouter.ai/api/v1/models', { Authorization: this.authHeader }, 5000);
  }

  async chat(model: string, messages: unknown[], options?: ChatOptions): Promise<ChatResult> {
    const res = await httpPost(
      'https://openrouter.ai/api/v1/chat/completions',
      { model: model.replace('openrouter/', ''), messages, temperature: options?.temperature, max_tokens: options?.maxTokens },
      this.authHeader,
    );
    const body = await checkedJson<any>(res, 'OpenRouter chat');
    return parseOpenAIResponse(body, model);
  }
}
