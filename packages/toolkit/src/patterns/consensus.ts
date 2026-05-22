/**
 * Consensus Patterns - 共识模式
 *
 * 支持多代理协商达成共识，投票机制
 *
 * @author PAI
 * @version 1.0.0
 */

import { type AgentRole } from '../team/types.js';

/**
 * 投票选项
 */
export interface VoteOption {
  /** 选项 ID */
  id: string;
  /** 选项描述 */
  description: string;
  /** 投票数 */
  votes: number;
}

/**
 * 投票结果
 */
export interface VoteResult {
  /** 获胜选项 */
  winner?: VoteOption;
  /** 所有选项及票数 */
  options: VoteOption[];
  /** 是否达成共识 */
  consensusReached: boolean;
  /** 共识阈值（百分比） */
  consensusThreshold: number;
  /** 总投票数 */
  totalVotes: number;
}

/**
 * 共识配置
 */
export interface ConsensusConfig {
  /** 参与协商的代理角色列表 */
  agents: AgentRole[];
  /** 决策主题 */
  topic: string;
  /** 最大协商轮次 */
  maxRounds: number;
  /** 共识阈值（0-1），默认 0.7 即 70% */
  consensusThreshold?: number;
  /** 是否启用投票机制 */
  enableVoting?: boolean;
  /** 投票选项（可选） */
  voteOptions?: string[];
  /** 自定义终止条件 */
  terminationCondition?: (state: ConsensusState) => boolean;
}

/**
 * 共识状态
 */
export interface ConsensusState {
  /** 当前轮次 */
  currentRound: number;
  /** 协商历史 */
  history: ConsensusMessage[];
  /** 投票记录 */
  votes: Map<AgentRole, string>;
  /** 当前投票结果 */
  currentVoteResult?: VoteResult;
  /** 是否已终止 */
  terminated: boolean;
  /** 终止原因 */
  terminationReason?: string;
  /** 达成的共识 */
  consensus?: string;
}

/**
 * 共识消息
 */
export interface ConsensusMessage {
  /** 发言者角色 */
  speaker: AgentRole;
  /** 发言者名称 */
  speakerName: string;
  /** 消息内容 */
  content: string;
  /** 轮次 */
  round: number;
  /** 时间戳 */
  timestamp: Date;
  /** 消息类型 */
  type: 'opinion' | 'argument' | 'proposal' | 'agreement' | 'vote';
}

/**
 * 共识结果
 */
export interface ConsensusResult {
  /** 是否成功 */
  success: boolean;
  /** 是否达成共识 */
  consensusReached: boolean;
  /** 共识内容 */
  consensus?: string;
  /** 协商历史 */
  history: ConsensusMessage[];
  /** 投票结果 */
  voteResult?: VoteResult;
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
 * ConsensusPattern - 共识模式类
 *
 * 实现多代理协商，支持观点表达、论据讨论、投票决策
 */
export class ConsensusPattern {
  private config: ConsensusConfig;
  private state: ConsensusState;
  private executor?: LLMExecutor;

  constructor(config: ConsensusConfig, executor?: LLMExecutor) {
    this.config = {
      ...config,
      consensusThreshold: config.consensusThreshold ?? 0.7,
      enableVoting: config.enableVoting ?? true,
      maxRounds: config.maxRounds ?? 5,
    };
    this.state = this.createInitialState();
    this.executor = executor;
  }

  /**
   * 创建初始状态
   */
  private createInitialState(): ConsensusState {
    return {
      currentRound: 1,
      history: [],
      votes: new Map(),
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

    // 检查是否达成共识
    if (this.state.currentVoteResult?.consensusReached) {
      return true;
    }

    return false;
  }

  /**
   * 代理发表意见
   */
  private async agentOpinion(agent: AgentRole): Promise<ConsensusMessage> {
    let content = '';

    if (this.executor) {
      const context = this.buildContext();
      const prompt = `
决策主题: ${this.config.topic}
当前轮次: ${this.state.currentRound}

之前的讨论:
${context}

请作为 ${getRoleName(agent)} 发表你的意见。
`;
      content = await this.executor(prompt);
    } else {
      content = `[${getRoleName(agent)} 的意见]`;
    }

    const message: ConsensusMessage = {
      speaker: agent,
      speakerName: getRoleName(agent),
      content,
      round: this.state.currentRound,
      timestamp: new Date(),
      type: 'opinion',
    };

    this.state.history.push(message);
    return message;
  }

  /**
   * 代理提出建议
   */
  private async agentProposal(agent: AgentRole): Promise<ConsensusMessage> {
    let content = '';

    if (this.executor) {
      const context = this.buildContext();
      const prompt = `
决策主题: ${this.config.topic}

基于之前的讨论:
${context}

请提出你的建议或方案。
`;
      content = await this.executor(prompt);
    } else {
      content = `[${getRoleName(agent)} 的建议]`;
    }

    const message: ConsensusMessage = {
      speaker: agent,
      speakerName: getRoleName(agent),
      content,
      round: this.state.currentRound,
      timestamp: new Date(),
      type: 'proposal',
    };

    this.state.history.push(message);
    return message;
  }

  /**
   * 收集所有代理的意见
   */
  private async collectOpinions(): Promise<ConsensusMessage[]> {
    const messages: ConsensusMessage[] = [];

    for (const agent of this.config.agents) {
      const msg = await this.agentOpinion(agent);
      messages.push(msg);
    }

    return messages;
  }

  /**
   * 执行一轮协商
   */
  async executeRound(): Promise<ConsensusMessage[]> {
    const roundMessages: ConsensusMessage[] = [];

    // 第一轮：收集意见
    if (this.state.currentRound === 1) {
      const opinions = await this.collectOpinions();
      roundMessages.push(...opinions);
    } else {
      // 后续轮次：基于之前的讨论提出建议
      for (const agent of this.config.agents) {
        const msg = await this.agentProposal(agent);
        roundMessages.push(msg);
      }
    }

    // 如果启用投票，进行投票
    if (this.config.enableVoting && this.state.currentRound >= 2) {
      await this.collectVotes();
      this.state.currentVoteResult = this.tallyVotes();

      // 检查是否达成共识
      if (this.state.currentVoteResult.consensusReached) {
        this.state.consensus = this.state.currentVoteResult.winner?.description;
        this.state.terminated = true;
      }
    }

    this.state.currentRound++;
    return roundMessages;
  }

  /**
   * 收集投票
   */
  private async collectVotes(): Promise<void> {
    if (!this.config.voteOptions || this.config.voteOptions.length === 0) {
      // 如果没有预定义选项，让代理生成建议然后投票
      return;
    }

    for (const agent of this.config.agents) {
      let vote = '';

      if (this.executor) {
        const prompt = `
决策主题: ${this.config.topic}

可选方案:
${this.config.voteOptions.map((o, i) => `${i + 1}. ${o}`).join('\n')}

请选择你支持的方案（只回复选项编号）。
`;
        const response = await this.executor(prompt);
        // 解析投票
        const match = response.match(/(\d+)/);
        if (match && this.config.voteOptions[parseInt(match[1]) - 1]) {
          vote = this.config.voteOptions[parseInt(match[1]) - 1];
        } else {
          vote = this.config.voteOptions[0];
        }
      } else {
        vote = this.config.voteOptions[0];
      }

      this.state.votes.set(agent, vote);

      // 记录投票消息
      const voteMessage: ConsensusMessage = {
        speaker: agent,
        speakerName: getRoleName(agent),
        content: `投票支持: ${vote}`,
        round: this.state.currentRound,
        timestamp: new Date(),
        type: 'vote',
      };
      this.state.history.push(voteMessage);
    }
  }

  /**
   * 统计投票结果
   */
  private tallyVotes(): VoteResult {
    const voteCounts = new Map<string, number>();
    let totalVotes = 0;

    Array.from(this.state.votes.values()).forEach((vote) => {
      voteCounts.set(vote, (voteCounts.get(vote) || 0) + 1);
      totalVotes++;
    });

    const options: VoteOption[] = [];
    let winner: VoteOption | undefined;

    Array.from(voteCounts.entries()).forEach(([description, count]) => {
      const option: VoteOption = {
        id: description,
        description,
        votes: count,
      };
      options.push(option);

      if (!winner || count > winner.votes) {
        winner = option;
      }
    });

    const consensusPercentage = winner ? winner.votes / totalVotes : 0;
    const consensusReached = consensusPercentage >= (this.config.consensusThreshold || 0.7);

    return {
      winner,
      options,
      consensusReached,
      consensusThreshold: this.config.consensusThreshold || 0.7,
      totalVotes,
    };
  }

  /**
   * 构建协商上下文
   */
  private buildContext(): string {
    return this.state.history
      .map((m) => `${m.speakerName}: ${m.content}`)
      .join('\n\n');
  }

  /**
   * 执行完整协商
   */
  async run(): Promise<ConsensusResult> {
    while (!this.state.terminated && this.state.currentRound <= this.config.maxRounds) {
      await this.executeRound();

      if (this.shouldTerminate()) {
        this.state.terminated = true;
        break;
      }
    }

    // 如果没有达成共识，生成最终建议
    if (!this.state.consensus) {
      this.state.consensus = await this.generateFinalProposal();
    }

    return this.generateResult();
  }

  /**
   * 生成最终建议
   */
  private async generateFinalProposal(): Promise<string> {
    if (this.executor) {
      const context = this.buildContext();
      const prompt = `
决策主题: ${this.config.topic}

经过 ${this.state.currentRound - 1} 轮讨论，未能达成共识。

讨论记录:
${context}

请生成最终建议方案。
`;
      return await this.executor(prompt);
    }

    return '经过多轮协商，未能达成共识，建议进一步讨论。';
  }

  /**
   * 生成协商结果
   */
  private generateResult(): ConsensusResult {
    return {
      success: true,
      consensusReached: !!this.state.currentVoteResult?.consensusReached,
      consensus: this.state.consensus,
      history: this.state.history,
      voteResult: this.state.currentVoteResult,
      finalRound: this.state.currentRound,
      metadata: {
        topic: this.config.topic,
        agents: this.config.agents,
        consensusThreshold: this.config.consensusThreshold,
      },
    };
  }

  /**
   * 手动添加共识（当代理达成一致时）
   */
  addConsensus(consensus: string): void {
    this.state.consensus = consensus;
    this.state.terminated = true;
    this.state.terminationReason = '手动添加共识';
  }

  /**
   * 手动投票
   */
  castVote(agent: AgentRole, option: string): void {
    this.state.votes.set(agent, option);
  }

  /**
   * 获取当前状态
   */
  getState(): ConsensusState {
    return {
      ...this.state,
      votes: new Map(this.state.votes),
    };
  }

  /**
   * 获取协商历史
   */
  getHistory(): ConsensusMessage[] {
    return [...this.state.history];
  }

  /**
   * 获取投票结果
   */
  getVoteResult(): VoteResult | undefined {
    return this.state.currentVoteResult;
  }

  /**
   * 检查是否达成共识
   */
  hasConsensus(): boolean {
    return this.state.currentVoteResult?.consensusReached || !!this.state.consensus;
  }
}

/**
 * 创建共识实例的工厂函数
 */
export function createConsensus(
  config: ConsensusConfig,
  executor?: LLMExecutor
): ConsensusPattern {
  return new ConsensusPattern(config, executor);
}

/**
 * 快速创建共识协商
 */
export async function quickConsensus(
  topic: string,
  agents: AgentRole[],
  executor: LLMExecutor,
  options?: {
    maxRounds?: number;
    voteOptions?: string[];
    consensusThreshold?: number;
  }
): Promise<ConsensusResult> {
  const consensus = new ConsensusPattern(
    {
      topic,
      agents,
      maxRounds: options?.maxRounds || 3,
      voteOptions: options?.voteOptions,
      consensusThreshold: options?.consensusThreshold || 0.7,
      enableVoting: !!options?.voteOptions,
    },
    executor
  );

  return consensus.run();
}

/**
 * 计算一致性百分比
 */
export function calculateAgreement(votes: Map<AgentRole, string>): number {
  if (votes.size === 0) return 0;

  const voteArray = Array.from(votes.values());
  const firstVote = voteArray[0];
  const agreementCount = voteArray.filter((v) => v === firstVote).length;

  return agreementCount / votes.size;
}

export default ConsensusPattern;
