/**
 * AnthropicProvider 测试
 *
 * @author PAI
 */

import { describe, test, expect, beforeEach, vi } from 'bun:test';
import { AnthropicProvider } from '../../src/llm/AnthropicProvider';
import { LLMError } from '../../src/llm/types';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new AnthropicProvider({
      model: 'claude-sonnet-4-5-20251901',
      apiKey: 'test-anthropic-key',
      temperature: 0.7,
      maxTokens: 1000,
    });
  });

  describe('chat() - 基本调用', () => {
    test('应该成功发送聊天请求并返回响应', async () => {
      const mockResponse = {
        id: 'msg_test123',
        model: 'claude-sonnet-4-5-20251901',
        content: [
          { type: 'text', text: 'Hello, I am Claude' },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await provider.chat({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toBe('Hello, I am Claude');
      expect(result.model).toBe('claude-sonnet-4-5-20251901');
      expect(result.finishReason).toBe('stop');
      expect(result.usage?.totalTokens).toBe(15);
    });

    test('应该包含正确的请求头', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'msg_test',
            model: 'claude-sonnet-4-5-20251901',
            content: [{ type: 'text', text: 'test' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
      });

      await provider.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-api-key': 'test-anthropic-key',
            'anthropic-version': '2023-06-01',
          }),
        })
      );
    });

    test('应该使用自定义 baseUrl', async () => {
      const customProvider = new AnthropicProvider({
        model: 'claude-sonnet-4-5-20251901',
        apiKey: 'test-key',
        baseUrl: 'https://custom.anthropic.com/v1',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'msg_test',
            model: 'claude-sonnet-4-5-20251901',
            content: [{ type: 'text', text: 'test' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
      });

      await customProvider.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.anthropic.com/v1/messages',
        expect.any(Object)
      );
    });

    test('应该在没有 API key 时抛出错误', async () => {
      const providerNoKey = new AnthropicProvider({
        model: 'claude-sonnet-4-5-20251901',
      });

      await expect(
        providerNoKey.chat({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow('Anthropic API key is required');
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
            id: 'msg_test',
            model: 'claude-sonnet-4-5-20251901',
            content: [{ type: 'text', text: 'Response' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 5 },
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

    test('应该正确处理工具调用响应', async () => {
      const mockResponse = {
        id: 'msg_test123',
        model: 'claude-sonnet-4-5-20251901',
        content: [
          { type: 'tool_use', id: 'toolu_abc', name: 'get_weather', input: { location: 'Beijing' } },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 50, output_tokens: 30 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await provider.chat({
        messages: [{ role: 'user', content: 'What is the weather in Beijing?' }],
      });

      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls?.[0].function.name).toBe('get_weather');
      expect(result.toolCalls?.[0].function.arguments).toBe('{"location":"Beijing"}');
      expect(result.finishReason).toBe('tool_calls');
    });

    test('应该正确映射停止原因', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'msg_test',
            model: 'claude-sonnet-4-5-20251901',
            content: [{ type: 'text', text: 'test' }],
            stop_reason: 'max_tokens',
            usage: { input_tokens: 1, output_tokens: 1 },
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
              'data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\n'
            )
          );
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"type":"content_block_delta","delta":{"text":" World"}}\n\n'
            )
          );
          controller.enqueue(
            new TextEncoder().encode('data: {"type":"message_stop"}\n\n')
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
              'data: {"type":"content_block_delta","delta":{"text":"Hi"}}\n\n'
            )
          );
          controller.enqueue(
            new TextEncoder().encode('data: {"type":"message_stop"}\n\n')
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
    test('应该在调用时抛出不支持错误', async () => {
      await expect(provider.embed({ input: 'test' })).rejects.toThrow(
        'Anthropic does not support embedding'
      );
    });
  });

  describe('错误处理', () => {
    test('应该在 API 返回错误时抛出 LLMError', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            error: { message: 'Invalid API key', type: 'authentication_error' },
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

    test('应该正确处理流式错误', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } }),
      });

      const gen = provider.stream({
        messages: [{ role: 'user', content: 'test' }],
      });

      await expect(gen.next()).rejects.toThrow(LLMError);
    });
  });

  describe('getModel() / setModel()', () => {
    test('应该返回当前模型', () => {
      expect(provider.getModel()).toBe('claude-sonnet-4-5-20251901');
    });

    test('应该能够设置新模型', () => {
      provider.setModel('claude-3-5-haiku-20240620');
      expect(provider.getModel()).toBe('claude-3-5-haiku-20240620');
    });
  });

  describe('capabilities', () => {
    test('应该正确报告能力', () => {
      expect(provider.providerType).toBe('anthropic');
      expect(provider.capabilities.streaming).toBe(true);
      expect(provider.capabilities.functionCalling).toBe(true);
      expect(provider.capabilities.embedding).toBe(false);
      expect(provider.capabilities.jsonMode).toBe(true);
      expect(provider.capabilities.maxContextLength).toBe(200000);
    });

    test('应该列出支持的模型', () => {
      expect(provider.capabilities.supportedModels).toBeDefined();
      expect(provider.capabilities.supportedModels).toContain('claude-sonnet-4-5-20251901');
    });
  });

  describe('isAvailable()', () => {
    test('应该在 API 可用时返回 true', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'msg_test',
            model: 'claude-sonnet-4-5-20251901',
            content: [{ type: 'text', text: 'p' }],
            stop_reason: 'max_tokens',
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
      });

      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    test('应该在 API 不可用时返回 false', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const available = await provider.isAvailable();
      expect(available).toBe(false);
    });

    test('应该在 ping 返回 400 时认为可用', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { message: 'invalid format' } }),
      });

      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });
  });
});
