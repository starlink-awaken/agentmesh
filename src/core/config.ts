import { readFileSync, existsSync } from 'fs';
import { parse } from 'yaml';
import { join } from 'path';

export interface AgentConfig {
  id: string;
  name: string;
  type: 'claude-code' | 'openclaw' | 'process' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  endpoint?: string;
  capabilities: string[];
}

export interface RoutingRule {
  name: string;
  keywords: string[];
  agent?: string;
  strategy?: 'direct' | 'broadcast';
  agents?: string[];
  priority: number;
}

export interface GatewayConfig {
  port: number;
  wsPort: number;
  host: string;
  dataDir: string;
  logDir: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  routing: {
    defaultAgent?: string;
    rules: RoutingRule[];
  };
  agents: AgentConfig[];
}

const DEFAULT_CONFIG: GatewayConfig = {
  port: 3000,
  wsPort: 3001,
  host: '0.0.0.0',
  dataDir: './data',
  logDir: './logs',
  logLevel: 'info',
  routing: {
    defaultAgent: 'claude-code',
    rules: []
  },
  agents: []
};

let cachedConfig: GatewayConfig | null = null;

/**
 * 加载配置文件
 */
export function loadConfig(configPath?: string): GatewayConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const paths = configPath
    ? [configPath]
    : [
        './config/gateway.yaml',
        './config/gateway.yml',
        join(process.cwd(), 'config/gateway.yaml'),
        join(process.cwd(), 'config/gateway.yml')
      ];

  for (const path of paths) {
    try {
      if (existsSync(path)) {
        console.log(`[Config] Loading from: ${path}`);
        const content = readFileSync(path, 'utf-8');
        const parsed = parse(content) as Partial<GatewayConfig>;

        // 合并配置
        cachedConfig = {
          ...DEFAULT_CONFIG,
          ...parsed,
          routing: {
            ...DEFAULT_CONFIG.routing,
            ...parsed.routing,
            rules: parsed.routing?.rules || DEFAULT_CONFIG.routing.rules
          }
        };

        console.log(`[Config] Loaded successfully`);
        return cachedConfig;
      }
    } catch (error) {
      console.warn(`[Config] Failed to load ${path}:`, error);
    }
  }

  console.log('[Config] Using default configuration');
  cachedConfig = { ...DEFAULT_CONFIG };
  return cachedConfig;
}

/**
 * 重新加载配置
 */
export function reloadConfig(configPath?: string): GatewayConfig {
  cachedConfig = null;
  return loadConfig(configPath);
}

/**
 * 获取配置
 */
export function getConfig(): GatewayConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

/**
 * 获取 Agent 配置
 */
export function getAgentConfig(agentId: string): AgentConfig | undefined {
  const config = getConfig();
  return config.agents.find(a => a.id === agentId);
}

/**
 * 获取所有 Agent 配置
 */
export function getAllAgentConfigs(): AgentConfig[] {
  return getConfig().agents;
}

/**
 * 获取路由规则
 */
export function getRoutingRules(): RoutingRule[] {
  return getConfig().routing.rules;
}

/**
 * 获取默认 Agent
 */
export function getDefaultAgent(): string | undefined {
  return getConfig().routing.defaultAgent;
}
