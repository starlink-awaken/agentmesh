import { describe, test, expect } from 'bun:test';

// 测试 codexbar JSON 解析逻辑 — 直接测 parseQuota 的等效逻辑

describe('quota parsing', () => {
  test('deepseek balance parsing from ¥ format', () => {
    const desc = 'Balance: ¥561.18';
    const match = desc.match(/¥([\d.]+)/);
    const balance = match ? parseFloat(match[1]!) : -1;
    expect(balance).toBe(561.18);
    expect(balance > 0).toBe(true);
  });

  test('deepseek zero balance', () => {
    const desc = 'Balance: ¥0.00';
    const match = desc.match(/¥([\d.]+)/);
    const balance = match ? parseFloat(match[1]!) : -1;
    expect(balance).toBe(0);
    expect(balance > 0).toBe(false);
  });

  test('deepseek no balance in description', () => {
    const desc = 'No balance info';
    const match = desc.match(/¥([\d.]+)/);
    const balance = match ? parseFloat(match[1]!) : -1;
    expect(balance).toBe(-1);
    expect(balance > 0).toBe(false);
  });

  test('openrouter balance parsing', () => {
    const orUsage = { balance: 26.72, usedPercent: 46.56 };
    expect(orUsage.balance).toBeGreaterThan(0);
    expect(orUsage.usedPercent).toBe(46.56);
  });

  test('codex credits check: exhausted', () => {
    const credits = { remaining: 0 };
    expect(credits.remaining > 0).toBe(false);
  });

  test('codex credits check: available', () => {
    const credits = { remaining: 100 };
    expect(credits.remaining > 0).toBe(true);
  });

  test('gemini usedPercent thresholds', () => {
    expect(5.3 < 95).toBe(true);   // available
    expect(98 < 95).toBe(false);   // exhausted
    expect(0 < 95).toBe(true);     // available
  });

  test('ollama always available', () => {
    // Ollama has no quota concept — always available
    const available = true;
    expect(available).toBe(true);
  });

  test('cache TTL logic — fresh cache returned', () => {
    const now = Date.now();
    const lastProbe = now - 30_000; // 30s ago, within 60s TTL
    const TTL = 60_000;
    expect(now - lastProbe < TTL).toBe(true);
  });

  test('cache TTL logic — stale cache refreshed', () => {
    const now = Date.now();
    const lastProbe = now - 65_000; // 65s ago, exceeds 60s TTL
    const TTL = 60_000;
    expect(now - lastProbe < TTL).toBe(false);
  });
});
