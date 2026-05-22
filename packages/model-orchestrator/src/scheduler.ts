import type { ModelDescriptor, ModelRoutePolicy } from '@agentmesh/core-types';
import type { ModelRequest, ModelSelection, LoadInfo, SchedulerConfig } from './types.js';
import { DEFAULT_SCHEDULER_CONFIG } from './types.js';
import { ModelRegistry } from './registry.js';
import { scoreModels } from './policies.js';

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
  private _refreshTimer: ReturnType<typeof setInterval> | null = null;

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

    // 2. 评分（委托给 policies.ts）
    const scored = scoreModels(candidates, request, mergedPolicy, this.loadMap);

    // 3. 取最优
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

  /**
   * 启动定时自动刷新模型注册表
   * @param intervalMs 刷新间隔（毫秒），默认 30000
   * @returns { dispose: () => void } 清除定时器的析构函数
   */
  startAutoRefresh(intervalMs: number = 30000): { dispose: () => void } {
    // 清除已有定时器，防止重复调用
    this.stopAutoRefresh();

    this._refreshTimer = setInterval(() => {
      this.registry.refresh().catch((err: unknown) => {
        console.warn('[ModelScheduler] auto-refresh failed:', err instanceof Error ? err.message : String(err));
      });
    }, intervalMs);

    return {
      dispose: () => this.stopAutoRefresh(),
    };
  }

  /** 停止自动刷新 */
  private stopAutoRefresh(): void {
    if (this._refreshTimer !== null) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  /** 获取所有模型负载信息 */
  getAllLoads(): LoadInfo[] {
    return Array.from(this.loadMap.values());
  }
}
