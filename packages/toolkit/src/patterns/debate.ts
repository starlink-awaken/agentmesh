/**
 * Debate Patterns - 辩论模式
 *
 * 支持 Pro/Con 双方辩论、Moderator 中间人总结
 *
 * @author PAI
 * @version 1.0.0
 */

import { type AgentRole } from '../team/types.js';

/**
 * 辩论方类型
 */
export type DebateSide = 'pro' | 'con' | 'neutral';

/**
 * 辩论配置
 */
export interface DebateConfig {
  /** 辩论主题 */
  topic: string;
  /** 正方代理角色 */
  proAgent: AgentRole;
  /** 反方代理角色 */
  conAgent: AgentRole;
  /** 中间人角色（可选） */
  moderator?: AgentRole;
  /** 最大辩论轮次 */
  maxRounds: number;
  /** 是否需要中间人总结 */
  enableModeratorSummary?: boolean;
  /** 自定义终止条件 */
  terminationCondition?: (state: DebateState) => boolean;
}

/**
 * 辩论状态
 */
export interface DebateState {
  /** 当前轮次 */
  currentRound: number;
  /** 当前发言方 */
  currentSpeaker: DebateSide;
  /** 辩论历史 */
  history: DebateMessage[];
  /** 是否已终止 */
  terminated: boolean;
  /** 终止原因 */
  terminationReason?: string;
}

/**
 * 辩论消息
 */
export interface DebateMessage {
  /** 发言方 */
  side: DebateSide;
  /** 发言方角色 */
  role: AgentRole;
  /** 发言方名称 */
  speakerName: string;
  /** 消息内容 */
  content: string;
  /** 轮次 */
  round: number;
  /** 时间戳 */
  timestamp: Date;
  /** 论点类型 */
  argumentType: 'opening' | 'argument' | 'rebuttal' | 'closing' | 'summary';
}

/**
 * 辩论结果
 */
export interface DebateResult {
  /** 是否成功 */
  success: boolean;
  /** 正方观点 */
  proPosition?: string;
  /** 反方观点 */
  conPosition?: string;
  /** 中间人总结 */
  moderatorSummary?: string;
  /** 最终结论 */
  conclusion?: string;
  /** 辩论历史 */
  history: DebateMessage[];
  /** 最终轮次 */
  finalRound: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 代理角色名称映射
 */
const ROLE_NAME_MAP: Record<AgentRole, string> = {
  product_owner: '产品负责人',
  spec_writer: '规格撰写者',
  architect: '架构师',
  tech_lead: '技术负责人',
  developer: '开发者',
  code_monkey: '代码工程师',
  reviewer: '审查员',
  debugger: '调试专家',
  troubleshooter: '问题排查专家',
  tech_writer: '技术文档作家',
};

/**
 * 获取角色中文名称
 */
function getRoleName(role: AgentRole): string {
  return ROLE_NAME_MAP[role] || role;
}

/**
 * LLM 执行器类型
 */
type LLMExecutor = (prompt: string) => Promise<string>;

/**
 * DebatePattern - 辩论模式类
 *
 * 实现多代理辩论，支持正反双方观点碰撞和中间人总结
 */
export class DebatePattern {
  private config: DebateConfig;
  private state: DebateState;
  private executor?: LLMExecutor;

  constructor(config: DebateConfig, executor?: LLMExecutor) {
    this.config = {
      ...config,
      enableModeratorSummary: config.enableModeratorSummary ?? true,
      maxRounds: config.maxRounds ?? 5,
    };
    this.state = this.createInitialState();
    this.executor = executor;
  }

  /**
   * 创建初始状态
   */
  private createInitialState(): DebateState {
    return {
      currentRound: 1,
      currentSpeaker: 'pro',
      history: [],
      terminated: false,
    };
  }

  /**
   * 检查是否应该终止
   */
  private shouldTerminate(): boolean {
    if (this.config.terminationCondition && this.config.terminationCondition(this.state)) {
      return true;
    }

    if (this.state.currentRound > this.config.maxRounds) {
      return true;
    }

    return false;
  }

  /**
   * 执行正方发言
   */
  private async proArgument(): Promise<DebateMessage> {
    let content = '';

    if (this.executor) {
      const context = this.buildContext();
      const prompt = `
辩论主题: ${this.config.topic}
当前轮次: ${this.state.currentRound}

你是正方，需要提出支持该观点的论据。

之前的辩论:
${context}

请提出你的论点（正方）。
`;
      content = await this.executor(prompt);
    } else {
      content = `[正方论点 ${this.state.currentRound}]`;
    }

    const message: DebateMessage = {
      side: 'pro',
      role: this.config.proAgent,
      speakerName: `正方 - ${getRoleName(this.config.proAgent)}`,
      content,
      round: this.state.currentRound,
      timestamp: new Date(),
      argumentType: this.state.currentRound === 1 ? 'opening' : 'argument',
    };

    this.state.history.push(message);
    return message;
  }

  /**
   * 执行反方发言
   */
  private async conArgument(): Promise<DebateMessage> {
    let content = '';

    if (this.executor) {
      const context = this.buildContext();
      const prompt = `
辩论主题: ${this.config.topic}
当前轮次: ${this.state.currentRound}

你是反方，需要提出反对该观点的论据。

之前的辩论:
${context}

请提出你的论点（反方）。
`;
      content = await this.executor(prompt);
    } else {
      content = `[反方论点 ${this.state.currentRound}]`;
    }

    const message: DebateMessage = {
      side: 'con',
      role: this.config.conAgent,
      speakerName: `反方 - ${getRoleName(this.config.conAgent)}`,
      content,
      round: this.state.currentRound,
      timestamp: new Date(),
      argumentType: 'rebuttal',
    };

    this.state.history.push(message);
    return message;
  }

  /**
   * 执行中间人总结
   */
  private async moderatorSummary(): Promise<DebateMessage | null> {
    if (!this.config.moderator || !this.config.enableModeratorSummary) {
      return null;
    }

    let content = '';

    if (this.executor) {
      const context = this.buildContext();
      const prompt = `
辩论主题: ${this.config.topic}

请总结本轮辩论的要点:

${context}

请作为中间人给出平衡的总结。
`;
      content = await this.executor(prompt);
    } else {
      content = `[中间人总结]`;
    }

    const message: DebateMessage = {
      side: 'neutral',
      role: this.config.moderator,
      speakerName: `中间人 - ${getRoleName(this.config.moderator)}`,
      content,
      round: this.state.currentRound,
      timestamp: new Date(),
      argumentType: 'summary',
    };

    this.state.history.push(message);
    return message;
  }

  /**
   * 构建辩论上下文
   */
  private buildContext(): string {
    return this.state.history
      .map((m) => `${m.speakerName}: ${m.content}`)
      .join('\n\n');
  }

  /**
   * 执行一轮完整的辩论
   */
  async executeRound(): Promise<DebateMessage[]> {
    const roundMessages: DebateMessage[] = [];

    // 正方发言
    const proMsg = await this.proArgument();
    roundMessages.push(proMsg);

    // 检查终止
    if (this.shouldTerminate()) {
      this.state.terminated = true;
      return roundMessages;
    }

    // 反方发言
    const conMsg = await this.conArgument();
    roundMessages.push(conMsg);

    // 中间人总结（可选）
    const summaryMsg = await this.moderatorSummary();
    if (summaryMsg) {
      roundMessages.push(summaryMsg);
    }

    // 进入下一轮
    this.state.currentRound++;
    this.state.currentSpeaker = 'pro';

    return roundMessages;
  }

  /**
   * 执行完整辩论
   */
  async run(): Promise<DebateResult> {
    while (!this.state.terminated && this.state.currentRound <= this.config.maxRounds) {
      await this.executeRound();

      if (this.shouldTerminate()) {
        this.state.terminated = true;
        break;
      }
    }

    return this.generateResult();
  }

  /**
   * 生成辩论结果
   */
  private generateResult(): DebateResult {
    const proMessages = this.state.history.filter((m) => m.side === 'pro');
    const conMessages = this.state.history.filter((m) => m.side === 'con');
    const moderatorMessages = this.state.history.filter(
      (m) => m.side === 'neutral'
    );

    const finalSummary =
      moderatorMessages.length > 0
        ? moderatorMessages[moderatorMessages.length - 1].content
        : undefined;

    return {
      success: true,
      proPosition: proMessages.map((m) => m.content).join('\n\n'),
      conPosition: conMessages.map((m) => m.content).join('\n\n'),
      moderatorSummary: finalSummary,
      conclusion: finalSummary || this.generateSimpleConclusion(),
      history: this.state.history,
      finalRound: this.state.currentRound,
      metadata: {
        topic: this.config.topic,
        proAgent: this.config.proAgent,
        conAgent: this.config.conAgent,
        moderator: this.config.moderator,
      },
    };
  }

  /**
   * 生成简单结论
   */
  private generateSimpleConclusion(): string {
    return `辩论结束。正方和反方分别阐述了各自观点，建议进一步讨论以达成共识。`;
  }

  /**
   * 获取当前状态
   */
  getState(): DebateState {
    return { ...this.state };
  }

  /**
   * 获取辩论历史
   */
  getHistory(): DebateMessage[] {
    return [...this.state.history];
  }

  /**
   * 获取正方立场
   */
  getProPosition(): string {
    return this.state.history
      .filter((m) => m.side === 'pro')
      .map((m) => m.content)
      .join('\n\n');
  }

  /**
   * 获取反方立场
   */
  getConPosition(): string {
    return this.state.history
      .filter((m) => m.side === 'con')
      .map((m) => m.content)
      .join('\n\n');
  }

  /**
   * 获取中间人总结
   */
  getModeratorSummary(): string | undefined {
    const summaries = this.state.history.filter((m) => m.side === 'neutral');
    return summaries.length > 0 ? summaries[summaries.length - 1].content : undefined;
  }
}

/**
 * 创建辩论实例的工厂函数
 */
export function createDebate(
  config: DebateConfig,
  executor?: LLMExecutor
): DebatePattern {
  return new DebatePattern(config, executor);
}

/**
 * 快速创建简单辩论
 */
export async function quickDebate(
  topic: string,
  proRole: AgentRole,
  conRole: AgentRole,
  executor: LLMExecutor,
  options?: {
    maxRounds?: number;
    moderatorRole?: AgentRole;
  }
): Promise<DebateResult> {
  const debate = new DebatePattern(
    {
      topic,
      proAgent: proRole,
      conAgent: conRole,
      moderator: options?.moderatorRole,
      maxRounds: options?.maxRounds || 3,
      enableModeratorSummary: !!options?.moderatorRole,
    },
    executor
  );

  return debate.run();
}

export default DebatePattern;
