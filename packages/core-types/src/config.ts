/** 模型基础 Provider 配置（来自 models.yaml cloud 段） */
export interface ModelCloudProviderConfig {
  enabled: boolean;
  api_key_env?: string;
  base_url?: string;
}

/** 模型实例配置（来自 models.yaml local.llama_cpp.instances） */
export interface ModelLocalInstance {
  name: string;
  port: number;
  model_path?: string;
}

/** 模型本地 Provider 配置 */
export interface ModelLocalProviderConfig {
  enabled: boolean;
  base_url?: string;
}

/** 本地模型配置 */
export interface ModelsLocalConfig {
  ollama?: ModelLocalProviderConfig;
  lm_studio?: ModelLocalProviderConfig;
  llama_cpp?: {
    enabled: boolean;
    instances?: ModelLocalInstance[];
  };
}

/** 模型 Override 配置 */
export interface ModelsOverride {
  id_prefix: string;
  avg_latency_ms?: number;
  cost_per_1k_input?: number;
  cost_per_1k_output?: number;
}

/** 断路器配置 */
export interface ModelsCircuitBreaker {
  enabled?: boolean;
  failure_threshold?: number;
  reset_timeout_ms?: number;
  half_open_max_requests?: number;
}

/** 重试配置 */
export interface ModelsRetry {
  enabled?: boolean;
  max_retries?: number;
  base_delay_ms?: number;
  max_delay_ms?: number;
  retryable_statuses?: number[];
}

/** 调度器配置 */
export interface ModelsScheduler {
  default_policy?: string;
  health_check_interval_ms?: number;
  cost_weight?: number;
  speed_weight?: number;
  capability_weight?: number;
}

/**
 * Model-orchestrator 配置（来自 config/models.yaml）
 * 使用 snake_case 与 YAML 文件一致
 */
export interface ModelsConfig {
  local: ModelsLocalConfig;
  cloud: Record<string, ModelCloudProviderConfig>;
  model_overrides?: ModelsOverride[];
  circuit_breaker?: ModelsCircuitBreaker;
  retry?: ModelsRetry;
  scheduler?: ModelsScheduler;
}

/** Agent 配置（来自 gateway.yaml agents 段） */
export interface AgentConfig {
  id: string;
  name: string;
  type: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  endpoint?: string;
  capabilities: string[];
}

/** 路由规则（来自 gateway.yaml routing.rules） */
export interface RoutingRule {
  name: string;
  keywords: string[];
  agent?: string;
  strategy?: 'direct' | 'broadcast';
  agents?: string[];
  priority: number;
}

/** 路由配置 */
export interface RoutingConfig {
  defaultAgent?: string;
  rules: RoutingRule[];
}

/**
 * Gateway 配置（来自 config/gateway.yaml）
 * 使用 camelCase — YAML 层做映射
 */
export interface GatewayConfig {
  port: number;
  wsPort: number;
  host: string;
  dataDir: string;
  logDir: string;
  logLevel: string;
  routing: RoutingConfig;
  agents: AgentConfig[];
}

/**
 * 统一应用配置
 * gateway: 从 config/gateway.yaml 加载
 * models: 从 config/models.yaml 加载
 */
export interface AppConfig {
  gateway: GatewayConfig;
  models: ModelsConfig;
}
