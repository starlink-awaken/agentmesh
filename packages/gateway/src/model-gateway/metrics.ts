// 网关运行时指标收集

interface ProviderMetrics {
  requests: number;
  success: number;
  failures: number;
  totalLatencyMs: number;
  lastError?: string;
  lastErrorTime?: number;
  lastSuccessTime?: number;
}

interface RequestLog {
  timestamp: number;
  model: string;
  provider: string;
  actualModel: string;
  latencyMs: number;
  status: number;
  error?: string;
  streaming: boolean;
}

const providerMetrics = new Map<string, ProviderMetrics>();
const recentRequests: RequestLog[] = [];
const MAX_RECENT = 200;

function getOrInitProvider(name: string): ProviderMetrics {
  if (!providerMetrics.has(name)) {
    providerMetrics.set(name, { requests: 0, success: 0, failures: 0, totalLatencyMs: 0 });
  }
  return providerMetrics.get(name)!;
}

export function recordRequest(log: RequestLog): void {
  const m = getOrInitProvider(log.provider);
  m.requests++;
  m.totalLatencyMs += log.latencyMs;
  if (log.status >= 200 && log.status < 400) {
    m.success++;
    m.lastSuccessTime = log.timestamp;
  } else {
    m.failures++;
    m.lastError = log.error;
    m.lastErrorTime = log.timestamp;
  }
  recentRequests.push(log);
  if (recentRequests.length > MAX_RECENT) recentRequests.shift();
}

export function getMetrics() {
  const providers: Record<string, any> = {};
  let totalRequests = 0;
  let totalFailures = 0;

  for (const [name, m] of providerMetrics) {
    totalRequests += m.requests;
    totalFailures += m.failures;
    providers[name] = {
      requests: m.requests,
      success_rate: m.requests > 0 ? ((m.success / m.requests) * 100).toFixed(1) + '%' : 'N/A',
      avg_latency_ms: m.requests > 0 ? Math.round(m.totalLatencyMs / m.requests) : 0,
      last_success: m.lastSuccessTime ? new Date(m.lastSuccessTime).toISOString() : null,
      last_error: m.lastError || null,
      last_error_time: m.lastErrorTime ? new Date(m.lastErrorTime).toISOString() : null,
    };
  }

  return {
    uptime_seconds: Math.round(process.uptime()),
    total_requests: totalRequests,
    total_failures: totalFailures,
    providers,
    recent: recentRequests.slice(-20).reverse().map(r => ({
      time: new Date(r.timestamp).toISOString(),
      model: r.model,
      provider: r.provider,
      actual: r.actualModel,
      latency_ms: r.latencyMs,
      status: r.status,
      streaming: r.streaming,
      error: r.error,
    })),
  };
}
