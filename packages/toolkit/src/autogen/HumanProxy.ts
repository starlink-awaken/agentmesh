/**
 * HumanProxy - 人工代理
 *
 * 用于人工干预和审批的代理实现
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  ConversationAgentConfig,
  HumanInterventionRequest,
  HumanInterventionResponse,
  HumanInterventionType,
} from './types.js';
import { ConversationAgent } from './ConversationAgent.js';

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 人工输入处理函数
 */
export type HumanInputHandler = (
  request: HumanInterventionRequest
) => Promise<HumanInterventionResponse>;

/**
 * 人工代理配置
 */
export interface HumanProxyConfig extends ConversationAgentConfig {
  inputHandler?: HumanInputHandler;
  autoApprove?: boolean;
  timeout?: number;
}

/**
 * 人工代理类
 *
 * 允许人类用户介入对话过程，提供审批和输入能力
 */
export class HumanProxy extends ConversationAgent {
  private inputHandler?: HumanInputHandler;
  private autoApprove: boolean;
  private timeout: number;
  private pendingRequests: Map<string, HumanInterventionRequest> = new Map();

  constructor(config: HumanProxyConfig) {
    super({
      ...config,
      id: config.id,
      name: config.name,
      systemMessage: config.systemMessage,
      tools: config.tools,
    });

    this.inputHandler = config.inputHandler;
    this.autoApprove = config.autoApprove ?? false;
    this.timeout = config.timeout ?? 60000; // 默认 60 秒超时
  }

  /**
   * 请求人工输入
   */
  async requestIntervention(
    type: HumanInterventionType,
    message: string,
    options?: string[],
    context?: Record<string, unknown>
  ): Promise<HumanInterventionResponse> {
    const request: HumanInterventionRequest = {
      id: generateId(),
      type,
      message,
      options,
      senderId: this.id,
      senderName: this.name,
      timestamp: new Date(),
      context,
    };

    // 如果设置了自动批准
    if (this.autoApprove && type === 'approval') {
      return {
        requestId: request.id,
        response: 'auto-approved',
        approved: true,
        timestamp: new Date(),
      };
    }

    // 保存待处理的请求
    this.pendingRequests.set(request.id, request);

    // 如果有输入处理器，调用它
    if (this.inputHandler) {
      try {
        const response = await Promise.race([
          this.inputHandler(request),
          this.createTimeoutPromise(),
        ]);

        this.pendingRequests.delete(request.id);
        return response;
      } catch (error) {
        this.pendingRequests.delete(request.id);
        throw error;
      }
    }

    // 返回一个等待人工响应的承诺
    return new Promise((resolve, reject) => {
      // 设置超时
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`Human input timeout after ${this.timeout}ms`));
      }, this.timeout);

      // 存储解析器以便后续调用
      (request as any).resolve = (response: HumanInterventionResponse) => {
        clearTimeout(timeoutId);
        resolve(response);
      };
      (request as any).reject = reject;
    });
  }

  /**
   * 创建超时承诺
   */
  private createTimeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Human input timeout after ${this.timeout}ms`));
      }, this.timeout);
    });
  }

  /**
   * 确认操作
   */
  async confirm(message: string): Promise<boolean> {
    const response = await this.requestIntervention(
      'confirmation',
      message,
      ['确认', '取消']
    );

    return response.response === '确认' || response.approved === true;
  }

  /**
   * 审批请求
   */
  async approve(
    message: string,
    context?: Record<string, unknown>
  ): Promise<HumanInterventionResponse> {
    return this.requestIntervention('approval', message, ['批准', '拒绝'], context);
  }

  /**
   * 获取反馈
   */
  async getFeedback(message: string): Promise<string> {
    const response = await this.requestIntervention('feedback', message);
    return response.response;
  }

  /**
   * 提供输入
   */
  async provideInput(message: string): Promise<string> {
    const response = await this.requestIntervention('input', message);
    return response.response;
  }

  /**
   * 干预对话
   */
  async intervene(
    message: string,
    context?: Record<string, unknown>
  ): Promise<HumanInterventionResponse> {
    return this.requestIntervention('intervention', message, undefined, context);
  }

  /**
   * 处理人工响应
   *
   * 当人工完成输入后调用此方法
   */
  handleResponse(
    requestId: string,
    response: string,
    approved?: boolean
  ): void {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new Error(`No pending request with id ${requestId}`);
    }

    const interventionResponse: HumanInterventionResponse = {
      requestId,
      response,
      approved,
      timestamp: new Date(),
    };

    // 如果请求有解析器，调用它
    if ((request as any).resolve) {
      (request as any).resolve(interventionResponse);
    }

    this.pendingRequests.delete(requestId);
  }

  /**
   * 设置输入处理器
   */
  setInputHandler(handler: HumanInputHandler): void {
    this.inputHandler = handler;
  }

  /**
   * 获取待处理的请求
   */
  getPendingRequests(): HumanInterventionRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * 检查是否有待处理的请求
   */
  hasPendingRequests(): boolean {
    return this.pendingRequests.size > 0;
  }

  /**
   * 取消所有待处理的请求
   */
  cancelAllPendingRequests(): void {
    const requestsArray = Array.from(this.pendingRequests.values());
    for (const request of requestsArray) {
      if ((request as any).reject) {
        (request as any).reject(new Error('Request cancelled'));
      }
    }
    this.pendingRequests.clear();
  }
}

/**
 * 创建人工代理的工厂函数
 */
export function createHumanProxy(config: HumanProxyConfig): HumanProxy {
  return new HumanProxy(config);
}

/**
 * 创建默认的人工输入处理器（使用 Node.js readline）
 */
export function createDefaultInputHandler(): HumanInputHandler {
  return async (request: HumanInterventionRequest): Promise<HumanInterventionResponse> => {
    // 这是一个默认实现，实际使用时应该替换为具体的 UI/CLI 实现
    console.log(`\n[人工请求] ${request.type}: ${request.message}`);

    if (request.options && request.options.length > 0) {
      console.log(`选项: ${request.options.join(', ')}`);
    }

    // 模拟响应，实际应该等待用户输入
    return {
      requestId: request.id,
      response: 'approved',
      approved: true,
      timestamp: new Date(),
    };
  };
}
