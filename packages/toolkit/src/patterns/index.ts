/**
 * Patterns 模块 - 统一导出
 *
 * @author PAI
 * @version 1.0.0
 */

export { PatternLoader, PatternExecutor } from './PatternLoader.js';
export type { PatternLoaderConfig } from './PatternLoader.js';
export type { PatternDefinition, PatternResult } from './types.js';

export {
  analyzePatterns,
  extractPatterns,
  summarizePatterns,
  transformPatterns,
  allPatterns,
  getPatternById,
  getPatternsByCategory,
  searchPatterns,
} from './fabric.js';

export type { PatternCategory } from './fabric.js';

// Agent Design Patterns - Google Agentic Design Patterns
export {
  AgentPatterns,
  agentDesignPatterns,
  promptChaining,
  routing,
  parallelization,
  planning,
  react,
  sequential,
  parallelExec,
  loop,
  orchestrator,
  toolUse,
  knowledgeRetrieval,
  structuredOutput,
  memoryManagement,
  reflection,
  selfCorrection,
  learningAdaptation,
  multiAgentCollaboration,
  hierarchicalAgents,
  debate,
  humanInTheLoop,
  guardrails,
} from './AgentPatterns.js';

export type {
  AgentPattern,
  PatternResult as AgentPatternResult,
  PatternCategory as AgentPatternCategory,
} from './AgentPatterns.js';

// Research Framework - 深度研究框架
export {
  ResearchFramework,
  RESEARCH_PHASES,
  DEPTH_CONFIG,
  researchPattern,
  createResearchFramework,
  runResearch,
} from './ResearchFramework.js';

export type {
  ResearchPhase,
  ResearchDepth,
  PhaseConfig,
  ResearchConfig,
  ResearchResult,
  PhaseOutput,
  LLMExecutor,
} from './ResearchFramework.js';

// Conversation Patterns - 多代理对话模式
export {
  ConversationPattern,
  SequentialConversation,
  RoundRobinConversation,
  HierarchicalConversation,
  createConversation,
} from './conversation.js';

export type {
  ConversationConfig,
  ConversationState,
  ConversationMessage,
  ConversationResult,
  ConversationMode,
  HierarchicalConfig,
  SpeakerSelection,
} from './conversation.js';

// Debate Patterns - 辩论模式
export {
  DebatePattern,
  createDebate,
  quickDebate,
} from './debate.js';

export type {
  DebateConfig,
  DebateState,
  DebateMessage,
  DebateResult,
  DebateSide,
} from './debate.js';

// Consensus Patterns - 共识模式
export {
  ConsensusPattern,
  createConsensus,
  quickConsensus,
  calculateAgreement,
} from './consensus.js';

export type {
  ConsensusConfig,
  ConsensusState,
  ConsensusMessage,
  ConsensusResult,
  VoteOption,
  VoteResult,
} from './consensus.js';
