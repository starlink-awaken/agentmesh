import type { ModelGatewayConfig, ResolvedProvider } from './types.js';
import { isProviderAvailable } from './quota.js';
import { circuitBreakerRegistry } from './circuit-breaker.js';

// 模型名重映射：对外模型名 → 实际 Provider 的模型名（可从 config 覆盖）
let modelAliases: Record<string, Record<string, string>> = {
  deepseek: {
    'gpt-5.3-codex': 'deepseek-v4-pro',
    'gpt-5.4': 'deepseek-v4-pro',
    'gpt-5.5': 'deepseek-v4-pro',
    'o4-mini': 'deepseek-v4-flash',
    'claude-sonnet-4-6': 'deepseek-v4-pro',
  },
};

let config: ModelGatewayConfig;

export function initModelRouter(cfg: ModelGatewayConfig): void {
  config = cfg;
  // 从 config 加载模型别名（覆盖默认）
  if (cfg.model_aliases) {
    // cfg.model_aliases: { "gpt-x": "deepseek-v4-pro", "claude-y": "claude-opus" }
    // 按目标模型名反查对应的 provider → 写入对应 provider 的别名表
    for (const [aliasKey, realModel] of Object.entries(cfg.model_aliases)) {
      for (const [providerName, providerCfg] of Object.entries(config.providers)) {
        const providerModels = providerCfg.models || [];
        if (providerModels.includes(realModel as string)) {
          modelAliases[providerName] = modelAliases[providerName] || {};
          modelAliases[providerName][aliasKey] = realModel as string;
          break;
        }
      }
      // 兜底：如果没匹配到任何 provider，放入 deepseek
      modelAliases.deepseek = modelAliases.deepseek || {};
      if (!modelAliases.deepseek[aliasKey]) {
        modelAliases.deepseek[aliasKey] = realModel as string;
      }
    }
  }
}

export function getConfig(): ModelGatewayConfig {
  return config;
}

// 解析 Provider，按优先级查找第一个可用的
export function resolveProvider(model: string): ResolvedProvider | null {
  if (!config) return null;

  // 1. 按 model_routing 配置查找
  const routingEntries = Object.entries(config.model_routing || {});
  for (const [pattern, providers] of routingEntries as [string, string[]][]) {
    if (model.startsWith(pattern)) {
      for (const providerName of providers) {
        const providerCfg = config.providers[providerName];
        if (!providerCfg) continue;

        const apiKey = resolveApiKey(providerName, providerCfg);
        if (!apiKey) continue;

        // 熔断器检查：跳过 OPEN 状态的 Provider
        if (circuitBreakerRegistry.isOpen(providerName)) continue;

        // codex 和 openai 特殊处理：检查 Codex Plus 配额
        if (providerName === 'openai') {
          const codexAvailable = isProviderAvailable('codex');
          if (!codexAvailable) continue; // Codex Plus 配额耗尽，跳过
        }

        return {
          name: providerName,
          base_url: providerCfg.base_url,
          api_key: apiKey,
        };
      }
      break;
    }
  }

  // 2. 全局 fallback 链
  for (const providerName of config.fallback_chain || []) {
    const providerCfg = config.providers[providerName];
    if (!providerCfg) continue;

    const apiKey = resolveApiKey(providerName, providerCfg);
    if (!apiKey) continue;

    // 熔断器检查：跳过 OPEN 状态的 Provider
    if (circuitBreakerRegistry.isOpen(providerName)) continue;

    return {
      name: providerName,
      base_url: providerCfg.base_url,
      api_key: apiKey,
    };
  }

  // 3. 终极兜底：第一个有 API Key 的 Provider（也检查熔断器）
  for (const [name, cfg] of Object.entries(config.providers)) {
    if (circuitBreakerRegistry.isOpen(name)) continue;
    const key = resolveApiKey(name, cfg);
    if (key) {
      return { name, base_url: cfg.base_url, api_key: key };
    }
  }

  return null;
}

export function remapModel(model: string, providerName: string): string {
  return modelAliases[providerName]?.[model] || model;
}

function resolveApiKey(_name: string, providerCfg: any): string | null {
  if (providerCfg.api_key && providerCfg.api_key !== '') {
    return providerCfg.api_key;
  }
  if (providerCfg.api_key_env) {
    return Bun.env[providerCfg.api_key_env] || null;
  }
  return null;
}
