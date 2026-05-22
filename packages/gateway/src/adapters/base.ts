import type { AgentMessage } from '../types/index.js';

export interface AgentAdapter {
  id: string;
  name: string;
  type: string;
  capabilities: string[];

  invoke(request: AgentMessage): Promise<AgentMessage>;
  invokeStream?(request: AgentMessage): AsyncGenerator<AgentMessage, void, unknown>;
  health(): Promise<boolean>;
}

/**
 * Agent 适配器基类
 */
export abstract class BaseAgentAdapter implements AgentAdapter {
  abstract id: string;
  abstract name: string;
  abstract type: string;
  abstract capabilities: string[];

  abstract invoke(request: AgentMessage): Promise<AgentMessage>;

  async *invokeStream?(
    request: AgentMessage
  ): AsyncGenerator<AgentMessage, void, unknown> {
    // 默认实现：调用 invoke 并转换为流
    const response = await this.invoke(request);
    yield response;
  }

  abstract health(): Promise<boolean>;
}
