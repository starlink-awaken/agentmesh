/**
 * Honeycomb v2 - ISC (Integrated Statement Criteria) Module
 *
 * ISC 是用于质量门禁验证的布尔表达式系统。
 * 提供完整的解析、求值和验证功能。
 *
 * @example
 * ```typescript
 * import { ISCParser, ISCEvaluator } from './isc/index.js';
 *
 * // 解析表达式
 * const parser = new ISCParser();
 * const ast = parser.parse('coverage >= 80% && errors == 0');
 *
 * // 求值表达式
 * const evaluator = new ISCEvaluator();
 * const result = evaluator.evaluateToBoolean(ast, {
 *   coverage: 85,
 *   errors: 0
 * });
 * console.log(result); // true
 * ```
 */

// ============================================================
// 内部导入（用于工厂函数）
// ============================================================

import { ISCParser } from './parser.js';
import { ISCEvaluator } from './evaluator.js';
import { ISCValidator } from './validator.js';
import type {
  ISCExpression,
  EvaluationContext,
} from './types.js';
import type {
  ValidationResult,
} from './validator.js';

// ============================================================
// 类型导出
// ============================================================

export type {
  // AST 节点类型
  ASTNode,
  ASTNodeType,
  ISCExpression,
  ISCIdentifier,
  ISCLiteral,
  ISCComparisonExpression,
  ISCLogicalExpression,
  ISCUnaryExpression,
  ISCMemberExpression,

  // Token 类型
  Token,

  // 求值上下文
  EvaluationContext,
  EvaluationResult,

  // 质量门禁类型
  QualityGateISC,
  QualityGateCriterionISC,
  LegacyQualityGateCriterion,
  MixedCriterion,

  // 诊断类型
  SourceLocation,
  Diagnostic,

  // 序列化类型
  SerializedAST,
  ExpressionMetadata,
} from './types.js';

// ============================================================
// 枚举导出
// ============================================================

export { TokenType, type TokenType as TokenTypeType } from './types.js';

// ============================================================
// Parser 导出
// ============================================================

export {
  ISCLexer,
  ISCParser,
} from './parser.js';

// ============================================================
// Evaluator 导出
// ============================================================

export {
  ISCEvaluator,
  evaluateBatch,
  evaluateAllOrNothing,
} from './evaluator.js';

// ============================================================
// Validator 导出
// ============================================================

export {
  ISCValidator,
  createISCValidator,
} from './validator.js';

export type {
  ValidationResult,
  ValidationError,
  ValidationReport,
} from './validator.js';

// ============================================================
// 错误导出
// ============================================================

export {
  // 基础错误
  ISCError,

  // 词法错误
  ISCLexerError,
  ISCInvalidCharacterError,
  ISCUnterminatedStringError,
  ISCInvalidNumberError,

  // 语法错误
  ISCParserError,
  ISCMismatchedParenthesisError,
  ISCUnexpectedTokenError,
  ISCEmptyExpressionError,
  ISCInvalidOperatorError,

  // 求值错误
  ISCEvaluationError,
  ISCUndefinedVariableError,
  ISCTypeError,
  ISCDivisionByZeroError,
  ISCPropertyAccessError,

  // 验证错误
  ISCValidationError,
  ISCInvalidExpressionError,
  ISCCircularDependencyError,

  // 工具函数
  createDiagnostic,
  formatLocation,
  formatError,
  isISCError,
  errorsToDiagnostics,
} from './errors.js';

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建 ISC Parser 实例
 */
export function createParser(): ISCParser {
  return new ISCParser();
}

/**
 * 创建 ISC Evaluator 实例
 */
export function createEvaluator(): ISCEvaluator {
  return new ISCEvaluator();
}

/**
 * 解析并求值表达式的便捷函数
 */
export function evaluate(
  expression: string,
  context: EvaluationContext = {}
): boolean {
  const parser = new ISCParser();
  const evaluator = new ISCEvaluator();

  const ast = parser.parse(expression);
  return evaluator.evaluateToBoolean(ast, context);
}

/**
 * 解析表达式的便捷函数
 */
export function parse(expression: string): ISCExpression {
  const parser = new ISCParser();
  return parser.parse(expression);
}

/**
 * 验证表达式的便捷函数
 */
export function validateExpression(expression: string): ValidationResult {
  const validator = new ISCValidator();
  return validator.validateExpression(expression);
}
