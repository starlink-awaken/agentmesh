import type { Agent, RoutingRule, AgentMessage } from '../types/index.js';

export class Router {
  private rules: RoutingRule[] = [];
  private agents: Map<string, Agent> = new Map();
  private defaultAgent?: string;

  /**
   * 配置路由规则
   */
  configure(rules: RoutingRule[], defaultAgent?: string): void {
    // 按优先级排序
    this.rules = [...rules].sort((a, b) => b.priority - a.priority);
    this.defaultAgent = defaultAgent;
  }

  /**
   * 注册 Agent
   */
  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * 注销 Agent
   */
  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  /**
   * 获取所有在线 Agent
   */
  getOnlineAgents(): Agent[] {
    return Array.from(this.agents.values()).filter(a => a.status === 'online');
  }

  /**
   * 路由任务到合适的 Agent
   */
  route(message: AgentMessage): { agentIds: string[]; strategy: 'direct' | 'broadcast' } {
    const task = message.payload?.task || '';

    // 匹配路由规则
    for (const rule of this.rules) {
      if (this.matchesRule(task, rule.keywords)) {
        // 检查 Agent 是否在线
        if (rule.strategy === 'broadcast' && rule.agents) {
          const availableAgents = rule.agents.filter(id => this.isAgentOnline(id));
          if (availableAgents.length > 0) {
            return { agentIds: availableAgents, strategy: 'broadcast' };
          }
        } else if (rule.agent && this.isAgentOnline(rule.agent)) {
          return { agentIds: [rule.agent], strategy: 'direct' };
        }
      }
    }

    // 使用默认 Agent
    if (this.defaultAgent && this.isAgentOnline(this.defaultAgent)) {
      return { agentIds: [this.defaultAgent], strategy: 'direct' };
    }

    // 返回所有在线 Agent 作为兜底
    const onlineAgents = this.getOnlineAgents();
    if (onlineAgents.length > 0) {
      return { agentIds: onlineAgents.map(a => a.id), strategy: 'broadcast' };
    }

    // 没有可用的 Agent
    return { agentIds: [], strategy: 'direct' };
  }

  /**
   * 检查任务是否匹配路由关键词
   */
  private matchesRule(task: string, keywords: string[]): boolean {
    const lowerTask = task.toLowerCase();
    return keywords.some(keyword => lowerTask.includes(keyword.toLowerCase()));
  }

  /**
   * 检查 Agent 是否在线
   */
  private isAgentOnline(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    return agent?.status === 'online';
  }

  /**
   * 获取 Agent 信息
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * 获取所有 Agent
   */
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }
}

export const router = new Router();
