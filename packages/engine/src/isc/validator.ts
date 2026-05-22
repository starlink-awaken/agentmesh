/**
 * Honeycomb v2 - ISC Validator
 *
 * 质量门禁配置验证器，支持 ISC 表达式验证和向后兼容的自然语言格式。
 */

import type {
  QualityGateISC,
  QualityGateCriterionISC,
} from './types.js';
import type {
  ISCExpression,
  ASTNode,
} from './types.js';
import { ISCParser } from './parser.js';
import { ISCInvalidExpressionError, ISCValidationError } from './errors.js';

// ============================================================
// 验证结果类型
// ============================================================

/** 验证错误 */
export interface ValidationError {
  /** 错误路径 */
  path: string;
  /** 错误消息 */
  message: string;
  /** 错误代码 */
  code?: string;
  /** 期望值 */
  expected?: string;
  /** 实际值 */
  actual?: unknown;
}

/** 验证结果 */
export interface ValidationResult {
  /** 是否验证通过 */
  valid: boolean;
  /** 错误列表 */
  errors: ValidationError[];
  /** 警告列表 */
  warnings: string[];
}

/** 验证报告 */
export interface ValidationReport {
  /** 门禁名称 */
  gate_name: string;
  /** 是否有效 */
  is_valid: boolean;
  /** 标准数量 */
  criteria_count: number;
  /** 强制标准数量 */
  mandatory_count: number;
  /** 可选标准数量 */
  optional_count: number;
  /** 错误列表 */
  errors: ValidationError[];
  /** 警告列表 */
  warnings: string[];
  /** 提取的变量列表 */
  variables: string[];
  /** 验证时间戳 */
  validated_at: number;
}

// ============================================================
// 自然语言到 ISC 表达式转换规则
// ============================================================

/** 转换规则接口 */
interface ConversionRule {
  /** 匹配模式（正则表达式） */
  pattern: RegExp;
  /** 转换模板 */
  template: (matches: RegExpMatchArray) => string;
}

/** 自然语言转换规则 */
const CONVERSION_RULES: ConversionRule[] = [
  // 百分比比较: "Test coverage >= 80%" -> "coverage >= 80%"
  {
    pattern: /(?:Test\s+)?coverage\s*(>=|<=|>|<|==|!=)\s*(\d+)%/i,
    template: (matches) => {
      const [, op, value] = matches;
      return `coverage ${op} ${value}%`;
    },
  },
  // "Code duplication <= 5%" -> "duplication <= 5%"
  {
    pattern: /(?:Code\s+)?duplication\s*(>=|<=|>|<|==|!=)\s*(\d+)%/i,
    template: (matches) => {
      const [, op, value] = matches;
      return `duplication ${op} ${value}%`;
    },
  },
  // "P95 latency <= 200ms" -> "p95_latency <= 200"
  {
    pattern: /P95\s+latency\s*(<=|<)\s*(\d+)ms?/i,
    template: (matches) => {
      const [, op, value] = matches;
      return `p95_latency ${op} ${value}`;
    },
  },
  // "Cyclomatic complexity <= 10" -> "complexity <= 10"
  {
    pattern: /Cyclomatic\s+complexity\s*(<=|<)\s*(\d+)/i,
    template: (matches) => {
      const [, op, value] = matches;
      return `complexity ${op} ${value}`;
    },
  },
  // "No lint errors" -> "errors == 0"
  {
    pattern: /No\s+(?:lint\s+)?errors/i,
    template: () => {
      return `errors == 0`;
    },
  },
  // "No X" -> "x == 0" (通用规则)
  {
    pattern: /no\s+(\w+(?:\s+\w+)*)/i,
    template: (matches) => {
      const varName = matches[1].toLowerCase().replace(/\s+/g, '_');
      return `${varName} == 0`;
    },
  },
  // "All X Y" -> 复杂条件，暂时保留
  {
    pattern: /all\s+(\w+(?:\s+\w+)*)\s+(\w+(?:\s+\w+)*)/i,
    template: (matches) => {
      // 暂时简单处理
      return `${matches[1].toLowerCase().replace(/\s+/g, '_')} == true`;
    },
  },
  // "Maximum X <= Y" -> "x <= Y"
  {
    pattern: /maximum\s+(\w+(?:\s+\w+)*)\s*(<=|<)\s*(\d+)/i,
    template: (matches) => {
      const varName = matches[1].toLowerCase().replace(/\s+/g, '_');
      return `${varName} ${matches[2]} ${matches[3]}`;
    },
  },
  // "Minimum X >= Y" -> "x >= Y"
  {
    pattern: /minimum\s+(\w+(?:\s+\w+)*)\s*(>=|>)\s*(\d+)/i,
    template: (matches) => {
      const varName = matches[1].toLowerCase().replace(/\s+/g, '_');
      return `${varName} ${matches[2]} ${matches[3]}`;
    },
  },
  // 默认: 直接小写并替换空格
  {
    pattern: /.+/,
    template: (matches) => {
      return matches[0].toLowerCase().replace(/\s+/g, '_');
    },
  },
];

// ============================================================
// ISC 验证器
// ============================================================

/**
 * ISC 配置验证器
 */
export class ISCValidator {
  private parser: ISCParser;

  constructor() {
    this.parser = new ISCParser();
  }

  // ----------------------------------------------------------
  // 表达式验证
  // ----------------------------------------------------------

  /**
   * 验证 ISC 表达式
   * @param expression 要验证的表达式字符串
   * @returns 验证结果
   */
  validateExpression(expression: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    try {
      // 尝试解析表达式
      const ast = this.parser.parse(expression);

      // 检查表达式是否为空
      if (!ast) {
        errors.push({
          path: '$',
          message: 'Expression parsed to empty AST',
          code: 'EMPTY_AST',
        });
        return { valid: false, errors, warnings };
      }

      // 提取变量并检查
      const variables = this.extractVariables(expression);
      if (variables.length === 0) {
        warnings.push('Expression contains no variables - this may be a constant value');
      }

      return { valid: true, errors: [], warnings };
    } catch (error) {
      if (error instanceof Error) {
        errors.push({
          path: '$',
          message: error.message,
          code: 'PARSE_ERROR',
        });
      } else {
        errors.push({
          path: '$',
          message: 'Unknown error during expression validation',
          code: 'UNKNOWN_ERROR',
        });
      }
      return { valid: false, errors, warnings };
    }
  }

  /**
   * 从表达式中提取变量名
   * @param expression 表达式字符串
   * @returns 变量名列表
   */
  extractVariables(expression: string): string[] {
    try {
      const ast = this.parser.parse(expression);
      return this.extractVariablesFromAST(ast);
    } catch {
      return [];
    }
  }

  /**
   * 从 AST 中提取变量名
   */
  private extractVariablesFromAST(node: ASTNode): string[] {
    const variables = new Set<string>();

    const traverse = (n: ASTNode): void => {
      if (n.type === 'Identifier') {
        variables.add((n as any).name);
      } else if (n.type === 'Member') {
        // 构建嵌套属性路径
        const member = n as any;
        let path = this.extractVariablesFromAST(member.object)[0];
        if (path) {
          variables.add(`${path}.${member.property}`);
        }
      } else if (n.type === 'Comparison' || n.type === 'Logical' || n.type === 'Unary') {
        const expr = n as any;
        if (expr.left) traverse(expr.left);
        if (expr.right) traverse(expr.right);
        if (expr.argument) traverse(expr.argument);
      }
    };

    traverse(node);
    return Array.from(variables);
  }

  /**
   * 检查未声明的变量
   * @param criterion 质量标准
   * @returns 未声明的变量列表
   */
  checkUndefinedVariables(criterion: QualityGateCriterionISC): string[] {
    const actualVars = this.extractVariables(criterion.expression);
    const expectedVars = criterion.expected_variables || [];

    return actualVars.filter(v => !expectedVars.includes(v));
  }

  /**
   * 验证变量是否与预期匹配
   */
  validateVariables(criterion: QualityGateCriterionISC): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    const actualVars = this.extractVariables(criterion.expression);
    const expectedVars = criterion.expected_variables || [];

    // 检查未声明的变量
    for (const varName of actualVars) {
      if (!expectedVars.includes(varName)) {
        warnings.push(`Variable '${varName}' is not in expected_variables list`);
      }
    }

    // 检查声明了但未使用的变量
    for (const varName of expectedVars) {
      if (!actualVars.includes(varName)) {
        warnings.push(`Expected variable '${varName}' is not used in expression`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ----------------------------------------------------------
  // 质量门禁验证
  // ----------------------------------------------------------

  /**
   * 验证质量门禁配置
   */
  validateQualityGate(gate: QualityGateISC): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // 验证基本字段
    if (!gate.name || typeof gate.name !== 'string') {
      errors.push({
        path: 'name',
        message: 'Quality gate must have a valid name',
        code: 'MISSING_NAME',
      });
    }

    const validPhases = ['init', 'research', 'decision', 'execution', 'feedback', 'delivery'];
    if (!gate.phase || !validPhases.includes(gate.phase)) {
      errors.push({
        path: 'phase',
        message: `Invalid phase '${gate.phase}'. Must be one of: ${validPhases.join(', ')}`,
        code: 'INVALID_PHASE',
        expected: validPhases.join(', '),
      });
    }

    if (!Array.isArray(gate.criteria)) {
      errors.push({
        path: 'criteria',
        message: 'Criteria must be an array',
        code: 'INVALID_CRITERIA_TYPE',
      });
      return { valid: false, errors, warnings };
    }

    // 验证每个标准
    if (gate.criteria.length === 0) {
      warnings.push('Quality gate has no criteria');
    }

    for (let i = 0; i < gate.criteria.length; i++) {
      const criterion = gate.criteria[i];
      const criterionResult = this.validateCriterion(criterion);
      errors.push(...criterionResult.errors.map(e => ({
        ...e,
        path: `criteria[${i}].${e.path}`,
      })));
      warnings.push(...criterionResult.warnings);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * 验证单个质量标准
   */
  validateCriterion(criterion: QualityGateCriterionISC): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // 检查是否为旧版自然语言格式
    if (typeof criterion === 'string') {
      warnings.push(`legacy natural language format detected: "${criterion}". Consider migrating to ISC format.`);
      warnings.push(`Legacy format: "${criterion}" should be converted to ISC expression format.`);
      return { valid: true, errors, warnings };
    }

    // 验证 ISC 格式
    if (!criterion.id) {
      errors.push({
        path: 'id',
        message: 'Criterion must have an id',
        code: 'MISSING_ID',
      });
    }

    if (!criterion.name) {
      errors.push({
        path: 'name',
        message: 'Criterion must have a name',
        code: 'MISSING_NAME',
      });
    }

    if (!criterion.expression) {
      errors.push({
        path: 'expression',
        message: 'Criterion must have an expression',
        code: 'MISSING_EXPRESSION',
      });
    } else {
      // 验证表达式语法
      const exprResult = this.validateExpression(criterion.expression);
      if (!exprResult.valid) {
        errors.push(...exprResult.errors.map(e => ({
          ...e,
          path: `expression.${e.path}`,
        })));
      }
      warnings.push(...exprResult.warnings);
    }

    if (typeof criterion.mandatory !== 'boolean') {
      errors.push({
        path: 'mandatory',
        message: 'Criterion must specify mandatory as boolean',
        code: 'MISSING_MANDATORY',
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ----------------------------------------------------------
  // 自然语言迁移支持
  // ----------------------------------------------------------

  /**
   * 将自然语言表达式转换为 ISC 表达式
   */
  convertLegacyExpression(natural: string): string {
    const normalized = natural.trim();

    // 尝试应用转换规则
    for (const rule of CONVERSION_RULES) {
      const match = normalized.match(rule.pattern);
      if (match) {
        return rule.template(match);
      }
    }

    // 如果没有规则匹配，返回原始表达式
    return normalized;
  }

  /**
   * 批量转换自然语言标准为 ISC 格式
   */
  migrateLegacyCriteria(
    legacyCriteria: string[],
    baseId?: string
  ): QualityGateCriterionISC[] {
    return legacyCriteria.map((criterion, index) => {
      const expression = this.convertLegacyExpression(criterion);
      return {
        id: baseId ? `${baseId}-${index}` : `criterion-${index}`,
        name: criterion,
        expression,
        mandatory: true,
      };
    });
  }

  // ----------------------------------------------------------
  // 报告生成
  // ----------------------------------------------------------

  /**
   * 生成验证报告
   */
  generateValidationReport(gate: QualityGateISC): ValidationReport {
    const validation = this.validateQualityGate(gate);

    // 收集所有变量
    const allVariables = new Set<string>();
    for (const criterion of gate.criteria) {
      if (typeof criterion === 'object' && criterion.expression) {
        const vars = this.extractVariables(criterion.expression);
        vars.forEach(v => allVariables.add(v));
      }
    }

    return {
      gate_name: gate.name,
      is_valid: validation.valid,
      criteria_count: gate.criteria.length,
      mandatory_count: gate.criteria.filter(c => typeof c === 'object' && c.mandatory).length,
      optional_count: gate.criteria.filter(c => typeof c === 'object' && !c.mandatory).length,
      errors: validation.errors,
      warnings: validation.warnings,
      variables: Array.from(allVariables),
      validated_at: Date.now(),
    };
  }

  /**
   * 生成人类可读的验证摘要
   */
  generateValidationSummary(report: ValidationReport): string {
    const lines: string[] = [];

    lines.push(`# Validation Report for "${report.gate_name}"`);
    lines.push('');
    lines.push(`Status: ${report.is_valid ? '✅ VALID' : '❌ INVALID'}`);
    lines.push(`Criteria: ${report.criteria_count} total (${report.mandatory_count} mandatory, ${report.optional_count} optional)`);

    if (report.variables.length > 0) {
      lines.push(`Variables: ${report.variables.join(', ')}`);
    }

    if (report.errors.length > 0) {
      lines.push('');
      lines.push('## Errors:');
      for (const error of report.errors) {
        lines.push(`  - [${error.path}] ${error.message}`);
      }
    }

    if (report.warnings.length > 0) {
      lines.push('');
      lines.push('## Warnings:');
      for (const warning of report.warnings) {
        lines.push(`  - ${warning}`);
      }
    }

    return lines.join('\n');
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建 ISC 验证器
 */
export function createISCValidator(): ISCValidator {
  return new ISCValidator();
}
