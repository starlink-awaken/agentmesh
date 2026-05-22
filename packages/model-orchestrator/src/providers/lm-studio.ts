import type { ModelDescriptor } from '@agentmesh/core-types';
import type { ModelProvider } from './base.js';
import { healthCheck, httpPost, checkedJson, parseOpenAIResponse } from './base.js';
import type { ChatOptions, ChatResult } from '../types.js';

export class LMStudioProvider implements ModelProvider {
  readonly name = 'lm-studio';
  readonly type = 'lm-studio';
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:1234') {
    this.baseUrl = baseUrl;
  }

  async discover(): Promise<ModelDescriptor[]> {
    const url = `${this.baseUrl}/v1/models`;
    if (!(await healthCheck(url))) return [];
    const body = await (await fetch(url)).json() as { data?: { id: string }[] };
    return (body.data || []).map(m => ({
      id: `lm-studio/${m.id}`,
      name: m.id,
      provider: 'lm-studio' as const,
      location: 'local' as const,
      capabilities: ['chat' as const, 'completion' as const, 'streaming' as const],
      contextWindow: 4096,
      isAvailable: true,
    }));
  }

  async health(): Promise<boolean> {
    return healthCheck(`${this.baseUrl}/v1/models`);
  }

  async chat(model: string, messages: unknown[], options?: ChatOptions): Promise<ChatResult> {
    const modelName = model.replace('lm-studio/', '');
    const res = await httpPost(
      `${this.baseUrl}/v1/chat/completions`,
      { model: modelName, messages, temperature: options?.temperature, max_tokens: options?.maxTokens },
    );
    const body = await checkedJson<any>(res, 'LM Studio chat');
    return parseOpenAIResponse(body, model);
  }
}
