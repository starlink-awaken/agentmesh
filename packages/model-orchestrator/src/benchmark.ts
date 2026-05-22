/**
 * 模型自动基准测试 — 测量本地模型的实际延迟
 */
import type { ModelRegistry } from './registry.js';

const PING_MESSAGE = [{ role: 'user', content: 'hi' }];

export interface BenchmarkResult {
  modelId: string;
  latencyMs: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

/**
 * 对指定模型执行基准测试，测量首次推理延迟
 */
export async function benchmarkModel(
  registry: ModelRegistry,
  modelId: string,
  timeoutMs = 60000,
): Promise<BenchmarkResult> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    await registry.chat(modelId, PING_MESSAGE);
    clearTimeout(timer);
    return {
      modelId,
      latencyMs: performance.now() - start,
      success: true,
      timestamp: Date.now(),
    };
  } catch (err: any) {
    return {
      modelId,
      latencyMs: performance.now() - start,
      success: false,
      error: err.message,
      timestamp: Date.now(),
    };
  }
}

/**
 * 对所有本地模型运行基准测试
 * 排除云端模型（避免 API 调用费用）
 */
export async function benchmarkLocalModels(
  registry: ModelRegistry,
  options?: { concurrency?: number; timeoutMs?: number },
): Promise<BenchmarkResult[]> {
  const all = registry.getAll();
  const local = all.filter(m => m.location === 'local' && m.id.startsWith('ollama/'));
  const { concurrency = 2, timeoutMs = 60000 } = options || {};

  const results: BenchmarkResult[] = [];
  // 限制并发避免压垮本地 GPU
  for (let i = 0; i < local.length; i += concurrency) {
    const batch = local.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(m => benchmarkModel(registry, m.id, timeoutMs))
    );
    results.push(...batchResults);
  }
  return results;
}

/**
 * 运行基准测试并更新 registry 中模型的 avgLatencyMs
 */
export async function benchmarkAndUpdate(
  registry: ModelRegistry,
  options?: { concurrency?: number; timeoutMs?: number },
): Promise<BenchmarkResult[]> {
  const results = await benchmarkLocalModels(registry, options);
  for (const r of results) {
    if (r.success) {
      const model = registry.get(r.modelId);
      if (model) {
        model.avgLatencyMs = Math.round(r.latencyMs);
      }
    }
  }
  return results;
}
