/**
 * Config Validation — Runtime config schema validation.
 *
 * Pure function, no external dependencies.
 * Validates config objects parsed from YAML, catches type errors,
 * missing required fields, and unknown/misspelled keys.
 */
export interface ConfigValidationError {
  path: string;
  message: string;
}

export interface ConfigValidationWarning {
  path: string;
  message: string;
}

export interface ConfigValidation {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings: ConfigValidationWarning[];
}

// ── Helpers ──

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isPositiveInteger(val: unknown): val is number {
  return typeof val === 'number' && Number.isInteger(val) && val > 0;
}

function isString(val: unknown): val is string {
  return typeof val === 'string';
}

function isBoolean(val: unknown): val is boolean {
  return typeof val === 'boolean';
}

function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every(v => typeof v === 'string');
}

// ── Known field sets (for typo/warning detection) ──

const GATEWAY_KNOWN_FIELDS = new Set([
  'port', 'wsPort', 'host', 'dataDir', 'logDir', 'logLevel',
  'routing', 'agents', 'models',
]);

const AGENT_KNOWN_FIELDS = new Set([
  'id', 'name', 'type', 'command', 'args', 'env', 'endpoint', 'capabilities',
]);

const ROUTING_KNOWN_FIELDS = new Set([
  'defaultAgent', 'rules',
]);

const RULE_KNOWN_FIELDS = new Set([
  'name', 'keywords', 'agent', 'strategy', 'agents', 'priority',
]);

const MODELS_KNOWN_FIELDS = new Set([
  'local', 'cloud', 'model_overrides', 'circuit_breaker', 'retry', 'scheduler',
]);

const CLOUD_PROVIDER_KNOWN_FIELDS = new Set([
  'enabled', 'api_key_env', 'base_url',
]);

const CIRCUIT_BREAKER_KNOWN_FIELDS = new Set([
  'enabled', 'failure_threshold', 'reset_timeout_ms', 'half_open_max_requests',
]);

const RETRY_KNOWN_FIELDS = new Set([
  'enabled', 'max_retries', 'base_delay_ms', 'max_delay_ms', 'retryable_statuses',
]);

const SCHEDULER_KNOWN_FIELDS = new Set([
  'default_policy', 'health_check_interval_ms',
  'cost_weight', 'speed_weight', 'capability_weight',
]);

const LOCAL_PROVIDER_KNOWN_FIELDS = new Set([
  'enabled', 'base_url', 'instances',
]);


const MODEL_OVERRIDE_KNOWN_FIELDS = new Set([
  'id_prefix', 'avg_latency_ms', 'cost_per_1k_input', 'cost_per_1k_output',
]);

// ── Check for unknown keys ──

function checkUnknownKeys(
  path: string,
  obj: Record<string, unknown>,
  known: Set<string>,
  warnings: ConfigValidationWarning[],
): void {
  for (const key of Object.keys(obj)) {
    if (!known.has(key)) {
      warnings.push({
        path: `${path}.${key}`,
        message: `unknown key "${key}" — possible misspelling`,
      });
    }
  }
}

// ── Validate routing rules ──

function validateRoutingRules(
  path: string,
  rules: unknown,
  errors: ConfigValidationError[],
  warnings: ConfigValidationWarning[],
): void {
  if (!Array.isArray(rules)) {
    errors.push({ path, message: 'must be an array of routing rules' });
    return;
  }

  for (let i = 0; i < rules.length; i++) {
    const rulePath = `${path}[${i}]`;
    const rule = rules[i];

    if (!isObject(rule)) {
      errors.push({ path: rulePath, message: 'must be an object' });
      continue;
    }

    checkUnknownKeys(rulePath, rule, RULE_KNOWN_FIELDS, warnings);

    if (!isString(rule.name) || rule.name === '') {
      errors.push({ path: `${rulePath}.name`, message: 'missing or empty — must be a non-empty string' });
    }

    if (!isStringArray(rule.keywords) || rule.keywords.length === 0) {
      errors.push({ path: `${rulePath}.keywords`, message: 'missing or empty — must be a non-empty array of strings' });
    }

    if (rule.priority === undefined || !isPositiveInteger(rule.priority)) {
      errors.push({ path: `${rulePath}.priority`, message: 'missing or invalid — must be a positive integer' });
    }
  }
}

// ── Validate agents ──

function validateAgents(
  path: string,
  agents: unknown,
  errors: ConfigValidationError[],
  warnings: ConfigValidationWarning[],
): void {
  if (!Array.isArray(agents)) {
    errors.push({ path, message: 'must be an array of agent configs' });
    return;
  }

  for (let i = 0; i < agents.length; i++) {
    const agentPath = `${path}[${i}]`;
    const agent = agents[i];

    if (!isObject(agent)) {
      errors.push({ path: agentPath, message: 'must be an object' });
      continue;
    }

    checkUnknownKeys(agentPath, agent, AGENT_KNOWN_FIELDS, warnings);

    if (!isString(agent.id) || agent.id === '') {
      errors.push({ path: `${agentPath}.id`, message: 'missing or empty — must be a non-empty string' });
    }
    if (!isString(agent.name) || agent.name === '') {
      errors.push({ path: `${agentPath}.name`, message: 'missing or empty — must be a non-empty string' });
    }
    if (!isString(agent.type) || agent.type === '') {
      errors.push({ path: `${agentPath}.type`, message: 'missing or empty — must be a non-empty string' });
    }
    if (agent.capabilities === undefined) {
      errors.push({ path: `${agentPath}.capabilities`, message: 'missing — must be an array of strings' });
    } else if (!isStringArray(agent.capabilities)) {
      errors.push({ path: `${agentPath}.capabilities`, message: 'must be an array of strings' });
    }
  }
}

// ── Validate models.cloud section ──

function validateCloudSection(
  path: string,
  cloud: unknown,
  errors: ConfigValidationError[],
  warnings: ConfigValidationWarning[],
): void {
  if (!isObject(cloud)) {
    errors.push({ path, message: 'must be an object mapping provider names to configs' });
    return;
  }

  for (const [provider, cfg] of Object.entries(cloud)) {
    const providerPath = `${path}.${provider}`;
    if (!isObject(cfg)) {
      errors.push({ path: providerPath, message: 'must be an object' });
      continue;
    }
    checkUnknownKeys(providerPath, cfg, CLOUD_PROVIDER_KNOWN_FIELDS, warnings);

    if (cfg.enabled !== undefined && !isBoolean(cfg.enabled)) {
      errors.push({ path: `${providerPath}.enabled`, message: `must be a boolean, got ${typeof cfg.enabled}` });
    }
  }
}

// ── Validate models.local section ──

function validateLocalSection(
  path: string,
  local: unknown,
  errors: ConfigValidationError[],
  warnings: ConfigValidationWarning[],
): void {
  if (!isObject(local)) {
    errors.push({ path, message: 'must be an object mapping provider names to configs' });
    return;
  }

  for (const [provider, cfg] of Object.entries(local)) {
    const providerPath = `${path}.${provider}`;
    if (!isObject(cfg)) {
      errors.push({ path: providerPath, message: 'must be an object' });
      continue;
    }
    checkUnknownKeys(providerPath, cfg, LOCAL_PROVIDER_KNOWN_FIELDS, warnings);
  }
}

// ── Validate models.circuit_breaker ──

function validateCircuitBreaker(
  path: string,
  cb: unknown,
  warnings: ConfigValidationWarning[],
): void {
  if (!isObject(cb)) return;
  checkUnknownKeys(path, cb, CIRCUIT_BREAKER_KNOWN_FIELDS, warnings);
}

// ── Validate models.retry ──

function validateRetry(
  path: string,
  retry: unknown,
  warnings: ConfigValidationWarning[],
): void {
  if (!isObject(retry)) return;
  checkUnknownKeys(path, retry, RETRY_KNOWN_FIELDS, warnings);
}

// ── Validate models.scheduler ──

function validateScheduler(
  path: string,
  sched: unknown,
  warnings: ConfigValidationWarning[],
): void {
  if (!isObject(sched)) return;
  checkUnknownKeys(path, sched, SCHEDULER_KNOWN_FIELDS, warnings);
}

// ── Validate models.model_overrides ──

function validateModelOverrides(
  path: string,
  overrides: unknown,
  warnings: ConfigValidationWarning[],
): void {
  if (!Array.isArray(overrides)) return;
  for (let i = 0; i < overrides.length; i++) {
    const itemPath = `${path}[${i}]`;
    const item = overrides[i];
    if (isObject(item)) {
      checkUnknownKeys(itemPath, item, MODEL_OVERRIDE_KNOWN_FIELDS, warnings);
    }
  }
}

// ── Validate models section ──

function validateModelsSection(
  path: string,
  models: unknown,
  errors: ConfigValidationError[],
  warnings: ConfigValidationWarning[],
): void {
  if (models === undefined) return; // optional top-level models config

  if (!isObject(models)) {
    errors.push({ path, message: 'must be an object' });
    return;
  }

  checkUnknownKeys(path, models, MODELS_KNOWN_FIELDS, warnings);

  // Validate cloud section
  if (models.cloud !== undefined) {
    validateCloudSection(`${path}.cloud`, models.cloud, errors, warnings);
  }

  // Validate local section
  if (models.local !== undefined) {
    validateLocalSection(`${path}.local`, models.local, errors, warnings);
  }

  // Validate circuit_breaker section
  if (models.circuit_breaker !== undefined) {
    validateCircuitBreaker(`${path}.circuit_breaker`, models.circuit_breaker, warnings);
  }

  // Validate retry section
  if (models.retry !== undefined) {
    validateRetry(`${path}.retry`, models.retry, warnings);
  }

  // Validate scheduler section
  if (models.scheduler !== undefined) {
    validateScheduler(`${path}.scheduler`, models.scheduler, warnings);
  }

  // Validate model_overrides section
  if (models.model_overrides !== undefined) {
    validateModelOverrides(`${path}.model_overrides`, models.model_overrides, warnings);
  }
}

// ── Main validator ──

/**
 * Validate a gateway config (AppConfig) at runtime.
 *
 * Checks type correctness, required fields, and warns about
 * unknown/misspelled keys. Does not throw — returns validation results.
 */
export function validateGatewayConfig(config: unknown): ConfigValidation {
  const errors: ConfigValidationError[] = [];
  const warnings: ConfigValidationWarning[] = [];

  if (!isObject(config)) {
    errors.push({ path: '(root)', message: 'config must be an object' });
    return { valid: false, errors, warnings };
  }

  const gateway = (config as Record<string, unknown>).gateway;
  if (gateway !== undefined) {
    validateGatewaySection('config.gateway', gateway, errors, warnings);
  }

  const models = (config as Record<string, unknown>).models;
  if (models !== undefined) {
    validateModelsSection('config.models', models, errors, warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateGatewaySection(
  path: string,
  gateway: unknown,
  errors: ConfigValidationError[],
  warnings: ConfigValidationWarning[],
): void {
  if (!isObject(gateway)) {
    errors.push({ path, message: 'must be an object' });
    return;
  }

  checkUnknownKeys(path, gateway, GATEWAY_KNOWN_FIELDS, warnings);

  // port
  if (gateway.port !== undefined && !isPositiveInteger(gateway.port)) {
    errors.push({ path: `${path}.port`, message: `must be a positive integer, got "${gateway.port}"` });
  }

  // wsPort
  if (gateway.wsPort !== undefined && !isPositiveInteger(gateway.wsPort)) {
    errors.push({ path: `${path}.wsPort`, message: `must be a positive integer, got "${gateway.wsPort}"` });
  }

  // host
  if (gateway.host !== undefined && !isString(gateway.host)) {
    errors.push({ path: `${path}.host`, message: `must be a string, got ${typeof gateway.host}` });
  }

  // dataDir
  if (gateway.dataDir !== undefined && !isString(gateway.dataDir)) {
    errors.push({ path: `${path}.dataDir`, message: `must be a string, got ${typeof gateway.dataDir}` });
  }

  // logDir
  if (gateway.logDir !== undefined && !isString(gateway.logDir)) {
    errors.push({ path: `${path}.logDir`, message: `must be a string, got ${typeof gateway.logDir}` });
  }

  // logLevel
  if (gateway.logLevel !== undefined && !isString(gateway.logLevel)) {
    errors.push({ path: `${path}.logLevel`, message: `must be a string, got ${typeof gateway.logLevel}` });
  }

  // routing
  if (gateway.routing !== undefined) {
    const routingPath = `${path}.routing`;
    if (!isObject(gateway.routing)) {
      errors.push({ path: routingPath, message: 'must be an object' });
    } else {
      checkUnknownKeys(routingPath, gateway.routing, ROUTING_KNOWN_FIELDS, warnings);
      if (gateway.routing.rules !== undefined) {
        validateRoutingRules(`${routingPath}.rules`, gateway.routing.rules, errors, warnings);
      }
    }
  }

  // agents
  if (gateway.agents !== undefined) {
    validateAgents(`${path}.agents`, gateway.agents, errors, warnings);
  }

  // models
  if (gateway.models !== undefined) {
    validateModelsSection(`${path}.models`, gateway.models, errors, warnings);
  }
}
