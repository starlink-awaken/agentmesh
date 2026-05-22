import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { OllamaProvider } from './providers/ollama.js';
import { LMStudioProvider } from './providers/lm-studio.js';
import { LlamaCppProvider } from './providers/llama-cpp.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { ModelRegistry } from './registry.js';
import { ModelScheduler } from './scheduler.js';
import type { SchedulerConfig } from './types.js';

// ── 配置接口 ──

export interface ModelsConfig {
  local: {
    ollama?: { enabled: boolean; base_url?: string };
    lm_studio?: { enabled: boolean; base_url?: string };
    llama_cpp?: { enabled: boolean; instances?: { name: string; port: number; model_path?: string }[] };
  };
  cloud: {
    openai?: { enabled: boolean; api_key_env?: string; base_url?: string };
    anthropic?: { enabled: boolean; api_key_env?: string; base_url?: string };
    openrouter?: { enabled: boolean; api_key_env?: string };
  };
  model_overrides?: {
    id_prefix: string;
    avg_latency_ms?: number;
    cost_per_1k_input?: number;
    cost_per_1k_output?: number;
  }[];
  scheduler?: Partial<SchedulerConfig>;
}

// ── 文件搜索路径 ──

function findConfigFile(): string {
  const candidates = [
    './config/models.yaml',
    './config/models.yml',
    resolve(process.cwd(), 'config/models.yaml'),
    resolve(process.cwd(), 'config/models.yml'),
    resolve(process.cwd(), '..', 'config', 'models.yaml'),
    resolve(process.cwd(), '..', '..', 'config', 'models.yaml'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return '';
}

// ── 加载器 ──

export function loadModelsConfig(configPath?: string): ModelsConfig {
  const path = configPath || findConfigFile();
  if (!path) {
    console.warn('[ModelCfg] No models.yaml found, using defaults (local only)');
    return defaults();
  }
  try {
    const raw = parse(readFileSync(path, 'utf-8')) as ModelsConfig;
    console.log(`[ModelCfg] Loaded from: ${path}`);
    return raw;
  } catch {
    console.warn(`[ModelCfg] Failed to load ${path}, using defaults`);
    return defaults();
  }
}

function defaults(): ModelsConfig {
  return {
    local: { ollama: { enabled: true }, lm_studio: { enabled: true }, llama_cpp: { enabled: true } },
    cloud: {},
  };
}

export function getEnv(key: string): string {
  return process.env[key] || '';
}

// ── 配置 → 初始化 ──

export interface InitResult {
  registry: ModelRegistry;
  scheduler: ModelScheduler;
  config: ModelsConfig;
}

/** 读取配置，初始化 Provider，返回 Registry + Scheduler */
export function initFromConfig(configPath?: string): InitResult {
  const config = loadModelsConfig(configPath);
  const registry = new ModelRegistry();

  // 本地 Provider
  const local = config.local;
  if (local?.ollama?.enabled) {
    registry.register(new OllamaProvider(local.ollama.base_url));
  }
  if (local?.lm_studio?.enabled) {
    registry.register(new LMStudioProvider(local.lm_studio.base_url));
  }
  if (local?.llama_cpp?.enabled) {
    registry.register(new LlamaCppProvider(local.llama_cpp.instances?.map(i => ({
      name: i.name,
      port: i.port,
      modelPath: i.model_path || '',
    }))));
  }

  // 云端 Provider
  const cloud = config.cloud;
  if (cloud?.openai?.enabled) {
    const key = getEnv(cloud.openai.api_key_env || 'OPENAI_API_KEY');
    if (key) registry.register(new OpenAIProvider(key, cloud.openai.base_url));
    else console.warn('[ModelCfg] OpenAI enabled but no API key found');
  }
  if (cloud?.anthropic?.enabled) {
    const key = getEnv(cloud.anthropic.api_key_env || 'ANTHROPIC_API_KEY');
    if (key) registry.register(new AnthropicProvider(key, cloud.anthropic.base_url));
    else console.warn('[ModelCfg] Anthropic enabled but no API key found');
  }
  if (cloud?.openrouter?.enabled) {
    const key = getEnv(cloud.openrouter.api_key_env || 'OPENROUTER_API_KEY');
    if (key) registry.register(new OpenRouterProvider(key));
    else console.warn('[ModelCfg] OpenRouter enabled but no API key found');
  }

  // 调度器
  const schedCfg: Partial<SchedulerConfig> = {};
  const raw = config.scheduler as any;
  if (raw) {
    if (raw.default_policy) schedCfg.defaultPolicy = raw.default_policy;
    if (raw.health_check_interval_ms) schedCfg.healthCheckIntervalMs = raw.health_check_interval_ms;
    if (raw.cost_weight !== undefined) schedCfg.costWeight = raw.cost_weight;
    if (raw.speed_weight !== undefined) schedCfg.speedWeight = raw.speed_weight;
    if (raw.capability_weight !== undefined) schedCfg.capabilityWeight = raw.capability_weight;
  }
  const scheduler = new ModelScheduler(registry, schedCfg);
  registry.setScheduler(scheduler);

  // 应用模型元数据覆盖（成本/延迟）
  const overrides = config.model_overrides;
  if (overrides?.length) {
    const origRefresh = registry.refresh.bind(registry);
    registry.refresh = async () => {
      const models = await origRefresh();
      for (const m of models) {
        // 最长前缀匹配
        const match = overrides
          .filter(o => m.id.includes(o.id_prefix))
          .sort((a, b) => b.id_prefix.length - a.id_prefix.length)[0];
        if (match) {
          if (match.avg_latency_ms !== undefined) m.avgLatencyMs = match.avg_latency_ms;
          if (match.cost_per_1k_input !== undefined || match.cost_per_1k_output !== undefined) {
            m.costPer1KTokens = {
              input: match.cost_per_1k_input ?? 0,
              output: match.cost_per_1k_output ?? 0,
            };
          }
        }
      }
      return models;
    };
  }

  return { registry, scheduler, config };
}
