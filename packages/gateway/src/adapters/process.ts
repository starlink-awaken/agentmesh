import { execa } from 'execa';
import { v4 as uuidv4 } from 'uuid';
import { BaseAgentAdapter } from './base.js';
import type { AgentMessage } from '../types/index.js';

interface ProcessConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class ProcessAdapter extends BaseAgentAdapter {
  id: string;
  name: string;
  type = 'process';
  capabilities: string[];
  private config: ProcessConfig;

  constructor(id: string, name: string, capabilities: string[], config: ProcessConfig) {
    super();
    this.id = id;
    this.name = name;
    this.capabilities = capabilities;
    this.config = config;
  }

  /**
   * 调用进程执行任务
   */
  async invoke(request: AgentMessage): Promise<AgentMessage> {
    const task = request.payload?.task || '';
    const correlationId = request.correlation_id || uuidv4();
    const timeout = (request.payload?.options?.timeout || 300) * 1000;

    try {
      // 构建参数：将任务作为 stdin 或参数传入
      const args = this.config.args || [];

      const result = await execa(this.config.command, [...args, task], {
        timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.config.env }
      });

      return {
        id: uuidv4(),
        type: 'response',
        source: this.id,
        target: request.source,
        correlation_id: correlationId,
        timestamp: Date.now(),
        result: result.stdout
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        id: uuidv4(),
        type: 'response',
        source: this.id,
        target: request.source,
        correlation_id: correlationId,
        timestamp: Date.now(),
        error: {
          code: 'EXECUTION_ERROR',
          message: errorMessage
        }
      };
    }
  }

  /**
   * 流式调用
   */
  override async *invokeStream(request: AgentMessage): AsyncGenerator<AgentMessage, void, unknown> {
    const task = request.payload?.task || '';
    const correlationId = request.correlation_id || uuidv4();
    const timeout = (request.payload?.options?.timeout || 300) * 1000;

    try {
      const args = this.config.args || [];
      const proc = execa(this.config.command, [...args, task], {
        timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...globalThis.process.env, ...this.config.env }
      });

      proc.stdout?.on('data', (_chunk: Buffer) => {
        // 可以发送流式消息
      });

      const result = await proc;

      yield {
        id: uuidv4(),
        type: 'stream_end',
        source: this.id,
        target: request.source,
        correlation_id: correlationId,
        timestamp: Date.now(),
        result: result.stdout
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield {
        id: uuidv4(),
        type: 'response',
        source: this.id,
        target: request.source,
        correlation_id: correlationId,
        timestamp: Date.now(),
        error: {
          code: 'EXECUTION_ERROR',
          message: errorMessage
        }
      };
    }
  }

  /**
   * 健康检查
   */
  async health(): Promise<boolean> {
    try {
      await execa(this.config.command, ['--version'], { timeout: 5000 });
      return true;
    } catch {
      // 尝试其他版本检查方式
      try {
        await execa(this.config.command, ['-v'], { timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    }
  }
}
