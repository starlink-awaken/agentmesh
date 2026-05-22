/**
 * QualityEvaluator - 质量评估器
 *
 * 源自 test-council: 多维度质量评分体系
 *
 * 评分权重：
 * - 覆盖率: 25%
 * - 缺陷率: 30%
 * - 通过率: 30%
 * - 回归测试: 15%
 */
import type {
  QualityInput,
  QualityScore,
  TestResult,
  TestType,
  DispatchConfig,
  AgentConfig,
  DispatchResult,
} from './types.js';

export type {
  TestType,
  TestResult,
  QualityInput,
  QualityScore,
  DispatchConfig,
  AgentConfig,
  DispatchResult,
} from './types.js';

// ============================================================================
// 常量定义
// ============================================================================

/**
 * 评分权重配置
 */
const SCORE_WEIGHTS = {
  coverage: 0.25,
  defects: 0.30,
  passRate: 0.30,
  regression: 0.15,
} as const;

/**
 * 决策阈值
 */
const DECISION_THRESHOLDS = {
  pass: 90,
  conditional: 70,
  fix: 50,
} as const;

/**
 * 推荐的测试Agent
 */
export const TEST_AGENTS: Array<{
  id: string;
  name: string;
  type: string;
  languages: string[];
  frameworks?: string[];
}> = [
  { id: 'e2e-runner', name: 'E2E Runner', type: 'e2e', languages: ['ts', 'js', 'python'] },
  { id: 'tdd-guide', name: 'TDD Guide', type: 'unit', languages: ['ts', 'python', 'java', 'go'] },
  { id: 'python-testing', name: 'Python Testing', type: 'unit', languages: ['python'] },
  { id: 'django-tdd', name: 'Django TDD', type: 'integration', languages: ['python'], frameworks: ['django'] },
  { id: 'springboot-tdd', name: 'SpringBoot TDD', type: 'unit', languages: ['java'], frameworks: ['spring'] },
  { id: 'go-test', name: 'Go Testing', type: 'unit', languages: ['go'] },
  { id: 'qa-tester', name: 'QA Tester', type: 'e2e', languages: ['ts', 'js', 'python', 'java', 'go'] },
];

// ============================================================================
// QualityEvaluator 类
// ============================================================================

/**
 * QualityEvaluator - 质量评估器
 *
 * 使用示例：
 * ```typescript
 * import { QualityEvaluator } from 'agent-toolkit';
 *
 * const evaluator = new QualityEvaluator();
 *
 * const score = evaluator.evaluate({
 *   testResults: [
 *     { type: 'unit', passed: true, duration: 100, coverage: 85 },
 *     { type: 'integration', passed: true, duration: 200, coverage: 70 },
 *   ],
 *   regressionTests: { passed: 45, total: 50 }
 * });
 *
 * console.log(score);
 * // { total: 88, decision: 'conditional', ... }
 * ```
 */
export class QualityEvaluator {
  private weights = SCORE_WEIGHTS;
  private thresholds = DECISION_THRESHOLDS;

  /**
   * 评估质量
   */
  evaluate(input: QualityInput): QualityScore {
    const breakdown = this.calculateBreakdown(input);

    // 计算总分
    const total = Math.round(
      breakdown.coverage * this.weights.coverage +
      breakdown.defects * this.weights.defects +
      breakdown.passRate * this.weights.passRate +
      breakdown.regression * this.weights.regression
    );

    // 确定决策
    const decision = this.getDecision(total);

    // 生成建议
    const recommendations = this.generateRecommendations(breakdown, decision);

    return {
      total,
      breakdown,
      decision,
      recommendations,
    };
  }

  /**
   * 计算各维度分数
   */
  private calculateBreakdown(input: QualityInput): QualityScore['breakdown'] {
    // 覆盖率分数
    const coverage = this.calculateCoverageScore(input.testResults);

    // 缺陷分数（通过缺陷率计算）
    const defects = this.calculateDefectsScore(input.testResults);

    // 通过率分数
    const passRate = this.calculatePassRateScore(input.testResults);

    // 回归测试分数
    const regression = this.calculateRegressionScore(input.regressionTests);

    return { coverage, defects, passRate, regression };
  }

  /**
   * 计算覆盖率分数
   */
  private calculateCoverageScore(results: TestResult[]): number {
    const withCoverage = results.filter(r => r.coverage !== undefined);

    if (withCoverage.length === 0) {
      return 50; // 无覆盖率数据时给中等分
    }

    const avgCoverage = withCoverage.reduce((sum, r) => sum + (r.coverage || 0), 0) / withCoverage.length;
    return Math.min(100, avgCoverage);
  }

  /**
   * 计算缺陷分数（缺陷越少分数越高）
   */
  private calculateDefectsScore(results: TestResult[]): number {
    const totalDefects = results.reduce((sum, r) => sum + (r.defects || 0), 0);
    const totalTests = results.reduce((sum, r) => sum + (r.totalCount || r.passedCount || 0), 0);

    if (totalTests === 0) {
      return 50;
    }

    const defectRate = totalDefects / totalTests;
    // 缺陷率 0% = 100分, 10% = 0分
    return Math.max(0, 100 - defectRate * 1000);
  }

  /**
   * 计算通过率分数
   */
  private calculatePassRateScore(results: TestResult[]): number {
    let passed = 0;
    let total = 0;

    for (const r of results) {
      if (r.passed) {
        passed += r.passedCount || 1;
      }
      total += r.totalCount || 1;
    }

    if (total === 0) {
      return 50;
    }

    return (passed / total) * 100;
  }

  /**
   * 计算回归测试分数
   */
  private calculateRegressionScore(
    regression?: { passed: number; total: number }
  ): number {
    if (!regression || regression.total === 0) {
      return 75; // 无回归测试时给默认分
    }

    return (regression.passed / regression.total) * 100;
  }

  /**
   * 获取决策
   */
  private getDecision(total: number): QualityScore['decision'] {
    if (total >= this.thresholds.pass) return 'pass';
    if (total >= this.thresholds.conditional) return 'conditional';
    if (total >= this.thresholds.fix) return 'fix';
    return 'reject';
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    breakdown: QualityScore['breakdown'],
    decision: QualityScore['decision']
  ): string[] {
    const recommendations: string[] = [];

    // 根据各项分数生成建议
    if (breakdown.coverage < 80) {
      recommendations.push('建议增加测试覆盖率至80%以上');
    }

    if (breakdown.defects < 70) {
      recommendations.push('存在较多缺陷，建议优先修复高优先级问题');
    }

    if (breakdown.passRate < 90) {
      recommendations.push('测试通过率偏低，建议修复失败的测试用例');
    }

    if (breakdown.regression < 80 && breakdown.regression > 0) {
      recommendations.push('回归测试通过率偏低，注意防止引入新问题');
    }

    // 根据决策添加总体建议
    switch (decision) {
      case 'pass':
        recommendations.push('✅ 代码质量良好，可以合并');
        break;
      case 'conditional':
        recommendations.push('⚠️ 代码基本可用，但需关注建议项');
        break;
      case 'fix':
        recommendations.push('🔧 建议修复关键问题后再合并');
        break;
      case 'reject':
        recommendations.push('❌ 代码质量不达标，建议重新设计');
        break;
    }

    return recommendations;
  }

  /**
   * 获取测试Agent列表
   */
  getTestAgents(): typeof TEST_AGENTS {
    return TEST_AGENTS;
  }

  /**
   * 根据语言筛选Agent
   */
  getAgentsByLanguage(language: string): typeof TEST_AGENTS {
    return TEST_AGENTS.filter(agent =>
      agent.languages.includes(language)
    );
  }

  /**
   * 根据类型筛选Agent
   */
  getAgentsByType(type: string): typeof TEST_AGENTS {
    return TEST_AGENTS.filter(agent => agent.type === type);
  }
}

/**
 * TestDispatcher - 测试分发器
 *
 * 根据测试需求自动选择最佳测试Agent
 */
export class TestDispatcher {
  private agents = TEST_AGENTS;

  /**
   * 分发测试任务
   */
  dispatch(config: { testType: TestType; language?: string }): DispatchResult[] {
    let candidates = this.agents.filter(a => a.type === config.testType);

    if (config.language) {
      candidates = candidates.filter(a => a.languages.includes(config.language!));
    }

    // 返回匹配的Agent
    return candidates.map(agent => ({
      agent: agent as any,
      config,
      estimatedTime: this.estimateTime(config.testType),
    }));
  }

  /**
   * 估算测试时间
   */
  private estimateTime(testType: TestType): string {
    const estimates: Record<TestType, string> = {
      unit: '1-5分钟',
      integration: '5-15分钟',
      e2e: '10-30分钟',
      performance: '15-60分钟',
      security: '30-120分钟',
    };
    return estimates[testType] || '5-15分钟';
  }
}

/**
 * 创建质量评估器
 */
export function createQualityEvaluator(): QualityEvaluator {
  return new QualityEvaluator();
}

/**
 * 创建测试分发器
 */
export function createTestDispatcher(): TestDispatcher {
  return new TestDispatcher();
}
