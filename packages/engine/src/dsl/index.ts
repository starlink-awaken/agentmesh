/**
 * Honeycomb P2.3 - Agent DSL 模块
 *
 * 提供声明式的 Agent 定义语言，支持：
 * - 词法分析和语法分析
 * - 类型检查
 * - Markdown 互转
 * - 代码生成
 */

// ============================================================
// 错误系统
// ============================================================

export type {
  SourceLocation,
  ErrorContext,
  FixSuggestion,
} from './error-system.js';

export {
  // 错误码
  ErrorCode,
  // 严重级别
  ErrorSeverity,
  // 本地化消息
  LocalizedMessage,
  // 错误基类
  DSLError,
  // 具体错误类
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
  // 工厂函数
  createSourceLocation,
  formatSourceLocation,
  isSyntaxError,
  isTypeError,
  isSemanticError,
  isCompilationError,
  isRuntimeError,
  isWarning,
} from './error-system.js';

// ============================================================
// 类型定义
// ============================================================

export type {
  // AST 节点类型
  DSLNode,
  DSLNodeType,

  // Agent 定义
  AgentDSL,

  // 输入/输出
  DSLInput,
  DSLOutput,

  // 数据类型
  DSLDataType,
  DSLPrimitiveType,
  DSLArrayType,
  DSLObjectType,
  DSLUnionType,
  DSLLiteralType,

  // 工具和能力
  DSLTool,
  DSLCapability,

  // 语句和表达式
  DSLStatement,
  DSLExpression,
  DSLVariable,
  DSLLiteral,
  DSLBinaryOp,
  DSLUnaryOp,
  DSLPropertyAccess,
  DSLFunctionCall,
  DSLTemplateString,

  // 控制结构
  DSLStep,
  DSLCondition,
  DSLLoop,
  DSLParallel,
  DSLTryCatch,
  DSLRetry,
  DSLCall,

  // 配置
  DSLGovernance,
  DSLMetadata,
  CompilerOptions,

  // 结果类型
  ParseResult,
  CompileResult,
  DSLError as LegacyDSLError,
  TypeError as LegacyTypeError,
} from './types.js';

// ============================================================
// DSL Parser
// ============================================================

export { DSLParser } from './parser.js';

// ============================================================
// DSL Compiler
// ============================================================

export { DSLCompiler, DSLCompilerOptions } from './compiler.js';

// ============================================================
// 便捷函数
// ============================================================

import { DSLParser } from './parser.js';
import { DSLCompiler } from './compiler.js';

/**
 * 解析 DSL 源码
 *
 * @param source - DSL 源码字符串
 * @param filename - 文件名（用于错误报告）
 * @returns 解析结果
 */
export function parseDSL(
  source: string,
  filename: string = '<unknown>'
) {
  const parser = new DSLParser();
  return parser.parse(source, filename);
}

/**
 * 将 DSL AST 转换为 Markdown
 *
 * @param ast - DSL AST
 * @returns Markdown 字符串
 */
export function dslToMarkdown(ast: AgentDSL): string {
  const compiler = new DSLCompiler();
  return compiler.toMarkdown(ast);
}

/**
 * 将 Markdown 转换为 DSL AST
 *
 * @param markdown - Markdown 字符串
 * @param filepath - 文件路径（用于推断层）
 * @returns 解析结果
 */
export function markdownToDSL(
  markdown: string,
  filepath?: string
) {
  const compiler = new DSLCompiler();
  return compiler.fromMarkdown(markdown, filepath);
}

/**
 * 对 DSL AST 进行类型检查
 *
 * @param ast - DSL AST
 * @returns 类型错误列表
 */
export function checkDSLTYPES(ast: AgentDSL) {
  const compiler = new DSLCompiler();
  return compiler.typeCheck(ast);
}

/**
 * 编译 DSL 为 AgentDefinition
 *
 * @param ast - DSL AST
 * @returns AgentDefinition
 */
export function compileToAgentDefinition(ast: AgentDSL) {
  const compiler = new DSLCompiler();
  return compiler.compileToAgentDefinition(ast);
}

// ============================================================
// 重新导出 AST 类型（用于便捷函数）
// ============================================================

import type { AgentDSL } from './types.js';

// ============================================================
// Agent 调用集成类型
// ============================================================

export type {
  ExecutionContext,
  ExecutionStats,
  AgentCallConfig,
  SkillCallConfig,
  ToolCallConfig,
  CallConfig,
  RetryConfig,
  CallResult,
  CallTrace,
  IExecutionTracer,
  ICallExecutor,
  IStepExecutor,
  DSLStep as AgentCallDSLStep,
  ExecutionDependencies,
  AgentCallEvent,
} from './agent-call-types.js';

export {
  AgentCallErrorCode,
  AgentCallError,
  ErrorHandlingStrategy,
  createExecutionContext,
  resolveVariable,
} from './agent-call-types.js';

// ============================================================
// 执行追踪器
// ============================================================

export {
  ExecutionTracer,
  createExecutionTracer,
} from './execution-tracer.js';

export type {
  TracerStats,
  TraceEventType,
} from './execution-tracer.js';

// ============================================================
// 调用执行器
// ============================================================

// Agent 调用执行器
export {
  AgentCallExecutor,
  createAgentCallExecutor,
} from './executors/agent-call-executor.js';

// Skill 调用执行器
export {
  SkillCallExecutor,
  createSkillCallExecutor,
  SkillNotFoundError,
  TimeoutError,
  InvalidInputError,
  ExecutionFailedError,
} from './executors/skill-call-executor.js';

export type {
  SkillCallExecutorConfig,
} from './executors/skill-call-executor.js';
