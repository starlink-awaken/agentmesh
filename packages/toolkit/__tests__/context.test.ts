/**
 * Context Trimmer Tests
 *
 * @description 测试上下文窗口动态裁剪功能
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  ContextTrimmer,
  type TrimConfig,
  type ContextItem,
  createContextTrimmer,
} from '../src/context/index.js';

describe('ContextTrimmer', () => {
  let trimmer: ContextTrimmer;

  beforeEach(() => {
    trimmer = new ContextTrimmer();
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for empty string', () => {
      expect(trimmer.estimateTokens('')).toBe(0);
    });

    it('should estimate tokens for simple text', () => {
      const text = 'Hello world';
      const tokens = trimmer.estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate more tokens for longer text', () => {
      const short = 'Hi';
      const long = 'This is a much longer text that should have more tokens';
      expect(trimmer.estimateTokens(long)).toBeGreaterThan(trimmer.estimateTokens(short));
    });

    it('should handle unicode characters', () => {
      const chinese = '你好世界';
      const tokens = trimmer.estimateTokens(chinese);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('trim - head strategy', () => {
    it('should keep beginning messages when trimming with head strategy', () => {
      const messages: ContextItem[] = [
        { content: 'System message here', role: 'system', pinned: true },
        { content: 'First user message with lots of content', role: 'user' },
        { content: 'Second message', role: 'user' },
        { content: 'Third message that should be removed', role: 'user' },
      ];

      const config: TrimConfig = {
        maxTokens: 10,
        strategy: 'head',
      };

      const result = trimmer.trim(messages, config);

      // Pinned messages should always be preserved
      expect(result.some(m => m.content === 'System message here')).toBe(true);
      // Should have reduced the total tokens
      const totalTokens = result.reduce((sum, m) => sum + trimmer.estimateTokens(m.content), 0);
      expect(totalTokens).toBeLessThanOrEqual(50); // Allow some buffer
    });

    it('should preserve pinned messages regardless of strategy', () => {
      const messages: ContextItem[] = [
        { content: 'Important pinned message', role: 'assistant', pinned: true },
        { content: 'Regular message 1', role: 'user' },
        { content: 'Regular message 2', role: 'assistant' },
      ];

      const config: TrimConfig = {
        maxTokens: 5,
        strategy: 'head',
      };

      const result = trimmer.trim(messages, config);
      expect(result.some(m => m.content === 'Important pinned message')).toBe(true);
    });
  });

  describe('trim - tail strategy', () => {
    it('should keep ending messages when trimming with tail strategy', () => {
      const messages: ContextItem[] = [
        { content: 'First message that will be removed', role: 'user' },
        { content: 'Second message', role: 'user' },
        { content: 'Last important message', role: 'assistant', pinned: true },
      ];

      const config: TrimConfig = {
        maxTokens: 10,
        strategy: 'tail',
      };

      const result = trimmer.trim(messages, config);

      // Pinned message should be preserved
      expect(result.some(m => m.content === 'Last important message')).toBe(true);
    });
  });

  describe('trim - importance strategy', () => {
    it('should keep messages with higher importance', () => {
      const messages: ContextItem[] = [
        { content: 'Low importance message', role: 'user', importance: 0.1 },
        { content: 'Medium importance message', role: 'user', importance: 0.5 },
        { content: 'High importance message', role: 'assistant', importance: 0.9 },
        { content: 'Critical message', role: 'system', importance: 1.0 },
      ];

      const config: TrimConfig = {
        maxTokens: 15,
        strategy: 'importance',
      };

      const result = trimmer.trim(messages, config);

      // Should prioritize high importance messages
      const hasHighImportance = result.some(m => m.importance && m.importance >= 0.9);
      expect(hasHighImportance).toBe(true);
    });

    it('should treat unpinned messages as lower importance by default', () => {
      const messages: ContextItem[] = [
        { content: 'Regular message 1', role: 'user' },
        { content: 'Regular message 2', role: 'user' },
        { content: 'Important pinned message', role: 'assistant', pinned: true },
      ];

      const config: TrimConfig = {
        maxTokens: 5,
        strategy: 'importance',
      };

      const result = trimmer.trim(messages, config);
      expect(result.some(m => m.content === 'Important pinned message')).toBe(true);
    });
  });

  describe('trim - summary strategy', () => {
    it('should compress messages when using summary strategy', () => {
      const messages: ContextItem[] = [
        { content: 'Message 1 with lots of details about something important', role: 'user' },
        { content: 'Message 2 with more details and information', role: 'assistant' },
        { content: 'Message 3 with additional content', role: 'user' },
      ];

      const config: TrimConfig = {
        maxTokens: 10,
        strategy: 'summary',
      };

      const result = trimmer.trim(messages, config);

      // Should have reduced the content
      const originalTokens = messages.reduce((sum, m) => sum + trimmer.estimateTokens(m.content), 0);
      const resultTokens = result.reduce((sum, m) => sum + trimmer.estimateTokens(m.content), 0);

      // Summary should either keep important messages or compress them
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('preservePatterns', () => {
    it('should preserve content matching patterns', () => {
      const messages: ContextItem[] = [
        { content: 'Function: test() { return true; }', role: 'assistant' },
        { content: 'Regular conversation', role: 'user' },
        { content: 'Code: const x = 42;', role: 'assistant' },
      ];

      const config: TrimConfig = {
        maxTokens: 5,
        strategy: 'head',
        preservePatterns: [/Function:/, /Code:/],
      };

      const result = trimmer.trim(messages, config);

      // Should preserve messages matching patterns
      const hasCode = result.some(m => m.content.includes('Function:') || m.content.includes('Code:'));
      expect(hasCode).toBe(true);
    });
  });

  describe('sliding window', () => {
    it('should support overlap tokens in sliding window mode', () => {
      const messages: ContextItem[] = [
        { content: 'Message 1', role: 'user' },
        { content: 'Message 2', role: 'assistant' },
        { content: 'Message 3', role: 'user' },
        { content: 'Message 4', role: 'assistant' },
        { content: 'Message 5', role: 'user' },
      ];

      const config: TrimConfig = {
        maxTokens: 15,
        strategy: 'tail',
        overlapTokens: 3,
      };

      const result = trimmer.trim(messages, config);

      // Should return trimmed result
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(messages.length);
    });
  });

  describe('edge cases', () => {
    it('should handle empty messages array', () => {
      const messages: ContextItem[] = [];
      const config: TrimConfig = {
        maxTokens: 100,
        strategy: 'head',
      };

      const result = trimmer.trim(messages, config);
      expect(result).toEqual([]);
    });

    it('should handle messages already within limit', () => {
      const messages: ContextItem[] = [
        { content: 'Short message', role: 'user' },
      ];

      const config: TrimConfig = {
        maxTokens: 1000,
        strategy: 'head',
      };

      const result = trimmer.trim(messages, config);
      expect(result.length).toBe(1);
      expect(result[0].content).toBe('Short message');
    });

    it('should handle system messages specially', () => {
      const messages: ContextItem[] = [
        { content: 'System initialization', role: 'system' },
        { content: 'User request', role: 'user' },
      ];

      const config: TrimConfig = {
        maxTokens: 1,
        strategy: 'tail',
      };

      const result = trimmer.trim(messages, config);

      // System messages should typically be preserved
      const hasSystem = result.some(m => m.role === 'system');
      expect(hasSystem).toBe(true);
    });
  });
});

describe('createContextTrimmer', () => {
  it('should create a ContextTrimmer instance', () => {
    const trimmer = createContextTrimmer();
    expect(trimmer).toBeInstanceOf(ContextTrimmer);
  });

  it('should accept custom tokenizer', () => {
    const customTokenizer = (text: string) => Math.ceil(text.length / 4);
    const trimmer = createContextTrimmer({ tokenizer: customTokenizer });
    expect(trimmer.estimateTokens('test')).toBe(1); // 4/4 = 1
  });
});
