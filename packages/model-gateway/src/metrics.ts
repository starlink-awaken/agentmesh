import type { RequestMetrics } from './types.js';

const MAX_RECORDS = 1000;
const metrics: RequestMetrics[] = [];
let startTime = Date.now();

export function recordRequest(m: RequestMetrics): void {
  metrics.push(m);
  if (metrics.length > MAX_RECORDS) metrics.shift();
}

export function getMetrics() {
  const byProvider: Record<string, { requests: number; successes: number; failures: number; totalLatency: number }> = {};
  const recent = metrics.slice(-50);

  for (const m of metrics) {
    const p = byProvider[m.provider] || { requests: 0, successes: 0, failures: 0, totalLatency: 0 };
    p.requests++;
    if (m.status >= 200 && m.status < 300) p.successes++;
    else p.failures++;
    p.totalLatency += m.latencyMs;
    byProvider[m.provider] = p;
  }

  const providers: Record<string, { requests: number; success_rate: string; avg_latency_ms: number }> = {};
  for (const [name, data] of Object.entries(byProvider)) {
    providers[name] = {
      requests: data.requests,
      success_rate: data.requests > 0 ? `${((data.successes / data.requests) * 100).toFixed(1)}%` : 'N/A',
      avg_latency_ms: data.requests > 0 ? Math.round(data.totalLatency / data.requests) : 0,
    };
  }

  return {
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    providers,
    recent: recent.map(m => ({
      time: m.timestamp,
      model: m.model,
      actual: m.actualModel,
      provider: m.provider,
      status: m.status,
      latency_ms: m.latencyMs,
    })),
  };
}
