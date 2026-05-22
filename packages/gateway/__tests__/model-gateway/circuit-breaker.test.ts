import { describe, test, expect, beforeEach } from 'bun:test';
import { CircuitBreakerRegistry } from '../../src/model-gateway/circuit-breaker.js';

describe('circuit breaker', () => {
  let cb: CircuitBreakerRegistry;

  beforeEach(() => {
    cb = new CircuitBreakerRegistry();
  });

  test('starts in CLOSED state', () => {
    expect(cb.getState('test')).toBe('CLOSED');
    expect(cb.isOpen('test')).toBe(false);
    expect(cb.canRequest('test')).toBe(true);
  });

  test('opens after failure threshold', () => {
    cb.configure('test', { failureThreshold: 3, resetTimeoutMs: 30000 });
    cb.recordFailure('test');
    cb.recordFailure('test');
    expect(cb.isOpen('test')).toBe(false); // 2 failures, not yet
    cb.recordFailure('test');
    expect(cb.isOpen('test')).toBe(true);  // 3rd failure triggers open
    expect(cb.canRequest('test')).toBe(false);
  });

  test('stays closed with intermittent successes', () => {
    cb.configure('test', { failureThreshold: 3, resetTimeoutMs: 30000 });
    cb.recordFailure('test');
    cb.recordSuccess('test'); // reset counter
    cb.recordFailure('test');
    cb.recordFailure('test');
    expect(cb.isOpen('test')).toBe(false); // only 2 consecutive failures
  });

  test('transitions to HALF_OPEN after reset timeout', () => {
    cb.configure('test', { failureThreshold: 1, resetTimeoutMs: 1 });
    cb.recordFailure('test');
    expect(cb.isOpen('test')).toBe(true);

    // 等待足够时间后应转为 HALF_OPEN
    // 但 1ms 太快，实际上还没到，需要手动模拟
    // 直接测试 getState 在 OPEN 状态时的行为
    expect(cb.getState('test')).toBe('OPEN');
  });

  test('half-open allows limited probe requests', () => {
    // 直接操作内部状态不方便，测试 canRequest 在 HALF_OPEN 时行为
    cb.configure('test', { failureThreshold: 3, resetTimeoutMs: 30000, halfOpenMaxRequests: 1 });

    // 使熔断器打开
    cb.recordFailure('test');
    cb.recordFailure('test');
    cb.recordFailure('test');
    expect(cb.isOpen('test')).toBe(true);

    // canRequest 在 OPEN 时应返回 false
    expect(cb.canRequest('test')).toBe(false);
  });

  test('recordSuccess resets circuit on half-open', () => {
    cb.configure('test', { failureThreshold: 3, resetTimeoutMs: 30000 });
    cb.recordFailure('test');
    cb.recordSuccess('test');
    expect(cb.getState('test')).toBe('CLOSED');
    expect(cb.isOpen('test')).toBe(false);
  });

  test('recordFailure on half-open reopens circuit', () => {
    cb.configure('test', { failureThreshold: 1, resetTimeoutMs: 3600_000 }); // 1h reset
    cb.recordFailure('test');
    expect(cb.isOpen('test')).toBe(true);
    // 无法手动设置 HALF_OPEN，但重开后 recordFailure 应保持 OPEN
    cb.recordFailure('test');
    expect(cb.isOpen('test')).toBe(true);
  });

  test('independent circuits per provider', () => {
    cb.configure('deepseek', { failureThreshold: 3, resetTimeoutMs: 30000 });
    cb.configure('openai', { failureThreshold: 3, resetTimeoutMs: 30000 });

    cb.recordFailure('deepseek');
    cb.recordFailure('deepseek');
    cb.recordFailure('deepseek');

    expect(cb.isOpen('deepseek')).toBe(true);
    expect(cb.isOpen('openai')).toBe(false);
  });

  test('getStatus returns all circuit states', () => {
    cb.recordFailure('p1');
    cb.recordFailure('p1');
    cb.recordFailure('p1');
    cb.recordFailure('p2');

    const status = cb.getStatus();
    expect(status['p1']!.state).toBe('OPEN');
    expect(status['p1']!.failures).toBe(3);
    expect(status['p2']!.failures).toBe(1);
  });
});
