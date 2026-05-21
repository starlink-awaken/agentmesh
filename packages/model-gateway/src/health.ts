import { circuitBreakerRegistry } from './circuit-breaker.js';
import type { ModelGatewayConfig } from './types.js';

interface ProviderHealth {
  provider: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  latency_ms: number;
  circuit: string;
  error?: string;
  checked_at: string;
}

const healthCache = new Map<string, { result: ProviderHealth; ts: number }>();
const CACHE_TTL = 30_000;

export async function checkProviderHealth(
  name: string,
  base_url: string,
  api_key: string
): Promise<ProviderHealth> {
  const cached = healthCache.get(name);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { ...cached.result, checked_at: new Date().toISOString() };
  }

  const circuit = circuitBreakerRegistry.getState(name);
  if (circuit === 'OPEN') {
    const result: ProviderHealth = {
      provider: name, status: 'unhealthy', latency_ms: 0, circuit,
      error: 'circuit_breaker_open', checked_at: new Date().toISOString(),
    };
    healthCache.set(name, { result, ts: Date.now() });
    return result;
  }

  const start = Date.now();
  try {
    const resp = await fetch(`${base_url.replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${api_key}` },
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - start;
    const result: ProviderHealth = {
      provider: name,
      status: resp.ok ? 'healthy' : 'unhealthy',
      latency_ms: latency,
      circuit,
      error: resp.ok ? undefined : `HTTP ${resp.status}`,
      checked_at: new Date().toISOString(),
    };
    healthCache.set(name, { result, ts: Date.now() });
    return result;
  } catch (err: any) {
    const result: ProviderHealth = {
      provider: name,
      status: 'unhealthy',
      latency_ms: Date.now() - start,
      circuit,
      error: err.message?.slice(0, 100) || 'unknown error',
      checked_at: new Date().toISOString(),
    };
    healthCache.set(name, { result, ts: Date.now() });
    return result;
  }
}

export async function checkAllProviders(config: ModelGatewayConfig): Promise<ProviderHealth[]> {
  const results = await Promise.allSettled(
    Object.entries(config.providers).map(async ([name, cfg]) => {
      const apiKey = (globalThis as any).process?.env?.[cfg.api_key_env || ''] || cfg.api_key || '';
      if (!apiKey) {
        return {
          provider: name, status: 'unknown' as const, latency_ms: 0,
          circuit: circuitBreakerRegistry.getState(name),
          error: 'no_api_key', checked_at: new Date().toISOString(),
        };
      }
      return checkProviderHealth(name, cfg.base_url, apiKey);
    }),
  );

  return results.map(r => {
    if (r.status === 'fulfilled') return r.value;
    return {
      provider: 'unknown', status: 'unhealthy' as const, latency_ms: 0,
      circuit: 'unknown', error: r.reason?.message || 'check failed',
      checked_at: new Date().toISOString(),
    };
  });
}
