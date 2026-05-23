import { readFileSync, existsSync } from 'fs';
import { parse } from 'yaml';
import { join, dirname } from 'path';
import type { ModelGatewayConfig } from '../model-gateway/types.js';
import type {
  GatewayConfig as CoreGatewayConfig,
  AgentConfig as CoreAgentConfig,
  RoutingRule as CoreRoutingRule,
  AppConfig,
  ModelsConfig,
} from '@agentmesh/core-types';
import { loadAppConfig as loadAppConfigFromModule } from '@agentmesh/model-orchestrator';

export interface AgentConfig extends CoreAgentConfig {
  type: 'claude-code' | 'openclaw' | 'process' | 'http';
}

export interface RoutingRule extends CoreRoutingRule {}

// YAML 默认配置使用 snake_case 与 gateway.yaml 匹配
export interface ModelsSection extends ModelGatewayConfig {
  defaults?: {
    circuit_breaker?: {
      failure_threshold?: number;
      half_open_max_requests?: number;
      reset_timeout_ms?: number;
    };
    retry?: {
      base_delay_ms?: number;
      max_delay_ms?: number;
      max_retries?: number;
      retryable_statuses?: number[];
    };
    rate_limit?: Record<string, { rpm?: number; enabled?: boolean }>;
  };
}

export interface GatewayConfig extends CoreGatewayConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  routing: {
    defaultAgent?: string;
    rules: RoutingRule[];
  };
  agents: AgentConfig[];
  models?: ModelsSection;
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

  // 从当前文件位置向上搜索 config/gateway.yaml（兼容 src/ 和 dist/）
  function findConfigUpward(): string {
    try {
      let d = (import.meta as any).dir || (import.meta as any).dirname || '';
      for (let i = 0; i < 10; i++) {
        const candidate = join(d, 'config', 'gateway.yaml');
        if (existsSync(candidate)) return candidate;
        const ymlCandidate = join(d, 'config', 'gateway.yml');
        if (existsSync(ymlCandidate)) return ymlCandidate;
        d = dirname(d);
      }
    } catch {}
    return '';
  }

  const pkgConfig = findConfigUpward();

  const paths = configPath
    ? [configPath]
    : [
        './config/gateway.yaml',
        './config/gateway.yml',
        join(process.cwd(), 'config/gateway.yaml'),
        join(process.cwd(), 'config/gateway.yml'),
        pkgConfig,
      ].filter(Boolean);

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

// ── 统一配置加载入口 ──

/**
 * 加载统一应用配置（gateway.yaml + models.yaml）。
 *
 * 代理至 @agentmesh/model-orchestrator 的统一加载器。
 */
export function loadAppConfig(): AppConfig {
  return loadAppConfigFromModule();
}

/**
 * 重新加载统一应用配置。
 */
export function reloadAppConfig(): AppConfig {
  cachedConfig = null;
  return loadAppConfigFromModule();
}

export type { AppConfig, ModelsConfig } from '@agentmesh/core-types';
