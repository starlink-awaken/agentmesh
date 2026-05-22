import { ProcessAdapter } from '../adapters/process.js';
import { ClaudeCodeAdapter } from '../adapters/claude-code.js';
import { OpenClawAdapter } from '../adapters/openclaw.js';
import type { AgentAdapter } from '../adapters/base.js';
import type { Agent } from '../types/index.js';
import { getAllAgentConfigs } from './config.js';
import { DEFAULT_AGENT_CONFIGS } from './agents.default.js';

export class AgentRegistry {
  private adapters: Map<string, AgentAdapter> = new Map();
  private initialized = false;

  constructor() {
    // 延迟初始化
  }

  /**
   * 初始化注册表
   */
  initialize(): void {
    if (this.initialized) return;

    // 注册内置适配器
    this.register(new ClaudeCodeAdapter());
    this.register(new OpenClawAdapter());

    // 从配置加载所有 Agent
    this.registerAllFromConfig();

    this.initialized = true;
  }

  /**
   * 从配置注册所有 Agent
   */
  private registerAllFromConfig(): void {
    const configAgents = getAllAgentConfigs();

    // 1. 先注册配置文件中的 Agent
    for (const config of configAgents) {
      if (this.adapters.has(config.id)) continue;

      if (config.type === 'claude-code' || config.type === 'openclaw') {
        // 跳过，内置适配器已注册
        continue;
      }

      if (config.type === 'process' && config.command) {
        const adapter = new ProcessAdapter(
          config.id,
          config.name,
          config.capabilities,
          {
            command: config.command,
            args: config.args,
            env: config.env
          }
        );
        this.adapters.set(config.id, adapter);
        console.log(`[AgentRegistry] Registered from config: ${config.id}`);
      }
    }

    // 2. 再注册默认 Agent（未被配置覆盖的）
    for (const [id, defaultConfig] of Object.entries(DEFAULT_AGENT_CONFIGS)) {
      if (this.adapters.has(id)) continue;

      const adapter = new ProcessAdapter(
        id,
        defaultConfig.name,
        defaultConfig.capabilities,
        {
          command: defaultConfig.command,
          args: defaultConfig.args,
          env: defaultConfig.env
        }
      );

      this.adapters.set(id, adapter);
      console.log(`[AgentRegistry] Registered default: ${id}`);
    }
  }

  /** 热重载：清空后重新从配置加载所有适配器 */
  reload(): void {
    // 保留内置适配器（ClaudeCode, OpenClaw），清除其余
    const preserved = new Set(['claude-code', 'openclaw']);
    for (const key of this.adapters.keys()) {
      if (!preserved.has(key)) this.adapters.delete(key);
    }
    this.initialized = false;
    this.initialize();
  }

  /**
   * 注册自定义适配器
   */
  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.id, adapter);
    console.log(`[AgentRegistry] Registered adapter: ${adapter.id}`);
  }

  /**
   * 获取适配器
   */
  get(agentId: string): AgentAdapter | undefined {
    return this.adapters.get(agentId);
  }

  /**
   * 获取所有适配器
   */
  getAll(): AgentAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * 获取所有 Agent 信息
   */
  getAgents(): Agent[] {
    return this.getAll().map(adapter => ({
      id: adapter.id,
      name: adapter.name,
      type: adapter.type as Agent['type'],
      capabilities: adapter.capabilities,
      status: 'online' as const,
      lastSeen: Date.now()
    }));
  }

  /**
   * 根据能力查找 Agent
   */
  findByCapability(capability: string): Agent[] {
    return this.getAll()
      .filter(adapter => adapter.capabilities.includes(capability))
      .map(adapter => ({
        id: adapter.id,
        name: adapter.name,
        type: adapter.type as Agent['type'],
        capabilities: adapter.capabilities,
        status: 'online' as const,
        lastSeen: Date.now()
      }));
  }

  /**
   * 检查适配器是否存在
   */
  has(agentId: string): boolean {
    return this.adapters.has(agentId);
  }

  /**
   * 检查适配器是否健康
   */
  async checkHealth(agentId: string): Promise<boolean> {
    const adapter = this.adapters.get(agentId);
    if (!adapter) return false;
    return adapter.health();
  }

  /**
   * 获取可用 Agent 列表（健康检查）
   */
  async getAvailableAgents(): Promise<Agent[]> {
    const results: Agent[] = [];

    for (const adapter of this.adapters.values()) {
      const isHealthy = await adapter.health().catch(() => false);
      results.push({
        id: adapter.id,
        name: adapter.name,
        type: adapter.type as Agent['type'],
        capabilities: adapter.capabilities,
        status: isHealthy ? 'online' as const : 'offline' as const,
        lastSeen: Date.now()
      });
    }

    return results;
  }
}

export const agentRegistry = new AgentRegistry();
