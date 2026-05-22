/**
 * Honeycomb v2 - ISC 错误处理系统
 *
 * 定义 ISC 解析和求值过程中的错误类型。
 */

import type { SourceLocation, Diagnostic } from './types.js';

// ============================================================
// 基础错误类
// ============================================================

/** ISC 基础错误类 */
export class ISCError extends Error {
  /** 错误代码 */
  readonly code: string;
  /** 源位置 */
  readonly location?: SourceLocation;
  /** 相关建议 */
  readonly suggestion?: string;

  constructor(
    code: string,
    message: string,
    location?: SourceLocation,
    suggestion?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.location = location;
    this.suggestion = suggestion;

    // 保持正确的堆栈跟踪（仅在 V8 引擎中需要）
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /** 转换为 Diagnostic 格式 */
  toDiagnostic(): Diagnostic {
    return {
      severity: 'error',
      code: this.code,
      message: this.message,
      location: this.location,
      suggestion: this.suggestion,
    };
  }
}

// ============================================================
// 词法错误
// ============================================================

/** 词法分析错误 */
export class ISCLexerError extends ISCError {
  constructor(
    message: string,
    position: number,
    suggestion?: string
  ) {
    super(
      'ISC_LEXER_ERROR',
      message,
      { start: position, end: position + 1 },
      suggestion
    );
  }
}

/** 无效字符错误 */
export class ISCInvalidCharacterError extends ISCLexerError {
  constructor(char: string, position: number) {
    super(
      `Invalid character '${char}' at position ${position}`,
      position,
      'Remove the invalid character or check for typos in the expression.'
    );
  }
}

/** 未闭合的字符串错误 */
export class ISCUnterminatedStringError extends ISCLexerError {
  constructor(position: number, quote: string) {
    super(
      `Unterminated string literal starting at position ${position}`,
      position,
      `Add a closing '${quote}' to complete the string.`
    );
  }
}

/** 无效的数字格式错误 */
export class ISCInvalidNumberError extends ISCLexerError {
  constructor(value: string, position: number) {
    super(
      `Invalid number format '${value}' at position ${position}`,
      position,
      'Check the number format and remove any invalid characters.'
    );
  }
}

// ============================================================
// 语法错误
// ============================================================

/** 语法分析错误 */
export class ISCParserError extends ISCError {
  constructor(
    message: string,
    location: SourceLocation,
    suggestion?: string
  ) {
    super('ISC_PARSER_ERROR', message, location, suggestion);
  }
}

/** 不匹配的括号错误 */
export class ISCMismatchedParenthesisError extends ISCParserError {
  constructor(expected: '(' | ')' | '[' | ']', position: number) {
    const message = expected === '(' || expected === '['
      ? `Missing opening '${expected}'`
      : `Missing closing '${expected}'`;
    super(
      message,
      { start: position, end: position + 1 },
      `Add the missing '${expected}' to balance the expression.`
    );
  }
}

/** 意外的标记错误 */
export class ISCUnexpectedTokenError extends ISCParserError {
  constructor(expected: string, got: string, position: number) {
    super(
      `Expected ${expected}, but got '${got}'`,
      { start: position, end: position + 1 },
      `Check the expression syntax and ensure correct operator usage.`
    );
  }
}

/** 空表达式错误 */
export class ISCEmptyExpressionError extends ISCParserError {
  constructor() {
    super(
      'Empty expression',
      { start: 0, end: 0 },
      'Provide a valid expression to evaluate.'
    );
  }
}

/** 无效的操作符使用错误 */
export class ISCInvalidOperatorError extends ISCParserError {
  constructor(operator: string, position: number) {
    super(
      `Invalid use of operator '${operator}'`,
      { start: position, end: position + operator.length },
      'Check that the operator has valid operands on both sides.'
    );
  }
}

// ============================================================
// 求值错误
// ============================================================

/** 求值错误 */
export class ISCEvaluationError extends ISCError {
  constructor(
    message: string,
    location?: SourceLocation,
    suggestion?: string
  ) {
    super('ISC_EVALUATION_ERROR', message, location, suggestion);
  }
}

/** 未定义变量错误 */
export class ISCUndefinedVariableError extends ISCEvaluationError {
  constructor(variableName: string, location?: SourceLocation) {
    super(
      `Undefined variable '${variableName}'`,
      location,
      `Define '${variableName}' in the evaluation context or check for typos.`
    );
  }
}

/** 类型错误 */
export class ISCTypeError extends ISCEvaluationError {
  constructor(
    operation: string,
    expectedType: string,
    actualValue: unknown,
    location?: SourceLocation
  ) {
    const actualType = actualValue === null ? 'null' : typeof actualValue;
    super(
      `Type error in ${operation}: expected ${expectedType}, got ${actualType}`,
      location,
      `Ensure the operand is of type ${expectedType}.`
    );
  }
}

/** 除以零错误 */
export class ISCDivisionByZeroError extends ISCEvaluationError {
  constructor(location?: SourceLocation) {
    super(
      'Division by zero',
      location,
      'Check the divisor to ensure it is not zero.'
    );
  }
}

/** 属性访问错误 */
export class ISCPropertyAccessError extends ISCEvaluationError {
  constructor(
    object: unknown,
    property: string,
    location?: SourceLocation
  ) {
    const objType = object === null ? 'null' : typeof object;
    super(
      `Cannot access property '${property}' on ${objType}`,
      location,
      `Ensure the object has the property '${property}' or check for null/undefined values.`
    );
  }
}

// ============================================================
// 验证错误
// ============================================================

/** 验证错误 */
export class ISCValidationError extends ISCError {
  constructor(
    message: string,
    path?: string,
    location?: SourceLocation
  ) {
    super('ISC_VALIDATION_ERROR', message, location);
    // 存储路径在自定义属性中
    (this as any).path = path;
  }
}

/** 无效的表达式错误 */
export class ISCInvalidExpressionError extends ISCValidationError {
  constructor(expression: string, reason: string) {
    super(
      `Invalid expression '${expression}': ${reason}`,
      undefined,
      { start: 0, end: expression.length }
    );
  }
}

/** 循环依赖错误 */
export class ISCCircularDependencyError extends ISCValidationError {
  constructor(path: string[]) {
    super(
      `Circular dependency detected: ${path.join(' -> ')}`,
      path.join(' -> ')
    );
  }
}

// ============================================================
// 错误工厂函数
// ============================================================

/**
 * 创建错误诊断信息
 */
export function createDiagnostic(
  severity: 'error' | 'warning' | 'info',
  code: string,
  message: string,
  location?: SourceLocation,
  suggestion?: string
): Diagnostic {
  return {
    severity,
    code,
    message,
    location,
    suggestion,
  };
}

/**
 * 格式化错误位置为字符串
 */
export function formatLocation(location: SourceLocation): string {
  if (location.start_line !== undefined) {
    return `line ${location.start_line}, column ${location.start_column}`;
  }
  return `position ${location.start}`;
}

/**
 * 格式化错误消息
 */
export function formatError(error: ISCError, source?: string): string {
  let message = `[${error.code}] ${error.message}`;

  if (error.location) {
    message += ` at ${formatLocation(error.location)}`;

    // 如果提供了源代码，显示错误行
    if (source) {
      const { start, end } = error.location;
      const errorSegment = source.substring(start, end);
      if (errorSegment) {
        message += `\n  ${errorSegment}`;
      }
    }
  }

  if (error.suggestion) {
    message += `\n  Suggestion: ${error.suggestion}`;
  }

  return message;
}

/**
 * 判断是否为 ISC 错误
 */
export function isISCError(error: unknown): error is ISCError {
  return error instanceof ISCError;
}

/**
 * 将错误转换为诊断信息列表
 */
export function errorsToDiagnostics(errors: unknown[]): Diagnostic[] {
  return errors
    .filter(isISCError)
    .map(e => e.toDiagnostic());
}
