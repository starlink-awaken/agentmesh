/**
 * Agent Toolkit - 统一入口
 *
 * 整合 TheAlgorithm、Fabric、Substrate、Telos 和架构工具的统一能力层
 *
 * @author PAI
 * @version 1.0.0
 */

import { AlgorithmEngine } from './core/AlgorithmEngine.js';
import { PatternLoader } from './patterns/PatternLoader.js';
import { CapabilityRouter } from './core/CapabilityRouter.js';
import { SkillLoader, SkillRouter, createSkillSystem } from './skills/index.js';

// Core 模块
export {
  AlgorithmEngine,
  ISCGenerator,
  CapabilityRouter,
} from './core/index.js';

export type {
  AlgorithmConfig,
  ISCGeneratorConfig,
  RouterConfig,
  CapabilitySelection,
  TaskAnalysis,
} from './core/index.js';

export type {
  ISCCriterion,
  AlgorithmPhase,
  AlgorithmContext,
  AlgorithmResult,
  CapabilityType,
} from './core/index.js';

// Patterns 模块
export {
  PatternLoader,
  analyzePatterns,
  extractPatterns,
  summarizePatterns,
  transformPatterns,
  allPatterns,
  getPatternById,
  getPatternsByCategory,
  searchPatterns,
  // Agent Design Patterns
  AgentPatterns,
  agentDesignPatterns,
  promptChaining,
  routing,
  parallelization,
  planning,
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
} from './patterns/index.js';

export type {
  PatternDefinition,
  PatternResult,
  PatternLoaderConfig,
  // Agent Design Patterns types
  AgentPattern,
  PatternResult as AgentPatternResult,
  PatternCategory as AgentPatternCategory,
} from './patterns/index.js';

// Knowledge 模块 - 知识图谱 + RAG
export {
  KnowledgeGraph,
  BaseDataSource,
  DataSourceFactory,
  DataSourceType,
  MemoryVectorStore,
  createVectorStore,
  HybridRetriever,
  createHybridRetriever,
} from './knowledge/index.js';

export type {
  KnowledgeNode,
  KnowledgeRelation,
  QueryResult,
  NodeType,
  RelationType,
  DataSourceConfig,
  QueryOptions,
  DataSourceResult,
  VectorDocument,
  VectorSearchResult,
  VectorStoreConfig,
  IVectorStore,
  RetrievalResult,
  HybridRetrieverConfig,
} from './knowledge/index.js';

// Lifecycle 模块
export {
  TelosContext,
  EntityStates,
  EntityActions,
} from './lifecycle/index.js';

export type {
  EntityConfig,
  EntityEvent,
  EntityState,
} from './lifecycle/index.js';

// Architecture 模块
export {
  C4Model,
  ADRManager,
  FormalMethod,
} from './architecture/index.js';

export type {
  C4Element,
  C4Relation,
  C4ElementType,
  ADRRecord,
  ADRStatus,
  ADRSearchOptions,
  State,
  Transition,
  Invariant,
  Property,
  FormalMethodType,
} from './architecture/index.js';

// Integrations 模块
export {
  PublicAPIs,
  MCPServers,
} from './integrations/index.js';

export type {
  PublicAPI,
  SearchOptions,
  MCPServer,
  MCPCategory,
} from './integrations/index.js';

// Skills 模块 - Progressive Disclosure 模式
export {
  SkillLoader,
  SkillRouter,
  createSkillSystem,
  builtInSkills,
} from './skills/index.js';

export type {
  SkillDefinition,
  SkillInstance,
  SkillMatchResult,
  SkillLoadOptions,
  SkillExecutionContext,
  ReferenceRoute,
  Constraint,
  WorkflowStep,
} from './skills/index.js';

// Memory 模块 - 记忆认知模式 + ReasoningBank
export {
  MemoryStore,
  ContextRetriever,
  ReasoningBank,
  SelfJudge,
  createMemorySystem,
  createReasoningBank,
  // Embedding Providers
  LocalEmbeddingProvider,
  OpenAIEmbeddingProvider,
  cosineSimilarity,
} from './memory/index.js';

export type {
  MemoryEntry,
  MemoryMetadata,
  MemoryFilter,
  RetrievalQuery,
  RetrievedContext,
  // ReasoningBank 类型
  ReasoningMemory,
  TaskResult,
  SelfJudgeConfig,
  // Embedding Provider 类型
  EmbeddingProvider,
  LocalEmbeddingProviderConfig,
  OpenAIEmbeddingProviderConfig,
} from './memory/index.js';

// Tools 模块 - 模块化单体
export {
  ToolRegistry,
  ToolBuilder,
  DynamicComposer,
} from './tools/index.js';

export type {
  AgentTool,
  ToolHandler,
  ToolContext,
  ToolResult,
  ParameterDefinition,
  ParameterProperty,
  ToolComposition,
  ToolRequirement,
  ExecutionResult,
  ExecutionCondition,
  ErrorHandler,
  ToolRegistryStats,
} from './tools/index.js';

// Tuning 模块 - 分层缓存与微调
export {
  FeedbackCollector,
  CacheManager,
} from './tuning/index.js';

export type {
  TuningFeedback,
  CacheEntry,
  CacheTier,
  FineTuneConfig,
  CacheConfig,
} from './tuning/index.js';

// Hybrid 模块 - 规则+生成式融合
export {
  RuleEngine,
} from './hybrid/index.js';

export type {
  HybridRule,
  RuleCondition,
  RuleAction,
  ResolutionContext,
  ResolutionResult,
} from './hybrid/index.js';

// Local Reflex 模块 - 本地反射系统（端云协同）
export {
  OllamaClient,
  createOllamaClient,
  GrammarEnforcer,
  createGrammarEnforcer,
  PromptCompressor,
  createPromptCompressor,
  IdleProcessor,
  createIdleProcessor,
  createLocalReflexSystem,
} from './local-reflex/index.js';

export type {
  OllamaConfig,
  LLMRequest,
  LLMResponse,
  StructuredOutputConfig,
  CompressionConfig,
  IdleTask,
  ToolCallRequest,
  ToolCallResponse,
} from './local-reflex/index.js';

// Team 模块
export {
  TeamManager,
} from './team/index.js';

export type {
  Teammate,
  TeamTask,
  TeamMessage,
  TeamConfig,
} from './team/index.js';

// Middleware 模块 - 中间件/拦截器系统
export {
  MiddlewareChain,
  createContext,
  createError,
  createStopMiddleware,
  compose,
  RequestInterceptorManager,
  createRequestInterceptorManager,
  createHeaderValidator,
  createBodySizeLimiter,
  createPathNormalizer,
  createJSONBodyParser,
  createCORSPreflightHandler,
  ResponseInterceptorManager,
  createResponseInterceptorManager,
  createResponseTimeTracker,
  createCORSAdder,
  createResponseCompressor,
  createJSONFormatter,
  createErrorFormatter,
  createSuccessWrapper,
  ErrorMiddleware,
  createErrorMiddleware,
  createErrorResponder,
  LoggingMiddleware,
  createLoggingMiddleware,
  createRequestLogger,
  createDebugLogger,
  RateLimitMiddleware,
  MemoryRateLimitStore,
  createRateLimitMiddleware,
  createIPRateLimitMiddleware,
  createUserRateLimitMiddleware,
  ConsoleLogger,
} from './middleware/index.js';

export type {
  MiddlewareContext,
  MiddlewareNext,
  MiddlewareFunc,
  MiddlewareError,
  MiddlewareState,
  MiddlewareConfig,
  MiddlewareChainConfig,
  Request,
  Response,
  RequestInterceptor,
  ResponseInterceptor,
  RateLimitConfig,
  RateLimitEntry,
  ErrorRecoveryOptions,
  ErrorRecoveryContext,
  RateLimitStore,
} from './middleware/index.js';

// AutoGen 模块 - 多 Agent 对话系统
export {
  ConversationAgent,
  GroupChat,
  HumanProxy,
  createGroupChat,
  createHumanProxy,
  createDefaultInputHandler,
} from './autogen/index.js';

export type {
  GroupChatListener,
  HumanInputHandler,
  // Agent types
  ConversationAgentConfig,
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
} from './autogen/index.js';

// Edge 模块 - 云边端协同（基于CAMPHOR论文 + 云边端专利）
export {
  EdgeAgent,
  createEdgeAgent,
  EdgeCoordinator,
  TaskOffloader,
  createEdgeSystem,
} from './edge/index.js';

// Edge模块的PromptCompressor（使用别名避免与local-reflex冲突）
export {
  PromptCompressor as EdgePromptCompressor,
  createPromptCompressor as createEdgePromptCompressor,
} from './edge/index.js';

export type {
  EdgeAgentConfig,
  EdgeAgentType,
  EdgeTask,
  EdgeResult,
  OffloadStrategy,
  CompressionConfig as EdgeCompressionConfig,
  ComputeTier,
  OffloadDecision,
} from './edge/index.js';

// Context 模块 - 上下文窗口动态裁剪
export {
  ContextTrimmer,
  createContextTrimmer,
} from './context/index.js';

export type {
  TrimConfig,
  TrimStrategy,
  ContextItem,
  TrimResult,
  Tokenizer,
} from './context/index.js';

// QA 模块 - 质量评估与测试分发
export {
  QualityEvaluator,
  TestDispatcher,
  createQualityEvaluator,
  createTestDispatcher,
  TEST_AGENTS,
} from './qa/index.js';

export type {
  TestType,
  TestResult,
  QualityInput,
  QualityScore,
  DispatchConfig,
  AgentConfig,
  DispatchResult,
} from './qa/index.js';

// Session 模块 - 会话管理与检查点
export {
  SessionManager,
  SessionStateManager,
  DEFAULT_SESSION_STATE,
  MemoryCheckpointStore,
  FileCheckpointStore,
  createCheckpointStore,
  generateCheckpointId,
  createSessionManager,
  getDefaultSessionManager,
  resetDefaultSessionManager,
} from './session/index.js';

export type {
  SessionStatus,
  SessionConfig,
  SessionState,
  SessionError as SessionErrorType,
  SessionMetadata,
  Checkpoint,
  CheckpointMetadata,
  SessionInfo,
  CreateSessionOptions,
  SessionEvent,
  SessionEventListener,
  StateTransition,
  ICheckpointStore,
  ISessionManager,
  SessionManagerConfig,
} from './session/index.js';

export {
  DEFAULT_TRANSITIONS,
} from './session/index.js';

// AGENTS.md 模块 - 文档优化与索引
export {
  DocumentParser,
  createDocumentParser,
  KeywordExtractor,
  createKeywordExtractor,
  AgentsMdIndexer,
  createAgentsMdIndexer,
  buildCommand,
  serveCommand,
  watchCommand,
  main,
} from './agents-md/index.js';

export type {
  ParserConfig,
  Section,
  CompressedIndex,
  DocumentStats,
  Keyword,
  ExtractorConfig,
  IndexedDocument,
  IndexerConfig,
  SearchResult,
  CLIConfig,
} from './agents-md/index.js';

// LangChain 模块 - Runnable 接口实现
export {
  // 核心类
  Runnable,
  RunnableSequence,
  Sequence,
  RunnableParallel,
  RunnableLambda,
  RunnableAssign,
  RunnablePick,
  RunnableMap,
  SkillRunnable,
  SkillRunnableSequence,
  createSkillRunnable,
  // 便捷函数
  createLambda,
  createAsyncLambda,
  createParallel,
  createSequence,
  pipe,
} from './langchain/index.js';

export type {
  // 类型
  RunnableConfig,
  RunnableCallback,
  RunnableInput,
  RunnableOutput,
  ChainResult,
  ChainStepResult,
  BatchResult,
  StreamEvent,
  StreamEventType,
  RunnableInterface,
  RunnableBindingConfig,
  PipeableRunnable,
  RunnableInputType,
  RunnableOutputType,
  // Lambda 类型
  LambdaFunc,
  StreamLambdaFunc,
  RunnableLambdaConfig,
  // Skill 类型
  SkillRunnableConfig,
  SkillExecutorFunc,
  SkillInput,
  SkillOutput,
} from './langchain/index.js';

// LLM 模块 - 多 Provider LLM 调用层
export {
  createLLMClient,
  createOpenAIProvider,
  createAnthropicProvider,
  createOllamaProvider,
  getDefaultModel,
  getProviderCapabilities,
  chat,
  stream,
  // 类
  LLMClient,
  OpenAIProvider,
  AnthropicProvider,
  OllamaProvider,
  // 工具函数
  hasCapability,
} from './llm/index.js';

export type {
  // Provider 类型
  ProviderType,
  MessageRole,
  // 配置与请求
  LLMConfig,
  JSONSchema,
  FunctionDefinition,
  ChatMessage,
  LLMFunctionCall,
  // 响应类型
  ChatCompletion,
  StreamChunk,
  Usage,
  EmbedRequest,
  EmbedResponse,
  // 选项类型
  ChatOptions,
  StreamOptions,
  // Provider 能力
  ProviderCapabilities,
  // 配置类型
  CreateLLMClientConfig,
} from './llm/index.js';

// LLMError 现在从 errors 模块导出

// Retry 模块 - 重试机制与 HTTP 客户端
export {
  RetryableClient,
  HTTPRetryClient,
  createRetryableClient,
  createHTTPRetryClient,
  withRetry,
} from './retry/index.js';

export type {
  RetryConfig,
  RetryResult,
  HTTPRequestConfig,
  HTTPResponse,
  HTTPClientConfig,
} from './retry/index.js';

export {
  DEFAULT_RETRY_CONFIG,
  HTTP_STATUS_RETRY,
} from './retry/index.js';

// Errors 模块 - 统一错误类型层次结构
export {
  AgentToolkitError,
  LLMError,
  ValidationError,
  ConfigurationError,
  NetworkError,
  TimeoutError,
  AuthenticationError,
  RateLimitError,
  SessionError,
  ToolError,
  SkillError,
  TeamError,
  MemoryError,
  KnowledgeGraphError,
  PatternError,
  ArchitectureError,
  IntegrationError,
  RetryError,
  isRetryable,
  getErrorMessage,
  compressError,
  wrapError,
  extractErrorStack,
  createErrorFactory,
  isErrorType,
  mergeErrorDetails,
  calculateRetryDelay,
  ERROR_CODES,
  Errors,
} from './errors/index.js';

export type {
  AgentToolkitError as AgentToolkitErrorType,
} from './errors/index.js';

// Observability 模块 - 可观测性系统（日志、指标、追踪、健康检查）
export {
  // EventEmitter
  EventEmitter,
  createEventEmitter,
  // Logger
  Logger,
  createLogger,
  getDefaultLogger,
  setDefaultLogger,
  // Metrics
  Counter,
  Gauge,
  Histogram,
  Metrics,
  createMetrics,
  getDefaultMetrics,
  setDefaultMetrics,
  // Tracer
  Span,
  Tracer,
  createTracer,
  getDefaultTracer,
  setDefaultTracer,
  // HealthCheck
  HealthCheck,
  createHealthCheck,
  getDefaultHealthCheck,
  setDefaultHealthCheck,
  createMemoryHealthCheck,
  createCpuHealthCheck,
  createEventLoopHealthCheck,
} from './observability/index.js';

export type {
  // Logger types
  LogLevel,
  LogEntry,
  LogOutput,
  LoggerConfig,
  // Metrics types
  MetricName,
  MetricValue,
  MetricType,
  CounterMetric,
  GaugeMetric,
  HistogramMetric,
  Metric,
  MetricsConfig,
  // Tracer types
  TraceSpan,
  SpanLog,
  TraceContext,
  TracerConfig,
  SamplingDecision,
  // HealthCheck types
  HealthStatus,
  HealthCheckResult,
  HealthCheckConfig,
  HealthCheckRegistration,
  // EventEmitter types
  EventType,
  EventListener,
  EventEmitterOptions,
  // OpenTelemetry types
  OpenTelemetrySpan,
  OpenTelemetryMetric,
} from './observability/index.js';

// Plugin 模块 - 插件系统
export {
  // 工厂函数
  createPlugin,
  createDefaultPlugin,
  // 实现类
  AgentToolkitPluginImpl,
  getDefaultPlugin,
  resetDefaultPlugin,
  // 常量
  AGENT_TOOLKIT_PLUGIN,
  PLUGIN_MODULES,
} from './plugin/index.js';

export type {
  // 类型
  Plugin,
  AgentToolkitPlugin,
  PluginRegistration,
  PluginInitConfig,
  PluginInitResult,
  LazyModule,
  ModuleLoader,
  PluginModuleName,
} from './plugin/index.js';

/**
 * AgentToolkit 配置
 */
export interface AgentToolkitConfig {
  patternsDir?: string;
  knowledgeBase?: boolean;
  telosEnabled?: boolean;
  skillsEnabled?: boolean;
  algorithm?: {
    autoGenerateISC?: boolean;
    debug?: boolean;
  };
}

/**
 * AgentToolkit 主类
 */
export class AgentToolkit {
  public algorithm: AlgorithmEngine;
  public patterns: PatternLoader;
  public router: CapabilityRouter;
  public skills!: SkillLoader;
  public skillRouter!: SkillRouter;
  private config: AgentToolkitConfig;

  constructor(config: AgentToolkitConfig = {}) {
    this.config = config;

    // 初始化核心组件
    this.algorithm = new AlgorithmEngine(config.algorithm);
    this.patterns = new PatternLoader({
      patternsDir: config.patternsDir,
    });
    this.router = new CapabilityRouter();

    // 初始化技能系统
    if (config.skillsEnabled !== false) {
      const skillSystem = createSkillSystem();
      this.skills = skillSystem.loader;
      this.skillRouter = skillSystem.router;
    }
  }

  /**
   * 获取版本
   */
  static getVersion(): string {
    return '1.0.0';
  }
}

export default AgentToolkit;
/**
 * Agent-Toolkit — Unified Agent Capability Layer
 *
 * Cross-project bridges:
 * - agent-toolkit → honeycomb: DSL executor capabilities
 * - agent-toolkit → agentmesh: shared agent patterns
 */

