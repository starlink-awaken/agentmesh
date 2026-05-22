/**
 * OllamaProvider 测试
 *
 * @author PAI
 */

import { describe, test, expect, beforeEach, vi } from 'bun:test';
import { OllamaProvider } from '../../src/llm/OllamaProvider';
import { LLMError } from '../../src/llm/types';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new OllamaProvider({
      model: 'qwen2.5:7b',
      baseUrl: 'http://localhost:11434',
      temperature: 0.7,
      maxTokens: 1000,
    });
  });

  describe('chat() - 基本调用', () => {
    test('应该成功发送聊天请求并返回响应', async () => {
      const mockResponse = {
        model: 'qwen2.5:7b',
        message: { content: 'Hello, I am Qwen', role: 'assistant' },
        done: true,
        total_duration: 1000000000,
        prompt_eval_count: 10,
        eval_count: 5,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await provider.chat({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toBe('Hello, I am Qwen');
      expect(result.model).toBe('qwen2.5:7b');
      expect(result.finishReason).toBe('stop');
      expect(result.usage?.totalTokens).toBe(15);
    });

    test('应该使用默认 baseUrl', async () => {
      const defaultProvider = new OllamaProvider({
        model: 'llama2',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            model: 'llama2',
            message: { content: 'test', role: 'assistant' },
            done: true,
          }),
      });

      await defaultProvider.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.any(Object)
      );
    });

    test('应该在消息为空时抛出错误', async () => {
      await expect(provider.chat({ messages: [] })).rejects.toThrow(
        'Messages cannot be empty'
      );
    });

    test('应该正确处理 system 消息', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            model: 'qwen2.5:7b',
            message: { content: 'Response', role: 'assistant' },
            done: true,
          }),
      });

      await provider.chat({
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' },
        ],
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody.system).toBe('You are a helpful assistant');
      expect(requestBody.messages).toHaveLength(1);
      expect(requestBody.messages[0].role).toBe('user');
    });

    test('应该在 API 错误时抛出错误', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(
        provider.chat({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow(LLMError);
    });

    test('应该正确映射完成原因为 length', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            model: 'qwen2.5:7b',
            message: { content: 'Partial response', role: 'assistant' },
            done: false,
          }),
      });

      const result = await provider.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.finishReason).toBe('length');
    });
  });

  describe('stream() - 流式输出', () => {
    test('应该成功处理流式响应', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              '{"message":{"content":"Hello"},"done":false}\n'
            )
          );
          controller.enqueue(
            new TextEncoder().encode(
              '{"message":{"content":" World"},"done":false}\n'
            )
          );
          controller.enqueue(
            new TextEncoder().encode('{"message":{"content":""},"done":true}\n')
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
            new TextEncoder().encode('{"message":{"content":"Hi"},"done":false}\n')
          );
          controller.enqueue(
            new TextEncoder().encode('{"message":{"content":""},"done":true}\n')
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
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const gen = provider.stream({
        messages: [{ role: 'user', content: 'test' }],
      });

      await expect(gen.next()).rejects.toThrow(LLMError);
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

  describe('embed() - 嵌入向量', () => {
    test('应该成功返回嵌入向量', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ embedding: [0.1, 0.2, 0.3] }),
      });

      const result = await provider.embed({
        input: 'hello world',
      });

      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
    });

    test('应该支持多个输入', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ embedding: [0.1, 0.2] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ embedding: [0.3, 0.4] }),
        });

      const result = await provider.embed({
        input: ['text1', 'text2'],
      });

      expect(result.embeddings).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('应该使用配置的模型作为默认值', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ embedding: [0.1, 0.2] }),
      });

      await provider.embed({
        input: 'test',
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(requestBody.model).toBe('qwen2.5:7b');
    });

    test('应该在 API 错误时抛出错误', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(provider.embed({ input: 'test' })).rejects.toThrow(LLMError);
    });
  });

  describe('listModels()', () => {
    test('应该成功获取模型列表', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [
              { name: 'llama2:7b' },
              { name: 'qwen2.5:7b' },
              { name: 'mistral:7b' },
            ],
          }),
      });

      const models = await provider.listModels();

      expect(models).toHaveLength(3);
      expect(models).toContain('llama2:7b');
      expect(models).toContain('qwen2.5:7b');
    });

    test('应该在错误时抛出错误', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(provider.listModels()).rejects.toThrow(LLMError);
    });
  });

  describe('isAvailable()', () => {
    test('应该在服务可用时返回 true', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      });

      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    test('应该在服务不可用时返回 false', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const available = await provider.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('setBaseUrl()', () => {
    test('应该能够设置自定义 baseUrl', async () => {
      provider.setBaseUrl('http://192.168.1.100:11434');

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => ({
          model: 'qwen2.5:7b',
          message: { content: 'test', role: 'assistant' },
          done: true,
        }),
      });

      await provider.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://192.168.1.100:11434/api/chat',
        expect.any(Object)
      );
    });
  });

  describe('getModel() / setModel()', () => {
    test('应该返回当前模型', () => {
      expect(provider.getModel()).toBe('qwen2.5:7b');
    });

    test('应该能够设置新模型', () => {
      provider.setModel('llama2:13b');
      expect(provider.getModel()).toBe('llama2:13b');
    });
  });

  describe('capabilities', () => {
    test('应该正确报告能力', () => {
      expect(provider.providerType).toBe('ollama');
      expect(provider.capabilities.streaming).toBe(true);
      expect(provider.capabilities.functionCalling).toBe(false);
      expect(provider.capabilities.embedding).toBe(true);
      expect(provider.capabilities.jsonMode).toBe(false);
    });
  });
});
