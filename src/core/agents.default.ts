// 默认 Agent CLI 配置 — 25+ 内置 Agent 命令映射
// 这些是兜底默认值，gateway.yaml 中的 agents 配置会覆盖它们
export const DEFAULT_AGENT_CONFIGS: Record<string, {
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
