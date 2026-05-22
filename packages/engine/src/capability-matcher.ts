/**
 * Honeycomb v2 - Capability Matcher
 *
 * 能力匹配算法，负责：
 * - 根据任务需求匹配合适的 Agent
 * - 支持精确匹配、模糊匹配、任意匹配模式
 * - 计算匹配分数并排序结果
 * - 处理 Schema 兼容性检查
 */

import type {
  CapabilityMatchRequest,
  CapabilityMatchResult,
  CapabilityDefinition,
  CapabilityLevel,
  IOSchema,
} from './capability-schema.js';
import type { DiscoveredCapability as DiscoveredCapabilityInternal } from './capability-discovery.js';
import { meetsCapabilityLevel } from './capability-schema.js';

// ============================================================
// 匹配分数计算权重
// ============================================================

export interface MatchWeights {
  /** 类型匹配权重 */
  typeMatch: number;
  /** 标签匹配权重 */
  tagMatch: number;
  /** 等级匹配权重 */
  levelMatch: number;
  /** 性能匹配权重 */
  performanceMatch: number;
  /** Schema 兼容性权重 */
  schemaCompatibility: number;
}

const DEFAULT_WEIGHTS: MatchWeights = {
  typeMatch: 0.3,
  tagMatch: 0.25,
  levelMatch: 0.2,
  performanceMatch: 0.15,
  schemaCompatibility: 0.1,
};

// ============================================================
// 匹配原因构建器
// ============================================================

class MatchReasonBuilder {
  private reasons: string[] = [];

  add(reason: string): void {
    this.reasons.push(reason);
  }

  build(): string[] {
    return [...this.reasons];
  }

  static create(): MatchReasonBuilder {
    return new MatchReasonBuilder();
  }
}

// ============================================================
// Schema 兼容性检查
// ============================================================

/**
 * 检查输入数据是否与 Schema 兼容
 */
function checkInputCompatibility(
  data: unknown,
  schema: IOSchema,
): boolean {
  if (data === null || data === undefined) {
    return schema.type === 'null';
  }

  switch (schema.type) {
    case 'string':
      return typeof data === 'string';
    case 'number':
      return typeof data === 'number';
    case 'boolean':
      return typeof data === 'boolean';
    case 'array':
      return Array.isArray(data);
    case 'object':
      return typeof data === 'object' && !Array.isArray(data);
    case 'null':
      return data === null;
    default:
      return false;
  }
}

/**
 * 检查输出 Schema 是否与期望兼容
 */
function checkOutputCompatibility(
  actualSchema: IOSchema | undefined,
  expectedSchema: IOSchema,
): boolean {
  // 如果没有实际 Schema，假设兼容
  if (!actualSchema) {
    return true;
  }

  // 类型必须匹配
  if (actualSchema.type !== expectedSchema.type) {
    return false;
  }

  // 对于枚举类型，检查是否有交集
  if (expectedSchema.enum && actualSchema.enum) {
    const hasIntersection = expectedSchema.enum.some((v) =>
      actualSchema.enum!.includes(v),
    );
    if (!hasIntersection) {
      return false;
    }
  }

  return true;
}

/**
 * 计算 Schema 兼容性分数 (0-1)
 */
function calculateSchemaCompatibility(
  request: CapabilityMatchRequest,
  capability: CapabilityDefinition,
): number {
  let score = 1.0;

  // 检查输入兼容性
  if (request.input && capability.input) {
    if (!checkInputCompatibility(request.input, capability.input)) {
      score -= 0.5;
    }
  }

  // 检查输出兼容性
  if (request.outputSchema && capability.output) {
    if (!checkOutputCompatibility(capability.output, request.outputSchema)) {
      score -= 0.5;
    }
  }

  return Math.max(0, score);
}

// ============================================================
// CapabilityMatcher 类
// ============================================================

export class CapabilityMatcher {
  /** 发现的能力列表 */
  private discoveredCapabilities: DiscoveredCapabilityInternal[];

  /** 匹配权重配置 */
  private weights: MatchWeights;

  constructor(
    discoveredCapabilities: DiscoveredCapabilityInternal[],
    weights?: Partial<MatchWeights>,
  ) {
    this.discoveredCapabilities = discoveredCapabilities;
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  // ----------------------------------------------------------
  // 匹配方法
  // ----------------------------------------------------------

  /**
   * 执行能力匹配
   */
  match(request: CapabilityMatchRequest): CapabilityMatchResult[] {
    switch (request.mode) {
      case 'exact':
        return this.matchExact(request);
      case 'fuzzy':
        return this.matchFuzzy(request);
      case 'any':
        return this.matchAny(request);
      default:
        return [];
    }
  }

  /**
   * 精确匹配 - 所有条件必须满足
   */
  private matchExact(request: CapabilityMatchRequest): CapabilityMatchResult[] {
    const results: CapabilityMatchResult[] = [];

    for (const discovered of this.discoveredCapabilities) {
      const { capability, agentName } = discovered;
      const reasons = MatchReasonBuilder.create();
      let valid = true;

      // 类型必须匹配
      if (request.type && capability.type !== request.type) {
        valid = false;
        continue;
      } else if (request.type) {
        reasons.add(`Type matches: ${capability.type}`);
      }

      // 等级必须满足
      if (request.minLevel) {
        if (!meetsCapabilityLevel(capability.level, request.minLevel)) {
          valid = false;
          continue;
        } else {
          reasons.add(`Level ${capability.level} meets requirement ${request.minLevel}`);
        }
      }

      // 性能约束
      if (request.maxDurationMs && capability.performance?.avgDurationMs) {
        if (capability.performance.avgDurationMs > request.maxDurationMs) {
          valid = false;
          continue;
        } else {
          reasons.add(`Duration ${capability.performance.avgDurationMs}ms within limit ${request.maxDurationMs}ms`);
        }
      }

      if (request.maxTokens && capability.performance?.avgTokens) {
        if (capability.performance.avgTokens > request.maxTokens) {
          valid = false;
          continue;
        } else {
          reasons.add(`Token usage ${capability.performance.avgTokens} within limit ${request.maxTokens}`);
        }
      }

      // 标签必须全部匹配
      if (request.tags && request.tags.length > 0) {
        const capTags = capability.tags || [];
        const hasAllTags = request.tags.every((tag) => capTags.includes(tag));
        if (!hasAllTags) {
          valid = false;
          continue;
        } else {
          reasons.add(`All required tags present: ${request.tags.join(', ')}`);
        }
      }

      // Schema 兼容性
      if (request.outputSchema && !checkOutputCompatibility(capability.output, request.outputSchema)) {
        valid = false;
        continue;
      }

      if (valid) {
        results.push({
          agentName,
          capability,
          score: 1.0,
          reasons: reasons.build(),
        });
      }
    }

    // 按分数排序
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * 模糊匹配 - 计算匹配分数
   */
  private matchFuzzy(request: CapabilityMatchRequest): CapabilityMatchResult[] {
    const results: CapabilityMatchResult[] = [];

    for (const discovered of this.discoveredCapabilities) {
      const { capability, agentName } = discovered;
      const reasons = MatchReasonBuilder.create();
      let totalScore = 0;
      let weightSum = 0;

      // 类型匹配
      if (request.type) {
        if (capability.type === request.type) {
          totalScore += this.weights.typeMatch;
          reasons.add(`Type matches: ${capability.type}`);
        }
        weightSum += this.weights.typeMatch;
      }

      // 标签匹配（部分匹配）
      if (request.tags && request.tags.length > 0) {
        const capTags = capability.tags || [];
        const matchedTags = request.tags.filter((tag) => capTags.includes(tag));
        const tagScore = matchedTags.length / request.tags.length;

        if (matchedTags.length > 0) {
          totalScore += this.weights.tagMatch * tagScore;
          reasons.add(`${matchedTags.length}/${request.tags.length} tags matched: ${matchedTags.join(', ')}`);
        }
        weightSum += this.weights.tagMatch;
      }

      // 等级匹配
      if (request.minLevel) {
        const levelDiff = this.getLevelDifference(capability.level, request.minLevel);
        // 等级差越小，分数越高
        const levelScore = Math.max(0, 1 - levelDiff * 0.3);
        if (meetsCapabilityLevel(capability.level, request.minLevel)) {
          totalScore += this.weights.levelMatch * levelScore;
          reasons.add(`Level ${capability.level} meets ${request.minLevel} (score: ${levelScore.toFixed(2)})`);
        }
        weightSum += this.weights.levelMatch;
      }

      // 性能匹配
      if (request.maxDurationMs && capability.performance?.avgDurationMs) {
        const durationScore = Math.min(
          1,
          request.maxDurationMs / capability.performance.avgDurationMs,
        );
        totalScore += this.weights.performanceMatch * durationScore;
        reasons.add(`Duration performance: ${durationScore.toFixed(2)}`);
        weightSum += this.weights.performanceMatch;
      }

      if (request.maxTokens && capability.performance?.avgTokens) {
        const tokenScore = Math.min(1, request.maxTokens / capability.performance.avgTokens);
        totalScore += this.weights.performanceMatch * tokenScore * 0.5; // 降低权重
        weightSum += this.weights.performanceMatch * 0.5;
      }

      // Schema 兼容性
      if (request.input || request.outputSchema) {
        const schemaScore = calculateSchemaCompatibility(request, capability);
        totalScore += this.weights.schemaCompatibility * schemaScore;
        if (schemaScore < 1) {
          reasons.add(`Schema compatibility: ${schemaScore.toFixed(2)}`);
        }
        weightSum += this.weights.schemaCompatibility;
      }

      // 计算最终分数
      const finalScore = weightSum > 0 ? totalScore / weightSum : 0;

      // 只保留分数大于 0 的结果
      if (finalScore > 0) {
        results.push({
          agentName,
          capability,
          score: finalScore,
          reasons: reasons.build(),
        });
      }
    }

    // 按分数排序
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * 任意匹配 - 返回所有能力，按推荐程度排序
   */
  private matchAny(request: CapabilityMatchRequest): CapabilityMatchResult[] {
    const results: CapabilityMatchResult[] = [];

    for (const discovered of this.discoveredCapabilities) {
      const { capability, agentName } = discovered;
      const reasons = MatchReasonBuilder.create();
      let score = 0.5; // 基础分数

      // 类型加分
      if (request.type && capability.type === request.type) {
        score += 0.2;
        reasons.add(`Preferred type: ${capability.type}`);
      }

      // 标签加分
      if (request.tags) {
        const capTags = capability.tags || [];
        const matchedTags = request.tags.filter((tag) => capTags.includes(tag));
        score += (matchedTags.length / request.tags.length) * 0.15;
        if (matchedTags.length > 0) {
          reasons.add(`Matched tags: ${matchedTags.join(', ')}`);
        }
      }

      // 等级加分
      if (request.minLevel && meetsCapabilityLevel(capability.level, request.minLevel)) {
        score += 0.1;
        reasons.add(`Exceeds level requirement: ${capability.level} >= ${request.minLevel}`);
      }

      results.push({
        agentName,
        capability,
        score: Math.min(1, score),
        reasons: reasons.build(),
      });
    }

    // 按分数排序
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * 获取最佳匹配（单个结果）
   */
  findBestMatch(request: CapabilityMatchRequest): CapabilityMatchResult | undefined {
    const results = this.match(request);
    return results.length > 0 ? results[0] : undefined;
  }

  /**
   * 获取前 N 个匹配结果
   */
  findTopMatches(request: CapabilityMatchRequest, n: number): CapabilityMatchResult[] {
    const results = this.match(request);
    return results.slice(0, n);
  }

  // ----------------------------------------------------------
  // 辅助方法
  // ----------------------------------------------------------

  /**
   * 计算能力等级差异
   */
  private getLevelDifference(
    actual: CapabilityLevel,
    required: CapabilityLevel,
  ): number {
    const levels = { basic: 0, intermediate: 1, advanced: 2, expert: 3 };
    return Math.abs(levels[actual] - levels[required]);
  }

  /**
   * 更新已发现的能力列表
   */
  updateDiscoveredCapabilities(capabilities: DiscoveredCapabilityInternal[]): void {
    this.discoveredCapabilities = capabilities;
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建能力匹配器
 */
export function createCapabilityMatcher(
  discoveredCapabilities: DiscoveredCapabilityInternal[],
  weights?: Partial<MatchWeights>,
): CapabilityMatcher {
  return new CapabilityMatcher(discoveredCapabilities, weights);
}

// ============================================================
// 导出类型供测试使用
// ============================================================

export type { DiscoveredCapabilityInternal };
