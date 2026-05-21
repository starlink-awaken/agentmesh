interface RateLimitEntry {
  requests: number;
  windowStart: number;
}

const rateLimits = new Map<string, RateLimitEntry>();
let globalConfig: Record<string, { rpm?: number; enabled?: boolean }> = {};

export function initRateLimiter(config?: Record<string, { rpm?: number; enabled?: boolean }>): void {
  globalConfig = config || {};
}

export function checkRateLimit(endpoint: string, ip: string): { allowed: boolean; resetSeconds: number; limit: number; remaining: number } {
  const key = `${endpoint}:${ip}`;
  const cfg = globalConfig[endpoint] || { rpm: 60, enabled: true };
  const limit = cfg.rpm || 60;

  if (!cfg.enabled) {
    return { allowed: true, resetSeconds: 0, limit, remaining: limit };
  }

  const now = Date.now();
  const windowMs = 60_000;
  const entry = rateLimits.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    rateLimits.set(key, { requests: 1, windowStart: now });
    return { allowed: true, resetSeconds: 60, limit, remaining: limit - 1 };
  }

  if (entry.requests >= limit) {
    const resetSeconds = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { allowed: false, resetSeconds, limit, remaining: 0 };
  }

  entry.requests++;
  return { allowed: true, resetSeconds: Math.ceil((entry.windowStart + windowMs - now) / 1000), limit, remaining: limit - entry.requests };
}
