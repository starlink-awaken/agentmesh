/**
 * Honeycomb v2 - ISC (Integrated Statement Criteria) Types
 *
 * ISC 是用于质量门禁验证的布尔表达式系统。
 * 支持比较操作符、逻辑操作符、嵌套属性访问等功能。
 */

// ============================================================
// AST 节点类型
// ============================================================

/** AST 节点类型枚举 */
export type ASTNodeType =
  | 'Identifier'      // 标识符: coverage, metrics.coverage
  | 'Literal'         // 字面量: 80, "success", true
  | 'Comparison'      // 比较表达式: coverage >= 80
  | 'Logical'         // 逻辑表达式: a && b, a || b
  | 'Unary'           // 一元表达式: !a
  | 'Member';         // 成员访问: obj.prop

/** 基础 AST 节点接口 */
export interface ASTNode {
  /** 节点类型 */
  type: ASTNodeType;
  /** 源代码中的位置 */
  range?: [number, number];
}

/** 标识符节点 */
export interface ISCIdentifier extends ASTNode {
  type: 'Identifier';
  /** 标识符名称，支持点号分隔的嵌套访问 */
  name: string;
}

/** 字面量节点 */
export interface ISCLiteral extends ASTNode {
  type: 'Literal';
  /** 字面量值 */
  value: string | number | boolean;
}

/** 比较操作符类型 */
export type ComparisonOperator = '==' | '!=' | '>' | '>=' | '<' | '<=';

/** 比较表达式节点 */
export interface ISCComparisonExpression extends ASTNode {
  type: 'Comparison';
  /** 比较操作符 */
  operator: ComparisonOperator;
  /** 左操作数 */
  left: ISCIdentifier | ISCLiteral | ISCMemberExpression;
  /** 右操作数 */
  right: ISCIdentifier | ISCLiteral | ISCMemberExpression;
}

/** 逻辑操作符类型 */
export type LogicalOperator = '&&' | '||';

/** 逻辑表达式节点 */
export interface ISCLogicalExpression extends ASTNode {
  type: 'Logical';
  /** 逻辑操作符 */
  operator: LogicalOperator;
  /** 左操作数 */
  left: ISCExpression;
  /** 右操作数 */
  right: ISCExpression;
}

/** 一元操作符类型 */
export type UnaryOperator = '!';

/** 一元表达式节点 */
export interface ISCUnaryExpression extends ASTNode {
  type: 'Unary';
  /** 一元操作符 */
  operator: UnaryOperator;
  /** 操作数 */
  argument: ISCExpression;
}

/** 成员访问表达式节点 */
export interface ISCMemberExpression extends ASTNode {
  type: 'Member';
  /** 对象 */
  object: ISCIdentifier | ISCMemberExpression;
  /** 属性名 */
  property: string;
  /** 是否使用计算属性（括号访问） */
  computed: boolean;
}

/** 所有表达式类型的联合 */
export type ISCExpression =
  | ISCIdentifier
  | ISCLiteral
  | ISCComparisonExpression
  | ISCLogicalExpression
  | ISCUnaryExpression
  | ISCMemberExpression;

// ============================================================
// Token 类型
// ============================================================

/** Token 类型枚举 */
export enum TokenType {
  // 字面量和标识符
  IDENTIFIER = 'IDENTIFIER',
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  BOOLEAN = 'BOOLEAN',  // true, false
  PERCENT = 'PERCENT',  // % 符号

  // 操作符
  EQ = 'EQ',            // ==
  NEQ = 'NEQ',          // !=
  GT = 'GT',            // >
  GTE = 'GTE',          // >=
  LT = 'LT',            // <
  LTE = 'LTE',          // <=
  AND = 'AND',          // && 或 AND
  OR = 'OR',            // || 或 OR
  NOT = 'NOT',          // !

  // 分隔符
  LPAREN = 'LPAREN',    // (
  RPAREN = 'RPAREN',    // )
  LBRACKET = 'LBRACKET', // [
  RBRACKET = 'RBRACKET', // ]
  DOT = 'DOT',          // .

  // 特殊
  EOF = 'EOF',          // 文件结束
  UNKNOWN = 'UNKNOWN',  // 未知字符
}

/** Token 接口 */
export interface Token {
  /** Token 类型 */
  type: TokenType;
  /** Token 值 */
  value: string | number | boolean | null;
  /** Token 位置（字符索引） */
  position: number;
  /** Token 长度 */
  length: number;
  /** 行号 */
  line?: number;
  /** 列号 */
  column?: number;
}

// ============================================================
// 求值上下文
// ============================================================

/** 求值上下文 - 包含变量绑定 */
export interface EvaluationContext {
  /** 属性访问方式获取值 */
  [key: string]: unknown;
}

/** 求值结果 */
export interface EvaluationResult {
  /** 求值是否成功 */
  success: boolean;
  /** 求值结果（成功时） */
  value?: boolean | number | string;
  /** 错误信息（失败时） */
  error?: string;
}

// ============================================================
// 质量门禁 ISC 类型
// ============================================================

/** ISC 质量门禁标准 */
export interface QualityGateCriterionISC {
  /** 唯一标识符 */
  id: string;
  /** 标准名称 */
  name: string;
  /** 标准描述 */
  description?: string;
  /** ISC 布尔表达式 */
  expression: string;
  /** 是否必须通过 */
  mandatory: boolean;
  /** 预期的变量列表（用于验证） */
  expected_variables?: string[];
  /** 失败时的操作 */
  failure_action?: 'block' | 'warn';
  /** 帮助文档链接 */
  help_url?: string;
}

/** ISC 质量门禁 */
export interface QualityGateISC {
  /** 门禁名称 */
  name: string;
  /** 适用阶段 */
  phase: 'init' | 'research' | 'decision' | 'execution' | 'feedback' | 'delivery';
  /** 门禁描述 */
  description?: string;
  /** 是否必须通过 */
  mandatory: boolean;
  /** 质量标准列表 */
  criteria: QualityGateCriterionISC[];
  /** 配置文件路径（如果从文件加载） */
  config_file?: string;
  /** 失败时的全局操作 */
  failure_action?: 'block' | 'warn';
  /** 通知配置 */
  notification?: {
    on_fail: boolean;
    on_pass: boolean;
    channels: string[];
  };
  /** 豁免配置 */
  exemptions?: {
    allowed: boolean;
    requires_approval: boolean;
    max_duration_days: number;
  };
}

/** 旧版自然语言格式（向后兼容） */
export type LegacyQualityGateCriterion = string;

/** 混合格式标准 */
export type MixedCriterion = QualityGateCriterionISC | LegacyQualityGateCriterion;

// ============================================================
// 验证结果类型
// ============================================================

/** 验证结果 */
export interface ValidationResult {
  /** 是否验证通过 */
  valid: boolean;
  /** 错误列表 */
  errors: ValidationError[];
  /** 警告列表 */
  warnings: string[];
}

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
// 诊断信息类型
// ============================================================

/** 源位置 */
export interface SourceLocation {
  /** 文件名或来源 */
  source?: string;
  /** 起始位置（字符索引） */
  start: number;
  /** 结束位置（字符索引） */
  end: number;
  /** 起始行号 */
  start_line?: number;
  /** 起始列号 */
  start_column?: number;
  /** 结束行号 */
  end_line?: number;
  /** 结束列号 */
  end_column?: number;
}

/** 诊断信息 */
export interface Diagnostic {
  /** 诊断严重程度 */
  severity: 'error' | 'warning' | 'info';
  /** 错误代码 */
  code: string;
  /** 错误消息 */
  message: string;
  /** 源位置 */
  location?: SourceLocation;
  /** 相关建议 */
  suggestion?: string;
}

// ============================================================
// 序列化类型
// ============================================================

/** 序列化后的 AST */
export interface SerializedAST {
  type: ASTNodeType;
  [key: string]: unknown;
}

/** 表达式元数据 */
export interface ExpressionMetadata {
  /** 表达式字符串 */
  expression: string;
  /** 提取的变量 */
  variables: string[];
  /** 表达式复杂度 */
  complexity: number;
  /** 是否包含函数调用 */
  has_functions: boolean;
  /** 是否包含嵌套属性 */
  has_nested_access: boolean;
}

// ============================================================
// 工具类型
// ============================================================

/** 深度可选类型 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** 值类型 */
export type ValueType = 'string' | 'number' | 'boolean' | 'object' | 'undefined' | 'null';

// ============================================================
// AST 工具函数
// ============================================================

/**
 * 将 AST 表达式转换为字符串
 */
export function expressionToString(expr: ISCExpression): string {
  switch (expr.type) {
    case 'Identifier':
      return (expr as ISCIdentifier).name;
    case 'Literal':
      const literal = expr as ISCLiteral;
      return typeof literal.value === 'string' ? `"${literal.value}"` : String(literal.value);
    case 'Comparison':
      const comp = expr as ISCComparisonExpression;
      return `${expressionToString(comp.left)} ${comp.operator} ${expressionToString(comp.right)}`;
    case 'Logical':
      const log = expr as ISCLogicalExpression;
      const leftStr = log.left.type === 'Logical' ? `(${expressionToString(log.left)})` : expressionToString(log.left);
      const rightStr = log.right.type === 'Logical' ? `(${expressionToString(log.right)})` : expressionToString(log.right);
      return `${leftStr} ${log.operator} ${rightStr}`;
    case 'Unary':
      const unary = expr as ISCUnaryExpression;
      const argStr = unary.argument.type === 'Logical' ? `(${expressionToString(unary.argument)})` : expressionToString(unary.argument);
      return `!${argStr}`;
    case 'Member':
      const member = expr as ISCMemberExpression;
      const prop = member.computed ? `["${member.property}"]` : `.${member.property}`;
      return `${expressionToString(member.object)}${prop}`;
    default:
      return '';
  }
}
