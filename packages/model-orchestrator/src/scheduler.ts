import type { ModelDescriptor, ModelRoutePolicy } from '@agentmesh/core-types';
import type { ModelRequest, ModelSelection, LoadInfo, SchedulerConfig } from './types.js';
import { DEFAULT_SCHEDULER_CONFIG } from './types.js';
import { ModelRegistry } from './registry.js';

/**
 * ModelScheduler — 模型动态调度器
 *
 * 根据策略（成本优先/速度优先/能力优先/均衡）选择最优模型。
 * 结合负载感知和健康状态做实时决策。
 */
export class ModelScheduler {
  private registry: ModelRegistry;
  private config: SchedulerConfig;
  private loadMap = new Map<string, LoadInfo>();

  constructor(registry: ModelRegistry, config?: Partial<SchedulerConfig>) {
    this.registry = registry;
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
  }

  /**
   * 选择最优模型
   *
   * 算法步骤：
   * 1. 筛选：可用 + 能力匹配 + 健康
   * 2. 按策略评分
   * 3. 负载降分
   * 4. 返回最优
   */
  async selectModel(request: ModelRequest, policy?: Partial<ModelRoutePolicy>): Promise<ModelSelection | null> {
    const allModels = this.registry.getAll();
    const mergedPolicy: ModelRoutePolicy = {
      strategy: policy?.strategy || this.config.defaultPolicy,
      priority: policy?.priority || [],
      fallbackChain: policy?.fallbackChain || [],
    };

    // 1. 筛选
    let candidates = allModels.filter((m: ModelDescriptor) => {
      if (!m.isAvailable) return false;
      const hasCaps = request.requiredCapabilities.every(c => m.capabilities.includes(c as any));
      return hasCaps;
    });

    if (candidates.length === 0) return null;

    // 按优先级排序
    if (mergedPolicy.priority.length > 0) {
      const priorityOrder = new Map(mergedPolicy.priority.map((id, i) => [id, i]));
      candidates.sort((a: ModelDescriptor, b: ModelDescriptor) => (priorityOrder.get(a.id) ?? 999) - (priorityOrder.get(b.id) ?? 999));
      return {
        model: candidates[0]!,
        providerName: candidates[0]!.provider,
        confidence: 1.0,
        reasoning: `Matched priority order: ${candidates[0]!.id}`,
      };
    }

    // 2. 评分
    const scored = candidates.map((m: ModelDescriptor) => ({
      model: m,
      score: this.calculateScore(m, request, mergedPolicy),
      loadPenalty: this.getLoadPenalty(m.id),
    }));

    // 3. 排序取最优
    scored.sort((a: { score: number; loadPenalty: number }, b: { score: number; loadPenalty: number }) => (b.score - b.loadPenalty) - (a.score - a.loadPenalty));
    const best = scored[0];
    if (!best) return null;

    // 记录负载
    this.recordLoad(best.model.id);

    return {
      model: best.model,
      providerName: best.model.provider,
      confidence: Math.min(1, Math.max(0, best.score - best.loadPenalty)),
      reasoning: `Scored ${best.score.toFixed(2)} (penalty: ${best.loadPenalty.toFixed(2)}): ${mergedPolicy.strategy}`,
    };
  }

  /**
   * 根据策略计算模型评分（0-1）
   */
  private calculateScore(model: ModelDescriptor, request: ModelRequest, policy: ModelRoutePolicy): number {
    switch (policy.strategy) {
      case 'cost-first': {
        if (!model.costPer1KTokens) return 1;
        const totalCost = model.costPer1KTokens.input + model.costPer1KTokens.output;
        return Math.max(0, 1 - totalCost / 0.1); // 假设 0.1 是最高成本
      }
      case 'speed-first': {
        if (!model.avgLatencyMs) return 0.5;
        return Math.max(0, 1 - model.avgLatencyMs / 10000);
      }
      case 'capability-first': {
        const capScore = request.requiredCapabilities.filter(c => model.capabilities.includes(c as any)).length
          / Math.max(1, request.requiredCapabilities.length);
        const ctxScore = Math.min(1, model.contextWindow / 128000);
        return capScore * 0.6 + ctxScore * 0.4;
      }
      case 'balanced': {
        const costScore = model.costPer1KTokens
          ? Math.max(0, 1 - (model.costPer1KTokens.input + model.costPer1KTokens.output) / 0.1)
          : 0.5;
        const speedScore = model.avgLatencyMs
          ? Math.max(0, 1 - model.avgLatencyMs / 10000)
          : 0.5;
        const capScore = request.requiredCapabilities.filter(c => model.capabilities.includes(c as any)).length
          / Math.max(1, request.requiredCapabilities.length);
        return (costScore * this.config.costWeight
          + speedScore * this.config.speedWeight
          + capScore * this.config.capabilityWeight);
      }
    }
  }

  /**
   * 负载惩罚分：活跃请求越多，惩罚越大
   * 超过 5 分钟不活跃的模型自动清理
   */
  private getLoadPenalty(modelId: string): number {
    const load = this.loadMap.get(modelId);
    if (!load) return 0;
    const age = Date.now() - load.lastChecked;
    if (age > 300_000) {
      this.loadMap.delete(modelId);
      return 0;
    }
    return Math.min(0.5, load.activeRequests * 0.1);
  }

  private recordLoad(modelId: string): void {
    const existing = this.loadMap.get(modelId);
    this.loadMap.set(modelId, {
      modelId,
      activeRequests: (existing?.activeRequests || 0) + 1,
      avgLatencyMs: existing?.avgLatencyMs || 0,
      lastChecked: Date.now(),
    });
  }

  /** 释放负载计数 */
  releaseLoad(modelId: string): void {
    const load = this.loadMap.get(modelId);
    if (load) {
      load.activeRequests = Math.max(0, load.activeRequests - 1);
    }
  }

  /** 获取所有模型负载信息 */
  getAllLoads(): LoadInfo[] {
    return Array.from(this.loadMap.values());
  }
}
