/**
 * Health Check - 多层级健康检查
 *
 * 架构层次：
 * 1. 系统层（memory, event loop）：基于 @agentmesh/toolkit HealthChecker
 * 2. Provider 层（各 AI 模型 Provider）：本模块提供
 *
 * Bridge: @agentmesh/toolkit → gateway
 */
import { createHealthCheck, createMemoryHealthCheck, createEventLoopHealthCheck, createCpuHealthCheck } from '@agentmesh/toolkit';
import { circuitBreakerRegistry } from './circuit-breaker.js';
import type { ModelGatewayConfig, ResolvedProvider } from './types.js';

// ─── Toolkit System Health Layer ─────────────────────────────────────

const systemHealth = createHealthCheck({
  checks: {
    memory: createMemoryHealthCheck(0.9),
    eventLoop: createEventLoopHealthCheck(100),
    cpu: createCpuHealthCheck(0.9),
  },
});

export interface SystemHealthResult {
  memory: { status: string; message: string };
  eventLoop: { status: string; message: string };
  cpu: { status: string; message: string };
  overall: string;
}

/**
 * 运行系统级健康检查（基于 @agentmesh/toolkit）
 */
export async function checkSystemHealth(): Promise<SystemHealthResult> {
  const results = await systemHealth.runChecks();
  const overall = systemHealth.getStatus();

  const memory = results.find(r => r.name === 'memory');
  const eventLoop = results.find(r => r.name === 'eventLoop');
  const cpu = results.find(r => r.name === 'cpu');

  return {
    memory: { status: memory?.status ?? 'unknown', message: memory?.message ?? 'not checked' },
    eventLoop: { status: eventLoop?.status ?? 'unknown', message: eventLoop?.message ?? 'not checked' },
    cpu: { status: cpu?.status ?? 'unknown', message: cpu?.message ?? 'not checked' },
    overall: overall as string,
  };
}

// ─── Provider Health Layer ───────────────────────────────────────────

interface ProviderHealth {
  provider: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  latency_ms: number;
  circuit: string;
  error?: string;
  checked_at: string;
}

const healthCache = new Map<string, { result: ProviderHealth; ts: number }>();
const CACHE_TTL = 30_000; // 30s

export async function checkProviderHealth(
  provider: ResolvedProvider,
): Promise<ProviderHealth> {
  const cached = healthCache.get(provider.name);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { ...cached.result, checked_at: new Date(cached.result.checked_at).toISOString() };
  }

  const circuit = circuitBreakerRegistry.getState(provider.name);
  if (circuit === 'OPEN') {
    const result: ProviderHealth = {
      provider: provider.name,
      status: 'unhealthy',
      latency_ms: 0,
      circuit,
      error: 'circuit_breaker_open',
      checked_at: new Date().toISOString(),
    };
    healthCache.set(provider.name, { result, ts: Date.now() });
    return result;
  }

  const start = Date.now();
  try {
    const resp = await fetch(`${provider.base_url.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${provider.api_key}` },
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - start;
    const result: ProviderHealth = {
      provider: provider.name,
      status: resp.ok ? 'healthy' : 'unhealthy',
      latency_ms: latency,
      circuit,
      error: resp.ok ? undefined : `HTTP ${resp.status}`,
      checked_at: new Date().toISOString(),
    };
    healthCache.set(provider.name, { result, ts: Date.now() });
    return result;
  } catch (err: any) {
    const result: ProviderHealth = {
      provider: provider.name,
      status: 'unhealthy',
      latency_ms: Date.now() - start,
      circuit,
      error: err.message?.slice(0, 100) || 'unknown error',
      checked_at: new Date().toISOString(),
    };
    healthCache.set(provider.name, { result, ts: Date.now() });
    return result;
  }
}

export async function checkAllProviders(
  config: ModelGatewayConfig,
): Promise<ProviderHealth[]> {
  const results = await Promise.allSettled(
    Object.entries(config.providers).map(async ([name, cfg]) => {
      const apiKey = Bun.env[cfg.api_key_env || ''] || cfg.api_key || '';
      if (!apiKey) {
        return {
          provider: name,
          status: 'unknown' as const,
          latency_ms: 0,
          circuit: circuitBreakerRegistry.getState(name),
          error: 'no_api_key',
          checked_at: new Date().toISOString(),
        };
      }
      return checkProviderHealth({ name, base_url: cfg.base_url, api_key: apiKey });
    }),
  );

  return results.map(r => {
    if (r.status === 'fulfilled') return r.value;
    return {
      provider: 'unknown',
      status: 'unhealthy' as const,
      latency_ms: 0,
      circuit: 'unknown',
      error: r.reason?.message || 'check failed',
      checked_at: new Date().toISOString(),
    };
  });
}

// ─── Combined Health Check ───────────────────────────────────────────

/**
 * 执行所有健康检查（系统 + Provider）并返回统一结果
 */
export async function runAllHealthChecks(config: ModelGatewayConfig): Promise<{
  system: SystemHealthResult;
  providers: ProviderHealth[];
}> {
  const [system, providers] = await Promise.all([
    checkSystemHealth(),
    checkAllProviders(config),
  ]);
  return { system, providers };
}
