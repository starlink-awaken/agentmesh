// Agent Gateway 通信协议类型定义

export type MessageType = 'request' | 'response' | 'event' | 'stream' | 'stream_end';
export type EventType =
  | 'agent.registered'
  | 'agent.unregistered'
  | 'task.submitted'
  | 'task.assigned'
  | 'task.started'
  | 'task.progress'
  | 'task.completed'
  | 'task.failed'
  | 'context.updated';

export interface ContextRef {
  shared_space_id: string;
  history?: string[];
  artifacts?: string[];
}

export interface Payload {
  task?: string;
  context?: ContextRef;
  files?: string[];
  options?: {
    stream?: boolean;
    timeout?: number;
  };
}

export interface Error {
  code: string;
  message: string;
}

export interface AgentMessage {
  id: string;
  type: MessageType;
  source: string;
  target: string;
  correlation_id: string;
  timestamp: number;
  payload?: Payload;
  event_type?: EventType;
  event_data?: Record<string, unknown>;
  result?: unknown;
  error?: Error;
}

export interface Agent {
  id: string;
  name: string;
  type: 'claude-code' | 'openclaw' | 'process' | 'http';
  capabilities: string[];
  status: 'online' | 'offline' | 'busy';
  endpoint?: string;
  lastSeen: number;
}

export interface Task {
  id: string;
  status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed';
  request: AgentMessage;
  assignedAgents: string[];
  result?: unknown;
  error?: Error;
  createdAt: number;
  updatedAt: number;
}

export interface RoutingRule {
  name: string;
  keywords: string[];
  agent?: string;
  strategy?: 'direct' | 'broadcast';
  agents?: string[];
  priority: number;
}

export interface GatewayConfig {
  port: number;
  wsPort: number;
  host: string;
  dataDir: string;
  logDir: string;
  routing: {
    rules: RoutingRule[];
    defaultAgent?: string;
  };
}
