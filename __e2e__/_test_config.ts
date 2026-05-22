import { loadConfig, reloadConfig, getConfig } from '../packages/gateway/src/core/config.js';
import { GatewayContainer } from '../packages/gateway/src/core/gateway.js';
console.log('Config imports OK');
const cfg = loadConfig();
console.log('Config:', cfg.host, cfg.port);
console.log('TEST OK');
