import type { ModelDescriptor } from '@agentmesh/core-types';
import type { ModelProvider } from './base.js';
import { healthCheck, httpPost, checkedJson, parseOllamaResponse } from './base.js';
import type { ChatOptions, ChatResult, StreamChunk } from '../types.js';

export class OllamaProvider implements ModelProvider {
  readonly name = 'ollama';
  readonly type = 'ollama';
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  async discover(): Promise<ModelDescriptor[]> {
    const url = `${this.baseUrl}/api/tags`;
    const res = await healthCheck(url, undefined, 3000);
    if (!res) return [];
    const body = await (await fetch(url)).json() as { models?: { name: string; modified_at: string; size: number }[] };
    return (body.models || []).map(m => ({
      id: `ollama/${m.name}`,
      name: m.name,
      provider: 'ollama' as const,
      location: 'local' as const,
      capabilities: ['chat' as const, 'streaming' as const],
      contextWindow: 4096,
      isAvailable: true,
      metadata: { size: m.size, modifiedAt: m.modified_at },
    }));
  }

  async health(): Promise<boolean> {
    return healthCheck(`${this.baseUrl}/api/tags`);
  }

  async chat(model: string, messages: unknown[], options?: ChatOptions): Promise<ChatResult> {
    const res = await httpPost(
      `${this.baseUrl}/api/chat`,
      { model: model.replace('ollama/', ''), messages, stream: false, options: { temperature: options?.temperature } },
      undefined,
      options?.signal ? undefined : 60000
    );
    const body = await checkedJson<any>(res, 'Ollama chat');
    return parseOllamaResponse(body, model);
  }

  async *stream(model: string, messages: unknown[], options?: ChatOptions): AsyncIterable<StreamChunk> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model.replace('ollama/', ''), messages, stream: true }),
      signal: options?.signal,
    });
    if (!res.ok) throw new Error(`Ollama stream failed: ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          yield { id: `ollama-${Date.now()}`, model, content: data.message?.content || '', finishReason: data.done ? 'stop' : null };
        } catch { /* skip malformed lines */ }
      }
    }
  }
}
