import { ProcessAdapter } from '../adapters/process.js';
import { ClaudeCodeAdapter } from '../adapters/claude-code.js';
import { OpenClawAdapter } from '../adapters/openclaw.js';
import type { AgentAdapter } from '../adapters/base.js';
import type { Agent } from '../types/index.js';
import { getAllAgentConfigs } from './config.js';

// 默认 Agent 配置
const DEFAULT_AGENT_CONFIGS: Record<string, {
  name: string;
  capabilities: string[];
  command: string;
  args?: string[];
  env?: Record<string, string>;
}> = {
  'claude-code': {
    name: 'Claude Code',
    capabilities: ['code-generation', 'code-review', 'debugging', 'refactoring', 'documentation', 'file-operations'],
    command: 'claude',
    args: ['-p']
  },
  'openclaw': {
    name: 'OpenClaw',
    capabilities: ['browser-automation', 'web-scraping', 'form-filling', 'ui-testing'],
    command: 'openclaw',
    args: ['--task']
  },
  'opencode': {
    name: 'OpenCode',
    capabilities: ['code-completion', 'code-generation', 'refactoring', 'debugging'],
    command: 'opencode',
    args: ['--task']
  },
  'gemini': {
    name: 'Google Gemini CLI',
    capabilities: ['code-generation', 'multimodal', 'reasoning', 'analysis'],
    command: 'gemini',
    args: ['--prompt']
  },
  'codex': {
    name: 'OpenAI Codex',
    capabilities: ['code-generation', 'code-explanation', 'refactoring'],
    command: 'codex',
    args: ['complete']
  },
  'github-copilot': {
    name: 'GitHub Copilot',
    capabilities: ['code-completion', 'code-suggestions', 'refactoring'],
    command: 'copilot',
    args: ['--ask']
  },
  'qwen-code': {
    name: 'Qwen Code',
    capabilities: ['code-generation', 'code-review', 'multilingual'],
    command: 'qwen-code',
    args: ['--task']
  },
  'crush': {
    name: 'CRUSH AI',
    capabilities: ['code-generation', 'debugging', 'security-analysis'],
    command: 'crush',
    args: ['run']
  },
  'droid': {
    name: 'Droid Agent',
    capabilities: ['android-development', 'mobile-debugging', 'device-control'],
    command: 'droid',
    args: ['--task']
  },
  'factory': {
    name: 'Factory AI',
    capabilities: ['code-generation', 'testing', 'documentation', 'refactoring'],
    command: 'factory',
    args: ['--task']
  },
  'cursor': {
    name: 'Cursor',
    capabilities: ['code-completion', 'code-generation', 'refactoring', 'chat'],
    command: 'cursor',
    args: ['--task']
  },
  'windsurf': {
    name: 'Windsurf',
    capabilities: ['code-generation', 'agentic-coding', 'flow-state'],
    command: 'windsurf',
    args: ['--task']
  },
  'zed': {
    name: 'Zed AI',
    capabilities: ['code-generation', 'collaboration', 'high-performance'],
    command: 'zed',
    args: ['--ai-task']
  },
  'aider': {
    name: 'Aider',
    capabilities: ['git-based-editing', 'code-refactoring', 'multi-file-changes'],
    command: 'aider',
    args: ['--message']
  },
  'cline': {
    name: 'Cline',
    capabilities: ['autonomous-coding', 'file-operations', 'command-execution'],
    command: 'cline',
    args: ['--task']
  },
  'roo-code': {
    name: 'Roo Code',
    capabilities: ['code-generation', 'agentic-mode', 'workspace-awareness'],
    command: 'roo-code',
    args: ['--task']
  },
  // 2026 新增 Agent
  'perplexity': {
    name: 'Perplexity',
    capabilities: ['research', 'web-search', 'fact-checking', 'analysis'],
    command: 'perplexity',
    args: ['--query']
  },
  'grok': {
    name: 'xAI Grok',
    capabilities: ['reasoning', 'humor', 'code-generation', 'analysis'],
    command: 'grok',
    args: ['--prompt']
  },
  'phind': {
    name: 'Phind',
    capabilities: ['developer-search', 'code-search', 'documentation-search'],
    command: 'phind',
    args: ['--search']
  },
  'you': {
    name: 'You.com AI',
    capabilities: ['web-search', 'code-search', 'general-assistant'],
    command: 'you',
    args: ['--query']
  },
  'lepton': {
    name: 'Lepton AI',
    capabilities: ['code-generation', 'conversation', 'analysis'],
    command: 'lepton',
    args: ['--prompt']
  },
  'ollama': {
    name: 'Ollama',
    capabilities: ['local-llm', 'code-generation', 'privacy-focused'],
    command: 'ollama',
    args: ['run']
  },
  'llama': {
    name: 'Meta Llama',
    capabilities: ['code-generation', 'reasoning', 'open-source'],
    command: 'llama',
    args: ['--prompt']
  },
  'mistral': {
    name: 'Mistral AI',
    capabilities: ['code-generation', 'reasoning', 'multilingual'],
    command: 'mistral',
    args: ['--task']
  },
  'anthropic': {
    name: 'Anthropic CLI',
    capabilities: ['conversation', 'reasoning', 'code-generation'],
    command: 'anthropic',
    args: ['--prompt']
  }
};

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
