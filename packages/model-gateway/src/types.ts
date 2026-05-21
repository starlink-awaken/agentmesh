export interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: any[];
  tool_choice?: any;
}

export interface ModelGatewayConfig {
  default_model: string;
  providers: Record<string, ProviderConfig>;
  fallback_chain: string[];
  model_routing: Record<string, string[]>;
  model_aliases?: Record<string, string>;
  defaults?: {
    circuit_breaker?: CircuitBreakerConfigRaw;
    retry?: RetryConfigRaw;
    rate_limit?: Record<string, { rpm?: number; enabled?: boolean }>;
  };
}

export interface ProviderConfig {
  base_url: string;
  api_key?: string;
  api_key_env?: string;
  models: string[];
}

export interface ResolvedProvider {
  name: string;
  base_url: string;
  api_key: string;
}

export interface CircuitBreakerConfigRaw {
  failure_threshold?: number;
  reset_timeout_ms?: number;
  half_open_max_requests?: number;
}

export interface RetryConfigRaw {
  max_retries?: number;
  base_delay_ms?: number;
  max_delay_ms?: number;
  retryable_statuses?: number[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxRequests: number;
}

export interface RequestMetrics {
  timestamp: number;
  model: string;
  provider: string;
  actualModel: string;
  latencyMs: number;
  status: number;
  streaming: boolean;
  error?: string;
}

export interface QuotaInfo {
  provider: string;
  available: boolean;
  usedPercent?: number;
  balance?: number;
  summary: string;
}
