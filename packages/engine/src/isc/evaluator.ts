/**
 * Honeycomb v2 - ISC Evaluator
 *
 * 表达式求值引擎，支持变量绑定、类型转换、短路求值等特性。
 */

import type {
  ISCExpression,
  ISCIdentifier,
  ISCLiteral,
  ISCComparisonExpression,
  ISCLogicalExpression,
  ISCUnaryExpression,
  ISCMemberExpression,
  EvaluationContext,
  EvaluationResult,
} from './types.js';
import {
  ISCEvaluationError,
  ISCUndefinedVariableError,
  ISCTypeError,
  ISCPropertyAccessError,
} from './errors.js';

// ============================================================
// 类型转换工具
// ============================================================

/**
 * 将值转换为数字
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = parseFloat(value);
    if (!isNaN(num)) return num;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  throw new ISCTypeError('number conversion', 'number', value);
}

/**
 * 将值转换为字符串
 */
function toString(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return String(value);
}

/**
 * 将值转换为布尔值
 */
function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return lower === 'true' || lower === 'yes' || lower === '1' || value !== '';
  }
  return false;
}

/**
 * 获取值的类型
 */
function getValueType(value: unknown): 'string' | 'number' | 'boolean' | 'object' | 'null' | 'undefined' {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean' || type === 'object') {
    return type;
  }
  return 'object';
}

// ============================================================
// 求值引擎
// ============================================================

/**
 * ISC 表达式求值引擎
 */
export class ISCEvaluator {
  /**
   * 求值表达式
   * @param expr 要求值的 AST 表达式
   * @param context 求值上下文（变量绑定）
   * @returns 求值结果
   */
  evaluate(expr: ISCExpression, context: EvaluationContext = {}): boolean | number | string {
    try {
      const result = this.evaluateExpression(expr, context);
      return result;
    } catch (error) {
      if (error instanceof ISCEvaluationError) {
        throw error;
      }
      throw new ISCEvaluationError(
        `Unexpected error during evaluation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 求值表达式并返回布尔结果
   * @param expr 要求值的 AST 表达式
   * @param context 求值上下文（变量绑定）
   * @returns 布尔值结果
   */
  evaluateToBoolean(expr: ISCExpression, context: EvaluationContext = {}): boolean {
    const result = this.evaluate(expr, context);
    return toBoolean(result);
  }

  /**
   * 求值表达式并返回结构化结果
   */
  evaluateDetailed(expr: ISCExpression, context: EvaluationContext = {}): EvaluationResult {
    try {
      const value = this.evaluate(expr, context);
      return {
        success: true,
        value,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ----------------------------------------------------------
  // 内部求值方法
  // ----------------------------------------------------------

  /**
   * 求值表达式（分发到具体类型）
   */
  private evaluateExpression(expr: ISCExpression, context: EvaluationContext): boolean | number | string {
    switch (expr.type) {
      case 'Identifier':
        return this.evaluateIdentifier(expr as ISCIdentifier, context) as boolean | number | string;
      case 'Literal':
        return this.evaluateLiteral(expr as ISCLiteral) as boolean | number | string;
      case 'Comparison':
        return this.evaluateComparison(expr as ISCComparisonExpression, context);
      case 'Logical':
        return this.evaluateLogical(expr as ISCLogicalExpression, context);
      case 'Unary':
        return this.evaluateUnary(expr as ISCUnaryExpression, context);
      case 'Member':
        return this.evaluateMember(expr as ISCMemberExpression, context) as boolean | number | string;
      default:
        throw new ISCEvaluationError(`Unknown expression type: ${(expr as ISCExpression).type}`);
    }
  }

  /**
   * 求值标识符
   */
  private evaluateIdentifier(expr: ISCIdentifier, context: EvaluationContext): unknown {
    const value = context[expr.name];

    if (value === undefined) {
      throw new ISCUndefinedVariableError(expr.name);
    }

    return value;
  }

  /**
   * 求值字面量
   */
  private evaluateLiteral(expr: ISCLiteral): unknown {
    return expr.value;
  }

  /**
   * 求值比较表达式
   */
  private evaluateComparison(expr: ISCComparisonExpression, context: EvaluationContext): boolean {
    let left = this.evaluateExpression(expr.left, context);
    let right = this.evaluateExpression(expr.right, context);

    // 处理百分比比较：如果一边是小数(<1)而另一边是整数(>1)，将整数也归一化为小数
    // 例如：coverage >= 80% 其中 coverage=85，80%被解析为0.8
    // 我们需要将85归一化为0.85来与0.8比较
    if (typeof left === 'number' && typeof right === 'number') {
      if (left < 1 && right > 1) {
        right = right / 100;
      } else if (right < 1 && left > 1) {
        left = left / 100;
      }
    }

    switch (expr.operator) {
      case '==':
        return this.compareEqual(left, right);
      case '!=':
        return !this.compareEqual(left, right);
      case '>':
        return this.compareGreater(left, right);
      case '>=':
        return this.compareGreater(left, right) || this.compareEqual(left, right);
      case '<':
        return this.compareLess(left, right);
      case '<=':
        return this.compareLess(left, right) || this.compareEqual(left, right);
      default:
        throw new ISCEvaluationError(`Unknown comparison operator: ${expr.operator}`);
    }
  }

  /**
   * 求值逻辑表达式（支持短路求值）
   */
  private evaluateLogical(expr: ISCLogicalExpression, context: EvaluationContext): boolean {
    const left = toBoolean(this.evaluateExpression(expr.left, context));

    // AND: 如果左边为 false，直接返回 false
    if (expr.operator === '&&' && !left) {
      return false;
    }

    // OR: 如果左边为 true，直接返回 true
    if (expr.operator === '||' && left) {
      return true;
    }

    // 否则求值右边
    const right = toBoolean(this.evaluateExpression(expr.right, context));

    return expr.operator === '&&' ? (left && right) : (left || right);
  }

  /**
   * 求值一元表达式
   */
  private evaluateUnary(expr: ISCUnaryExpression, context: EvaluationContext): boolean {
    const argument = toBoolean(this.evaluateExpression(expr.argument, context));

    if (expr.operator === '!') {
      return !argument;
    }

    throw new ISCEvaluationError(`Unknown unary operator: ${expr.operator}`);
  }

  /**
   * 求值成员访问表达式
   */
  private evaluateMember(expr: ISCMemberExpression, context: EvaluationContext): unknown {
    const obj = this.evaluateExpression(expr.object, context);

    if (obj === null || typeof obj !== 'object') {
      throw new ISCPropertyAccessError(obj, expr.property);
    }

    const value = (obj as Record<string, unknown>)[expr.property];

    if (value === undefined) {
      throw new ISCUndefinedVariableError(
        `${expr.object.type === 'Identifier' ? (expr.object as ISCIdentifier).name : '...'}.${expr.property}`
      );
    }

    return value;
  }

  // ----------------------------------------------------------
  // 比较操作辅助方法
  // ----------------------------------------------------------

  /**
   * 相等比较（宽松比较）
   */
  private compareEqual(left: unknown, right: unknown): boolean {
    if (left === right) return true;

    // 类型转换比较
    const leftType = getValueType(left);
    const rightType = getValueType(right);

    // 数字和字符串比较
    if ((leftType === 'number' && rightType === 'string') ||
        (leftType === 'string' && rightType === 'number')) {
      try {
        return toNumber(left) === toNumber(right);
      } catch {
        return false;
      }
    }

    // 布尔和其他类型比较
    if (leftType === 'boolean' || rightType === 'boolean') {
      return toBoolean(left) === toBoolean(right);
    }

    return false;
  }

  /**
   * 大于比较
   */
  private compareGreater(left: unknown, right: unknown): boolean {
    const leftNum = toNumber(left);
    const rightNum = toNumber(right);
    return leftNum > rightNum;
  }

  /**
   * 小于比较
   */
  private compareLess(left: unknown, right: unknown): boolean {
    const leftNum = toNumber(left);
    const rightNum = toNumber(right);
    return leftNum < rightNum;
  }
}

// ============================================================
// 批量求值工具
// ============================================================

/**
 * 求值多个表达式
 */
export function evaluateBatch(
  expressions: ISCExpression[],
  context: EvaluationContext
): EvaluationResult[] {
  const evaluator = new ISCEvaluator();
  return expressions.map(expr => evaluator.evaluateDetailed(expr, context));
}

/**
 * 求值表达式直到第一个失败或全部成功
 */
export function evaluateAllOrNothing(
  expressions: ISCExpression[],
  context: EvaluationContext
): EvaluationResult {
  const evaluator = new ISCEvaluator();

  for (const expr of expressions) {
    const result = evaluator.evaluateDetailed(expr, context);
    if (!result.success) {
      return result;
    }
  }

  return { success: true };
}
