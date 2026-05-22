import type { ModelProvider, ModelDescriptor } from '@agentmesh/core-types';

/** Provider 配置 */
export interface ProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
}

/** 聊天选项 */
export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

/** 聊天结果 */
export interface ChatResult {
  id: string;
  model: string;
  content: string;
  finishReason: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/** 流式块 */
export interface StreamChunk {
  id: string;
  model: string;
  content: string;
  finishReason: string | null;
}

/** 调度器配置 */
export interface SchedulerConfig {
  healthCheckIntervalMs: number;
  loadWindowSize: number;
  defaultPolicy: 'cost-first' | 'speed-first' | 'capability-first' | 'balanced';
  costWeight: number;
  speedWeight: number;
  capabilityWeight: number;
}

/** 模型请求 */
export interface ModelRequest {
  task: string;
  requiredCapabilities: string[];
  preferredProvider?: ModelProvider;
  policy?: Partial<import('@agentmesh/core-types').ModelRoutePolicy>;
}

/** 模型选择结果 */
export interface ModelSelection {
  model: ModelDescriptor;
  providerName: string;
  confidence: number;
  reasoning: string;
}

/** 负载信息 */
export interface LoadInfo {
  modelId: string;
  activeRequests: number;
  avgLatencyMs: number;
  lastChecked: number;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  healthCheckIntervalMs: 30_000,
  loadWindowSize: 10,
  defaultPolicy: 'balanced',
  costWeight: 0.3,
  speedWeight: 0.3,
  capabilityWeight: 0.4,
};
