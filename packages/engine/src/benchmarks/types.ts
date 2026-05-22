/**
 * Honeycomb v2 - 基准测试类型定义
 *
 * 定义性能基准测试的核心数据结构和接口
 */

// ============================================================
// 统计指标类型
// ============================================================

/**
 * 统计指标 - 描述一组测量值的统计分布
 */
export interface StatsMetrics {
  /** 最小值（毫秒） */
  min: number;
  /** 最大值（毫秒） */
  max: number;
  /** 平均值（毫秒） */
  avg: number;
  /** 中位数（毫秒） */
  median: number;
  /** 第 95 百分位数（毫秒） */
  p95: number;
  /** 第 99 百分位数（毫秒） */
  p99: number;
  /** 样本数量 */
  samples: number;
  /** 标准差 */
  stdDev: number;
}

/**
 * 吞吐量指标
 */
export interface ThroughputMetrics {
  /** 每秒操作数 */
  opsPerSecond: number;
  /** 总操作数 */
  totalOps: number;
  /** 总耗时（毫秒） */
  totalDurationMs: number;
}

/**
 * 内存使用指标
 */
export interface MemoryMetrics {
  /** 当前堆使用量（MB） */
  heapUsedMB: number;
  /** 堆总大小（MB） */
  heapTotalMB: number;
  /** RSS 常驻集大小（MB） */
  rssMB: number;
  /** 外部内存（MB） */
  externalMB: number;
}

// ============================================================
// 基准测试结果类型
// ============================================================

/**
 * 单个基准测试用例的结果
 */
export interface BenchmarkResult {
  /** 测试名称 */
  name: string;
  /** 测试描述 */
  description: string;
  /** 执行时间统计 */
  stats: StatsMetrics;
  /** 吞吐量（可选） */
  throughput?: ThroughputMetrics;
  /** 内存使用（可选） */
  memory?: MemoryMetrics;
  /** 是否通过阈值检查 */
  passed: boolean;
  /** 目标阈值（如果有） */
  threshold?: number;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * Agent 执行基准测试结果
 */
export interface AgentExecutionResult extends BenchmarkResult {
  type: 'agent-execution';
  /** Agent 数量 */
  agentCount: number;
  /** 执行模式（串行/并发） */
  mode: 'serial' | 'concurrent';
}

/**
 * 消息总线基准测试结果
 */
export interface MessageBusResult extends BenchmarkResult {
  type: 'message-bus';
  /** 消息数量 */
  messageCount: number;
  /** 发送者数量 */
  senderCount: number;
  /** 优先级 */
  priority?: number;
}

/**
 * 检查点基准测试结果
 */
export interface CheckpointResult extends BenchmarkResult {
  type: 'checkpoint';
  /** 检查点数量 */
  checkpointCount: number;
  /** 状态大小（字节） */
  stateSizeBytes: number;
}

/**
 * 状态机基准测试结果
 */
export interface StateMachineResult extends BenchmarkResult {
  type: 'state-machine';
  /** 转换次数 */
  transitionCount: number;
  /** 源阶段 */
  fromPhase: string;
  /** 目标阶段 */
  toPhase: string;
}

// ============================================================
// 完整基准测试报告
// ============================================================

/**
 * 环境信息
 */
export interface EnvironmentInfo {
  /** Node 版本 */
  nodeVersion: string;
  /** Bun 版本（如果可用） */
  bunVersion?: string;
  /** 平台 */
  platform: string;
  /** 架构 */
  arch: string;
  /** CPU 核心数 */
  cpuCores: number;
  /** 总内存（MB） */
  totalMemoryMB: number;
  /** 时间戳 */
  timestamp: string;
}

/**
 * 完整基准测试报告
 */
export interface BenchmarkReport {
  /** 报告 ID（时间戳） */
  reportId: string;
  /** 环境信息 */
  environment: EnvironmentInfo;
  /** Agent 执行测试结果 */
  agentExecution: AgentExecutionResult[];
  /** 消息总线测试结果 */
  messageBus: MessageBusResult[];
  /** 检查点测试结果 */
  checkpoint: CheckpointResult[];
  /** 状态机测试结果 */
  stateMachine: StateMachineResult[];
  /** 总体摘要 */
  summary: {
    /** 总测试数 */
    totalTests: number;
    /** 通过数 */
    passedTests: number;
    /** 失败数 */
    failedTests: number;
    /** 总耗时（毫秒） */
    totalDurationMs: number;
  };
}

// ============================================================
// 基准测试配置
// ============================================================

/**
 * 基准测试配置
 */
export interface BenchmarkConfig {
  /** 是否输出详细日志 */
  verbose: boolean;
  /** 结果输出目录 */
  outputDir: string;
  /** 是否生成 Markdown 报告 */
  generateMarkdown: boolean;
  /** 是否生成 JSON 报告 */
  generateJSON: boolean;
  /** 自定义测试过滤器 */
  filter?: {
    /** 包含的测试类型 */
    includeTypes?: BenchmarkType[];
    /** 排除的测试类型 */
    excludeTypes?: BenchmarkType[];
  };
}

/**
 * 基准测试类型
 */
export type BenchmarkType = 'agent-execution' | 'message-bus' | 'checkpoint' | 'state-machine';

// ============================================================
// 基准测试函数类型
// ============================================================

/**
 * 基准测试函数 - 执行单个基准测试并返回结果
 */
export type BenchmarkFn = () => Promise<BenchmarkResult> | BenchmarkResult;

/**
 * 基准测试套件 - 包含多个相关测试
 */
export interface BenchmarkSuite {
  /** 套件名称 */
  name: string;
  /** 套件描述 */
  description: string;
  /** 测试列表 */
  tests: Array<{
    name: string;
    description: string;
    fn: BenchmarkFn;
    threshold?: number;
  }>;
}
