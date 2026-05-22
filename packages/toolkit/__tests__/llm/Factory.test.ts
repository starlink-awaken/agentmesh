/**
 * LLM Factory 测试
 *
 * @author PAI
 */

import { describe, test, expect, beforeEach, vi } from 'bun:test';
import {
  createLLMClient,
  getDefaultModel,
  getProviderCapabilities,
  chat,
  stream,
} from '../../src/llm/index';
import { OpenAIProvider } from '../../src/llm/OpenAIProvider';
import { AnthropicProvider } from '../../src/llm/AnthropicProvider';
import { OllamaProvider } from '../../src/llm/OllamaProvider';
import { LLMError } from '../../src/llm/types';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LLM Factory', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('createLLMClient()', () => {
    test('应该创建 OpenAI Provider', () => {
      const client = createLLMClient({
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key',
      });

      expect(client).toBeInstanceOf(OpenAIProvider);
      expect(client.getModel()).toBe('gpt-4o');
    });

    test('应该创建 Anthropic Provider', () => {
      const client = createLLMClient({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20251901',
        apiKey: 'test-key',
      });

      expect(client).toBeInstanceOf(AnthropicProvider);
      expect(client.getModel()).toBe('claude-sonnet-4-5-20251901');
    });

    test('应该创建 Ollama Provider', () => {
      const client = createLLMClient({
        provider: 'ollama',
        model: 'qwen2.5:7b',
        baseUrl: 'http://localhost:11434',
      });

      expect(client).toBeInstanceOf(OllamaProvider);
      expect(client.getModel()).toBe('qwen2.5:7b');
    });

    test('应该在未知 Provider 时抛出错误', () => {
      expect(() =>
        createLLMClient({
          provider: 'unknown' as any,
          model: 'test',
        })
      ).toThrow('Unknown provider: unknown');
    });

    test('应该在未实现的 Provider 时抛出错误', () => {
      expect(() =>
        createLLMClient({
          provider: 'unknown' as any,
          model: 'test-model',
        })
      ).toThrow('Unknown provider: unknown');
    });

    test('应该正确传递配置', () => {
      const client = createLLMClient({
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'test-key',
        temperature: 0.5,
        maxTokens: 2000,
        baseUrl: 'https://custom.openai.com/v1',
      });

      expect(client).toBeInstanceOf(OpenAIProvider);
    });
  });

  describe('getDefaultModel()', () => {
    test('应该返回 OpenAI 默认模型', () => {
      expect(getDefaultModel('openai')).toBe('gpt-4o');
    });

    test('应该返回 Anthropic 默认模型', () => {
      expect(getDefaultModel('anthropic')).toBe('claude-sonnet-4-5-20251901');
    });

    test('应该返回 Ollama 默认模型', () => {
      expect(getDefaultModel('ollama')).toBe('llama2');
    });

    test('应该返回 Google 默认模型', () => {
      expect(getDefaultModel('google')).toBe('gemini-1.5-pro');
    });
  });

  describe('getProviderCapabilities()', () => {
    test('应该返回 OpenAI 能力', () => {
      const caps = getProviderCapabilities('openai');
      expect(caps).toEqual({
        streaming: true,
        functionCalling: true,
        embedding: true,
        jsonMode: true,
        maxContextLength: 128000,
      });
    });

    test('应该返回 Anthropic 能力', () => {
      const caps = getProviderCapabilities('anthropic');
      expect(caps).toEqual({
        streaming: true,
        functionCalling: true,
        embedding: false,
        jsonMode: true,
        maxContextLength: 200000,
      });
    });

    test('应该返回 Ollama 能力', () => {
      const caps = getProviderCapabilities('ollama');
      expect(caps).toEqual({
        streaming: true,
        functionCalling: false,
        embedding: true,
        jsonMode: false,
      });
    });

    test('应该返回 Google 能力', () => {
      const caps = getProviderCapabilities('google');
      expect(caps).toEqual({
        streaming: true,
        functionCalling: true,
        embedding: true,
        jsonMode: true,
        maxContextLength: 1000000,
      });
    });

    test('应该在未知 Provider 时返回 null', () => {
      expect(getProviderCapabilities('unknown' as any)).toBeNull();
    });
  });

  describe('chat() 便捷函数', () => {
    test('应该成功调用 chat 并返回结果', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-test',
            model: 'gpt-4o',
            choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
      });

      const result = await chat('openai', [
        { role: 'user', content: 'Hello' },
      ], { apiKey: 'test-key' });

      expect(result.content).toBe('Hello');
    });

    test('应该使用默认模型', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-test',
            model: 'gpt-4o',
            choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
      });

      await chat('openai', [{ role: 'user', content: 'test' }], { apiKey: 'test-key' });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody.model).toBe('gpt-4o');
    });

    test('应该允许覆盖配置', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-test',
            model: 'gpt-3.5-turbo',
            choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
      });

      await chat('openai', [{ role: 'user', content: 'test' }], {
        model: 'gpt-3.5-turbo',
        apiKey: 'custom-key',
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody.model).toBe('gpt-3.5-turbo');
    });
  });

  describe('stream() 便捷函数', () => {
    test('应该成功调用 stream 并返回生成器', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n'
            )
          );
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const chunks: string[] = [];
      for await (const chunk of stream('openai', [
        { role: 'user', content: 'Hi' },
      ], { apiKey: 'test-key' })) {
        chunks.push(chunk.content);
      }

      expect(chunks.join('')).toBe('Hi');
    });

    test('应该使用默认模型', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"test"},"finish_reason":null}]}\n\n'
            )
          );
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      // consume the stream
      for await (const _chunk of stream('openai', [{ role: 'user', content: 'test' }], { apiKey: 'test-key' })) {
        // empty
      }

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody.model).toBe('gpt-4o');
    });
  });
});

describe('LLMError', () => {
  test('应该正确创建错误', () => {
    const error = new LLMError('Test error', 'TEST_CODE', 500);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.status).toBe(500);
  });

  test('应该包含原始错误', () => {
    const originalError = new Error('Original');
    const error = new LLMError('Test', 'CODE', undefined, originalError);
    expect(error.originalError).toBe(originalError);
  });
});

describe('hasCapability()', () => {
  test('应该正确检查能力', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'chatcmpl-test',
          model: 'gpt-4o',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
    });

    const { hasCapability } = await import('../../src/llm/LLMClient');
    const client = new OpenAIProvider({ model: 'gpt-4o', apiKey: 'test' });

    expect(hasCapability(client, 'streaming')).toBe(true);
    expect(hasCapability(client, 'functionCalling')).toBe(true);
    expect(hasCapability(client, 'embedding')).toBe(true);
    expect(hasCapability(client, 'jsonMode')).toBe(true);
  });
});
