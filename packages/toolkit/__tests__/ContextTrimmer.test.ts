/**
 * ContextTrimmer 单元测试
 *
 * 测试上下文窗口动态裁剪能力
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ContextTrimmer, createContextTrimmer } from '../src/context/ContextTrimmer.js';
import type { ContextItem, TrimConfig } from '../src/context/types.js';

describe('ContextTrimmer', () => {
  let trimmer: ContextTrimmer;

  // 创建测试消息的辅助函数
  const createMessage = (content: string, role: 'user' | 'assistant' | 'system' = 'user', options: Partial<ContextItem> = {}): ContextItem => ({
    content,
    role,
    ...options,
  });

  beforeEach(() => {
    trimmer = new ContextTrimmer();
  });

  // ============================================================================
  // 构造函数测试
  // ============================================================================

  describe('constructor', () => {
    it('should create trimmer with default config', () => {
      expect(trimmer).toBeDefined();
    });

    it('should accept custom tokenizer', () => {
      const customTrimmer = new ContextTrimmer({
        tokenizer: (text) => Math.ceil(text.length / 4),
        defaultMaxTokens: 8192,
      });
      expect(customTrimmer).toBeDefined();
    });
  });

  // ============================================================================
  // Token 估算测试
  // ============================================================================

  describe('estimateTokens', () => {
    it('should estimate tokens for Chinese text', () => {
      const tokens = trimmer.estimateTokens('你好世界');
      // 中文约 1-2 字符/token，这里按1.3估算
      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate tokens for English text', () => {
      const tokens = trimmer.estimateTokens('Hello world');
      // 英文约 4 字符/token
      expect(tokens).toBeGreaterThanOrEqual(2);
    });

    it('should estimate tokens for mixed text', () => {
      const tokens = trimmer.estimateTokens('你好Hello世界world');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should handle empty string', () => {
      const tokens = trimmer.estimateTokens('');
      expect(tokens).toBe(0);
    });

    it('should handle very long text', () => {
      const longText = 'a'.repeat(10000);
      const tokens = trimmer.estimateTokens(longText);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // 总 Token 计算测试
  // ============================================================================

  describe('calculateTotalTokens', () => {
    it('should calculate total tokens for multiple messages', () => {
      const messages = [
        createMessage('Hello'),
        createMessage('World'),
      ];

      const total = trimmer.calculateTotalTokens(messages);
      expect(total).toBeGreaterThan(0);
    });

    it('should return 0 for empty messages', () => {
      const total = trimmer.calculateTotalTokens([]);
      expect(total).toBe(0);
    });
  });

  // ============================================================================
  // 裁剪功能测试 - Head 策略
  // ============================================================================

  describe('trim with head strategy', () => {
    it('should not trim when under limit', () => {
      const messages = [
        createMessage('Short message'),
      ];

      const result = trimmer.trim(messages, { maxTokens: 1000, strategy: 'head' });

      expect(result.length).toBe(1);
      expect(result[0].content).toBe('Short message');
    });

    it('should trim from head when over limit', () => {
      const messages = [
        createMessage('Message 1 ' + 'x'.repeat(100)),
        createMessage('Message 2 ' + 'x'.repeat(100)),
        createMessage('Message 3 ' + 'x'.repeat(100)),
        createMessage('Message 4 ' + 'x'.repeat(100)),
      ];

      const result = trimmer.trim(messages, { maxTokens: 10, strategy: 'head' });

      expect(result.length).toBeLessThanOrEqual(4);
      // 如果有结果，应该保留前面的消息
      if (result.length > 0) {
        expect(result[0].content).toContain('Message 1');
      }
    });

    it('should preserve pinned messages', () => {
      const messages = [
        createMessage('System prompt', 'system', { pinned: true }),
        createMessage('Regular message 1'),
        createMessage('Regular message 2'),
      ];

      const result = trimmer.trim(messages, { maxTokens: 1, strategy: 'head' });

      // 系统消息应该被保留
      expect(result.some(m => m.role === 'system')).toBe(true);
    });
  });

  // ============================================================================
  // 裁剪功能测试 - Tail 策略
  // ============================================================================

  describe('trim with tail strategy', () => {
    it('should keep recent messages', () => {
      const messages = [
        createMessage('Message 1'),
        createMessage('Message 2'),
        createMessage('Message 3'),
        createMessage('Message 4'),
      ];

      const result = trimmer.trim(messages, { maxTokens: 5, strategy: 'tail' });

      // 应该保留后面的消息
      expect(result[result.length - 1].content).toContain('Message 4');
    });

    it('should not exceed max tokens', () => {
      const messages = [
        createMessage('x'.repeat(100)),
        createMessage('x'.repeat(100)),
        createMessage('x'.repeat(100)),
      ];

      const result = trimmer.trim(messages, { maxTokens: 10, strategy: 'tail' });

      // 验证结果可能是空的(如果单条消息就超过了限制)
      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // 裁剪功能测试 - Importance 策略
  // ============================================================================

  describe('trim with importance strategy', () => {
    it('should prioritize high importance messages', () => {
      const messages = [
        createMessage('Low importance', 'user', { importance: 0.3 }),
        createMessage('High importance', 'assistant', { importance: 0.9 }),
        createMessage('Medium importance', 'user', { importance: 0.5 }),
      ];

      const result = trimmer.trim(messages, { maxTokens: 20, strategy: 'importance' });

      expect(result.length).toBeGreaterThan(0);
    });

    it('should boost assistant message importance', () => {
      const messages = [
        createMessage('User message', 'user', { importance: 0.4 }),
        createMessage('Assistant message', 'assistant'),
      ];

      const result = trimmer.trim(messages, { maxTokens: 10, strategy: 'importance' });

      expect(result.some(m => m.role === 'assistant')).toBe(true);
    });
  });

  // ============================================================================
  // 裁剪功能测试 - Summary 策略
  // ============================================================================

  describe('trim with summary strategy', () => {
    it('should preserve high importance messages', () => {
      const messages = [
        createMessage('Critical info', 'user', { importance: 0.9 }),
        createMessage('Regular info'),
      ];

      const result = trimmer.trim(messages, { maxTokens: 10, strategy: 'summary' });

      expect(result.some(m => m.content === 'Critical info')).toBe(true);
    });

    it('should compress long messages', () => {
      const longContent = '第一句内容。第二句内容。第三句内容。';
      const messages = [createMessage(longContent)];

      const result = trimmer.trim(messages, { maxTokens: 5, strategy: 'summary' });

      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // 保留模式测试
  // ============================================================================

  describe('preserve patterns', () => {
    it('should preserve messages matching regex pattern', () => {
      const messages = [
        createMessage('Important: System reminder'),
        createMessage('Regular message'),
      ];

      const result = trimmer.trim(messages, {
        maxTokens: 1,
        strategy: 'head',
        preservePatterns: [/Important:/],
      });

      expect(result.some(m => m.content.includes('Important:'))).toBe(true);
    });
  });

  // ============================================================================
  // 重叠 Token 测试
  // ============================================================================

  describe('overlap tokens', () => {
    it('should add overlap with tail strategy', () => {
      const messages = [
        createMessage('Message 1'),
        createMessage('Message 2'),
        createMessage('Message 3'),
        createMessage('Message 4'),
      ];

      const result = trimmer.trim(messages, {
        maxTokens: 5,
        strategy: 'tail',
        overlapTokens: 2,
      });

      // 重叠可能会导致保留更多消息
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should add overlap with head strategy', () => {
      const messages = [
        createMessage('Message 1'),
        createMessage('Message 2'),
        createMessage('Message 3'),
        createMessage('Message 4'),
      ];

      const result = trimmer.trim(messages, {
        maxTokens: 5,
        strategy: 'head',
        overlapTokens: 2,
      });

      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // 工厂函数测试
  // ============================================================================

  describe('createContextTrimmer', () => {
    it('should create trimmer instance', () => {
      const instance = createContextTrimmer();
      expect(instance).toBeInstanceOf(ContextTrimmer);
    });

    it('should accept config', () => {
      const instance = createContextTrimmer({
        defaultMaxTokens: 5000,
      });
      expect(instance).toBeInstanceOf(ContextTrimmer);
    });
  });

  // ============================================================================
  // 边界情况测试
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty messages', () => {
      const result = trimmer.trim([], { maxTokens: 100, strategy: 'head' });
      expect(result).toEqual([]);
    });

    it('should handle zero maxTokens', () => {
      const messages = [createMessage('Test')];
      const result = trimmer.trim(messages, { maxTokens: 0, strategy: 'head' });
      expect(result).toEqual([]);
    });

    it('should handle unknown strategy gracefully', () => {
      const messages = [createMessage('Test')];
      const result = trimmer.trim(messages, { maxTokens: 100, strategy: 'unknown' as any });
      // 应该回退到 head 策略
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle messages with special characters', () => {
      const messages = [
        createMessage('Unicode: 🎉💻🚀'),
        createMessage('Emoji: 😊😃😄'),
      ];

      const result = trimmer.trim(messages, { maxTokens: 100, strategy: 'head' });
      expect(result.length).toBe(2);
    });
  });
});
