import type { ModelDescriptor } from '@agentmesh/core-types';
import type { ModelProvider } from './base.js';
import { httpPost, checkedJson, healthCheck, parseAnthropicResponse } from './base.js';
import type { ChatOptions, ChatResult } from '../types.js';

export class AnthropicProvider implements ModelProvider {
  readonly name = 'anthropic';
  readonly type = 'anthropic';
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.anthropic.com/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async discover(): Promise<ModelDescriptor[]> {
    const known = [
      { id: 'claude-opus-4-6', ctx: 200000, cost: { input: 0.015, output: 0.075 } },
      { id: 'claude-sonnet-4-6', ctx: 200000, cost: { input: 0.003, output: 0.015 } },
      { id: 'claude-haiku-4-5', ctx: 200000, cost: { input: 0.0008, output: 0.004 } },
    ];
    return known.map(m => ({
      id: `anthropic/${m.id}`,
      name: m.id,
      provider: 'anthropic' as const,
      location: 'cloud' as const,
      capabilities: ['chat' as const, 'streaming' as const, 'tools' as const],
      contextWindow: m.ctx,
      costPer1KTokens: m.cost,
      isAvailable: true,
    }));
  }

  async health(): Promise<boolean> {
    return healthCheck(`${this.baseUrl}/models`,
      { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' }, 5000);
  }

  async chat(model: string, messages: unknown[], options?: ChatOptions): Promise<ChatResult> {
    const msgs = messages as { role: string; content: string }[];
    let systemMsg: string | undefined;
    const chatMessages: { role: string; content: string }[] = [];
    for (const m of msgs) {
      if (m.role === 'system') systemMsg = m.content;
      else chatMessages.push(m);
    }

    const body: Record<string, unknown> = {
      model: model.replace('anthropic/', ''),
      max_tokens: options?.maxTokens || 4096,
      messages: chatMessages,
    };
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (systemMsg) body.system = systemMsg;

    const res = await httpPost(`${this.baseUrl}/messages`, body, undefined);
    const json = await checkedJson<any>(res, 'Anthropic chat');
    return parseAnthropicResponse(json, model);
  }
}
