import type { ModelDescriptor } from '@agentmesh/core-types';
import type { ModelProvider } from './base.js';
import { httpPost, checkedJson, healthCheck, parseOpenAIResponse } from './base.js';
import type { ChatOptions, ChatResult } from '../types.js';

export class OpenAIProvider implements ModelProvider {
  readonly name = 'openai';
  readonly type = 'openai';
  private baseUrl: string;
  private authHeader: string;

  constructor(apiKey: string, baseUrl = 'https://api.openai.com/v1') {
    this.baseUrl = baseUrl;
    this.authHeader = `Bearer ${apiKey}`;
  }

  async discover(): Promise<ModelDescriptor[]> {
    const url = `${this.baseUrl}/models`;
    if (!(await healthCheck(url, { Authorization: this.authHeader }, 5000))) return [];
    const body = await (await fetch(url, { headers: { Authorization: this.authHeader } })).json() as { data: { id: string; owned_by: string }[] };
    return body.data.map(m => ({
      id: `openai/${m.id}`,
      name: m.id,
      provider: 'openai' as const,
      location: 'cloud' as const,
      capabilities: ['chat' as const, 'completion' as const, 'streaming' as const],
      contextWindow: m.id.includes('gpt-4') ? 128000 : 32000,
      isAvailable: true,
      costPer1KTokens: this.costFor(m.id),
      metadata: { ownedBy: m.owned_by },
    }));
  }

  async health(): Promise<boolean> {
    return healthCheck(`${this.baseUrl}/models`, { Authorization: this.authHeader }, 5000);
  }

  async chat(model: string, messages: unknown[], options?: ChatOptions): Promise<ChatResult> {
    const res = await httpPost(
      `${this.baseUrl}/chat/completions`,
      { model: model.replace('openai/', ''), messages, temperature: options?.temperature, max_tokens: options?.maxTokens },
      this.authHeader,
    );
    const body = await checkedJson<any>(res, 'OpenAI chat');
    return parseOpenAIResponse(body, model);
  }

  private costFor(modelId: string): { input: number; output: number } {
    if (modelId.includes('gpt-4o')) return { input: 0.0025, output: 0.01 };
    if (modelId.includes('gpt-4')) return { input: 0.03, output: 0.06 };
    if (modelId.includes('gpt-3.5')) return { input: 0.0005, output: 0.0015 };
    return { input: 0, output: 0 };
  }
}
