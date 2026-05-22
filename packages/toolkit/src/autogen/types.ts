/**
 * AutoGen Types - AutoGen 风格多 Agent 对话系统类型定义
 *
 * @author PAI
 * @version 1.0.0
 */

import type { AgentRole } from '../team/types.js';

// ==================== Conversation Agent ====================

/**
 * 对话 Agent 配置
 */
export interface ConversationAgentConfig {
  id: string;
  name: string;
  role?: AgentRole;
  systemMessage: string;
  tools?: AgentTool[];
  model?: 'haiku' | 'sonnet' | 'opus';
  temperature?: number;
  maxTokens?: number;
}

/**
 * Agent 工具定义 (重命名避免与 tools 模块冲突)
 */
export interface AutogenAgentTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  handler?: AutogenToolHandler;
}

/**
 * 工具处理器类型 (重命名避免与 tools 模块冲突)
 */
export type AutogenToolHandler = (
  args: Record<string, unknown>,
  context: AutogenToolContext
) => Promise<AutogenToolResult>;

/**
 * 工具执行上下文 (重命名避免与 tools 模块冲突)
 */
export interface AutogenToolContext {
  agentId: string;
  conversationId: string;
  history: ConversationMessage[];
}

/**
 * 工具执行结果 (重命名避免与 tools 模块冲突)
 */
export interface AutogenToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

// 保留别名以便兼容
export type AgentTool = AutogenAgentTool;
export type ToolHandler = AutogenToolHandler;
export type ToolContext = AutogenToolContext;
export type ToolResult = AutogenToolResult;

// ==================== Conversation Message ====================

/**
 * 消息类型
 */
export type MessageType =
  | 'user'
  | 'assistant'
  | 'system'
  | 'tool'
  | 'function'
  | 'human';

/**
 * 对话消息结构
 */
export interface ConversationMessage {
  id: string;
  type: MessageType;
  sender: string;
  senderId: string;
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// ==================== Conversation State ====================

/**
 * 对话状态
 */
export interface ConversationState {
  id: string;
  history: ConversationMessage[];
  currentSpeaker: string | null;
  round: number;
  maxRound: number;
  isActive: boolean;
  startTime: Date;
  endTime?: Date;
}

// ==================== Group Chat ====================

/**
 * 说话者选择方法
 */
export type SpeakerSelectionMethod =
  | 'round_robin'
  | 'auto'
  | 'random'
  | 'fixed';

/**
 * 群聊配置
 */
export interface GroupChatConfig {
  agents: ConversationAgentConfig[];
  maxRound?: number;
  speakerSelectionMethod?: SpeakerSelectionMethod;
  allowHumanInput?: boolean;
  humanProxyId?: string;
  continueCondition?: ContinueCondition;
  terminationCondition?: TerminationCondition;
}

/**
 * 继续条件
 */
export interface ContinueCondition {
  type: 'max_turns' | 'keyword' | 'consensus' | 'never';
  keyword?: string;
  threshold?: number;
  maxTurns?: number;
}

/**
 * 终止条件
 */
export interface TerminationCondition {
  type: 'max_turns' | 'keyword' | 'never';
  keyword?: string;
  maxTurns?: number;
}

/**
 * 群聊事件类型
 */
export type GroupChatEventType =
  | 'message'
  | 'speaker_changed'
  | 'round_ended'
  | 'chat_ended'
  | 'human_input'
  | 'error';

/**
 * 群聊事件
 */
export interface GroupChatEvent {
  type: GroupChatEventType;
  data: unknown;
  timestamp: Date;
}

// ==================== Human Proxy ====================

/**
 * 人工干预请求类型
 */
export type HumanInterventionType =
  | 'approval'
  | 'feedback'
  | 'confirmation'
  | 'intervention'
  | 'input';

/**
 * 人工干预请求
 */
export interface HumanInterventionRequest {
  id: string;
  type: HumanInterventionType;
  message: string;
  options?: string[];
  senderId: string;
  senderName: string;
  timestamp: Date;
  context?: Record<string, unknown>;
}

/**
 * 人工干预响应
 */
export interface HumanInterventionResponse {
  requestId: string;
  response: string;
  approved?: boolean;
  timestamp: Date;
}

// ==================== Reply Generation ====================

/**
 * 回复生成选项
 */
export interface GenerateReplyOptions {
  history: ConversationMessage[];
  tools?: AgentTool[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * 回复生成结果
 */
export interface GenerateReplyResult {
  content: string;
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'length' | 'tool_calls';
}

// ==================== Speaker Selection ====================

/**
 * 说话者选择上下文
 */
export interface SpeakerSelectionContext {
  history: ConversationMessage[];
  round: number;
  agents: string[];
  lastSpeaker: string | null;
}

/**
 * 说话者选择器接口
 */
export interface SpeakerSelector {
  select(context: SpeakerSelectionContext): string;
}
