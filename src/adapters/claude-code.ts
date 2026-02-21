import { execa } from 'execa';
import { v4 as uuidv4 } from 'uuid';
import { BaseAgentAdapter } from './base.js';
import type { AgentMessage } from '../types/index.js';

export class ClaudeCodeAdapter extends BaseAgentAdapter {
  id = 'claude-code';
  name = 'Claude Code';
  type = 'claude-code';
  capabilities = [
    'code-generation',
    'code-review',
    'debugging',
    'refactoring',
    'documentation',
    'file-operations'
  ];

  private readonly cliPath: string;

  constructor(cliPath: string = 'claude') {
    super();
    this.cliPath = cliPath;
  }

  /**
   * 调用 Claude Code 执行任务
   */
  async invoke(request: AgentMessage): Promise<AgentMessage> {
    const task = request.payload?.task || '';
    const correlationId = request.correlation_id || uuidv4();

    try {
      // Claude Code 的 -p 模式需要从 stdin 输入
      const result = await execa(this.cliPath, ['-p'], {
        input: task,
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
    } catch (error: any) {
      return {
        id: uuidv4(),
        type: 'response',
        source: this.id,
        target: request.source,
        correlation_id: correlationId,
        timestamp: Date.now(),
        error: {
          code: 'EXECUTION_ERROR',
          message: error.message || String(error)
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
      const process = execa(this.cliPath, ['-p', task], {
        timeout: (request.payload?.options?.timeout || 300) * 1000,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // 监听 stdout 流
      process.stdout?.on('data', (_chunk: Buffer) => {
        // 这里可以发送流式消息
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
    } catch (error: any) {
      yield {
        id: uuidv4(),
        type: 'response',
        source: this.id,
        target: request.source,
        correlation_id: correlationId,
        timestamp: Date.now(),
        error: {
          code: 'EXECUTION_ERROR',
          message: error.message || String(error)
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
