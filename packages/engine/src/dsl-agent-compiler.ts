/**
 * Honeycomb P2.4 - DSL Agent Compiler
 *
 * 实现 DSL 源码到可执行 Agent 的完整编译流程。
 * 集成 DSLParser、DSLCompiler 和 AgentRunner，提供端到端的编译能力。
 *
 * 编译流程：
 * DSL 源码 → Lexer → Parser → AST → TypeCheck → Markdown → AgentDefinition → 可执行 Agent
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

import { DSLParser } from './dsl/parser.js';
import { DSLCompiler } from './dsl/compiler.js';
import { AgentRunner } from './agent-runner.js';

import type {
  AgentDefinition,
  AgentLayer,
  AgentType,
} from './types.js';

import type {
  AgentDSL,
  CompileResult,
  DSLError,
  ParseResult,
  SourceLocation,
  TypeError as DSLTypeError,
} from './dsl/types.js';

// ============================================================
// 编译诊断类型
// ============================================================

/**
 * 编译诊断信息（错误或警告）
 */
export interface CompilerDiagnostic {
  /** 诊断类型 */
  kind: 'error' | 'warning';
  /** 诊断分类 */
  category: 'syntax' | 'type' | 'semantic' | 'validation';
  /** 诊断消息 */
  message: string;
  /** 错误位置 */
  loc: SourceLocation;
  /** 错误代码 */
  code?: string;
  /** 建议修复 */
  suggestion?: string;
}

/**
 * 编译结果（扩展）
 */
export interface AgentCompileResult {
  /** 是否成功 */
  success: boolean;
  /** 编译后的 Agent 定义（成功时） */
  agentDefinition?: AgentDefinition;
  /** 生成的 Markdown（成功时） */
  markdown?: string;
  /** AST（成功时，用于调试） */
  ast?: AgentDSL;
  /** 诊断信息（错误和警告） */
  diagnostics: CompilerDiagnostic[];
  /** 编译耗时（毫秒） */
  duration: number;
  /** 编译 ID（用于追踪） */
  compileId: string;
}

/**
 * 编译选项
 */
export interface AgentCompilerOptions {
  /** 是否启用严格模式（所有警告视为错误） */
  strict?: boolean;
  /** 是否跳过类型检查 */
  skipTypeCheck?: boolean;
  /** 是否生成 source map */
  sourceMap?: boolean;
  /** 是否保留生成的临时文件 */
  keepTempFiles?: boolean;
  /** 临时文件目录 */
  tempDir?: string;
  /** 自定义验证器 */
  validators?: AgentValidator[];
}

/**
 * Agent 验证器接口
 */
export interface AgentValidator {
  /** 验证器名称 */
  name: string;
  /** 验证函数 */
  validate: (agent: AgentDSL, diagnostics: CompilerDiagnostic[]) => void;
}

// ============================================================
// DSL Agent Compiler 实现
// ============================================================

export class DSLAgentCompiler {
  private parser: DSLParser;
  private compiler: DSLCompiler;
  private runner: AgentRunner;
  private options: AgentCompilerOptions;

  constructor(options: AgentCompilerOptions = {}) {
    this.parser = new DSLParser();
    this.compiler = new DSLCompiler({
      strict_type_checking: options.strict ?? false,
      source_map: options.sourceMap ?? false,
      target: 'markdown',
    });
    this.runner = new AgentRunner();
    this.options = {
      strict: false,
      skipTypeCheck: false,
      sourceMap: false,
      keepTempFiles: false,
      tempDir: '/tmp/honeycomb-dsl',
      validators: [],
      ...options,
    };
  }

  /**
   * 从 DSL 源码编译 Agent
   *
   * @param dslSource - DSL 源码字符串
   * @param filename - 文件名（用于错误报告）
   * @returns 编译结果
   */
  async compileAgentFromDSL(
    dslSource: string,
    filename: string = '<unknown>',
  ): Promise<AgentCompileResult> {
    const startTime = Date.now();
    const compileId = this.generateCompileId();
    const diagnostics: CompilerDiagnostic[] = [];

    // 1. 词法和语法分析：DSL 源码 → AST
    const parseResult = this.parseToAST(dslSource, filename);
    if (!parseResult.success || !parseResult.ast) {
      return this.createFailedResult(
        compileId,
        diagnostics,
        this.convertParseErrors(parseResult.errors || []),
        startTime,
      );
    }

    const ast = parseResult.ast;

    // 2. 语义分析：类型检查
    if (!this.options.skipTypeCheck) {
      const typeErrors = this.compiler.typeCheck(ast);
      if (typeErrors.length > 0) {
        const typeDiagnostics = this.convertTypeErrors(typeErrors);
        diagnostics.push(...typeDiagnostics);

        // 在严格模式下，类型错误会导致编译失败
        if (this.options.strict) {
          return this.createFailedResult(compileId, diagnostics, [], startTime);
        }
      }
    }

    // 3. 自定义验证
    for (const validator of this.options.validators || []) {
      try {
        validator.validate(ast, diagnostics);
      } catch (error) {
        diagnostics.push({
          kind: 'error',
          category: 'validation',
          message: error instanceof Error ? error.message : String(error),
          loc: ast.loc || { file: filename, line: 1, column: 1 },
          code: 'VALIDATOR_ERROR',
        });
      }
    }

    // 检查是否有错误级别的诊断（或在严格模式下的警告）
    let hasErrors = false;

    for (const diag of diagnostics) {
      if (diag.kind === 'error') {
        hasErrors = true;
        break;
      }
      // 严格模式下，警告被视为错误
      if (this.options.strict && diag.kind === 'warning') {
        hasErrors = true;
        break;
      }
    }

    if (hasErrors) {
      return this.createFailedResult(compileId, diagnostics, [], startTime);
    }

    // 4. 代码生成：AST → Markdown
    let markdown: string;
    try {
      markdown = this.compiler.toMarkdown(ast);
    } catch (error) {
      diagnostics.push({
        kind: 'error',
        category: 'syntax',
        message: error instanceof Error ? error.message : String(error),
        loc: ast.loc || { file: filename, line: 1, column: 1 },
        code: 'MARKDOWN_GENERATION_FAILED',
      });
      return this.createFailedResult(compileId, diagnostics, [], startTime);
    }

    // 5. 验证生成的 Markdown 格式
    try {
      this.validateMarkdownFormat(markdown);
    } catch (error) {
      diagnostics.push({
        kind: 'error',
        category: 'validation',
        message: error instanceof Error ? error.message : String(error),
        loc: ast.loc || { file: filename, line: 1, column: 1 },
        code: 'INVALID_MARKDOWN_FORMAT',
      });
      return this.createFailedResult(compileId, diagnostics, [], startTime);
    }

    // 6. 生成 AgentDefinition
    let agentDefinition: AgentDefinition;
    try {
      agentDefinition = this.createAgentDefinition(ast, markdown);
    } catch (error) {
      diagnostics.push({
        kind: 'error',
        category: 'validation',
        message: error instanceof Error ? error.message : String(error),
        loc: ast.loc || { file: filename, line: 1, column: 1 },
        code: 'AGENT_DEFINITION_FAILED',
      });
      return this.createFailedResult(compileId, diagnostics, [], startTime);
    }

    // 7. 可选：创建临时 Markdown 文件用于 AgentRunner
    let tempFilePath: string | undefined;
    if (!this.options.keepTempFiles) {
      // 生成临时文件路径
      const tempDir = this.options.tempDir || '/tmp/honeycomb-dsl';
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      tempFilePath = path.join(tempDir, `${ast.name}-${compileId}.md`);
    }

    // 成功返回
    return {
      success: true,
      agentDefinition,
      markdown,
      ast,
      diagnostics,
      duration: Date.now() - startTime,
      compileId,
    };
  }

  /**
   * 从 DSL 文件编译 Agent
   *
   * @param filepath - DSL 文件路径
   * @returns 编译结果
   */
  async compileAgentFromFile(filepath: string): Promise<AgentCompileResult> {
    try {
      const dslSource = fs.readFileSync(filepath, 'utf-8');
      return this.compileAgentFromDSL(dslSource, filepath);
    } catch (error) {
      return {
        success: false,
        diagnostics: [{
          kind: 'error',
          category: 'syntax',
          message: error instanceof Error ? error.message : `Failed to read file: ${filepath}`,
          loc: { file: filepath, line: 1, column: 1 },
          code: 'FILE_READ_FAILED',
        }],
        duration: 0,
        compileId: this.generateCompileId(),
      };
    }
  }

  /**
   * 编译多个 DSL 文件
   *
   * @param filepaths - DSL 文件路径列表
   * @returns 编译结果数组
   */
  async compileAgentsFromFiles(filepaths: string[]): Promise<AgentCompileResult[]> {
    const results: AgentCompileResult[] = [];

    for (const filepath of filepaths) {
      const result = await this.compileAgentFromFile(filepath);
      results.push(result);
    }

    return results;
  }

  /**
   * 批量编译（并行）
   *
   * @param dslSources - DSL 源码数组
   * @param filenames - 对应的文件名数组
   * @returns 编译结果数组
   */
  async compileBatch(
    dslSources: string[],
    filenames: string[],
  ): Promise<AgentCompileResult[]> {
    if (dslSources.length !== filenames.length) {
      throw new Error('dslSources and filenames must have the same length');
    }

    const promises = dslSources.map((source, i) =>
      this.compileAgentFromDSL(source, filenames[i])
    );

    return Promise.all(promises);
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 解析 DSL 源码为 AST
   */
  private parseToAST(source: string, filename: string): ParseResult {
    try {
      return this.parser.parse(source, filename);
    } catch (error) {
      return {
        success: false,
        errors: [{
          kind: 'syntax',
          message: error instanceof Error ? error.message : String(error),
          loc: { file: filename, line: 1, column: 1 },
        }],
      };
    }
  }

  /**
   * 转换解析错误为诊断信息
   */
  private convertParseErrors(errors: DSLError[]): CompilerDiagnostic[] {
    return errors.map(e => ({
      kind: 'error' as const,
      category: e.kind as 'syntax' | 'type' | 'semantic',
      message: e.message,
      loc: e.loc,
      code: e.code ?? this.getDefaultErrorCode(e.kind),
    }));
  }

  /**
   * 获取默认错误代码
   */
  private getDefaultErrorCode(kind: DSLError['kind']): string {
    switch (kind) {
      case 'syntax':
        return 'SYNTAX_ERROR';
      case 'type':
        return 'TYPE_ERROR';
      case 'semantic':
        return 'SEMANTIC_ERROR';
      default:
        return 'UNKNOWN_ERROR';
    }
  }

  /**
   * 转换类型错误为诊断信息
   */
  private convertTypeErrors(errors: DSLTypeError[]): CompilerDiagnostic[] {
    return errors.map(e => ({
      kind: 'error' as const,
      category: 'type' as const,
      message: e.message,
      loc: e.loc,
      code: 'TYPE_ERROR',
      suggestion: `Expected: ${e.expected_type}, Got: ${e.actual_type}`,
    }));
  }

  /**
   * 创建失败结果
   */
  private createFailedResult(
    compileId: string,
    existingDiagnostics: CompilerDiagnostic[],
    newDiagnostics: CompilerDiagnostic[],
    startTime: number,
  ): AgentCompileResult {
    return {
      success: false,
      diagnostics: [...existingDiagnostics, ...newDiagnostics],
      duration: Date.now() - startTime,
      compileId,
    };
  }

  /**
   * 验证 Markdown 格式
   */
  private validateMarkdownFormat(markdown: string): void {
    // 检查 frontmatter
    if (!markdown.startsWith('---')) {
      throw new Error('Generated Markdown is missing frontmatter delimiters');
    }

    const frontmatterEnd = markdown.indexOf('---', 4);
    if (frontmatterEnd === -1) {
      throw new Error('Generated Markdown has unclosed frontmatter');
    }

    // 检查必需字段
    const frontmatter = markdown.substring(4, frontmatterEnd);
    if (!frontmatter.includes('name:')) {
      throw new Error('Generated Markdown is missing required field: name');
    }

    if (!frontmatter.includes('description:')) {
      throw new Error('Generated Markdown is missing required field: description');
    }

    if (!frontmatter.includes('tools:')) {
      throw new Error('Generated Markdown is missing required field: tools');
    }
  }

  /**
   * 生成编译 ID
   */
  private generateCompileId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  // ============================================================
  // 工具方法
  // ============================================================

  /**
   * 格式化诊断信息为可读字符串
   */
  formatDiagnostics(result: AgentCompileResult): string {
    const lines: string[] = [];

    for (const diag of result.diagnostics) {
      const icon = diag.kind === 'error' ? '❌' : '⚠️';
      const loc = `${diag.loc.file}:${diag.loc.line}:${diag.loc.column}`;
      const code = diag.code ? `[${diag.code}]` : '';
      const suggestion = diag.suggestion ? `\n  💡 建议: ${diag.suggestion}` : '';

      lines.push(`${icon} ${loc} ${code} ${diag.category}: ${diag.message}${suggestion}`);
    }

    return lines.join('\n');
  }

  /**
   * 获取编译统计信息
   */
  getStats(result: AgentCompileResult): {
    totalDiagnostics: number;
    errors: number;
    warnings: number;
    byCategory: Record<string, number>;
  } {
    const errors = result.diagnostics.filter(d => d.kind === 'error').length;
    const warnings = result.diagnostics.filter(d => d.kind === 'warning').length;
    const byCategory: Record<string, number> = {};

    for (const diag of result.diagnostics) {
      byCategory[diag.category] = (byCategory[diag.category] || 0) + 1;
    }

    return {
      totalDiagnostics: result.diagnostics.length,
      errors,
      warnings,
      byCategory,
    };
  }

  /**
   * 创建临时 Markdown 文件并返回路径
   * 用于 AgentRunner 加载
   */
  createTempMarkdownFile(result: AgentCompileResult): string {
    if (!result.success || !result.markdown) {
      throw new Error('Cannot create temp file for failed compilation');
    }

    const tempDir = this.options.tempDir || '/tmp/honeycomb-dsl';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const filename = `${result.agentDefinition?.name || 'agent'}-${result.compileId}.md`;
    const filepath = path.join(tempDir, filename);

    fs.writeFileSync(filepath, result.markdown, 'utf-8');
    return filepath;
  }

  /**
   * 创建 AgentDefinition（从 AST）
   * 如果没有 capability 定义，将 tools 作为 capabilities
   */
  private createAgentDefinition(ast: AgentDSL, markdown: string): AgentDefinition {
    // 使用 DSLCompiler 的方法作为基础
    const baseDef = this.compiler.compileToAgentDefinition(ast);

    // 如果 capabilities 为空，使用 tools 作为 capabilities
    if (baseDef.capabilities.length === 0 && baseDef.tools.length > 0) {
      baseDef.capabilities = [...baseDef.tools];
    }

    return baseDef;
  }

  /**
   * 清理临时文件
   */
  cleanupTempFiles(olderThanMs: number = 3600000): void {
    const tempDir = this.options.tempDir || '/tmp/honeycomb-dsl';

    if (!fs.existsSync(tempDir)) {
      return;
    }

    const now = Date.now();
    const files = fs.readdirSync(tempDir);

    for (const file of files) {
      const filepath = path.join(tempDir, file);
      const stats = fs.statSync(filepath);

      if (now - stats.mtimeMs > olderThanMs) {
        fs.unlinkSync(filepath);
      }
    }
  }
}

// ============================================================
// 内置验证器
// ============================================================

/**
 * 名称规范验证器
 */
export const nameConventionValidator: AgentValidator = {
  name: 'name-convention',
  validate(agent, diagnostics) {
    // Agent 名称应为 kebab-case
    const kebabCaseRegex = /^[a-z][a-z0-9-]*$/;
    if (!kebabCaseRegex.test(agent.name)) {
      diagnostics.push({
        kind: 'warning',
        category: 'semantic',
        message: `Agent name "${agent.name}" should be in kebab-case (lowercase with hyphens)`,
        loc: agent.loc || { file: '', line: 1, column: 1 },
        code: 'NAME_CONVENTION',
        suggestion: `Consider renaming to: ${agent.name.toLowerCase().replace(/_/g, '-')}`,
      });
    }
  },
};

/**
 * 输入验证器
 */
export const inputValidator: AgentValidator = {
  name: 'input-validation',
  validate(agent, diagnostics) {
    // 检查是否有输入定义
    if (agent.inputs.length === 0) {
      diagnostics.push({
        kind: 'warning',
        category: 'semantic',
        message: 'Agent has no input parameters defined',
        loc: agent.loc || { file: '', line: 1, column: 1 },
        code: 'NO_INPUTS',
        suggestion: 'Consider adding at least one input parameter for better reusability',
      });
    }

    // 检查输入名称规范
    for (const input of agent.inputs) {
      if (!/^[a-z][a-z0-9_]*$/.test(input.name)) {
        diagnostics.push({
          kind: 'warning',
          category: 'semantic',
          message: `Input parameter "${input.name}" should be in snake_case`,
          loc: input.loc || agent.loc || { file: '', line: 1, column: 1 },
          code: 'INPUT_NAMING',
        });
      }
    }
  },
};

/**
 * 工具验证器
 */
export const toolsValidator: AgentValidator = {
  name: 'tools-validation',
  validate(agent, diagnostics) {
    // 检查是否有工具定义
    if (agent.tools.length === 0) {
      diagnostics.push({
        kind: 'warning',
        category: 'semantic',
        message: 'Agent has no tools defined. Consider adding tools for better functionality.',
        loc: agent.loc || { file: '', line: 1, column: 1 },
        code: 'NO_TOOLS',
      });
    }

    // 检查重复工具
    const toolNames = new Set<string>();
    for (const tool of agent.tools) {
      if (toolNames.has(tool.name)) {
        diagnostics.push({
          kind: 'error',
          category: 'semantic',
          message: `Duplicate tool declaration: "${tool.name}"`,
          loc: tool.loc || agent.loc || { file: '', line: 1, column: 1 },
          code: 'DUPLICATE_TOOL',
        });
      }
      toolNames.add(tool.name);
    }
  },
};

/**
 * 治理验证器
 */
export const governanceValidator: AgentValidator = {
  name: 'governance-validation',
  validate(agent, diagnostics) {
    const gov = agent.governance;

    // Token 预算合理性检查
    if (gov.token_budget < 1000) {
      diagnostics.push({
        kind: 'warning',
        category: 'semantic',
        message: `Token budget (${gov.token_budget}) seems too low for practical use`,
        loc: agent.loc || { file: '', line: 1, column: 1 },
        code: 'LOW_TOKEN_BUDGET',
        suggestion: 'Consider setting token_budget to at least 10000',
      });
    }

    if (gov.token_budget > 500000) {
      diagnostics.push({
        kind: 'warning',
        category: 'semantic',
        message: `Token budget (${gov.token_budget}) is very high. Consider optimizing.`,
        loc: agent.loc || { file: '', line: 1, column: 1 },
        code: 'HIGH_TOKEN_BUDGET',
      });
    }

    // 重试次数检查
    if (gov.max_retries > 5) {
      diagnostics.push({
        kind: 'warning',
        category: 'semantic',
        message: `Max retries (${gov.max_retries}) is high. Too many retries may delay failure detection.`,
        loc: agent.loc || { file: '', line: 1, column: 1 },
        code: 'HIGH_RETRIES',
        suggestion: 'Consider setting max_retries to 3 or less',
      });
    }
  },
};

/**
 * 获取默认验证器集合
 */
export function getDefaultValidators(): AgentValidator[] {
  return [
    nameConventionValidator,
    inputValidator,
    toolsValidator,
    governanceValidator,
  ];
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建 DSL Agent Compiler（使用默认配置）
 */
export function createDSLAgentCompiler(
  options?: AgentCompilerOptions,
): DSLAgentCompiler {
  const opts = {
    ...options,
    validators: options?.validators ?? getDefaultValidators(),
  };
  return new DSLAgentCompiler(opts);
}
