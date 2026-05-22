/**
 * Honeycomb LLM Integration - Simulation Provider
 *
 * 模拟 Provider 用于测试和开发，不调用真实 API。
 * 提供确定性的输出，便于单元测试和集成测试。
 *
 * 设计原则：
 * - 零成本：不产生 API 费用
 * - 确定性：相同输入产生相同输出
 * - 可配置：支持自定义延迟、错误率等
 * - 完整接口：实现所有 LLMProvider 方法
 */

import type {
  LLMProvider,
  CompletionOptions,
  CompletionResult,
  CompletionChunk,
  CompletionRequest,
  ProviderConfig,
  SimulationConfig,
} from './types.js';

// ============================================================
// Simulation Provider
// ============================================================

/**
 * 模拟 Provider
 * 用于测试和开发，不调用真实 API
 */
export class SimulationProvider implements LLMProvider {
  readonly name = 'simulation';
  readonly type = 'custom' as const;

  private config: Required<SimulationConfig>;
  private logger: any;

  // 用于存储预设响应
  private mockResponses: Map<string, string> = new Map();

  // 调用计数器
  private callCount = 0;

  constructor(config: SimulationConfig, logger: any) {
    this.config = {
      latency: config.latency || 100,
      errorRate: config.errorRate || 0,
      fixedOutput: config.fixedOutput || '',
    };
    this.logger = logger;
  }

  /**
   * 同步调用（非流式）
   */
  async complete(
    prompt: string,
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const startTime = Date.now();
    this.callCount++;

    this.logger.debug('Simulation API request', {
      callCount: this.callCount,
      promptLength: prompt.length,
      model: options?.model || 'simulation',
    });

    // 模拟延迟
    await this.sleep(this.config.latency);

    // 模拟错误
    if (Math.random() < this.config.errorRate) {
      throw new Error('Simulated API error');
    }

    // 生成输出
    const output = this.generateOutput(prompt, options);

    // 估算 Token
    const inputTokens = this.estimateTokens(prompt);
    const outputTokens = this.estimateTokens(output);

    const result: CompletionResult = {
      content: output,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      model: options?.model || 'simulation',
      finishReason: 'stop',
      provider: this.name,
      duration: Date.now() - startTime,
      timestamp: Date.now(),
    };

    this.logger.debug('Simulation API response', {
      callCount: this.callCount,
      inputTokens,
      outputTokens,
      totalTokens: result.totalTokens,
      duration: result.duration,
    });

    return result;
  }

  /**
   * 流式调用
   */
  async *stream(
    prompt: string,
    options?: CompletionOptions
  ): AsyncIterable<CompletionChunk> {
    this.callCount++;

    const output = this.config.fixedOutput || this.generateOutput(prompt, options);
    const words = output.split(' ');

    for (let i = 0; i < words.length; i++) {
      await this.sleep(Math.max(10, this.config.latency / words.length));

      yield {
        delta: words[i] + (i < words.length - 1 ? ' ' : ''),
        done: false,
      };
    }

    yield {
      delta: '',
      done: true,
    };
  }

  /**
   * 批量调用
   */
  async batch(requests: CompletionRequest[]): Promise<CompletionResult[]> {
    return Promise.all(
      requests.map(req => this.complete(req.prompt, req.options))
    );
  }

  /**
   * 估算 Token 数量
   */
  estimateTokens(text: string): number {
    // 粗略估算
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 2 + otherChars / 4);
  }

  /**
   * 检查 Provider 是否可用
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * 获取 Provider 配置
   */
  getConfig(): ProviderConfig {
    return {
      name: this.name,
      type: this.type,
      defaultModel: 'simulation',
      supportedModels: ['simulation'],
      maxTokens: Infinity,
      supportsStreaming: true,
      supportsTools: false,
      supportsBatch: true,
      timeout: 0,
      maxRetries: 0,
    };
  }

  /**
   * 设置模拟响应
   */
  setMockResponse(key: string, response: string): void {
    this.mockResponses.set(key, response);
  }

  /**
   * 清除模拟响应
   */
  clearMockResponses(): void {
    this.mockResponses.clear();
  }

  /**
   * 获取调用计数
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * 重置调用计数
   */
  resetCallCount(): void {
    this.callCount = 0;
  }

  // ==================== 私有方法 ====================

  /**
   * 生成模拟输出
   */
  private generateOutput(prompt: string, options?: CompletionOptions): string {
    // 检查是否有预设响应
    const key = this.generateResponseKey(prompt, options);
    if (this.mockResponses.has(key)) {
      return this.mockResponses.get(key)!;
    }

    // 使用固定输出
    if (this.config.fixedOutput) {
      return this.config.fixedOutput;
    }

    // 生成默认输出
    return this.generateDefaultOutput(prompt, options);
  }

  /**
   * 生成默认输出
   */
  private generateDefaultOutput(prompt: string, options?: CompletionOptions): string {
    const lines: string[] = [];

    lines.push(`[Simulation] Agent executed at ${new Date().toISOString()}`);
    lines.push(``);
    lines.push(`Task: ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`);
    lines.push(``);
    lines.push(`Configuration:`);
    lines.push(`  Model: ${options?.model || 'simulation'}`);
    lines.push(`  Max Tokens: ${options?.maxTokens || 'default'}`);
    lines.push(`  Temperature: ${options?.temperature || 'default'}`);
    lines.push(``);
    lines.push(`Status: Completed (simulation mode)`);

    return lines.join('\n');
  }

  /**
   * 生成响应键（用于匹配预设响应）
   */
  private generateResponseKey(prompt: string, options?: CompletionOptions): string {
    const parts = [prompt.substring(0, 100)];
    if (options?.model) {
      parts.push(options.model);
    }
    return parts.join(':');
  }

  /**
   * 休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// SimulationProvider 已通过 export class 导出，无需重复导出
