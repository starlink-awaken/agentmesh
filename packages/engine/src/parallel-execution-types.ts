/**
 * Honeycomb v2 - Parallel Execution Types
 *
 * 并行执行系统的核心类型定义。
 * 支持智能任务调度、生命周期管理、错误处理和结果聚合。
 */

import type { AgentDefinition } from './types.js';
import { AgentStatus } from './types.js';

// ============================================================
// 并行执行配置
// ============================================================

/**
 * 并行执行配置
 */
export interface ParallelExecutionConfig {
    /** 最大并发 Agent 数量 */
    maxConcurrentAgents: number;

    /** 任务队列容量 */
    queueCapacity: number;

    /** 执行超时时间（毫秒） */
    executionTimeout: number;

    /** 是否启用自动扩展 */
    enableAutoScaling: boolean;

    /** 自动扩展配置 */
    autoScalingConfig?: AutoScalingConfig;

    /** 监控间隔（毫秒） */
    monitoringInterval: number;

    /** 重试策略 */
    retryPolicy: RetryPolicy;

    /** 熔断器配置 */
    circuitBreakerConfig: CircuitBreakerConfig;

    /** 降级策略 */
    fallbackStrategy: FallbackStrategy;

    /** 聚合策略 */
    aggregationConfig: AggregationConfig;

    /** 资源限制 */
    resourceLimits: ResourceLimits;

    /** 生命周期钩子 */
    lifecycleHooks?: LifecycleHooks;
}

/**
 * 自动扩展配置
 */
export interface AutoScalingConfig {
    /** 是否启用 */
    enabled: boolean;

    /** 最小并发数 */
    minConcurrentAgents: number;

    /** 最大并发数 */
    maxConcurrentAgents: number;

    /** 扩展触发条件 */
    scaleUpThreshold: ScalingThreshold;

    /** 缩减触发条件 */
    scaleDownThreshold: ScalingThreshold;

    /** 扩展/缩减步长 */
    scalingStep: number;

    /** 冷却时间（毫秒） */
    cooldownPeriod: number;
}

/**
 * 扩展阈值
 */
export interface ScalingThreshold {
    /** 队列深度阈值 */
    queueDepth: number;

    /** CPU 利用率阈值 (0-100) */
    cpuUtilization: number;

    /** 内存利用率阈值 (0-100) */
    memoryUtilization: number;

    /** 任务等待时间阈值（毫秒） */
    taskWaitTime: number;
}

/**
 * 资源限制
 */
export interface ResourceLimits {
    /** CPU 限制 (核数) */
    cpu: number;

    /** 内存限制 (MB) */
    memory: number;

    /** Token 预算限制 */
    tokenBudget: number;

    /** 自定义资源限制 */
    customResources?: Map<string, number>;
}

// ============================================================
// 任务调度类型
// ============================================================

/**
 * 调度任务
 */
export interface ScheduledTask {
    /** 任务唯一标识 */
    taskId: string;

    /** Agent 定义 */
    agentDefinition: AgentDefinition;

    /** 任务数据 */
    taskData: unknown;

    /** 任务优先级 */
    priority: TaskPriority;

    /** 依赖的任务 ID 列表 */
    dependencies: string[];

    /** 预估执行时间（毫秒） */
    estimatedDuration: number;

    /** 资源需求 */
    resourceRequirements: ResourceRequirement;

    /** 当前重试次数 */
    retryCount: number;

    /** 任务状态 */
    status: TaskStatus;

    /** 创建时间 */
    createdAt: number;

    /** 调度时间 */
    scheduledAt?: number;

    /** 开始时间 */
    startedAt?: number;

    /** 完成时间 */
    completedAt?: number;

    /** 分配的资源 */
    allocatedResources?: ResourceAllocation;
}

/**
 * 任务优先级
 */
export enum TaskPriority {
    CRITICAL = 0,
    HIGH = 1,
    MEDIUM = 2,
    LOW = 3,
    DEFERRED = 4
}

/**
 * 任务状态
 */
export enum TaskStatus {
    PENDING = 'pending',
    READY = 'ready',
    RUNNING = 'running',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
    BLOCKED = 'blocked'
}

/**
 * 资源需求
 */
export interface ResourceRequirement {
    /** CPU 需求 (核数) */
    cpu: number;

    /** 内存需求 (MB) */
    memory: number;

    /** Token 需求 */
    tokens: number;

    /** 自定义资源需求 */
    customResources?: Map<string, number>;
}

/**
 * 队列状态
 */
export interface QueueStatus {
    /** 总任务数 */
    totalTasks: number;

    /** 待处理任务数 */
    pendingTasks: number;

    /** 就绪任务数 */
    readyTasks: number;

    /** 运行中任务数 */
    runningTasks: number;

    /** 阻塞任务数 */
    blockedTasks: number;

    /** 按优先级分组的任务数 */
    tasksByPriority: Map<TaskPriority, number>;
}

/**
 * 依赖图
 */
export interface DependencyGraph {
    /** 节点（任务） */
    nodes: Map<string, ScheduledTask>;

    /** 边（任务 -> 依赖它的任务） */
    edges: Map<string, Set<string>>;

    /** 反向边（任务 -> 它依赖的任务） */
    reverseEdges: Map<string, Set<string>>;

    /** 入度（任务 -> 未满足的依赖数） */
    inDegree: Map<string, number>;

    /** 检测循环依赖 */
    hasCycle(): boolean;

    /** 获取拓扑排序 */
    topologicalSort(): string[];
}

// ============================================================
// Agent 生命周期类型
// ============================================================

/**
 * Agent 实例
 */
export interface AgentInstance {
    /** 实例唯一标识 */
    instanceId: string;

    /** Agent 定义 */
    definition: AgentDefinition;

    /** 实例状态 */
    status: AgentInstanceStatus;

    /** 当前执行的任务 */
    currentTask: ScheduledTask | null;

    /** 开始时间 */
    startTime: number | null;

    /** 结束时间 */
    endTime: number | null;

    /** 分配的资源 */
    resourceAllocation: ResourceAllocation | null;

    /** 健康状态 */
    healthStatus: HealthStatus;

    /** 实例指标 */
    metrics: AgentInstanceMetrics;

    /** 创建时间 */
    createdAt: number;
}

/**
 * Agent 实例状态
 */
export enum AgentInstanceStatus {
    CREATING = 'creating',
    IDLE = 'idle',
    STARTING = 'starting',
    RUNNING = 'running',
    PAUSING = 'pausing',
    PAUSED = 'paused',
    RESUMING = 'resuming',
    STOPPING = 'stopping',
    STOPPED = 'stopped',
    FAILED = 'failed',
    DESTROYING = 'destroying',
    DESTROYED = 'destroyed'
}

/**
 * 健康状态
 */
export enum HealthStatus {
    HEALTHY = 'healthy',
    DEGRADED = 'degraded',
    UNHEALTHY = 'unhealthy',
    UNKNOWN = 'unknown'
}

/**
 * Agent 实例指标
 */
export interface AgentInstanceMetrics {
    /** 执行的任务数 */
    tasksExecuted: number;

    /** 成功的任务数 */
    tasksSucceeded: number;

    /** 失败的任务数 */
    tasksFailed: number;

    /** 总执行时间（毫秒） */
    totalExecutionTime: number;

    /** 平均执行时间（毫秒） */
    averageExecutionTime: number;

    /** 最后心跳时间 */
    lastHeartbeat: number;
}

/**
 * 资源分配
 */
export interface ResourceAllocation {
    /** 分配 ID */
    allocationId: string;

    /** Agent 实例 ID */
    agentInstanceId: string;

    /** 分配的资源 */
    resources: AllocatedResource[];

    /** 分配时间 */
    allocatedAt: number;

    /** 过期时间 */
    expiresAt?: number;
}

/**
 * 已分配资源
 */
export interface AllocatedResource {
    /** 资源类型 */
    type: ResourceType;

    /** 分配数量 */
    amount: number;

    /** 单位 */
    unit: string;

    /** 约束条件 */
    constraints?: ResourceConstraint[];
}

/**
 * 资源类型
 */
export enum ResourceType {
    CPU = 'cpu',
    MEMORY = 'memory',
    GPU = 'gpu',
    TOKEN = 'token',
    CUSTOM = 'custom'
}

/**
 * 资源约束
 */
export interface ResourceConstraint {
    /** 约束类型 */
    type: string;

    /** 约束值 */
    value: unknown;
}

// ============================================================
// 错误处理类型
// ============================================================

/**
 * 重试策略
 */
export interface RetryPolicy {
    /** 最大尝试次数 */
    maxAttempts: number;

    /** 初始延迟（毫秒） */
    initialDelay: number;

    /** 最大延迟（毫秒） */
    maxDelay: number;

    /** 退避策略 */
    backoffStrategy: BackoffStrategy;

    /** 抖动因子 (0-1) */
    jitterFactor: number;

    /** 可重试的错误类别 */
    retryableErrors: ErrorCategory[];

    /** 立即停止的错误代码 */
    stopOnErrorCodes: number[];

    /** 立即停止的错误模式 */
    stopOnErrorPatterns: RegExp[];
}

/**
 * 退避策略
 */
export enum BackoffStrategy {
    FIXED = 'fixed',
    LINEAR = 'linear',
    EXPONENTIAL = 'exponential',
    EXPONENTIAL_WITH_JITTER = 'exponential_with_jitter'
}

/**
 * 错误类别
 */
export enum ErrorCategory {
    TRANSIENT = 'transient',           // 瞬时错误
    RECOVERABLE = 'recoverable',       // 可恢复错误
    PERMANENT = 'permanent',           // 永久错误
    CASCADING = 'cascading',           // 级联错误
    TIMEOUT = 'timeout',               // 超时错误
    RESOURCE_EXHAUSTED = 'resource_exhausted'  // 资源耗尽
}

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

/**
 * 错误处理动作
 */
export enum ErrorAction {
    RETRY = 'retry',
    FALLBACK = 'fallback',
    SKIP = 'skip',
    ESCALATE = 'escalate',
    ABORT = 'abort'
}

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
    /** 是否启用 */
    enabled: boolean;

    /** 失败阈值 */
    failureThreshold: number;

    /** 成功阈值（用于恢复） */
    successThreshold: number;

    /** 超时时间（毫秒） */
    timeout: number;

    /** 半开状态最大调用数 */
    halfOpenMaxCalls: number;
}

/**
 * 熔断器状态
 */
export interface CircuitBreakerState {
    /** 状态 */
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';

    /** 失败计数 */
    failureCount: number;

    /** 成功计数 */
    successCount: number;

    /** 最后失败时间 */
    lastFailureTime: number;

    /** 最后状态变化时间 */
    lastStateChange: number;
}

/**
 * 降级策略
 */
export interface FallbackStrategy {
    /** 降级类型 */
    type: FallbackType;

    /** 降级配置 */
    config: FallbackConfig;
}

/**
 * 降级类型
 */
export enum FallbackType {
    NONE = 'none',
    DEFAULT = 'default',
    CACHED = 'cached',
    ALTERNATIVE = 'alternative',
    COMPENSATING = 'compensating'
}

/**
 * 降级配置
 */
export interface FallbackConfig {
    /** 默认值 */
    defaultValue?: unknown;

    /** 缓存键 */
    cacheKey?: string;

    /** 替代 Agent */
    alternativeAgent?: string;

    /** 补偿动作 */
    compensatingAction?: (error: Error) => Promise<unknown>;
}

// ============================================================
// 结果聚合类型
// ============================================================

/**
 * 聚合模式
 */
export enum AggregationMode {
    WAIT_ALL = 'wait_all',              // 等待所有任务
    WAIT_QUORUM = 'wait_quorum',        // 等待法定数量
    WAIT_ANY = 'wait_any',              // 等待任意一个
    WAIT_PRIORITY_N = 'wait_priority_n', // 等待前N个优先级
    TIMEOUT_BASED = 'timeout_based',    // 基于超时
    CUSTOM = 'custom'                   // 自定义
}

/**
 * 聚合配置
 */
export interface AggregationConfig {
    /** 聚合模式 */
    mode: AggregationMode;

    /** 法定数量 */
    quorumSize?: number;

    /** 优先级数量 */
    priorityCount?: number;

    /** 超时时间（毫秒） */
    timeout?: number;

    /** 超时动作 */
    timeoutAction?: TimeoutAction;

    /** 自定义验证器 */
    customValidator?: (results: PartialResult[]) => boolean;

    /** 自定义聚合器 */
    customAggregator?: (results: PartialResult[]) => AggregatedResult;
}

/**
 * 超时动作
 */
export enum TimeoutAction {
    PARTIAL = 'partial',       // 返回部分结果
    USE_CACHE = 'use_cache',   // 使用缓存
    FAIL = 'fail'              // 返回失败
}

/**
 * 部分结果
 */
export interface PartialResult {
    /** 任务 ID */
    taskId: string;

    /** Agent 名称 */
    agentName: string;

    /** 执行状态 */
    status: AgentStatus;

    /** 结果数据 */
    data: unknown;

    /** 时间戳 */
    timestamp: number;

    /** 元数据 */
    metadata: Record<string, unknown>;
}

/**
 * 聚合结果
 */
export interface AggregatedResult {
    /** 执行 ID */
    executionId: string;

    /** 总任务数 */
    totalTasks: number;

    /** 完成任务数 */
    completedTasks: number;

    /** 失败任务数 */
    failedTasks: number;

    /** 结果映射 */
    results: Map<string, unknown>;

    /** 错误映射 */
    errors: Map<string, Error>;

    /** 聚合元数据 */
    metadata: AggregationMetadata;
}

/**
 * 聚合元数据
 */
export interface AggregationMetadata {
    /** 开始时间 */
    startTime: number;

    /** 结束时间 */
    endTime: number;

    /** 总耗时（毫秒） */
    duration: number;

    /** 聚合模式 */
    mode: AggregationMode;

    /** 是否使用降级 */
    usedFallback: boolean;

    /** 一致性评分 (0-1) */
    consistencyScore: number;
}

/**
 * 聚合进度
 */
export interface AggregationProgress {
    /** 已接收结果数 */
    receivedResults: number;

    /** 期望结果数 */
    expectedResults: number;

    /** 成功结果数 */
    successResults: number;

    /** 失败结果数 */
    failedResults: number;

    /** 进度百分比 (0-100) */
    progressPercentage: number;

    /** 预估剩余时间（毫秒） */
    estimatedRemainingTime: number;
}

// ============================================================
// 执行上下文类型
// ============================================================

/**
 * 执行状态
 */
export enum ExecutionStatus {
    INITIALIZING = 'initializing',
    RUNNING = 'running',
    PAUSED = 'paused',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
    TIMED_OUT = 'timed_out'
}

/**
 * 执行上下文
 */
export interface ExecutionContext {
    /** 执行唯一标识 */
    executionId: string;

    /** 项目 ID */
    projectId: string;

    /** 当前阶段 */
    phase: Phase;

    /** 开始时间 */
    startTime: number;

    /** 执行状态 */
    status: ExecutionStatus;

    /** 任务映射 */
    tasks: Map<string, ScheduledTask>;

    /** 结果映射 */
    results: Map<string, AgentResult>;

    /** 错误列表 */
    errors: ExecutionError[];

    /** 配置 */
    config: ParallelExecutionConfig;
}

/**
 * 阶段（从 types.ts 复制）
 */
export enum Phase {
    INIT = 'init',
    RESEARCH = 'research',
    DECISION = 'decision',
    EXECUTION = 'execution',
    FEEDBACK = 'feedback',
    DELIVERY = 'delivery',
    COMPLETED = 'completed',
    FAILED = 'failed',
    PAUSED = 'paused',
}

/**
 * Agent 执行结果
 */
export interface AgentResult {
    /** 任务 ID */
    taskId: string;

    /** Agent 名称 */
    agentName: string;

    /** 执行状态 */
    status: AgentStatus;

    /** 结果数据 */
    data: unknown;

    /** 错误信息（如果失败） */
    error?: Error;

    /** Token 使用量 */
    tokenUsage: number;

    /** 执行时长（毫秒） */
    duration: number;

    /** 时间戳 */
    timestamp: number;

    /** 元数据 */
    metadata: Record<string, unknown>;
}

/**
 * 执行错误
 */
export interface ExecutionError {
    /** 错误 ID */
    errorId: string;

    /** 任务 ID */
    taskId: string;

    /** 错误类别 */
    category: ErrorCategory;

    /** 错误严重程度 */
    severity: ErrorSeverity;

    /** 错误对象 */
    error: Error;

    /** 时间戳 */
    timestamp: number;

    /** 是否已处理 */
    handled: boolean;

    /** 处理动作 */
    action?: ErrorAction;
}

/**
 * 执行进度
 */
export interface ExecutionProgress {
    /** 总任务数 */
    totalTasks: number;

    /** 待处理任务数 */
    pendingTasks: number;

    /** 运行中任务数 */
    runningTasks: number;

    /** 已完成任务数 */
    completedTasks: number;

    /** 失败任务数 */
    failedTasks: number;

    /** 进度百分比 (0-100) */
    progressPercentage: number;

    /** 预估剩余时间（毫秒） */
    estimatedRemainingTime: number;
}

/**
 * 错误上下文
 */
export interface ErrorContext {
    /** 任务 ID */
    taskId: string;

    /** Agent 名称 */
    agentName: string;

    /** 项目 ID */
    projectId: string;

    /** 阶段 */
    phase: Phase;

    /** 尝试次数 */
    attempt: number;

    /** 时间戳 */
    timestamp: number;

    /** 附加上下文 */
    additionalContext?: Record<string, unknown>;
}

/**
 * 错误处理结果
 */
export interface ErrorHandlingResult {
    /** 采取的动作 */
    action: ErrorAction;

    /** 是否重试 */
    willRetry: boolean;

    /** 重试延迟（毫秒） */
    retryDelay?: number;

    /** 降级结果 */
    fallbackResult?: AgentResult;

    /** 错误消息 */
    message: string;
}

/**
 * 错误统计
 */
export interface ErrorStatistics {
    /** 总错误数 */
    totalErrors: number;

    /** 按类别分类的错误数 */
    errorsByCategory: Map<ErrorCategory, number>;

    /** 按严重程度分类的错误数 */
    errorsBySeverity: Map<ErrorSeverity, number>;

    /** 重试次数 */
    retryCount: number;

    /** 降级次数 */
    fallbackCount: number;

    /** 熔断触发次数 */
    circuitBreakerTripped: number;
}

// ============================================================
// 性能监控类型
// ============================================================

/**
 * 并行执行指标
 */
export interface ParallelExecutionMetrics {
    /** 执行时长（毫秒） */
    executionDuration: number;

    /** 任务吞吐量（任务/秒） */
    taskThroughput: number;

    /** 平均任务延迟（毫秒） */
    averageTaskLatency: number;

    /** 分位数延迟 */
    percentileLatency: {
        p50: number;
        p95: number;
        p99: number;
    };

    /** CPU 利用率 (0-100) */
    cpuUtilization: number;

    /** 内存利用率 (0-100) */
    memoryUtilization: number;

    /** Agent 利用率 (0-100) */
    agentUtilization: number;

    /** 队列深度 */
    queueDepth: number;

    /** 总错误数 */
    totalErrors: number;

    /** 错误率 (0-1) */
    errorRate: number;

    /** 按类别分类的错误数 */
    errorByCategory: Map<ErrorCategory, number>;

    /** 重试次数 */
    retryCount: number;

    /** 降级次数 */
    fallbackCount: number;

    /** 最大并发任务数 */
    maxConcurrentTasks: number;

    /** 平均并发任务数 */
    averageConcurrentTasks: number;

    /** 并发效率 */
    concurrencyEfficiency: number;

    /** 熔断器开启次数 */
    circuitBreakerOpenCount: number;

    /** 熔断器半开次数 */
    circuitBreakerHalfOpenCount: number;

    /** 熔断器关闭次数 */
    circuitBreakerClosedCount: number;
}

/**
 * 实时指标
 */
export interface RealtimeMetrics {
    /** 时间戳 */
    timestamp: number;

    /** 活跃 Agent 数 */
    activeAgents: number;

    /** 运行中任务数 */
    runningTasks: number;

    /** 队列中任务数 */
    queuedTasks: number;

    /** 已完成任务数 */
    completedTasks: number;

    /** 失败任务数 */
    failedTasks: number;

    /** 资源使用快照 */
    resourceUsage: ResourceUsageSnapshot;
}

/**
 * 资源使用快照
 */
export interface ResourceUsageSnapshot {
    /** CPU 使用量 */
    cpu: {
        used: number;
        total: number;
        utilization: number;
    };

    /** 内存使用量 */
    memory: {
        used: number;
        total: number;
        utilization: number;
    };

    /** Token 使用量 */
    tokens: {
        used: number;
        total: number;
    };
}

/**
 * 资源利用率快照
 */
export interface ResourceUtilizationProfile {
    /** CPU 利用率时间序列 */
    cpuUtilization: number[];

    /** 内存利用率时间序列 */
    memoryUtilization: number[];

    /** 平均 CPU 利用率 */
    averageCpuUtilization: number;

    /** 峰值 CPU 利用率 */
    peakCpuUtilization: number;

    /** 平均内存利用率 */
    averageMemoryUtilization: number;

    /** 峰值内存利用率 */
    peakMemoryUtilization: number;
}

/**
 * 已识别瓶颈
 */
export interface IdentifiedBottleneck {
    /** 瓶颈类型 */
    type: 'RESOURCE' | 'DEPENDENCY' | 'SLOW_AGENT' | 'QUEUE';

    /** 严重程度 */
    severity: ErrorSeverity;

    /** 描述 */
    description: string;

    /** 影响的任务 */
    affectedTasks: string[];

    /** 建议的优化 */
    suggestedOptimizations: string[];
}

/**
 * 优化建议
 */
export interface OptimizationSuggestion {
    /** 建议类型 */
    type: 'SCALE_UP' | 'SCALE_DOWN' | 'OPTIMIZE_DEPENDENCIES' | 'CACHE_RESULTS' | 'ADJUST_TIMEOUT';

    /** 优先级 */
    priority: TaskPriority;

    /** 描述 */
    description: string;

    /** 预期改进 */
    expectedImprovement: {
        metric: string;
        currentValue: number;
        expectedValue: number;
    };
}

// ============================================================
// 生命周期钩子类型
// ============================================================

/**
 * 生命周期钩子
 */
export interface LifecycleHooks {
    /** 创建前 */
    beforeCreate?: (definition: AgentDefinition) => Promise<void>;

    /** 创建后 */
    afterCreate?: (instance: AgentInstance) => Promise<void>;

    /** 启动前 */
    beforeStart?: (instance: AgentInstance, task: ScheduledTask) => Promise<void>;

    /** 启动后 */
    afterStart?: (instance: AgentInstance, task: ScheduledTask) => Promise<void>;

    /** 暂停前 */
    beforePause?: (instance: AgentInstance) => Promise<void>;

    /** 暂停后 */
    afterPause?: (instance: AgentInstance) => Promise<void>;

    /** 恢复前 */
    beforeResume?: (instance: AgentInstance) => Promise<void>;

    /** 恢复后 */
    afterResume?: (instance: AgentInstance) => Promise<void>;

    /** 停止前 */
    beforeStop?: (instance: AgentInstance) => Promise<void>;

    /** 停止后 */
    afterStop?: (instance: AgentInstance) => Promise<void>;

    /** 销毁前 */
    beforeDestroy?: (instance: AgentInstance) => Promise<void>;

    /** 销毁后 */
    afterDestroy?: (instance: AgentInstance) => Promise<void>;

    /** 错误处理 */
    onError?: (instance: AgentInstance, error: Error) => Promise<void>;
}

// ============================================================
// 接口定义（用于实现）
// ============================================================

/**
 * 池管理器接口
 */
export interface IPoolManager {
    /**
     * 初始化执行上下文
     */
    initializeExecutionContext(
        projectId: string,
        phase: Phase,
        tasks: ScheduledTask[],
        config: ParallelExecutionConfig
    ): ExecutionContext;

    /**
     * 执行任务集合
     */
    executeTasks(tasks: ScheduledTask[]): Promise<AggregatedResult>;

    /**
     * 暂停当前执行
     */
    pauseExecution(reason: string): Promise<void>;

    /**
     * 恢复执行
     */
    resumeExecution(): Promise<void>;

    /**
     * 中止执行
     */
    abortExecution(reason: string): Promise<void>;

    /**
     * 获取执行状态
     */
    getExecutionStatus(): ExecutionStatus;

    /**
     * 获取执行进度
     */
    getExecutionProgress(): ExecutionProgress;

    /**
     * 获取执行指标
     */
    getExecutionMetrics(): ParallelExecutionMetrics;

    /**
     * 关闭池管理器
     */
    shutdown(): Promise<void>;
}

/**
 * 任务调度器接口
 */
export interface ITaskScheduler {
    /**
     * 验证并入队任务
     */
    validateAndEnqueue(tasks: ScheduledTask[]): Promise<void>;

    /**
     * 获取下一批可执行任务
     */
    getNextBatch(maxCount: number): ScheduledTask[];

    /**
     * 标记任务完成
     */
    markTaskComplete(taskId: string, result: AgentResult): void;

    /**
     * 标记任务失败
     */
    markTaskFailed(taskId: string, error: Error): void;

    /**
     * 获取队列状态
     */
    getQueueStatus(): QueueStatus;

    /**
     * 取消任务
     */
    cancelTask(taskId: string): boolean;
}

/**
 * Agent 生命周期管理器接口
 */
export interface IAgentLifecycleManager {
    /**
     * 创建 Agent 实例
     */
    createAgent(definition: AgentDefinition): Promise<AgentInstance>;

    /**
     * 启动 Agent 执行任务
     */
    startAgent(instance: AgentInstance, task: ScheduledTask): Promise<void>;

    /**
     * 暂停 Agent
     */
    pauseAgent(instance: AgentInstance): Promise<void>;

    /**
     * 恢复 Agent
     */
    resumeAgent(instance: AgentInstance): Promise<void>;

    /**
     * 停止 Agent
     */
    stopAgent(instance: AgentInstance): Promise<void>;

    /**
     * 销毁 Agent 实例
     */
    destroyAgent(instance: AgentInstance): Promise<void>;

    /**
     * 获取 Agent 实例
     */
    getAgentInstance(instanceId: string): AgentInstance | undefined;

    /**
     * 获取所有实例
     */
    getAllInstances(): AgentInstance[];

    /**
     * 获取实例健康状态
     */
    getHealthStatus(): Map<string, HealthStatus>;
}

/**
 * 错误处理管理器接口
 */
export interface IErrorHandlingManager {
    /**
     * 处理错误
     */
    handleError(error: Error, context: ErrorContext): Promise<ErrorHandlingResult>;

    /**
     * 判断是否应该重试
     */
    shouldRetry(error: Error, attempt: number): boolean;

    /**
     * 执行降级策略
     */
    executeFallback(task: ScheduledTask, error: Error): Promise<AgentResult>;

    /**
     * 获取熔断器状态
     */
    getCircuitBreakerState(agentName: string): CircuitBreakerState;

    /**
     * 重置熔断器
     */
    resetCircuitBreaker(agentName: string): void;

    /**
     * 获取错误统计
     */
    getErrorStatistics(): ErrorStatistics;
}

/**
 * 结果聚合器接口
 */
export interface IResultAggregator {
    /**
     * 添加部分结果
     */
    addResult(taskId: string, result: PartialResult): void;

    /**
     * 检查是否完成
     */
    isComplete(): boolean;

    /**
     * 获取聚合结果
     */
    getAggregatedResult(): AggregatedResult | null;

    /**
     * 重置聚合器
     */
    reset(): void;

    /**
     * 获取当前进度
     */
    getProgress(): AggregationProgress;

    /**
     * 设置聚合配置
     */
    setConfig(config: AggregationConfig): void;
}

// ============================================================
// 默认值导出
// ============================================================

/**
 * 默认并行执行配置
 */
export const DEFAULT_PARALLEL_EXECUTION_CONFIG: ParallelExecutionConfig = {
    maxConcurrentAgents: 10,
    queueCapacity: 1000,
    executionTimeout: 300000, // 5 分钟
    enableAutoScaling: false,
    monitoringInterval: 1000, // 1 秒

    retryPolicy: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffStrategy: BackoffStrategy.EXPONENTIAL_WITH_JITTER,
        jitterFactor: 0.1,
        retryableErrors: [
            ErrorCategory.TRANSIENT,
            ErrorCategory.TIMEOUT
        ],
        stopOnErrorCodes: [],
        stopOnErrorPatterns: []
    },

    circuitBreakerConfig: {
        enabled: true,
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 60000, // 1 分钟
        halfOpenMaxCalls: 3
    },

    fallbackStrategy: {
        type: FallbackType.NONE,
        config: {}
    },

    aggregationConfig: {
        mode: AggregationMode.WAIT_ALL,
        timeout: 300000
    },

    resourceLimits: {
        cpu: 16,
        memory: 8192, // 8 GB
        tokenBudget: 1000000
    }
};

/**
 * 默认重试策略
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffStrategy: BackoffStrategy.EXPONENTIAL_WITH_JITTER,
    jitterFactor: 0.1,
    retryableErrors: [
        ErrorCategory.TRANSIENT,
        ErrorCategory.TIMEOUT
    ],
    stopOnErrorCodes: [],
    stopOnErrorPatterns: []
};

/**
 * 默认熔断器配置
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
    enabled: true,
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000,
    halfOpenMaxCalls: 3
};

/**
 * 默认聚合配置
 */
export const DEFAULT_AGGREGATION_CONFIG: AggregationConfig = {
    mode: AggregationMode.WAIT_ALL,
    timeout: 300000
};
