/**
 * Honeycomb DSL Compiler - 核心错误处理系统
 *
 * 提供统一的错误类型、错误码和错误处理机制。
 * 支持多语言错误消息、错误链追踪和修复建议。
 *
 * @module dsl/error-system
 */

// ============================================================
// 错误码枚举
// ============================================================

/**
 * DSL 编译器错误码
 *
 * 错误码格式：XXXNNN
 * - XXX: 错误类别前缀（3字母）
 * - NNN: 错误编号（3数字）
 */
export enum ErrorCode {
  // ============================================================
  // 语法错误 (SYX: 0xx)
  // ============================================================
  /** 未预期的 token */
  SYX001_UNEXPECTED_TOKEN = 'SYX001',
  /** 缺少必需的 token */
  SYX002_MISSING_TOKEN = 'SYX002',
  /** 无效的语法结构 */
  SYX003_INVALID_SYNTAX = 'SYX003',
  /** 不匹配的括号 */
  SYX004_MISMATCHED_BRACKETS = 'SYX004',
  /** 无效的标识符 */
  SYX005_INVALID_IDENTIFIER = 'SYX005',
  /** 缺少结构体结束符 */
  SYX006_MISSING_CLOSURE = 'SYX006',

  // ============================================================
  // 词法错误 (LEX: 1xx)
  // ============================================================
  /** 未闭合的字符串字面量 */
  LEX101_UNCLOSED_STRING = 'LEX101',
  /** 无效的转义序列 */
  LEX102_INVALID_ESCAPE = 'LEX102',
  /** 无效的数字格式 */
  LEX103_INVALID_NUMBER = 'LEX103',
  /** 不支持的字符 */
  LEX104_UNSUPPORTED_CHARACTER = 'LEX104',
  /** 未闭合的注释 */
  LEX105_UNCLOSED_COMMENT = 'LEX105',

  // ============================================================
  // 类型错误 (TYP: 2xx)
  // ============================================================
  /** 类型不匹配 */
  TYP201_TYPE_MISMATCH = 'TYP201',
  /** 未知类型 */
  TYP202_UNKNOWN_TYPE = 'TYP202',
  /** void 类型不允许在此上下文 */
  TYP203_VOID_NOT_ALLOWED = 'TYP203',
  /** 缺少类型注解 */
  TYP204_MISSING_TYPE_ANNOTATION = 'TYP204',
  /** 循环类型引用 */
  TYP205_CIRCULAR_TYPE_REFERENCE = 'TYP205',
  /** 类型参数数量不匹配 */
  TYP206_TYPE_ARGUMENT_COUNT_MISMATCH = 'TYP206',

  // ============================================================
  // 语义错误 (SEM: 3xx)
  // ============================================================
  /** 未定义的符号 */
  SEM301_UNDEFINED_SYMBOL = 'SEM301',
  /** 重复的声明 */
  SEM302_DUPLICATE_DECLARATION = 'SEM302',
  /** 循环依赖 */
  SEM303_CIRCULAR_DEPENDENCY = 'SEM303',
  /** 不可赋值的值 */
  SEM304_CANNOT_ASSIGN_TO = 'SEM304',
  /** 函数调用参数数量不匹配 */
  SEM305_ARGUMENT_COUNT_MISMATCH = 'SEM305',
  /** 非法的属性访问 */
  SEM306_INVALID_PROPERTY_ACCESS = 'SEM306',
  /** 作用域错误 */
  SEM307_SCOPE_ERROR = 'SEM307',

  // ============================================================
  // 编译错误 (COM: 4xx)
  // ============================================================
  /** 代码生成失败 */
  COM401_CODE_GENERATION_FAILED = 'COM401',
  /** 缺少输出 */
  COM402_MISSING_OUTPUT = 'COM402',
  /** 无效的编译目标 */
  COM403_INVALID_TARGET = 'COM403',
  /** 编译选项冲突 */
  COM404_OPTION_CONFLICT = 'COM404',

  // ============================================================
  // 运行时错误 (RUN: 5xx)
  // ============================================================
  /** 执行失败 */
  RUN501_EXECUTION_FAILED = 'RUN501',
  /** 执行超时 */
  RUN502_TIMEOUT = 'RUN502',
  /** 堆栈溢出 */
  RUN503_STACK_OVERFLOW = 'RUN503',
  /** 堆栈深度超出 */
  RUN506_STACK_DEPTH_EXCEEDED = 'RUN506',
  /** 内存不足 */
  RUN504_OUT_OF_MEMORY = 'RUN504',
  /** 未处理的异常 */
  RUN505_UNHANDLED_EXCEPTION = 'RUN505',

  // ============================================================
  // 警告 (WAR: 6xx)
  // ============================================================
  /** 已弃用的功能 */
  WAR601_DEPRECATED_FEATURE = 'WAR601',
  /** 未使用的变量 */
  WAR602_UNUSED_VARIABLE = 'WAR602',
  /** 隐式的 any 类型 */
  WAR603_IMPLICIT_ANY = 'WAR603',
  /** 无法到达的代码 */
  WAR604_UNREACHABLE_CODE = 'WAR604',
  /** 空块 */
  WAR605_EMPTY_BLOCK = 'WAR605',

  // ============================================================
  // I/O 错误 (IO: 7xx)
  // ============================================================
  /** 文件未找到 */
  IO701_FILE_NOT_FOUND = 'IO701',
  /** 文件读取失败 */
  IO702_READ_FAILED = 'IO702',
  /** 文件写入失败 */
  IO703_WRITE_FAILED = 'IO703',
  /** 无效的文件路径 */
  IO704_INVALID_PATH = 'IO704',
}

// ============================================================
// 错误严重级别
// ============================================================

/**
 * 错误严重级别
 */
export enum ErrorSeverity {
  /** 错误 - 阻止编译继续 */
  ERROR = 'error',
  /** 警告 - 不阻止编译但需要关注 */
  WARNING = 'warning',
  /** 信息 - 提示性消息 */
  INFO = 'info',
}

// ============================================================
// 源码位置
// ============================================================

/**
 * 源码位置信息
 */
export interface SourceLocation {
  /** 文件路径 */
  file: string;
  /** 行号（从 1 开始） */
  line: number;
  /** 列号（从 1 开始） */
  column: number;
  /** 源码长度（可选） */
  length?: number;
  /** 源码片段（可选，用于错误上下文） */
  snippet?: string;
}

// ============================================================
// 错误上下文
// ============================================================

/**
 * 错误上下文
 *
 * 用于携带额外的诊断信息。
 */
export interface ErrorContext {
  [key: string]: unknown;
}

// ============================================================
// 本地化消息
// ============================================================

/**
 * 本地化消息类
 *
 * 支持中英文双语错误消息。
 */
export class LocalizedMessage {
  constructor(
    private en: string,
    private zh: string,
    private params?: Record<string, string | number>
  ) {}

  /**
   * 获取本地化消息
   *
   * @param lang - 语言（'en' 或 'zh'，默认 'zh'）
   * @returns 格式化后的消息
   */
  toString(lang: 'en' | 'zh' = 'zh'): string {
    const template = lang === 'zh' ? this.zh : this.en;
    if (!this.params) {
      return template;
    }

    // 替换 {{key}} 占位符
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return String(this.params?.[key] ?? `{{${key}}}`);
    });
  }

  /**
   * 获取英文消息
   */
  getEnglish(): string {
    return this.toString('en');
  }

  /**
   * 获取中文消息
   */
  getChinese(): string {
    return this.toString('zh');
  }

  /**
   * 创建带参数的本地化消息
   *
   * @param params - 参数映射
   * @returns 新的 LocalizedMessage 实例
   */
  withParams(params: Record<string, string | number>): LocalizedMessage {
    return new LocalizedMessage(this.en, this.zh, { ...this.params, ...params });
  }

  /**
   * 静态工厂方法：创建简单的本地化消息
   */
  static create(en: string, zh: string): LocalizedMessage {
    return new LocalizedMessage(en, zh);
  }

  /**
   * 静态工厂方法：创建带参数的本地化消息
   */
  static withParams(
    en: string,
    zh: string,
    params: Record<string, string | number>
  ): LocalizedMessage {
    return new LocalizedMessage(en, zh, params);
  }
}

// ============================================================
// 修复建议
// ============================================================

/**
 * 修复建议类型
 */
export type FixActionType = 'replace' | 'insert' | 'delete' | 'rename';

/**
 * 修复建议
 *
 * 提供自动修复或手动修复的提示。
 */
export interface FixSuggestion {
  /** 修复建议消息 */
  message: LocalizedMessage;
  /** 修复动作类型 */
  action?: FixActionType;
  /** 修复位置 */
  location?: SourceLocation;
  /** 替换内容（用于 replace 动作） */
  replacement?: string;
  /** 优先级（1-10，数字越大优先级越高） */
  priority?: number;
}

// ============================================================
// DSL 错误基类
// ============================================================

/**
 * DSL 错误基类
 *
 * 所有 DSL 编译器错误的基类。
 */
export abstract class DSLError extends Error {
  /** 错误码 */
  public readonly code: ErrorCode;

  /** 严重级别 */
  public readonly severity: ErrorSeverity;

  /** 源码位置 */
  public readonly loc: SourceLocation;

  /** 错误上下文 */
  public readonly context: ErrorContext;

  /** 导致此错误的根本原因（错误链） */
  public readonly causedBy?: DSLError;

  /** 修复建议列表 */
  public readonly suggestions: FixSuggestion[];

  /** 错误消息（本地化） */
  protected readonly messageObj: LocalizedMessage;

  /**
   * 构造 DSL 错误
   *
   * @param code - 错误码
   * @param message - 本地化错误消息
   * @param severity - 严重级别
   * @param loc - 源码位置
   * @param context - 错误上下文
   * @param causedBy - 根本原因错误
   */
  constructor(
    code: ErrorCode,
    message: LocalizedMessage,
    severity: ErrorSeverity,
    loc: SourceLocation,
    context: ErrorContext = {},
    causedBy?: DSLError
  ) {
    super(message.toString());
    this.code = code;
    this.severity = severity;
    this.loc = loc;
    this.context = context;
    this.causedBy = causedBy;
    this.suggestions = [];
    this.messageObj = message;
    this.name = this.constructor.name;

    // 维护正确的原型链
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * 添加修复建议
   *
   * @param suggestion - 修复建议
   * @returns this（支持链式调用）
   */
  addSuggestion(suggestion: FixSuggestion): this {
    this.suggestions.push(suggestion);
    return this;
  }

  /**
   * 添加多个修复建议
   *
   * @param suggestions - 修复建议数组
   * @returns this（支持链式调用）
   */
  addSuggestions(suggestions: FixSuggestion[]): this {
    this.suggestions.push(...suggestions);
    return this;
  }

  /**
   * 获取格式化的错误消息
   *
   * @param lang - 语言（'en' 或 'zh'，默认 'zh'）
   * @returns 格式化的错误字符串
   */
  toString(lang: 'en' | 'zh' = 'zh'): string {
    const parts: string[] = [];

    // 基础错误信息
    parts.push(`[${this.code}] ${this.messageObj.toString(lang)}`);
    parts.push(`  位置: ${this.loc.file}:${this.loc.line}:${this.loc.column}`);

    // 添加上下文信息
    if (Object.keys(this.context).length > 0) {
      const contextStr = Object.entries(this.context)
        .map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`)
        .join('\n');
      parts.push(`  上下文:\n${contextStr}`);
    }

    // 添加根本原因（错误链）
    if (this.causedBy) {
      parts.push(`  由以下错误引起:\n    ${this.causedBy.toString(lang).replace(/\n/g, '\n    ')}`);
    }

    // 添加修复建议
    if (this.suggestions.length > 0) {
      const sortedSuggestions = [...this.suggestions].sort(
        (a, b) => (b.priority ?? 5) - (a.priority ?? 5)
      );
      const suggestionStr = sortedSuggestions
        .map((s, i) => `  ${i + 1}. ${s.message.toString(lang)}`)
        .join('\n');
      parts.push(`  修复建议:\n${suggestionStr}`);
    }

    return parts.join('\n');
  }

  /**
   * 获取简短的错误消息（一行）
   *
   * @param lang - 语言
   * @returns 简短错误消息
   */
  toShortString(lang: 'en' | 'zh' = 'zh'): string {
    return `[${this.code}] ${this.messageObj.toString(lang)} at ${this.loc.file}:${this.loc.line}:${this.loc.column}`;
  }

  /**
   * 检查是否为错误级别
   */
  isError(): boolean {
    return this.severity === ErrorSeverity.ERROR;
  }

  /**
   * 检查是否为警告级别
   */
  isWarning(): boolean {
    return this.severity === ErrorSeverity.WARNING;
  }

  /**
   * 获取完整错误链
   *
   * @returns 从根错误到当前错误的数组
   */
  getErrorChain(): DSLError[] {
    const chain: DSLError[] = [this];
    let current = this.causedBy;
    while (current) {
      chain.unshift(current);
      current = current.causedBy;
    }
    return chain;
  }
}

// ============================================================
// 具体错误类
// ============================================================

/**
 * 语法错误
 *
 * 表示源代码的语法结构不正确。
 */
export class SyntaxError extends DSLError {
  constructor(
    code: ErrorCode,
    message: LocalizedMessage,
    loc: SourceLocation,
    context?: ErrorContext,
    causedBy?: DSLError
  ) {
    super(code, message, ErrorSeverity.ERROR, loc, context, causedBy);
  }

  /**
   * 创建"未预期 token"错误
   */
  static unexpectedToken(
    unexpected: string,
    expected: string[],
    loc: SourceLocation
  ): SyntaxError {
    const error = new SyntaxError(
      ErrorCode.SYX001_UNEXPECTED_TOKEN,
      LocalizedMessage.withParams(
        `Unexpected token '{{token}}', expected {{expected}}`,
        `未预期的 token '{{token}}'，期望 {{expected}}`,
        { token: unexpected, expected: expected.join(' 或 ') }
      ),
      loc
    );
    error.addSuggestion({
      message: LocalizedMessage.withParams(
        `Replace '{{token}}' with one of: {{expected}}`,
        `将 '{{token}}' 替换为以下之一: {{expected}}`,
        { token: unexpected, expected: expected.join(' 或 ') }
      ),
      action: 'replace',
      location: loc,
      priority: 10,
    });
    return error;
  }

  /**
   * 创建"缺少 token"错误
   */
  static missingToken(
    missing: string,
    loc: SourceLocation
  ): SyntaxError {
    const error = new SyntaxError(
      ErrorCode.SYX002_MISSING_TOKEN,
      LocalizedMessage.withParams(
        `Missing '{{token}}'`,
        `缺少 '{{token}}'`,
        { token: missing }
      ),
      loc
    );
    error.addSuggestion({
      message: LocalizedMessage.withParams(
        `Add '{{token}}' at this position`,
        `在此位置添加 '{{token}}'`,
        { token: missing }
      ),
      action: 'insert',
      location: loc,
      priority: 10,
    });
    return error;
  }
}

/**
 * 词法错误
 *
 * 表示源代码的词法分析失败。
 */
export class LexicalError extends DSLError {
  constructor(
    code: ErrorCode,
    message: LocalizedMessage,
    loc: SourceLocation,
    context?: ErrorContext,
    causedBy?: DSLError
  ) {
    super(code, message, ErrorSeverity.ERROR, loc, context, causedBy);
  }

  /**
   * 创建"未闭合字符串"错误
   */
  static unclosedString(
    loc: SourceLocation
  ): LexicalError {
    const error = new LexicalError(
      ErrorCode.LEX101_UNCLOSED_STRING,
      LocalizedMessage.create(
        'Unclosed string literal',
        '未闭合的字符串字面量'
      ),
      loc
    );
    error.addSuggestion({
      message: LocalizedMessage.create(
        'Add closing quote (" or \')',
        '添加闭合引号 (" 或 \')'
      ),
      action: 'insert',
      location: loc,
      priority: 10,
    });
    return error;
  }

  /**
   * 创建"无效转义序列"错误
   */
  static invalidEscape(
    escape: string,
    loc: SourceLocation
  ): LexicalError {
    return new LexicalError(
      ErrorCode.LEX102_INVALID_ESCAPE,
      LocalizedMessage.withParams(
        `Invalid escape sequence '{{escape}}'`,
        `无效的转义序列 '{{escape}}'`,
        { escape }
      ),
      loc
    );
  }
}

/**
 * 类型错误
 *
 * 表示类型不匹配或类型相关的错误。
 */
export class TypeError extends DSLError {
  /** 期望的类型 */
  public readonly expectedType: string;

  /** 实际的类型 */
  public readonly actualType: string;

  constructor(
    code: ErrorCode,
    message: LocalizedMessage,
    loc: SourceLocation,
    expectedType: string,
    actualType: string,
    context?: ErrorContext,
    causedBy?: DSLError
  ) {
    super(code, message, ErrorSeverity.ERROR, loc, context, causedBy);
    this.expectedType = expectedType;
    this.actualType = actualType;
  }

  /**
   * 创建"类型不匹配"错误
   */
  static typeMismatch(
    expected: string,
    actual: string,
    loc: SourceLocation
  ): TypeError {
    const error = new TypeError(
      ErrorCode.TYP201_TYPE_MISMATCH,
      LocalizedMessage.withParams(
        `Type mismatch: expected '{{expected}}', got '{{actual}}'`,
        `类型不匹配：期望 '{{expected}}'，实际 '{{actual}}'`,
        { expected, actual }
      ),
      loc,
      expected,
      actual
    );
    error.addSuggestion({
      message: LocalizedMessage.withParams(
        `Change the type to {{expected}}`,
        `将类型更改为 {{expected}}`,
        { expected }
      ),
      action: 'replace',
      location: loc,
      priority: 8,
    });
    return error;
  }

  /**
   * 创建"void 类型不允许"错误
   */
  static voidNotAllowed(
    context: string,
    loc: SourceLocation
  ): TypeError {
    return new TypeError(
      ErrorCode.TYP203_VOID_NOT_ALLOWED,
      LocalizedMessage.withParams(
        `void type is not allowed in {{context}}`,
        `void 类型不允许在 {{context}} 中使用`,
        { context }
      ),
      loc,
      'non-void',
      'void'
    );
  }

  /**
   * 创建"未知类型"错误
   */
  static unknownType(
    typeName: string,
    loc: SourceLocation
  ): TypeError {
    const error = new TypeError(
      ErrorCode.TYP202_UNKNOWN_TYPE,
      LocalizedMessage.withParams(
        `Unknown type '{{type}}'`,
        `未知类型 '{{type}}'`,
        { type: typeName }
      ),
      loc,
      'known type',
      typeName
    );
    error.addSuggestion({
      message: LocalizedMessage.withParams(
        `Check if '{{type}}' is defined or imported`,
        `检查 '{{type}}' 是否已定义或导入`,
        { type: typeName }
      ),
      priority: 7,
    });
    return error;
  }
}

/**
 * 语义错误
 *
 * 表示语义分析阶段发现的错误。
 */
export class SemanticError extends DSLError {
  constructor(
    code: ErrorCode,
    message: LocalizedMessage,
    loc: SourceLocation,
    context?: ErrorContext,
    causedBy?: DSLError
  ) {
    super(code, message, ErrorSeverity.ERROR, loc, context, causedBy);
  }

  /**
   * 创建"未定义符号"错误
   */
  static undefinedSymbol(
    symbolName: string,
    loc: SourceLocation
  ): SemanticError {
    const error = new SemanticError(
      ErrorCode.SEM301_UNDEFINED_SYMBOL,
      LocalizedMessage.withParams(
        `Undefined symbol: '{{symbol}}'`,
        `未定义的符号：'{{symbol}}'`,
        { symbol: symbolName }
      ),
      loc
    );
    error.addSuggestion({
      message: LocalizedMessage.withParams(
        `Declare or import '{{symbol}}' before use`,
        `在使用前声明或导入 '{{symbol}}'`,
        { symbol: symbolName }
      ),
      priority: 9,
    });
    return error;
  }

  /**
   * 创建"重复声明"错误
   */
  static duplicateDeclaration(
    symbolName: string,
    firstLoc: SourceLocation,
    loc: SourceLocation
  ): SemanticError {
    const error = new SemanticError(
      ErrorCode.SEM302_DUPLICATE_DECLARATION,
      LocalizedMessage.withParams(
        `Duplicate declaration of '{{symbol}}'. First declared at {{firstLine}}:{{firstColumn}}`,
        `重复声明 '{{symbol}}'。首次声明位于 {{firstLine}}:{{firstColumn}}`,
        {
          symbol: symbolName,
          firstLine: firstLoc.line,
          firstColumn: firstLoc.column,
        }
      ),
      loc,
      { firstDeclaration: firstLoc }
    );
    error.addSuggestion({
      message: LocalizedMessage.withParams(
        `Rename one of the declarations of '{{symbol}}'`,
        `重命名其中一个 '{{symbol}}' 声明`,
        { symbol: symbolName }
      ),
      action: 'rename',
      location: loc,
      priority: 8,
    });
    return error;
  }

  /**
   * 创建"循环依赖"错误
   */
  static circularDependency(
    cycle: string[],
    loc: SourceLocation
  ): SemanticError {
    return new SemanticError(
      ErrorCode.SEM303_CIRCULAR_DEPENDENCY,
      LocalizedMessage.withParams(
        `Circular dependency detected: {{cycle}}`,
        `检测到循环依赖：{{cycle}}`,
        { cycle: cycle.join(' -> ') }
      ),
      loc,
      { cycle }
    );
  }
}

/**
 * 编译错误
 *
 * 表示代码生成阶段的错误。
 */
export class CompilationError extends DSLError {
  constructor(
    code: ErrorCode,
    message: LocalizedMessage,
    loc: SourceLocation,
    context?: ErrorContext,
    causedBy?: DSLError
  ) {
    super(code, message, ErrorSeverity.ERROR, loc, context, causedBy);
  }

  /**
   * 创建"代码生成失败"错误
   */
  static codeGenerationFailed(
    reason: string,
    loc: SourceLocation
  ): CompilationError {
    return new CompilationError(
      ErrorCode.COM401_CODE_GENERATION_FAILED,
      LocalizedMessage.withParams(
        `Code generation failed: {{reason}}`,
        `代码生成失败：{{reason}}`,
        { reason }
      ),
      loc
    );
  }
}

/**
 * 运行时错误
 *
 * 表示执行阶段的错误。
 */
export class RuntimeError extends DSLError {
  constructor(
    code: ErrorCode,
    message: LocalizedMessage,
    loc: SourceLocation,
    context?: ErrorContext,
    causedBy?: DSLError
  ) {
    super(code, message, ErrorSeverity.ERROR, loc, context, causedBy);
  }

  /**
   * 创建"执行失败"错误
   */
  static executionFailed(
    reason: string,
    loc: SourceLocation
  ): RuntimeError {
    return new RuntimeError(
      ErrorCode.RUN501_EXECUTION_FAILED,
      LocalizedMessage.withParams(
        `Execution failed: {{reason}}`,
        `执行失败：{{reason}}`,
        { reason }
      ),
      loc
    );
  }

  /**
   * 创建"堆栈深度超出"错误
   *
   * 当 DSL 语句嵌套深度超过限制时抛出此错误。
   *
   * @param currentDepth - 当前嵌套深度
   * @param maxDepth - 最大允许深度
   * @param loc - 源码位置
   * @returns RuntimeError 实例
   */
  static stackDepthExceeded(
    currentDepth: number,
    maxDepth: number,
    loc: SourceLocation = { file: '<unknown>', line: 1, column: 1 }
  ): RuntimeError {
    return new RuntimeError(
      ErrorCode.RUN506_STACK_DEPTH_EXCEEDED,
      LocalizedMessage.withParams(
        `Stack depth exceeded: {{depth}} >= {{max}}. Maximum nesting depth reached.`,
        `堆栈深度超出：{{depth}} >= {{max}}。已达到最大嵌套深度。`,
        { depth: String(currentDepth), max: String(maxDepth) }
      ),
      loc,
      { currentDepth, maxDepth }
    );
  }
}

/**
 * I/O 错误
 *
 * 表示文件输入输出相关的错误。
 */
export class IOError extends DSLError {
  constructor(
    code: ErrorCode,
    message: LocalizedMessage,
    loc: SourceLocation,
    context?: ErrorContext,
    causedBy?: DSLError
  ) {
    super(code, message, ErrorSeverity.ERROR, loc, context, causedBy);
  }

  /**
   * 创建"文件未找到"错误
   */
  static fileNotFound(
    filepath: string
  ): IOError {
    return new IOError(
      ErrorCode.IO701_FILE_NOT_FOUND,
      LocalizedMessage.withParams(
        `File not found: {{path}}`,
        `文件未找到：{{path}}`,
        { path: filepath }
      ),
      { file: filepath, line: 1, column: 1 }
    );
  }

  /**
   * 创建"文件读取失败"错误
   */
  static readFailed(
    filepath: string,
    reason: string
  ): IOError {
    return new IOError(
      ErrorCode.IO702_READ_FAILED,
      LocalizedMessage.withParams(
        `Failed to read file {{path}}: {{reason}}`,
        `读取文件 {{path}} 失败：{{reason}}`,
        { path: filepath, reason }
      ),
      { file: filepath, line: 1, column: 1 }
    );
  }
}

/**
 * 编译警告
 *
 * 表示非致命的警告信息。
 */
export class CompilationWarning extends DSLError {
  constructor(
    code: ErrorCode,
    message: LocalizedMessage,
    loc: SourceLocation,
    context?: ErrorContext
  ) {
    super(code, message, ErrorSeverity.WARNING, loc, context);
  }

  /**
   * 创建"未使用变量"警告
   */
  static unusedVariable(
    variableName: string,
    loc: SourceLocation
  ): CompilationWarning {
    return new CompilationWarning(
      ErrorCode.WAR602_UNUSED_VARIABLE,
      LocalizedMessage.withParams(
        `Unused variable '{{variable}}'`,
        `未使用的变量 '{{variable}}'`,
        { variable: variableName }
      ),
      loc
    );
  }

  /**
   * 创建"隐式 any 类型"警告
   */
  static implicitAny(
    symbolName: string,
    loc: SourceLocation
  ): CompilationWarning {
    const warning = new CompilationWarning(
      ErrorCode.WAR603_IMPLICIT_ANY,
      LocalizedMessage.withParams(
        `Implicit 'any' type for '{{symbol}}'`,
        `'{{symbol}}' 具有隐式的 'any' 类型`,
        { symbol: symbolName }
      ),
      loc
    );
    warning.addSuggestion({
      message: LocalizedMessage.withParams(
        `Add type annotation for '{{symbol}}'`,
        `为 '{{symbol}}' 添加类型注解`,
        { symbol: symbolName }
      ),
      priority: 5,
    });
    return warning;
  }

  /**
   * 创建"已弃用功能"警告
   */
  static deprecatedFeature(
    featureName: string,
    loc: SourceLocation,
    replacement?: string
  ): CompilationWarning {
    const warning = new CompilationWarning(
      ErrorCode.WAR601_DEPRECATED_FEATURE,
      LocalizedMessage.withParams(
        `'{{feature}}' is deprecated{{replacement}}. Please update your code.`,
        `'{{feature}}' 已弃用{{replacement}}。请更新您的代码。`,
        {
          feature: featureName,
          replacement: replacement ? `, use '${replacement}' instead` : '',
        }
      ),
      loc
    );
    if (replacement) {
      warning.addSuggestion({
        message: LocalizedMessage.withParams(
          `Replace '{{feature}}' with '{{replacement}}'`,
          `将 '{{feature}}' 替换为 '{{replacement}}'`,
          { feature: featureName, replacement }
        ),
        action: 'replace',
        location: loc,
        priority: 6,
      });
    }
    return warning;
  }
}

// ============================================================
// 错误收集器
// ============================================================

/**
 * 错误收集器
 *
 * 用于收集和管理多个错误和警告。
 */
export class ErrorCollector {
  /** 错误列表 */
  private errors: DSLError[] = [];

  /** 警告列表 */
  private warnings: DSLError[] = [];

  /**
   * 添加错误
   */
  addError(error: DSLError): void {
    if (error.isWarning()) {
      this.warnings.push(error);
    } else {
      this.errors.push(error);
    }
  }

  /**
   * 添加多个错误
   */
  addErrors(errors: DSLError[]): void {
    for (const error of errors) {
      this.addError(error);
    }
  }

  /**
   * 获取所有错误
   */
  getErrors(): DSLError[] {
    return [...this.errors];
  }

  /**
   * 获取所有警告
   */
  getWarnings(): DSLError[] {
    return [...this.warnings];
  }

  /**
   * 获取所有错误和警告
   */
  getAll(): DSLError[] {
    return [...this.errors, ...this.warnings];
  }

  /**
   * 检查是否有错误
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * 检查是否有警告
   */
  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }

  /**
   * 获取错误数量
   */
  get errorCount(): number {
    return this.errors.length;
  }

  /**
   * 获取警告数量
   */
  get warningCount(): number {
    return this.warnings.length;
  }

  /**
   * 清空所有错误和警告
   */
  clear(): void {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * 格式化所有错误和警告
   *
   * @param lang - 语言
   * @returns 格式化的错误字符串
   */
  format(lang: 'en' | 'zh' = 'zh'): string {
    const parts: string[] = [];

    if (this.hasErrors()) {
      parts.push(`=== Errors (${this.errorCount}) ===`);
      for (const error of this.errors) {
        parts.push(error.toString(lang));
        parts.push('---');
      }
    }

    if (this.hasWarnings()) {
      parts.push(`=== Warnings (${this.warningCount}) ===`);
      for (const warning of this.warnings) {
        parts.push(warning.toString(lang));
        parts.push('---');
      }
    }

    if (!this.hasErrors() && !this.hasWarnings()) {
      parts.push(lang === 'zh' ? '无错误或警告' : 'No errors or warnings');
    }

    return parts.join('\n');
  }
}

// ============================================================
// 错误工厂函数
// ============================================================

/**
 * 创建源码位置
 */
export function createSourceLocation(
  file: string,
  line: number,
  column: number,
  length?: number
): SourceLocation {
  return { file, line, column, length };
}

/**
 * 格式化源码位置
 */
export function formatSourceLocation(loc: SourceLocation): string {
  return `${loc.file}:${loc.line}:${loc.column}`;
}

/**
 * 判断错误码是否为语法错误
 */
export function isSyntaxError(code: ErrorCode): boolean {
  return code.startsWith('SYX') || code.startsWith('LEX');
}

/**
 * 判断错误码是否为类型错误
 */
export function isTypeError(code: ErrorCode): boolean {
  return code.startsWith('TYP');
}

/**
 * 判断错误码是否为语义错误
 */
export function isSemanticError(code: ErrorCode): boolean {
  return code.startsWith('SEM');
}

/**
 * 判断错误码是否为编译错误
 */
export function isCompilationError(code: ErrorCode): boolean {
  return code.startsWith('COM');
}

/**
 * 判断错误码是否为运行时错误
 */
export function isRuntimeError(code: ErrorCode): boolean {
  return code.startsWith('RUN');
}

/**
 * 判断错误码是否为警告
 */
export function isWarning(code: ErrorCode): boolean {
  return code.startsWith('WAR');
}

// ============================================================
// 错误恢复和追踪系统
// ============================================================

// ------------------------------------------------------------
// 恢复策略枚举
// ------------------------------------------------------------

/**
 * 错误恢复策略
 *
 * 定义编译器在遇到错误时可以采取的恢复策略。
 */
export enum RecoveryStrategy {
  /** 跳过当前 token */
  SKIP = 'skip',
  /** 插入缺失的 token */
  INSERT = 'insert',
  /** 假设预期的结构 */
  ASSUME = 'assume',
  /** 替换错误的 token */
  REPLACE = 'replace',
  /** 重试操作 */
  RETRY = 'retry',
}

// ------------------------------------------------------------
// 恢复点
// ------------------------------------------------------------

/**
 * 错误恢复点
 *
 * 定义编译过程中可以尝试从错误恢复的位置和策略。
 */
export interface RecoveryPoint {
  /** 恢复点唯一标识符 */
  id: string;
  /** 恢复点描述 */
  description: string;
  /** 恢复点位置 */
  location: SourceLocation;
  /** 恢复策略 */
  strategy: RecoveryStrategy;
  /** 判断是否可以从此恢复点恢复 */
  canRecover: (error: MinimalDSLError) => boolean;
  /** 执行恢复操作 */
  recover: () => void;
}

/**
 * 简化的错误接口（用于恢复点判断）
 */
interface MinimalDSLError {
  kind: 'syntax' | 'type' | 'semantic';
  message: string;
  loc: SourceLocation;
  code?: string;
}

// ------------------------------------------------------------
// 错误恢复管理器
// ------------------------------------------------------------

/**
 * 错误恢复管理器
 *
 * 管理编译过程中的错误恢复点，在遇到错误时尝试恢复。
 */
export class ErrorRecoveryManager {
  /** 注册的恢复点 */
  private recoveryPoints: Map<string, RecoveryPoint> = new Map();
  /** 恢复尝试次数 */
  private recoveryAttempts: number = 0;
  /** 最大恢复尝试次数 */
  private maxRecoveryAttempts: number = 10;
  /** 恢复历史记录 */
  private recoveryHistory: RecoveryHistoryEntry[] = [];

  /**
   * 注册恢复点
   *
   * @param point - 恢复点定义
   */
  registerRecoveryPoint(point: RecoveryPoint): void {
    this.recoveryPoints.set(point.id, point);
  }

  /**
   * 批量注册恢复点
   *
   * @param points - 恢复点数组
   */
  registerRecoveryPoints(points: RecoveryPoint[]): void {
    for (const point of points) {
      this.registerRecoveryPoint(point);
    }
  }

  /**
   * 取消注册恢复点
   *
   * @param pointId - 恢复点 ID
   */
  unregisterRecoveryPoint(pointId: string): void {
    this.recoveryPoints.delete(pointId);
  }

  /**
   * 尝试从错误恢复
   *
   * 遍历所有注册的恢复点，找到第一个可以处理该错误的恢复点并执行恢复。
   *
   * @param error - 发生的错误
   * @returns 如果成功恢复返回 true，否则返回 false
   */
  tryRecover(error: MinimalDSLError): boolean {
    // 检查恢复尝试次数限制
    if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
      return false;
    }

    this.recoveryAttempts++;

    // 遍历所有恢复点
    for (const point of this.recoveryPoints.values()) {
      if (point.canRecover(error)) {
        // 记录恢复历史
        this.recoveryHistory.push({
          timestamp: Date.now(),
          error,
          recoveryPoint: point.id,
          strategy: point.strategy,
          success: true,
        });

        // 执行恢复
        point.recover();
        return true;
      }
    }

    // 没有找到合适的恢复点
    this.recoveryHistory.push({
      timestamp: Date.now(),
      error,
      recoveryPoint: 'none',
      strategy: RecoveryStrategy.SKIP,
      success: false,
    });

    return false;
  }

  /**
   * 重置恢复尝试计数器
   */
  reset(): void {
    this.recoveryAttempts = 0;
  }

  /**
   * 清除所有恢复点
   */
  clear(): void {
    this.recoveryPoints.clear();
    this.reset();
    this.recoveryHistory = [];
  }

  /**
   * 获取恢复历史记录
   */
  getHistory(): readonly RecoveryHistoryEntry[] {
    return this.recoveryHistory;
  }

  /**
   * 获取恢复统计信息
   */
  getStats(): RecoveryStats {
    const successful = this.recoveryHistory.filter(h => h.success).length;
    const failed = this.recoveryHistory.length - successful;

    // 按策略分组统计
    const byStrategy: Record<RecoveryStrategy, number> = {
      [RecoveryStrategy.SKIP]: 0,
      [RecoveryStrategy.INSERT]: 0,
      [RecoveryStrategy.ASSUME]: 0,
      [RecoveryStrategy.REPLACE]: 0,
      [RecoveryStrategy.RETRY]: 0,
    };

    for (const entry of this.recoveryHistory) {
      byStrategy[entry.strategy]++;
    }

    return {
      totalAttempts: this.recoveryHistory.length,
      successfulRecoveries: successful,
      failedRecoveries: failed,
      currentAttempts: this.recoveryAttempts,
      maxAttempts: this.maxRecoveryAttempts,
      byStrategy,
    };
  }

  /**
   * 设置最大恢复尝试次数
   *
   * @param max - 最大尝试次数
   */
  setMaxRecoveryAttempts(max: number): void {
    if (max <= 0) {
      throw new Error('Max recovery attempts must be positive');
    }
    this.maxRecoveryAttempts = max;
  }

  /**
   * 检查是否可以继续尝试恢复
   */
  canRecover(): boolean {
    return this.recoveryAttempts < this.maxRecoveryAttempts;
  }

  /**
   * 获取注册的恢复点数量
   */
  get recoveryPointCount(): number {
    return this.recoveryPoints.size;
  }
}

/**
 * 恢复历史条目
 */
interface RecoveryHistoryEntry {
  /** 时间戳 */
  timestamp: number;
  /** 触发的错误 */
  error: MinimalDSLError;
  /** 使用的恢复点 ID */
  recoveryPoint: string;
  /** 使用的恢复策略 */
  strategy: RecoveryStrategy;
  /** 恢复是否成功 */
  success: boolean;
}

/**
 * 恢复统计信息
 */
export interface RecoveryStats {
  /** 总尝试次数 */
  totalAttempts: number;
  /** 成功恢复次数 */
  successfulRecoveries: number;
  /** 失败恢复次数 */
  failedRecoveries: number;
  /** 当前尝试次数 */
  currentAttempts: number;
  /** 最大尝试次数 */
  maxAttempts: number;
  /** 按策略分组的统计 */
  byStrategy: Record<RecoveryStrategy, number>;
}

// ------------------------------------------------------------
// 编译追踪 Span
// ------------------------------------------------------------

/**
 * 编译追踪 Span
 *
 * 表示编译过程中的一个操作单元，用于分布式追踪和性能分析。
 */
export interface CompilationSpan {
  /** 追踪 ID（关联整个编译过程） */
  traceId: string;
  /** 父 Span ID（用于构建追踪树） */
  parentSpanId?: string;
  /** 当前 Span ID */
  spanId: string;
  /** 操作名称 */
  operationName: string;
  /** 开始时间（毫秒时间戳） */
  startTime: number;
  /** 结束时间（毫秒时间戳） */
  endTime?: number;
  /** 操作位置 */
  location?: SourceLocation;
  /** 标签（用于附加元数据） */
  tags?: Record<string, string | number | boolean>;
  /** 关联的错误 */
  error?: MinimalDSLError;
}

// ------------------------------------------------------------
// 编译追踪器
// ------------------------------------------------------------

/**
 * 编译追踪器
 *
 * 管理编译过程中的分布式追踪，提供性能分析和问题诊断能力。
 */
export class CompilationTracer {
  /** 所有 Span */
  private spans: Map<string, CompilationSpan> = new Map();
  /** 当前活动 Span ID */
  private currentSpanId?: string;
  /** Trace ID 计数器 */
  private traceIdCounter: number = 0;
  /** Span ID 计数器 */
  private spanIdCounter: number = 0;
  /** 当前追踪 ID */
  private currentTraceId?: string;

  /**
   * 生成新的 Trace ID
   *
   * @returns 新的 Trace ID
   */
  generateTraceId(): string {
    return `trace-${Date.now()}-${this.traceIdCounter++}`;
  }

  /**
   * 开始新的追踪会话
   *
   * @returns 新的 Trace ID
   */
  startTrace(): string {
    this.currentTraceId = this.generateTraceId();
    this.currentSpanId = undefined;
    return this.currentTraceId;
  }

  /**
   * 结束当前追踪会话
   */
  endTrace(): void {
    this.currentTraceId = undefined;
    this.currentSpanId = undefined;
  }

  /**
   * 生成新的 Span ID
   */
  private generateSpanId(): string {
    return `span-${Date.now()}-${this.spanIdCounter++}`;
  }

  /**
   * 开始一个新的 Span
   *
   * @param operationName - 操作名称
   * @param location - 操作位置
   * @param tags - 标签
   * @returns 新 Span 的 ID
   */
  startSpan(
    operationName: string,
    location?: SourceLocation,
    tags?: Record<string, string | number | boolean>
  ): string {
    // 如果没有当前追踪，自动开始
    let traceId: string;
    if (!this.currentTraceId) {
      traceId = this.startTrace();
    } else {
      traceId = this.currentTraceId;
    }

    const spanId = this.generateSpanId();
    const parentSpanId = this.currentSpanId;

    const span: CompilationSpan = {
      traceId,
      parentSpanId,
      spanId,
      operationName,
      startTime: Date.now(),
      location,
      tags,
    };

    this.spans.set(spanId, span);
    this.currentSpanId = spanId;

    return spanId;
  }

  /**
   * 结束当前 Span
   *
   * @param error - 可选的错误信息
   */
  endSpan(error?: MinimalDSLError): void {
    if (!this.currentSpanId) {
      return;
    }

    const span = this.spans.get(this.currentSpanId);
    if (span) {
      span.endTime = Date.now();
      if (error) {
        span.error = error;
      }
    }

    // 回退到父 Span
    const parentSpan = span?.parentSpanId
      ? this.spans.get(span.parentSpanId)
      : undefined;
    this.currentSpanId = parentSpan?.spanId;
  }

  /**
   * 记录错误到当前 Span
   *
   * @param error - 要记录的错误
   */
  recordError(error: MinimalDSLError): void {
    if (this.currentSpanId) {
      const span = this.spans.get(this.currentSpanId);
      if (span) {
        span.error = error;
      }
    }
  }

  /**
   * 添加标签到当前 Span
   *
   * @param tags - 要添加的标签
   */
  addTags(tags: Record<string, string | number | boolean>): void {
    if (this.currentSpanId) {
      const span = this.spans.get(this.currentSpanId);
      if (span) {
        span.tags = { ...span.tags, ...tags };
      }
    }
  }

  /**
   * 获取 Span 信息
   *
   * @param spanId - Span ID
   * @returns Span 信息，如果不存在则返回 undefined
   */
  getSpan(spanId: string): CompilationSpan | undefined {
    return this.spans.get(spanId);
  }

  /**
   * 获取当前 Span
   *
   * @returns 当前 Span，如果没有活动 Span 则返回 undefined
   */
  getCurrentSpan(): CompilationSpan | undefined {
    return this.currentSpanId ? this.spans.get(this.currentSpanId) : undefined;
  }

  /**
   * 获取完整的追踪树（JSON 格式）
   *
   * @param traceId - 追踪 ID（默认使用当前追踪）
   * @returns 追踪树
   */
  getTraceTree(traceId?: string): Record<string, unknown> {
    const targetTraceId = traceId || this.currentTraceId;
    if (!targetTraceId) {
      return { root: [] };
    }

    const traceSpans = Array.from(this.spans.values())
      .filter(span => span.traceId === targetTraceId);

    /**
     * 构建树形结构
     *
     * @param parentSpanId - 父 Span ID
     * @returns 子 Span 树
     */
    const buildTree = (parentSpanId?: string): unknown[] => {
      const children = traceSpans.filter(span => span.parentSpanId === parentSpanId);
      return children.map(span => ({
        spanId: span.spanId,
        operationName: span.operationName,
        duration: span.endTime ? span.endTime - span.startTime : undefined,
        startTime: span.startTime,
        endTime: span.endTime,
        location: span.location,
        tags: span.tags,
        error: span.error,
        children: buildTree(span.spanId),
      }));
    };

    return {
      traceId: targetTraceId,
      root: buildTree(),
    };
  }

  /**
   * 获取追踪摘要
   *
   * @param traceId - 追踪 ID
   * @returns 追踪摘要
   */
  getTraceSummary(traceId?: string): TraceSummary | undefined {
    const targetTraceId = traceId || this.currentTraceId;
    if (!targetTraceId) {
      return undefined;
    }

    const traceSpans = Array.from(this.spans.values())
      .filter(span => span.traceId === targetTraceId);

    if (traceSpans.length === 0) {
      return undefined;
    }

    // 计算总时长
    const rootSpan = traceSpans.find(s => !s.parentSpanId);
    const totalDuration = rootSpan?.endTime && rootSpan?.startTime
      ? rootSpan.endTime - rootSpan.startTime
      : undefined;

    // 统计错误数量
    const errorCount = traceSpans.filter(s => s.error).length;

    // 按操作名称分组统计
    const byOperation: Record<string, { count: number; totalTime: number }> = {};
    for (const span of traceSpans) {
      if (!byOperation[span.operationName]) {
        byOperation[span.operationName] = { count: 0, totalTime: 0 };
      }
      byOperation[span.operationName].count++;
      if (span.endTime) {
        byOperation[span.operationName].totalTime += span.endTime - span.startTime;
      }
    }

    return {
      traceId: targetTraceId,
      spanCount: traceSpans.length,
      totalDuration,
      errorCount,
      byOperation,
    };
  }

  /**
   * 导出追踪数据为 JSON
   *
   * @param traceId - 追踪 ID（默认导出所有追踪）
   * @returns JSON 字符串
   */
  exportToJson(traceId?: string): string {
    const targetTraceId = traceId || this.currentTraceId;

    if (targetTraceId) {
      return JSON.stringify(this.getTraceTree(targetTraceId), null, 2);
    }

    // 导出所有追踪
    const allTraces = new Set(
      Array.from(this.spans.values()).map(s => s.traceId)
    );

    const traces: Record<string, unknown> = {};
    for (const tid of allTraces) {
      traces[tid] = this.getTraceTree(tid);
    }

    return JSON.stringify(traces, null, 2);
  }

  /**
   * 清除所有 Span
   */
  clear(): void {
    this.spans.clear();
    this.currentSpanId = undefined;
    this.currentTraceId = undefined;
  }

  /**
   * 清除特定追踪的所有 Span
   *
   * @param traceId - 追踪 ID
   */
  clearTrace(traceId: string): void {
    for (const [spanId, span] of this.spans.entries()) {
      if (span.traceId === traceId) {
        this.spans.delete(spanId);
      }
    }

    // 如果清除了当前追踪，重置状态
    if (this.currentTraceId === traceId) {
      this.currentTraceId = undefined;
      this.currentSpanId = undefined;
    }
  }

  /**
   * 获取所有追踪 ID
   */
  getTraceIds(): string[] {
    return Array.from(
      new Set(Array.from(this.spans.values()).map(s => s.traceId))
    );
  }

  /**
   * 获取 Span 总数
   */
  get spanCount(): number {
    return this.spans.size;
  }
}

/**
 * 追踪摘要
 */
export interface TraceSummary {
  /** 追踪 ID */
  traceId: string;
  /** Span 总数 */
  spanCount: number;
  /** 总时长（毫秒） */
  totalDuration?: number;
  /** 错误数量 */
  errorCount: number;
  /** 按操作分组的统计 */
  byOperation: Record<string, { count: number; totalTime: number }>;
}

// ------------------------------------------------------------
// 错误工厂
// ------------------------------------------------------------

/**
 * DSL 错误工厂
 *
 * 提供创建各类 DSL 错误的工厂方法，统一错误创建流程。
 */
export class DSLErrorFactory {
  /** 默认语言 */
  private static defaultLanguage: 'en' | 'zh' = 'en';

  /**
   * 设置默认语言
   *
   * @param language - 默认语言
   */
  static setDefaultLanguage(language: 'en' | 'zh'): void {
    this.defaultLanguage = language;
  }

  /**
   * 创建语法错误
   *
   * @param code - 错误代码
   * @param enMessage - 英文消息模板
   * @param zhMessage - 中文消息模板
   * @param loc - 错误位置
   * @param params - 消息参数
   * @returns 语法错误对象
   */
  static createSyntaxError(
    code: ErrorCode,
    enMessage: string,
    zhMessage: string,
    loc: SourceLocation,
    params?: Record<string, string | number>
  ): SyntaxError {
    const message = LocalizedMessage.withParams(enMessage, zhMessage, params || {});
    return new SyntaxError(code, message, loc);
  }

  /**
   * 创建类型错误
   *
   * @param code - 错误代码
   * @param enMessage - 英文消息模板
   * @param zhMessage - 中文消息模板
   * @param loc - 错误位置
   * @param expectedType - 预期类型
   * @param actualType - 实际类型
   * @param params - 消息参数
   * @returns 类型错误对象
   */
  static createTypeError(
    code: ErrorCode,
    enMessage: string,
    zhMessage: string,
    loc: SourceLocation,
    expectedType: string,
    actualType: string,
    params?: Record<string, string | number>
  ): TypeError {
    const message = LocalizedMessage.withParams(enMessage, zhMessage, params || {});
    return new TypeError(code, message, loc, expectedType, actualType);
  }

  /**
   * 创建语义错误
   *
   * @param code - 错误代码
   * @param enMessage - 英文消息模板
   * @param zhMessage - 中文消息模板
   * @param loc - 错误位置
   * @param relatedSymbol - 相关符号
   * @param params - 消息参数
   * @returns 语义错误对象
   */
  static createSemanticError(
    code: ErrorCode,
    enMessage: string,
    zhMessage: string,
    loc: SourceLocation,
    relatedSymbol?: string,
    params?: Record<string, string | number>
  ): SemanticError {
    const message = LocalizedMessage.withParams(enMessage, zhMessage, params || {});
    return new SemanticError(code, message, loc);
  }

  /**
   * 创建警告
   *
   * @param code - 错误代码
   * @param enMessage - 英文消息模板
   * @param zhMessage - 中文消息模板
   * @param loc - 警告位置
   * @param params - 消息参数
   * @returns 警告对象
   */
  static createWarning(
    code: ErrorCode,
    enMessage: string,
    zhMessage: string,
    loc: SourceLocation,
    params?: Record<string, string | number>
  ): CompilationWarning {
    const message = LocalizedMessage.withParams(enMessage, zhMessage, params || {});
    return new CompilationWarning(code, message, loc);
  }

  // ============================================================
  // 便捷方法：常见错误的快捷创建
  // ============================================================

  /**
   * 创建"缺少 token"错误
   */
  static missingToken(expected: string, found: string, loc: SourceLocation): SyntaxError {
    return this.createSyntaxError(
      ErrorCode.SYX002_MISSING_TOKEN,
      `Expected '${expected}' but found '${found}'`,
      `期望 '${expected}' 但找到 '${found}'`,
      loc,
      { expected, found }
    );
  }

  /**
   * 创建"意外的 token"错误
   */
  static unexpectedToken(token: string, loc: SourceLocation): SyntaxError {
    return this.createSyntaxError(
      ErrorCode.SYX001_UNEXPECTED_TOKEN,
      `Unexpected token: ${token}`,
      `意外的 token: ${token}`,
      loc,
      { token }
    );
  }

  /**
   * 创建"类型不匹配"错误
   */
  static typeMismatch(
    expected: string,
    actual: string,
    loc: SourceLocation
  ): TypeError {
    return this.createTypeError(
      ErrorCode.TYP201_TYPE_MISMATCH,
      `Type mismatch: expected ${expected} but got ${actual}`,
      `类型不匹配：期望 ${expected} 但得到 ${actual}`,
      loc,
      expected,
      actual
    );
  }

  /**
   * 创建"未定义的变量"错误
   */
  static undefinedVariable(name: string, loc: SourceLocation): SemanticError {
    return this.createSemanticError(
      ErrorCode.SEM301_UNDEFINED_SYMBOL,
      `Undefined variable: ${name}`,
      `未定义的变量：${name}`,
      loc,
      name
    );
  }

  /**
   * 创建"重复定义"错误
   */
  static redefinedSymbol(name: string, loc: SourceLocation): SemanticError {
    return this.createSemanticError(
      ErrorCode.SEM302_DUPLICATE_DECLARATION,
      `Redefined symbol: ${name}`,
      `重复定义的符号：${name}`,
      loc,
      name
    );
  }

  /**
   * 创建"循环依赖"错误
   */
  static circularDependency(path: string[], loc: SourceLocation): SemanticError {
    const pathStr = path.join(' -> ');
    return this.createSemanticError(
      ErrorCode.SEM303_CIRCULAR_DEPENDENCY,
      `Circular dependency detected: ${pathStr}`,
      `检测到循环依赖：${pathStr}`,
      loc
    );
  }
}
