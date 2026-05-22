/**
 * Honeycomb P2.3 - DSL Parser
 *
 * 实现 Agent DSL 的词法分析、语法分析和 AST 构建功能。
 * 支持错误诊断和源码位置追踪。
 */

import type {
  AgentDSL,
  BinaryOperator,
  DSLCapability,
  DSLCall,
  ConditionalBranch,
  DSLCondition,
  DSLConditionalStep,
  DSLDataType,
  DSLError,
  DSLExpression,
  DSLGovernance,
  DSLInput,
  DSLLoop,
  DSLMetadata,
  DSLNode,
  DSLNodeType,
  DSLOutput,
  DSLParallel,
  DSLPropertyAccess,
  DSLRetry,
  DSLStatement,
  DSLStep,
  DSLTemplateString,
  DSLTool,
  DSLTryCatch,
  ParseResult,
  SourceLocation,
} from './types.js';
import { AgentLayer, AgentType } from '../types.js';
import { createLRUCacheWithTTL, type LRUCacheWithTTL } from './lru-cache.js';
import { createHash } from 'crypto';
import { ObjectPool } from './object-pool.js';

// ============================================================
// Token 类型定义
// ============================================================

type TokenType =
  | 'KEYWORD'        // agent, input, output, etc.
  | 'IDENTIFIER'     // 变量名、函数名
  | 'STRING'         // 字符串字面量
  | 'NUMBER'         // 数字字面量
  | 'BOOLEAN'        // true/false
  | 'LBRACE'         // {
  | 'RBRACE'         // }
  | 'LBRACKET'       // [
  | 'RBRACKET'       // ]
  | 'LPAREN'         // (
  | 'RPAREN'         // )
  | 'COLON'          // :
  | 'SEMICOLON'      // ;
  | 'COMMA'          // ,
  | 'DOT'            // .
  | 'ARROW'          // ->
  | 'PIPE'           // |
  | 'LT'             // <
  | 'GT'             // >
  | 'LTE'            // <=
  | 'GTE'            // >=
  | 'EQ'             // ==
  | 'NEQ'            // !=
  | 'AND'            // &&
  | 'OR'             // ||
  | 'NOT'            // !
  | 'PLUS'           // +
  | 'MINUS'          // -
  | 'STAR'           // *
  | 'SLASH'          // /
  | 'PERCENT'        // %
  | 'AT'             // @
  | 'HASH'           // # (comment)
  | 'QUERY'          // ? (三元运算符)
  | 'EOF';           // 文件结束

interface Token {
  type: TokenType;
  value: string;
  loc: SourceLocation;
}

// ============================================================
// 关键字映射
// ============================================================

const KEYWORDS: Record<string, TokenType> = {
  // 结构关键字
  'agent': 'KEYWORD',
  'input': 'KEYWORD',
  'output': 'KEYWORD',
  'tools': 'KEYWORD',
  'capability': 'KEYWORD',
  'body': 'KEYWORD',
  'governance': 'KEYWORD',
  'metadata': 'KEYWORD',

  // 语句关键字
  'step': 'KEYWORD',
  'conditional_step': 'KEYWORD',
  'condition': 'KEYWORD',
  'loop': 'KEYWORD',
  'parallel': 'KEYWORD',
  'try_catch': 'KEYWORD',

  // 控制流属性
  'test': 'KEYWORD',
  'consequent': 'KEYWORD',
  'alternate': 'KEYWORD',
  'loop_type': 'KEYWORD',
  'variable': 'KEYWORD',
  'collection': 'KEYWORD',
  'branches': 'KEYWORD',
  'max_concurrency': 'KEYWORD',
  'try_block': 'KEYWORD',
  'catch_variable': 'KEYWORD',
  'catch_block': 'KEYWORD',
  'finally_block': 'KEYWORD',

  // 调用类型
  'call': 'KEYWORD',
  'inputs': 'KEYWORD',
  'outputs': 'KEYWORD',
  'retry': 'KEYWORD',

  // 属性关键字
  'description': 'KEYWORD',
  'type': 'KEYWORD',
  'layer': 'KEYWORD',
  'domain': 'KEYWORD',
  'data_type': 'KEYWORD',
  'required': 'KEYWORD',
  'default': 'KEYWORD',
  'validation': 'KEYWORD',
  'name': 'KEYWORD',
  'level': 'KEYWORD',
  'alias': 'KEYWORD',

  // 治理属性
  'first_principles_check': 'KEYWORD',
  'red_team_threshold': 'KEYWORD',
  'quality_gate_enabled': 'KEYWORD',
  'max_retries': 'KEYWORD',
  'token_budget': 'KEYWORD',

  // 元数据属性
  'author': 'KEYWORD',
  'version': 'KEYWORD',
  'license': 'KEYWORD',
  'tags': 'KEYWORD',

  // 字面量
  'true': 'BOOLEAN',
  'false': 'BOOLEAN',
  'null': 'KEYWORD',

  // 数据类型
  'string': 'KEYWORD',
  'number': 'KEYWORD',
  'boolean': 'KEYWORD',
  'any': 'KEYWORD',
  'void': 'KEYWORD',
  'object': 'KEYWORD',
  'array': 'KEYWORD',
  'union': 'KEYWORD',
  'literal': 'KEYWORD',

  // 循环类型
  'for': 'KEYWORD',
  'while': 'KEYWORD',
  'for_each': 'KEYWORD',

  // Agent 类型
  'structural': 'KEYWORD',
  'worker': 'KEYWORD',

  // 层名称
  'L1': 'KEYWORD',
  'L2': 'KEYWORD',
  'L3': 'KEYWORD',
  'L4': 'KEYWORD',

  // 风险阈值
  'very_low': 'KEYWORD',
  'low': 'KEYWORD',
  'medium': 'KEYWORD',
  'high': 'KEYWORD',
  'critical': 'KEYWORD',

  // 能力级别
  'basic': 'KEYWORD',
  'intermediate': 'KEYWORD',
  'advanced': 'KEYWORD',
  'expert': 'KEYWORD',
};

// ============================================================
// 词法分析器 (Lexer)
// ============================================================

export class Lexer {
  private source: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;
  private filename: string;

  constructor(source: string, filename: string = '<unknown>') {
    this.source = source;
    this.filename = filename;
  }

  private currentChar(): string {
    return this.source[this.position] ?? '\0';
  }

  private peekChar(offset: number = 1): string {
    return this.source[this.position + offset] ?? '\0';
  }

  private advance(): string {
    const ch = this.currentChar();
    this.position++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.currentChar()) && this.currentChar() !== '\0') {
      this.advance();
    }
  }

  private skipComment(): void {
    if (this.currentChar() === '#') {
      while (this.currentChar() !== '\n' && this.currentChar() !== '\0') {
        this.advance();
      }
    }
  }

  private readString(): Token {
    const startLine = this.line;
    const startCol = this.column;
    const quote = this.advance(); // 跳过开始的引号
    let value = '';

    while (this.currentChar() !== quote && this.currentChar() !== '\0') {
      if (this.currentChar() === '\\') {
        this.advance(); // 跳过转义符
        value += this.advance();
      } else {
        value += this.advance();
      }
    }

    if (this.currentChar() === '\0') {
      throw new Error(`Unterminated string at line ${startLine}`);
    }

    this.advance(); // 跳过结束的引号

    return {
      type: 'STRING',
      value,
      loc: {
        file: this.filename,
        line: startLine,
        column: startCol,
      },
    };
  }

  private readNumber(): Token {
    const startLine = this.line;
    const startCol = this.column;
    let value = '';

    while (/[0-9.]/.test(this.currentChar())) {
      value += this.advance();
    }

    return {
      type: 'NUMBER',
      value,
      loc: {
        file: this.filename,
        line: startLine,
        column: startCol,
      },
    };
  }

  private readIdentifier(): Token {
    const startLine = this.line;
    const startCol = this.column;
    let value = '';

    // 标识符可以包含字母、数字、连字符和下划线
    while (/[a-zA-Z0-9_-]/.test(this.currentChar())) {
      value += this.advance();
    }

    // 检查是否是关键字
    const keywordType = KEYWORDS[value];

    return {
      type: keywordType ?? 'IDENTIFIER',
      value,
      loc: {
        file: this.filename,
        line: startLine,
        column: startCol,
      },
    };
  }

  /**
   * 重置 Lexer 状态（用于对象池复用）
   *
   * 将 Lexer 恢复到初始状态，准备解析新的源码。
   */
  reset(): void {
    this.position = 0;
    this.line = 1;
    this.column = 1;
  }

  /**
   * 设置新的源码（用于对象池复用）
   *
   * @param source - DSL 源码
   * @param filename - 文件名（用于错误报告）
   */
  setSource(source: string, filename: string = '<unknown>'): void {
    this.source = source;
    this.filename = filename;
    this.reset();
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.position < this.source.length) {
      this.skipWhitespace();

      // 跳过注释
      if (this.currentChar() === '#') {
        this.skipComment();
        continue;
      }

      const ch = this.currentChar();

      if (ch === '\0') {
        break;
      }

      const startLine = this.line;
      const startCol = this.column;

      // 字符串字面量
      if (ch === '"' || ch === "'") {
        tokens.push(this.readString());
        continue;
      }

      // 数字字面量
      if (/[0-9]/.test(ch)) {
        tokens.push(this.readNumber());
        continue;
      }

      // 标识符或关键字
      if (/[a-zA-Z_]/.test(ch)) {
        tokens.push(this.readIdentifier());
        continue;
      }

      // 运算符和分隔符
      this.advance();

      let type: TokenType;
      let value = ch;

      // 多字符运算符
      if (ch === ':' && this.currentChar() === ':') {
        // :: 操作符（预留）
        this.advance();
        type = 'COLON';
        value = '::';
      } else if (ch === '-' && this.currentChar() === '>') {
        this.advance();
        type = 'ARROW';
        value = '->';
      } else if (ch === '|' && this.currentChar() === '|') {
        this.advance();
        type = 'OR';
        value = '||';
      } else if (ch === '&' && this.currentChar() === '&') {
        this.advance();
        type = 'AND';
        value = '&&';
      } else if (ch === '=' && this.currentChar() === '=') {
        this.advance();
        type = 'EQ';
        value = '==';
      } else if (ch === '!' && this.currentChar() === '=') {
        this.advance();
        type = 'NEQ';
        value = '!=';
      } else if (ch === '<' && this.currentChar() === '=') {
        this.advance();
        type = 'LTE';
        value = '<=';
      } else if (ch === '>' && this.currentChar() === '=') {
        this.advance();
        type = 'GTE';
        value = '>=';
      } else if (ch === ':') {
        type = 'COLON';
      } else if (ch === ';') {
        type = 'SEMICOLON';
      } else if (ch === ',') {
        type = 'COMMA';
      } else if (ch === '.') {
        type = 'DOT';
      } else if (ch === '{') {
        type = 'LBRACE';
      } else if (ch === '}') {
        type = 'RBRACE';
      } else if (ch === '[') {
        type = 'LBRACKET';
      } else if (ch === ']') {
        type = 'RBRACKET';
      } else if (ch === '(') {
        type = 'LPAREN';
      } else if (ch === ')') {
        type = 'RPAREN';
      } else if (ch === '<') {
        type = 'LT';
      } else if (ch === '>') {
        type = 'GT';
      } else if (ch === '!') {
        type = 'NOT';
      } else if (ch === '?') {
        type = 'QUERY';
      } else if (ch === '+') {
        type = 'PLUS';
      } else if (ch === '-') {
        type = 'MINUS';
      } else if (ch === '*') {
        type = 'STAR';
      } else if (ch === '/') {
        type = 'SLASH';
      } else if (ch === '%') {
        type = 'PERCENT';
      } else if (ch === '@') {
        type = 'AT';
      } else if (ch === '#') {
        type = 'HASH';
      } else {
        type = ch as TokenType;
      }

      tokens.push({
        type,
        value,
        loc: {
          file: this.filename,
          line: startLine,
          column: startCol,
        },
      });
    }

    // EOF token
    tokens.push({
      type: 'EOF',
      value: '',
      loc: {
        file: this.filename,
        line: this.line,
        column: this.column,
      },
    });

    return tokens;
  }
}

// ============================================================
// 语法分析器 (Parser)
// ============================================================

export class Parser {
  private tokens: Token[];
  private position: number = 0;
  private filename: string;
  private errors: DSLError[] = [];

  constructor(tokens: Token[], filename: string = '<unknown>') {
    this.tokens = tokens;
    this.filename = filename;
  }

  private currentToken(): Token {
    return this.tokens[this.position];
  }

  private peekToken(offset: number = 1): Token {
    return this.tokens[this.position + offset] ?? this.tokens[this.tokens.length - 1];
  }

  private advance(): Token {
    return this.tokens[this.position++];
  }

  private expect(type: TokenType, value?: string): Token {
    const token = this.currentToken();

    if (token.type !== type) {
      this.error(`Expected ${type}${value ? ` (${value})` : ''}, got ${token.type}`, token.loc);
      return token;
    }

    if (value !== undefined && token.value !== value) {
      this.error(`Expected '${value}', got '${token.value}'`, token.loc);
    }

    return this.advance();
  }

  private match(type: TokenType, value?: string): boolean {
    const token = this.currentToken();

    if (token.type !== type) {
      return false;
    }

    if (value !== undefined && token.value !== value) {
      return false;
    }

    this.advance();
    return true;
  }

  private error(message: string, loc: SourceLocation): void {
    this.errors.push({
      kind: 'syntax',
      message,
      loc,
    });
  }

  private createLoc(loc: SourceLocation): SourceLocation {
    return { ...loc };
  }

  // ============================================================
  // 主解析方法
  // ============================================================

  parse(): ParseResult {
    const ast = this.parseAgent();

    if (this.currentToken().type !== 'EOF') {
      this.error(
        `Unexpected token after agent definition: ${this.currentToken().type}`,
        this.currentToken().loc
      );
    }

    return {
      success: this.errors.length === 0,
      ast: this.errors.length === 0 ? ast : undefined,
      errors: this.errors,
    };
  }

  // ============================================================
  // Agent 定义解析
  // ============================================================

  private parseAgent(): AgentDSL {
    const loc = this.currentToken().loc;

    // agent <name> {
    this.expect('KEYWORD', 'agent');

    // Agent 名称可以是 IDENTIFIER 或某些 KEYWORD（如 'test'）
    // 这允许用户使用常见单词作为 Agent 名称
    const nameToken = this.currentToken();
    if (nameToken.type === 'IDENTIFIER' || nameToken.type === 'KEYWORD') {
      this.advance();
    } else {
      this.error('Expected IDENTIFIER or KEYWORD for agent name', nameToken.loc);
      this.advance(); // 消费当前 token 以继续
    }

    this.expect('LBRACE');

    const agent: AgentDSL = {
      type: 'agent',
      name: nameToken.value,
      description: '',
      agent_type: 'worker',
      layer: 'L3',
      inputs: [],
      outputs: [],
      tools: [],
      capabilities: [],
      body: [],
      governance: {
        first_principles_check: false,
        red_team_threshold: 'medium',
        quality_gate_enabled: true,
        max_retries: 3,
        token_budget: 100000,
      },
      loc: this.createLoc(loc),
    };

    // 跟踪是否找到了必需的字段
    let hasDescription = false;
    let hasGovernance = false;
    let hasBody = false;

    // 解析 Agent 主体
    while (!this.match('RBRACE') && this.currentToken().type !== 'EOF') {
      const keyword = this.currentToken();

      if (keyword.value === 'description') {
        this.advance();
        this.expect('COLON');
        const descToken = this.currentToken();
        if (descToken.type === 'STRING') {
          agent.description = this.advance().value;
        } else {
          // 允许多行字符串（以 | 开头）
          if (descToken.value === '|') {
            this.advance();
            let desc = '';
            while (
              this.currentToken().type !== 'KEYWORD' &&
              this.currentToken().type !== 'RBRACE' &&
              this.currentToken().type !== 'EOF'
            ) {
              desc += this.advance().value + ' ';
            }
            agent.description = desc.trim();
          } else {
            agent.description = descToken.value;
            this.advance();
          }
        }
        hasDescription = true;
      } else if (keyword.value === 'type') {
        this.advance();
        this.expect('COLON');
        const typeToken = this.advance();
        // 严格验证 Agent 类型
        if (typeToken.value === 'structural' || typeToken.value === 'worker') {
          agent.agent_type = typeToken.value === 'structural' ? 'structural' : 'worker';
        } else {
          this.error(`Invalid agent type: ${typeToken.value}. Must be 'worker' or 'structural'.`, typeToken.loc);
        }
      } else if (keyword.value === 'layer') {
        this.advance();
        this.expect('COLON');
        const layerToken = this.advance();
        const validLayers = ['L1', 'L2', 'L3', 'L4', 'governance'];
        if (validLayers.includes(layerToken.value)) {
          agent.layer = layerToken.value as AgentLayer;
        } else {
          this.error(`Invalid layer: ${layerToken.value}`, layerToken.loc);
        }
      } else if (keyword.value === 'domain') {
        this.advance();
        this.expect('COLON');
        agent.domain = this.advance().value;
      } else if (keyword.value === 'input') {
        this.advance(); // 消费 'input' 关键字
        agent.inputs.push(this.parseInput());
      } else if (keyword.value === 'output') {
        this.advance(); // 消费 'output' 关键字
        agent.outputs.push(this.parseOutput());
      } else if (keyword.value === 'tools') {
        this.advance();
        this.expect('COLON');
        agent.tools = this.parseToolList();
      } else if (keyword.value === 'capability') {
        this.advance(); // 消费 'capability' 关键字
        agent.capabilities.push(this.parseCapability());
      } else if (keyword.value === 'body') {
        this.advance();
        this.expect('LBRACE');
        agent.body = this.parseBody();
        this.expect('RBRACE');
        hasBody = true;
      } else if (keyword.value === 'governance') {
        this.advance();
        agent.governance = this.parseGovernance();
        hasGovernance = true;
      } else if (keyword.value === 'metadata') {
        this.advance();
        agent.metadata = this.parseMetadata();
      } else {
        // 跳过未知的关键字
        this.advance();
      }
    }

    // 严格验证：检查必需字段
    const errorLoc = agent.loc ?? { file: this.filename, line: 1, column: 1 };

    if (!hasDescription) {
      this.error('Agent description is required', errorLoc);
    }

    if (!hasGovernance) {
      this.error('Governance configuration is required', errorLoc);
    }

    if (!hasBody) {
      this.error('Body definition is required', errorLoc);
    }

    return agent;
  }

  // ============================================================
  // 输入/输出解析
  // ============================================================

  private parseInput(): DSLInput {
    const loc = this.currentToken().loc;
    // 注意：调用者已经匹配了 'input' 关键字，不需要再次匹配
    // this.expect('KEYWORD', 'input');

    // 输入名称可以是 IDENTIFIER 或某些 KEYWORD（如 'test', 'task' 等）
    // 这允许用户使用常见单词作为参数名称
    const nameToken = this.currentToken();
    if (nameToken.type === 'IDENTIFIER' || nameToken.type === 'KEYWORD') {
      this.advance();
    } else {
      this.error('Expected IDENTIFIER or KEYWORD for input name', nameToken.loc);
      this.advance(); // 消费当前 token 以继续
    }

    // 检查是否有冒号（支持两种语法）
    // 语法1: input task: string { ... }
    // 语法2: input task string { ... }
    const hasColon = this.match('COLON');

    const dataType = this.parseDataType();

    const input: DSLInput = {
      type: 'input',
      name: nameToken.value,
      data_type: dataType,
      required: false,
      loc: this.createLoc(loc),
    };

    // 可选的大括号块
    if (this.currentToken().type === 'LBRACE' && this.match('LBRACE')) {
      while (!this.match('RBRACE') && this.currentToken().type !== 'EOF') {
        const prop = this.currentToken().value;

        if (prop === 'description') {
          this.advance();
          this.expect('COLON');
          input.description = this.advance().value;
        } else if (prop === 'required') {
          this.advance();
          this.expect('COLON');
          const boolToken = this.advance();
          input.required = boolToken.value === 'true';
        } else if (prop === 'default') {
          this.advance();
          this.expect('COLON');
          input.default = this.parseExpression();
        } else if (prop === 'validation') {
          this.advance();
          this.expect('COLON');
          input.validation = this.parseExpression();
        } else {
          this.advance();
        }
      }
    }

    return input;
  }

  private parseOutput(): DSLOutput {
    const loc = this.currentToken().loc;
    // 注意：调用者已经匹配了 'output' 关键字，不需要再次匹配
    // this.expect('KEYWORD', 'output');

    // 输出名称可以是 IDENTIFIER 或某些 KEYWORD
    // 这允许用户使用常见单词作为输出名称
    const nameToken = this.currentToken();
    if (nameToken.type === 'IDENTIFIER' || nameToken.type === 'KEYWORD') {
      this.advance();
    } else {
      this.error('Expected IDENTIFIER or KEYWORD for output name', nameToken.loc);
      this.advance(); // 消费当前 token 以继续
    }

    // 检查是否有冒号（支持两种语法）
    const hasColon = this.match('COLON');

    const dataType = this.parseDataType();

    const output: DSLOutput = {
      type: 'output',
      name: nameToken.value,
      data_type: dataType,
      loc: this.createLoc(loc),
    };

    // 可选的大括号块
    if (this.currentToken().type === 'LBRACE' && this.match('LBRACE')) {
      while (!this.match('RBRACE') && this.currentToken().type !== 'EOF') {
        const prop = this.currentToken().value;

        if (prop === 'description') {
          this.advance();
          this.expect('COLON');
          output.description = this.advance().value;
        } else {
          this.advance();
        }
      }
    }

    return output;
  }

  // ============================================================
  // 数据类型解析
  // ============================================================

  private parseDataType(): DSLDataType {
    const typeToken = this.currentToken();

    // 基础类型
    const primitiveTypes = ['string', 'number', 'boolean', 'any', 'void'];
    if (primitiveTypes.includes(typeToken.value)) {
      this.advance();
      return { kind: typeToken.value as 'string' | 'number' | 'boolean' | 'any' | 'void' };
    }

    // array<T>
    if (typeToken.value === 'array') {
      this.advance();
      if (this.match('LT')) {
        const itemType = this.parseDataType();
        this.expect('GT');
        return { kind: 'array', item_type: itemType };
      }
      return { kind: 'array', item_type: { kind: 'any' } };
    }

    // object
    if (typeToken.value === 'object') {
      this.advance();
      return { kind: 'object', properties: {} };
    }

    // union<T1, T2, ...>
    if (typeToken.value === 'union') {
      this.advance();
      const types: DSLDataType[] = [];
      if (this.match('LT')) {
        do {
          types.push(this.parseDataType());
          if (!this.match('COMMA')) break;
        } while (this.currentToken().type !== 'GT');
        this.expect('GT');
      }
      return { kind: 'union', types };
    }

    // 默认作为 any 类型
    this.advance();
    return { kind: 'any' };
  }

  // ============================================================
  // 工具列表解析
  // ============================================================

  private parseToolList(): DSLTool[] {
    const tools: DSLTool[] = [];

    this.expect('LBRACKET');

    while (this.currentToken().type !== 'RBRACKET' && this.currentToken().type !== 'EOF') {
      const nameToken = this.currentToken();

      // 收集完整的工具引用（支持 skill:agent.dsl.skill 这种带前缀和点号的语法）
      let toolName = '';
      let startLoc = nameToken.loc;

      // 读取第一个标识符
      if (nameToken.type === 'IDENTIFIER' || nameToken.type === 'KEYWORD') {
        toolName = this.advance().value;
      } else {
        this.error('Expected IDENTIFIER or KEYWORD for tool name', nameToken.loc);
        this.advance(); // 消费错误的 token 以继续
        if (!this.match('COMMA')) {
          if (this.currentToken().type === 'RBRACKET') break;
        }
        continue;
      }

      // 检查是否有前缀（如 skill:xxx）
      if (this.match('COLON')) {
        // 读取前缀后的剩余部分（可能包含点号，如 agent.dsl.skill）
        const nextToken = this.currentToken();
        if (nextToken.type === 'IDENTIFIER' || nextToken.type === 'KEYWORD') {
          toolName += ':' + this.advance().value;

          // 继续读取点号分隔的部分（如 .dsl.skill）
          while (this.match('DOT')) {
            const propToken = this.currentToken();
            if (propToken.type === 'IDENTIFIER' || propToken.type === 'KEYWORD') {
              toolName += '.' + this.advance().value;
            } else {
              this.error('Expected IDENTIFIER or KEYWORD after DOT', propToken.loc);
              break;
            }
          }
        } else {
          this.error('Expected IDENTIFIER or KEYWORD after COLON', nextToken.loc);
        }
      } else {
        // 没有前缀，检查是否有点号（如 module.tool）
        while (this.match('DOT')) {
          const propToken = this.currentToken();
          if (propToken.type === 'IDENTIFIER' || propToken.type === 'KEYWORD') {
            toolName += '.' + this.advance().value;
          } else {
            this.error('Expected IDENTIFIER or KEYWORD after DOT', propToken.loc);
            break;
          }
        }
      }

      tools.push({
        type: 'tool',
        name: toolName,
        loc: this.createLoc(startLoc),
      });

      // 检查逗号或结束
      if (!this.match('COMMA')) {
        if (this.currentToken().type === 'RBRACKET') {
          break;
        }
      }
    }

    // 消费 RBRACKET
    this.expect('RBRACKET');

    return tools;
  }

  // ============================================================
  // 能力解析
  // ============================================================

  private parseCapability(): DSLCapability {
    const loc = this.currentToken().loc;
    // 注意：调用者已经匹配了 'capability' 关键字，不需要再次匹配
    // this.expect('KEYWORD', 'capability');

    // 能力类型可以是 IDENTIFIER 或某些 KEYWORD（如 'validation' 等）
    // 这允许用户使用常见单词作为能力类型名称
    const typeToken = this.currentToken();
    if (typeToken.type === 'IDENTIFIER' || typeToken.type === 'KEYWORD') {
      this.advance();
    } else {
      this.error('Expected IDENTIFIER or KEYWORD for capability type', typeToken.loc);
      this.advance(); // 消费当前 token 以继续
    }
    this.expect('COLON');

    const levelToken = this.advance();
    const validLevels = ['basic', 'intermediate', 'advanced', 'expert'];

    return {
      type: 'capability',
      capability_type: typeToken.value,
      level: validLevels.includes(levelToken.value)
        ? (levelToken.value as DSLCapability['level'])
        : 'intermediate',
      loc: this.createLoc(loc),
    };
  }

  // ============================================================
  // Body 解析
  // ============================================================

  private parseBody(): DSLStatement[] {
    const statements: DSLStatement[] = [];

    while (this.currentToken().type !== 'RBRACE' && this.currentToken().type !== 'EOF') {
      const keyword = this.currentToken().value;

      if (keyword === 'step') {
        this.advance(); // 消费 'step' 关键字
        statements.push(this.parseStep());
      } else if (keyword === 'conditional_step') {
        this.advance(); // 消费 'conditional_step' 关键字
        statements.push(this.parseConditionalStep());
      } else if (keyword === 'condition') {
        this.advance(); // 消费 'condition' 关键字
        statements.push(this.parseCondition());
      } else if (keyword === 'loop') {
        this.advance(); // 消费 'loop' 关键字
        statements.push(this.parseLoop());
      } else if (keyword === 'parallel') {
        this.advance(); // 消费 'parallel' 关键字
        statements.push(this.parseParallel());
      } else if (keyword === 'try_catch') {
        this.advance(); // 消费 'try_catch' 关键字
        statements.push(this.parseTryCatch());
      } else {
        // 跳过未知语句
        this.advance();
      }
    }

    return statements;
  }

  private parseStep(): DSLStep {
    const loc = this.currentToken().loc;
    // 注意：调用者已经消费了 'step' 关键字
    // this.expect('KEYWORD', 'step');

    const nameToken = this.currentToken();
    let name: string | undefined;
    if (nameToken.type === 'IDENTIFIER') {
      name = this.advance().value;
    }

    this.expect('LBRACE');

    // 解析调用
    // 语法：call <agent|skill|tool>:<name> 或 call: { type: agent|skill|tool, name|skill_id: <string> }
    this.expect('KEYWORD', 'call');

    // 现在当前 token 可能是：
    // 1. COLON - 对象字面量语法 (call: { type: agent, name: ... })
    // 2. KEYWORD (agent/skill/tool) - 简化语法 (call agent: "name")
    if (this.currentToken().type === 'COLON') {
      this.advance(); // 消费冒号，进入对象字面量语法
    }

    const call = this.parseCall();

    // 解析输入绑定
    const inputs: Record<string, DSLExpression> = {};
    if (this.match('KEYWORD', 'inputs')) {
      this.expect('COLON');
      Object.assign(inputs, this.parseObjectLiteral());
    }

    // 解析输出绑定
    let outputs: Record<string, string> | undefined;
    if (this.match('KEYWORD', 'outputs')) {
      this.expect('COLON');
      outputs = this.parseObjectLiteral() as Record<string, string>;
    }

    // 解析重试配置
    let retry: DSLRetry | undefined;
    if (this.match('KEYWORD', 'retry')) {
      // 检查是否有冒号（兼容两种语法：retry: { 和 retry {）
      if (this.currentToken().type === 'COLON') {
        this.advance(); // 跳过冒号
      }
      this.expect('LBRACE');
      retry = this.parseRetryConfig();
      this.expect('RBRACE');
    }

    this.expect('RBRACE');

    return {
      type: 'step',
      name,
      call,
      inputs,
      outputs,
      retry,
      loc: this.createLoc(loc),
    };
  }

  /**
   * 解析条件分支步骤
   *
   * 语法：
   * conditional_step <name>? {
   *   branches: [
   *     { if: <expression>, then: <call> },
   *     { if: <expression>, then: <call> },
   *     { else: <call> }
   *   ],
   *   inputs: { <key>: <expression>, ... },
   *   outputs?: { <key>: <path>, ... }
   * }
   */
  private parseConditionalStep(): DSLConditionalStep {
    const loc = this.currentToken().loc;
    // 注意：调用者已经消费了 'conditional_step' 关键字
    // this.expect('KEYWORD', 'conditional_step');

    const nameToken = this.currentToken();
    let name: string | undefined;
    // 名称可以是 IDENTIFIER 或非结构性的 KEYWORD
    // 允许使用 KEYWORD 作为名称（除了 branches, inputs, outputs, if, then, else）
    if (nameToken.type === 'IDENTIFIER' ||
        (nameToken.type === 'KEYWORD' &&
         !['branches', 'inputs', 'outputs', 'if', 'then', 'else'].includes(nameToken.value))) {
      name = this.advance().value;
    }

    this.expect('LBRACE');

    // 解析 branches 数组
    this.expect('KEYWORD', 'branches');
    this.expect('COLON');
    const branches = this.parseBranches();

    // branches 数组后面可能有逗号
    if (this.match('COMMA')) {
      // 已消费逗号
    }

    // 解析可选的 inputs 对象
    const inputs: Record<string, DSLExpression> = {};
    if (this.match('KEYWORD', 'inputs')) {
      this.expect('COLON');
      Object.assign(inputs, this.parseObjectLiteral() as Record<string, DSLExpression>);
      // inputs 对象后面可能有逗号
      if (this.match('COMMA')) {
        // 已消费逗号
      }
    }

    // 解析可选的 outputs 对象
    let outputs: Record<string, string> | undefined;
    if (this.match('KEYWORD', 'outputs')) {
      this.expect('COLON');
      outputs = this.parseObjectLiteral() as Record<string, string>;
    }

    this.expect('RBRACE');

    return {
      type: 'conditional_step',
      name,
      branches,
      inputs,
      outputs,
      loc: this.createLoc(loc),
    };
  }

  /**
   * 解析条件分支数组
   *
   * branches: [
   *   { if: <expr>, then: <call> },
   *   { else: <call> }
   * ]
   */
  private parseBranches(): ConditionalBranch[] {
    const branches: ConditionalBranch[] = [];

    this.expect('LBRACKET');

    let branchCount = 0;
    while (this.currentToken().type !== 'RBRACKET' && this.currentToken().type !== 'EOF') {
      // 空数组检查
      if (this.currentToken().type === 'RBRACKET') {
        break;
      }

      branchCount++;

      // 每个分支是一个对象字面量 { if: ..., then: ... } 或 { else: ... }
      this.expect('LBRACE');
      const branch = this.parseBranch();

      this.expect('RBRACE');

      branches.push(branch);

      const hasComma = this.match('COMMA');

      if (!hasComma) {
        // 没有逗号，应该是数组结束
        break;
      }
    }

    this.expect('RBRACKET');
    return branches;
  }

  /**
   * 解析单个条件分支
   *
   * { if: <expr>, then: <call> } 或 { else: <call> }
   */
  private parseBranch(): ConditionalBranch {
    const branch: ConditionalBranch = {};

    while (this.currentToken().type !== 'RBRACE' && this.currentToken().type !== 'EOF') {
      const key = this.advance().value;
      this.expect('COLON');

      if (key === 'if') {
        branch.if = this.parseExpression();
      } else if (key === 'then') {
        // then 的值可以是一个 call（简化语法：agent:name）或一个完整的 call 对象
        branch.then = this.parseCall();
      } else if (key === 'else') {
        // else 的值可以是一个 call（简化语法：agent:name）或一个完整的 call 对象
        branch.else = this.parseCall();
      } else {
        // 未知属性，跳过值
        this.parseExpression();
      }

      // 检查逗号或结束
      // 如果有逗号，消费它并继续循环
      // 如果没有逗号，说明是最后一个属性，退出循环
      if (this.currentToken().type === 'COMMA') {
        this.advance(); // 消费逗号，继续循环解析下一个属性
      } else {
        // 没有逗号，退出循环（while 条件会检查 RBRACE）
        break;
      }
    }

    return branch;
  }

  /**
   * 解析 Agent/Skill/Tool 调用
   *
   * 语法：{ type: agent|skill|tool, name|skill_id: <string> }
   * 或简化语法：agent:<name> | skill:<id> | tool:<name>
   *
   * 为了支持内嵌在 branches 中的简化语法，我们检测当前 token：
   * - 如果是 LBRACE，解析完整对象
   * - 如果是 IDENTIFIER/KEYWORD (agent/skill/tool)，解析简化语法
   */
  private parseCall(): DSLCall {
    const token = this.currentToken();

    // 检查是否是对象字面量语法 { type: agent, name: ... }
    if (token.type === 'LBRACE') {
      this.expect('LBRACE');

      let callType: string | undefined;
      let targetName: string | undefined;

      while (this.currentToken().type !== 'RBRACE' && this.currentToken().type !== 'EOF') {
        const key = this.advance().value;
        this.expect('COLON');

        if (key === 'type') {
          const typeToken = this.advance();
          callType = typeToken.value;
        } else if (key === 'name' || key === 'skill_id') {
          const valueToken = this.advance();
          targetName = valueToken.value;
        } else {
          // 未知属性，跳过值
          this.advance();
        }

        // 检查逗号或结束
        if (!this.match('COMMA')) {
          if (this.currentToken().type === 'RBRACE') {
            break;
          }
        }
      }

      this.expect('RBRACE');

      // 根据类型创建 DSLCall
      if (callType === 'agent') {
        return { type: 'agent', name: targetName || 'unknown' };
      } else if (callType === 'skill') {
        return { type: 'skill', skill_id: targetName || 'unknown' };
      } else if (callType === 'tool') {
        return { type: 'tool', name: targetName || 'unknown' };
      }
      // 默认返回 agent
      return { type: 'agent', name: targetName || 'unknown' };
    }

    // 简化语法：agent:<name> 或 skill:<id> 或 tool:<name>
    const callType = this.advance().value; // agent, skill, 或 tool
    this.expect('COLON');
    const target = this.advance().value; // 名称或ID

    if (callType === 'agent') {
      return { type: 'agent', name: target };
    } else if (callType === 'skill') {
      return { type: 'skill', skill_id: target };
    } else if (callType === 'tool') {
      return { type: 'tool', name: target };
    }

    // 默认返回 agent
    return { type: 'agent', name: target };
  }

  private parseCondition(): DSLCondition {
    const loc = this.currentToken().loc;
    // 注意：调用者已经消费了 'condition' 关键字
    // this.expect('KEYWORD', 'condition');

    const nameToken = this.currentToken();
    // 名称可以是 IDENTIFIER 或非结构性的 KEYWORD
    // 允许使用 KEYWORD 作为名称（除了 test, consequent, alternate）
    if (nameToken.type === 'IDENTIFIER' ||
        (nameToken.type === 'KEYWORD' &&
         !['test', 'consequent', 'alternate'].includes(nameToken.value))) {
      this.advance(); // 条件名称
    }

    this.expect('LBRACE');

    this.expect('KEYWORD', 'test');
    this.expect('COLON');
    const test = this.parseExpression();

    this.expect('KEYWORD', 'consequent');
    this.expect('COLON');
    const consequent = this.parseStatementList();

    let alternate: DSLStatement[] | undefined;
    if (this.match('KEYWORD', 'alternate')) {
      this.expect('COLON');
      alternate = this.parseStatementList();
    }

    this.expect('RBRACE');

    return {
      type: 'condition',
      test,
      consequent,
      alternate,
      loc: this.createLoc(loc),
    };
  }

  private parseLoop(): DSLLoop {
    const loc = this.currentToken().loc;
    // 注意：调用者已经消费了 'loop' 关键字
    // this.expect('KEYWORD', 'loop');

    const nameToken = this.currentToken();
    // 名称可以是 IDENTIFIER 或非结构性的 KEYWORD
    // 允许使用 KEYWORD 作为名称（除了 loop_type, variable, collection, test, body）
    if (nameToken.type === 'IDENTIFIER' ||
        (nameToken.type === 'KEYWORD' &&
         !['loop_type', 'variable', 'collection', 'test', 'body'].includes(nameToken.value))) {
      this.advance(); // 循环名称
    }

    this.expect('LBRACE');

    this.expect('KEYWORD', 'loop_type');
    this.expect('COLON');
    const loopType = this.advance().value as 'for' | 'while' | 'for_each';

    let variable: string | undefined;
    let collection: DSLExpression | undefined;
    let test: DSLExpression | undefined;

    if (loopType === 'for' || loopType === 'for_each') {
      this.expect('KEYWORD', 'variable');
      this.expect('COLON');
      variable = this.advance().value;

      this.expect('KEYWORD', 'collection');
      this.expect('COLON');
      collection = this.parseExpression();
    } else if (loopType === 'while') {
      this.expect('KEYWORD', 'test');
      this.expect('COLON');
      test = this.parseExpression();
    }

    this.expect('KEYWORD', 'body');
    this.expect('COLON');
    const body = this.parseStatementList();

    this.expect('RBRACE');

    return {
      type: 'loop',
      loop_type: loopType,
      variable,
      collection,
      test,
      body,
      loc: this.createLoc(loc),
    };
  }

  private parseParallel(): DSLParallel {
    const loc = this.currentToken().loc;
    // 注意：调用者已经消费了 'parallel' 关键字
    // this.expect('KEYWORD', 'parallel');

    const nameToken = this.currentToken();
    // 名称可以是 IDENTIFIER 或非结构性的 KEYWORD
    // 允许使用 KEYWORD 作为名称（除了 branches）
    if (nameToken.type === 'IDENTIFIER' ||
        (nameToken.type === 'KEYWORD' &&
         nameToken.value !== 'branches')) {
      this.advance(); // 并行名称
    }

    this.expect('LBRACE');

    this.expect('KEYWORD', 'branches');
    this.expect('COLON');
    this.expect('LBRACKET');

    const branches: DSLStatement[][] = [];
    while (this.currentToken().type !== 'RBRACKET' && this.currentToken().type !== 'EOF') {
      // branches 数组中的每个元素是一个语句块
      // 语法: branches: [{ statements }, { statements }]

      // 如果当前 token 是 LBRACE，说明分支在 {} 中，需要先消费
      if (this.currentToken().type === 'LBRACE') {
        this.advance(); // 消费分支的 {
      }

      // 解析语句列表直到遇到 }
      // 注意：不检查 LBRACE，因为嵌套语句会消费自己的 LBRACE 和 RBRACE
      const branchStatements: DSLStatement[] = [];
      while (this.currentToken().type !== 'RBRACE' &&
             this.currentToken().type !== 'EOF') {
        const keyword = this.currentToken().value;

        if (keyword === 'step') {
          this.advance();
          branchStatements.push(this.parseStep());
        } else if (keyword === 'conditional_step') {
          this.advance();
          branchStatements.push(this.parseConditionalStep());
        } else if (keyword === 'condition') {
          this.advance();
          branchStatements.push(this.parseCondition());
        } else if (keyword === 'loop') {
          this.advance();
          branchStatements.push(this.parseLoop());
        } else if (keyword === 'parallel') {
          this.advance();
          branchStatements.push(this.parseParallel());
        } else if (keyword === 'try_catch') {
          this.advance();
          branchStatements.push(this.parseTryCatch());
        } else {
          // 未知关键字，消费它
          this.advance();
        }
      }
      branches.push(branchStatements);

      // 消费分支的 }
      this.expect('RBRACE');

      // 检查逗号或结束
      if (!this.match('COMMA')) {
        // 如果没有逗号，检查是否到达数组末尾
        if (this.currentToken().type === 'RBRACKET') {
          // 消费 RBRACKET 并退出循环
          this.advance();
          break;
        }
      }
    }
    // 如果循环因为遇到 RBRACKET 而退出，RBRACKET 已经被消费
    // 否则，这里需要消费 RBRACKET（当最后一个分支后有逗号时）
    if (this.currentToken().type === 'RBRACKET') {
      this.advance();
    }

    let max_concurrency: DSLExpression | number | undefined;
    if (this.match('KEYWORD', 'max_concurrency')) {
      this.expect('COLON');
      // 检查是否是数字字面量或表达式
      const token = this.currentToken();
      if (token.type === 'NUMBER') {
        max_concurrency = parseInt(this.advance().value, 10);
      } else {
        // 解析表达式（如 input.concurrency）
        max_concurrency = this.parseExpression();
      }
    }

    this.expect('RBRACE');

    return {
      type: 'parallel',
      branches,
      max_concurrency,
      loc: this.createLoc(loc),
    };
  }

  private parseTryCatch(): DSLTryCatch {
    const loc = this.currentToken().loc;
    // 注意：调用者已经消费了 'try_catch' 关键字
    // this.expect('KEYWORD', 'try_catch');

    const nameToken = this.currentToken();
    if (nameToken.type === 'IDENTIFIER') {
      this.advance(); // try_catch 名称
    }

    this.expect('LBRACE');

    this.expect('KEYWORD', 'try_block');
    this.expect('COLON');
    const try_block = this.parseStatementList();

    let catch_variable: string | undefined;
    let catch_block: DSLStatement[] | undefined;

    if (this.match('KEYWORD', 'catch_variable')) {
      this.expect('COLON');
      catch_variable = this.advance().value;
    }

    if (this.match('KEYWORD', 'catch_block')) {
      this.expect('COLON');
      catch_block = this.parseStatementList();
    }

    let finally_block: DSLStatement[] | undefined;
    if (this.match('KEYWORD', 'finally_block')) {
      this.expect('COLON');
      finally_block = this.parseStatementList();
    }

    this.expect('RBRACE');

    return {
      type: 'try_catch',
      try_block,
      catch_variable,
      catch_block,
      finally_block,
      loc: this.createLoc(loc),
    };
  }

  private parseStatementList(): DSLStatement[] {
    const statements: DSLStatement[] = [];

    this.expect('LBRACE');

    while (this.currentToken().type !== 'RBRACE' && this.currentToken().type !== 'EOF') {
      const keyword = this.currentToken().value;

      if (keyword === 'step') {
        this.advance(); // 消费 'step' 关键字
        statements.push(this.parseStep());
      } else if (keyword === 'conditional_step') {
        this.advance(); // 消费 'conditional_step' 关键字
        statements.push(this.parseConditionalStep());
      } else if (keyword === 'condition') {
        this.advance(); // 消费 'condition' 关键字
        statements.push(this.parseCondition());
      } else if (keyword === 'loop') {
        this.advance(); // 消费 'loop' 关键字
        statements.push(this.parseLoop());
      } else if (keyword === 'parallel') {
        this.advance(); // 消费 'parallel' 关键字
        statements.push(this.parseParallel());
      } else if (keyword === 'try_catch') {
        this.advance(); // 消费 'try_catch' 关键字
        statements.push(this.parseTryCatch());
      } else {
        this.advance();
      }
    }

    this.expect('RBRACE');

    return statements;
  }

  // ============================================================
  // 表达式解析
  // ============================================================

  private parseExpression(): DSLExpression {
    return this.parseConditional();
  }

  /**
   * 解析三元运算符 (test ? consequent : alternate)
   * 三元运算符的优先级低于逻辑或运算符
   */
  private parseConditional(): DSLExpression {
    const test = this.parseLogicalOr();

    // 检查是否有问号，表示三元运算符
    if (this.match('QUERY')) {
      const consequent = this.parseExpression();
      this.expect('COLON');
      const alternate = this.parseExpression();

      return {
        type: 'conditional_expression',
        test,
        consequent,
        alternate,
        loc: test.loc,
      } as any;
    }

    return test;
  }

  private parseLogicalOr(): DSLExpression {
    let left = this.parseLogicalAnd();

    while (this.match('OR')) {
      const right = this.parseLogicalAnd();
      left = {
        type: 'binary_op',
        operator: '||',
        left,
        right,
        loc: left.loc,
      };
    }

    return left;
  }

  private parseLogicalAnd(): DSLExpression {
    let left = this.parseEquality();

    while (this.match('AND')) {
      const right = this.parseEquality();
      left = {
        type: 'binary_op',
        operator: '&&',
        left,
        right,
        loc: left.loc,
      };
    }

    return left;
  }

  private parseEquality(): DSLExpression {
    let left = this.parseComparison();

    while (this.currentToken().type === 'EQ' || this.currentToken().type === 'NEQ') {
      const op = this.advance();
      const right = this.parseComparison();
      left = {
        type: 'binary_op',
        operator: op.value as BinaryOperator,
        left,
        right,
        loc: left.loc,
      };
    }

    return left;
  }

  private parseComparison(): DSLExpression {
    let left = this.parseAdditive();

    while (
      this.currentToken().type === 'LT' ||
      this.currentToken().type === 'GT' ||
      this.currentToken().type === 'LTE' ||
      this.currentToken().type === 'GTE'
    ) {
      const op = this.advance();
      const right = this.parseAdditive();
      left = {
        type: 'binary_op',
        operator: op.value as BinaryOperator,
        left,
        right,
        loc: left.loc,
      };
    }

    return left;
  }

  private parseAdditive(): DSLExpression {
    let left = this.parseMultiplicative();

    while (this.currentToken().type === 'PLUS' || this.currentToken().type === 'MINUS') {
      const op = this.advance();
      const right = this.parseMultiplicative();
      left = {
        type: 'binary_op',
        operator: op.value as BinaryOperator,
        left,
        right,
        loc: left.loc,
      };
    }

    return left;
  }

  private parseMultiplicative(): DSLExpression {
    let left = this.parseUnary();

    while (
      this.currentToken().type === 'STAR' ||
      this.currentToken().type === 'SLASH' ||
      this.currentToken().type === 'PERCENT'
    ) {
      const op = this.advance();
      const right = this.parseUnary();
      left = {
        type: 'binary_op',
        operator: op.value as BinaryOperator,
        left,
        right,
        loc: left.loc,
      };
    }

    return left;
  }

  private parseUnary(): DSLExpression {
    if (this.currentToken().type === 'NOT' || this.currentToken().type === 'MINUS') {
      const op = this.advance();
      const operand = this.parseUnary();
      return {
        type: 'unary_op',
        operator: op.value as '!' | '-' | '+',
        operand,
        loc: op.loc,
      };
    }

    return this.parsePostfix();
  }

  private parsePostfix(): DSLExpression {
    let expr = this.parsePrimary();

    // 循环处理属性访问和函数调用的组合
    while (true) {
      // 属性访问 (e.g., input.tasks)
      if (this.match('DOT')) {
        const propToken = this.currentToken();
        // 允许 IDENTIFIER 或 KEYWORD 作为属性名（因为 output, input 等是关键字）
        if (propToken.type === 'IDENTIFIER' || propToken.type === 'KEYWORD') {
          this.advance();
          expr = {
            type: 'property_access',
            object: expr,
            property: propToken.value,
            loc: expr.loc,
          } as DSLPropertyAccess;
        } else {
          this.error('Expected IDENTIFIER or KEYWORD for property name', propToken.loc);
          this.advance(); // 消费错误的 token 以继续
        }
        continue; // 继续检查是否有函数调用
      }

      // 函数调用 (e.g., input.tasks.slice(0, 10))
      if (this.currentToken().type === 'LPAREN') {
        this.expect('LPAREN');
        const args: DSLExpression[] = [];
        while (this.currentToken().type !== 'RPAREN' && this.currentToken().type !== 'EOF') {
          args.push(this.parseExpression());
          if (!this.match('COMMA')) break;
        }
        this.expect('RPAREN');

        expr = {
          type: 'function_call',
          function: expr, // 函数名可以是属性访问表达式
          arguments: args,
          loc: expr.loc,
        } as any;
        continue; // 继续检查是否有后续的属性访问或函数调用
      }

      // 没有更多的后缀操作
      break;
    }

    return expr;
  }

  private parsePrimary(): DSLExpression {
    const token = this.currentToken();

    // 对象字面量（在 default 值等上下文中使用）
    if (token.type === 'LBRACE') {
      const obj = this.parseObjectLiteral();
      // 将对象字面量转换为表达式（简化处理）
      return {
        type: 'literal',
        value: obj as any, // 将对象存储为字面量值
        loc: this.createLoc(token.loc),
      };
    }

    // 数组字面量
    if (token.type === 'LBRACKET') {
      return this.parseArrayLiteral();
    }

    // 函数调用（需要在变量引用之前检查）
    if (token.type === 'IDENTIFIER' && this.peekToken().type === 'LPAREN') {
      const name = this.advance().value;
      this.expect('LPAREN');

      const args: DSLExpression[] = [];
      while (this.currentToken().type !== 'RPAREN' && this.currentToken().type !== 'EOF') {
        args.push(this.parseExpression());
        if (!this.match('COMMA')) break;
      }
      this.expect('RPAREN');

      return {
        type: 'function_call',
        function: name,
        arguments: args,
        loc: this.createLoc(token.loc),
      };
    }

    // 变量引用 - 支持 IDENTIFIER 和某些 KEYWORD（如 input）
    // input, output 等关键字可以作为变量名使用
    if (token.type === 'IDENTIFIER' ||
        (token.type === 'KEYWORD' && ['input', 'output', 'this'].includes(token.value))) {
      this.advance();
      return {
        type: 'variable',
        name: token.value,
        loc: this.createLoc(token.loc),
      };
    }

    // 字符串字面量
    if (token.type === 'STRING') {
      this.advance();
      // 检查是否是模板字符串
      if (token.value.includes('${')) {
        return {
          type: 'template_string',
          parts: [token.value],
          loc: this.createLoc(token.loc),
        } as DSLTemplateString;
      }
      return {
        type: 'literal',
        value: token.value,
        loc: this.createLoc(token.loc),
      };
    }

    // 数字字面量
    if (token.type === 'NUMBER') {
      this.advance();
      return {
        type: 'literal',
        value: parseFloat(token.value),
        loc: this.createLoc(token.loc),
      };
    }

    // 布尔字面量
    if (token.type === 'BOOLEAN') {
      this.advance();
      return {
        type: 'literal',
        value: token.value === 'true',
        loc: this.createLoc(token.loc),
      };
    }

    // 括号表达式
    if (this.match('LPAREN')) {
      const expr = this.parseExpression();
      this.expect('RPAREN');
      return expr;
    }

    // 默认返回字面量
    this.advance();
    return {
      type: 'literal',
      value: null,
      loc: this.createLoc(token.loc),
    };
  }

  // ============================================================
  // 对象字面量解析
  // ============================================================

  private parseObjectLiteral(): Record<string, DSLExpression | string> {
    const obj: Record<string, DSLExpression | string> = {};

    this.expect('LBRACE');

    while (!this.match('RBRACE') && this.currentToken().type !== 'EOF') {
      const key = this.advance().value;
      this.expect('COLON');

      // 使用 parseExpression 来解析值，这样可以处理所有类型的表达式
      obj[key] = this.parseExpression();

      // 检查是否有逗号分隔
      // 如果没有逗号，下一个 token 应该是 RBRACE（循环会处理）
      this.match('COMMA');
    }

    return obj;
  }

  // ============================================================
  // 数组字面量解析
  // ============================================================

  private parseArrayLiteral(): DSLExpression {
    const startToken = this.currentToken();
    this.expect('LBRACKET');

    const elements: DSLExpression[] = [];

    while (this.currentToken().type !== 'RBRACKET' && this.currentToken().type !== 'EOF') {
      // 空数组检查
      if (this.currentToken().type === 'RBRACKET') {
        break;
      }
      elements.push(this.parseExpression());
      if (!this.match('COMMA')) {
        // 没有逗号，应该是数组结束
        break;
      }
    }

    this.expect('RBRACKET');

    return {
      type: 'array_literal',
      elements,
      loc: this.createLoc(startToken.loc),
    };
  }

  // ============================================================
  // 治理配置解析
  // ============================================================

  private parseGovernance(): DSLGovernance {
    // 注意：调用者已经消费了 'governance' 关键字
    // this.expect('KEYWORD', 'governance');
    this.expect('LBRACE');

    const governance: DSLGovernance = {
      first_principles_check: false,
      red_team_threshold: 'medium',
      quality_gate_enabled: true,
      max_retries: 3,
      token_budget: 100000,
    };

    while (!this.match('RBRACE') && this.currentToken().type !== 'EOF') {
      const prop = this.currentToken().value;
      this.advance();
      this.expect('COLON');

      const valueToken = this.advance();

      switch (prop) {
        case 'first_principles_check':
          governance.first_principles_check = valueToken.value === 'true';
          break;
        case 'red_team_threshold':
          governance.red_team_threshold = valueToken.value as any;
          break;
        case 'quality_gate_enabled':
          governance.quality_gate_enabled = valueToken.value === 'true';
          break;
        case 'max_retries':
          governance.max_retries = parseInt(valueToken.value, 10);
          break;
        case 'token_budget':
          governance.token_budget = parseInt(valueToken.value, 10);
          break;
      }
    }

    return governance;
  }

  // ============================================================
  // 元数据解析
  // ============================================================

  private parseMetadata(): DSLMetadata {
    // 注意：调用者已经消费了 'metadata' 关键字
    // this.expect('KEYWORD', 'metadata');
    this.expect('LBRACE');

    const metadata: DSLMetadata = {};

    while (!this.match('RBRACE') && this.currentToken().type !== 'EOF') {
      const prop = this.currentToken().value;
      this.advance();
      this.expect('COLON');

      const valueToken = this.currentToken();

      switch (prop) {
        case 'author':
          metadata.author = this.advance().value;
          break;
        case 'version':
          metadata.version = this.advance().value;
          break;
        case 'license':
          metadata.license = this.advance().value;
          break;
        case 'tags':
          if (valueToken.type === 'LBRACKET') {
            this.advance(); // 消费 LBRACKET
            const tags: string[] = [];
            while (this.currentToken().type !== 'RBRACKET' && this.currentToken().type !== 'EOF') {
              if (this.currentToken().type === 'STRING') {
                tags.push(this.advance().value);
              } else {
                this.advance(); // 跳过非字符串 token
              }
              // 检查是否有逗号
              if (this.currentToken().type === 'COMMA') {
                this.advance();
              }
            }
            this.expect('RBRACKET'); // 消费 RBRACKET
            metadata.tags = tags;
          } else {
            // 如果不是数组，作为单个字符串处理
            metadata.tags = [this.advance().value];
          }
          break;
        default:
          // 跳过未知属性
          this.advance();
          break;
      }
    }

    return metadata;
  }

  // ============================================================
  // 重试配置解析
  // ============================================================

  private parseRetryConfig(): DSLRetry {
    const retry: DSLRetry = {
      max_attempts: 3,
      backoff_ms: 1000,
    };

    while (this.currentToken().type !== 'RBRACE' && this.currentToken().type !== 'EOF') {
      const prop = this.currentToken().value;
      this.advance();
      this.expect('COLON');
      const value = parseInt(this.advance().value, 10);

      if (prop === 'max_attempts') {
        retry.max_attempts = value;
      } else if (prop === 'backoff_ms') {
        retry.backoff_ms = value;
      }

      // 跳过逗号（如果存在）
      if (this.currentToken().type === 'COMMA') {
        this.advance();
      }
    }

    return retry;
  }
}

// ============================================================
// DSLParser 公共接口
// ============================================================

export class DSLParser {
  /**
   * 静态 LRU 缓存，用于缓存解析结果
   * 缓存键为源码的 SHA256 哈希值
   */
  private static parseCache: LRUCacheWithTTL<string, ParseResult> =
    createLRUCacheWithTTL<string, ParseResult>(
      500,    // 最大缓存 500 个解析结果
      600000  // TTL: 10 分钟
    );

  /**
   * 静态 Lexer 对象池
   *
   * 用于复用 Lexer 实例，减少小文件解析的性能波动。
   * 默认池大小为 10，可根据需要调整。
   */
  private static lexerPool: ObjectPool<Lexer> = new ObjectPool<Lexer>(
    // 工厂函数：创建新 Lexer（使用默认源码）
    () => new Lexer('', '<unknown>'),
    // 重置函数：在使用前会调用 setSource，这里不需要额外操作
    undefined,
    10  // 默认池大小
  );

  /**
   * 生成源码的缓存键（SHA256 哈希）
   *
   * @param source - DSL 源码字符串
   * @returns 十六进制哈希值
   */
  private static generateCacheKey(source: string): string {
    return createHash('sha256').update(source, 'utf8').digest('hex');
  }

  /**
   * 解析 DSL 源码为 AST（带缓存）
   *
   * @param source - DSL 源码字符串
   * @param filename - 文件名（用于错误报告）
   * @param useCache - 是否使用缓存（默认 true）
   * @returns 解析结果
   */
  parse(source: string, filename: string = '<unknown>', useCache: boolean = true): ParseResult {
    // 如果启用缓存，尝试从缓存获取
    if (useCache) {
      const cacheKey = DSLParser.generateCacheKey(source);
      const cached = DSLParser.parseCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    // 缓存未命中或禁用缓存，执行解析
    const result = this.parseInternal(source, filename);

    // 如果解析成功且启用缓存，存入缓存
    if (useCache && result.success) {
      const cacheKey = DSLParser.generateCacheKey(source);
      DSLParser.parseCache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * 解析 DSL 源码为 AST（内部实现，不使用缓存）
   *
   * 使用对象池优化 Lexer 实例复用，减少小文件解析的性能波动。
   *
   * @param source - DSL 源码字符串
   * @param filename - 文件名（用于错误报告）
   * @returns 解析结果
   */
  private parseInternal(source: string, filename: string = '<unknown>'): ParseResult {
    try {
      let tokens: Token[];

      // 使用对象池：获取 -> 设置源码 -> 词法分析 -> 释放
      const lexer = DSLParser.lexerPool.acquire();

      try {
        // 设置新的源码（包含 reset）
        lexer.setSource(source, filename);
        // 执行词法分析
        tokens = lexer.tokenize();
      } finally {
        // 归还到池中
        DSLParser.lexerPool.release(lexer);
      }

      // 语法解析（Parser 是无状态的，不需要池化）
      const parser = new Parser(tokens, filename);
      return parser.parse();
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            kind: 'syntax',
            message: error instanceof Error ? error.message : String(error),
            loc: {
              file: filename,
              line: 1,
              column: 1,
            },
          },
        ],
      };
    }
  }

  /**
   * 获取解析缓存的统计信息
   *
   * @returns 缓存统计数据
   */
  static getCacheStats() {
    return DSLParser.parseCache.getStats();
  }

  /**
   * 清空解析缓存
   */
  static clearParseCache(): void {
    DSLParser.parseCache.clear();
  }

  /**
   * 清理过期的缓存条目
   *
   * @returns 清理的条目数量
   */
  static purgeExpiredCache(): number {
    return DSLParser.parseCache.purgeExpired();
  }

  /**
   * 获取 Lexer 对象池的统计信息
   *
   * 用于监控对象池的性能和命中率，验证优化效果。
   *
   * @returns 对象池统计数据，包括命中率、获取次数、当前大小等
   */
  static getLexerPoolStats(): ReturnType<ObjectPool<Lexer>['getStats']> {
    return DSLParser.lexerPool.getStats();
  }

  /**
   * 清空 Lexer 对象池
   *
   * 强制释放所有池中的 Lexer 实例。
   * 主要用于测试或内存管理。
   */
  static clearLexerPool(): void {
    DSLParser.lexerPool.clear();
  }

  /**
   * 重置 Lexer 对象池统计信息
   *
   * 用于测试时重新开始统计计数。
   */
  static resetLexerPoolStats(): void {
    DSLParser.lexerPool.resetStats();
  }

  /**
   * 从文件解析 DSL
   *
   * @param filepath - 文件路径
   * @returns 解析结果
   */
  parseFile(filepath: string): ParseResult {
    // 这个方法需要在实际使用时实现文件读取
    // 当前返回错误提示需要使用其他方法
    return {
      success: false,
      errors: [
        {
          kind: 'syntax',
          message: 'parseFile not implemented - use parse() with file content',
          loc: {
            file: filepath,
            line: 1,
            column: 1,
          },
        },
      ],
    };
  }

  /**
   * 验证 AST
   *
   * @param ast - AST 节点
   * @returns 验证结果
   */
  validate(ast: AgentDSL): {
    valid: boolean;
    errors: Array<{ message: string; loc: SourceLocation }>;
  } {
    const errors: Array<{ message: string; loc: SourceLocation }> = [];

    // 基本验证
    if (!ast.name) {
      errors.push({
        message: 'Agent name is required',
        loc: ast.loc || { file: '', line: 1, column: 1 },
      });
    }

    if (!ast.description) {
      errors.push({
        message: 'Agent description is required',
        loc: ast.loc || { file: '', line: 1, column: 1 },
      });
    }

    // 输入名称唯一性
    const inputNames = new Set<string>();
    for (const input of ast.inputs) {
      if (inputNames.has(input.name)) {
        errors.push({
          message: `Duplicate input name: ${input.name}`,
          loc: input.loc || { file: '', line: 1, column: 1 },
        });
      }
      inputNames.add(input.name);
    }

    // 输出名称唯一性
    const outputNames = new Set<string>();
    for (const output of ast.outputs) {
      if (outputNames.has(output.name)) {
        errors.push({
          message: `Duplicate output name: ${output.name}`,
          loc: output.loc || { file: '', line: 1, column: 1 },
        });
      }
      outputNames.add(output.name);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
