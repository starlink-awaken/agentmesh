/**
 * Honeycomb LLM Integration - Token Tracker
 *
 * Token 统计器跟踪 Token 使用情况，支持预算控制。
 * 提供详细的 Token 使用报告，帮助控制成本。
 *
 * 设计原则：
 * - 精确统计：准确记录每次 API 调用的 Token 使用
 * - 预算控制：支持设置和使用预算检查
 * - 多 Provider：支持多个 Provider 的分别统计
 * - 报告导出：支持多种格式的使用报告
 */

import type { TokenUsage, TokenReport } from './types.js';
import { TokenBudgetError } from './types.js';

// ============================================================
// Token 统计器
// ============================================================

/**
 * Token 统计器
 */
export class TokenTracker {
  // 每个 Provider 的使用情况
  private usage: Map<string, TokenUsage> = new Map();

  // 每个 Agent 的使用情况
  private usageByAgent: Map<string, TokenUsage> = new Map();

  // 每个 Project 的使用情况
  private usageByProject: Map<string, TokenUsage> = new Map();

  // 时间窗口统计（用于计算速率）
  private timeWindowUsage: Array<{
    timestamp: number;
    provider: string;
    inputTokens: number;
    outputTokens: number;
  }> = [];

  private logger: any;

  constructor(logger: any) {
    this.logger = logger;
  }

  /**
   * 记录 Token 使用
   */
  record(
    provider: string,
    inputTokens: number,
    outputTokens: number,
    metadata?: {
      agentName?: string;
      projectId?: string;
    }
  ): void {
    // 更新 Provider 统计
    const current = this.usage.get(provider) || { input: 0, output: 0 };
    this.usage.set(provider, {
      input: current.input + inputTokens,
      output: current.output + outputTokens,
    });

    // 更新 Agent 统计
    if (metadata?.agentName) {
      const agentUsage = this.usageByAgent.get(metadata.agentName) || {
        input: 0,
        output: 0,
      };
      this.usageByAgent.set(metadata.agentName, {
        input: agentUsage.input + inputTokens,
        output: agentUsage.output + outputTokens,
      });
    }

    // 更新 Project 统计
    if (metadata?.projectId) {
      const projectUsage = this.usageByProject.get(metadata.projectId) || {
        input: 0,
        output: 0,
      };
      this.usageByProject.set(metadata.projectId, {
        input: projectUsage.input + inputTokens,
        output: projectUsage.output + outputTokens,
      });
    }

    // 添加到时间窗口
    this.timeWindowUsage.push({
      timestamp: Date.now(),
      provider,
      inputTokens,
      outputTokens,
    });

    // 清理旧的时间窗口数据（保留最近 1 小时）
    this.cleanupTimeWindow(3600000);

    this.logger.debug('Token usage recorded', {
      provider,
      inputTokens,
      outputTokens,
      total: inputTokens + outputTokens,
      agentName: metadata?.agentName,
      projectId: metadata?.projectId,
    });
  }

  /**
   * 获取总使用量
   */
  getTotal(provider?: string): TokenUsage {
    if (provider) {
      return this.usage.get(provider) || { input: 0, output: 0 };
    }

    // 汇总所有 Provider
    const total: TokenUsage = { input: 0, output: 0 };
    this.usage.forEach((usage) => {
      total.input += usage.input;
      total.output += usage.output;
    });
    return total;
  }

  /**
   * 获取 Agent 使用量
   */
  getUsageByAgent(agentName?: string): TokenUsage | Record<string, TokenUsage> {
    if (agentName) {
      return this.usageByAgent.get(agentName) || { input: 0, output: 0 };
    }

    const result: Record<string, TokenUsage> = {};
    this.usageByAgent.forEach((usage, name) => {
      result[name] = { ...usage };
    });
    return result;
  }

  /**
   * 获取 Project 使用量
   */
  getUsageByProject(projectId?: string): TokenUsage | Record<string, TokenUsage> {
    if (projectId) {
      return this.usageByProject.get(projectId) || { input: 0, output: 0 };
    }

    const result: Record<string, TokenUsage> = {};
    this.usageByProject.forEach((usage, id) => {
      result[id] = { ...usage };
    });
    return result;
  }

  /**
   * 获取时间窗口内的使用量
   */
  getUsageInTimeWindow(durationMs: number): {
    total: TokenUsage;
    byProvider: Record<string, TokenUsage>;
  } {
    const cutoff = Date.now() - durationMs;
    const windowData = this.timeWindowUsage.filter(e => e.timestamp > cutoff);

    const total: TokenUsage = { input: 0, output: 0 };
    const byProvider: Record<string, TokenUsage> = {};

    for (const entry of windowData) {
      total.input += entry.inputTokens;
      total.output += entry.outputTokens;

      if (!byProvider[entry.provider]) {
        byProvider[entry.provider] = { input: 0, output: 0 };
      }
      byProvider[entry.provider].input += entry.inputTokens;
      byProvider[entry.provider].output += entry.outputTokens;
    }

    return { total, byProvider };
  }

  /**
   * 获取使用速率（每分钟 Token 数）
   */
  getUsageRate(): {
    tokensPerMinute: number;
    inputTokensPerMinute: number;
    outputTokensPerMinute: number;
  } {
    const window = 60000; // 1 minute
    const usage = this.getUsageInTimeWindow(window);

    return {
      tokensPerMinute: usage.total.input + usage.total.output,
      inputTokensPerMinute: usage.total.input,
      outputTokensPerMinute: usage.total.output,
    };
  }

  /**
   * 检查预算
   */
  checkBudget(budget: number, provider?: string): boolean {
    const total = this.getTotal(provider);
    const used = total.input + total.output;
    return used < budget;
  }

  /**
   * 检查预算并在超限时抛出错误
   */
  enforceBudget(budget: number, provider?: string): void {
    const total = this.getTotal(provider);
    const used = total.input + total.output;

    if (used >= budget) {
      throw new TokenBudgetError(budget, used);
    }
  }

  /**
   * 获取剩余预算
   */
  getRemainingBudget(budget: number, provider?: string): number {
    const total = this.getTotal(provider);
    const used = total.input + total.output;
    return Math.max(0, budget - used);
  }

  /**
   * 估算成本（基于美元）
   * 使用默认定价，实际定价可能有所不同
   */
  estimateCost(provider?: string): {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    currency: string;
  } {
    // 默认定价（每百万 Token）
    const PRICING: Record<string, { input: number; output: number }> = {
      claude: { input: 3, output: 15 }, // Claude 3.5 Sonnet
      openai: { input: 2.5, output: 10 }, // GPT-4o
      simulation: { input: 0, output: 0 },
    };

    const total = this.getTotal(provider);
    const pricing = provider
      ? PRICING[provider] || PRICING.claude
      : PRICING.claude;

    const inputCost = (total.input / 1_000_000) * pricing.input;
    const outputCost = (total.output / 1_000_000) * pricing.output;

    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      currency: 'USD',
    };
  }

  /**
   * 重置统计
   */
  reset(provider?: string): void {
    if (provider) {
      this.usage.delete(provider);
    } else {
      this.usage.clear();
      this.usageByAgent.clear();
      this.usageByProject.clear();
      this.timeWindowUsage = [];
    }
    this.logger.debug('Token tracker reset', { provider });
  }

  /**
   * 获取详细报告
   */
  getReport(): TokenReport {
    const report: TokenReport = {
      byProvider: {},
      total: { input: 0, output: 0 },
    };

    this.usage.forEach((usage, provider) => {
      report.byProvider[provider] = { ...usage };
      report.total.input += usage.input;
      report.total.output += usage.output;
    });

    return report;
  }

  /**
   * 导出 JSON 报告
   */
  exportJSON(): string {
    const report = {
      timestamp: new Date().toISOString(),
      total: this.getTotal(),
      byProvider: Object.fromEntries(this.usage.entries()),
      byAgent: Object.fromEntries(this.usageByAgent.entries()),
      byProject: Object.fromEntries(this.usageByProject.entries()),
      rate: this.getUsageRate(),
      cost: this.estimateCost(),
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * 获取统计摘要
   */
  getSummary(): {
    totalTokens: number;
    totalRequests: number;
    averageTokensPerRequest: number;
    topProviders: Array<{ provider: string; tokens: number }>;
    topAgents: Array<{ agent: string; tokens: number }>;
  } {
    const total = this.getTotal();
    const totalTokens = total.input + total.output;
    const totalRequests = this.timeWindowUsage.length;

    // Top Providers
    const topProviders = Array.from(this.usage.entries())
      .map(([provider, usage]) => ({
        provider,
        tokens: usage.input + usage.output,
      }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5);

    // Top Agents
    const topAgents = Array.from(this.usageByAgent.entries())
      .map(([agent, usage]) => ({
        agent,
        tokens: usage.input + usage.output,
      }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5);

    return {
      totalTokens,
      totalRequests,
      averageTokensPerRequest: totalRequests > 0 ? totalTokens / totalRequests : 0,
      topProviders,
      topAgents,
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 清理时间窗口数据
   */
  private cleanupTimeWindow(maxAge: number): void {
    const cutoff = Date.now() - maxAge;
    this.timeWindowUsage = this.timeWindowUsage.filter(
      e => e.timestamp > cutoff
    );
  }
}

// TokenTracker 已通过 export class 导出，无需重复导出
