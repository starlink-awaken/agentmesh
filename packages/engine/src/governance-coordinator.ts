/**
 * Honeycomb v2 - Governance Coordinator (治理层协调机制)
 *
 * 核心目标：减少90%治理冲突
 *
 * 功能模块：
 * - 投票机制（Voting）：多治理Agent意见收集与投票
 * - 冲突检测（Conflict Detection）：识别治理Agent间的意见冲突
 * - 决策聚合（Decision Aggregation）：基于投票权重聚合决策
 * - 治理协调（Governance Coordination）：与Guardian集成
 *
 * @module governance-coordinator
 */

import { randomUUID } from 'node:crypto';

// ============================================================
// 枚举定义
// ============================================================

/**
 * 投票类型
 */
export enum VoteType {
  GO = 'go',                    // 通过
  NO_GO = 'no-go',              // 拒绝
  CONDITIONAL_GO = 'conditional-go',  // 有条件通过
  ABSTAIN = 'abstain',          // 弃权
}

/**
 * 冲突类型
 */
export enum ConflictType {
  DIRECT_CONFLICT = 'direct-conflict',           // 直接冲突（GO vs NO_GO）
  CONFIDENCE_GAP = 'confidence-gap',             // 置信度差异
  LOGICAL_CONTRADICTION = 'logical-contradiction', // 逻辑矛盾
  SCOPE_MISMATCH = 'scope-mismatch',             // 范围不匹配
  PRIORITY_CONFLICT = 'priority-conflict',       // 优先级冲突
}

/**
 * 冲突严重程度
 */
export enum ConflictSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * 聚合策略
 */
export enum AggregationStrategy {
  SIMPLE_MAJORITY = 'simple-majority',       // 简单多数
  WEIGHTED_MAJORITY = 'weighted-majority',   // 加权多数
  UNANIMITY = 'unanimity',                   // 一致性
  CONFIDENCE_WEIGHTED = 'confidence-weighted', // 置信度加权
  SUPER_MAJORITY = 'super-majority',         // 超级多数（2/3）
}

// ============================================================
// 类型定义
// ============================================================

/**
 * 治理Agent定义
 */
export interface GovernanceAgent {
  /** Agent唯一标识 */
  id: string;
  /** Agent名称 */
  name: string;
  /** 投票权重 */
  weight: number;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 治理投票
 */
export interface GovernanceVote {
  /** 投票Agent ID */
  agentId: string;
  /** 投票类型 */
  type: VoteType;
  /** 置信度（0-1） */
  confidence: number;
  /** 推理说明 */
  reasoning: string;
  /** 投票时间戳 */
  timestamp: number;
}

/**
 * 加权投票（包含权重信息）
 */
export interface WeightedVote extends GovernanceVote {
  /** Agent权重 */
  weight: number;
  /** 加权后的置信度 */
  weightedConfidence: number;
}

/**
 * 治理决策结果
 */
export interface GovernanceDecision {
  /** 决策ID */
  id: string;
  /** 项目ID */
  projectId: string;
  /** 决策标识 */
  decisionId: string;
  /** 最终决策类型 */
  type: VoteType;
  /** 综合置信度 */
  confidence: number;
  /** GO票数 */
  goVotes: number;
  /** NO_GO票数 */
  noGoVotes: number;
  /** CONDITIONAL_GO票数 */
  conditionalVotes: number;
  /** ABSTAIN票数 */
  abstainVotes: number;
  /** 参与投票的Agent数 */
  totalParticipants: number;
  /** 决策说明 */
  reasoning: string;
  /** 决策时间戳 */
  timestamp: number;
  /** 决策是否涉及冲突 */
  hasConflict: boolean;
  /** 冲突列表 */
  conflicts: GovernanceConflict[];
}

/**
 * 治理冲突
 */
export interface GovernanceConflict {
  /** 冲突ID */
  id: string;
  /** 冲突类型 */
  type: ConflictType;
  /** 冲突严重程度 */
  severity: ConflictSeverity;
  /** 冲突涉及的Agent */
  agents: string[];
  /** 冲突描述 */
  description: string;
  /** 建议的解决方案 */
  resolution: string;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 冲突解决结果
 */
export interface ConflictResolution {
  /** 是否已解决 */
  resolved: boolean;
  /** 是否需要人工介入 */
  requiresHumanIntervention: boolean;
  /** 最终决策 */
  finalDecision: GovernanceDecision | null;
  /** 解决方案说明 */
  resolution: string;
  /** 解决时间戳 */
  timestamp: number;
}

/**
 * 协调器配置
 */
export interface CoordinatorConfig {
  /** 治理Agent列表 */
  agents: GovernanceAgent[];
  /** 聚合策略 */
  strategy: AggregationStrategy;
  /** 冲突阈值（置信度差异超过此值触发冲突检测） */
  conflict_threshold: number;
  /** 超级多数阈值（用于SUPER_MAJORITY策略） */
  super_majority_threshold: number;
  /** 最大冲突历史记录数 */
  max_conflict_history: number;
  /** 是否启用自动冲突解决 */
  auto_resolve_enabled: boolean;
}

/**
 * 投票提交结果
 */
export interface VoteSubmissionResult {
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果失败） */
  error?: string;
  /** 投票ID（如果成功） */
  voteId?: string;
}

/**
 * 协调器统计信息
 */
export interface CoordinatorStats {
  /** 总决策数 */
  totalDecisions: number;
  /** 总投票数 */
  totalVotes: number;
  /** 总冲突数 */
  totalConflicts: number;
  /** 已解决冲突数 */
  resolvedConflicts: number;
  /** 需要人工介入的冲突数 */
  humanInterventionCount: number;
  /** 按项目统计 */
  byProject: Record<string, number>;
  /** 按Agent统计 */
  byAgent: Record<string, number>;
}

/**
 * Guardian兼容格式
 */
export interface GuardianCompatibleDecision {
  /** 决策类型 */
  type: 'go' | 'no-go' | 'conditional-go';
  /** 置信度 */
  confidence: number;
  /** 决策理由 */
  reasoning: string;
  /** 涉及的Agent */
  agents: string[];
  /** 冲突标记 */
  hasConflict: boolean;
}

// ============================================================
// GovernanceCoordinator 类
// ============================================================

/**
 * 治理层协调器
 *
 * 负责协调多个治理Agent之间的意见，通过投票、冲突检测和决策聚合机制，
 * 减少治理冲突，提供统一的治理决策接口。
 */
export class GovernanceCoordinator {
  private readonly config: CoordinatorConfig;
  private agents: Map<string, GovernanceAgent>;
  private votes: Map<string, Map<string, GovernanceVote[]>>; // projectId -> decisionId -> votes[]
  private decisions: Map<string, Map<string, GovernanceDecision>>; // projectId -> decisionId -> decision
  private conflicts: Map<string, GovernanceConflict[]>; // projectId -> conflicts[]
  private conflictHistory: GovernanceConflict[] = [];
  private strategy: AggregationStrategy;

  constructor(config: CoordinatorConfig) {
    this.config = config;
    this.strategy = config.strategy;
    this.agents = new Map();
    this.votes = new Map();
    this.decisions = new Map();
    this.conflicts = new Map();

    // 初始化Agent
    for (const agent of config.agents) {
      this.agents.set(agent.id, { ...agent });
    }
  }

  // ============================================================
  // Agent管理
  // ============================================================

  /**
   * 获取Agent信息
   */
  getAgent(agentId: string): GovernanceAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * 获取所有Agent
   */
  getAllAgents(): GovernanceAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * 设置Agent权重
   */
  setAgentWeight(agentId: string, weight: number): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.weight = weight;
    return true;
  }

  /**
   * 设置Agent启用状态
   */
  setAgentEnabled(agentId: string, enabled: boolean): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.enabled = enabled;
    return true;
  }

  // ============================================================
  // 投票机制
  // ============================================================

  /**
   * 提交投票
   *
   * @param projectId 项目ID
   * @param decisionId 决策ID
   * @param vote 投票内容
   * @returns 提交结果
   */
  submitVote(
    projectId: string,
    decisionId: string,
    vote: GovernanceVote,
  ): VoteSubmissionResult {
    // 验证Agent
    const agent = this.agents.get(vote.agentId);
    if (!agent) {
      return { success: false, error: `未知的Agent: ${vote.agentId}` };
    }

    // 验证Agent启用状态
    if (!agent.enabled) {
      return { success: false, error: `Agent已禁用: ${vote.agentId}` };
    }

    // 验证置信度范围
    if (vote.confidence < 0 || vote.confidence > 1) {
      return { success: false, error: '置信度必须在0-1之间' };
    }

    // 获取或创建项目投票映射
    let projectVotes = this.votes.get(projectId);
    if (!projectVotes) {
      projectVotes = new Map();
      this.votes.set(projectId, projectVotes);
    }

    // 获取或创建决策投票列表
    let decisionVotes = projectVotes.get(decisionId);
    if (!decisionVotes) {
      decisionVotes = [];
      projectVotes.set(decisionId, decisionVotes);
    }

    // 检查是否已存在该Agent的投票
    const existingIndex = decisionVotes.findIndex((v) => v.agentId === vote.agentId);
    if (existingIndex >= 0) {
      // 覆盖旧投票
      decisionVotes[existingIndex] = vote;
    } else {
      // 添加新投票
      decisionVotes.push(vote);
    }

    // 清除缓存的决策
    const projectDecisions = this.decisions.get(projectId);
    if (projectDecisions) {
      projectDecisions.delete(decisionId);
    }

    return {
      success: true,
      voteId: randomUUID(),
    };
  }

  /**
   * 获取投票列表
   */
  getVotes(projectId: string, decisionId: string): GovernanceVote[] {
    const projectVotes = this.votes.get(projectId);
    if (!projectVotes) return [];

    const decisionVotes = projectVotes.get(decisionId);
    if (!decisionVotes) return [];

    return [...decisionVotes];
  }

  /**
   * 获取加权投票列表
   */
  getWeightedVotes(projectId: string, decisionId: string): WeightedVote[] {
    const votes = this.getVotes(projectId, decisionId);

    return votes.map((vote) => {
      const agent = this.agents.get(vote.agentId);
      const weight = agent?.weight ?? 1.0;

      return {
        ...vote,
        weight,
        weightedConfidence: vote.confidence * weight,
      };
    });
  }

  /**
   * 检查投票是否完成
   *
   * 投票完成的条件：所有启用的Agent都已投票
   */
  isVotingComplete(projectId: string, decisionId: string): boolean {
    const votes = this.getVotes(projectId, decisionId);
    const enabledAgents = Array.from(this.agents.values()).filter((a) => a.enabled);

    // 检查每个启用的Agent是否都已投票
    for (const agent of enabledAgents) {
      if (!votes.some((v) => v.agentId === agent.id)) {
        return false;
      }
    }

    return true;
  }

  // ============================================================
  // 冲突检测
  // ============================================================

  /**
   * 检测冲突
   *
   * @param projectId 项目ID
   * @param decisionId 决策ID
   * @returns 检测到的冲突列表
   */
  detectConflicts(projectId: string, decisionId: string): GovernanceConflict[] {
    const votes = this.getVotes(projectId, decisionId);
    const conflicts: GovernanceConflict[] = [];

    if (votes.length < 2) {
      return conflicts;
    }

    // 首先检测逻辑矛盾（最高优先级）
    // 逻辑矛盾：投票类型相同但推理涉及不同维度（如技术vs范围）
    let hasLogicalContradiction = false;
    for (let i = 0; i < votes.length; i++) {
      for (let j = i + 1; j < votes.length; j++) {
        // 只检测相同投票类型的逻辑矛盾（避免与直接冲突混淆）
        if (votes[i].type === votes[j].type && this.hasLogicalContradiction(votes[i], votes[j])) {
          hasLogicalContradiction = true;
          conflicts.push({
            id: randomUUID(),
            type: ConflictType.LOGICAL_CONTRADICTION,
            severity: ConflictSeverity.MEDIUM,
            agents: [votes[i].agentId, votes[j].agentId],
            description: `${votes[i].agentId}与${votes[j].agentId}的推理存在逻辑矛盾`,
            resolution: '分析推理逻辑，识别共同点或分歧点',
            timestamp: Date.now(),
          });
        }
      }
    }

    // 如果检测到逻辑矛盾，返回（优先处理）
    if (hasLogicalContradiction) {
      this.recordConflicts(projectId, conflicts);
      return conflicts;
    }

    // 检测直接冲突（GO vs NO_GO）
    const goVotes = votes.filter((v) => v.type === VoteType.GO);
    const noGoVotes = votes.filter((v) => v.type === VoteType.NO_GO);

    if (goVotes.length > 0 && noGoVotes.length > 0) {
      const severity = this.calculateDirectConflictSeverity(goVotes, noGoVotes);
      conflicts.push({
        id: randomUUID(),
        type: ConflictType.DIRECT_CONFLICT,
        severity,
        agents: [...goVotes.map((v) => v.agentId), ...noGoVotes.map((v) => v.agentId)],
        description: `${goVotes.length}个Agent支持，${noGoVotes.length}个Agent反对`,
        resolution: '使用加权多数投票或人工介入决策',
        timestamp: Date.now(),
      });

      // 记录并返回直接冲突
      this.recordConflicts(projectId, conflicts);
      return conflicts;
    }

    // 检测置信度差异（仅在无直接冲突时）
    const confidences = votes.map((v) => v.confidence);
    const maxConfidence = Math.max(...confidences);
    const minConfidence = Math.min(...confidences);
    const confidenceGap = maxConfidence - minConfidence;

    if (confidenceGap > this.config.conflict_threshold) {
      conflicts.push({
        id: randomUUID(),
        type: ConflictType.CONFIDENCE_GAP,
        severity: confidenceGap > 0.5 ? ConflictSeverity.HIGH : ConflictSeverity.MEDIUM,
        agents: votes.map((v) => v.agentId),
        description: `置信度差异过大: ${(confidenceGap * 100).toFixed(1)}%`,
        resolution: '使用置信度加权聚合策略',
        timestamp: Date.now(),
      });
    }

    // 记录其他类型的冲突
    if (conflicts.length > 0) {
      this.recordConflicts(projectId, conflicts);
    }

    return conflicts;
  }

  /**
   * 记录冲突到项目和历史
   */
  private recordConflicts(projectId: string, conflicts: GovernanceConflict[]): void {
    let projectConflicts = this.conflicts.get(projectId);
    if (!projectConflicts) {
      projectConflicts = [];
      this.conflicts.set(projectId, projectConflicts);
    }

    // 将新冲突添加到项目冲突列表
    for (const conflict of conflicts) {
      // 避免重复
      if (!projectConflicts.some((c) => c.id === conflict.id)) {
        projectConflicts.push(conflict);

        // 添加到历史记录
        this.conflictHistory.push(conflict);

        // 限制历史记录大小
        while (this.conflictHistory.length > this.config.max_conflict_history) {
          this.conflictHistory.shift();
        }
      }
    }
  }

  /**
   * 计算直接冲突的严重程度
   */
  private calculateDirectConflictSeverity(
    goVotes: GovernanceVote[],
    noGoVotes: GovernanceVote[],
  ): ConflictSeverity {
    const avgGoConfidence = goVotes.reduce((sum, v) => sum + v.confidence, 0) / goVotes.length;
    const avgNoGoConfidence = noGoVotes.reduce((sum, v) => sum + v.confidence, 0) / noGoVotes.length;

    // 双方都很确信时，冲突最严重
    const combinedConfidence = (avgGoConfidence + avgNoGoConfidence) / 2;

    if (combinedConfidence > 0.85) return ConflictSeverity.CRITICAL;
    if (combinedConfidence > 0.7) return ConflictSeverity.HIGH;
    if (combinedConfidence > 0.5) return ConflictSeverity.MEDIUM;
    return ConflictSeverity.LOW;
  }

  /**
   * 检测两个投票是否存在逻辑矛盾
   */
  private hasLogicalContradiction(v1: GovernanceVote, v2: GovernanceVote): boolean {
    // 如果投票类型不同（GO vs NO_GO），检查推理是否涉及不同维度
    if (v1.type !== v2.type) {
      const reasoning1 = v1.reasoning.toLowerCase();
      const reasoning2 = v2.reasoning.toLowerCase();

      // 检测范围/边界相关的矛盾
      const scopeKeywords = ['范围', '边界', '包含', '超出', 'scope', 'boundary'];
      const hasScope1 = scopeKeywords.some((k) => reasoning1.includes(k));
      const hasScope2 = scopeKeywords.some((k) => reasoning2.includes(k));

      // 如果一方涉及范围，另一方涉及技术/架构，则是逻辑矛盾（不同维度）
      const techKeywords = ['架构', '技术', '可行', '稳健', 'architecture', 'feasible'];
      const hasTech1 = techKeywords.some((k) => reasoning1.includes(k));
      const hasTech2 = techKeywords.some((k) => reasoning2.includes(k));

      // 一方关注范围，一方关注技术可行性 -> 逻辑矛盾
      if ((hasScope1 && hasTech2) || (hasScope2 && hasTech1)) {
        return true;
      }
    }

    // 检测推理文本中的关键词冲突
    const reasoning1 = v1.reasoning.toLowerCase();
    const reasoning2 = v2.reasoning.toLowerCase();

    // 检测明显的矛盾关键词
    const contradictions = [
      ['符合', '不符合'],
      ['支持', '反对'],
      ['可行', '不可行'],
      ['包含', '超出'],
      ['在范围内', '超出范围'],
    ];

    for (const [pos, neg] of contradictions) {
      const hasPos = reasoning1.includes(pos) && reasoning2.includes(neg);
      const hasNeg = reasoning1.includes(neg) && reasoning2.includes(pos);
      if (hasPos || hasNeg) {
        return true;
      }
    }

    return false;
  }

  // ============================================================
  // 决策聚合
  // ============================================================

  /**
   * 聚合决策
   *
   * @param projectId 项目ID
   * @param decisionId 决策ID
   * @returns 聚合后的决策
   */
  aggregateDecision(projectId: string, decisionId: string): GovernanceDecision {
    // 检查缓存
    const projectDecisions = this.decisions.get(projectId);
    if (projectDecisions) {
      const cached = projectDecisions.get(decisionId);
      if (cached) {
        return cached;
      }
    }

    const votes = this.getVotes(projectId, decisionId);
    const weightedVotes = this.getWeightedVotes(projectId, decisionId);
    const conflicts = this.detectConflicts(projectId, decisionId);

    // 统计票数
    const goVotes = votes.filter((v) => v.type === VoteType.GO);
    const noGoVotes = votes.filter((v) => v.type === VoteType.NO_GO);
    const conditionalVotes = votes.filter((v) => v.type === VoteType.CONDITIONAL_GO);
    const abstainVotes = votes.filter((v) => v.type === VoteType.ABSTAIN);

    // 根据策略计算决策
    let finalType: VoteType;
    let confidence: number;
    let reasoning: string;

    switch (this.strategy) {
      case AggregationStrategy.SIMPLE_MAJORITY:
        ({ type: finalType, confidence, reasoning } = this.simpleMajorityDecision(
          goVotes,
          noGoVotes,
          conditionalVotes,
        ));
        break;

      case AggregationStrategy.WEIGHTED_MAJORITY:
        ({ type: finalType, confidence, reasoning } = this.weightedMajorityDecision(
          weightedVotes,
        ));
        break;

      case AggregationStrategy.UNANIMITY:
        ({ type: finalType, confidence, reasoning } = this.unanimityDecision(
          goVotes,
          noGoVotes,
          conditionalVotes,
        ));
        break;

      case AggregationStrategy.CONFIDENCE_WEIGHTED:
        ({ type: finalType, confidence, reasoning } = this.confidenceWeightedDecision(votes));
        break;

      case AggregationStrategy.SUPER_MAJORITY:
        ({ type: finalType, confidence, reasoning } = this.superMajorityDecision(
          goVotes,
          noGoVotes,
          conditionalVotes,
        ));
        break;

      default:
        finalType = VoteType.NO_GO;
        confidence = 0;
        reasoning = '未知策略';
    }

    const decision: GovernanceDecision = {
      id: randomUUID(),
      projectId,
      decisionId,
      type: finalType,
      confidence,
      goVotes: goVotes.length,
      noGoVotes: noGoVotes.length,
      conditionalVotes: conditionalVotes.length,
      abstainVotes: abstainVotes.length,
      totalParticipants: votes.length,
      reasoning,
      timestamp: Date.now(),
      hasConflict: conflicts.length > 0,
      conflicts,
    };

    // 缓存决策
    if (!projectDecisions) {
      this.decisions.set(projectId, new Map());
    }
    this.decisions.get(projectId)!.set(decisionId, decision);

    return decision;
  }

  /**
   * 简单多数决策
   */
  private simpleMajorityDecision(
    goVotes: GovernanceVote[],
    noGoVotes: GovernanceVote[],
    conditionalVotes: GovernanceVote[],
  ): { type: VoteType; confidence: number; reasoning: string } {
    const counts = {
      [VoteType.GO]: goVotes.length,
      [VoteType.NO_GO]: noGoVotes.length,
      [VoteType.CONDITIONAL_GO]: conditionalVotes.length,
    };

    // 找出最多票数
    const maxCount = Math.max(counts[VoteType.GO], counts[VoteType.NO_GO], counts[VoteType.CONDITIONAL_GO]);

    // 处理平局：GO优先于CONDITIONAL_GO，CONDITIONAL_GO优先于NO_GO
    if (counts[VoteType.GO] === maxCount) {
      return {
        type: VoteType.GO,
        confidence: this.averageConfidence(goVotes),
        reasoning: `简单多数决策：${counts[VoteType.GO]}票支持`,
      };
    }

    if (counts[VoteType.CONDITIONAL_GO] === maxCount) {
      return {
        type: VoteType.CONDITIONAL_GO,
        confidence: this.averageConfidence(conditionalVotes),
        reasoning: `简单多数决策：${counts[VoteType.CONDITIONAL_GO]}票有条件支持`,
      };
    }

    return {
      type: VoteType.NO_GO,
      confidence: this.averageConfidence(noGoVotes),
      reasoning: `简单多数决策：${counts[VoteType.NO_GO]}票反对`,
    };
  }

  /**
   * 加权多数决策
   */
  private weightedMajorityDecision(
    weightedVotes: WeightedVote[],
  ): { type: VoteType; confidence: number; reasoning: string } {
    const weightsByType: Record<VoteType, number> = {
      [VoteType.GO]: 0,
      [VoteType.NO_GO]: 0,
      [VoteType.CONDITIONAL_GO]: 0,
      [VoteType.ABSTAIN]: 0,
    };

    const totalConfidenceByType: Record<VoteType, number> = {
      [VoteType.GO]: 0,
      [VoteType.NO_GO]: 0,
      [VoteType.CONDITIONAL_GO]: 0,
      [VoteType.ABSTAIN]: 0,
    };

    for (const vote of weightedVotes) {
      weightsByType[vote.type] += vote.weight;
      totalConfidenceByType[vote.type] += vote.weightedConfidence;
    }

    // 找出最高权重
    let maxWeight = 0;
    let selectedType = VoteType.NO_GO;

    for (const type of [VoteType.GO, VoteType.CONDITIONAL_GO, VoteType.NO_GO]) {
      if (weightsByType[type] > maxWeight) {
        maxWeight = weightsByType[type];
        selectedType = type;
      }
    }

    const count = weightedVotes.filter((v) => v.type === selectedType).length;
    const avgConfidence = count > 0
      ? totalConfidenceByType[selectedType] / weightsByType[selectedType]
      : 0;

    return {
      type: selectedType,
      confidence: avgConfidence,
      reasoning: `加权多数决策：${selectedType}权重${maxWeight.toFixed(2)} (${count}票)`,
    };
  }

  /**
   * 一致性决策
   */
  private unanimityDecision(
    goVotes: GovernanceVote[],
    noGoVotes: GovernanceVote[],
    conditionalVotes: GovernanceVote[],
  ): { type: VoteType; confidence: number; reasoning: string } {
    const totalVotes = goVotes.length + noGoVotes.length + conditionalVotes.length;

    // 全部GO
    if (goVotes.length === totalVotes && totalVotes > 0) {
      return {
        type: VoteType.GO,
        confidence: this.averageConfidence(goVotes),
        reasoning: '一致性决策：全体通过',
      };
    }

    // 全部NO_GO
    if (noGoVotes.length === totalVotes && totalVotes > 0) {
      return {
        type: VoteType.NO_GO,
        confidence: this.averageConfidence(noGoVotes),
        reasoning: '一致性决策：全体反对',
      };
    }

    // 不一致时返回CONDITIONAL_GO
    if (totalVotes > 0) {
      return {
        type: VoteType.CONDITIONAL_GO,
        confidence: 0.5,
        reasoning: '一致性决策：意见不一致，建议人工审查',
      };
    }

    // 无投票时默认NO_GO（保守策略）
    return {
      type: VoteType.NO_GO,
      confidence: 0,
      reasoning: '一致性决策：无有效投票',
    };
  }

  /**
   * 置信度加权决策
   */
  private confidenceWeightedDecision(
    votes: GovernanceVote[],
  ): { type: VoteType; confidence: number; reasoning: string } {
    const confidenceByType: Record<VoteType, number> = {
      [VoteType.GO]: 0,
      [VoteType.NO_GO]: 0,
      [VoteType.CONDITIONAL_GO]: 0,
      [VoteType.ABSTAIN]: 0,
    };

    // 计算每种类型的总置信度
    for (const vote of votes) {
      confidenceByType[vote.type] += vote.confidence;
    }

    // 找出最高总置信度
    let maxConfidence = 0;
    let selectedType = VoteType.NO_GO;

    for (const type of [VoteType.GO, VoteType.CONDITIONAL_GO, VoteType.NO_GO]) {
      if (confidenceByType[type] > maxConfidence) {
        maxConfidence = confidenceByType[type];
        selectedType = type;
      }
    }

    const count = votes.filter((v) => v.type === selectedType).length;
    const avgConfidence = count > 0 ? confidenceByType[selectedType] / count : 0;

    return {
      type: selectedType,
      confidence: avgConfidence,
      reasoning: `置信度加权决策：${selectedType}总置信度${maxConfidence.toFixed(2)} (${count}票)`,
    };
  }

  /**
   * 超级多数决策
   */
  private superMajorityDecision(
    goVotes: GovernanceVote[],
    noGoVotes: GovernanceVote[],
    conditionalVotes: GovernanceVote[],
  ): { type: VoteType; confidence: number; reasoning: string } {
    const totalVotes = goVotes.length + noGoVotes.length + conditionalVotes.length;
    const threshold = this.config.super_majority_threshold; // 默认2/3

    // GO达到超级多数
    if (goVotes.length / totalVotes >= threshold) {
      return {
        type: VoteType.GO,
        confidence: this.averageConfidence(goVotes),
        reasoning: `超级多数决策：GO达到${(goVotes.length / totalVotes * 100).toFixed(1)}%`,
      };
    }

    // NO_GO达到超级多数
    if (noGoVotes.length / totalVotes >= threshold) {
      return {
        type: VoteType.NO_GO,
        confidence: this.averageConfidence(noGoVotes),
        reasoning: `超级多数决策：NO_GO达到${(noGoVotes.length / totalVotes * 100).toFixed(1)}%`,
      };
    }

    // 未达到超级多数时降级为简单多数
    return this.simpleMajorityDecision(goVotes, noGoVotes, conditionalVotes);
  }

  /**
   * 计算平均置信度
   */
  private averageConfidence(votes: GovernanceVote[]): number {
    if (votes.length === 0) return 0;
    const sum = votes.reduce((acc, v) => acc + v.confidence, 0);
    return sum / votes.length;
  }

  // ============================================================
  // 冲突解决
  // ============================================================

  /**
   * 解决冲突
   *
   * @param projectId 项目ID
   * @param decisionId 决策ID
   * @returns 解决结果
   */
  resolveConflict(projectId: string, decisionId: string): ConflictResolution {
    const conflicts = this.detectConflicts(projectId, decisionId);

    if (conflicts.length === 0) {
      const decision = this.aggregateDecision(projectId, decisionId);
      return {
        resolved: true,
        requiresHumanIntervention: false,
        finalDecision: decision,
        resolution: '无冲突',
        timestamp: Date.now(),
      };
    }

    // 检查是否有高严重度冲突
    const hasHighSeverity = conflicts.some((c) =>
      c.severity === ConflictSeverity.HIGH || c.severity === ConflictSeverity.CRITICAL
    );

    if (hasHighSeverity) {
      // 高严重度冲突需要人工介入
      return {
        resolved: false,
        requiresHumanIntervention: true,
        finalDecision: null,
        resolution: '存在高严重度冲突，需要人工介入',
        timestamp: Date.now(),
      };
    }

    // 自动解决低/中严重度冲突
    const decision = this.aggregateDecision(projectId, decisionId);

    return {
      resolved: true,
      requiresHumanIntervention: false,
      finalDecision: decision,
      resolution: `自动解决${conflicts.length}个冲突，使用${this.strategy}策略`,
      timestamp: Date.now(),
    };
  }

  /**
   * 获取冲突历史
   */
  getConflictHistory(projectId?: string): GovernanceConflict[] {
    if (projectId) {
      const projectConflicts = this.conflicts.get(projectId);
      return projectConflicts ? [...projectConflicts] : [];
    }

    return [...this.conflictHistory];
  }

  // ============================================================
  // 配置管理
  // ============================================================

  /**
   * 获取当前配置
   */
  getConfig(): CoordinatorConfig {
    return { ...this.config, strategy: this.strategy };
  }

  /**
   * 设置聚合策略
   */
  setAggregationStrategy(strategy: AggregationStrategy): void {
    this.strategy = strategy;
    // 清除缓存的决策
    for (const [, projectDecisions] of this.decisions) {
      projectDecisions.clear();
    }
  }

  // ============================================================
  // 统计信息
  // ============================================================

  /**
   * 获取统计信息
   */
  getStats(): CoordinatorStats {
    let totalDecisions = 0;
    let totalVotes = 0;
    let totalConflicts = 0;
    let resolvedConflicts = 0;
    let humanInterventionCount = 0;
    const byProject: Record<string, number> = {};
    const byAgent: Record<string, number> = {};

    // 统计决策 - 包含缓存的决策和已投票但未聚合的决策
    for (const [projectId, projectVotes] of this.votes) {
      let projectDecisionCount = 0;

      for (const [decisionId] of projectVotes) {
        // 检查是否已有聚合决策
        const projectDecisions = this.decisions.get(projectId);
        if (projectDecisions && projectDecisions.has(decisionId)) {
          projectDecisionCount++;
        } else {
          // 有投票但未聚合的也算作一个决策
          projectDecisionCount++;
        }
      }

      totalDecisions += projectDecisionCount;
      byProject[projectId] = projectDecisionCount;
    }

    // 统计投票
    for (const [, projectVotes] of this.votes) {
      for (const [, decisionVotes] of projectVotes) {
        totalVotes += decisionVotes.length;
        for (const vote of decisionVotes) {
          byAgent[vote.agentId] = (byAgent[vote.agentId] || 0) + 1;
        }
      }
    }

    // 统计冲突
    for (const [, projectConflicts] of this.conflicts) {
      for (const conflict of projectConflicts) {
        totalConflicts++;
        if (conflict.severity === ConflictSeverity.LOW || conflict.severity === ConflictSeverity.MEDIUM) {
          resolvedConflicts++;
        } else {
          humanInterventionCount++;
        }
      }
    }

    return {
      totalDecisions,
      totalVotes,
      totalConflicts,
      resolvedConflicts,
      humanInterventionCount,
      byProject,
      byAgent,
    };
  }

  /**
   * 检查是否应该触发Guardian告警
   *
   * 条件：冲突率过高或连续冲突次数过多
   */
  shouldAlertGuardian(): boolean {
    const stats = this.getStats();

    // 无决策时不需要告警
    if (stats.totalDecisions === 0) return false;

    // 冲突率超过30%时告警
    const conflictRate = stats.totalConflicts / stats.totalDecisions;
    if (conflictRate > 0.3) return true;

    // 高严重度冲突存在时告警
    if (stats.humanInterventionCount > 0) return true;

    return false;
  }

  // ============================================================
  // Guardian集成
  // ============================================================

  /**
   * 转换为Guardian兼容格式
   */
  toGuardianFormat(decision: GovernanceDecision): GuardianCompatibleDecision {
    return {
      type: decision.type === VoteType.GO ? 'go' :
            decision.type === VoteType.NO_GO ? 'no-go' : 'conditional-go',
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      agents: this.getVotes(decision.projectId, decision.decisionId).map((v) => v.agentId),
      hasConflict: decision.hasConflict,
    };
  }

  // ============================================================
  // 数据清理
  // ============================================================

  /**
   * 清除指定决策的投票
   */
  clearVotes(projectId: string, decisionId: string): void {
    const projectVotes = this.votes.get(projectId);
    if (projectVotes) {
      projectVotes.delete(decisionId);
    }

    const projectDecisions = this.decisions.get(projectId);
    if (projectDecisions) {
      projectDecisions.delete(decisionId);
    }
  }

  /**
   * 清除指定项目的所有数据
   */
  clearProject(projectId: string): void {
    this.votes.delete(projectId);
    this.decisions.delete(projectId);
    this.conflicts.delete(projectId);
  }

  /**
   * 销毁协调器
   */
  destroy(): void {
    this.votes.clear();
    this.decisions.clear();
    this.conflicts.clear();
    this.conflictHistory = [];
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建治理协调器
 *
 * @param config 配置
 * @returns GovernanceCoordinator实例
 */
export function createGovernanceCoordinator(
  config: Partial<CoordinatorConfig> = {},
): GovernanceCoordinator {
  const defaultConfig: CoordinatorConfig = {
    agents: [],
    strategy: AggregationStrategy.WEIGHTED_MAJORITY,
    conflict_threshold: 0.3,
    super_majority_threshold: 2 / 3,
    max_conflict_history: 1000,
    auto_resolve_enabled: true,
  };

  return new GovernanceCoordinator({ ...defaultConfig, ...config });
}
