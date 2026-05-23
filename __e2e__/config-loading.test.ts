/**
 * ISC-3: 端到端测试 — 配置文件加载
 *
 * 验证 gateway.yaml + models.yaml 配置文件的加载、解析、
 * 结构化校验和热重载能力。
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { parse } from 'yaml';

// Import gateway config loader
import { loadConfig, reloadConfig, loadAppConfig, reloadAppConfig } from '../packages/gateway/src/core/config.js';

// Import model-orchestrator config loader via relative path
// (workspace package name not resolvable from __e2e__/ directly)
import { loadModelsConfig } from '../packages/model-orchestrator/src/loader.js';

// Helper: path to config directory
const CONFIG_DIR = resolve(import.meta.dirname, '..', 'config');

describe('E2E: Configuration Loading', () => {
  // ── File Existence ──

  test('gateway.yaml exists and is valid YAML', () => {
    const configPath = join(CONFIG_DIR, 'gateway.yaml');
    expect(existsSync(configPath)).toBe(true);

    const raw = readFileSync(configPath, 'utf-8');
    expect(raw.length).toBeGreaterThan(0);

    const parsed = parse(raw);
    expect(parsed).toHaveProperty('host');
    expect(parsed).toHaveProperty('port');
    expect(parsed).toHaveProperty('agents');
    expect(Array.isArray(parsed.agents)).toBe(true);
  });

  test('models.yaml exists and is valid YAML', () => {
    const configPath = join(CONFIG_DIR, 'models.yaml');
    expect(existsSync(configPath)).toBe(true);

    const raw = readFileSync(configPath, 'utf-8');
    expect(raw.length).toBeGreaterThan(0);

    const parsed = parse(raw);
    expect(parsed).toHaveProperty('local');
    expect(parsed).toHaveProperty('cloud');
    expect(parsed).toHaveProperty('circuit_breaker');
    expect(parsed).toHaveProperty('retry');
    expect(parsed).toHaveProperty('scheduler');
  });

  // ── Gateway Config Structure ──

  test('loadConfig() returns valid gateway configuration', () => {
    const config = loadConfig();

    expect(config).toHaveProperty('host');
    expect(config).toHaveProperty('port');
    expect(typeof config.host).toBe('string');
    expect(typeof config.port).toBe('number');

    expect(config).toHaveProperty('agents');
    expect(Array.isArray(config.agents)).toBe(true);

    expect(config).toHaveProperty('routing');
    expect(config.routing).toHaveProperty('defaultAgent');
    expect(config.routing).toHaveProperty('rules');
    expect(Array.isArray(config.routing.rules)).toBe(true);
  });

  test('gateway.yaml specifies port 3000', () => {
    const config = loadConfig();
    expect(config.port).toBe(3000);
  });

  test('gateway.yaml specifies host 0.0.0.0', () => {
    const config = loadConfig();
    expect(config.host).toBe('0.0.0.0');
  });

  test('agents have required fields (id, name, capabilities)', () => {
    const config = loadConfig();
    for (const agent of config.agents) {
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('capabilities');
      expect(Array.isArray(agent.capabilities)).toBe(true);
    }
  });

  test('routing rules have required fields', () => {
    const config = loadConfig();
    for (const rule of config.routing.rules) {
      expect(rule).toHaveProperty('name');
      expect(rule).toHaveProperty('keywords');
      expect(Array.isArray(rule.keywords)).toBe(true);
      expect(rule).toHaveProperty('priority');
      expect(typeof rule.priority).toBe('number');
    }
  });

  // ── Models Config Structure ──

  test('loadModelsConfig() returns valid models configuration', () => {
    const config = loadModelsConfig();

    expect(config).toHaveProperty('local');
    expect(config).toHaveProperty('cloud');
    expect(config).toHaveProperty('circuit_breaker');
    expect(config).toHaveProperty('retry');
    expect(config).toHaveProperty('scheduler');
  });

  test('models.yaml has local providers configured', () => {
    const config = loadModelsConfig();

    expect(config.local).toHaveProperty('ollama');
    expect(config.local).toHaveProperty('lm_studio');
    expect(config.local).toHaveProperty('llama_cpp');
  });

  test('models.yaml has cloud providers configured', () => {
    const config = loadModelsConfig();
    expect(config.cloud).toHaveProperty('openai');
    expect(config.cloud).toHaveProperty('anthropic');
    expect(config.cloud).toHaveProperty('openrouter');
    expect(config.cloud).toHaveProperty('deepseek');
  });

  test('models.yaml has circuit breaker configuration', () => {
    const config = loadModelsConfig();
    const cb = config.circuit_breaker;
    expect(cb).toBeDefined();
    expect(cb).toHaveProperty('failure_threshold');
    expect(cb).toHaveProperty('reset_timeout_ms');
    expect(cb).toHaveProperty('half_open_max_requests');
  });

  test('models.yaml has retry configuration', () => {
    const config = loadModelsConfig();
    const retry = config.retry;
    expect(retry).toBeDefined();
    expect(retry).toHaveProperty('max_retries');
    expect(retry).toHaveProperty('base_delay_ms');
    expect(retry).toHaveProperty('max_delay_ms');
    expect(retry).toHaveProperty('retryable_statuses');
    expect(Array.isArray(retry.retryable_statuses)).toBe(true);
  });

  test('models.yaml has scheduler configuration', () => {
    const config = loadModelsConfig();
    const sched = config.scheduler;
    expect(sched).toBeDefined();
    expect(sched).toHaveProperty('default_policy');
    expect(sched).toHaveProperty('health_check_interval_ms');
    expect(sched).toHaveProperty('cost_weight');
    expect(sched).toHaveProperty('speed_weight');
    expect(sched).toHaveProperty('capability_weight');
  });

  // ── Config Consistency ──

  test('loadConfig() can be called multiple times and returns consistent results', () => {
    const config1 = loadConfig();
    const config2 = loadConfig();
    const config3 = loadConfig();

    expect(config1.port).toBe(config2.port);
    expect(config2.port).toBe(config3.port);
    expect(config1.host).toBe(config2.host);
    expect(config2.agents.length).toBe(config3.agents.length);
  });

  test('reloadConfig() returns consistent configuration', () => {
    const config = reloadConfig();
    expect(config).toHaveProperty('host');
    expect(config).toHaveProperty('port');
    expect(config.port).toBe(3000);
  });

  // ── Relaxed YAML compatibility ──

  test('models.yaml uses snake_case convention for YAML keys', () => {
    const raw = readFileSync(join(CONFIG_DIR, 'models.yaml'), 'utf-8');
    // Keys like "failure_threshold", "reset_timeout_ms" should be present
    expect(raw).toContain('failure_threshold');
    expect(raw).toContain('reset_timeout_ms');
    expect(raw).toContain('half_open_max_requests');
    expect(raw).toContain('default_policy');
    expect(raw).toContain('health_check_interval_ms');
  });

  // ── Unified Config (loadAppConfig) ──

  test('loadAppConfig() returns AppConfig with gateway and models sections', () => {
    const appCfg = loadAppConfig();

    expect(appCfg).toHaveProperty('gateway');
    expect(appCfg).toHaveProperty('models');
    expect(appCfg.gateway).toHaveProperty('port');
    expect(appCfg.gateway).toHaveProperty('host');
    expect(appCfg.gateway).toHaveProperty('agents');
    expect(appCfg.models).toHaveProperty('local');
    expect(appCfg.models).toHaveProperty('cloud');
  });

  test('loadAppConfig().gateway matches loadConfig()', () => {
    const appCfg = loadAppConfig();
    const legacyCfg = loadConfig();

    expect(appCfg.gateway.port).toBe(legacyCfg.port);
    expect(appCfg.gateway.host).toBe(legacyCfg.host);
    expect(appCfg.gateway.agents.length).toBe(legacyCfg.agents.length);
    expect(appCfg.gateway.routing.rules.length).toBe(legacyCfg.routing.rules.length);
  });

  test('reloadAppConfig() returns consistent configuration', () => {
    const appCfg = reloadAppConfig();
    expect(appCfg.gateway.port).toBe(3000);
    expect(appCfg.gateway.host).toBe('0.0.0.0');
    expect(appCfg.models.local.ollama?.enabled).toBe(true);
  });
});
