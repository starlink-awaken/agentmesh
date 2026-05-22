import type { QuotaInfo } from './types.js';

let quotaCache: Map<string, QuotaInfo> = new Map();
let lastProbeTime = 0;
const QUOTA_TTL = 60_000; // 60秒缓存

export async function probeQuota(): Promise<Map<string, QuotaInfo>> {
  const now = Date.now();
  if (now - lastProbeTime < QUOTA_TTL && quotaCache.size > 0) {
    return quotaCache;
  }

  try {
    const proc = Bun.spawn(
      ['codexbar', 'usage', '--format', 'json', '--provider', 'all'],
      { stdout: 'pipe', stderr: 'pipe' }
    );
    const output = await new Response(proc.stdout).text();

    if (output.trim()) {
      const entries = JSON.parse(output);
      quotaCache = new Map();

      for (const entry of entries) {
        const provider = entry.provider;
        if (!provider) continue;

        const info = parseQuota(provider, entry);
        quotaCache.set(provider, info);
      }
      lastProbeTime = now;
      console.log(`[Quota] Refreshed: ${quotaCache.size} providers`);
    }
  } catch (err) {
    console.warn('[Quota] Probe failed, using stale cache:', (err as Error).message);
  }

  return quotaCache;
}

function parseQuota(provider: string, entry: any): QuotaInfo {
  let available = true;
  let usedPercent: number | undefined;
  let balance: number | undefined;
  let summary = '';

  try {
    switch (provider) {
      case 'codex': {
        const credits = entry.credits;
        const remaining = credits?.remaining ?? 0;
        const secUsed = entry.usage?.secondary?.usedPercent ?? 0;
        available = remaining > 0 || secUsed < 100;
        usedPercent = secUsed;
        summary = `Credits: ${remaining}, Secondary: ${secUsed}%`;
        break;
      }
      case 'openai': {
        // 直接 API Key 方式，总是 available（除非有 error）
        available = !entry.error;
        summary = entry.error ? `Error: ${entry.error.message}` : 'API Key configured';
        break;
      }
      case 'deepseek': {
        const desc = entry.usage?.primary?.resetDescription ?? '';
        const match = desc.match(/¥([\d.]+)/);
        balance = match ? parseFloat(match[1]) : -1;
        available = (balance ?? -1) > 0;
        summary = `Balance: ¥${(balance ?? -1).toFixed(2)}`;
        break;
      }
      case 'openrouter': {
        const orUsage = entry.usage?.openRouterUsage ?? {};
        balance = orUsage.balance ?? 0;
        usedPercent = orUsage.usedPercent ?? 0;
        available = (balance ?? 0) > 0;
        summary = `Balance: $${(balance ?? 0).toFixed(2)}, Used: ${usedPercent ?? 0}%`;
        break;
      }
      case 'gemini': {
        usedPercent = entry.usage?.primary?.usedPercent ?? 0;
        available = (usedPercent ?? 100) < 95;
        summary = `Used: ${usedPercent ?? 0}%`;
        break;
      }
      case 'copilot': {
        usedPercent = (entry.usage?.primary?.usedPercent as number) ?? 0;
        available = (usedPercent ?? 0) < 100;
        summary = `Used: ${usedPercent ?? 0}%`;
        break;
      }
      case 'cursor': {
        usedPercent = (entry.usage?.primary?.usedPercent as number) ?? 0;
        available = (usedPercent ?? 0) < 100;
        summary = `Used: ${usedPercent ?? 0}%`;
        break;
      }
      case 'ollama':
        available = true;
        summary = 'Local - always available';
        break;
      default:
        available = !entry.error;
        summary = entry.error ? `Error: ${entry.error.message}` : 'Status unknown';
    }
  } catch {
    available = true; // 解析失败时假设可用
    summary = 'Parse error, assuming available';
  }

  return { provider, available, usedPercent, balance, summary };
}

export function isProviderAvailable(provider: string): boolean {
  return quotaCache.get(provider)?.available ?? true;
}

export function getQuotaSummary(): Record<string, QuotaInfo> {
  return Object.fromEntries(quotaCache);
}
