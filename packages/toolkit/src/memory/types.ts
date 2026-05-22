/**
 * Memory Types - 记忆系统类型定义
 *
 * 源自 ReasoningBank 论文：让AI从成败经验中自我进化
 */

// ============================================================================
// Principles 系统类型
// ============================================================================

/**
 * PrincipleLevel - 原则级别
 */
export type PrincipleLevel = 'iron' | 'gold' | 'silver';

/**
 * Principle - 核心原则
 */
export interface Principle {
  id: number;
  name: string;
  level: PrincipleLevel;
  rule: string;
  description: string;
  keywords: string[];
  scenarios: string[];
  questions: string[];
}

/**
 * Scenario - 应用场景
 */
export interface Scenario {
  id: string;
  name: string;
  keywords: string[];
  recommendedPrinciples: number[];
  description: string;
}

// ============================================================================
// Reasoning Memory 系统类型
// ============================================================================

/**
 * ReasoningMemory - 推理记忆（ReasoningBank核心）
 * 从成功/失败经验中提炼的结构化策略
 */
export interface ReasoningMemory {
  id: string;
  title: string;           // 标题：核心策略简明概括
  description: string;     // 描述：一句话总结
  content: string;         // 内容：推理步骤、决策原理

  // ReasoningBank 核心字段
  outcome: 'success' | 'failure';  // 成功/失败标记
  refinementLevel: number;         // 精炼层级（演化程度）
  originalTask?: string;           // 原始任务描述
  trajectory?: string[];           // 交互轨迹

  // 元数据
  tags: string[];
  createdAt: number;
  updatedAt: number;
  accessCount: number;
}

/**
 * TaskResult - 任务执行结果
 */
export interface TaskResult {
  taskId: string;
  input: unknown;
  output: unknown;
  success: boolean;
  trajectory: string[];
  duration: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * SelfJudgeConfig - 自我评判配置
 */
export interface SelfJudgeConfig {
  judgeLLM?: string;       // 使用的LLM
  prompt?: string;         // 自定义评判Prompt
  enableRefinement?: boolean;  // 是否启用精炼
}

/**
 * MemoryEntry - 记忆条目（兼容旧版）
 */
export interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata: MemoryMetadata;
  createdAt: number;
  updatedAt: number;
}

/**
 * MemoryMetadata - 记忆元数据
 */
export interface MemoryMetadata {
  sessionId: string;
  timestamp: number;
  importance: number;      // 0-1 重要性评分
  tags: string[];
  source?: string;
  context?: Record<string, unknown>;
}

/**
 * RetrievalQuery - 检索查询
 */
export interface RetrievalQuery {
  query: string;
  limit?: number;
  threshold?: number;
  filters?: MemoryFilter;
}

/**
 * MemoryFilter - 记忆过滤器
 */
export interface MemoryFilter {
  sessionId?: string;
  timeRange?: {
    from: number;
    to: number;
  };
  tags?: string[];
  importance?: number;
}

/**
 * RetrievedContext - 检索到的上下文
 */
export interface RetrievedContext {
  entries: MemoryEntry[];
  totalTokens: number;
  query: string;
}

/**
 * MemoryStats - 记忆统计
 */
export interface MemoryStats {
  totalEntries: number;
  totalSessions: number;
  averageImportance: number;
  oldestEntry: number;
  newestEntry: number;
}

/**
 * ConsolidationResult - 记忆整合结果
 */
export interface ConsolidationResult {
  consolidated: number;
  pruned: number;
  memorySaved: number;
}
