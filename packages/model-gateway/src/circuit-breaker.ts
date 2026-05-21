import type { CircuitBreakerConfig } from './types.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitEntry {
  failures: number;
  lastFailureTime: number;
  state: CircuitState;
  halfOpenCount: number;
}

const DEFAULTS: CircuitBreakerConfig = {
  failureThreshold: 3,
  resetTimeoutMs: 30_000,
  halfOpenMaxRequests: 1,
};

export class CircuitBreakerRegistry {
  private circuits = new Map<string, CircuitEntry>();
  private configs = new Map<string, CircuitBreakerConfig>();

  configure(provider: string, config: Partial<CircuitBreakerConfig> = {}): void {
    this.configs.set(provider, { ...DEFAULTS, ...config });
  }

  getState(provider: string): CircuitState {
    const entry = this.circuits.get(provider);
    if (!entry) return 'CLOSED';

    if (entry.state === 'OPEN') {
      const cfg = this.configs.get(provider) || DEFAULTS;
      if (Date.now() - entry.lastFailureTime >= cfg.resetTimeoutMs) {
        entry.state = 'HALF_OPEN';
        entry.halfOpenCount = 0;
      }
    }

    return entry.state;
  }

  isOpen(provider: string): boolean {
    return this.getState(provider) === 'OPEN';
  }

  canRequest(provider: string): boolean {
    const state = this.getState(provider);
    if (state === 'CLOSED') return true;
    if (state === 'OPEN') return false;

    const cfg = this.configs.get(provider) || DEFAULTS;
    const entry = this.circuits.get(provider);
    return (entry?.halfOpenCount ?? 0) < cfg.halfOpenMaxRequests;
  }

  recordSuccess(provider: string): void {
    const entry = this.circuits.get(provider);
    if (!entry) return;

    if (entry.state === 'HALF_OPEN') {
      this.circuits.delete(provider);
    } else {
      entry.failures = 0;
    }
  }

  recordFailure(provider: string): void {
    let entry = this.circuits.get(provider);
    if (!entry) {
      entry = { failures: 0, lastFailureTime: 0, state: 'CLOSED', halfOpenCount: 0 };
      this.circuits.set(provider, entry);
    }

    const cfg = this.configs.get(provider) || DEFAULTS;

    if (entry.state === 'HALF_OPEN') {
      entry.state = 'OPEN';
      entry.lastFailureTime = Date.now();
      entry.halfOpenCount = 0;
      return;
    }

    entry.failures++;
    entry.lastFailureTime = Date.now();

    if (entry.failures >= cfg.failureThreshold) {
      entry.state = 'OPEN';
    }
  }

  getStatus(): Record<string, { state: CircuitState; failures: number }> {
    const status: Record<string, { state: CircuitState; failures: number }> = {};
    for (const [name, entry] of this.circuits) {
      status[name] = { state: this.getState(name), failures: entry.failures };
    }
    return status;
  }
}
