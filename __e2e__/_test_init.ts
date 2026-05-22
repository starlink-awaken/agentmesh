import { loadConfig } from '../packages/gateway/src/core/config.js';
import { GatewayContainer } from '../packages/gateway/src/core/gateway.js';
import { apiRoutes } from '../packages/gateway/src/routes/api.js';
import { sseRoutes } from '../packages/gateway/src/routes/sse.js';
import { initFromConfig, loadModelsConfig } from '@agentmesh/model-orchestrator';
console.log('All imports OK');

// Test config loading
const cfg = loadConfig();
console.log('Config loaded:', cfg.host, cfg.port);

// Test models config
const mc = loadModelsConfig();
console.log('Models config loaded:', Object.keys(mc));

// Test initFromConfig
const orch = initFromConfig();
console.log('Model orchestrator initialized:', Object.keys(orch));

console.log('ALL INITS OK');
