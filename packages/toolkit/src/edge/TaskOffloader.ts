/**
 * TaskOffloader - 任务卸载器
 *
 * 实现云边端任务垂直卸载与边缘间水平迁移
 * 基于云边端专利设计
 *
 * @author PAI
 */

import type { ComputeTier, OffloadDecision, OffloadStrategy, EdgeTask, EdgeResult } from './types.js';

/**
 * 任务卸载器
 */
export class TaskOffloader {
  private currentTier: ComputeTier;
  private strategy: OffloadStrategy;

  // 边缘节点信息
  private edgeNodes: Map<string, { load: number; capability: number }> = new Map();

  // 云端能力
  private cloudCapability = 100;
  private edgeCapability = 20;
  private deviceCapability = 1;

  constructor(options: { strategy?: OffloadStrategy; tier?: ComputeTier } = {}) {
    this.strategy = options.strategy || 'dynamic';
    this.currentTier = options.tier || 'edge';
  }

  /**
   * 决定任务卸载目标
   */
  decide(task: EdgeTask): OffloadDecision {
    switch (this.strategy) {
      case 'cloud_only':
        return this.decideCloudOnly(task);
      case 'edge_only':
        return this.decideEdgeOnly(task);
      case 'cloud_first':
        return this.decideCloudFirst(task);
      case 'edge_first':
        return this.decideEdgeFirst(task);
      case 'dynamic':
      default:
        return this.decideDynamic(task);
    }
  }

  /**
   * 仅云端
   */
  private decideCloudOnly(task: EdgeTask): OffloadDecision {
    return {
      targetTier: 'cloud',
      reason: '策略：仅云端',
      estimatedLatency: this.estimateLatency('cloud'),
      estimatedCost: this.estimateCost('cloud'),
    };
  }

  /**
   * 仅边缘
   */
  private decideEdgeOnly(task: EdgeTask): OffloadDecision {
    return {
      targetTier: 'edge',
      reason: '策略：仅边缘',
      estimatedLatency: this.estimateLatency('edge'),
      estimatedCost: this.estimateCost('edge'),
    };
  }

  /**
   * 云端优先
   */
  private decideCloudFirst(task: EdgeTask): OffloadDecision {
    const complexity = this.estimateComplexity(task);
    if (complexity > 5) {
      return {
        targetTier: 'cloud',
        reason: '任务复杂，云端处理能力更强',
        estimatedLatency: this.estimateLatency('cloud'),
        estimatedCost: this.estimateCost('cloud'),
      };
    }
    return {
      targetTier: 'edge',
      reason: '任务简单，边缘执行更快',
      estimatedLatency: this.estimateLatency('edge'),
      estimatedCost: this.estimateCost('edge'),
    };
  }

  /**
   * 边缘优先
   */
  private decideEdgeFirst(task: EdgeTask): OffloadDecision {
    const complexity = this.estimateComplexity(task);
    const edgeLoad = this.getAverageEdgeLoad();

    if (complexity < 8 && edgeLoad < 0.8) {
      return {
        targetTier: 'edge',
        reason: '任务可处理且边缘负载适中',
        estimatedLatency: this.estimateLatency('edge'),
        estimatedCost: this.estimateCost('edge'),
      };
    }
    return {
      targetTier: 'cloud',
      reason: '边缘负载过高或任务太复杂',
      estimatedLatency: this.estimateLatency('cloud'),
      estimatedCost: this.estimateCost('cloud'),
    };
  }

  /**
   * 动态决定
   */
  private decideDynamic(task: EdgeTask): OffloadDecision {
    const complexity = this.estimateComplexity(task);
    const edgeLoad = this.getAverageEdgeLoad();

    // 计算各层级的得分
    const cloudScore = this.calculateScore('cloud', complexity);
    const edgeScore = this.calculateScore('edge', complexity, edgeLoad);
    const deviceScore = this.calculateScore('device', complexity);

    // 选择得分最高的
    if (deviceScore >= edgeScore && deviceScore >= cloudScore && complexity <= 3) {
      return {
        targetTier: 'device',
        reason: '设备本地执行最快最省成本',
        estimatedLatency: this.estimateLatency('device'),
        estimatedCost: this.estimateCost('device'),
      };
    }

    if (edgeScore >= cloudScore && edgeLoad < 0.9) {
      return {
        targetTier: 'edge',
        reason: '边缘执行性价比最高',
        estimatedLatency: this.estimateLatency('edge'),
        estimatedCost: this.estimateCost('edge'),
      };
    }

    return {
      targetTier: 'cloud',
      reason: '云端处理能力最强',
      estimatedLatency: this.estimateLatency('cloud'),
      estimatedCost: this.estimateCost('cloud'),
    };
  }

  /**
   * 计算评分
   */
  private calculateScore(
    tier: ComputeTier,
    complexity: number,
    edgeLoad: number = 0
  ): number {
    const latencyWeight = 0.4;
    const costWeight = 0.3;
    const capabilityWeight = 0.3;

    const latencyScore = 1 / this.estimateLatency(tier);
    const costScore = 1 / this.estimateCost(tier);

    let capabilityScore = 0;
    if (tier === 'cloud') {
      capabilityScore = this.cloudCapability / Math.max(complexity, 1);
    } else if (tier === 'edge') {
      capabilityScore = (this.edgeCapability * (1 - edgeLoad)) / Math.max(complexity, 1);
    } else {
      capabilityScore = this.deviceCapability / Math.max(complexity, 1);
    }

    return (
      latencyScore * latencyWeight +
      costScore * costWeight +
      capabilityScore * capabilityWeight
    );
  }

  /**
   * 估算延迟
   */
  private estimateLatency(tier: ComputeTier): number {
    switch (tier) {
      case 'cloud':
        return 500 + Math.random() * 200; // 500-700ms
      case 'edge':
        return 50 + Math.random() * 50; // 50-100ms
      case 'device':
        return 10 + Math.random() * 10; // 10-20ms
    }
  }

  /**
   * 估算成本
   */
  private estimateCost(tier: ComputeTier): number {
    switch (tier) {
      case 'cloud':
        return 0.01;
      case 'edge':
        return 0.001;
      case 'device':
        return 0.0001;
    }
  }

  /**
   * 估算复杂度
   */
  private estimateComplexity(task: EdgeTask): number {
    let score = task.input.length / 100;
    score += task.requiredAgents.length * 2;
    return Math.min(score, 10);
  }

  /**
   * 获取平均边缘负载
   */
  private getAverageEdgeLoad(): number {
    if (this.edgeNodes.size === 0) return 0.5;
    let total = 0;
    for (const node of this.edgeNodes.values()) {
      total += node.load;
    }
    return total / this.edgeNodes.size;
  }

  /**
   * 注册边缘节点
   */
  registerEdgeNode(nodeId: string, capability: number = 20): void {
    this.edgeNodes.set(nodeId, { load: 0, capability });
  }

  /**
   * 更新边缘节点负载
   */
  updateEdgeLoad(nodeId: string, load: number): void {
    const node = this.edgeNodes.get(nodeId);
    if (node) {
      node.load = Math.min(load, 1);
    }
  }

  /**
   * 水平迁移（边缘到边缘）
   */
  async migrateHorizontally(
    task: EdgeTask,
    fromNode: string,
    toNode: string
  ): Promise<{ success: boolean; reason: string }> {
    const fromLoad = this.edgeNodes.get(fromNode)?.load || 1;
    const toLoad = this.edgeNodes.get(toNode)?.load || 0;

    if (toLoad < fromLoad - 0.3) {
      // 更新负载
      this.updateEdgeLoad(fromNode, fromLoad - 0.3);
      this.updateEdgeLoad(toNode, toLoad + 0.3);

      return {
        success: true,
        reason: `从 ${fromNode} 迁移到 ${toNode}`,
      };
    }

    return {
      success: false,
      reason: '目标节点负载过高',
    };
  }

  /**
   * 设置策略
   */
  setStrategy(strategy: OffloadStrategy): void {
    this.strategy = strategy;
  }

  /**
   * 获取当前策略
   */
  getStrategy(): OffloadStrategy {
    return this.strategy;
  }
}
