/**
 * EdgeCoordinator - 边缘协调器
 *
 * 协调多个边缘Agent完成复杂任务
 * 基于CAMPHOR的高阶推理Agent设计
 *
 * @author PAI
 */

import { EdgeAgent, createEdgeAgent } from './EdgeAgent.js';
import type {
  EdgeTask,
  EdgeResult,
  EdgeAgentType,
  ComputeTier,
  OffloadDecision,
  OffloadStrategy,
} from './types.js';

/**
 * 边缘协调器
 */
export class EdgeCoordinator {
  private agents: Map<EdgeAgentType, EdgeAgent> = new Map();
  private reasoningAgent!: EdgeAgent;
  private tier: ComputeTier = 'edge';

  constructor(options: { defaultTier?: ComputeTier } = {}) {
    this.tier = options.defaultTier || 'edge';

    // 初始化所有类型的Agent
    const agentTypes: EdgeAgentType[] = [
      'reasoning',
      'personal_context',
      'device_info',
      'user_perception',
      'external_knowledge',
      'task_completion',
    ];

    for (const type of agentTypes) {
      const agent = createEdgeAgent(type);
      this.agents.set(type, agent);

      if (type === 'reasoning') {
        this.reasoningAgent = agent;
      }
    }
  }

  /**
   * 执行任务
   */
  async execute(task: EdgeTask): Promise<EdgeResult> {
    // 确定是否需要卸载到云端
    const decision = await this.decideOffload(task);

    if (decision.targetTier === 'cloud') {
      return await this.executeOnCloud(task, decision);
    }

    // 边缘执行
    return await this.executeOnEdge(task);
  }

  /**
   * 决定任务卸载策略
   */
  async decideOffload(task: EdgeTask): Promise<OffloadDecision> {
    // 简单策略：根据任务复杂度决定
    const complexity = this.estimateComplexity(task);

    if (complexity > 8 && this.tier === 'device') {
      return {
        targetTier: 'cloud',
        reason: '任务复杂度过高',
        estimatedLatency: 500,
        estimatedCost: 0.1,
      };
    }

    if (complexity > 5 && this.tier === 'edge') {
      return {
        targetTier: 'edge',
        reason: '中等复杂度，边缘执行',
        estimatedLatency: 200,
        estimatedCost: 0.01,
      };
    }

    return {
      targetTier: this.tier,
      reason: '低复杂度，本地执行',
      estimatedLatency: 50,
      estimatedCost: 0.001,
    };
  }

  /**
   * 估算任务复杂度
   */
  private estimateComplexity(task: EdgeTask): number {
    let score = 0;

    // 根据输入长度
    score += Math.min(task.input.length / 100, 3);

    // 根据需要的Agent数量
    score += task.requiredAgents.length;

    // 根据任务类型
    if (task.type === 'query') score += 1;
    if (task.type === 'action') score += 2;

    return Math.min(score, 10);
  }

  /**
   * 边缘执行
   */
  private async executeOnEdge(task: EdgeTask): Promise<EdgeResult> {
    const startTime = Date.now();

    try {
      // 使用推理Agent分析任务
      const reasoningResult = await this.reasoningAgent.execute({
        ...task,
        type: 'query',
      });

      if (!reasoningResult.success) {
        return reasoningResult;
      }

      // 根据推理结果调用子Agent
      const subAgentResults: EdgeResult[] = [];

      for (const agentType of task.requiredAgents) {
        const agent = this.agents.get(agentType);
        if (agent) {
          const result = await agent.execute(task);
          subAgentResults.push(result);
        }
      }

      // 合成最终结果
      const finalOutput = this.synthesizeResults(subAgentResults);

      return {
        taskId: task.id,
        success: true,
        output: finalOutput,
        agentUsed: 'reasoning',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        taskId: task.id,
        success: false,
        output: null,
        agentUsed: 'reasoning',
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 云端执行（模拟）
   */
  private async executeOnCloud(
    task: EdgeTask,
    decision: OffloadDecision
  ): Promise<EdgeResult> {
    // 在实际实现中，这里会调用云端API
    return {
      taskId: task.id,
      success: true,
      output: {
        message: 'Cloud execution result',
        tier: decision.targetTier,
      },
      agentUsed: 'reasoning',
      latency: decision.estimatedLatency,
    };
  }

  /**
   * 合成多个Agent的结果
   */
  private synthesizeResults(results: EdgeResult[]): unknown {
    const successful = results.filter((r) => r.success);
    return {
      total: results.length,
      successful: successful.length,
      outputs: successful.map((r) => r.output),
    };
  }

  /**
   * 设置计算层级
   */
  setTier(tier: ComputeTier): void {
    this.tier = tier;
  }

  /**
   * 获取当前层级
   */
  getTier(): ComputeTier {
    return this.tier;
  }

  /**
   * 获取所有Agent信息
   */
  getAgentsInfo(): Array<{ type: EdgeAgentType; name: string; tools: string[] }> {
    return Array.from(this.agents.values()).map((agent) => agent.getInfo());
  }
}
