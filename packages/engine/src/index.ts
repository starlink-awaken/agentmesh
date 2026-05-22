/**
 * Honeycomb v2 - 多 Agent 协作引擎
 *
 * 公共 API 导出文件。重新导出外部消费者所需的
 * 所有类型和核心类。
 *
 * @since v2.0.0
 */

// Re-export all types
export * from './types.js';

// ============================================================
// Phase 1-2: Core Engine
// ============================================================

export { PhaseStateMachine, createStateMachine } from './state-machine.js';
export type { RiskAssessmentContext } from './state-machine.js';
export { CheckpointManager } from './checkpoint-manager.js';
export { MessageBus } from './message-bus.js';
export type { MessageHandler } from './message-bus.js';
export { AgentRunner, AgentPool } from './agent-runner.js';
export { Logger, createLogger, logger } from './logger.js';
export { ConfigLoader, createConfigLoader, DEFAULT_ENGINE_CONFIG } from './config-loader.js';
export { DomainLoader, createDomainLoader } from './domain-loader.js';
export {
  validateDomainConfig,
  createSchemaValidator,
  DOMAIN_CONFIG_SCHEMA,
  type Schema,
  type SchemaValidator,
  type ValidationResult as DomainValidationResult,
  type ValidationError as DomainValidationError
} from './domain-schema.js';
export { HoneycombOrchestrator, createOrchestrator } from './orchestrator.js';
export { MetricsCollector, createMetrics, metrics } from './metrics.js';
export type {
  MetricType,
  MetricEntry,
  TimerHandle,
  MetricsSnapshot,
} from './metrics.js';
export { Dashboard, createDashboard } from './dashboard.js';
export type { DashboardOptions } from './dashboard.js';
export { DashboardMonitor, createMonitor, runMonitor } from './dashboard-monitor.js';
export type { MonitorOptions } from './dashboard-monitor.js';

// Error handling
export {
  ErrorHandler,
  createErrorHandler,
  HoneycombError,
  ErrorSeverity,
  ErrorCategory,
  withErrorHandling,
  withErrorHandler,
} from './error-handler.js';
export type { RecoveryStrategy } from './error-handler.js';

// Enhanced rollback support
export { RollbackHistory } from './rollback-history.js';

// ============================================================
// Phase 3: Intelligence & Interaction
// ============================================================

// 3.0 分布式追踪系统（增强的 Trace ID）
export {
  TraceContextImpl,
  TraceContextManager,
  createTraceContext,
  createTraceContextManager,
} from './trace-context.js';
export {
  TraceExporter,
  createTraceExporter,
  exportTraceAsJSON,
  exportTraceAsMermaid,
  exportTraceAsText,
  exportTraceAsSummary,
  exportTraceAsMarkdown,
} from './trace-exporter.js';
export type {
  SpanTags,
  SpanStatus,
  TraceContext,
  TraceTreeNode as TraceTreeNodeV2,
  TraceMetrics,
  ExportFormat,
  ExportOptions,
  Span as SpanV2,
} from './trace-types.js';

// 3.1 Three-layer memory system
export {
  WorkingMemory,
  ProjectMemory,
  OrgMemory,
  createWorkingMemory,
  createProjectMemory,
  createOrgMemory,
  workingMemory,
} from './memory.js';
export type { ProjectMemoryEntry, OrgMemoryEntry } from './memory.js';

// 3.2 Context shard management
export {
  ContextShardManager,
  createContextShardManager,
  contextShardManager,
} from './context-shard-manager.js';
export type { AssembleResult, ShardStats } from './context-shard-manager.js';

// 3.3 Real-time interactive control
export {
  InteractiveController,
  createInteractiveController,
} from './interactive-control.js';
export type {
  ControlCommand,
  PriorityLevel,
  InteractiveStatus,
  OrchestratorInterface,
} from './interactive-control.js';

// 3.4 Guardian agent monitoring
export {
  Guardian,
  createGuardian,
  guardian,
  AlertSeverity,
  AlertCategory,
} from './guardian.js';
export type {
  GuardianAlert,
  GuardianPolicy,
  MonitoringContext,
  GuardianConfig,
  GuardianStats,
} from './guardian.js';

// 3.4.1 Guardian intervention types (P0: 自动干预逻辑)
// InterventionAction, AnomalyPattern, InterventionResult 等已在 types.ts 中导出

// 3.4.3 Governance Coordinator (治理层协调机制)
export {
  GovernanceCoordinator,
  createGovernanceCoordinator,
} from './governance-coordinator.js';
export type {
  GovernanceAgent,
  GovernanceVote,
  WeightedVote,
  GovernanceDecision,
  GovernanceConflict,
  ConflictResolution,
  CoordinatorConfig,
  VoteSubmissionResult,
  CoordinatorStats,
  GuardianCompatibleDecision,
} from './governance-coordinator.js';
export {
  VoteType,
  ConflictType,
  ConflictSeverity,
  AggregationStrategy,
} from './governance-coordinator.js';

// 3.4.2 Anomaly Detection System (P0-3: 异常自动化检测)
export {
  AnomalyRuleEngine,
  createRuleEngine,
  defaultRuleEngine,
} from './anomaly-rule-engine.js';
export {
  AnomalyMonitor,
  createAnomalyMonitor,
  defaultAnomalyMonitor,
} from './anomaly-monitor.js';
export {
  InterventionExecutor,
  createInterventionExecutor,
} from './intervention-executor.js';
export type {
  // Anomaly Detection Types
  RuleOperator,
  LogicalOperator,
  RuleCondition,
  CompositeRuleCondition,
  Condition,
  RuleFrequency,
  RuleStatus,
  AnomalyDetectionRule,
  MonitoringMetrics,
  RuleEvaluationResult,
  AnomalyDetectionResult,
  RuleEngineConfig,
  RuleTriggerRecord,
  RuleTemplateType,
  RuleTemplate,
} from './anomaly-detection-types.js';

// 3.5 Domain success metrics
export {
  DomainMetrics,
  createDomainMetrics,
  domainMetrics,
} from './domain-metrics.js';
export type {
  MetricDefinition,
  MetricMeasurement,
  DomainMetricProfile,
  QualityReport,
} from './domain-metrics.js';

// ============================================================
// Phase 4: Enterprise Project Support
// ============================================================

// 4.1 Swarm protocol
export {
  SwarmProtocol,
  createSwarmProtocol,
  swarmProtocol,
} from './swarm-protocol.js';
export type {
  SwarmRole,
  SubHoneycombStatus,
  SubHoneycomb,
  SwarmState,
  SwarmConfig,
  DependencyGraph,
  HeartbeatReport,
  ProgressReport,
} from './swarm-protocol.js';

// 4.2 Project decomposer
export {
  Decomposer,
  createDecomposer,
  decomposer,
} from './decomposer.js';
export type {
  SubProject,
  DecompositionResult,
  DependencyEdge,
  DecompositionStrategy,
  ValidationResult as DecompositionValidationResult,
} from './decomposer.js';

// 4.3 Contract management
export {
  ContractManager,
  createContractManager,
  contractManager,
} from './contract-manager.js';
export type {
  ContractStatus,
  ContractField,
  ContractDefinition,
  ContractValidationResult,
  ContractViolation,
  ContractChangeRecord,
} from './contract-manager.js';

// 4.4 Observability stack
// Note: AlertSeverity aliased as ObsAlertSeverity to avoid conflict with guardian.ts
export {
  Tracer,
  AlertEngine,
  MetricsExporter,
  HealthChecker,
  ObservabilityStack,
  createObservabilityStack,
  observability,
  AlertSeverity as ObsAlertSeverity,
} from './observability.js';
export type {
  Span,
  SpanTreeNode,
  TracerStats,
  AlertCondition,
  AlertRule,
  AlertEvent,
  HealthStatus,
  HealthCheck,
  SystemHealth,
  HealthCheckFn,
} from './observability.js';

// ============================================================
// Parallel Execution Architecture (AgentPool Enhancement)
// ============================================================

// Parallel execution types (避免导出冲突的类型)
export type {
  ScheduledTask,
  ParallelExecutionConfig,
  AggregationConfig,
  AggregationProgress,
  QueueStatus,
  // DependencyGraph 在 swarm-protocol 中已存在，这里使用别名避免冲突
  DependencyGraph as ParallelDependencyGraph,
  PartialResult,
  AggregatedResult,
  AutoScalingConfig,
  RetryPolicy,
  CircuitBreakerConfig,
  FallbackStrategy,
  ResourceLimits,
  LifecycleHooks,
} from './parallel-execution-types.js';

// Re-export enums
export {
  TaskPriority,
  TaskStatus,
  AggregationMode,
  TimeoutAction,
  BackoffStrategy,
  // RetryableErrorType, // 不存在
  // ScalingDirection, // 不存在
  CircuitBreakerState,
  FallbackType,
} from './parallel-execution-types.js';

// Parallel execution implementation
export {
  TaskScheduler,
  ResultAggregator,
  parallelRun,
} from './agent-pool-parallel.js';

// ============================================================
// ISC (Integrated Statement Criteria) - Quality Gate Validation
// ============================================================

export {
  // Parser
  ISCLexer,
  ISCParser,
  createParser,
  parse,

  // Evaluator
  ISCEvaluator,
  evaluateBatch,
  evaluateAllOrNothing,
  createEvaluator,
  evaluate,

  // Validator
  ISCValidator,
  createISCValidator,
  validateExpression,

  // Types
  type ASTNode,
  type ASTNodeType,
  type ISCExpression,
  type ISCIdentifier,
  type ISCLiteral,
  type ISCComparisonExpression,
  type ISCLogicalExpression,
  type ISCUnaryExpression,
  type ISCMemberExpression,
  type Token,
  type EvaluationContext,
  type EvaluationResult,
  type QualityGateISC,
  type QualityGateCriterionISC,
  type ValidationResult as ISCValidationResult,
  type ValidationError as ISCValidationError,
  type ValidationReport as ISCValidationReport,
  type SourceLocation,
  type Diagnostic,

  // Errors
  ISCError,
  ISCLexerError,
  ISCInvalidCharacterError,
  ISCUnterminatedStringError,
  ISCInvalidNumberError,
  ISCParserError,
  ISCMismatchedParenthesisError,
  ISCUnexpectedTokenError,
  ISCEmptyExpressionError,
  ISCInvalidOperatorError,
  ISCEvaluationError,
  ISCUndefinedVariableError,
  ISCTypeError,
  createDiagnostic,
  formatLocation,
  formatError,
} from './isc/index.js';

// ============================================================
// P1: Agent Capability Schema System
// ============================================================

// Capability type system
export {
  compareCapabilityLevels,
  meetsCapabilityLevel,
  getCapabilityLevels,
  isValidCapabilityType,
  isValidCapabilityLevel,
  CAPABILITY_TYPES,
  CAPABILITY_LEVEL_VALUES,
} from './capability-schema.js';
export type {
  CapabilityType,
  CapabilityLevel,
  IOSchema,
  CapabilityDependency,
  CapabilityDefinition,
  AgentCapabilities,
  CapabilityMatchRequest,
  CapabilityMatchResult,
  CapabilityValidationResult,
} from './capability-schema.js';

// Capability validator
export {
  validateIOSchema,
  validateCapabilityDefinition,
  detectCircularDependencies,
  validateLevelConsistency,
  validateAgentCapabilities,
  createValidationResult,
  mergeValidationResults,
} from './capability-validator.js';

// Capability discovery
export {
  CapabilityDiscovery,
  createCapabilityDiscovery,
} from './capability-discovery.js';
export type {
  DiscoveredCapability,
  DiscoveryConfig,
} from './capability-discovery.js';

// Capability matcher
export {
  CapabilityMatcher,
  createCapabilityMatcher,
} from './capability-matcher.js';
export type {
  MatchWeights,
} from './capability-matcher.js';

// ============================================================
// P2.1: Workflow Skills System
// ============================================================

// Workflow Skills core
export {
  SkillRegistry,
  createSkillRegistry,
  SkillExecutor,
  createSkillExecutor,
} from './workflow-skills.js';

// Workflow Skills types
export type {
  SkillType,
  SkillExecutionMode,
  SkillVersion,
  SkillMetadata,
  SkillDependency,
  SkillInputSchema,
  SkillOutputSchema,
  SkillRetryConfig,
  SkillConfig,
  SkillExecutionRequest,
  SkillExecutionResult,
  SkillLogEntry,
  SkillNodeType,
  SkillNode,
  SkillEdge,
  SkillComposition,
  SkillCompositionValidation,
  SkillMarketEntry,
  SkillRegistryConfig,
  SkillExecutionContext,
  SkillValidationResult,
  SkillListFilter,
  VersionComparison,
} from './workflow-skills-types.js';

// ============================================================
// P2.2: Plugin System
// ============================================================

// Plugin Manager
export {
  PluginManager,
  createPluginManager,
} from './plugin-manager.js';

// Plugin Sandbox
export {
  createSandboxContext,
  SecurityValidators,
} from './plugin-sandbox.js';

// Plugin Types
export type {
  PluginType,
  PluginStatus,
  PluginMetadata,
  PluginPermission,
  PermissionCheckResult,
  SandboxPolicy,
  FilesystemSandboxPolicy,
  NetworkSandboxPolicy,
  ExecutionSandboxPolicy,
  ResourceSandboxPolicy,
  HoneycombPlugin,
  PluginContext,
  PluginSandboxContext,
  PluginLoadOptions,
  PluginLoadResult,
  PluginEventType,
  PluginEventData,
  PluginEventHandler,
  PluginStateInfo,
  PluginManifest,
  PluginDiscoveryResult,
  VersionCompatibilityResult,
  VersionCompareResult,
} from './plugin-types.js';
/**
 * Honeycomb — Multi-Agent Collaboration Engine
 *
 * Cross-project bridges:
 * - honeycomb → agent-toolkit: shared capability definitions
 * - honeycomb → agentmesh: agent orchestration patterns
 */

