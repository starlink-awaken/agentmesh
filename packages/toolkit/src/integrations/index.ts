/**
 * Integrations 模块 - 统一导出
 *
 * @author PAI
 * @version 1.0.0
 */

export { PublicAPIs } from './PublicAPIs.js';
export type { PublicAPI, SearchOptions } from './PublicAPIs.js';

export { MCPServers, MCPDiscovery } from './MCPServers.js';
export type {
  MCPServer as MCPServerInfo,
  MCPCategory,
  MCPConfig,
  MCPDiscoveryOptions,
  MCPServerConnection,
  MCPTool,
} from './MCPServers.js';

export { MCPServer } from './MCPServer.js';
export type {
  MCPServerConfig,
  MCPTool as MCPServerToolDefinition,
  MCPServerInfo as ServerInfo,
} from './MCPServer.js';

export { WorkspaceMCPClient } from './WorkspaceMCPClient.js';
export type {
  WorkspaceMCPService,
  ConnectedMCPService,
} from './WorkspaceMCPClient.js';

export * from './mcp-tools.js';
