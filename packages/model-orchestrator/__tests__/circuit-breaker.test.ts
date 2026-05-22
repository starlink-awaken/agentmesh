import { describe, it, expect } from 'bun:test';
import { CircuitBreakerRegistry } from '../src/circuit-breaker.js';

describe('CircuitBreakerRegistry', () => {
  it('starts CLOSED for unconfigured providers', () => {
    const cb = new CircuitBreakerRegistry();
    expect(cb.canRequest('unknown')).toBe(true);
    expect(cb.getState('unknown')).toBe('CLOSED');
  });

  it('opens after consecutive failures', () => {
    const cb = new CircuitBreakerRegistry();
    cb.configure('test-provider', { failureThreshold: 2, resetTimeoutMs: 60000, halfOpenMaxRequests: 1 });
    expect(cb.canRequest('test-provider')).toBe(true);
    cb.recordFailure('test-provider');
    expect(cb.canRequest('test-provider')).toBe(true);
    cb.recordFailure('test-provider');
    expect(cb.canRequest('test-provider')).toBe(false);
    expect(cb.getState('test-provider')).toBe('OPEN');
  });

  it('transitions to HALF_OPEN after reset timeout', () => {
    const cb = new CircuitBreakerRegistry();
    cb.configure('test-provider', { failureThreshold: 1, resetTimeoutMs: 1, halfOpenMaxRequests: 1 });
    cb.recordFailure('test-provider');
    expect(cb.getState('test-provider')).toBe('OPEN');
    // 等待超时后检查状态
    return new Promise<void>(resolve => {
      setTimeout(() => {
        expect(cb.getState('test-provider')).toBe('HALF_OPEN');
        resolve();
      }, 5);
    });
  });

  it('resets on success in HALF_OPEN', () => {
    const cb = new CircuitBreakerRegistry();
    cb.configure('test-provider', { failureThreshold: 1, resetTimeoutMs: 1, halfOpenMaxRequests: 1 });
    cb.recordFailure('test-provider');
    // 触发 HALF_OPEN
    return new Promise<void>(resolve => {
      setTimeout(() => {
        expect(cb.canRequest('test-provider')).toBe(true);
        cb.recordSuccess('test-provider');
        expect(cb.getState('test-provider')).toBe('CLOSED');
        resolve();
      }, 5);
    });
  });

  it('returns to OPEN on failure in HALF_OPEN', () => {
    const cb = new CircuitBreakerRegistry();
    cb.configure('test-provider', { failureThreshold: 1, resetTimeoutMs: 1, halfOpenMaxRequests: 1 });
    cb.recordFailure('test-provider');
    return new Promise<void>(resolve => {
      setTimeout(() => {
        cb.recordFailure('test-provider');
        expect(cb.getState('test-provider')).toBe('OPEN');
        resolve();
      }, 5);
    });
  });

  it('returns status for all configured providers', () => {
    const cb = new CircuitBreakerRegistry();
    cb.configure('provider-a', { failureThreshold: 3, resetTimeoutMs: 30000, halfOpenMaxRequests: 1 });
    cb.configure('provider-b', { failureThreshold: 3, resetTimeoutMs: 30000, halfOpenMaxRequests: 1 });
    const status = cb.getStatus();
    expect(Object.keys(status)).toContain('provider-a');
    expect(Object.keys(status)).toContain('provider-b');
  });
});
