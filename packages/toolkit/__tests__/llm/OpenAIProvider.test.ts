/**
 * OpenAIProvider 测试
 *
 * @author PAI
 */

import { describe, test, expect, beforeEach, vi } from 'bun:test';
import { OpenAIProvider } from '../../src/llm/OpenAIProvider';
import { LLMError } from '../../src/llm/types';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new OpenAIProvider({
      model: 'gpt-4o',
      apiKey: 'test-api-key',
      temperature: 0.7,
      maxTokens: 1000,
    });
  });

  describe('chat() - 基本调用', () => {
    test('应该成功发送聊天请求并返回响应', async () => {
      const mockResponse = {
        id: 'chatcmpl-test123',
        model: 'gpt-4o',
        choices: [
          {
            message: { content: 'Hello, I am GPT-4' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await provider.chat({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toBe('Hello, I am GPT-4');
      expect(result.model).toBe('gpt-4o');
      expect(result.finishReason).toBe('stop');
      // 注意：OpenAIProvider 直接返回 API 原始 usage 格式，字段为下划线格式
      expect(result.usage?.total_tokens).toBe(15);
    });

    test('应该包含正确的请求头', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-test',
          model: 'gpt-4o',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      });

      await provider.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    });

    test('应该使用自定义 baseUrl', async () => {
      const customProvider = new OpenAIProvider({
        model: 'gpt-4o',
        apiKey: 'test-key',
        baseUrl: 'https://custom.openai.com/v1',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-test',
          model: 'gpt-4o',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      });

      await customProvider.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.openai.com/v1/chat/completions',
        expect.any(Object)
      );
    });

    test('应该在没有 API key 时抛出错误', async () => {
      const providerNoKey = new OpenAIProvider({
        model: 'gpt-4o',
      });

      await expect(
        providerNoKey.chat({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow('OpenAI API key is required');
    });

    test('应该在消息为空时抛出错误', async () => {
      await expect(provider.chat({ messages: [] })).rejects.toThrow(
        'Messages cannot be empty'
      );
    });
  });

  describe('stream() - 流式输出', () => {
    test('应该成功处理流式响应', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n'
            )
          );
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":" World"},"finish_reason":"stop"}]}\n\n'
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
      for await (const chunk of provider.stream({
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
        chunks.push(chunk.content);
      }

      expect(chunks.join('')).toBe('Hello World');
    });

    test('应该在流式响应时调用 onChunk 回调', async () => {
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

      const onChunk = vi.fn();
      for await (const _chunk of provider.stream({
        messages: [{ role: 'user', content: 'Hi' }],
        onChunk,
      })) {
        // consume
      }

      expect(onChunk).toHaveBeenCalled();
    });

    test('应该在流式响应失败时抛出错误', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Invalid API key' } }),
      });

      const gen = provider.stream({
        messages: [{ role: 'user', content: 'test' }],
      });

      await expect(gen.next()).rejects.toThrow();
    });
  });

  describe('embed() - 嵌入向量', () => {
    test('应该成功返回嵌入向量', async () => {
      const mockResponse = {
        model: 'text-embedding-3-small',
        data: [
          { embedding: [0.1, 0.2, 0.3] },
          { embedding: [0.4, 0.5, 0.6] },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 0,
          total_tokens: 10,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await provider.embed({
        input: ['hello world', 'test text'],
      });

      expect(result.embeddings).toHaveLength(2);
      expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
      expect(result.model).toBe('text-embedding-3-small');
    });

    test('应该支持单个字符串输入', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            model: 'text-embedding-3-small',
            data: [{ embedding: [0.1, 0.2, 0.3] }],
            usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
          }),
      });

      const result = await provider.embed({
        input: 'single text',
      });

      expect(result.embeddings).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"input":"single text"'),
        })
      );
    });

    test('应该在没有 API key 时抛出错误', async () => {
      const providerNoKey = new OpenAIProvider({
        model: 'gpt-4o',
      });

      await expect(providerNoKey.embed({ input: 'test' })).rejects.toThrow(
        'OpenAI API key is required'
      );
    });
  });

  describe('function calling - 函数调用', () => {
    test('应该正确处理函数调用响应', async () => {
      const mockResponse = {
        id: 'chatcmpl-test123',
        model: 'gpt-4o',
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_abc123',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location":"Beijing"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await provider.chat({
        messages: [{ role: 'user', content: 'What is the weather in Beijing?' }],
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather information',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string', description: 'City name' },
              },
              required: ['location'],
            },
          },
        ],
      });

      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls?.[0].function.name).toBe('get_weather');
      expect(result.toolCalls?.[0].function.arguments).toBe('{"location":"Beijing"}');
      expect(result.finishReason).toBe('tool_calls');
    });
  });

  describe('错误处理', () => {
    test('应该在 API 返回错误时抛出 LLMError', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            error: { message: 'Invalid API key', code: 'invalid_api_key' },
          }),
      });

      await expect(
        provider.chat({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow(LLMError);
    });

    test('应该在网络错误时抛出 LLMError', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        provider.chat({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow(LLMError);
    });

    test('应该在没有响应体时抛出错误', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: null,
      });

      const gen = provider.stream({
        messages: [{ role: 'user', content: 'test' }],
      });

      await expect(gen.next()).rejects.toThrow('No response body');
    });
  });

  describe('getModel() / setModel()', () => {
    test('应该返回当前模型', () => {
      expect(provider.getModel()).toBe('gpt-4o');
    });

    test('应该能够设置新模型', () => {
      provider.setModel('gpt-3.5-turbo');
      expect(provider.getModel()).toBe('gpt-3.5-turbo');
    });
  });

  describe('capabilities', () => {
    test('应该正确报告能力', () => {
      expect(provider.providerType).toBe('openai');
      expect(provider.capabilities.streaming).toBe(true);
      expect(provider.capabilities.functionCalling).toBe(true);
      expect(provider.capabilities.embedding).toBe(true);
      expect(provider.capabilities.jsonMode).toBe(true);
    });
  });

  describe('isAvailable()', () => {
    test('应该在 API 可用时返回 true', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
      });

      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    test('应该在 API 不可用时返回 false', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const available = await provider.isAvailable();
      expect(available).toBe(false);
    });
  });
});
