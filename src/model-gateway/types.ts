// 模型网关类型定义

export interface ModelProviderConfig {
  base_url: string;
  api_key_env?: string;
  api_key?: string;
  models?: string[];
}

export interface ModelGatewayConfig {
  default_model: string;
  providers: Record<string, ModelProviderConfig>;
  fallback_chain: string[];
  model_routing: Record<string, string[]>;
}

export interface ResolvedProvider {
  name: string;
  base_url: string;
  api_key: string;
}

export interface QuotaInfo {
  provider: string;
  available: boolean;
  usedPercent?: number;
  balance?: number;
  summary: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: string; content: string | any }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: any[];
  tool_choice?: any;
}

export interface ResponsesRequest {
  model: string;
  input: Array<{
    role?: string;
    type?: string;
    content?: string | any[];
  }>;
  stream?: boolean;
  tools?: any[];
  instructions?: string;
}
