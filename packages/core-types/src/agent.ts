/** Agent 执行类型 */
export type AgentType = 'claude-code' | 'openclaw' | 'process' | 'http';

/** Agent 层级（对应 Honeycomb 四层架构） */
export type AgentLayer = 'L1' | 'L2' | 'L3' | 'L4' | 'governance';

/** Agent 状态 */
export type AgentStatus = 'online' | 'offline' | 'busy' | 'error';

/** Agent 定义 */
export interface AgentDefinition {
  id: string;
  name: string;
  type: AgentType;
  capabilities: string[];
  status?: AgentStatus;
  layer?: AgentLayer;
  endpoint?: string;
  metadata?: Record<string, unknown>;
}

/** Agent 消息 */
export interface AgentMessage {
  id?: string;
  type: 'request' | 'response' | 'event';
  source: string;
  target?: string;
  payload: unknown;
  correlationId?: string;
  timestamp?: number;
}
