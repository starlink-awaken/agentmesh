/**
 * Conversation Patterns - 多代理对话模式
 *
 * 支持顺序对话、轮流对话、层级对话等多种协作模式
 *
 * @author PAI
 * @version 1.0.0
 */

import { type AgentRole } from '../team/types.js';

/**
 * 对话配置
 */
export interface ConversationConfig {
  /** 参与对话的代理角色列表 */
  agents: AgentRole[];
  /** 最大对话轮次 */
  maxRounds: number;
  /** 自定义终止条件 */
  terminationCondition?: (state: ConversationState) => boolean;
  /** 发言者选择策略 */
  speakerSelection: 'sequential' | 'round_robin' | 'auto';
  /** 是否启用上下文传递 */
  passContext?: boolean;
  /** 是否需要中间总结 */
  enableMiddleSummary?: boolean;
}

/**
 * 对话状态
 */
export interface ConversationState {
  /** 当前轮次 */
  currentRound: number;
  /** 当前发言者索引 */
  currentSpeakerIndex: number;
  /** 对话历史记录 */
  history: ConversationMessage[];
  /** 是否已终止 */
  terminated: boolean;
  /** 终止原因 */
  terminationReason?: string;
}

/**
 * 对话消息
 */
export interface ConversationMessage {
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
  type: 'statement' | 'question' | 'response' | 'summary';
}

/**
 * 发言者选择策略
 */
export type SpeakerSelection = 'sequential' | 'round_robin' | 'auto';

/**
 * 对话模式类型
 */
export type ConversationMode = 'sequential' | 'round_robin' | 'hierarchical';

/**
 * 层级对话配置
 */
export interface HierarchicalConfig extends ConversationConfig {
  /** 管理者角色 */
  managerRole: AgentRole;
  /** 工作代理角色列表 */
  workerRoles: AgentRole[];
  /** 管理者是否在每轮后汇总 */
  managerSummarizeEachRound?: boolean;
}

/**
 * 对话结果
 */
export interface ConversationResult {
  /** 是否成功 */
  success: boolean;
  /** 最终结论 */
  conclusion?: string;
  /** 对话历史 */
  history: ConversationMessage[];
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
 * 创建初始对话状态
 */
function createInitialState(config: ConversationConfig): ConversationState {
  return {
    currentRound: 1,
    currentSpeakerIndex: 0,
    history: [],
    terminated: false,
  };
}

/**
 * 选择下一位发言者
 */
function selectNextSpeaker(
  config: ConversationConfig,
  state: ConversationState
): AgentRole {
  const { agents, speakerSelection } = config;
  const { currentSpeakerIndex } = state;

  switch (speakerSelection) {
    case 'sequential':
      // 顺序发言：按顺序 A -> B -> C -> A...
      return agents[currentSpeakerIndex % agents.length];

    case 'round_robin':
      // 轮流发言：固定顺序循环
      return agents[currentSpeakerIndex % agents.length];

    case 'auto':
      // 自动选择：基于上下文智能选择
      // 简单实现：轮询选择
      return agents[currentSpeakerIndex % agents.length];

    default:
      return agents[0];
  }
}

/**
 * 检查是否应该终止对话
 */
function shouldTerminate(
  config: ConversationConfig,
  state: ConversationState
): boolean {
  // 检查自定义终止条件
  if (config.terminationCondition && config.terminationCondition(state)) {
    return true;
  }

  // 检查是否达到最大轮次
  if (state.currentRound > config.maxRounds) {
    return true;
  }

  return false;
}

/**
 * SequentialConversation - 顺序对话模式
 *
 * 代理按顺序发言：A -> B -> C -> A...
 * 适用于需要按特定流程讨论的场景
 */
export class SequentialConversation {
  private config: ConversationConfig;
  private state: ConversationState;
  private executor?: LLMExecutor;

  constructor(config: ConversationConfig, executor?: LLMExecutor) {
    this.config = {
      passContext: true,
      enableMiddleSummary: false,
      ...config,
    };
    this.state = createInitialState(config);
    this.executor = executor;
  }

  /**
   * 添加发言
   */
  async speak(
    speaker: AgentRole,
    content: string,
    messageType: ConversationMessage['type'] = 'statement'
  ): Promise<void> {
    const message: ConversationMessage = {
      speaker,
      speakerName: getRoleName(speaker),
      content,
      round: this.state.currentRound,
      timestamp: new Date(),
      type: messageType,
    };

    this.state.history.push(message);
  }

  /**
   * 执行下一轮对话
   */
  async nextRound(initialPrompt?: string): Promise<ConversationMessage | null> {
    if (shouldTerminate(this.config, this.state)) {
      this.state.terminated = true;
      this.state.terminationReason = '达到终止条件';
      return null;
    }

    const currentSpeaker = selectNextSpeaker(this.config, this.state);

    // 构建上下文
    let context = '';
    if (this.config.passContext && this.state.history.length > 0) {
      const recentHistory = this.state.history.slice(-5);
      context = recentHistory
        .map((m) => `${m.speakerName}: ${m.content}`)
        .join('\n\n');
    }

    // 生成回复（如果有 executor）
    let content = '';
    if (this.executor) {
      const prompt = this.buildPrompt(initialPrompt || '', currentSpeaker, context);
      content = await this.executor(prompt);
    } else {
      content = `[${getRoleName(currentSpeaker)} 的回复]`;
    }

    const message: ConversationMessage = {
      speaker: currentSpeaker,
      speakerName: getRoleName(currentSpeaker),
      content,
      round: this.state.currentRound,
      timestamp: new Date(),
      type: this.state.history.length === 0 ? 'statement' : 'response',
    };

    this.state.history.push(message);

    // 更新发言者索引
    this.state.currentSpeakerIndex++;

    // 如果一圈轮完，增加轮次
    if (this.state.currentSpeakerIndex % this.config.agents.length === 0) {
      this.state.currentRound++;
    }

    return message;
  }

  /**
   * 构建提示词
   */
  private buildPrompt(
    task: string,
    speaker: AgentRole,
    context: string
  ): string {
    return `
任务: ${task}

当前发言者: ${getRoleName(speaker)}

对话历史:
${context}

请以 ${getRoleName(speaker)} 的角色发言。
`;
  }

  /**
   * 获取当前状态
   */
  getState(): ConversationState {
    return { ...this.state };
  }

  /**
   * 获取对话历史
   */
  getHistory(): ConversationMessage[] {
    return [...this.state.history];
  }

  /**
   * 执行完整对话
   */
  async run(task: string): Promise<ConversationResult> {
    while (!this.state.terminated) {
      await this.nextRound(task);

      if (shouldTerminate(this.config, this.state)) {
        this.state.terminated = true;
        break;
      }
    }

    // 生成结论
    const conclusion = this.generateConclusion();

    return {
      success: true,
      conclusion,
      history: this.state.history,
      finalRound: this.state.currentRound,
      metadata: {
        speakerSelection: this.config.speakerSelection,
        agents: this.config.agents,
      },
    };
  }

  /**
   * 生成对话结论
   */
  private generateConclusion(): string {
    const lastMessages = this.state.history.slice(-3);
    return lastMessages.map((m) => `${m.speakerName}: ${m.content}`).join('\n\n');
  }
}

/**
 * RoundRobinConversation - 轮流对话模式
 *
 * 代理按固定顺序循环发言，类似于圆桌会议
 * 适用于需要平等讨论的场景
 */
export class RoundRobinConversation {
  private config: ConversationConfig;
  private state: ConversationState;
  private executor?: LLMExecutor;

  constructor(config: ConversationConfig, executor?: LLMExecutor) {
    this.config = {
      ...config,
      passContext: config.passContext ?? true,
      enableMiddleSummary: config.enableMiddleSummary ?? false,
      speakerSelection: config.speakerSelection || 'round_robin',
    };
    this.state = createInitialState(config);
    this.executor = executor;
  }

  /**
   * 执行一轮完整的轮流发言
   */
  async executeRound(task: string): Promise<ConversationMessage[]> {
    const roundMessages: ConversationMessage[] = [];
    const agents = this.config.agents;

    for (let i = 0; i < agents.length; i++) {
      const speaker = agents[i];
      let content = '';

      if (this.executor) {
        const context = this.state.history
          .map((m) => `${m.speakerName}: ${m.content}`)
          .join('\n\n');

        const prompt = `
任务: ${task}

当前发言者: ${getRoleName(speaker)}

之前的讨论:
${context}

请发表你的观点。
`;
        content = await this.executor(prompt);
      } else {
        content = `[${getRoleName(speaker)} 的观点]`;
      }

      const message: ConversationMessage = {
        speaker,
        speakerName: getRoleName(speaker),
        content,
        round: this.state.currentRound,
        timestamp: new Date(),
        type: 'statement',
      };

      this.state.history.push(message);
      roundMessages.push(message);
    }

    this.state.currentRound++;
    return roundMessages;
  }

  /**
   * 执行完整对话
   */
  async run(task: string): Promise<ConversationResult> {
    while (this.state.currentRound <= this.config.maxRounds) {
      await this.executeRound(task);

      if (
        this.config.terminationCondition &&
        this.config.terminationCondition(this.state)
      ) {
        this.state.terminated = true;
        break;
      }
    }

    const conclusion = this.generateConclusion();

    return {
      success: true,
      conclusion,
      history: this.state.history,
      finalRound: this.state.currentRound,
      metadata: {
        mode: 'round_robin',
        agents: this.config.agents,
      },
    };
  }

  /**
   * 生成结论
   */
  private generateConclusion(): string {
    return `经过 ${this.state.currentRound - 1} 轮讨论，达成以下共识:\n\n` +
      this.state.history.slice(-this.config.agents.length).map((m) =>
        `${m.speakerName}: ${m.content}`
      ).join('\n\n');
  }

  /**
   * 获取状态
   */
  getState(): ConversationState {
    return { ...this.state };
  }

  /**
   * 获取历史
   */
  getHistory(): ConversationMessage[] {
    return [...this.state.history];
  }
}

/**
 * HierarchicalConversation - 层级对话模式
 *
 * 管理者负责协调和汇总，下属负责执行具体任务
 * 适用于团队协作和任务分发场景
 */
export class HierarchicalConversation {
  private config: HierarchicalConfig;
  private state: ConversationState;
  private executor?: LLMExecutor;

  constructor(config: HierarchicalConfig, executor?: LLMExecutor) {
    this.config = {
      passContext: true,
      managerSummarizeEachRound: true,
      ...config,
    };
    this.state = createInitialState(config as ConversationConfig);
    this.executor = executor;
  }

  /**
   * 执行一轮层级对话
   */
  async executeRound(task: string): Promise<ConversationMessage[]> {
    const roundMessages: ConversationMessage[] = [];

    // 1. 管理者分析任务并分配给下属
    let managerContent = '';
    if (this.executor) {
      const context = this.state.history
        .map((m) => `${m.speakerName}: ${m.content}`)
        .join('\n\n');

      managerContent = await this.executor(`
任务: ${task}

当前轮次: ${this.state.currentRound}

之前的讨论:
${context}

作为管理者，请分析任务并分配给下属执行。
`);
    } else {
      managerContent = `[管理者分析任务并分配给: ${this.config.workerRoles.map(getRoleName).join(', ')}]`;
    }

    const managerMessage: ConversationMessage = {
      speaker: this.config.managerRole,
      speakerName: getRoleName(this.config.managerRole),
      content: managerContent,
      round: this.state.currentRound,
      timestamp: new Date(),
      type: 'statement',
    };

    this.state.history.push(managerMessage);
    roundMessages.push(managerMessage);

    // 2. 各下属执行任务
    for (const workerRole of this.config.workerRoles) {
      let workerContent = '';
      if (this.executor) {
        workerContent = await this.executor(`
任务: ${task}

管理者分配: ${managerContent}

请作为 ${getRoleName(workerRole)} 执行相关任务。
`);
      } else {
        workerContent = `[${getRoleName(workerRole)} 执行任务]`;
      }

      const workerMessage: ConversationMessage = {
        speaker: workerRole,
        speakerName: getRoleName(workerRole),
        content: workerContent,
        round: this.state.currentRound,
        timestamp: new Date(),
        type: 'response',
      };

      this.state.history.push(workerMessage);
      roundMessages.push(workerMessage);
    }

    // 3. 管理者汇总（可选）
    if (this.config.managerSummarizeEachRound && this.executor) {
      const summaryContent = await this.executor(`
请总结本轮讨论的要点，并提出下一步建议。
`);
      const summaryMessage: ConversationMessage = {
        speaker: this.config.managerRole,
        speakerName: getRoleName(this.config.managerRole),
        content: `【本轮总结】${summaryContent}`,
        round: this.state.currentRound,
        timestamp: new Date(),
        type: 'summary',
      };

      this.state.history.push(summaryMessage);
      roundMessages.push(summaryMessage);
    }

    this.state.currentRound++;
    return roundMessages;
  }

  /**
   * 执行完整对话
   */
  async run(task: string): Promise<ConversationResult> {
    while (this.state.currentRound <= this.config.maxRounds) {
      await this.executeRound(task);

      const stateCopy = { ...this.state };
      if (
        this.config.terminationCondition &&
        this.config.terminationCondition(stateCopy as ConversationState)
      ) {
        this.state.terminated = true;
        break;
      }
    }

    const conclusion = this.generateConclusion();

    return {
      success: true,
      conclusion,
      history: this.state.history,
      finalRound: this.state.currentRound,
      metadata: {
        mode: 'hierarchical',
        manager: this.config.managerRole,
        workers: this.config.workerRoles,
      },
    };
  }

  /**
   * 生成结论
   */
  private generateConclusion(): string {
    const managerMessages = this.state.history.filter(
      (m) => m.speaker === this.config.managerRole && m.type === 'summary'
    );

    if (managerMessages.length > 0) {
      return managerMessages[managerMessages.length - 1].content;
    }

    return `经过 ${this.state.currentRound - 1} 轮层级讨论，任务已完成。`;
  }

  /**
   * 获取状态
   */
  getState(): ConversationState {
    return { ...this.state };
  }

  /**
   * 获取历史
   */
  getHistory(): ConversationMessage[] {
    return [...this.state.history];
  }
}

/**
 * LLM 执行器类型
 */
type LLMExecutor = (prompt: string) => Promise<string>;

/**
 * 创建对话实例的工厂函数
 */
export function createConversation(
  mode: ConversationMode,
  config: ConversationConfig | HierarchicalConfig,
  executor?: LLMExecutor
): SequentialConversation | RoundRobinConversation | HierarchicalConversation {
  switch (mode) {
    case 'sequential':
      return new SequentialConversation(config as ConversationConfig, executor);
    case 'round_robin':
      return new RoundRobinConversation(config as ConversationConfig, executor);
    case 'hierarchical':
      return new HierarchicalConversation(config as HierarchicalConfig, executor);
    default:
      throw new Error(`Unknown conversation mode: ${mode}`);
  }
}

/**
 * ConversationPattern - 对话模式类
 *
 * 实现 AgentPattern 接口，提供统一的对话协作模式
 */
export class ConversationPattern {
  private sequential: SequentialConversation;
  private roundRobin: RoundRobinConversation;
  private hierarchical: HierarchicalConversation;

  constructor(
    config: ConversationConfig | HierarchicalConfig,
    executor?: LLMExecutor
  ) {
    this.sequential = new SequentialConversation(config as ConversationConfig, executor);
    this.roundRobin = new RoundRobinConversation(config as ConversationConfig, executor);
    this.hierarchical = new HierarchicalConversation(config as HierarchicalConfig, executor);
  }

  /**
   * 执行顺序对话
   */
  async runSequential(task: string): Promise<ConversationResult> {
    return this.sequential.run(task);
  }

  /**
   * 执行轮流对话
   */
  async runRoundRobin(task: string): Promise<ConversationResult> {
    return this.roundRobin.run(task);
  }

  /**
   * 执行层级对话
   */
  async runHierarchical(task: string): Promise<ConversationResult> {
    return this.hierarchical.run(task);
  }

  /**
   * 统一执行接口
   */
  async execute(task: string, mode: ConversationMode = 'sequential'): Promise<ConversationResult> {
    switch (mode) {
      case 'sequential':
        return this.runSequential(task);
      case 'round_robin':
        return this.runRoundRobin(task);
      case 'hierarchical':
        return this.runHierarchical(task);
      default:
        return this.runSequential(task);
    }
  }
}

export default ConversationPattern;
