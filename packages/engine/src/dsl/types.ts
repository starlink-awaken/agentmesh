/**
 * Honeycomb P2.3 - Agent DSL 类型系统
 *
 * 定义 Agent DSL 的 AST 节点类型和编译器接口。
 * DSL 提供声明式的 Agent 定义方式，支持类型检查和 IDE 集成。
 */

// ============================================================
// DSL AST 节点类型
// ============================================================

/** DSL 节点类型枚举 */
export type DSLNodeType =
  | 'agent'           // Agent 定义
  | 'input'           // 输入参数定义
  | 'output'          // 输出定义
  | 'tool'            // 工具引用
  | 'capability'      // 能力声明
  | 'step'            // 执行步骤
  | 'conditional_step' // 条件分支步骤（if-elif-else Agent 选择）
  | 'condition'       // 条件分支
  | 'loop'            // 循环
  | 'parallel'        // 并行执行
  | 'try_catch'       // 异常处理
  // 表达式类型
  | 'variable'        // 变量引用
  | 'literal'         // 字面量
  | 'binary_op'       // 二元操作
  | 'unary_op'        // 一元操作
  | 'property_access' // 属性访问
  | 'function_call'   // 函数调用
  | 'template_string' // 模板字符串
  | 'array_literal'   // 数组字面量
  | 'conditional_expression'; // 三元运算符 (test ? consequent : alternate)

/** DSL 基础节点接口 */
export interface DSLNode {
  /** 节点类型 */
  type: DSLNodeType;
  /** 源码位置（用于错误报告） */
  loc?: SourceLocation;
}

/** 源码位置信息 */
export interface SourceLocation {
  /** 文件路径 */
  file: string;
  /** 行号（从 1 开始） */
  line: number;
  /** 列号（从 1 开始） */
  column: number;
  /** 源码片段（用于错误上下文） */
  snippet?: string;
}

// ============================================================
// Agent DSL 定义（AST 根节点）
// ============================================================

/** Agent DSL 定义 */
export interface AgentDSL extends DSLNode {
  type: 'agent';
  /** Agent 名称（标识符） */
  name: string;
  /** Agent 描述 */
  description: string;
  /** Agent 类型 */
  agent_type: 'structural' | 'worker';
  /** 所属架构层 */
  layer: 'L1' | 'L2' | 'L3' | 'L4' | 'governance';
  /** 所属域（可选） */
  domain?: string;
  /** 输入参数定义 */
  inputs: DSLInput[];
  /** 输出定义 */
  outputs: DSLOutput[];
  /** 使用的工具 */
  tools: DSLTool[];
  /** 能力声明 */
  capabilities: DSLCapability[];
  /** 执行步骤（函数体） */
  body: DSLStatement[];
  /** 治理配置 */
  governance: DSLGovernance;
  /** 元数据 */
  metadata?: DSLMetadata;
}

// ============================================================
// 输入/输出定义
// ============================================================

/** 输入参数定义 */
export interface DSLInput extends DSLNode {
  type: 'input';
  /** 参数名称 */
  name: string;
  /** 参数数据类型 */
  data_type: DSLDataType;
  /** 参数描述 */
  description?: string;
  /** 是否必需 */
  required: boolean;
  /** 默认值表达式 */
  default?: DSLExpression;
  /** 验证表达式 */
  validation?: DSLExpression;
}

/** 输出定义 */
export interface DSLOutput extends DSLNode {
  type: 'output';
  /** 输出名称 */
  name: string;
  /** 输出数据类型 */
  data_type: DSLDataType;
  /** 输出描述 */
  description?: string;
}

// ============================================================
// 数据类型系统
// ============================================================

/** DSL 数据类型（递归定义） */
export type DSLDataType =
  | DSLPrimitiveType
  | DSLArrayType
  | DSLObjectType
  | DSLUnionType
  | DSLLiteralType;

/** 基础类型 */
export interface DSLPrimitiveType {
  kind: 'string' | 'number' | 'boolean' | 'any' | 'void';
}

/** 数组类型 */
export interface DSLArrayType {
  kind: 'array';
  /** 元素类型 */
  item_type: DSLDataType;
}

/** 对象类型 */
export interface DSLObjectType {
  kind: 'object';
  /** 属性类型映射 */
  properties: Record<string, DSLDataType>;
}

/** 联合类型 */
export interface DSLUnionType {
  kind: 'union';
  /** 可能的类型 */
  types: DSLDataType[];
}

/** 字面量类型 (P2-347: 增强base_type支持精确推断) */
export interface DSLLiteralType {
  kind: 'literal';
  /** 基础类型 */
  base_type: 'string' | 'number' | 'boolean';
  /** 字面量值 */
  value: string | number | boolean;
}

// ============================================================
// 工具和能力定义
// ============================================================

/** 工具引用 */
export interface DSLTool extends DSLNode {
  type: 'tool';
  /** 工具名称 */
  name: string;
  /** 别名（可选） */
  alias?: string;
}

/** 能力声明 */
export interface DSLCapability extends DSLNode {
  type: 'capability';
  /** 能力类型 */
  capability_type: string;
  /** 能力级别 */
  level: 'basic' | 'intermediate' | 'advanced' | 'expert';
}

// ============================================================
// 语句和表达式
// ============================================================

/** DSL 语句（可以是任何控制结构） */
export type DSLStatement =
  | DSLStep
  | DSLConditionalStep
  | DSLCondition
  | DSLLoop
  | DSLParallel
  | DSLTryCatch;

/** 表达式 */
export type DSLExpression =
  | DSLVariable
  | DSLLiteral
  | DSLBinaryOp
  | DSLUnaryOp
  | DSLPropertyAccess
  | DSLFunctionCall
  | DSLTemplateString
  | DSLArrayLiteral
  | DSLConditionalExpression;

/** 执行步骤 */
export interface DSLStep extends DSLNode {
  type: 'step';
  /** 步骤名称（可选，用于标识） */
  name?: string;
  /** Agent 或 Skill 调用 */
  call: DSLCall;
  /** 输入参数绑定 */
  inputs: Record<string, DSLExpression>;
  /** 输出绑定（将结果映射到变量） */
  outputs?: Record<string, string>;
  /** 重试配置 */
  retry?: DSLRetry;
}

/** 条件分支步骤（if-elif-else Agent 选择） */
export interface DSLConditionalStep extends DSLNode {
  type: 'conditional_step';
  /** 步骤名称（可选，用于标识） */
  name?: string;
  /** 分支列表（if/elif/else） */
  branches: ConditionalBranch[];
  /** 输入参数绑定（用于条件求值和Agent调用） */
  inputs: Record<string, DSLExpression>;
  /** 输出绑定（将结果映射到变量） */
  outputs?: Record<string, string>;
}

/** 条件分支定义 */
export interface ConditionalBranch {
  /** 条件表达式（if 和 elif 分支需要，else 分支不需要） */
  if?: DSLExpression;
  /** 满足条件时执行的 Agent 调用（if/elif） */
  then?: DSLCall;
  /** else 分支（仅最后一个分支可以有 else） */
  else?: DSLCall;
}

/** 调用表达式 */
export type DSLCall =
  | { type: 'agent'; name: string }
  | { type: 'skill'; skill_id: string }
  | { type: 'tool'; name: string };

/** 变量引用 */
export interface DSLVariable extends DSLNode {
  type: 'variable';
  /** 变量名称 */
  name: string;
}

/** 字面量 */
export interface DSLLiteral extends DSLNode {
  type: 'literal';
  /** 字面量值 */
  value: string | number | boolean | null;
}

/** 二元操作 */
export interface DSLBinaryOp extends DSLNode {
  type: 'binary_op';
  /** 操作符 */
  operator: BinaryOperator;
  /** 左操作数 */
  left: DSLExpression;
  /** 右操作数 */
  right: DSLExpression;
}

/** 二元操作符类型 */
export type BinaryOperator =
  | '+' | '-' | '*' | '/' | '%'           // 算术
  | '==' | '!=' | '<' | '>' | '<=' | '>='  // 比较
  | '&&' | '||';                           // 逻辑

/** 一元操作 */
export interface DSLUnaryOp extends DSLNode {
  type: 'unary_op';
  /** 操作符 */
  operator: '!' | '-' | '+';
  /** 操作数 */
  operand: DSLExpression;
}

/** 属性访问 */
export interface DSLPropertyAccess extends DSLNode {
  type: 'property_access';
  /** 对象表达式 */
  object: DSLExpression;
  /** 属性名 */
  property: string;
}

/** 函数调用 */
export interface DSLFunctionCall extends DSLNode {
  type: 'function_call';
  /** 函数名 */
  function: string;
  /** 参数列表 */
  arguments: DSLExpression[];
}

/** 模板字符串 */
export interface DSLTemplateString extends DSLNode {
  type: 'template_string';
  /** 模板片段（字面量和表达式的交替） */
  parts: Array<string | DSLExpression>;
}

/** 数组字面量 */
export interface DSLArrayLiteral extends DSLNode {
  type: 'array_literal';
  /** 数组元素表达式列表 */
  elements: DSLExpression[];
}

/** 三元运算符表达式 (test ? consequent : alternate) */
export interface DSLConditionalExpression extends DSLNode {
  type: 'conditional_expression';
  /** 条件表达式（必须可转换为boolean） */
  test: DSLExpression;
  /** 条件为真时的表达式 */
  consequent: DSLExpression;
  /** 条件为假时的表达式 */
  alternate: DSLExpression;
}

/** 条件语句 */
export interface DSLCondition extends DSLNode {
  type: 'condition';
  /** 条件表达式 */
  test: DSLExpression;
  /** 条件为真时执行的语句 */
  consequent: DSLStatement[];
  /** 条件为假时执行的语句（可选） */
  alternate?: DSLStatement[];
}

/** 循环语句 */
export interface DSLLoop extends DSLNode {
  type: 'loop';
  /** 循环类型 */
  loop_type: 'for' | 'while' | 'for_each';
  /** 循环变量名（for/for_each） */
  variable?: string;
  /** 集合表达式（for_each） */
  collection?: DSLExpression;
  /** 循环条件（while） */
  test?: DSLExpression;
  /** 循环体 */
  body: DSLStatement[];
}

/** 并行执行 */
export interface DSLParallel extends DSLNode {
  type: 'parallel';
  /** 并行分支 - 每个分支是一个语句数组 */
  branches: DSLStatement[][];
  /** 最大并发数（可选）- 支持表达式或数字字面量 */
  max_concurrency?: DSLExpression | number;
}

/** Try-Catch 异常处理 */
export interface DSLTryCatch extends DSLNode {
  type: 'try_catch';
  /** try 块 */
  try_block: DSLStatement[];
  /** 异常变量名（catch） */
  catch_variable?: string;
  /** catch 块 */
  catch_block?: DSLStatement[];
  /** finally 块 */
  finally_block?: DSLStatement[];
}

/** 重试配置 */
export interface DSLRetry {
  /** 最大重试次数 */
  max_attempts: number;
  /** 退避延迟（毫秒） */
  backoff_ms: number;
}

// ============================================================
// 治理和元数据
// ============================================================

/** 治理配置 */
export interface DSLGovernance {
  /** 是否进行第一性原理检查 */
  first_principles_check: boolean;
  /** 红队测试阈值 */
  red_team_threshold: 'very_low' | 'low' | 'medium' | 'high' | 'critical';
  /** 是否启用质量门 */
  quality_gate_enabled: boolean;
  /** 最大重试次数 */
  max_retries: number;
  /** Token 预算 */
  token_budget: number;
}

/** 元数据 */
export interface DSLMetadata {
  /** 作者 */
  author?: string;
  /** 版本 */
  version?: string;
  /** 许可证 */
  license?: string;
  /** 标签 */
  tags?: string[];
  /** 参数提示 */
  argument_hint?: string;
}

// ============================================================
// 编译器接口
// ============================================================

/** 解析结果 */
export interface ParseResult {
  /** 是否成功 */
  success: boolean;
  /** AST（成功时） */
  ast?: AgentDSL;
  /** 错误列表（失败时） */
  errors?: DSLError[];
}

/** DSL 错误 */
export interface DSLError {
  /** 错误类型 */
  kind: 'syntax' | 'type' | 'semantic';
  /** 错误消息 */
  message: string;
  /** 错误位置 */
  loc: SourceLocation;
  /** 错误代码 */
  code?: string;
}

/** 类型错误 */
export interface TypeError {
  message: string;
  loc: SourceLocation;
  expected_type: string;
  actual_type: string;
}

/** 编译选项 */
export interface CompilerOptions {
  /** 是否启用严格类型检查 */
  strict_type_checking?: boolean;
  /** 是否生成 source map */
  source_map?: boolean;
  /** 目标格式 */
  target?: 'markdown' | 'json' | 'executable';
}

/** 编译结果 */
export interface CompileResult {
  /** 是否成功 */
  success: boolean;
  /** 编译输出（成功时） */
  output?: string;
  /** 错误列表（失败时） */
  errors?: DSLError[];
  /** 警告列表 */
  warnings?: DSLError[];
}
