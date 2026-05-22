import { execa } from 'execa';
import { v4 as uuidv4 } from 'uuid';
import { BaseAgentAdapter } from './base.js';
import type { AgentMessage } from '../types/index.js';

export class OpenClawAdapter extends BaseAgentAdapter {
  id = 'openclaw';
  name = 'OpenClaw';
  type = 'openclaw';
  capabilities = [
    'browser-automation',
    'web-scraping',
    'form-filling',
    'ui-testing'
  ];

  private readonly cliPath: string;

  constructor(cliPath: string = 'openclaw') {
    super();
    this.cliPath = cliPath;
  }

  /**
   * 调用 OpenClaw 执行任务
   */
  async invoke(request: AgentMessage): Promise<AgentMessage> {
    const task = request.payload?.task || '';
    const correlationId = request.correlation_id || uuidv4();

    try {
      // OpenClaw CLI 调用方式（假设使用 --task 或类似参数）
      const result = await execa(this.cliPath, ['--task', task], {
        timeout: (request.payload?.options?.timeout || 300) * 1000,
        stdio: ['pipe', 'pipe', 'pipe']
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

    try {
      const process = execa(this.cliPath, ['--task', task], {
        timeout: (request.payload?.options?.timeout || 300) * 1000,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      process.stdout?.on('data', (_chunk: Buffer) => {
        // 可以发送流式消息
      });

      const result = await process;

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
      await execa(this.cliPath, ['--version'], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
