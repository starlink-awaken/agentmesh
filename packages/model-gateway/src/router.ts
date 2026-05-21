import type { ModelGatewayConfig, ResolvedProvider } from './types.js';
import { circuitBreakerRegistry } from './circuit-breaker.js';

let modelAliases: Record<string, Record<string, string>> = {};
let config: ModelGatewayConfig;

export function initModelRouter(cfg: ModelGatewayConfig): void {
  config = cfg;

  if (cfg.model_aliases) {
    for (const [aliasKey, realModel] of Object.entries(cfg.model_aliases)) {
      for (const [providerName, providerCfg] of Object.entries(config.providers)) {
        const providerModels = providerCfg.models || [];
        if (providerModels.includes(realModel as string)) {
          modelAliases[providerName] = modelAliases[providerName] || {};
          modelAliases[providerName][aliasKey] = realModel as string;
          break;
        }
      }
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

export function resolveProvider(model: string): ResolvedProvider | null {
  if (!config) return null;

  for (const [pattern, providers] of Object.entries(config.model_routing)) {
    if (model.startsWith(pattern)) {
      for (const providerName of providers) {
        const providerCfg = config.providers[providerName];
        if (!providerCfg) continue;

        const apiKey = resolveApiKey(providerName, providerCfg);
        if (!apiKey) continue;
        if (circuitBreakerRegistry.isOpen(providerName)) continue;

        return { name: providerName, base_url: providerCfg.base_url, api_key: apiKey };
      }
      break;
    }
  }

  for (const providerName of config.fallback_chain) {
    const providerCfg = config.providers[providerName];
    if (!providerCfg) continue;

    const apiKey = resolveApiKey(providerName, providerCfg);
    if (!apiKey) continue;
    if (circuitBreakerRegistry.isOpen(providerName)) continue;

    return { name: providerName, base_url: providerCfg.base_url, api_key: apiKey };
  }

  for (const [name, cfg] of Object.entries(config.providers)) {
    if (circuitBreakerRegistry.isOpen(name)) continue;
    const key = resolveApiKey(name, cfg);
    if (key) return { name, base_url: cfg.base_url, api_key: key };
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
    return (globalThis as any).process?.env?.[providerCfg.api_key_env] || null;
  }
  return null;
}
