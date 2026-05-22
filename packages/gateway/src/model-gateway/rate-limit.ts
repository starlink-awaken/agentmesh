/**
 * Rate Limiter - 基于路径 + IP 的令牌桶限流
 *
 * Bridge: @agentmesh/toolkit rate-limit (for HTTP middleware)
 * Gateway uses path+IP token bucket for model API endpoints, which is incompatible
 * with toolkit's HTTP middleware RateLimitMiddleware.
 *
 * 如果未来需要引入 HTTP 中间件层级的限流，可参考：
 *   import { RateLimitMiddleware, createRateLimitMiddleware, createIPRateLimitMiddleware } from '@agentmesh/toolkit';
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

interface LimitConfig {
  rpm: number;
  enabled: boolean;
}

const buckets = new Map<string, Bucket>();
const configs = new Map<string, LimitConfig>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

const DEFAULTS: Record<string, LimitConfig> = {
  '/v1/chat/completions': { rpm: 60, enabled: true },
  '/v1/responses': { rpm: 30, enabled: true },
};

export function initRateLimiter(configsOverride?: Record<string, Partial<LimitConfig>>): void {
  // 加载默认配置
  for (const [path, defaults] of Object.entries(DEFAULTS)) {
    configs.set(path, { ...defaults, ...configsOverride?.[path] });
  }
  // 加载配置中新增的路径（不在默认列表中的）
  if (configsOverride) {
    for (const [path, cfg] of Object.entries(configsOverride)) {
      if (!configs.has(path)) {
        configs.set(path, { rpm: cfg.rpm ?? 30, enabled: cfg.enabled ?? true });
      }
    }
  }

  // 每 60 秒清理过期桶
  if (!cleanupTimer) {
    cleanupTimer = setInterval(cleanupStaleBuckets, 60_000);
    if (cleanupTimer.unref) cleanupTimer.unref();
  }
}

export function checkRateLimit(
  path: string,
  ip: string,
): { allowed: boolean; limit: number; remaining: number; resetSeconds: number } {
  const cfg = configs.get(path);
  if (!cfg || !cfg.enabled) {
    return { allowed: true, limit: 0, remaining: 0, resetSeconds: 0 };
  }

  const key = `${path}:${ip}`;
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: cfg.rpm, lastRefill: now };
    buckets.set(key, bucket);
  }

  const elapsed = (now - bucket.lastRefill) / 1000;
  const refillRate = cfg.rpm / 60;
  bucket.tokens = Math.min(cfg.rpm, bucket.tokens + elapsed * refillRate);
  bucket.lastRefill = now;

  // 重置时间 = 令牌桶回到满的时间
  const tokensNeeded = cfg.rpm - bucket.tokens;
  const resetSeconds = Math.ceil(tokensNeeded / refillRate);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, limit: cfg.rpm, remaining: Math.floor(bucket.tokens), resetSeconds };
  }

  return { allowed: false, limit: cfg.rpm, remaining: 0, resetSeconds: Math.max(1, resetSeconds) };
}

function cleanupStaleBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > 300_000) {
      buckets.delete(key);
    }
  }
}
