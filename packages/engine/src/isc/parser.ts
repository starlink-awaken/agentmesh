/**
 * Honeycomb v2 - ISC Parser
 *
 * 实现词法分析器（Lexer）和语法分析器（Parser），
 * 将布尔表达式字符串解析为抽象语法树（AST）。
 */

import type {
  Token,
  ISCExpression,
  ISCIdentifier,
  ISCLiteral,
  ISCComparisonExpression,
  ISCLogicalExpression,
  ISCUnaryExpression,
  ISCMemberExpression,
  SourceLocation,
  ComparisonOperator,
} from './types.js';
import {
  ISCLexerError,
  ISCInvalidCharacterError,
  ISCUnterminatedStringError,
  ISCInvalidNumberError,
  ISCParserError,
  ISCMismatchedParenthesisError,
  ISCUnexpectedTokenError,
  ISCEmptyExpressionError,
  ISCInvalidOperatorError,
} from './errors.js';

// ============================================================
// TokenType 字符字面量类型
// ============================================================

/** Token 类型字面量（用于内部使用，避免循环依赖） */
type TokenTypeStr =
  | 'IDENTIFIER' | 'NUMBER' | 'STRING' | 'BOOLEAN' | 'PERCENT'
  | 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE'
  | 'AND' | 'OR' | 'NOT'
  | 'LPAREN' | 'RPAREN' | 'LBRACKET' | 'RBRACKET' | 'DOT'
  | 'EOF' | 'UNKNOWN';

// ============================================================
// 操作符优先级
// ============================================================

/** 操作符优先级映射（数值越大优先级越高） */
const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '>': 3,
  '>=': 3,
  '<': 3,
  '<=': 3,
  '!': 4,
  '.': 5,
  '[': 5,
};

// ============================================================
// 词法分析器 (Lexer)
// ============================================================

/**
 * ISC 词法分析器
 * 将表达式字符串分解为 token 流
 */
export class ISCLexer {
  private input: string = '';
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;

  /**
   * 对表达式进行词法分析
   */
  tokenize(input: string): Token[] {
    this.input = input;
    this.position = 0;
    this.line = 1;
    this.column = 1;

    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      try {
        const token = this.scanToken();
        if (token.type !== 'UNKNOWN') {
          tokens.push(token);
        }
      } catch (error) {
        if (error instanceof ISCLexerError) {
          throw error;
        }
        // 忽略其他错误或转换为词法错误
        throw new ISCLexerError(
          `Unexpected error at position ${this.position}`,
          this.position
        );
      }
    }

    // 添加 EOF token
    tokens.push({
      type: 'EOF' as any,
      value: null,
      position: this.position,
      length: 0,
      line: this.line,
      column: this.column,
    });

    return tokens;
  }

  /**
   * 扫描下一个 token
   */
  private scanToken(): Token {
    const char = this.advance();

    // 跳过空白字符
    if (this.isWhitespace(char)) {
      return this.scanToken(); // 递归处理下一个非空白字符
    }

    // 扫描位置
    const startPos = this.position - 1;
    const startLine = this.line;
    const startColumn = this.column - 1;

    // 识别 token
    switch (char) {
      // 单字符操作符和分隔符
      case '(':
        return this.createToken('LPAREN', '(', startPos, startLine, startColumn);
      case ')':
        return this.createToken('RPAREN', ')', startPos, startLine, startColumn);
      case '[':
        return this.createToken('LBRACKET', '[', startPos, startLine, startColumn);
      case ']':
        return this.createToken('RBRACKET', ']', startPos, startLine, startColumn);
      case '.':
        return this.createToken('DOT', '.', startPos, startLine, startColumn);
      case '!':
        // 检查是否为 !=
        if (this.match('=')) {
          return this.createToken('NEQ', '!=', startPos, startLine, startColumn);
        }
        return this.createToken('NOT', '!', startPos, startLine, startColumn);
      case '=':
        // 检查是否为 ==
        if (this.match('=')) {
          return this.createToken('EQ', '==', startPos, startLine, startColumn);
        }
        throw new ISCInvalidCharacterError('=', startPos);
      case '<':
        // 检查是否为 <=
        if (this.match('=')) {
          return this.createToken('LTE', '<=', startPos, startLine, startColumn);
        }
        return this.createToken('LT', '<', startPos, startLine, startColumn);
      case '>':
        // 检查是否为 >=
        if (this.match('=')) {
          return this.createToken('GTE', '>=', startPos, startLine, startColumn);
        }
        return this.createToken('GT', '>', startPos, startLine, startColumn);
      case '&':
        // 检查是否为 &&
        if (this.match('&')) {
          return this.createToken('AND', '&&', startPos, startLine, startColumn);
        }
        throw new ISCInvalidCharacterError('&', startPos);
      case '|':
        // 检查是否为 ||
        if (this.match('|')) {
          return this.createToken('OR', '||', startPos, startLine, startColumn);
        }
        throw new ISCInvalidCharacterError('|', startPos);
      case '%':
        return this.createToken('PERCENT', '%', startPos, startLine, startColumn);
      case '"':
      case "'":
        return this.scanString(char, startPos, startLine, startColumn);
      default:
        // 数字或标识符
        if (this.isDigit(char)) {
          return this.scanNumber(char, startPos, startLine, startColumn);
        }
        if (this.isAlpha(char)) {
          return this.scanIdentifier(char, startPos, startLine, startColumn);
        }
        throw new ISCInvalidCharacterError(char, startPos);
    }
  }

  /**
   * 扫描字符串字面量
   */
  private scanString(quote: string, startPos: number, startLine: number, startColumn: number): Token {
    let value = '';

    while (!this.isAtEnd() && this.peek() !== quote) {
      const char = this.advance();
      // 处理转义字符
      if (char === '\\' && !this.isAtEnd()) {
        const next = this.advance();
        switch (next) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case 'r': value += '\r'; break;
          case '\\': value += '\\'; break;
          case quote: value += quote; break;
          default: value += next;
        }
      } else {
        value += char;
      }
    }

    if (this.isAtEnd()) {
      throw new ISCUnterminatedStringError(startPos, quote);
    }

    this.advance(); // 消耗结束引号

    return this.createToken('STRING', value, startPos, startLine, startColumn);
  }

  /**
   * 扫描数字字面量
   */
  private scanNumber(first: string, startPos: number, startLine: number, startColumn: number): Token {
    let value = first;
    let hasDecimal = false;

    while (!this.isAtEnd() && (this.isDigit(this.peek()) || this.peek() === '.')) {
      if (this.peek() === '.') {
        if (hasDecimal) {
          throw new ISCInvalidNumberError(value + this.peek(), startPos);
        }
        hasDecimal = true;
      }
      value += this.advance();
    }

    const numValue = hasDecimal ? parseFloat(value) : parseInt(value, 10);

    return this.createToken('NUMBER', numValue, startPos, startLine, startColumn);
  }

  /**
   * 扫描标识符或关键字
   */
  private scanIdentifier(first: string, startPos: number, startLine: number, startColumn: number): Token {
    let value = first;

    while (!this.isAtEnd() && (this.isAlphaNumeric(this.peek()) || this.peek() === '_' || this.peek() === '-')) {
      value += this.advance();
    }

    // 检查是否为关键字（AND, OR, NOT, TRUE, FALSE）
    const upperValue = value.toUpperCase();
    if (upperValue === 'AND') {
      return this.createToken('AND', '&&', startPos, startLine, startColumn);
    }
    if (upperValue === 'OR') {
      return this.createToken('OR', '||', startPos, startLine, startColumn);
    }
    if (upperValue === 'NOT') {
      return this.createToken('NOT', '!', startPos, startLine, startColumn);
    }
    if (upperValue === 'TRUE') {
      return this.createToken('BOOLEAN', true, startPos, startLine, startColumn);
    }
    if (upperValue === 'FALSE') {
      return this.createToken('BOOLEAN', false, startPos, startLine, startColumn);
    }

    return this.createToken('IDENTIFIER', value, startPos, startLine, startColumn);
  }

  /**
   * 创建 token
   */
  private createToken(
    type: TokenTypeStr,
    value: string | number | boolean | null,
    startPos: number,
    startLine: number,
    startColumn: number
  ): Token {
    return {
      type: type as any, // 转换为 TokenType 枚举
      value,
      position: startPos,
      length: this.position - startPos,
      line: startLine,
      column: startColumn,
    };
  }

  /**
   * 前进一个字符
   */
  private advance(): string {
    const char = this.input[this.position++];
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char;
  }

  /**
   * 查看当前字符但不消耗
   */
  private peek(): string {
    return this.input[this.position];
  }

  /**
   * 检查并消耗指定字符
   */
  private match(expected: string): boolean {
    if (this.isAtEnd() || this.peek() !== expected) {
      return false;
    }
    this.advance();
    return true;
  }

  /**
   * 检查是否到达结尾
   */
  private isAtEnd(): boolean {
    return this.position >= this.input.length;
  }

  /**
   * 检查是否为空白字符
   */
  private isWhitespace(char: string): boolean {
    return /\s/.test(char);
  }

  /**
   * 检查是否为数字
   */
  private isDigit(char: string): boolean {
    return /[0-9]/.test(char);
  }

  /**
   * 检查是否为字母
   */
  private isAlpha(char: string): boolean {
    return /[a-zA-Z_]/.test(char);
  }

  /**
   * 检查是否为字母或数字
   */
  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }
}

// ============================================================
// 语法分析器 (Parser)
// ============================================================

/**
 * ISC 语法分析器
 * 将 token 流转换为抽象语法树（AST）
 */
export class ISCParser {
  private lexer: ISCLexer;
  private tokens: Token[] = [];
  private current: number = 0;
  private source: string = '';

  constructor() {
    this.lexer = new ISCLexer();
  }

  /**
   * 解析表达式字符串为 AST
   */
  parse(source: string): ISCExpression {
    this.source = source;
    this.tokens = this.lexer.tokenize(source);
    this.current = 0;

    if (this.tokens.length <= 1) { // 只有 EOF
      throw new ISCEmptyExpressionError();
    }

    const expr = this.parseExpression();

    // 确保所有 token 都被消耗
    if (!this.isAtEnd() && this.peek().type !== 'EOF') {
      throw new ISCUnexpectedTokenError(
        'end of expression',
        String(this.peek().value),
        this.peek().position
      );
    }

    return expr;
  }

  /**
   * 解析表达式（入口点）
   */
  private parseExpression(): ISCExpression {
    return this.parseLogicalOr();
  }

  /**
   * 解析逻辑 OR 表达式
   */
  private parseLogicalOr(): ISCExpression {
    let left = this.parseLogicalAnd();

    while (this.match('OR')) {
      const operator = this.previous().value as '||';
      const right = this.parseLogicalAnd();
      left = this.createLogicalExpression(left, operator, right);
    }

    return left;
  }

  /**
   * 解析逻辑 AND 表达式
   */
  private parseLogicalAnd(): ISCExpression {
    let left = this.parseComparison();

    while (this.match('AND')) {
      const operator = this.previous().value as '&&';
      const right = this.parseComparison();
      left = this.createLogicalExpression(left, operator, right);
    }

    return left;
  }

  /**
   * 解析比较表达式
   */
  private parseComparison(): ISCExpression {
    let left = this.parseUnary();

    // 尝试解析比较操作符
    while (this.match('EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE')) {
      const operator = this.previous().value as ComparisonOperator;
      const right = this.parseUnary();
      left = this.createComparisonExpression(left, operator, right);
    }

    return left;
  }

  /**
   * 解析一元表达式
   */
  private parseUnary(): ISCExpression {
    if (this.match('NOT')) {
      const operator = this.previous().value as '!';
      const argument = this.parseUnary();
      return this.createUnaryExpression(operator, argument);
    }

    return this.parsePrimary();
  }

  /**
   * 解析基本表达式
   */
  private parsePrimary(): ISCExpression {
    // 处理括号表达式
    if (this.match('LPAREN')) {
      const expr = this.parseExpression();
      this.consume('RPAREN', "Expected ')' after expression");
      // 括号表达式后可能跟着成员访问
      return this.parsePostPrimary(expr);
    }

    // 处理布尔字面量
    if (this.match('BOOLEAN')) {
      const token = this.previous();
      const literal = this.createLiteral(token.value as boolean);
      return this.parsePostPrimary(literal);
    }

    // 处理标识符
    if (this.match('IDENTIFIER')) {
      const token = this.previous();
      const identifier = this.createIdentifier(token.value as string);

      // 检查是否有百分比后缀
      if (this.match('PERCENT')) {
        // 将标识符和百分比转换为字面量（在后续阶段处理）
        // 这里我们创建一个特殊的标记，在求值时处理
        return identifier; // 暂时返回标识符，在后续处理百分比
      }

      // 检查是否为成员访问
      if (this.check('DOT') || this.check('LBRACKET')) {
        return this.parsePostPrimary(identifier);
      }

      return this.parsePostPrimary(identifier);
    }

    // 处理数字字面量
    if (this.check('NUMBER')) {
      const token = this.consume('NUMBER', 'Expected number');
      let value = token.value as number;

      // 检查是否有百分比后缀
      if (this.match('PERCENT')) {
        value = value / 100; // 将百分比转换为小数
      }

      return this.createLiteral(value);
    }

    // 处理字符串字面量
    if (this.match('STRING')) {
      const token = this.previous();
      return this.createLiteral(token.value as string);
    }

    throw new ISCUnexpectedTokenError(
      'expression',
      String(this.peek().value),
      this.peek().position
    );
  }

  /**
   * 解析基本表达式后的后缀操作（成员访问）
   * 统一处理标识符、字面量、括号表达式后的 . 和 [ 操作
   */
  private parsePostPrimary(expr: ISCExpression): ISCExpression {
    while (true) {
      if (this.match('DOT')) {
        // 点号访问: obj.prop
        if (!this.match('IDENTIFIER')) {
          throw new ISCUnexpectedTokenError(
            'property name',
            String(this.peek().value),
            this.peek().position
          );
        }
        const property = this.previous().value as string;
        // 创建成员表达式，并继续检查后缀
        const memberExpr = this.createMemberExpression(
          expr as ISCIdentifier | ISCMemberExpression,
          property,
          false
        );
        expr = this.parsePostPrimary(memberExpr);
      } else if (this.match('LBRACKET')) {
        // 括号访问: obj["prop"]
        const propToken = this.consume(
          'STRING',
          'Expected string property name'
        );
        this.consume('RBRACKET', "Expected ']' after property name");
        const memberExpr = this.createMemberExpression(
          expr as ISCIdentifier | ISCMemberExpression,
          propToken.value as string,
          true
        );
        expr = this.parsePostPrimary(memberExpr);
      } else {
        break;
      }
    }

    return expr;
  }

  // ----------------------------------------------------------
  // AST 节点创建方法
  // ----------------------------------------------------------

  private createIdentifier(name: string): ISCIdentifier {
    return {
      type: 'Identifier',
      name,
    };
  }

  private createLiteral(value: string | number | boolean): ISCLiteral {
    return {
      type: 'Literal',
      value,
    };
  }

  private createComparisonExpression(
    left: ISCExpression,
    operator: ComparisonOperator,
    right: ISCExpression
  ): ISCComparisonExpression {
    return {
      type: 'Comparison',
      operator,
      left: left as any, // TODO: 更精确的类型约束
      right: right as any,
    };
  }

  private createLogicalExpression(
    left: ISCExpression,
    operator: '&&' | '||',
    right: ISCExpression
  ): ISCLogicalExpression {
    return {
      type: 'Logical',
      operator,
      left,
      right,
    };
  }

  private createUnaryExpression(
    operator: '!',
    argument: ISCExpression
  ): ISCUnaryExpression {
    return {
      type: 'Unary',
      operator,
      argument,
    };
  }

  private createMemberExpression(
    object: ISCIdentifier | ISCMemberExpression,
    property: string,
    computed: boolean
  ): ISCMemberExpression {
    return {
      type: 'Member',
      object,
      property,
      computed,
    };
  }

  // ----------------------------------------------------------
  // Token 处理辅助方法
  // ----------------------------------------------------------

  /**
   * 检查当前 token 是否为指定类型
   */
  private check(...types: TokenTypeStr[]): boolean {
    if (this.isAtEnd()) return false;
    return types.includes(this.peek().type as TokenTypeStr);
  }

  /**
   * 检查并消耗 token（如果匹配）
   */
  private match(...types: TokenTypeStr[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  /**
   * 消耗指定类型的 token
   */
  private consume(type: TokenTypeStr, message: string): Token {
    if (this.check(type)) return this.advance();

    const token = this.peek();
    throw new ISCUnexpectedTokenError(
      type,
      String(token.value),
      token.position
    );
  }

  /**
   * 获取当前 token
   */
  private peek(): Token {
    return this.tokens[this.current];
  }

  /**
   * 获取上一个 token
   */
  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  /**
   * 前进到下一个 token
   */
  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  /**
   * 检查是否到达结尾
   */
  private isAtEnd(): boolean {
    return this.peek().type === 'EOF';
  }
}
