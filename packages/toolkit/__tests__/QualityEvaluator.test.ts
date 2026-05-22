/**
 * QualityEvaluator 单元测试
 *
 * 测试质量评估器的评分能力
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { QualityEvaluator, TestDispatcher, createQualityEvaluator, createTestDispatcher } from '../src/qa/index.js';
import type { QualityInput, TestResult } from '../src/qa/types.js';

describe('QualityEvaluator', () => {
  let evaluator: QualityEvaluator;

  beforeEach(() => {
    evaluator = new QualityEvaluator();
  });

  // ============================================================================
  // 构造函数测试
  // ============================================================================

  describe('constructor', () => {
    it('should create evaluator', () => {
      expect(evaluator).toBeDefined();
    });
  });

  // ============================================================================
  // 评估功能测试
  // ============================================================================

  describe('evaluate', () => {
    it('should return pass decision for high quality', () => {
      const input: QualityInput = {
        testResults: [
          { type: 'unit', passed: true, passedCount: 100, totalCount: 100, duration: 100, coverage: 95 },
          { type: 'integration', passed: true, passedCount: 50, totalCount: 50, duration: 200, coverage: 85 },
        ],
        regressionTests: { passed: 48, total: 50 },
      };

      const result = evaluator.evaluate(input);

      expect(result.total).toBeGreaterThanOrEqual(90);
      expect(result.decision).toBe('pass');
    });

    it('should return conditional decision for medium quality', () => {
      const input: QualityInput = {
        testResults: [
          { type: 'unit', passed: true, passedCount: 80, totalCount: 100, duration: 100, coverage: 70 },
        ],
        regressionTests: { passed: 40, total: 50 },
      };

      const result = evaluator.evaluate(input);

      expect(result.decision).toBe('conditional');
    });

    it('should return fix decision for low quality', () => {
      const input: QualityInput = {
        testResults: [
          { type: 'unit', passed: false, passedCount: 50, totalCount: 100, duration: 100, coverage: 50 },
        ],
        regressionTests: { passed: 30, total: 50 },
      };

      const result = evaluator.evaluate(input);

      expect(result.decision).toBe('fix');
    });

    it('should return reject decision for very low quality', () => {
      const input: QualityInput = {
        testResults: [
          { type: 'unit', passed: false, passedCount: 10, totalCount: 100, duration: 100, coverage: 10, defects: 50 },
        ],
      };

      const result = evaluator.evaluate(input);

      expect(result.decision).toBe('reject');
    });

    it('should include breakdown in result', () => {
      const input: QualityInput = {
        testResults: [
          { type: 'unit', passed: true, passedCount: 90, totalCount: 100, duration: 100, coverage: 90 },
        ],
      };

      const result = evaluator.evaluate(input);

      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.coverage).toBeDefined();
      expect(result.breakdown.defects).toBeDefined();
      expect(result.breakdown.passRate).toBeDefined();
      expect(result.breakdown.regression).toBeDefined();
    });

    it('should include recommendations', () => {
      const input: QualityInput = {
        testResults: [
          { type: 'unit', passed: true, passedCount: 100, totalCount: 100, duration: 100, coverage: 95 },
        ],
        regressionTests: { passed: 45, total: 50 },
      };

      const result = evaluator.evaluate(input);

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should handle empty test results', () => {
      const input: QualityInput = {
        testResults: [],
      };

      const result = evaluator.evaluate(input);

      expect(result.total).toBeDefined();
      expect(result.decision).toBeDefined();
    });

    it('should handle missing regression tests', () => {
      const input: QualityInput = {
        testResults: [
          { type: 'unit', passed: true, passedCount: 100, totalCount: 100, duration: 100 },
        ],
      };

      const result = evaluator.evaluate(input);

      expect(result.breakdown.regression).toBe(75); // 默认值
    });

    it('should handle missing coverage data', () => {
      const input: QualityInput = {
        testResults: [
          { type: 'unit', passed: true, passedCount: 100, totalCount: 100, duration: 100 },
        ],
      };

      const result = evaluator.evaluate(input);

      expect(result.breakdown.coverage).toBe(50); // 默认值
    });
  });

  // ============================================================================
  // 覆盖率计算测试
  // ============================================================================

  describe('coverage calculation', () => {
    it('should calculate average coverage', () => {
      const results: TestResult[] = [
        { type: 'unit', passed: true, passedCount: 50, totalCount: 50, coverage: 80 },
        { type: 'integration', passed: true, passedCount: 30, totalCount: 30, coverage: 70 },
      ];

      const input: QualityInput = { testResults: results };
      const result = evaluator.evaluate(input);

      // (80 + 70) / 2 = 75
      expect(result.breakdown.coverage).toBe(75);
    });
  });

  // ============================================================================
  // 缺陷率计算测试
  // ============================================================================

  describe('defects calculation', () => {
    it('should give high score for low defect rate', () => {
      const input: QualityInput = {
        testResults: [
          { type: 'unit', passed: true, passedCount: 100, totalCount: 100, defects: 1 },
        ],
      };

      const result = evaluator.evaluate(input);

      expect(result.breakdown.defects).toBeGreaterThanOrEqual(90);
    });

    it('should give low score for high defect rate', () => {
      const input: QualityInput = {
        testResults: [
          { type: 'unit', passed: false, passedCount: 50, totalCount: 100, defects: 50 },
        ],
      };

      const result = evaluator.evaluate(input);

      expect(result.breakdown.defects).toBe(0);
    });
  });

  // ============================================================================
  // 通过率计算测试
  // ============================================================================

  describe('pass rate calculation', () => {
    it('should calculate pass rate correctly', () => {
      const input: QualityInput = {
        testResults: [
          { type: 'unit', passed: true, passedCount: 80, totalCount: 100 },
          { type: 'integration', passed: true, passedCount: 45, totalCount: 50 },
        ],
      };

      const result = evaluator.evaluate(input);

      // (80 + 45) / (100 + 50) = 125 / 150 = 83.33
      expect(result.breakdown.passRate).toBeCloseTo(83.33, 0);
    });
  });

  // ============================================================================
  // 测试 Agent 相关测试
  // ============================================================================

  describe('getTestAgents', () => {
    it('should return list of test agents', () => {
      const agents = evaluator.getTestAgents();

      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0].id).toBeDefined();
      expect(agents[0].name).toBeDefined();
      expect(agents[0].type).toBeDefined();
    });
  });

  describe('getAgentsByLanguage', () => {
    it('should filter agents by language', () => {
      const agents = evaluator.getAgentsByLanguage('python');

      expect(agents.length).toBeGreaterThan(0);
      expect(agents.every(a => a.languages.includes('python'))).toBe(true);
    });
  });

  describe('getAgentsByType', () => {
    it('should filter agents by type', () => {
      const agents = evaluator.getAgentsByType('unit');

      expect(agents.length).toBeGreaterThan(0);
      expect(agents.every(a => a.type === 'unit')).toBe(true);
    });
  });

  // ============================================================================
  // TestDispatcher 测试
  // ============================================================================

  describe('TestDispatcher', () => {
    let dispatcher: TestDispatcher;

    beforeEach(() => {
      dispatcher = new TestDispatcher();
    });

    it('should dispatch test tasks by type', () => {
      const result = dispatcher.dispatch({ testType: 'unit' });

      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter by language', () => {
      const result = dispatcher.dispatch({ testType: 'unit', language: 'python' });

      expect(result.length).toBeGreaterThan(0);
    });

    it('should include estimated time', () => {
      const result = dispatcher.dispatch({ testType: 'unit' });

      expect(result[0].estimatedTime).toBeDefined();
    });
  });

  // ============================================================================
  // 工厂函数测试
  // ============================================================================

  describe('factory functions', () => {
    it('createQualityEvaluator should create instance', () => {
      const instance = createQualityEvaluator();
      expect(instance).toBeInstanceOf(QualityEvaluator);
    });

    it('createTestDispatcher should create instance', () => {
      const instance = createTestDispatcher();
      expect(instance).toBeInstanceOf(TestDispatcher);
    });
  });

  // ============================================================================
  // 边界情况测试
  // ============================================================================

  describe('edge cases', () => {
    it('should handle very high coverage', () => {
      const input: QualityInput = {
        testResults: [
          { type: 'unit', passed: true, passedCount: 100, totalCount: 100, coverage: 100 },
        ],
      };

      const result = evaluator.evaluate(input);
      expect(result.breakdown.coverage).toBe(100);
    });

    it('should handle all tests passing', () => {
      const input: QualityInput = {
        testResults: [
          { type: 'unit', passed: true, passedCount: 100, totalCount: 100, coverage: 95 },
          { type: 'integration', passed: true, passedCount: 100, totalCount: 100, coverage: 90 },
          { type: 'e2e', passed: true, passedCount: 50, totalCount: 50, coverage: 85 },
        ],
        regressionTests: { passed: 100, total: 100 },
      };

      const result = evaluator.evaluate(input);
      expect(['pass', 'conditional']).toContain(result.decision);
    });
  });
});
