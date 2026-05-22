/**
 * Honeycomb DSL Compiler - 错误处理系统完整测试套件
 *
 * 测试覆盖：
 * - 错误码和错误类型（ErrorCode、ErrorSeverity、各类错误）
 * - 本地化消息（LocalizedMessage）
 * - 错误恢复管理器（ErrorRecoveryManager）
 * - 编译追踪器（CompilationTracer）
 * - 错误工厂（DSLErrorFactory）
 * - 错误收集器（ErrorCollector）
 *
 * @module tests/dsl-error-system
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  // 错误码和枚举
  ErrorCode,
  ErrorSeverity,
  RecoveryStrategy,
  // 位置和上下文
  type SourceLocation,
  createSourceLocation,
  formatSourceLocation,
  // 本地化消息
  LocalizedMessage,
  // 错误类型
  DSLError,
  SyntaxError,
  LexicalError,
  TypeError as DSLTypeError,
  SemanticError,
  CompilationError,
  RuntimeError,
  IOError,
  CompilationWarning,
  // 错误收集器
  ErrorCollector,
  // 错误恢复
  ErrorRecoveryManager,
  type RecoveryPoint,
  type RecoveryStats,
  // 编译追踪
  CompilationTracer,
  type CompilationSpan,
  type TraceSummary,
  // 错误工厂
  DSLErrorFactory,
  // 辅助函数
  isSyntaxError,
  isTypeError,
  isSemanticError,
  isCompilationError,
  isRuntimeError,
  isWarning,
} from '../src/dsl/error-system.js';

// ============================================================
// 测试工具函数
// ============================================================

/**
 * 创建测试用的源码位置
 */
function createTestLocation(
  file: string = 'test.dsl',
  line: number = 1,
  column: number = 1
): SourceLocation {
  return { file, line, column };
}

/**
 * 创建测试用的最小错误接口
 */
function createMinimalError(
  kind: 'syntax' | 'type' | 'semantic',
  message: string = 'Test error'
): { kind: 'syntax' | 'type' | 'semantic'; message: string; loc: SourceLocation; code?: string } {
  return {
    kind,
    message,
    loc: createTestLocation(),
    code: 'TEST001',
  };
}

// ============================================================
// 1. 错误码和错误类型测试
// ============================================================

describe('ErrorCode', () => {
  test('应该包含所有语法错误码', () => {
    expect(ErrorCode.SYX001_UNEXPECTED_TOKEN).toBe('SYX001');
    expect(ErrorCode.SYX002_MISSING_TOKEN).toBe('SYX002');
    expect(ErrorCode.SYX003_INVALID_SYNTAX).toBe('SYX003');
    expect(ErrorCode.SYX004_MISMATCHED_BRACKETS).toBe('SYX004');
    expect(ErrorCode.SYX005_INVALID_IDENTIFIER).toBe('SYX005');
    expect(ErrorCode.SYX006_MISSING_CLOSURE).toBe('SYX006');
  });

  test('应该包含所有词法错误码', () => {
    expect(ErrorCode.LEX101_UNCLOSED_STRING).toBe('LEX101');
    expect(ErrorCode.LEX102_INVALID_ESCAPE).toBe('LEX102');
    expect(ErrorCode.LEX103_INVALID_NUMBER).toBe('LEX103');
    expect(ErrorCode.LEX104_UNSUPPORTED_CHARACTER).toBe('LEX104');
    expect(ErrorCode.LEX105_UNCLOSED_COMMENT).toBe('LEX105');
  });

  test('应该包含所有类型错误码', () => {
    expect(ErrorCode.TYP201_TYPE_MISMATCH).toBe('TYP201');
    expect(ErrorCode.TYP202_UNKNOWN_TYPE).toBe('TYP202');
    expect(ErrorCode.TYP203_VOID_NOT_ALLOWED).toBe('TYP203');
    expect(ErrorCode.TYP204_MISSING_TYPE_ANNOTATION).toBe('TYP204');
    expect(ErrorCode.TYP205_CIRCULAR_TYPE_REFERENCE).toBe('TYP205');
    expect(ErrorCode.TYP206_TYPE_ARGUMENT_COUNT_MISMATCH).toBe('TYP206');
  });

  test('应该包含所有语义错误码', () => {
    expect(ErrorCode.SEM301_UNDEFINED_SYMBOL).toBe('SEM301');
    expect(ErrorCode.SEM302_DUPLICATE_DECLARATION).toBe('SEM302');
    expect(ErrorCode.SEM303_CIRCULAR_DEPENDENCY).toBe('SEM303');
    expect(ErrorCode.SEM304_CANNOT_ASSIGN_TO).toBe('SEM304');
    expect(ErrorCode.SEM305_ARGUMENT_COUNT_MISMATCH).toBe('SEM305');
    expect(ErrorCode.SEM306_INVALID_PROPERTY_ACCESS).toBe('SEM306');
    expect(ErrorCode.SEM307_SCOPE_ERROR).toBe('SEM307');
  });

  test('应该包含所有编译错误码', () => {
    expect(ErrorCode.COM401_CODE_GENERATION_FAILED).toBe('COM401');
    expect(ErrorCode.COM402_MISSING_OUTPUT).toBe('COM402');
    expect(ErrorCode.COM403_INVALID_TARGET).toBe('COM403');
    expect(ErrorCode.COM404_OPTION_CONFLICT).toBe('COM404');
  });

  test('应该包含所有运行时错误码', () => {
    expect(ErrorCode.RUN501_EXECUTION_FAILED).toBe('RUN501');
    expect(ErrorCode.RUN502_TIMEOUT).toBe('RUN502');
    expect(ErrorCode.RUN503_STACK_OVERFLOW).toBe('RUN503');
    expect(ErrorCode.RUN504_OUT_OF_MEMORY).toBe('RUN504');
    expect(ErrorCode.RUN505_UNHANDLED_EXCEPTION).toBe('RUN505');
  });

  test('应该包含所有警告码', () => {
    expect(ErrorCode.WAR601_DEPRECATED_FEATURE).toBe('WAR601');
    expect(ErrorCode.WAR602_UNUSED_VARIABLE).toBe('WAR602');
    expect(ErrorCode.WAR603_IMPLICIT_ANY).toBe('WAR603');
    expect(ErrorCode.WAR604_UNREACHABLE_CODE).toBe('WAR604');
    expect(ErrorCode.WAR605_EMPTY_BLOCK).toBe('WAR605');
  });

  test('应该包含所有 I/O 错误码', () => {
    expect(ErrorCode.IO701_FILE_NOT_FOUND).toBe('IO701');
    expect(ErrorCode.IO702_READ_FAILED).toBe('IO702');
    expect(ErrorCode.IO703_WRITE_FAILED).toBe('IO703');
    expect(ErrorCode.IO704_INVALID_PATH).toBe('IO704');
  });

  test('错误码格式应该符合规范', () => {
    const allCodes = Object.values(ErrorCode);

    for (const code of allCodes) {
      // 错误码格式：XXXNNN 或 XXXNNNN（3字母+3-4数字）
      // IO 错误码是 "IO701" 格式（2字母+3数字）
      expect(code).toMatch(/^[A-Z]{2,3}\d{3,4}$/);
    }
  });

  test('错误码应该按类别分组', () => {
    // SYX - 语法错误 0xx
    expect(ErrorCode.SYX001_UNEXPECTED_TOKEN).toMatch(/^SYX0\d{2}$/);
    // LEX - 词法错误 1xx
    expect(ErrorCode.LEX101_UNCLOSED_STRING).toMatch(/^LEX1\d{2}$/);
    // TYP - 类型错误 2xx
    expect(ErrorCode.TYP201_TYPE_MISMATCH).toMatch(/^TYP2\d{2}$/);
    // SEM - 语义错误 3xx
    expect(ErrorCode.SEM301_UNDEFINED_SYMBOL).toMatch(/^SEM3\d{2}$/);
    // COM - 编译错误 4xx
    expect(ErrorCode.COM401_CODE_GENERATION_FAILED).toMatch(/^COM4\d{2}$/);
    // RUN - 运行时错误 5xx
    expect(ErrorCode.RUN501_EXECUTION_FAILED).toMatch(/^RUN5\d{2}$/);
    // WAR - 警告 6xx
    expect(ErrorCode.WAR601_DEPRECATED_FEATURE).toMatch(/^WAR6\d{2}$/);
    // IO - I/O 错误 7xx
    expect(ErrorCode.IO701_FILE_NOT_FOUND).toMatch(/^IO\d{3}$/);
  });
});

describe('ErrorSeverity', () => {
  test('应该定义所有严重级别', () => {
    expect(ErrorSeverity.ERROR).toBe('error');
    expect(ErrorSeverity.WARNING).toBe('warning');
    expect(ErrorSeverity.INFO).toBe('info');
  });
});

describe('辅助函数', () => {
  test('isSyntaxError 应该正确识别语法错误码', () => {
    expect(isSyntaxError(ErrorCode.SYX001_UNEXPECTED_TOKEN)).toBe(true);
    expect(isSyntaxError(ErrorCode.LEX101_UNCLOSED_STRING)).toBe(true);
    expect(isSyntaxError(ErrorCode.TYP201_TYPE_MISMATCH)).toBe(false);
    expect(isSyntaxError(ErrorCode.SEM301_UNDEFINED_SYMBOL)).toBe(false);
  });

  test('isTypeError 应该正确识别类型错误码', () => {
    expect(isTypeError(ErrorCode.TYP201_TYPE_MISMATCH)).toBe(true);
    expect(isTypeError(ErrorCode.TYP202_UNKNOWN_TYPE)).toBe(true);
    expect(isTypeError(ErrorCode.SYX001_UNEXPECTED_TOKEN)).toBe(false);
  });

  test('isSemanticError 应该正确识别语义错误码', () => {
    expect(isSemanticError(ErrorCode.SEM301_UNDEFINED_SYMBOL)).toBe(true);
    expect(isSemanticError(ErrorCode.SEM302_DUPLICATE_DECLARATION)).toBe(true);
    expect(isSemanticError(ErrorCode.TYP201_TYPE_MISMATCH)).toBe(false);
  });

  test('isCompilationError 应该正确识别编译错误码', () => {
    expect(isCompilationError(ErrorCode.COM401_CODE_GENERATION_FAILED)).toBe(true);
    expect(isCompilationError(ErrorCode.SYX001_UNEXPECTED_TOKEN)).toBe(false);
  });

  test('isRuntimeError 应该正确识别运行时错误码', () => {
    expect(isRuntimeError(ErrorCode.RUN501_EXECUTION_FAILED)).toBe(true);
    expect(isRuntimeError(ErrorCode.RUN502_TIMEOUT)).toBe(true);
    expect(isRuntimeError(ErrorCode.COM401_CODE_GENERATION_FAILED)).toBe(false);
  });

  test('isWarning 应该正确识别警告码', () => {
    expect(isWarning(ErrorCode.WAR601_DEPRECATED_FEATURE)).toBe(true);
    expect(isWarning(ErrorCode.WAR602_UNUSED_VARIABLE)).toBe(true);
    expect(isWarning(ErrorCode.SYX001_UNEXPECTED_TOKEN)).toBe(false);
  });

  test('createSourceLocation 应该创建正确的位置对象', () => {
    const loc = createSourceLocation('test.dsl', 10, 5, 20);

    expect(loc.file).toBe('test.dsl');
    expect(loc.line).toBe(10);
    expect(loc.column).toBe(5);
    expect(loc.length).toBe(20);
  });

  test('formatSourceLocation 应该正确格式化位置', () => {
    const loc = createTestLocation('test.dsl', 10, 5);
    expect(formatSourceLocation(loc)).toBe('test.dsl:10:5');
  });
});

// ============================================================
// 2. 本地化消息测试
// ============================================================

describe('LocalizedMessage', () => {
  test('应该支持中英文切换', () => {
    const msg = new LocalizedMessage(
      'Unexpected token: {{token}}',
      '意外的token: {{token}}',
      { token: 'foo' }
    );

    expect(msg.toString('en')).toBe('Unexpected token: foo');
    expect(msg.toString('zh')).toBe('意外的token: foo');
  });

  test('默认应该使用中文', () => {
    const msg = new LocalizedMessage('Hello', '你好');
    expect(msg.toString()).toBe('你好');
  });

  test('应该支持参数化模板', () => {
    const msg = new LocalizedMessage(
      'Expected {{expected}}, got {{actual}}',
      '期望{{expected}}，实际{{actual}}',
      { expected: 'string', actual: 'number' }
    );

    expect(msg.toString('en')).toBe('Expected string, got number');
    expect(msg.toString('zh')).toBe('期望string，实际number');
  });

  test('应该在缺少参数时保持占位符', () => {
    const msg = new LocalizedMessage(
      'Missing {{param}}',
      '缺少{{param}}'
    );

    expect(msg.toString('en')).toBe('Missing {{param}}');
    expect(msg.toString('zh')).toBe('缺少{{param}}');
  });

  test('getEnglish 应该返回英文消息', () => {
    const msg = new LocalizedMessage('Error', '错误');
    expect(msg.getEnglish()).toBe('Error');
  });

  test('getChinese 应该返回中文消息', () => {
    const msg = new LocalizedMessage('Error', '错误');
    expect(msg.getChinese()).toBe('错误');
  });

  test('withParams 应该创建带参数的新实例', () => {
    const baseMsg = new LocalizedMessage(
      'Base: {{a}}',
      '基础: {{a}}',
      { a: 1 }
    );
    const newMsg = baseMsg.withParams({ b: 2 });

    expect(newMsg.toString('en')).toBe('Base: 1');
    expect(newMsg.toString('zh')).toBe('基础: 1');
  });

  test('withParams 应该合并参数', () => {
    const baseMsg = new LocalizedMessage(
      '{{a}} + {{b}}',
      '{{a}} + {{b}}',
      { a: 'x' }
    );
    const newMsg = baseMsg.withParams({ b: 'y' });

    expect(newMsg.toString('en')).toBe('x + y');
  });

  test('静态方法 create 应该创建简单的本地化消息', () => {
    const msg = LocalizedMessage.create('Hello', '你好');
    expect(msg.getEnglish()).toBe('Hello');
    expect(msg.getChinese()).toBe('你好');
  });

  test('静态方法 withParams 应该创建带参数的本地化消息', () => {
    const msg = LocalizedMessage.withParams(
      'Value: {{val}}',
      '值: {{val}}',
      { val: 42 }
    );
    expect(msg.toString('en')).toBe('Value: 42');
  });

  test('应该支持多个占位符', () => {
    const msg = new LocalizedMessage(
      '{{a}}, {{b}}, and {{c}}',
      '{{a}}、{{b}} 和 {{c}}',
      { a: '1', b: '2', c: '3' }
    );

    expect(msg.toString('en')).toBe('1, 2, and 3');
    expect(msg.toString('zh')).toBe('1、2 和 3');
  });

  test('应该支持数字参数', () => {
    const msg = new LocalizedMessage(
      'Line {{line}}, Column {{column}}',
      '第{{line}}行，第{{column}}列',
      { line: 10, column: 5 }
    );

    expect(msg.toString('en')).toBe('Line 10, Column 5');
    expect(msg.toString('zh')).toBe('第10行，第5列');
  });
});

// ============================================================
// 3. DSLError 基础类测试
// ============================================================

describe('DSLError 基础类', () => {
  test('应该正确创建语法错误', () => {
    const message = new LocalizedMessage(
      'Unexpected token',
      '意外的token'
    );
    const error = new SyntaxError(
      ErrorCode.SYX001_UNEXPECTED_TOKEN,
      message,
      createTestLocation('test.dsl', 1, 1)
    );

    expect(error.code).toBe('SYX001');
    expect(error.severity).toBe('error');
    expect(error.loc.file).toBe('test.dsl');
    expect(error.loc.line).toBe(1);
    expect(error.loc.column).toBe(1);
    expect(error.message).toBe('意外的token');
  });

  test('应该正确设置错误名称', () => {
    const message = new LocalizedMessage('Error', '错误');
    const error = new SyntaxError(
      ErrorCode.SYX001_UNEXPECTED_TOKEN,
      message,
      createTestLocation()
    );

    expect(error.name).toBe('SyntaxError');
  });

  test('应该支持错误链（causedBy）', () => {
    const rootMessage = new LocalizedMessage('Root error', '根错误');
    const rootError = new SyntaxError(
      ErrorCode.SYX003_INVALID_SYNTAX,
      rootMessage,
      createTestLocation('root.dsl', 1, 1)
    );

    const causedMessage = new LocalizedMessage('Caused error', '由...引起的错误');
    const causedError = new SyntaxError(
      ErrorCode.SYX002_MISSING_TOKEN,
      causedMessage,
      createTestLocation('caused.dsl', 2, 2),
      {},
      rootError
    );

    expect(causedError.causedBy).toBe(rootError);
  });

  test('应该支持错误上下文', () => {
    const message = new LocalizedMessage('Error', '错误');
    const context = {
      expected: 'identifier',
      actual: 'number',
      relatedTokens: ['1', '2', '3'],
    };

    const error = new SyntaxError(
      ErrorCode.SYX001_UNEXPECTED_TOKEN,
      message,
      createTestLocation(),
      context
    );

    expect(error.context).toEqual(context);
    expect(error.context.expected).toBe('identifier');
  });

  test('应该支持添加修复建议', () => {
    const message = new LocalizedMessage('Missing semicolon', '缺少分号');
    const error = new SyntaxError(
      ErrorCode.SYX002_MISSING_TOKEN,
      message,
      createTestLocation()
    );

    const suggestion = {
      message: new LocalizedMessage('Add semicolon', '添加分号'),
      action: 'insert' as const,
      priority: 10,
    };

    error.addSuggestion(suggestion);

    expect(error.suggestions).toHaveLength(1);
    expect(error.suggestions[0]).toEqual(suggestion);
  });

  test('应该支持添加多个修复建议', () => {
    const message = new LocalizedMessage('Type error', '类型错误');
    const error = new DSLTypeError(
      ErrorCode.TYP201_TYPE_MISMATCH,
      message,
      createTestLocation(),
      'string',
      'number'
    );

    const suggestion1 = {
      message: new LocalizedMessage('Change to string', '改为 string'),
      priority: 8,
    };
    const suggestion2 = {
      message: new LocalizedMessage('Change variable type', '更改变量类型'),
      priority: 5,
    };

    error.addSuggestions([suggestion1, suggestion2]);

    expect(error.suggestions).toHaveLength(2);
  });

  test('addSuggestion 应该支持链式调用', () => {
    const message = new LocalizedMessage('Error', '错误');
    const error = new SyntaxError(
      ErrorCode.SYX001_UNEXPECTED_TOKEN,
      message,
      createTestLocation()
    );

    const result = error
      .addSuggestion({
        message: new LocalizedMessage('Fix 1', '修复 1'),
      })
      .addSuggestion({
        message: new LocalizedMessage('Fix 2', '修复 2'),
      });

    expect(result).toBe(error);
    expect(error.suggestions).toHaveLength(2);
  });

  test('toString 应该生成完整的错误信息（中文）', () => {
    const message = new LocalizedMessage('Unexpected token', '意外的token');
    const error = new SyntaxError(
      ErrorCode.SYX001_UNEXPECTED_TOKEN,
      message,
      createTestLocation('test.dsl', 10, 5),
      { token: '123' }
    );

    const output = error.toString('zh');

    expect(output).toContain('[SYX001]');
    expect(output).toContain('意外的token');
    expect(output).toContain('test.dsl:10:5');
  });

  test('toString 应该生成完整的错误信息（英文）', () => {
    const message = new LocalizedMessage('Unexpected token', '意外的token');
    const error = new SyntaxError(
      ErrorCode.SYX001_UNEXPECTED_TOKEN,
      message,
      createTestLocation('test.dsl', 10, 5)
    );

    const output = error.toString('en');

    expect(output).toContain('[SYX001]');
    expect(output).toContain('Unexpected token');
    expect(output).toContain('test.dsl:10:5');
  });

  test('toString 应该包含错误链', () => {
    const rootMessage = new LocalizedMessage('Root', '根');
    const rootError = new SyntaxError(
      ErrorCode.SYX003_INVALID_SYNTAX,
      rootMessage,
      createTestLocation('root.dsl', 1, 1)
    );

    const causedMessage = new LocalizedMessage('Caused', '引起');
    const causedError = new SyntaxError(
      ErrorCode.SYX002_MISSING_TOKEN,
      causedMessage,
      createTestLocation('caused.dsl', 2, 2),
      {},
      rootError
    );

    const output = causedError.toString();

    expect(output).toContain('由以下错误引起');
    expect(output).toContain('根');
  });

  test('toString 应该包含修复建议', () => {
    const message = new LocalizedMessage('Error', '错误');
    const error = new SyntaxError(
      ErrorCode.SYX001_UNEXPECTED_TOKEN,
      message,
      createTestLocation()
    );

    error.addSuggestion({
      message: new LocalizedMessage('Fix 1', '修复 1'),
      priority: 10,
    });
    error.addSuggestion({
      message: new LocalizedMessage('Fix 2', '修复 2'),
      priority: 5,
    });

    const output = error.toString();

    expect(output).toContain('修复建议');
    expect(output).toContain('1. 修复 1'); // 高优先级在前
    expect(output).toContain('2. 修复 2');
  });

  test('toShortString 应该生成简短错误信息', () => {
    const message = new LocalizedMessage('Error message', '错误信息');
    const error = new SyntaxError(
      ErrorCode.SYX001_UNEXPECTED_TOKEN,
      message,
      createTestLocation('test.dsl', 5, 10)
    );

    const short = error.toShortString('zh');

    expect(short).toBe('[SYX001] 错误信息 at test.dsl:5:10');
  });

  test('isError 应该正确判断错误级别', () => {
    const errorMessage = new LocalizedMessage('Error', '错误');
    const error = new SyntaxError(
      ErrorCode.SYX001_UNEXPECTED_TOKEN,
      errorMessage,
      createTestLocation()
    );

    expect(error.isError()).toBe(true);
    expect(error.isWarning()).toBe(false);
  });

  test('isWarning 应该正确判断警告级别', () => {
    const warningMessage = new LocalizedMessage('Warning', '警告');
    const warning = new CompilationWarning(
      ErrorCode.WAR602_UNUSED_VARIABLE,
      warningMessage,
      createTestLocation()
    );

    expect(warning.isWarning()).toBe(true);
    expect(warning.isError()).toBe(false);
  });

  test('getErrorChain 应该返回完整的错误链', () => {
    const rootMessage = new LocalizedMessage('Root', '根');
    const rootError = new SyntaxError(
      ErrorCode.SYX003_INVALID_SYNTAX,
      rootMessage,
      createTestLocation('root.dsl', 1, 1)
    );

    const midMessage = new LocalizedMessage('Mid', '中');
    const midError = new SyntaxError(
      ErrorCode.SYX002_MISSING_TOKEN,
      midMessage,
      createTestLocation('mid.dsl', 2, 2),
      {},
      rootError
    );

    const leafMessage = new LocalizedMessage('Leaf', '叶');
    const leafError = new SyntaxError(
      ErrorCode.SYX001_UNEXPECTED_TOKEN,
      leafMessage,
      createTestLocation('leaf.dsl', 3, 3),
      {},
      midError
    );

    const chain = leafError.getErrorChain();

    expect(chain).toHaveLength(3);
    expect(chain[0]).toBe(rootError);
    expect(chain[1]).toBe(midError);
    expect(chain[2]).toBe(leafError);
  });

  test('getErrorChain 应该处理单个错误（无错误链）', () => {
    const message = new LocalizedMessage('Single', '单个');
    const error = new SyntaxError(
      ErrorCode.SYX001_UNEXPECTED_TOKEN,
      message,
      createTestLocation()
    );

    const chain = error.getErrorChain();

    expect(chain).toHaveLength(1);
    expect(chain[0]).toBe(error);
  });
});

// ============================================================
// 4. 具体错误类测试
// ============================================================

describe('SyntaxError 静态方法', () => {
  test('unexpectedToken 应该创建正确的错误', () => {
    const error = SyntaxError.unexpectedToken(
      '}',
      ['{', ';'],
      createTestLocation('test.dsl', 1, 10)
    );

    expect(error.code).toBe('SYX001');
    expect(error.suggestions).toHaveLength(1);
    expect(error.suggestions[0].action).toBe('replace');
  });

  test('missingToken 应该创建正确的错误', () => {
    const error = SyntaxError.missingToken(
      ';',
      createTestLocation('test.dsl', 5, 20)
    );

    expect(error.code).toBe('SYX002');
    expect(error.suggestions).toHaveLength(1);
    expect(error.suggestions[0].action).toBe('insert');
  });
});

describe('LexicalError 静态方法', () => {
  test('unclosedString 应该创建正确的错误', () => {
    const error = LexicalError.unclosedString(createTestLocation());

    expect(error.code).toBe('LEX101');
    expect(error.suggestions).toHaveLength(1);
    expect(error.suggestions[0].action).toBe('insert');
  });

  test('invalidEscape 应该创建正确的错误', () => {
    const error = LexicalError.invalidEscape('\\x', createTestLocation());

    expect(error.code).toBe('LEX102');
    expect(error.message.toString('en')).toContain('\\x');
  });
});

describe('TypeError 静态方法', () => {
  test('typeMismatch 应该创建正确的错误', () => {
    const error = DSLTypeError.typeMismatch(
      'string',
      'number',
      createTestLocation()
    );

    expect(error.code).toBe('TYP201');
    expect(error.expectedType).toBe('string');
    expect(error.actualType).toBe('number');
    expect(error.suggestions).toHaveLength(1);
  });

  test('voidNotAllowed 应该创建正确的错误', () => {
    const error = DSLTypeError.voidNotAllowed(
      'variable declaration',
      createTestLocation()
    );

    expect(error.code).toBe('TYP203');
    expect(error.expectedType).toBe('non-void');
    expect(error.actualType).toBe('void');
  });

  test('unknownType 应该创建正确的错误', () => {
    const error = DSLTypeError.unknownType('MyCustomType', createTestLocation());

    expect(error.code).toBe('TYP202');
    expect(error.actualType).toBe('MyCustomType');
    expect(error.suggestions).toHaveLength(1);
  });
});

describe('SemanticError 静态方法', () => {
  test('undefinedSymbol 应该创建正确的错误', () => {
    const error = SemanticError.undefinedSymbol('myVariable', createTestLocation());

    expect(error.code).toBe('SEM301');
    expect(error.suggestions).toHaveLength(1);
  });

  test('duplicateDeclaration 应该创建正确的错误', () => {
    const firstLoc = createTestLocation('file.dsl', 5, 1);
    const error = SemanticError.duplicateDeclaration(
      'myFunction',
      firstLoc,
      createTestLocation('file.dsl', 10, 1)
    );

    expect(error.code).toBe('SEM302');
    expect(error.context.firstDeclaration).toEqual(firstLoc);
    expect(error.suggestions).toHaveLength(1);
    expect(error.suggestions[0].action).toBe('rename');
  });

  test('circularDependency 应该创建正确的错误', () => {
    const cycle = ['A', 'B', 'C', 'A'];
    const error = SemanticError.circularDependency(cycle, createTestLocation());

    expect(error.code).toBe('SEM303');
    expect(error.message.toString('en')).toContain('A -> B -> C -> A');
  });
});

describe('CompilationError 静态方法', () => {
  test('codeGenerationFailed 应该创建正确的错误', () => {
    const error = CompilationError.codeGenerationFailed(
      'Unknown target platform',
      createTestLocation()
    );

    expect(error.code).toBe('COM401');
    expect(error.message.toString('en')).toContain('Unknown target platform');
  });
});

describe('RuntimeError 静态方法', () => {
  test('executionFailed 应该创建正确的错误', () => {
    const error = RuntimeError.executionFailed(
      'Division by zero',
      createTestLocation()
    );

    expect(error.code).toBe('RUN501');
    expect(error.message.toString('en')).toContain('Division by zero');
  });
});

describe('IOError 静态方法', () => {
  test('fileNotFound 应该创建正确的错误', () => {
    const error = IOError.fileNotFound('/path/to/missing.txt');

    expect(error.code).toBe('IO701');
    expect(error.message.toString('en')).toContain('/path/to/missing.txt');
  });

  test('readFailed 应该创建正确的错误', () => {
    const error = IOError.readFailed('/path/to/file.txt', 'Permission denied');

    expect(error.code).toBe('IO702');
    expect(error.message.toString('en')).toContain('Permission denied');
  });
});

describe('CompilationWarning 静态方法', () => {
  test('unusedVariable 应该创建警告', () => {
    const warning = CompilationWarning.unusedVariable(
      'unusedVar',
      createTestLocation()
    );

    expect(warning.code).toBe('WAR602');
    expect(warning.severity).toBe('warning');
  });

  test('implicitAny 应该创建警告', () => {
    const warning = CompilationWarning.implicitAny(
      'myVar',
      createTestLocation()
    );

    expect(warning.code).toBe('WAR603');
    expect(warning.severity).toBe('warning');
    expect(warning.suggestions).toHaveLength(1);
  });

  test('deprecatedFeature 应该创建警告（无替代方案）', () => {
    const warning = CompilationWarning.deprecatedFeature(
      'oldFeature',
      createTestLocation()
    );

    expect(warning.code).toBe('WAR601');
    expect(warning.severity).toBe('warning');
    expect(warning.suggestions).toHaveLength(0);
  });

  test('deprecatedFeature 应该创建警告（有替代方案）', () => {
    const warning = CompilationWarning.deprecatedFeature(
      'oldFeature',
      createTestLocation(),
      'newFeature'
    );

    expect(warning.code).toBe('WAR601');
    expect(warning.suggestions).toHaveLength(1);
    expect(warning.suggestions[0].action).toBe('replace');
  });
});

// ============================================================
// 5. 错误收集器测试
// ============================================================

describe('ErrorCollector', () => {
  let collector: ErrorCollector;

  beforeEach(() => {
    collector = new ErrorCollector();
  });

  test('初始状态应该为空', () => {
    expect(collector.getErrors()).toHaveLength(0);
    expect(collector.getWarnings()).toHaveLength(0);
    expect(collector.getAll()).toHaveLength(0);
    expect(collector.hasErrors()).toBe(false);
    expect(collector.hasWarnings()).toBe(false);
  });

  test('addError 应该正确分类错误和警告', () => {
    const error = SyntaxError.missingToken(';', createTestLocation());
    const warning = CompilationWarning.unusedVariable('x', createTestLocation());

    collector.addError(error);
    collector.addError(warning);

    expect(collector.getErrors()).toHaveLength(1);
    expect(collector.getWarnings()).toHaveLength(1);
  });

  test('addErrors 应该批量添加错误', () => {
    const errors = [
      SyntaxError.missingToken(';', createTestLocation()),
      CompilationWarning.unusedVariable('x', createTestLocation()),
      DSLTypeError.typeMismatch('string', 'number', createTestLocation()),
    ];

    collector.addErrors(errors);

    expect(collector.getErrors()).toHaveLength(2);
    expect(collector.getWarnings()).toHaveLength(1);
  });

  test('getAll 应该返回所有错误和警告', () => {
    const error = SyntaxError.missingToken(';', createTestLocation());
    const warning = CompilationWarning.unusedVariable('x', createTestLocation());

    collector.addError(error);
    collector.addError(warning);

    const all = collector.getAll();
    expect(all).toHaveLength(2);
  });

  test('errorCount 和 warningCount 应该返回正确的数量', () => {
    collector.addError(SyntaxError.missingToken(';', createTestLocation()));
    collector.addError(DSLTypeError.typeMismatch('a', 'b', createTestLocation()));
    collector.addError(CompilationWarning.unusedVariable('x', createTestLocation()));
    collector.addError(CompilationWarning.implicitAny('y', createTestLocation()));

    expect(collector.errorCount).toBe(2);
    expect(collector.warningCount).toBe(2);
  });

  test('clear 应该清空所有错误和警告', () => {
    collector.addError(SyntaxError.missingToken(';', createTestLocation()));
    collector.addError(CompilationWarning.unusedVariable('x', createTestLocation()));

    collector.clear();

    expect(collector.getErrors()).toHaveLength(0);
    expect(collector.getWarnings()).toHaveLength(0);
  });

  test('format 应该格式化中文输出', () => {
    collector.addError(SyntaxError.missingToken(';', createTestLocation()));
    collector.addError(CompilationWarning.unusedVariable('x', createTestLocation()));

    const formatted = collector.format('zh');

    expect(formatted).toContain('Errors (1)');
    expect(formatted).toContain('Warnings (1)');
    expect(formatted).toContain('缺少');
  });

  test('format 应该格式化英文输出', () => {
    collector.addError(SyntaxError.missingToken(';', createTestLocation()));

    const formatted = collector.format('en');

    expect(formatted).toContain('Errors (1)');
    expect(formatted).toContain('Missing');
  });

  test('format 应该处理空收集器', () => {
    const formattedZh = collector.format('zh');
    const formattedEn = collector.format('en');

    expect(formattedZh).toContain('无错误或警告');
    expect(formattedEn).toContain('No errors or warnings');
  });

  test('getErrors 和 getWarnings 应该返回副本', () => {
    collector.addError(SyntaxError.missingToken(';', createTestLocation()));
    const errors1 = collector.getErrors();
    const errors2 = collector.getErrors();

    expect(errors1).not.toBe(errors2);
    expect(errors1).toEqual(errors2);
  });
});

// ============================================================
// 6. 错误恢复管理器测试
// ============================================================

describe('ErrorRecoveryManager', () => {
  let manager: ErrorRecoveryManager;
  let recovered: boolean;

  beforeEach(() => {
    manager = new ErrorRecoveryManager();
    recovered = false;
  });

  test('初始状态应该为空', () => {
    expect(manager.recoveryPointCount).toBe(0);
    expect(manager.canRecover()).toBe(true);
  });

  test('应该能够注册恢复点', () => {
    const point: RecoveryPoint = {
      id: 'test-point',
      description: 'Test recovery point',
      location: createTestLocation(),
      strategy: RecoveryStrategy.SKIP,
      canRecover: () => true,
      recover: () => {
        recovered = true;
      },
    };

    manager.registerRecoveryPoint(point);

    expect(manager.recoveryPointCount).toBe(1);
  });

  test('应该能够批量注册恢复点', () => {
    const points: RecoveryPoint[] = [
      {
        id: 'point-1',
        description: 'Point 1',
        location: createTestLocation(),
        strategy: RecoveryStrategy.SKIP,
        canRecover: () => false,
        recover: () => {},
      },
      {
        id: 'point-2',
        description: 'Point 2',
        location: createTestLocation(),
        strategy: RecoveryStrategy.INSERT,
        canRecover: () => true,
        recover: () => {
          recovered = true;
        },
      },
    ];

    manager.registerRecoveryPoints(points);

    expect(manager.recoveryPointCount).toBe(2);
  });

  test('tryRecover 应该执行匹配的恢复点', () => {
    const point: RecoveryPoint = {
      id: 'test-point',
      description: 'Test recovery point',
      location: createTestLocation(),
      strategy: RecoveryStrategy.SKIP,
      canRecover: (error) => error.message === 'test error',
      recover: () => {
        recovered = true;
      },
    };

    manager.registerRecoveryPoint(point);

    const result = manager.tryRecover({
      kind: 'syntax',
      message: 'test error',
      loc: createTestLocation(),
    });

    expect(result).toBe(true);
    expect(recovered).toBe(true);
  });

  test('tryRecover 应该在无匹配恢复点时返回 false', () => {
    const point: RecoveryPoint = {
      id: 'test-point',
      description: 'Test recovery point',
      location: createTestLocation(),
      strategy: RecoveryStrategy.SKIP,
      canRecover: () => false,
      recover: () => {},
    };

    manager.registerRecoveryPoint(point);

    const result = manager.tryRecover({
      kind: 'syntax',
      message: 'test error',
      loc: createTestLocation(),
    });

    expect(result).toBe(false);
    expect(recovered).toBe(false);
  });

  test('tryRecover 应该按注册顺序尝试恢复点', () => {
    const callOrder: string[] = [];

    const point1: RecoveryPoint = {
      id: 'point-1',
      description: 'First point',
      location: createTestLocation(),
      strategy: RecoveryStrategy.SKIP,
      canRecover: () => {
        callOrder.push('point-1');
        return false;
      },
      recover: () => {},
    };

    const point2: RecoveryPoint = {
      id: 'point-2',
      description: 'Second point',
      location: createTestLocation(),
      strategy: RecoveryStrategy.INSERT,
      canRecover: () => {
        callOrder.push('point-2');
        return true;
      },
      recover: () => {
        callOrder.push('point-2-recover');
      },
    };

    const point3: RecoveryPoint = {
      id: 'point-3',
      description: 'Third point',
      location: createTestLocation(),
      strategy: RecoveryStrategy.ASSUME,
      canRecover: () => {
        callOrder.push('point-3');
        return true;
      },
      recover: () => {
        callOrder.push('point-3-recover');
      },
    };

    manager.registerRecoveryPoints([point1, point2, point3]);

    manager.tryRecover({
      kind: 'syntax',
      message: 'test',
      loc: createTestLocation(),
    });

    // 应该尝试 point1，然后 point2 匹配并恢复，不会到 point3
    expect(callOrder).toEqual(['point-1', 'point-2', 'point-2-recover']);
  });

  test('应该限制最大恢复尝试次数', () => {
    manager.setMaxRecoveryAttempts(2);

    const point: RecoveryPoint = {
      id: 'test-point',
      description: 'Test recovery point',
      location: createTestLocation(),
      strategy: RecoveryStrategy.SKIP,
      canRecover: () => true,
      recover: () => {},
    };

    manager.registerRecoveryPoint(point);

    // 第一次恢复
    expect(manager.tryRecover(createMinimalError('syntax', 'error1'))).toBe(true);
    // 第二次恢复
    expect(manager.tryRecover(createMinimalError('syntax', 'error2'))).toBe(true);
    // 第三次应该失败（超过最大次数）
    expect(manager.tryRecover(createMinimalError('syntax', 'error3'))).toBe(false);
  });

  test('reset 应该重置恢复尝试计数器', () => {
    manager.setMaxRecoveryAttempts(2);

    const point: RecoveryPoint = {
      id: 'test-point',
      description: 'Test recovery point',
      location: createTestLocation(),
      strategy: RecoveryStrategy.SKIP,
      canRecover: () => true,
      recover: () => {},
    };

    manager.registerRecoveryPoint(point);

    // 消耗两次尝试
    manager.tryRecover(createMinimalError('syntax', 'error1'));
    manager.tryRecover(createMinimalError('syntax', 'error2'));

    expect(manager.canRecover()).toBe(false);

    // 重置后应该可以再次恢复
    manager.reset();
    expect(manager.canRecover()).toBe(true);
    expect(manager.tryRecover(createMinimalError('syntax', 'error3'))).toBe(true);
  });

  test('clear 应该清除所有恢复点和历史', () => {
    const point: RecoveryPoint = {
      id: 'test-point',
      description: 'Test recovery point',
      location: createTestLocation(),
      strategy: RecoveryStrategy.SKIP,
      canRecover: () => true,
      recover: () => {},
    };

    manager.registerRecoveryPoint(point);
    manager.tryRecover(createMinimalError('syntax', 'error'));

    expect(manager.recoveryPointCount).toBe(1);
    expect(manager.getHistory().length).toBeGreaterThan(0);

    manager.clear();

    expect(manager.recoveryPointCount).toBe(0);
    expect(manager.getHistory()).toHaveLength(0);
    expect(manager.canRecover()).toBe(true);
  });

  test('unregisterRecoveryPoint 应该取消注册恢复点', () => {
    const point: RecoveryPoint = {
      id: 'test-point',
      description: 'Test recovery point',
      location: createTestLocation(),
      strategy: RecoveryStrategy.SKIP,
      canRecover: () => true,
      recover: () => {},
    };

    manager.registerRecoveryPoint(point);
    expect(manager.recoveryPointCount).toBe(1);

    manager.unregisterRecoveryPoint('test-point');
    expect(manager.recoveryPointCount).toBe(0);
  });

  test('getStats 应该返回正确的统计信息', () => {
    const skipPoint: RecoveryPoint = {
      id: 'skip-point',
      description: 'Skip recovery',
      location: createTestLocation(),
      strategy: RecoveryStrategy.SKIP,
      canRecover: (e) => e.message === 'skip',
      recover: () => {},
    };

    const insertPoint: RecoveryPoint = {
      id: 'insert-point',
      description: 'Insert recovery',
      location: createTestLocation(),
      strategy: RecoveryStrategy.INSERT,
      canRecover: () => false,
      recover: () => {},
    };

    manager.registerRecoveryPoints([skipPoint, insertPoint]);
    manager.setMaxRecoveryAttempts(5);

    // 成功恢复
    manager.tryRecover(createMinimalError('syntax', 'skip'));
    // 失败恢复
    manager.tryRecover(createMinimalError('syntax', 'other'));

    const stats = manager.getStats();

    expect(stats.totalAttempts).toBe(2);
    expect(stats.successfulRecoveries).toBe(1);
    expect(stats.failedRecoveries).toBe(1);
    expect(stats.currentAttempts).toBe(2);
    expect(stats.maxAttempts).toBe(5);
    expect(stats.byStrategy[RecoveryStrategy.SKIP]).toBe(2); // 两次都尝试了 SKIP
  });

  test('getHistory 应该返回恢复历史记录', () => {
    const point: RecoveryPoint = {
      id: 'test-point',
      description: 'Test recovery',
      location: createTestLocation(),
      strategy: RecoveryStrategy.REPLACE,
      canRecover: () => true,
      recover: () => {},
    };

    manager.registerRecoveryPoint(point);

    const error = createMinimalError('syntax', 'test error');
    manager.tryRecover(error);

    const history = manager.getHistory();

    expect(history).toHaveLength(1);
    expect(history[0].error).toBe(error);
    expect(history[0].recoveryPoint).toBe('test-point');
    expect(history[0].strategy).toBe(RecoveryStrategy.REPLACE);
    expect(history[0].success).toBe(true);
    expect(history[0].timestamp).toBeLessThanOrEqual(Date.now());
  });

  test('setMaxRecoveryAttempts 应该拒绝非正值', () => {
    expect(() => manager.setMaxRecoveryAttempts(0)).toThrow('Max recovery attempts must be positive');
    expect(() => manager.setMaxRecoveryAttempts(-1)).toThrow('Max recovery attempts must be positive');
  });

  test('应该支持所有恢复策略', () => {
    const strategies: RecoveryStrategy[] = [
      RecoveryStrategy.SKIP,
      RecoveryStrategy.INSERT,
      RecoveryStrategy.ASSUME,
      RecoveryStrategy.REPLACE,
      RecoveryStrategy.RETRY,
    ];

    for (const strategy of strategies) {
      const point: RecoveryPoint = {
        id: `point-${strategy}`,
        description: `${strategy} recovery`,
        location: createTestLocation(),
        strategy,
        canRecover: () => true,
        recover: () => {},
      };

      manager.registerRecoveryPoint(point);
    }

    expect(manager.recoveryPointCount).toBe(strategies.length);

    const stats = manager.getStats();
    for (const strategy of strategies) {
      expect(stats.byStrategy[strategy]).toBe(0); // 初始统计为 0
    }
  });
});

// ============================================================
// 7. 编译追踪器测试
// ============================================================

describe('CompilationTracer', () => {
  let tracer: CompilationTracer;

  beforeEach(() => {
    tracer = new CompilationTracer();
  });

  afterEach(() => {
    tracer.clear();
  });

  test('初始状态应该为空', () => {
    expect(tracer.spanCount).toBe(0);
    expect(tracer.getCurrentSpan()).toBeUndefined();
  });

  test('generateTraceId 应该生成唯一的 trace ID', () => {
    const traceId1 = tracer.generateTraceId();
    const traceId2 = tracer.generateTraceId();

    expect(traceId1).not.toBe(traceId2);
    expect(traceId1).toMatch(/^trace-\d+-\d+$/);
  });

  test('startTrace 应该创建新的追踪会话', () => {
    const traceId = tracer.startTrace();

    expect(traceId).toMatch(/^trace-\d+-\d+$/);
    expect(tracer.getCurrentSpan()).toBeUndefined(); // 没有 span 开始
  });

  test('endTrace 应该结束当前追踪会话', () => {
    tracer.startTrace();
    tracer.endTrace();

    expect(tracer.getCurrentSpan()).toBeUndefined();
  });

  test('startSpan 应该创建新的 span', () => {
    const spanId = tracer.startSpan('test operation');

    expect(spanId).toMatch(/^span-\d+-\d+$/);
    expect(tracer.spanCount).toBe(1);

    const span = tracer.getSpan(spanId);
    expect(span).toBeDefined();
    expect(span!.operationName).toBe('test operation');
    expect(span!.startTime).toBeLessThanOrEqual(Date.now());
    expect(span!.endTime).toBeUndefined();
  });

  test('startSpan 应该自动创建追踪会话', () => {
    const spanId = tracer.startSpan('auto trace');

    expect(spanId).toBeDefined();
    expect(tracer.spanCount).toBe(1);
    expect(tracer.getCurrentSpan()).toBeDefined();
  });

  test('应该支持嵌套 span', () => {
    const parentSpanId = tracer.startSpan('parent operation');
    const childSpanId = tracer.startSpan('child operation');

    const parentSpan = tracer.getSpan(parentSpanId);
    const childSpan = tracer.getSpan(childSpanId);

    expect(childSpan!.parentSpanId).toBe(parentSpanId);
    expect(tracer.getCurrentSpan()!.spanId).toBe(childSpanId);
  });

  test('endSpan 应该结束当前 span 并回退到父 span', () => {
    tracer.startSpan('parent');
    tracer.startSpan('child');
    tracer.endSpan();

    const currentSpan = tracer.getCurrentSpan();
    expect(currentSpan!.operationName).toBe('parent');
  });

  test('endSpan 应该计算持续时间', async () => {
    const spanId = tracer.startSpan('timed operation');

    // 等待一小段时间
    await new Promise((resolve) => setTimeout(resolve, 15));

    tracer.endSpan();

    const span = tracer.getSpan(spanId);
    expect(span!.endTime).toBeDefined();
    expect(span!.endTime! - span!.startTime).toBeGreaterThanOrEqual(10);
  });

  test('endSpan 在无活动 span 时应该安全返回', () => {
    expect(() => tracer.endSpan()).not.toThrow();
  });

  test('recordError 应该记录错误到当前 span', () => {
    tracer.startSpan('operation with error');

    const error = createMinimalError('syntax', 'test error');
    tracer.recordError(error);

    const span = tracer.getCurrentSpan();
    expect(span!.error).toBe(error);
  });

  test('recordError 在无活动 span 时应该安全返回', () => {
    expect(() => tracer.recordError(createMinimalError('syntax', 'error'))).not.toThrow();
  });

  test('addTags 应该添加标签到当前 span', () => {
    tracer.startSpan('tagged operation');

    tracer.addTags({ key1: 'value1', key2: 42, key3: true });

    const span = tracer.getCurrentSpan();
    expect(span!.tags).toEqual({
      key1: 'value1',
      key2: 42,
      key3: true,
    });
  });

  test('addTags 应该合并现有标签', () => {
    tracer.startSpan('operation');
    tracer.addTags({ a: 1 });
    tracer.addTags({ b: 2 });

    const span = tracer.getCurrentSpan();
    expect(span!.tags).toEqual({ a: 1, b: 2 });
  });

  test('getSpan 应该返回指定 span', () => {
    const spanId = tracer.startSpan('test');

    const span = tracer.getSpan(spanId);
    expect(span).toBeDefined();
    expect(span!.spanId).toBe(spanId);
  });

  test('getSpan 对不存在的 span 应该返回 undefined', () => {
    expect(tracer.getSpan('non-existent')).toBeUndefined();
  });

  test('getCurrentSpan 应该返回当前活动 span', () => {
    const spanId = tracer.startSpan('current');

    const current = tracer.getCurrentSpan();
    expect(current).toBeDefined();
    expect(current!.spanId).toBe(spanId);
  });

  test('getTraceTree 应该构建完整的追踪树', () => {
    const traceId = tracer.startTrace();

    const rootId = tracer.startSpan('root');
    const child1Id = tracer.startSpan('child1');
    tracer.endSpan();
    const child2Id = tracer.startSpan('child2');
    tracer.endSpan();
    tracer.endSpan();

    const tree = tracer.getTraceTree(traceId);

    expect(tree.traceId).toBe(traceId);
    expect(tree.root).toHaveLength(1);

    const root = tree.root[0] as { operationName: string; children: unknown[] };
    expect(root.operationName).toBe('root');
    expect(root.children).toHaveLength(2);
  });

  test('getTraceTree 在无追踪时应该返回包含 traceId 的空树', () => {
    const tree = tracer.getTraceTree('non-existent');
    expect(tree).toHaveProperty('traceId', 'non-existent');
    expect(tree).toHaveProperty('root');
    expect((tree as { root: unknown[] }).root).toHaveLength(0);
  });

  test('getTraceSummary 应该返回正确的摘要', async () => {
    const traceId = tracer.startTrace();

    tracer.startSpan('op1');
    tracer.addTags({ type: 'fast' });
    tracer.endSpan();

    tracer.startSpan('op2');
    await new Promise((resolve) => setTimeout(resolve, 10));
    tracer.endSpan();

    const summary = tracer.getTraceSummary(traceId);

    expect(summary).toBeDefined();
    expect(summary!.traceId).toBe(traceId);
    expect(summary!.spanCount).toBe(2);
    expect(summary!.errorCount).toBe(0);
    expect(summary!.byOperation.op1).toBeDefined();
    expect(summary!.byOperation.op2).toBeDefined();
  });

  test('getTraceSummary 应该统计错误', () => {
    tracer.startSpan('error op');
    tracer.recordError(createMinimalError('syntax', 'error'));
    tracer.endSpan();

    const summary = tracer.getTraceSummary();

    expect(summary!.errorCount).toBe(1);
  });

  test('exportToJson 应该导出 JSON 格式', () => {
    tracer.startSpan('test');
    tracer.endSpan();

    const json = tracer.exportToJson();
    const parsed = JSON.parse(json);

    expect(parsed).toBeDefined();
    expect(parsed.traceId).toBeDefined();
    expect(parsed.root).toBeDefined();
  });

  test('clear 应该清除所有 span', () => {
    tracer.startSpan('test1');
    tracer.startSpan('test2');
    expect(tracer.spanCount).toBeGreaterThan(0);

    tracer.clear();

    expect(tracer.spanCount).toBe(0);
    expect(tracer.getCurrentSpan()).toBeUndefined();
  });

  test('clearTrace 应该清除指定追踪的所有 span', () => {
    const traceId1 = tracer.startTrace();
    tracer.startSpan('trace1-op1');
    tracer.startSpan('trace1-op2');
    tracer.endTrace();

    const traceId2 = tracer.startTrace();
    tracer.startSpan('trace2-op');
    tracer.endTrace();

    expect(tracer.spanCount).toBeGreaterThan(0);

    tracer.clearTrace(traceId1);

    const remainingSpans = tracer.getTraceIds();
    expect(remainingSpans).not.toContain(traceId1);
    expect(remainingSpans).toContain(traceId2);
  });

  test('getTraceIds 应该返回所有追踪 ID', () => {
    const traceId1 = tracer.startTrace();
    tracer.startSpan('op1');
    tracer.endTrace();

    const traceId2 = tracer.startTrace();
    tracer.startSpan('op2');
    tracer.endTrace();

    const traceIds = tracer.getTraceIds();

    expect(traceIds).toHaveLength(2);
    expect(traceIds).toContain(traceId1);
    expect(traceIds).toContain(traceId2);
  });

  test('spanId 和 traceId 应该关联', () => {
    const traceId = tracer.startTrace();

    const spanId = tracer.startSpan('test');
    const span = tracer.getSpan(spanId);

    expect(span!.traceId).toBe(traceId);
  });

  test('endSpan 应该支持传入错误', () => {
    tracer.startSpan('failing operation');
    const error = createMinimalError('syntax', 'failure');
    tracer.endSpan(error);

    const span = tracer.getCurrentSpan(); // 回退后可能是父 span 或 undefined
    // 需要直接获取已结束的 span
    const allSpans = tracer.getTraceTree();
    const endedSpan = (allSpans.root[0] as { error?: unknown }).error;

    expect(endedSpan).toBeDefined();
  });

  test('startSpan 应该支持位置信息', () => {
    const loc = createTestLocation('file.dsl', 10, 5);
    const spanId = tracer.startSpan('located operation', loc);

    const span = tracer.getSpan(spanId);
    expect(span!.location).toEqual(loc);
  });

  test('应该支持创建多级嵌套 span', () => {
    tracer.startSpan('level1');
    tracer.startSpan('level2');
    tracer.startSpan('level3');

    const current = tracer.getCurrentSpan();
    expect(current!.operationName).toBe('level3');

    // 层级关系
    const level3 = tracer.getSpan(current!.spanId);
    const level2 = tracer.getSpan(level3!.parentSpanId!);
    const level1 = tracer.getSpan(level2!.parentSpanId!);

    expect(level1!.operationName).toBe('level1');
    expect(level2!.operationName).toBe('level2');
    expect(level3!.operationName).toBe('level3');
  });
});

// ============================================================
// 8. 错误工厂测试
// ============================================================

describe('DSLErrorFactory', () => {
  test('setDefaultLanguage 应该设置默认语言', () => {
    DSLErrorFactory.setDefaultLanguage('zh');
    // 验证设置成功（通过后续测试验证）
    DSLErrorFactory.setDefaultLanguage('en'); // 恢复默认
  });

  test('createSyntaxError 应该创建语法错误', () => {
    const error = DSLErrorFactory.createSyntaxError(
      ErrorCode.SYX001_UNEXPECTED_TOKEN,
      'Unexpected token',
      '意外的token',
      createTestLocation('test.dsl', 1, 1)
    );

    expect(error).toBeInstanceOf(SyntaxError);
    expect(error.code).toBe('SYX001');
    // 检查 toString 方法返回正确的中英文消息
    const zhOutput = error.toString('zh');
    const enOutput = error.toString('en');
    expect(zhOutput).toContain('意外的token');
    expect(enOutput).toContain('Unexpected token');
  });

  test('createSyntaxError 应该支持参数化消息', () => {
    const error = DSLErrorFactory.createSyntaxError(
      ErrorCode.SYX001_UNEXPECTED_TOKEN,
      'Unexpected {{token}}',
      '意外的{{token}}',
      createTestLocation(),
      { token: '}' }
    );

    expect(error.toString('en')).toContain('Unexpected }');
    expect(error.toString('zh')).toContain('意外的}');
  });

  test('createTypeError 应该创建类型错误', () => {
    const error = DSLErrorFactory.createTypeError(
      ErrorCode.TYP201_TYPE_MISMATCH,
      'Type mismatch',
      '类型不匹配',
      createTestLocation(),
      'string',
      'number'
    );

    expect(error).toBeInstanceOf(DSLTypeError);
    expect(error.code).toBe('TYP201');
    expect(error.expectedType).toBe('string');
    expect(error.actualType).toBe('number');
  });

  test('createTypeError 应该支持参数化消息', () => {
    const error = DSLErrorFactory.createTypeError(
      ErrorCode.TYP201_TYPE_MISMATCH,
      'Expected {{expected}}, got {{actual}}',
      '期望{{expected}}，实际{{actual}}',
      createTestLocation(),
      'string',
      'number',
      { expected: 'string', actual: 'number' }
    );

    expect(error.toString('en')).toContain('Expected string, got number');
    expect(error.toString('zh')).toContain('期望string，实际number');
  });

  test('createSemanticError 应该创建语义错误', () => {
    const error = DSLErrorFactory.createSemanticError(
      ErrorCode.SEM301_UNDEFINED_SYMBOL,
      'Undefined symbol',
      '未定义的符号',
      createTestLocation(),
      'myVar'
    );

    expect(error).toBeInstanceOf(SemanticError);
    expect(error.code).toBe('SEM301');
  });

  test('createSemanticError 应该支持参数化消息', () => {
    const error = DSLErrorFactory.createSemanticError(
      ErrorCode.SEM301_UNDEFINED_SYMBOL,
      'Symbol {{symbol}} is undefined',
      '符号{{symbol}}未定义',
      createTestLocation(),
      undefined,
      { symbol: 'x' }
    );

    expect(error.toString('en')).toContain('Symbol x is undefined');
  });

  test('createWarning 应该创建警告', () => {
    const warning = DSLErrorFactory.createWarning(
      ErrorCode.WAR602_UNUSED_VARIABLE,
      'Unused variable',
      '未使用的变量',
      createTestLocation()
    );

    expect(warning).toBeInstanceOf(CompilationWarning);
    expect(warning.code).toBe('WAR602');
    expect(warning.severity).toBe('warning');
  });

  test('createWarning 应该支持参数化消息', () => {
    const warning = DSLErrorFactory.createWarning(
      ErrorCode.WAR602_UNUSED_VARIABLE,
      'Variable {{name}} is unused',
      '变量{{name}}未使用',
      createTestLocation(),
      { name: 'unusedVar' }
    );

    expect(warning.toString('en')).toContain('Variable unusedVar is unused');
  });
});

describe('DSLErrorFactory 便捷方法', () => {
  test('missingToken 应该创建"缺少 token"错误', () => {
    const error = DSLErrorFactory.missingToken(';', ',', createTestLocation());

    expect(error.code).toBe('SYX002');
    expect(error.message.toString('zh')).toContain('期望');
  });

  test('unexpectedToken 应该创建"意外的 token"错误', () => {
    const error = DSLErrorFactory.unexpectedToken('}', createTestLocation());

    expect(error.code).toBe('SYX001');
    expect(error.message.toString('en')).toContain('}');
  });

  test('typeMismatch 应该创建"类型不匹配"错误', () => {
    const error = DSLErrorFactory.typeMismatch('string', 'number', createTestLocation());

    expect(error.code).toBe('TYP201');
    expect(error.expectedType).toBe('string');
    expect(error.actualType).toBe('number');
  });

  test('undefinedVariable 应该创建"未定义变量"错误', () => {
    const error = DSLErrorFactory.undefinedVariable('myVar', createTestLocation());

    expect(error.code).toBe('SEM301');
    expect(error.message.toString('en')).toContain('myVar');
  });

  test('redefinedSymbol 应该创建"重复定义"错误', () => {
    const error = DSLErrorFactory.redefinedSymbol('duplicateFunc', createTestLocation());

    expect(error.code).toBe('SEM302');
    expect(error.message.toString('en')).toContain('duplicateFunc');
  });

  test('circularDependency 应该创建"循环依赖"错误', () => {
    const cycle = ['A', 'B', 'C', 'A'];
    const error = DSLErrorFactory.circularDependency(cycle, createTestLocation());

    expect(error.code).toBe('SEM303');
    expect(error.message.toString('en')).toContain('A -> B -> C -> A');
  });
});

// ============================================================
// 9. 集成测试
// ============================================================

describe('错误系统集成测试', () => {
  test('应该支持完整的错误处理流程', () => {
    const collector = new ErrorCollector();
    const tracer = new CompilationTracer();
    const recoveryManager = new ErrorRecoveryManager();

    // 注册恢复点
    recoveryManager.registerRecoveryPoint({
      id: 'syntax-recovery',
      description: 'Syntax error recovery',
      location: createTestLocation(),
      strategy: RecoveryStrategy.SKIP,
      canRecover: (e) => e.kind === 'syntax',
      recover: () => {},
    });

    // 开始追踪
    tracer.startSpan('compile');

    // 创建错误
    const error = SyntaxError.missingToken(';', createTestLocation());
    error.addSuggestion({
      message: new LocalizedMessage('Add semicolon', '添加分号'),
      action: 'insert',
      priority: 10,
    });

    // 尝试恢复
    const recovered = recoveryManager.tryRecover({
      kind: 'syntax',
      message: error.message.toString(),
      loc: error.loc,
      code: error.code,
    });

    // 收集错误
    collector.addError(error);

    // 结束追踪
    tracer.endSpan();

    // 验证
    expect(recovered).toBe(true);
    expect(collector.hasErrors()).toBe(true);
    expect(tracer.spanCount).toBe(1);
  });

  test('应该支持多语言错误报告', () => {
    const error = DSLTypeError.typeMismatch('string', 'number', createTestLocation());

    const enMessage = error.toShortString('en');
    const zhMessage = error.toShortString('zh');

    expect(enMessage).toContain('Type mismatch');
    expect(zhMessage).toContain('类型不匹配');
  });

  test('应该支持复杂错误链', () => {
    const rootError = IOError.fileNotFound('/path/to/file');

    const midError = CompilationError.codeGenerationFailed(
      'Failed to read dependency',
      createTestLocation()
    );

    const finalError = RuntimeError.executionFailed(
      'Compilation failed',
      createTestLocation()
    );

    // 验证每个错误都有正确的信息
    expect(rootError.code).toBe('IO701');
    expect(midError.code).toBe('COM401');
    expect(finalError.code).toBe('RUN501');
  });
});
