/**
 * AutoGen 模块 - 统一导出
 *
 * AutoGen 风格的多 Agent 对话系统
 *
 * @author PAI
 * @version 1.0.0
 */

export { ConversationAgent, createConversationAgent } from './ConversationAgent.js';

export { GroupChat, createGroupChat } from './GroupChat.js';

export type { GroupChatListener } from './GroupChat.js';

export { HumanProxy, createHumanProxy, createDefaultInputHandler } from './HumanProxy.js';

export type { HumanInputHandler } from './HumanProxy.js';

export type {
  // Agent types
  ConversationAgentConfig,
  AgentTool,
  ToolHandler,
  ToolContext,
  ToolResult,

  // Message types
  MessageType,
  ConversationMessage,
  ToolCall,

  // State types
  ConversationState,

  // GroupChat types
  SpeakerSelectionMethod,
  GroupChatConfig,
  ContinueCondition,
  TerminationCondition,
  GroupChatEventType,
  GroupChatEvent,

  // HumanProxy types
  HumanInterventionType,
  HumanInterventionRequest,
  HumanInterventionResponse,

  // Reply types
  GenerateReplyOptions,
  GenerateReplyResult,

  // Speaker selection types
  SpeakerSelectionContext,
  SpeakerSelector,
} from './types.js';
