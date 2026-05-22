/**
 * GroupChat - 群聊管理器
 *
 * AutoGen 风格的多 Agent 群聊系统核心实现
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  ConversationAgentConfig,
  ConversationMessage,
  ConversationState,
  ContinueCondition,
  GroupChatConfig,
  GroupChatEvent,
  GroupChatEventType,
  SpeakerSelectionContext,
  SpeakerSelectionMethod,
  TerminationCondition,
} from './types.js';
import { ConversationAgent } from './ConversationAgent.js';

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 群聊事件监听器
 */
export type GroupChatListener = (event: GroupChatEvent) => void | Promise<void>;

/**
 * 轮询选择器
 */
class RoundRobinSelector {
  select(context: SpeakerSelectionContext): string {
    if (!context.lastSpeaker) {
      return context.agents[0];
    }

    const currentIndex = context.agents.indexOf(context.lastSpeaker);
    const nextIndex = (currentIndex + 1) % context.agents.length;
    return context.agents[nextIndex];
  }
}

/**
 * 随机选择器
 */
class RandomSelector {
  select(context: SpeakerSelectionContext): string {
    const availableAgents = context.agents.filter(
      (a) => a !== context.lastSpeaker
    );
    const index = Math.floor(Math.random() * availableAgents.length);
    return availableAgents[index];
  }
}

/**
 * 固定选择器
 */
class FixedSelector {
  private fixedAgent: string;

  constructor(fixedAgent: string) {
    this.fixedAgent = fixedAgent;
  }

  select(_context: SpeakerSelectionContext): string {
    return this.fixedAgent;
  }
}

/**
 * 群聊管理器
 *
 * 管理多个 Agent 之间的对话，支持多种说话者选择策略
 */
export class GroupChat {
  public readonly agents: Map<string, ConversationAgent>;
  public readonly maxRound: number;
  public readonly speakerSelectionMethod: SpeakerSelectionMethod;
  public readonly continueCondition: ContinueCondition;
  public readonly terminationCondition: TerminationCondition;
  public readonly allowHumanInput: boolean;
  public readonly humanProxyId?: string;

  private state: ConversationState;
  private listeners: Set<GroupChatListener> = new Set();
  private speakerSelector: RoundRobinSelector | RandomSelector | FixedSelector;

  constructor(config: GroupChatConfig) {
    // 初始化 Agent
    this.agents = new Map();
    for (const agentConfig of config.agents) {
      const agent = new ConversationAgent(agentConfig);
      this.agents.set(agent.id, agent);
    }

    this.maxRound = config.maxRound ?? 100;
    this.speakerSelectionMethod = config.speakerSelectionMethod ?? 'round_robin';
    this.allowHumanInput = config.allowHumanInput ?? false;
    this.humanProxyId = config.humanProxyId;

    // 初始化继续和终止条件
    this.continueCondition = config.continueCondition ?? {
      type: 'max_turns',
      maxTurns: config.maxRound ?? 100,
    };

    this.terminationCondition = config.terminationCondition ?? {
      type: 'max_turns',
      maxTurns: config.maxRound ?? 100,
    };

    // 初始化说话者选择器（默认使用 round_robin）
    this.speakerSelector = this.createSpeakerSelector(
      (config.speakerSelectionMethod ?? 'round_robin') as SpeakerSelectionMethod
    );

    // 初始化状态
    this.state = {
      id: generateId(),
      history: [],
      currentSpeaker: null,
      round: 0,
      maxRound: this.maxRound,
      isActive: false,
      startTime: new Date(),
    };
  }

  /**
   * 创建说话者选择器
   */
  private createSpeakerSelector(
    method: SpeakerSelectionMethod
  ): RoundRobinSelector | RandomSelector | FixedSelector {
    switch (method) {
      case 'random':
        return new RandomSelector();
      case 'fixed':
        // 默认使用第一个 Agent
        return new FixedSelector(this.agents.values().next().value?.id ?? '');
      case 'round_robin':
      default:
        return new RoundRobinSelector();
    }
  }

  /**
   * 获取当前状态
   */
  getState(): ConversationState {
    return { ...this.state };
  }

  /**
   * 获取消息历史
   */
  getHistory(): ConversationMessage[] {
    return [...this.state.history];
  }

  /**
   * 添加事件监听器
   */
  addListener(listener: GroupChatListener): void {
    this.listeners.add(listener);
  }

  /**
   * 移除事件监听器
   */
  removeListener(listener: GroupChatListener): void {
    this.listeners.delete(listener);
  }

  /**
   * 触发事件
   */
  private async emit(event: GroupChatEvent): Promise<void> {
    const listenersArray = Array.from(this.listeners);
    for (const listener of listenersArray) {
      await Promise.resolve(listener(event));
    }
  }

  /**
   * 选择下一个说话者
   */
  selectNextSpeaker(): string {
    const context: SpeakerSelectionContext = {
      history: this.state.history,
      round: this.state.round,
      agents: Array.from(this.agents.keys()),
      lastSpeaker: this.state.currentSpeaker,
    };

    return this.speakerSelector.select(context);
  }

  /**
   * 运行群聊
   */
  async run(initialMessage?: string): Promise<ConversationMessage[]> {
    this.state.isActive = true;
    this.state.startTime = new Date();

    // 添加初始消息（如果有）
    if (initialMessage) {
      const systemMsg: ConversationMessage = {
        id: generateId(),
        type: 'user',
        sender: 'User',
        senderId: 'user',
        content: initialMessage,
        timestamp: new Date(),
      };
      this.state.history.push(systemMsg);
      await this.emit({
        type: 'message',
        data: systemMsg,
        timestamp: new Date(),
      });
    }

    try {
      while (this.shouldContinue()) {
        // 检查终止条件
        if (this.shouldTerminate()) {
          break;
        }

        // 选择说话者
        const speakerId = this.selectNextSpeaker();
        const speaker = this.agents.get(speakerId);

        if (!speaker) {
          throw new Error(`Speaker ${speakerId} not found`);
        }

        this.state.currentSpeaker = speakerId;
        this.state.round++;

        // 触发说话者变更事件
        await this.emit({
          type: 'speaker_changed',
          data: { speakerId, speakerName: speaker.name, round: this.state.round },
          timestamp: new Date(),
        });

        // 生成回复
        const reply = await speaker.generateReply({
          history: this.state.history,
          tools: speaker.getToolList(),
        });

        // 创建消息
        const message = speaker.createMessage(reply.content, 'assistant', {
          finishReason: reply.finishReason,
        });

        // 处理工具调用
        if (reply.toolCalls && reply.toolCalls.length > 0) {
          message.toolCalls = reply.toolCalls;

          for (const toolCall of reply.toolCalls) {
            const toolResult = await speaker.executeTool(
              toolCall.name,
              toolCall.arguments,
              {
                agentId: speaker.id,
                conversationId: this.state.id,
                history: this.state.history,
              }
            );

            // 添加工具结果到历史
            const toolMessage: ConversationMessage = {
              id: generateId(),
              type: 'tool',
              sender: toolCall.name,
              senderId: toolCall.id,
              content: toolResult.success
                ? JSON.stringify(toolResult.result)
                : toolResult.error || 'Tool execution failed',
              timestamp: new Date(),
              toolCallId: toolCall.id,
              metadata: { toolResult },
            };

            this.state.history.push(toolMessage);
          }
        }

        // 添加消息到历史
        this.state.history.push(message);

        // 触发消息事件
        await this.emit({
          type: 'message',
          data: message,
          timestamp: new Date(),
        });

        // 触发回合结束事件
        await this.emit({
          type: 'round_ended',
          data: { round: this.state.round, speakerId },
          timestamp: new Date(),
        });
      }
    } finally {
      this.state.isActive = false;
      this.state.endTime = new Date();

      // 触发聊天结束事件
      await this.emit({
        type: 'chat_ended',
        data: {
          totalRounds: this.state.round,
          totalMessages: this.state.history.length,
          duration: this.state.endTime.getTime() - this.state.startTime.getTime(),
        },
        timestamp: new Date(),
      });
    }

    return this.state.history;
  }

  /**
   * 检查是否应该继续
   */
  private shouldContinue(): boolean {
    if (!this.state.isActive) return false;

    const condition = this.continueCondition;

    switch (condition.type) {
      case 'max_turns':
        return this.state.round < (condition.maxTurns ?? this.maxRound);
      case 'keyword':
        // 检查最后一条消息是否包含关键词
        const lastMsg = this.state.history[this.state.history.length - 1];
        return !lastMsg || !condition.keyword || !lastMsg.content.includes(condition.keyword);
      case 'never':
        return false;
      default:
        return this.state.round < this.maxRound;
    }
  }

  /**
   * 检查是否应该终止
   */
  private shouldTerminate(): boolean {
    const condition = this.terminationCondition;

    switch (condition.type) {
      case 'max_turns':
        return this.state.round >= (condition.maxTurns ?? this.maxRound);
      case 'keyword':
        const lastMsg = this.state.history[this.state.history.length - 1];
        return !!lastMsg && !!condition.keyword && lastMsg.content.includes(condition.keyword);
      case 'never':
        return false;
      default:
        return false;
    }
  }

  /**
   * 广播消息给所有 Agent
   */
  async broadcast(message: ConversationMessage): Promise<void> {
    this.state.history.push(message);

    await this.emit({
      type: 'message',
      data: message,
      timestamp: new Date(),
    });
  }

  /**
   * 添加消息到历史
   */
  addMessage(message: ConversationMessage): void {
    this.state.history.push(message);
  }

  /**
   * 重置对话
   */
  reset(): void {
    this.state = {
      id: generateId(),
      history: [],
      currentSpeaker: null,
      round: 0,
      maxRound: this.maxRound,
      isActive: false,
      startTime: new Date(),
    };
  }

  /**
   * 获取 Agent
   */
  getAgent(agentId: string): ConversationAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * 获取所有 Agent ID
   */
  getAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }
}

/**
 * 创建群聊的工厂函数
 */
export function createGroupChat(config: GroupChatConfig): GroupChat {
  return new GroupChat(config);
}
