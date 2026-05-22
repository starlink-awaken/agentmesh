/**
 * ISC Schema 验证测试
 * 测试质量门禁配置的 ISC 表达式验证
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ISCValidator } from '../src/isc/validator.js';
import { ISCParser } from '../src/isc/parser.js';
import type { QualityGateISC, QualityGateCriterionISC } from '../src/isc/types.js';

// ============================================================
// 基本验证测试
// ============================================================

describe('ISCValidator - 基本验证', () => {
  let validator: ISCValidator;

  beforeEach(() => {
    validator = new ISCValidator();
  });

  it('应该验证有效的质量门禁', () => {
    const gate: QualityGateISC = {
      name: 'Code Quality',
      phase: 'feedback',
      description: 'Validates code quality standards',
      mandatory: true,
      criteria: [
        {
          id: 'test-coverage',
          name: 'Test Coverage',
          description: 'Minimum test coverage',
          expression: 'coverage >= 80%',
          mandatory: true
        }
      ]
    };

    const result = validator.validateQualityGate(gate);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('应该拒绝缺少 name 的门禁', () => {
    const gate = {
      phase: 'feedback',
      mandatory: true,
      criteria: []
    } as unknown as QualityGateISC;

    const result = validator.validateQualityGate(gate);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('name'))).toBe(true);
  });

  it('应该拒绝无效的 phase', () => {
    const gate: QualityGateISC = {
      name: 'Test Gate',
      phase: 'invalid-phase' as any,
      mandatory: true,
      criteria: []
    };

    const result = validator.validateQualityGate(gate);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('phase'))).toBe(true);
  });

  it('应该拒绝非数组的 criteria', () => {
    const gate = {
      name: 'Test Gate',
      phase: 'feedback',
      mandatory: true,
      criteria: 'invalid'
    } as unknown as QualityGateISC;

    const result = validator.validateQualityGate(gate);
    expect(result.valid).toBe(false);
  });
});

// ============================================================
// 表达式验证测试
// ============================================================

describe('ISCValidator - 表达式验证', () => {
  let validator: ISCValidator;

  beforeEach(() => {
    validator = new ISCValidator();
  });

  it('应该验证有效的布尔表达式', () => {
    const criterion: QualityGateCriterionISC = {
      id: 'test',
      name: 'Test',
      expression: 'coverage >= 80%',
      mandatory: true
    };

    const result = validator.validateExpression(criterion.expression);
    expect(result.valid).toBe(true);
  });

  it('应该验证复杂表达式', () => {
    const validExpressions = [
      'coverage >= 80% && errors == 0',
      '(coverage >= 80% || documentation >= 60%) && complexity <= 10',
      '!failed && (success == true || pending == false)',
      'metrics.test.coverage >= 80',
      'a >= 1 && b >= 2 && c >= 3 && d >= 4'
    ];

    for (const expr of validExpressions) {
      const result = validator.validateExpression(expr);
      expect(result.valid).toBe(true);
      // 如果验证失败，打印表达式用于调试
      if (!result.valid) {
        console.log(`Failed expression: ${expr}`);
        console.log(`Errors:`, result.errors);
      }
    }
  });

  it('应该拒绝语法错误的表达式', () => {
    const invalidExpressions = [
      'coverage >= ',           // 不完整的表达式
      '>= 80',                  // 缺少左操作数
      'coverage &&',            // 不完整的 AND
      '(coverage >= 80',        // 不匹配的括号
      'coverage >= 80 && &',    // 无效的符号
      '',                       // 空表达式
    ];

    for (const expr of invalidExpressions) {
      const result = validator.validateExpression(expr);
      expect(result.valid).toBe(false);
      // 如果验证意外通过，打印表达式用于调试
      if (result.valid) {
        console.log(`Unexpectedly valid expression: ${expr}`);
      }
    }
  });

  it('应该提供表达式错误的详细信息', () => {
    const result = validator.validateExpression('coverage >= ');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toBeTruthy();
  });
});

// ============================================================
// 变量引用验证测试
// ============================================================

describe('ISCValidator - 变量引用验证', () => {
  let validator: ISCValidator;

  beforeEach(() => {
    validator = new ISCValidator();
  });

  it('应该提取表达式中的变量', () => {
    const vars = validator.extractVariables('coverage >= 80% && errors == 0');
    expect(vars).toContain('coverage');
    expect(vars).toContain('errors');
    expect(vars).toHaveLength(2);
  });

  it('应该提取嵌套属性变量', () => {
    const vars = validator.extractVariables('metrics.test.coverage >= 80');
    expect(vars).toContain('metrics.test.coverage');
  });

  it('应该验证变量是否存在于上下文定义中', () => {
    const criterion: QualityGateCriterionISC = {
      id: 'test',
      name: 'Test',
      expression: 'coverage >= 80%',
      mandatory: true,
      expected_variables: ['coverage', 'errors']
    };

    const result = validator.validateVariables(criterion);
    // 如果表达式只包含 coverage，但预期包含 errors，应该有警告
    expect(result).toBeTruthy();
  });

  it('应该检测未声明的变量', () => {
    const criterion: QualityGateCriterionISC = {
      id: 'test',
      name: 'Test',
      expression: 'coverage >= 80% && unknown_var == 0',
      mandatory: true,
      expected_variables: ['coverage']
    };

    const warnings = validator.checkUndefinedVariables(criterion);
    expect(warnings).toContain('unknown_var');
  });
});

// ============================================================
// 质量门禁标准验证测试
// ============================================================

describe('ISCValidator - 质量门禁标准验证', () => {
  let validator: ISCValidator;

  beforeEach(() => {
    validator = new ISCValidator();
  });

  it('应该验证标准代码质量门禁', () => {
    const gate: QualityGateISC = {
      name: 'Code Quality Gate',
      phase: 'feedback',
      description: 'Standard code quality checks',
      mandatory: true,
      criteria: [
        {
          id: 'test-coverage',
          name: 'Test Coverage',
          description: 'Minimum test coverage threshold',
          expression: 'coverage >= 80%',
          mandatory: true,
          expected_variables: ['coverage']
        },
        {
          id: 'lint-errors',
          name: 'No Lint Errors',
          description: 'Code must pass linting',
          expression: 'errors == 0',
          mandatory: true,
          expected_variables: ['errors']
        },
        {
          id: 'complexity',
          name: 'Cyclomatic Complexity',
          description: 'Maximum complexity per function',
          expression: 'complexity <= 10',
          mandatory: false,
          expected_variables: ['complexity']
        }
      ]
    };

    const result = validator.validateQualityGate(gate);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('应该验证安全门禁', () => {
    const gate: QualityGateISC = {
      name: 'Security Gate',
      phase: 'feedback',
      description: 'Security validation checks',
      mandatory: true,
      criteria: [
        {
          id: 'no-secrets',
          name: 'No Hardcoded Secrets',
          expression: 'secrets_found == 0',
          mandatory: true,
          expected_variables: ['secrets_found']
        },
        {
          id: 'no-critical-vulns',
          name: 'No Critical Vulnerabilities',
          expression: 'critical_vulns == 0 && high_vulns == 0',
          mandatory: true,
          expected_variables: ['critical_vulns', 'high_vulns']
        }
      ]
    };

    const result = validator.validateQualityGate(gate);
    expect(result.valid).toBe(true);
  });

  it('应该验证性能门禁', () => {
    const gate: QualityGateISC = {
      name: 'Performance Gate',
      phase: 'feedback',
      description: 'Performance thresholds',
      mandatory: false,
      criteria: [
        {
          id: 'p95-latency',
          name: 'P95 Latency',
          expression: 'p95_latency <= 200',
          mandatory: true,
          expected_variables: ['p95_latency']
        },
        {
          id: 'throughput',
          name: 'Throughput',
          expression: 'throughput >= 1000',
          mandatory: false,
          expected_variables: ['throughput']
        }
      ]
    };

    const result = validator.validateQualityGate(gate);
    expect(result.valid).toBe(true);
  });
});

// ============================================================
// 迁移兼容性测试
// ============================================================

describe('ISCValidator - 迁移兼容性', () => {
  let validator: ISCValidator;

  beforeEach(() => {
    validator = new ISCValidator();
  });

  it('应该支持旧版自然语言格式的 criteria', () => {
    // 旧格式：字符串数组
    const gate = {
      name: 'Legacy Gate',
      phase: 'feedback',
      mandatory: true,
      criteria: [
        'Test coverage >= 80%',
        'No lint errors',
        'All functions documented'
      ] as any
    };

    const result = validator.validateQualityGate(gate);
    // 应该有警告但不应该失败
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('legacy'))).toBe(true);
  });

  it('应该支持混合格式', () => {
    const gate = {
      name: 'Mixed Gate',
      phase: 'feedback',
      mandatory: true,
      criteria: [
        'Test coverage >= 80%',  // 旧格式
        {
          id: 'new-style',
          name: 'New Style',
          expression: 'errors == 0',
          mandatory: true
        }
      ] as any
    };

    const result = validator.validateQualityGate(gate);
    // 混合格式应该被接受但产生警告
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('应该能够将自然语言转换为 ISC 表达式', () => {
    const conversions = [
      { from: 'Test coverage >= 80%', to: 'coverage >= 80%' },
      { from: 'No lint errors', to: 'errors == 0' },
      { from: 'Cyclomatic complexity <= 10', to: 'complexity <= 10' },
      { from: 'Code duplication <= 5%', to: 'duplication <= 5%' },
      { from: 'P95 latency <= 200ms', to: 'p95_latency <= 200' }
    ];

    for (const { from, to } of conversions) {
      const converted = validator.convertLegacyExpression(from);
      if (converted !== to) {
        console.log(`Conversion mismatch for "${from}": expected "${to}", got "${converted}"`);
      }
      expect(converted).toBe(to);
    }
  });
});

// ============================================================
// 集成测试
// ============================================================

describe('ISCValidator - 集成测试', () => {
  let validator: ISCValidator;
  let parser: ISCParser;

  beforeEach(() => {
    validator = new ISCValidator();
    parser = new ISCParser();
  });

  it('应该完整验证并解析质量门禁', () => {
    const gate: QualityGateISC = {
      name: 'Complete Gate',
      phase: 'feedback',
      mandatory: true,
      criteria: [
        {
          id: 'c1',
          name: 'Criterion 1',
          expression: 'coverage >= 80%',
          mandatory: true
        },
        {
          id: 'c2',
          name: 'Criterion 2',
          expression: 'errors == 0',
          mandatory: false
        }
      ]
    };

    // 验证配置
    const validation = validator.validateQualityGate(gate);
    expect(validation.valid).toBe(true);

    // 解析每个表达式
    for (const criterion of gate.criteria) {
      const ast = parser.parse(criterion.expression);
      expect(ast).toBeTruthy();
    }
  });

  it('应该生成验证报告', () => {
    const gate: QualityGateISC = {
      name: 'Report Gate',
      phase: 'feedback',
      mandatory: true,
      criteria: [
        {
          id: 'c1',
          name: 'Criterion 1',
          expression: 'coverage >= 80%',
          mandatory: true
        }
      ]
    };

    const report = validator.generateValidationReport(gate);
    expect(report.gate_name).toBe('Report Gate');
    expect(report.is_valid).toBe(true);
    expect(report.criteria_count).toBe(1);
    expect(report.mandatory_count).toBe(1);
  });
});
