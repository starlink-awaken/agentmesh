/**
 * Local Reflex Module - 本地反射系统
 *
 * 端云协同：本地小模型处理高频任务，云端大模型处理复杂决策
 * 源自 Advanced RAG + Local Reflex 架构
 *
 * 核心组件：
 * - OllamaClient: 本地模型客户端
 * - GrammarEnforcer: 语法约束生成器（强制 JSON 输出）
 * - PromptCompressor: Prompt 压缩器（节约 50-70% Token）
 * - IdleProcessor: 空闲处理器（主动式"做梦"）
 */
export { OllamaClient, createOllamaClient } from './OllamaClient.js';
export { GrammarEnforcer, createGrammarEnforcer } from './GrammarEnforcer.js';
export { PromptCompressor, createPromptCompressor } from './PromptCompressor.js';
export { IdleProcessor, createIdleProcessor } from './IdleProcessor.js';

export * from './types.js';

/**
 * 创建完整的本地反射系统
 */
import { OllamaClient } from './OllamaClient.js';
import { GrammarEnforcer } from './GrammarEnforcer.js';
import { PromptCompressor } from './PromptCompressor.js';
import { IdleProcessor } from './IdleProcessor.js';

export interface LocalReflexSystem {
  ollama: OllamaClient;
  grammar: GrammarEnforcer;
  compressor: PromptCompressor;
  idle: IdleProcessor;
}

export function createLocalReflexSystem(config?: {
  ollama?: { baseUrl?: string; model?: string };
  grammar?: { schema: Record<string, unknown> };
  compressor?: { ratio?: number };
  idle?: { checkIntervalMs?: number; idleThresholdMs?: number };
}): LocalReflexSystem {
  return {
    ollama: new OllamaClient(config?.ollama),
    grammar: new GrammarEnforcer(config?.grammar || { schema: { type: 'object' } }),
    compressor: new PromptCompressor(config?.compressor),
    idle: new IdleProcessor(config?.idle),
  };
}
