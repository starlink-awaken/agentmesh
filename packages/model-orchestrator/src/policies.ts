/**
 * 调度策略 — 模型评分与选择逻辑
 *
 * 从 scheduler.ts 中抽离，便于独立测试和扩展策略
 */
import type { ModelDescriptor, ModelRoutePolicy } from '@agentmesh/core-types';
import type { ModelRequest, LoadInfo } from './types.js';

type ScoreFn = (model: ModelDescriptor, request: ModelRequest) => number;

const REFERENCE_CTX = 128_000;
const registry = new Map<string, ScoreFn>();

function register(name: string, fn: ScoreFn): void {
  registry.set(name, fn);
}

function get(name: string): ScoreFn {
  const fn = registry.get(name);
  if (!fn) throw new Error(`Unknown scheduling policy: "${name}"`);
  return fn;
}

register('cost-first', (model, _req) => {
  if (!model.costPer1KTokens) return 1;
  return Math.max(0, 1 - (model.costPer1KTokens.input + model.costPer1KTokens.output) / 0.1);
});

register('speed-first', (model, _req) => {
  if (!model.avgLatencyMs) return 0.5;
  return Math.max(0, 1 - model.avgLatencyMs / 10000);
});

register('capability-first', (model, request) => {
  const capScore = request.requiredCapabilities.filter(c => model.capabilities.includes(c as any)).length
    / Math.max(1, request.requiredCapabilities.length);
  const ctxScore = Math.min(1, model.contextWindow / REFERENCE_CTX);
  return capScore * 0.6 + ctxScore * 0.4;
});

register('balanced', (model, request) => {
  const costScore = model.costPer1KTokens
    ? Math.max(0, 1 - (model.costPer1KTokens.input + model.costPer1KTokens.output) / 0.1)
    : 0.5;
  const speedScore = model.avgLatencyMs
    ? Math.max(0, 1 - model.avgLatencyMs / 10000)
    : 0.5;
  const capScore = request.requiredCapabilities.filter(c => model.capabilities.includes(c as any)).length
    / Math.max(1, request.requiredCapabilities.length);
  return costScore * 0.3 + speedScore * 0.3 + capScore * 0.4;
});

export interface ScoredModel {
  model: ModelDescriptor;
  score: number;
  loadPenalty: number;
}

export function scoreModels(
  models: ModelDescriptor[],
  request: ModelRequest,
  policy: ModelRoutePolicy,
  loadMap?: Map<string, LoadInfo>,
): ScoredModel[] {
  const fn = get(policy.strategy);
  return models
    .map(m => {
      const score = fn(m, request);
      const loadPenalty = loadMap ? getLoadPenalty(m.id, loadMap) : 0;
      return { model: m, score, loadPenalty };
    })
    .sort((a, b) => (b.score - b.loadPenalty) - (a.score - a.loadPenalty));
}

function getLoadPenalty(modelId: string, loadMap: Map<string, LoadInfo>, ttlMs = 300_000): number {
  const load = loadMap.get(modelId);
  if (!load) return 0;
  if (Date.now() - load.lastChecked > ttlMs) {
    loadMap.delete(modelId);
    return 0;
  }
  return Math.min(0.5, load.activeRequests * 0.1);
}

export function registerPolicy(name: string, fn: ScoreFn): void {
  register(name, fn);
}

export function listPolicies(): string[] {
  return Array.from(registry.keys());
}
