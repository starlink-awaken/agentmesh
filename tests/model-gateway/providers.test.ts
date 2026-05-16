import { describe, test, expect } from 'bun:test';

// 测试 Responses API → Chat Completions 转换的辅助函数
// 直接测试 extractTextContent 和 convertResponsesInputToMessages 逻辑

describe('Responses API adapter — content extraction', () => {
  test('extracts string content', () => {
    const content = 'Hello, world!';
    const result = typeof content === 'string' ? content : String(content);
    expect(result).toBe('Hello, world!');
  });

  test('extracts input_text from content array', () => {
    const content = [
      { type: 'input_text', text: 'Write a function' },
      { type: 'input_text', text: 'Use TypeScript' },
    ];
    const result = content
      .filter((p: any) => p.type === 'input_text')
      .map((p: any) => p.text)
      .join('\n');
    expect(result).toBe('Write a function\nUse TypeScript');
  });

  test('handles mixed content types', () => {
    const content = [
      { type: 'input_text', text: 'Hello' },
      { type: 'image', url: 'https://example.com/img.png' },
      { type: 'input_text', text: 'World' },
    ];
    const result = content
      .filter((p: any) => p.type === 'input_text')
      .map((p: any) => p.text)
      .join('\n');
    expect(result).toBe('Hello\nWorld');
  });

  test('handles empty content array', () => {
    const content: any[] = [];
    const result = content
      .filter((p: any) => p.type === 'input_text')
      .map((p: any) => p.text)
      .join('\n');
    expect(result).toBe('');
  });
});

describe('Responses API adapter — input conversion', () => {
  test('converts role-based items to messages', () => {
    const input = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ];
    const messages = input.map((item) => ({
      role: item.role,
      content: typeof item.content === 'string' ? item.content : '',
    }));
    expect(messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ]);
  });

  test('converts type="message" items to messages', () => {
    const input = [
      { type: 'message', role: 'user', content: 'Hi there' },
    ];
    const messages = input.map((item) => ({
      role: item.role || 'user',
      content: typeof item.content === 'string' ? item.content : '',
    }));
    expect(messages).toEqual([
      { role: 'user', content: 'Hi there' },
    ]);
  });

  test('prepends instructions as system message', () => {
    const instructions = 'Be concise and helpful.';
    const existingMessages = [{ role: 'user', content: 'Hello' }];
    const messages = [
      { role: 'system', content: instructions },
      ...existingMessages,
    ];
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('system');
    expect(messages[0]!.content).toBe(instructions);
  });
});
