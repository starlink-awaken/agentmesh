/** 模型 Provider 类型 */
export type ModelProvider =
  | 'ollama'
  | 'lm-studio'
  | 'llama-cpp'
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'google'
  | 'custom';

/** 模型部署位置 */
export type ModelLocation = 'local' | 'cloud';

/** 模型能力 */
export type ModelCapability =
  | 'chat'
  | 'completion'
  | 'embedding'
  | 'vision'
  | 'tools'
  | 'streaming';

/** 模型描述 */
export interface ModelDescriptor {
  id: string;
  name: string;
  provider: ModelProvider;
  location: ModelLocation;
  capabilities: ModelCapability[];
  contextWindow: number;
  costPer1KTokens?: { input: number; output: number };
  avgLatencyMs?: number;
  isAvailable: boolean;
  metadata?: Record<string, unknown>;
}

/** 模型路由策略 */
export interface ModelRoutePolicy {
  strategy: 'cost-first' | 'speed-first' | 'capability-first' | 'balanced';
  priority: string[];
  fallbackChain: string[];
}

/** 模型选择请求 */
export interface ModelSelectionRequest {
  task: string;
  requiredCapabilities: ModelCapability[];
  preferredProvider?: ModelProvider;
  policy?: Partial<ModelRoutePolicy>;
}

/** 模型选择结果 */
export interface ModelSelection {
  model: ModelDescriptor;
  confidence: number;
  reasoning: string;
}

/** 聊天消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

/** 聊天请求 */
export interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

/** 聊天响应 */
export interface ChatResponse {
  id: string;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finishReason: string;
  }[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** 流式块 */
export interface StreamChunk {
  id: string;
  model: string;
  choices: {
    index: number;
    delta: { content?: string; role?: string };
    finishReason: string | null;
  }[];
}
