/**
 * GoogleProvider 测试
 *
 * @author PAI
 */

import { describe, test, expect, beforeEach, vi } from 'bun:test';
import { GoogleProvider } from '../../src/llm/GoogleProvider';
import { LLMError } from '../../src/llm/types';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('GoogleProvider', () => {
  let provider: GoogleProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new GoogleProvider({
      model: 'gemini-1.5-pro',
      apiKey: 'test-api-key',
      temperature: 0.7,
      maxTokens: 1000,
    });
  });

  describe('构造函数和基本属性', () => {
    test('应该正确设置 providerType', () => {
      expect(provider.providerType).toBe('google');
    });

    test('应该正确报告能力', () => {
      expect(provider.capabilities.streaming).toBe(true);
      expect(provider.capabilities.functionCalling).toBe(true);
      expect(provider.capabilities.embedding).toBe(true);
      expect(provider.capabilities.jsonMode).toBe(true);
      expect(provider.capabilities.maxContextLength).toBe(1000000);
    });

    test('应该支持 Gemini 模型列表', () => {
      expect(provider.capabilities.supportedModels).toContain('gemini-1.5-pro');
      expect(provider.capabilities.supportedModels).toContain('gemini-1.5-flash');
      expect(provider.capabilities.supportedModels).toContain('gemini-2.0-flash-exp');
      expect(provider.capabilities.supportedModels).toContain('gemini-2.0-flash-thinking-exp');
    });
  });

  describe('chat() - 基本调用', () => {
    test('应该成功发送聊天请求并返回响应', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello, I am Gemini' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await provider.chat({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toBe('Hello, I am Gemini');
      expect(result.model).toBe('gemini-1.5-pro');
      expect(result.finishReason).toBe('stop');
      expect(result.usage?.promptTokens).toBe(10);
      expect(result.usage?.completionTokens).toBe(5);
      expect(result.usage?.totalTokens).toBe(15);
    });

    test('应该包含正确的请求头', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: { parts: [{ text: 'test' }] },
            finishReason: 'STOP',
          }],
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 1,
            totalTokenCount: 2,
          },
        }),
      });

      await provider.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=test-api-key',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    test('应该使用自定义 baseUrl', async () => {
      const customProvider = new GoogleProvider({
        model: 'gemini-1.5-pro',
        apiKey: 'test-key',
        baseUrl: 'https://custom.google.com/v1beta',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: { parts: [{ text: 'test' }] },
            finishReason: 'STOP',
          }],
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 1,
            totalTokenCount: 2,
          },
        }),
      });

      await customProvider.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.google.com/v1beta/models/gemini-1.5-pro:generateContent?key=test-key',
        expect.any(Object)
      );
    });

    test('应该在没有 API key 时抛出错误', async () => {
      const providerNoKey = new GoogleProvider({
        model: 'gemini-1.5-pro',
      });

      await expect(
        providerNoKey.chat({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow('Google AI API key is required');
    });

    test('应该在消息为空时抛出错误', async () => {
      await expect(provider.chat({ messages: [] })).rejects.toThrow(
        'Messages cannot be empty'
      );
    });

    test('应该正确处理系统消息', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: { parts: [{ text: 'I am a helpful assistant' }] },
            finishReason: 'STOP',
          }],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 5,
            totalTokenCount: 10,
          },
        }),
      });

      const result = await provider.chat({
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' },
        ],
      });

      expect(result.content).toBe('I am a helpful assistant');
    });
  });

  describe('stream() - 流式输出', () => {
    test('应该成功处理流式响应', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              '{"candidates":[{"content":{"parts":[{"text":"Hello"}]},"finishReason":null}]}\n'
            )
          );
          controller.enqueue(
            new TextEncoder().encode(
              '{"candidates":[{"content":{"parts":[{"text":" World"}]},"finishReason":"STOP"}]}\n'
            )
          );
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
              '{"candidates":[{"content":{"parts":[{"text":"Hi"}]},"finishReason":null}]}\n'
            )
          );
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

  describe('function calling - 函数调用', () => {
    test('应该正确处理函数调用响应', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'get_weather',
                    args: { location: 'Beijing' },
                  },
                },
              ],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 50,
          candidatesTokenCount: 30,
          totalTokenCount: 80,
        },
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
      expect(result.finishReason).toBe('stop');
    });
  });

  describe('embed() - 嵌入向量', () => {
    test('应该成功返回嵌入向量', async () => {
      const mockResponse = {
        embedding: {
          values: [0.1, 0.2, 0.3, 0.4, 0.5],
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await provider.embed({
        input: 'hello world',
      });

      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
      expect(result.model).toBe('text-embedding-004');
    });

    test('应该支持多个文本输入', async () => {
      const mockResponse = {
        embeddings: [
          { values: [0.1, 0.2, 0.3] },
          { values: [0.4, 0.5, 0.6] },
        ],
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
      expect(result.embeddings[1]).toEqual([0.4, 0.5, 0.6]);
    });

    test('应该在没有 API key 时抛出错误', async () => {
      const providerNoKey = new GoogleProvider({
        model: 'gemini-1.5-pro',
      });

      await expect(providerNoKey.embed({ input: 'test' })).rejects.toThrow(
        'Google AI API key is required'
      );
    });
  });

  describe('错误处理', () => {
    test('应该在 API 返回错误时抛出 LLMError', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            error: { message: 'Invalid API key', code: 400 },
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
      expect(provider.getModel()).toBe('gemini-1.5-pro');
    });

    test('应该能够设置新模型', () => {
      provider.setModel('gemini-1.5-flash');
      expect(provider.getModel()).toBe('gemini-1.5-flash');
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