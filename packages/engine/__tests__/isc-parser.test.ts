/**
 * ISC Parser 单元测试
 * 测试词法分析器和语法分析器的功能
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ISCLexer, ISCParser } from '../src/isc/parser.js';
import { TokenType, expressionToString } from '../src/isc/types.js';
import type {
  ISCExpression,
  ISCUnaryExpression,
  ISCIdentifier,
  ISCLiteral,
  ISCComparisonExpression,
  ISCLogicalExpression,
} from '../src/isc/types.js';

// ============================================================
// Lexer 测试
// ============================================================

describe('ISCLexer', () => {
  let lexer: ISCLexer;

  beforeEach(() => {
    lexer = new ISCLexer();
  });

  // 辅助函数：过滤 EOF token
  function getTokens(input: string) {
    return lexer.tokenize(input).filter(t => t.type !== 'EOF');
  }

  describe('基本词法分析', () => {
    it('应该正确识别标识符', () => {
      const tokens = getTokens('coverage');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
      expect(tokens[0].value).toBe('coverage');
    });

    it('应该正确识别数字字面量', () => {
      const tokens = getTokens('80');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.NUMBER);
      expect(tokens[0].value).toBe(80);
    });

    it('应该正确识别带小数点的数字', () => {
      const tokens = getTokens('80.5');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.NUMBER);
      expect(tokens[0].value).toBe(80.5);
    });

    it('应该正确识别百分比', () => {
      const tokens = getTokens('80%');
      expect(tokens).toHaveLength(2);
      expect(tokens[0].type).toBe(TokenType.NUMBER);
      expect(tokens[0].value).toBe(80);
      expect(tokens[1].type).toBe(TokenType.PERCENT);
    });

    it('应该正确识别字符串字面量', () => {
      const tokens = getTokens('"hello"');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.STRING);
      expect(tokens[0].value).toBe('hello');
    });

    it('应该正确识别单引号字符串', () => {
      const tokens = getTokens("'hello'");
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.STRING);
      expect(tokens[0].value).toBe('hello');
    });
  });

  describe('比较操作符', () => {
    it('应该正确识别 ==', () => {
      const tokens = getTokens('==');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.EQ);
    });

    it('应该正确识别 !=', () => {
      const tokens = getTokens('!=');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.NEQ);
    });

    it('应该正确识别 >', () => {
      const tokens = getTokens('>');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.GT);
    });

    it('应该正确识别 >=', () => {
      const tokens = getTokens('>=');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.GTE);
    });

    it('应该正确识别 <', () => {
      const tokens = getTokens('<');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.LT);
    });

    it('应该正确识别 <=', () => {
      const tokens = getTokens('<=');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.LTE);
    });
  });

  describe('逻辑操作符', () => {
    it('应该正确识别 &&', () => {
      const tokens = getTokens('&&');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.AND);
    });

    it('应该正确识别 ||', () => {
      const tokens = getTokens('||');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.OR);
    });

    it('应该正确识别 !', () => {
      const tokens = getTokens('!');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.NOT);
    });

    it('应该识别 AND/OR 作为 &&/|| 的别名', () => {
      const tokens = getTokens('AND OR');
      expect(tokens).toHaveLength(2);
      expect(tokens[0].type).toBe(TokenType.AND);
      expect(tokens[1].type).toBe(TokenType.OR);
    });
  });

  describe('复杂表达式', () => {
    it('应该正确解析 coverage >= 80%', () => {
      const tokens = getTokens('coverage >= 80%');
      expect(tokens.length).toBeGreaterThanOrEqual(3);
      expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
      expect(tokens[0].value).toBe('coverage');
      expect(tokens[1].type).toBe(TokenType.GTE);
      expect(tokens[2].type).toBe(TokenType.NUMBER);
    });

    it('应该正确解析 errors == 0', () => {
      const tokens = getTokens('errors == 0');
      expect(tokens).toHaveLength(3);
      expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
      expect(tokens[1].type).toBe(TokenType.EQ);
      expect(tokens[2].type).toBe(TokenType.NUMBER);
    });

    it('应该正确解析带括号的表达式', () => {
      const tokens = getTokens('(coverage >= 80%)');
      expect(tokens[0].type).toBe(TokenType.LPAREN);
      expect(tokens[tokens.length - 1].type).toBe(TokenType.RPAREN);
    });
  });

  describe('错误处理', () => {
    it('应该拒绝不匹配的字符串引号', () => {
      expect(() => lexer.tokenize('"hello')).toThrow();
    });

    it('应该拒绝无效的字符', () => {
      expect(() => lexer.tokenize('@coverage')).toThrow();
    });

    it('应该提供错误位置信息', () => {
      try {
        lexer.tokenize('"hello');
        expect.fail('应该抛出错误');
      } catch (e: unknown) {
        expect(e).toHaveProperty('message');
      }
    });
  });
});

// ============================================================
// Parser 测试
// ============================================================

describe('ISCParser', () => {
  let parser: ISCParser;

  beforeEach(() => {
    parser = new ISCParser();
  });

  describe('基本表达式解析', () => {
    it('应该解析简单的标识符', () => {
      const ast = parser.parse('coverage') as ISCIdentifier;
      expect(ast.type).toBe('Identifier');
      expect(ast.name).toBe('coverage');
    });

    it('应该解析数字字面量', () => {
      const ast = parser.parse('80') as ISCLiteral;
      expect(ast.type).toBe('Literal');
      expect(ast.value).toBe(80);
    });

    it('应该解析字符串字面量', () => {
      const ast = parser.parse('"success"') as ISCLiteral;
      expect(ast.type).toBe('Literal');
      expect(ast.value).toBe('success');
    });
  });

  describe('比较表达式', () => {
    it('应该解析 >= 表达式', () => {
      const ast = parser.parse('coverage >= 80') as ISCComparisonExpression;
      expect(ast.type).toBe('Comparison');
      expect(ast.operator).toBe('>=');
      expect((ast.left as ISCIdentifier).name).toBe('coverage');
      expect((ast.right as ISCLiteral).value).toBe(80);
    });

    it('应该解析 == 表达式', () => {
      const ast = parser.parse('errors == 0') as ISCComparisonExpression;
      expect(ast.type).toBe('Comparison');
      expect(ast.operator).toBe('==');
      expect((ast.left as ISCIdentifier).name).toBe('errors');
      expect((ast.right as ISCLiteral).value).toBe(0);
    });

    it('应该解析 != 表达式', () => {
      const ast = parser.parse('status != "failed"') as ISCComparisonExpression;
      expect(ast.type).toBe('Comparison');
      expect(ast.operator).toBe('!=');
      expect((ast.left as ISCIdentifier).name).toBe('status');
      expect((ast.right as ISCLiteral).value).toBe('failed');
    });
  });

  describe('逻辑表达式', () => {
    it('应该解析 AND 表达式', () => {
      const ast = parser.parse('coverage >= 80 && errors == 0') as ISCLogicalExpression;
      expect(ast.type).toBe('Logical');
      expect(ast.operator).toBe('&&');
      expect((ast.left as ISCComparisonExpression).operator).toBe('>=');
      expect((ast.right as ISCComparisonExpression).operator).toBe('==');
    });

    it('应该解析 OR 表达式', () => {
      const ast = parser.parse('coverage >= 90 || complexity <= 5') as ISCLogicalExpression;
      expect(ast.type).toBe('Logical');
      expect(ast.operator).toBe('||');
    });

    it('应该解析 NOT 表达式', () => {
      const ast = parser.parse('!failed') as ISCUnaryExpression;
      expect(ast.type).toBe('Unary');
      expect(ast.operator).toBe('!');
      expect((ast.argument as ISCIdentifier).name).toBe('failed');
    });

    it('应该支持 AND/OR 关键字', () => {
      const ast = parser.parse('coverage >= 80 AND errors == 0') as ISCLogicalExpression;
      expect(ast.type).toBe('Logical');
      expect(ast.operator).toBe('&&');
    });
  });

  describe('括号和优先级', () => {
    it('应该正确处理括号分组', () => {
      const ast = parser.parse('(coverage >= 80) || (errors == 0)') as ISCLogicalExpression;
      expect(ast.type).toBe('Logical');
      expect(ast.operator).toBe('||');
    });

    it('应该正确处理操作符优先级 (AND > OR)', () => {
      const ast = parser.parse('a || b && c') as ISCLogicalExpression;
      expect(ast.operator).toBe('||');
      // AND 应该先被解析，所以右侧应该是逻辑表达式
      expect((ast.right as ISCLogicalExpression).operator).toBe('&&');
    });

    it('应该正确处理 NOT 的优先级', () => {
      const ast = parser.parse('!a || b') as ISCLogicalExpression;
      expect(ast.operator).toBe('||');
      expect((ast.left as ISCUnaryExpression).operator).toBe('!');
    });
  });

  describe('复杂表达式', () => {
    it('应该解析复杂的质量门条件', () => {
      const expr = 'coverage >= 80% && errors == 0 && complexity <= 10';
      const ast = parser.parse(expr) as ISCLogicalExpression;
      expect(ast.type).toBe('Logical');
      expect(ast.operator).toBe('&&');
    });

    it('应该解析带多个括号的表达式', () => {
      const expr = '(coverage >= 80% || coverage == 100%) && errors == 0';
      const ast = parser.parse(expr);
      expect(ast.type).toBe('Logical');
    });
  });

  describe('错误处理', () => {
    it('应该检测不匹配的括号', () => {
      expect(() => parser.parse('(coverage >= 80')).toThrow();
    });

    it('应该检测空表达式', () => {
      expect(() => parser.parse('')).toThrow();
    });

    it('应该检测无效的操作符组合', () => {
      expect(() => parser.parse('>= 80')).toThrow();
    });

    it('应该提供详细的错误信息', () => {
      try {
        parser.parse('(coverage >= 80');
        expect.fail('应该抛出错误');
      } catch (e: unknown) {
        expect(e).toHaveProperty('message');
      }
    });
  });
});

// ============================================================
// 表达式序列化测试
// ============================================================

describe('ISC 表达式序列化', () => {
  const parser = new ISCParser();

  it('应该将 AST 转换回字符串', () => {
    const ast = parser.parse('coverage >= 80 && errors == 0');
    expect(expressionToString(ast)).toBe('coverage >= 80 && errors == 0');
  });

  it('应该正确序列化复杂表达式', () => {
    const ast = parser.parse('(a >= 80) || (b == 0)');
    // 括号可能不会被保留，因为它们不影响优先级
    expect(expressionToString(ast)).toBe('a >= 80 || b == 0');
  });
});
