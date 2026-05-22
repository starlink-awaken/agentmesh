/**
 * ISC Evaluator 单元测试
 * 测试表达式求值引擎的功能
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ISCParser } from '../src/isc/parser.js';
import { ISCEvaluator, EvaluationContext } from '../src/isc/evaluator.js';
import { ISCTypeError, ISCUndefinedVariableError } from '../src/isc/errors.js';

// ============================================================
// 基本求值测试
// ============================================================

describe('ISCEvaluator - 基本求值', () => {
  let parser: ISCParser;
  let evaluator: ISCEvaluator;

  beforeEach(() => {
    parser = new ISCParser();
    evaluator = new ISCEvaluator();
  });

  it('应该求值数字字面量', () => {
    const ast = parser.parse('42');
    expect(evaluator.evaluate(ast)).toBe(42);
  });

  it('应该求值字符串字面量', () => {
    const ast = parser.parse('"hello"');
    expect(evaluator.evaluate(ast)).toBe('hello');
  });

  it('应该求值布尔字面量', () => {
    expect(evaluator.evaluate(parser.parse('true'))).toBe(true);
    expect(evaluator.evaluate(parser.parse('false'))).toBe(false);
  });

  it('应该从上下文读取标识符', () => {
    const ast = parser.parse('coverage');
    const context: EvaluationContext = { coverage: 85 };
    expect(evaluator.evaluate(ast, context)).toBe(85);
  });
});

// ============================================================
// 比较操作测试
// ============================================================

describe('ISCEvaluator - 比较操作', () => {
  let parser: ISCParser;
  let evaluator: ISCEvaluator;

  beforeEach(() => {
    parser = new ISCParser();
    evaluator = new ISCEvaluator();
  });

  it('应该求值 >= 比较', () => {
    const ast = parser.parse('coverage >= 80');
    expect(evaluator.evaluate(ast, { coverage: 85 })).toBe(true);
    expect(evaluator.evaluate(ast, { coverage: 75 })).toBe(false);
    expect(evaluator.evaluate(ast, { coverage: 80 })).toBe(true);
  });

  it('应该求值 > 比较', () => {
    const ast = parser.parse('coverage > 80');
    expect(evaluator.evaluate(ast, { coverage: 81 })).toBe(true);
    expect(evaluator.evaluate(ast, { coverage: 80 })).toBe(false);
  });

  it('应该求值 <= 比较', () => {
    const ast = parser.parse('errors <= 5');
    expect(evaluator.evaluate(ast, { errors: 3 })).toBe(true);
    expect(evaluator.evaluate(ast, { errors: 6 })).toBe(false);
  });

  it('应该求值 < 比较', () => {
    const ast = parser.parse('errors < 5');
    expect(evaluator.evaluate(ast, { errors: 4 })).toBe(true);
    expect(evaluator.evaluate(ast, { errors: 5 })).toBe(false);
  });

  it('应该求值 == 比较', () => {
    const ast = parser.parse('status == "success"');
    expect(evaluator.evaluate(ast, { status: 'success' })).toBe(true);
    expect(evaluator.evaluate(ast, { status: 'failed' })).toBe(false);
  });

  it('应该求值 != 比较', () => {
    const ast = parser.parse('status != "failed"');
    expect(evaluator.evaluate(ast, { status: 'success' })).toBe(true);
    expect(evaluator.evaluate(ast, { status: 'failed' })).toBe(false);
  });

  it('应该支持数字和字符串的比较', () => {
    const ast = parser.parse('code == 200');
    expect(evaluator.evaluate(ast, { code: 200 })).toBe(true);
    expect(evaluator.evaluate(ast, { code: '200' })).toBe(true); // 类型转换
  });
});

// ============================================================
// 逻辑操作测试
// ============================================================

describe('ISCEvaluator - 逻辑操作', () => {
  let parser: ISCParser;
  let evaluator: ISCEvaluator;

  beforeEach(() => {
    parser = new ISCParser();
    evaluator = new ISCEvaluator();
  });

  it('应该求值 AND 表达式', () => {
    const ast = parser.parse('coverage >= 80 && errors == 0');
    expect(evaluator.evaluate(ast, { coverage: 85, errors: 0 })).toBe(true);
    expect(evaluator.evaluate(ast, { coverage: 75, errors: 0 })).toBe(false);
    expect(evaluator.evaluate(ast, { coverage: 85, errors: 5 })).toBe(false);
  });

  it('应该求值 OR 表达式', () => {
    const ast = parser.parse('coverage >= 90 || errors == 0');
    expect(evaluator.evaluate(ast, { coverage: 95, errors: 5 })).toBe(true);
    expect(evaluator.evaluate(ast, { coverage: 85, errors: 0 })).toBe(true);
    expect(evaluator.evaluate(ast, { coverage: 85, errors: 5 })).toBe(false);
  });

  it('应该求值 NOT 表达式', () => {
    const ast = parser.parse('!failed');
    expect(evaluator.evaluate(ast, { failed: false })).toBe(true);
    expect(evaluator.evaluate(ast, { failed: true })).toBe(false);
  });

  it('应该正确处理短路求值 (AND)', () => {
    // 短路求值测试：当左边为 false 时，右边不应该被求值
    // 由于 ISC 不支持函数调用，我们使用标识符来模拟
    const ast = parser.parse('coverage >= 80 && errors == 0');
    // coverage < 80 时，整个表达式应该是 false，无论 errors 是什么
    expect(evaluator.evaluate(ast, { coverage: 50, errors: 100 })).toBe(false);
    expect(evaluator.evaluate(ast, { coverage: 85, errors: 0 })).toBe(true);
  });

  it('应该正确处理短路求值 (OR)', () => {
    const ast = parser.parse('coverage >= 90 || errors == 0');
    expect(evaluator.evaluate(ast, { coverage: 95, errors: 5 })).toBe(true);
  });

  it('应该正确处理复杂的逻辑表达式', () => {
    const ast = parser.parse('(a >= 80 || b >= 80) && c == 0');
    expect(evaluator.evaluate(ast, { a: 75, b: 85, c: 0 })).toBe(true);
    expect(evaluator.evaluate(ast, { a: 75, b: 75, c: 0 })).toBe(false);
    expect(evaluator.evaluate(ast, { a: 85, b: 75, c: 1 })).toBe(false);
  });
});

// ============================================================
// 百分比语法测试
// ============================================================

describe('ISCEvaluator - 百分比语法', () => {
  let parser: ISCParser;
  let evaluator: ISCEvaluator;

  beforeEach(() => {
    parser = new ISCParser();
    evaluator = new ISCEvaluator();
  });

  it('应该正确处理百分比比较 (0-100范围)', () => {
    const ast = parser.parse('coverage >= 80%');
    // 80% 被转换为 0.8，但 coverage 值应该是 0-1 范围
    expect(evaluator.evaluate(ast, { coverage: 0.85 })).toBe(true);
    expect(evaluator.evaluate(ast, { coverage: 0.75 })).toBe(false);
    expect(evaluator.evaluate(ast, { coverage: 0.8 })).toBe(true);
  });

  it('应该支持整数百分比输入 (自动转换)', () => {
    const ast = parser.parse('coverage >= 80%');
    // 如果 coverage 是整数 85，应该被解释为 85%
    expect(evaluator.evaluate(ast, { coverage: 85 })).toBe(true);
    expect(evaluator.evaluate(ast, { coverage: 75 })).toBe(false);
  });

  it('应该处理多个百分比条件', () => {
    const ast = parser.parse('coverage >= 80% && duplication <= 5%');
    expect(evaluator.evaluate(ast, { coverage: 85, duplication: 3 })).toBe(true);
    expect(evaluator.evaluate(ast, { coverage: 75, duplication: 3 })).toBe(false);
    expect(evaluator.evaluate(ast, { coverage: 85, duplication: 10 })).toBe(false);
  });
});

// ============================================================
// 嵌套属性访问测试
// ============================================================

describe('ISCEvaluator - 嵌套属性访问', () => {
  let parser: ISCParser;
  let evaluator: ISCEvaluator;

  beforeEach(() => {
    parser = new ISCParser();
    evaluator = new ISCEvaluator();
  });

  it('应该支持点号访问嵌套属性', () => {
    const ast = parser.parse('metrics.coverage >= 80');
    const context = { metrics: { coverage: 85 } };
    expect(evaluator.evaluate(ast, context)).toBe(true);
  });

  it('应该支持多级嵌套访问', () => {
    const ast = parser.parse('report.test.coverage >= 80');
    const context = { report: { test: { coverage: 85 } } };
    expect(evaluator.evaluate(ast, context)).toBe(true);
  });

  it('应该支持括号访问属性', () => {
    const ast = parser.parse('metrics["coverage"] >= 80');
    const context = { metrics: { coverage: 85 } };
    expect(evaluator.evaluate(ast, context)).toBe(true);
  });

  it('应该处理嵌套属性不存在的情况', () => {
    const ast = parser.parse('metrics.coverage >= 80');
    const context = { metrics: {} };
    expect(() => evaluator.evaluate(ast, context)).toThrow(ISCUndefinedVariableError);
  });
});

// ============================================================
// 类型转换测试
// ============================================================

describe('ISCEvaluator - 类型转换', () => {
  let parser: ISCParser;
  let evaluator: ISCEvaluator;

  beforeEach(() => {
    parser = new ISCParser();
    evaluator = new ISCEvaluator();
  });

  it('应该将字符串数字转换为数字进行比较', () => {
    const ast = parser.parse('value >= 80');
    expect(evaluator.evaluate(ast, { value: '85' })).toBe(true);
    expect(evaluator.evaluate(ast, { value: '75' })).toBe(false);
  });

  it('应该将数字转换为字符串进行比较', () => {
    const ast = parser.parse('status == "200"');
    expect(evaluator.evaluate(ast, { status: 200 })).toBe(true);
  });

  it('应该处理布尔值的字符串表示', () => {
    const ast = parser.parse('enabled == true');
    expect(evaluator.evaluate(ast, { enabled: 'true' })).toBe(true);
    expect(evaluator.evaluate(ast, { enabled: true })).toBe(true);
  });
});

// ============================================================
// 错误处理测试
// ============================================================

describe('ISCEvaluator - 错误处理', () => {
  let parser: ISCParser;
  let evaluator: ISCEvaluator;

  beforeEach(() => {
    parser = new ISCParser();
    evaluator = new ISCEvaluator();
  });

  it('应该抛出未定义变量错误', () => {
    const ast = parser.parse('coverage >= 80');
    expect(() => evaluator.evaluate(ast, {})).toThrow(ISCUndefinedVariableError);
  });

  it('应该提供有用的错误信息', () => {
    const ast = parser.parse('coverage >= 80');
    try {
      evaluator.evaluate(ast, {});
      expect.fail('应该抛出错误');
    } catch (e) {
      expect(e.message).toContain('coverage');
    }
  });

  it('应该处理类型不匹配的比较', () => {
    const ast = parser.parse('value >= 80');
    // 对象无法与数字比较
    expect(() => evaluator.evaluate(ast, { value: {} })).toThrow(ISCTypeError);
  });

  it('应该处理 null 值', () => {
    const ast = parser.parse('value >= 80');
    expect(() => evaluator.evaluate(ast, { value: null })).toThrow(ISCTypeError);
  });
});

// ============================================================
// 实际用例测试
// ============================================================

describe('ISCEvaluator - 实际质量门用例', () => {
  let parser: ISCParser;
  let evaluator: ISCEvaluator;

  beforeEach(() => {
    parser = new ISCParser();
    evaluator = new ISCEvaluator();
  });

  it('应该验证代码质量门禁', () => {
    const expr = 'coverage >= 80% && errors == 0 && complexity <= 10';
    const ast = parser.parse(expr);

    const passingContext = {
      coverage: 85,
      errors: 0,
      complexity: 8
    };
    expect(evaluator.evaluate(ast, passingContext)).toBe(true);

    const failingContext = {
      coverage: 75,
      errors: 0,
      complexity: 8
    };
    expect(evaluator.evaluate(ast, failingContext)).toBe(false);
  });

  it('应该验证安全门禁', () => {
    const expr = 'secrets == 0 && (critical_vulns == 0 && high_vulns == 0)';
    const ast = parser.parse(expr);

    const secureContext = {
      secrets: 0,
      critical_vulns: 0,
      high_vulns: 0
    };
    expect(evaluator.evaluate(ast, secureContext)).toBe(true);

    const insecureContext = {
      secrets: 0,
      critical_vulns: 0,
      high_vulns: 2
    };
    expect(evaluator.evaluate(ast, insecureContext)).toBe(false);
  });

  it('应该验证性能门禁', () => {
    const expr = 'p95_latency <= 200 && p99_latency <= 500 && throughput >= 1000';
    const ast = parser.parse(expr);

    const goodContext = {
      p95_latency: 150,
      p99_latency: 400,
      throughput: 1200
    };
    expect(evaluator.evaluate(ast, goodContext)).toBe(true);

    const badContext = {
      p95_latency: 250,
      p99_latency: 400,
      throughput: 1200
    };
    expect(evaluator.evaluate(ast, badContext)).toBe(false);
  });

  it('应该验证部署就绪门禁', () => {
    const expr = 'build_success == true && health_check_passing == true && monitoring_configured == true';
    const ast = parser.parse(expr);

    const readyContext = {
      build_success: true,
      health_check_passing: true,
      monitoring_configured: true
    };
    expect(evaluator.evaluate(ast, readyContext)).toBe(true);
  });

  it('应该支持可选门禁 (使用 OR)', () => {
    const expr = 'coverage >= 80% || documentation_coverage >= 60%';
    const ast = parser.parse(expr);

    const highCoverageContext = { coverage: 85, documentation_coverage: 50 };
    expect(evaluator.evaluate(ast, highCoverageContext)).toBe(true);

    const highDocContext = { coverage: 70, documentation_coverage: 65 };
    expect(evaluator.evaluate(ast, highDocContext)).toBe(true);

    const lowBothContext = { coverage: 70, documentation_coverage: 50 };
    expect(evaluator.evaluate(ast, lowBothContext)).toBe(false);
  });
});
