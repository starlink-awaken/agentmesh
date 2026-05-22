/**
 * ISCCriterion - Ideal State Criteria 标准
 * 每个 ISC 都是一个可测试、可验证的标准
 */
export interface ISCCriterion {
  id: string;
  description: string;  // 8个词以内的状态描述
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  evidence?: string;    // 完成的证据
}

/**
 * AlgorithmPhase - TheAlgorithm 的七个阶段
 */
export type AlgorithmPhase =
  | 'OBSERVE'    // 观察：收集信息，理解需求
  | 'THINK'      // 思考：分析问题，规划方案
  | 'PLAN'       // 计划：制定执行步骤
  | 'BUILD'      // 构建：创建产物
  | 'EXECUTE'    // 执行：运行工作
  | 'VERIFY'     // 验证：确认结果（关键阶段）
  | 'LEARN';     // 学习：总结改进

/**
 * AlgorithmContext - 执行上下文
 */
export interface AlgorithmContext {
  task: string;              // 任务描述
  constraints?: string[];    // 约束条件
  metadata?: Record<string, any>;  // 额外元数据
}

/**
 * AlgorithmResult - 执行结果
 */
export interface AlgorithmResult {
  success: boolean;
  phases: Record<AlgorithmPhase, {
    status: 'pending' | 'running' | 'completed' | 'failed';
    output?: any;
    duration?: number;
  }>;
  iscCriteria: ISCCriterion[];
  finalOutput?: any;
  errors?: string[];
}

/**
 * PhaseHandler - 阶段处理器
 */
export type PhaseHandler = (
  context: AlgorithmContext,
  currentState: Partial<AlgorithmResult>
) => Promise<any>;

/**
 * CapabilityType - 能力类型
 */
export type CapabilityType =
  | 'analyze'
  | 'extract'
  | 'summarize'
  | 'transform'
  | 'create'
  | 'update'
  | 'delete'
  | 'search'
  | 'test'
  | 'security'
  | 'default';
