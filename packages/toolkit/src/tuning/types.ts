/**
 * Tuning Types - 分层缓存与微调类型定义
 */

import type { AgentTool } from '../tools/types.js';

/**
 * TuningFeedback - 微调反馈
 */
export interface TuningFeedback {
  id: string;
  input: unknown;
  expectedOutput: unknown;
  actualOutput: unknown;
  score: number;
  timestamp: number;
  context?: Record<string, unknown>;
}

/**
 * CacheEntry - 缓存条目
 */
export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
  metadata?: Record<string, unknown>;
}

/**
 * CacheTier - 缓存层级
 */
export type CacheTier = 'memory' | 'disk' | 'remote';

/**
 * TuningFeedback - 反馈收集
 */
export interface TuningFeedback {
  id: string;
  input: unknown;
  expectedOutput: unknown;
  actualOutput: unknown;
  score: number;
  timestamp: number;
  context?: Record<string, unknown>;
}

/**
 * FineTuneConfig - 微调配置
 */
export interface FineTuneConfig {
  modelId: string;
  trainingData: TuningFeedback[];
  epochs: number;
  batchSize: number;
  learningRate: number;
}

/**
 * CacheConfig - 缓存配置
 */
export interface CacheConfig {
  tier: CacheTier;
  maxSize: number;
  ttl: number;
  evictionPolicy: 'lru' | 'lfu' | 'fifo';
}
