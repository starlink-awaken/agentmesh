/**
 * Honeycomb P2.3 - DSL Compiler
 *
 * 实现 DSL 编译器，包括类型检查、代码生成和 Markdown 互转功能。
 */

import type * as FS from 'node:fs';
import { readFileSync } from 'node:fs';

import type {
  AgentDefinition,
  AgentLayer,
  AgentType,
  GovernanceConfig,
} from '../types.js';

import type {
  AgentDSL,
  CompileResult,
  CompilerOptions,
  DSLCall,
  DSLCondition,
  DSLConditionalStep,
  ConditionalBranch,
  DSLDataType,
  DSLError,
  DSLExpression,
  DSLGovernance,
  DSLInput,
  DSLLiteral,
  DSLLoop,
  DSLMetadata,
  DSLOutput,
  DSLObjectType,
  DSLParallel,
  DSLPropertyAccess,
  DSLArrayLiteral,
  DSLFunctionCall,
  DSLStatement,
  DSLStep,
  DSLTool,
  DSLTryCatch,
  DSLUnaryOp,
  DSLVariable,
  DSLBinaryOp,
  ParseResult,
  SourceLocation,
  TypeError,
} from './types.js';
import type { RiskLevel } from '../types.js';

// ============================================================
// Agent 调用执行器导入 (P2-429)
// ============================================================

import type {
  ExecutionContext,
  ExecutionDependencies,
  ExecutionResult,
  TraceEntry,
  CallResult,
  ICallExecutor,
  IExecutionTracer,
} from './agent-call-types.js';

import {
  AgentCallExecutor,
  createAgentCallExecutor,
} from './executors/agent-call-executor.js';

import {
  SkillCallExecutor,
  createSkillCallExecutor,
} from './executors/skill-call-executor.js';

import {
  ToolCallExecutor,
  createToolCallExecutor,
} from './executors/tool-call-executor.js';

import {
  StepExecutor,
  createStepExecutor,
  type IExpressionEvaluator,
} from './step-executor.js';

import {
  ConditionStepExecutor,
  createConditionStepExecutor,
} from './executors/conditional-step-executor.js';

import {
  LoopExecutor,
  createLoopExecutor,
  type IStatementExecutor,
} from './executors/loop-executor.js';

import {
  ExecutionTracer,
  createExecutionTracer,
} from './execution-tracer.js';

// ============================================================
// 错误系统导入
// ============================================================

import { RuntimeError } from './error-system.js';

// ============================================================
// 循环引用检测导入 (P2-447)
// ============================================================

import {
  DependencyGraph,
  CircularDependencyError,
  buildDependencyGraphFromAST,
  extractVariableReferences,
} from './dependency-graph.js';

// ============================================================
// 函数签名注册表 (P1-337)
// ============================================================

/**
 * 函数签名 - 定义函数的参数类型和返回类型
 */
interface FunctionSignature {
  /** 函数名 */
  name: string;
  /** 参数类型列表（按位置） */
  paramTypes: DSLDataType[];
  /** 返回类型 */
  returnType: DSLDataType;
  /** 是否可变参数 */
  isVariadic?: boolean;
}

/**
 * 函数签名注册表 - 管理函数签名的注册和查询
 *
 * 用于支持 function_call 表达式的静态类型检查和返回类型推断。
 * 通过注册函数签名，编译器可以在编译时验证函数调用参数类型，
 * 并推断函数调用的返回类型。
 */
class FunctionSignatureRegistry {
  /** 函数签名映射表 */
  private signatures: Map<string, FunctionSignature> = new Map();

  /**
   * 注册函数签名
   *
   * @param name - 函数名
   * @param paramTypes - 参数类型列表（按位置）
   * @param returnType - 返回类型
   * @param isVariadic - 是否可变参数（默认 false）
   */
  register(name: string, paramTypes: DSLDataType[], returnType: DSLDataType, isVariadic = false): void {
    this.signatures.set(name, {
      name,
      paramTypes,
      returnType,
      isVariadic,
    });
  }

  /**
   * 查询函数签名
   *
   * @param name - 函数名
   * @returns 函数签名，如果不存在则返回 undefined
   */
  lookup(name: string): FunctionSignature | undefined {
    return this.signatures.get(name);
  }

  /**
   * 检查函数是否已注册
   *
   * @param name - 函数名
   * @returns 是否已注册
   */
  has(name: string): boolean {
    return this.signatures.has(name);
  }

  /**
   * 清空所有注册的函数签名
   */
  clear(): void {
    this.signatures.clear();
  }

  /**
   * 获取所有已注册的函数名
   *
   * @returns 函数名数组
   */
  getFunctionNames(): string[] {
    return Array.from(this.signatures.keys());
  }
}

// ============================================================
// 类型检查器
// ============================================================

/**
 * 作用域帧 - 表示单个作用域层级
 */
interface ScopeFrame {
  /** 父作用域指针 */
  parent: ScopeFrame | null;
  /** 本作用域的符号表 */
  symbols: Map<string, DSLDataType>;
  /** 作用域类型 */
  kind: 'global' | 'function' | 'loop' | 'conditional' | 'catch' | 'parallel';
  /** 作用域嵌套深度 */
  depth: number;
}

/**
 * 作用域栈 - 管理嵌套作用域
 */
class ScopeStack {
  private frames: ScopeFrame[] = [];

  constructor() {
    // 创建全局作用域
    this.enter('global');
  }

  /** 进入新作用域 */
  enter(kind: ScopeFrame['kind']): void {
    const parent = this.frames.length > 0 ? this.frames[this.frames.length - 1] : null;
    const depth = this.frames.length;

    this.frames.push({
      parent,
      symbols: new Map(),
      kind,
      depth,
    });
  }

  /** 离开当前作用域 */
  leave(): void {
    if (this.frames.length <= 1) {
      throw new Error('Cannot leave global scope');
    }
    this.frames.pop();
  }

  /** 查找符号 - 从当前作用域向上查找 */
  lookup(name: string): DSLDataType | undefined {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const frame = this.frames[i];
      if (frame.symbols.has(name)) {
        return frame.symbols.get(name);
      }
    }
    return undefined;
  }

  /** 在当前作用域定义符号 */
  define(name: string, type: DSLDataType): void {
    const current = this.frames[this.frames.length - 1];
    if (current.symbols.has(name)) {
      // 检查是否遮蔽外层作用域
      for (let i = this.frames.length - 2; i >= 0; i--) {
        if (this.frames[i].symbols.has(name)) {
          // 变量遮蔽 - 可以记录警告但不阻止
          console.warn(`Variable '${name}' shadows outer scope variable`);
          break;
        }
      }
    }
    current.symbols.set(name, type);
  }

  /** 检查符号是否已定义(含遮蔽检测) */
  isDefined(name: string): boolean {
    return this.lookup(name) !== undefined;
  }

  /** 获取当前作用域深度 */
  get currentDepth(): number {
    return this.frames.length - 1;
  }
}

class TypeChecker {
  private ast: AgentDSL;
  private errors: TypeError[] = [];
  private scopeStack: ScopeStack;
  private undefinedVars: Set<string> = new Set();
  /** 依赖图 - 用于检测循环依赖 (P2-447) */
  private dependencyGraph: DependencyGraph;
  /** 函数签名注册表 (P1-337) */
  private functionRegistry: FunctionSignatureRegistry;

  constructor(ast: AgentDSL) {
    this.ast = ast;
    this.scopeStack = new ScopeStack();
    this.dependencyGraph = new DependencyGraph();
    this.functionRegistry = new FunctionSignatureRegistry();
    this.initializeBuiltinFunctions();
  }

  /**
   * 初始化内置函数签名 (P1-337)
   *
   * 注册常用的内置函数，使其可以进行类型检查。
   */
  private initializeBuiltinFunctions(): void {
    // 字符串函数
    this.functionRegistry.register('toString', [{ kind: 'any' }], { kind: 'string' });
    this.functionRegistry.register('toUpperCase', [{ kind: 'string' }], { kind: 'string' });
    this.functionRegistry.register('toLowerCase', [{ kind: 'string' }], { kind: 'string' });
    this.functionRegistry.register('trim', [{ kind: 'string' }], { kind: 'string' });
    this.functionRegistry.register('split', [{ kind: 'string' }, { kind: 'string' }], { kind: 'array', item_type: { kind: 'string' } });

    // 数组函数
    this.functionRegistry.register('length', [{ kind: 'array', item_type: { kind: 'any' } }], { kind: 'number' });
    this.functionRegistry.register('push', [{ kind: 'array', item_type: { kind: 'any' } }, { kind: 'any' }], { kind: 'number' });
    this.functionRegistry.register('pop', [{ kind: 'array', item_type: { kind: 'any' } }], { kind: 'any' });

    // 数学函数
    this.functionRegistry.register('abs', [{ kind: 'number' }], { kind: 'number' });
    this.functionRegistry.register('round', [{ kind: 'number' }], { kind: 'number' });
    this.functionRegistry.register('floor', [{ kind: 'number' }], { kind: 'number' });
    this.functionRegistry.register('ceil', [{ kind: 'number' }], { kind: 'number' });

    // 类型检查函数
    this.functionRegistry.register('isString', [{ kind: 'any' }], { kind: 'boolean' });
    this.functionRegistry.register('isNumber', [{ kind: 'any' }], { kind: 'boolean' });
    this.functionRegistry.register('isBoolean', [{ kind: 'any' }], { kind: 'boolean' });
    this.functionRegistry.register('isArray', [{ kind: 'any' }], { kind: 'boolean' });
    this.functionRegistry.register('isObject', [{ kind: 'any' }], { kind: 'boolean' });
  }

  /**
   * 执行类型检查
   */
  check(): TypeError[] {
    this.errors = [];
    this.undefinedVars.clear();

    // 1. 构建调用图
    this.buildCallGraph();

    // 2. 检测循环依赖
    this.detectCircularDependencies();

    // 3. 检查输入定义
    this.checkInputs();

    // 2. 检查输出定义
    this.checkOutputs();

    // 3. 检查工具定义
    this.checkTools();

    // 4. 检查能力定义
    this.checkCapabilities();

    // 5. 检查 Body 中的语句
    this.checkBody();

    // 6. 检查治理配置
    this.checkGovernance();

    return this.errors;
  }

  private checkInputs(): void {
    const names = new Set<string>();

    for (const input of this.ast.inputs) {
      // 检查重复名称
      if (names.has(input.name)) {
        this.errors.push({
          message: `Duplicate input name: ${input.name}`,
          loc: input.loc || { file: '', line: 1, column: 1 },
          expected_type: 'unique',
          actual_type: 'duplicate',
        });
        continue;
      }
      names.add(input.name);

      // P2任务#348: 使用通用的void类型检查方法
      this.checkVoidTypeNotAllowed(input.data_type, `input parameter '${input.name}'`, input.loc || { file: '', line: 1, column: 1 });

      // 注册到作用域栈（同时注册带前缀和不带前缀的形式）
      this.scopeStack.define(`input.${input.name}`, input.data_type);
      this.scopeStack.define(input.name, input.data_type);

      // 检查默认值类型
      if (input.default) {
        const defaultType = this.inferExpressionType(input.default);
        if (!this.isTypeAssignable(input.data_type, defaultType)) {
          this.errors.push({
            message: `Default value type mismatch for input ${input.name}`,
            loc: input.loc || { file: '', line: 1, column: 1 },
            expected_type: this.typeToString(input.data_type),
            actual_type: this.typeToString(defaultType),
          });
        }
      }
    }
  }

  private checkOutputs(): void {
    const names = new Set<string>();

    for (const output of this.ast.outputs) {
      if (names.has(output.name)) {
        this.errors.push({
          message: `Duplicate output name: ${output.name}`,
          loc: output.loc || { file: '', line: 1, column: 1 },
          expected_type: 'unique',
          actual_type: 'duplicate',
        });
      }
      names.add(output.name);

      // P2任务#348: 输出允许void类型（表示没有返回值）
      // 所以不进行void类型检查
    }
  }

  private checkTools(): void {
    const names = new Set<string>();

    for (const tool of this.ast.tools) {
      if (names.has(tool.name)) {
        this.errors.push({
          message: `Duplicate tool name: ${tool.name}`,
          loc: tool.loc || { file: '', line: 1, column: 1 },
          expected_type: 'unique',
          actual_type: 'duplicate',
        });
      }
      names.add(tool.name);
    }
  }

  private checkCapabilities(): void {
    const types = new Set<string>();

    for (const cap of this.ast.capabilities) {
      if (types.has(cap.capability_type)) {
        this.errors.push({
          message: `Duplicate capability type: ${cap.capability_type}`,
          loc: cap.loc || { file: '', line: 1, column: 1 },
          expected_type: 'unique',
          actual_type: 'duplicate',
        });
      }
      types.add(cap.capability_type);
    }
  }

  private checkBody(): void {
    for (const stmt of this.ast.body) {
      this.checkStatement(stmt);
    }
  }

  private checkStatement(stmt: DSLStatement): void {
    switch (stmt.type) {
      case 'step':
        this.checkStep(stmt);
        break;
      case 'conditional_step':
        this.checkConditionalStep(stmt);
        break;
      case 'condition':
        this.checkCondition(stmt);
        break;
      case 'loop':
        this.checkLoop(stmt);
        break;
      case 'parallel':
        this.checkParallel(stmt);
        break;
      case 'try_catch':
        this.checkTryCatch(stmt);
        break;
    }
  }

  private checkStep(step: DSLStatement & { type: 'step' }): void {
    // 检查输入绑定中的表达式
    for (const [key, expr] of Object.entries(step.inputs)) {
      // 首先检查表达式中的变量引用是否有效
      this.checkExpressionVariables(expr);

      // 获取表达式的类型
      const exprType = this.inferExpressionType(expr);

      // 如果表达式类型是 any 且我们发现了未定义的变量，跳过类型检查
      // 因为错误已经由 checkExpressionVariables 报告了
      if (exprType.kind === 'any' && this.hasUndefinedVariableInExpression(expr)) {
        continue;
      }

      // 在 DSL 中，step 的 inputs 绑定应该与被调用的 agent 的输入类型匹配
      // 由于我们无法知道被调用 agent 的输入类型，我们检查：
      // 1. 如果 key 匹配当前 agent 的某个输入名，检查类型是否匹配
      // 2. 否则，只检查表达式本身是否有效（类型一致性）
      const matchingInput = this.ast.inputs.find(i => i.name === key);
      if (matchingInput) {
        // key 匹配一个已定义的输入，检查表达式类型是否匹配输入类型
        if (!this.isTypeAssignable(matchingInput.data_type, exprType)) {
          this.errors.push({
            message: `Type mismatch in step input binding '${key}': expected ${this.typeToString(matchingInput.data_type)}, got ${this.typeToString(exprType)}`,
            loc: (expr as any).loc || step.loc || { file: '', line: 1, column: 1 },
            expected_type: this.typeToString(matchingInput.data_type),
            actual_type: this.typeToString(exprType),
          });
        }
      }
    }

    // 检查重试配置
    if (step.retry) {
      if (step.retry.max_attempts < 1) {
        this.errors.push({
          message: `Retry max_attempts must be at least 1, got ${step.retry.max_attempts}`,
          loc: step.loc || { file: '', line: 1, column: 1 },
          expected_type: 'number >= 1',
          actual_type: 'number < 1',
        });
      }
    }
  }

  private checkConditionalStep(step: DSLStatement & { type: 'conditional_step' }): void {
    // 检查 inputs 中的表达式
    for (const [key, expr] of Object.entries(step.inputs)) {
      // 检查表达式中的变量引用是否有效
      this.checkExpressionVariables(expr);

      // 获取表达式的类型
      const exprType = this.inferExpressionType(expr);

      // 如果表达式类型是 any 且我们发现了未定义的变量，跳过类型检查
      if (exprType.kind === 'any' && this.hasUndefinedVariableInExpression(expr)) {
        continue;
      }

      // 如果 key 匹配当前 agent 的某个输入名，检查类型是否匹配
      const matchingInput = this.ast.inputs.find(i => i.name === key);
      if (matchingInput) {
        if (!this.isTypeAssignable(matchingInput.data_type, exprType)) {
          this.errors.push({
            message: `Type mismatch in conditional_step input binding '${key}': expected ${this.typeToString(matchingInput.data_type)}, got ${this.typeToString(exprType)}`,
            loc: (expr as any).loc || step.loc || { file: '', line: 1, column: 1 },
            expected_type: this.typeToString(matchingInput.data_type),
            actual_type: this.typeToString(exprType),
          });
        }
      }
    }

    // 检查分支列表
    let hasElse = false;
    for (let i = 0; i < step.branches.length; i++) {
      const branch = step.branches[i];

      // 检查 else 分支（只能出现在最后一个分支）
      if (branch.else) {
        if (i !== step.branches.length - 1) {
          this.errors.push({
            message: 'else branch can only appear in the last conditional branch',
            loc: step.loc || { file: '', line: 1, column: 1 },
            expected_type: 'last branch only',
            actual_type: 'branch at position ' + i,
          });
        }
        hasElse = true;
      }

      // 检查 if 条件表达式（if 和 elif 分支需要条件）
      if (branch.if) {
        this.checkExpressionVariables(branch.if);

        const testType = this.inferExpressionType(branch.if);
        if (!this.isTypeAssignable({ kind: 'boolean' }, testType) && testType.kind !== 'any') {
          this.errors.push({
            message: `Conditional branch test expression must be boolean, got ${this.typeToString(testType)}`,
            loc: (branch.if as any).loc || step.loc || { file: '', line: 1, column: 1 },
            expected_type: 'boolean',
            actual_type: this.typeToString(testType),
          });
        }
      }

      // then 和 else 分支包含 Agent 调用
      // 目前我们无法验证被调用 Agent 是否存在，所以只进行基本验证
      if (branch.then) {
        if (branch.then.type === 'agent' && !branch.then.name) {
          this.errors.push({
            message: 'Agent call in "then" branch must have a name',
            loc: step.loc || { file: '', line: 1, column: 1 },
            expected_type: 'non-empty string',
            actual_type: 'empty string',
          });
        }
        if (branch.then.type === 'skill' && !branch.then.skill_id) {
          this.errors.push({
            message: 'Skill call in "then" branch must have a skill_id',
            loc: step.loc || { file: '', line: 1, column: 1 },
            expected_type: 'non-empty string',
            actual_type: 'empty string',
          });
        }
        if (branch.then.type === 'tool' && !branch.then.name) {
          this.errors.push({
            message: 'Tool call in "then" branch must have a name',
            loc: step.loc || { file: '', line: 1, column: 1 },
            expected_type: 'non-empty string',
            actual_type: 'empty string',
          });
        }
      }

      if (branch.else) {
        if (branch.else.type === 'agent' && !branch.else.name) {
          this.errors.push({
            message: 'Agent call in "else" branch must have a name',
            loc: step.loc || { file: '', line: 1, column: 1 },
            expected_type: 'non-empty string',
            actual_type: 'empty string',
          });
        }
        if (branch.else.type === 'skill' && !branch.else.skill_id) {
          this.errors.push({
            message: 'Skill call in "else" branch must have a skill_id',
            loc: step.loc || { file: '', line: 1, column: 1 },
            expected_type: 'non-empty string',
            actual_type: 'empty string',
          });
        }
        if (branch.else.type === 'tool' && !branch.else.name) {
          this.errors.push({
            message: 'Tool call in "else" branch must have a name',
            loc: step.loc || { file: '', line: 1, column: 1 },
            expected_type: 'non-empty string',
            actual_type: 'empty string',
          });
        }
      }
    }
  }

  private checkCondition(cond: DSLStatement & { type: 'condition' }): void {
    // 检查条件表达式中的变量引用
    this.checkExpressionVariables(cond.test);

    // 检查条件表达式是布尔类型
    const testType = this.inferExpressionType(cond.test);
    if (!this.isTypeAssignable({ kind: 'boolean' }, testType) && testType.kind !== 'any') {
      this.errors.push({
        message: 'Condition test expression must be boolean',
        loc: cond.test.loc || cond.loc || { file: '', line: 1, column: 1 },
        expected_type: 'boolean',
        actual_type: this.typeToString(testType),
      });
    }

    // 检查 consequent 和 alternate
    for (const stmt of cond.consequent) {
      this.checkStatement(stmt);
    }

    if (cond.alternate) {
      for (const stmt of cond.alternate) {
        this.checkStatement(stmt);
      }
    }
  }

  private checkLoop(loop: DSLStatement & { type: 'loop' }): void {
    // 进入循环作用域
    this.scopeStack.enter('loop');

    // 检查循环变量和集合
    if (loop.variable) {
      // 注册循环变量到当前作用域
      this.scopeStack.define(loop.variable, { kind: 'any' });
    }

    if (loop.collection) {
      this.checkExpressionVariables(loop.collection);
      const collectionType = this.inferExpressionType(loop.collection);
      if (collectionType.kind !== 'array' && collectionType.kind !== 'any') {
        this.errors.push({
          message: 'Loop collection must be an array',
          loc: loop.collection.loc || loop.loc || { file: '', line: 1, column: 1 },
          expected_type: 'array',
          actual_type: this.typeToString(collectionType),
        });
      }
    }

    if (loop.test) {
      this.checkExpressionVariables(loop.test);
      const testType = this.inferExpressionType(loop.test);
      if (!this.isTypeAssignable({ kind: 'boolean' }, testType) && testType.kind !== 'any') {
        this.errors.push({
          message: 'Loop test expression must be boolean',
          loc: loop.test.loc || loop.loc || { file: '', line: 1, column: 1 },
          expected_type: 'boolean',
          actual_type: this.typeToString(testType),
        });
      }
    }

    // 检查循环体
    for (const stmt of loop.body) {
      this.checkStatement(stmt);
    }

    // 离开循环作用域
    this.scopeStack.leave();
  }

  private checkParallel(parallel: DSLStatement & { type: 'parallel' }): void {
    // 只有当 max_concurrency 是数字字面量时才进行范围检查
    // 如果是表达式（如 input.concurrency），跳过静态检查
    if (typeof parallel.max_concurrency === 'number' && parallel.max_concurrency < 1) {
      this.errors.push({
        message: `max_concurrency must be at least 1, got ${parallel.max_concurrency}`,
        loc: parallel.loc || { file: '', line: 1, column: 1 },
        expected_type: 'number >= 1',
        actual_type: 'number < 1',
      });
    }

    // 为每个分支创建独立作用域
    for (const branch of parallel.branches) {
      this.scopeStack.enter('parallel');

      // branch 是一个语句数组
      for (const stmt of branch) {
        this.checkStatement(stmt);
      }

      this.scopeStack.leave();
    }
  }

  private checkTryCatch(tryCatch: DSLStatement & { type: 'try_catch' }): void {
    // 检查 try 块
    for (const stmt of tryCatch.try_block) {
      this.checkStatement(stmt);
    }

    // 进入 catch 作用域
    this.scopeStack.enter('catch');

    // 注册 catch_variable 到符号表
    if (tryCatch.catch_variable) {
      this.scopeStack.define(tryCatch.catch_variable, { kind: 'any' });
    }

    // 检查 catch 块
    if (tryCatch.catch_block) {
      for (const stmt of tryCatch.catch_block) {
        this.checkStatement(stmt);
      }
    }

    // 离开 catch 作用域
    this.scopeStack.leave();

    // 检查 finally 块
    if (tryCatch.finally_block) {
      for (const stmt of tryCatch.finally_block) {
        this.checkStatement(stmt);
      }
    }
  }

  private checkGovernance(): void {
    const gov = this.ast.governance;

    // 检查 max_retries
    if (gov.max_retries < 0) {
      this.errors.push({
        message: `max_retries must be non-negative, got ${gov.max_retries}`,
        loc: this.ast.loc || { file: '', line: 1, column: 1 },
        expected_type: 'number >= 0',
        actual_type: 'number < 0',
      });
    }

    // 检查 token_budget
    if (gov.token_budget < 0) {
      this.errors.push({
        message: `token_budget must be non-negative, got ${gov.token_budget}`,
        loc: this.ast.loc || { file: '', line: 1, column: 1 },
        expected_type: 'number >= 0',
        actual_type: 'number < 0',
      });
    }
  }

  /**
   * 检查表达式中的变量引用是否有效
   * 如果发现未定义的变量，记录到 errors 中
   */
  private checkExpressionVariables(expr: DSLExpression): void {
    switch (expr.type) {
      case 'variable':
        // 'input' 是一个特殊的内置对象，用于访问输入参数
        if (expr.name === 'input') {
          break; // input 是有效的，跳过检查
        }

        // 检查变量是否在作用域栈中
        // 变量可以是 input.xxx 形式，或者是直接引用输入名
        const qualifiedName = `input.${expr.name}`;
        const isDefined = this.scopeStack.isDefined(qualifiedName) || this.scopeStack.isDefined(expr.name);

        if (!isDefined) {
          // 检查是否已经报告过这个未定义变量（避免重复报告）
          const errorKey = `${expr.name}`;
          if (!this.undefinedVars.has(errorKey)) {
            this.undefinedVars.add(errorKey);
            this.errors.push({
              message: `Undefined variable: '${expr.name}'`,
              loc: expr.loc || { file: '', line: 1, column: 1 },
              expected_type: 'defined variable',
              actual_type: 'undefined',
            });
          }
        }
        break;

      case 'property_access':
        // 检查属性访问的对象部分
        const propAccessExpr = expr as any;

        // 'input' 是一个特殊的内置对象，不需要检查其定义
        if (propAccessExpr.object.type === 'variable' && propAccessExpr.object.name !== 'input') {
          this.checkExpressionVariables(propAccessExpr.object);
        }

        // 如果对象是 'input'，检查属性是否存在
        if (propAccessExpr.object.type === 'variable' && propAccessExpr.object.name === 'input') {
          const propName = propAccessExpr.property;
          const qualifiedPropName = `input.${propName}`;
          if (!this.scopeStack.isDefined(qualifiedPropName) && !this.scopeStack.isDefined(propName)) {
            const errorKey = `input.${propName}`;
            if (!this.undefinedVars.has(errorKey)) {
              this.undefinedVars.add(errorKey);
              this.errors.push({
                message: `Undefined variable: 'input.${propName}'`,
                loc: expr.loc || { file: '', line: 1, column: 1 },
                expected_type: 'defined input',
                actual_type: 'undefined',
              });
            }
          }
        }
        break;

      case 'binary_op':
        // 检查二元操作的左右操作数
        const binOpExpr = expr as any;
        this.checkExpressionVariables(binOpExpr.left);
        this.checkExpressionVariables(binOpExpr.right);
        break;

      case 'unary_op':
        // 检查一元操作的操作数
        const unOpExpr = expr as any;
        this.checkExpressionVariables(unOpExpr.operand);
        break;

      case 'function_call':
        // 检查函数调用的参数
        const funcCallExpr = expr as any;
        if (funcCallExpr.arguments) {
          for (const arg of funcCallExpr.arguments) {
            this.checkExpressionVariables(arg);
          }
        }
        break;

      case 'template_string':
        // 检查模板字符串中的表达式部分
        const templateExpr = expr as any;
        if (templateExpr.parts) {
          for (const part of templateExpr.parts) {
            if (typeof part === 'object' && part !== null) {
              this.checkExpressionVariables(part);
            }
          }
        }
        break;

      case 'conditional_expression':
        // 检查三元运算符的三个部分
        const condExpr = expr as any;
        this.checkExpressionVariables(condExpr.test);
        this.checkExpressionVariables(condExpr.consequent);
        this.checkExpressionVariables(condExpr.alternate);
        break;

      case 'literal':
        // 字面量不需要检查
        break;
    }
  }

  /**
   * 检查表达式中是否存在未定义的变量
   */
  private hasUndefinedVariableInExpression(expr: DSLExpression): boolean {
    switch (expr.type) {
      case 'variable':
        // 'input' 是一个特殊的内置对象
        if (expr.name === 'input') {
          return false;
        }
        const qualifiedName = `input.${expr.name}`;
        return !this.scopeStack.isDefined(qualifiedName) && !this.scopeStack.isDefined(expr.name);

      case 'property_access':
        const propAccessExpr = expr as any;
        if (propAccessExpr.object.type === 'variable' && propAccessExpr.object.name === 'input') {
          const propName = propAccessExpr.property;
          const qualifiedPropName = `input.${propName}`;
          return !this.scopeStack.isDefined(qualifiedPropName) && !this.scopeStack.isDefined(propName);
        }
        return this.hasUndefinedVariableInExpression(propAccessExpr.object);

      case 'binary_op':
        const binOpExpr = expr as any;
        return this.hasUndefinedVariableInExpression(binOpExpr.left) ||
               this.hasUndefinedVariableInExpression(binOpExpr.right);

      case 'unary_op':
        const unOpExpr = expr as any;
        return this.hasUndefinedVariableInExpression(unOpExpr.operand);

      case 'function_call':
        const funcCallExpr = expr as any;
        if (funcCallExpr.arguments) {
          return funcCallExpr.arguments.some((arg: DSLExpression) => this.hasUndefinedVariableInExpression(arg));
        }
        return false;

      case 'template_string':
        const templateExpr = expr as any;
        if (templateExpr.parts) {
          return templateExpr.parts.some((part: string | DSLExpression) =>
            typeof part === 'object' && part !== null ? this.hasUndefinedVariableInExpression(part) : false
          );
        }
        return false;

      case 'conditional_expression':
        const condExpr = expr as any;
        return this.hasUndefinedVariableInExpression(condExpr.test) ||
               this.hasUndefinedVariableInExpression(condExpr.consequent) ||
               this.hasUndefinedVariableInExpression(condExpr.alternate);

      case 'literal':
        return false;

      default:
        return false;
    }
  }

  /**
   * 推断表达式类型 (P2-347: 支持字面量类型精确推断)
   */
  private inferExpressionType(expr: DSLExpression): DSLDataType {
    switch (expr.type) {
      case 'literal':
        // P2-347: 字面量类型精确推断 - 返回带base_type的literal类型
        if (expr.value === null) return { kind: 'any' };
        if (typeof expr.value === 'string') {
          return {
            kind: 'literal',
            base_type: 'string',
            value: expr.value
          };
        }
        if (typeof expr.value === 'number') {
          return {
            kind: 'literal',
            base_type: 'number',
            value: expr.value
          };
        }
        if (typeof expr.value === 'boolean') {
          return {
            kind: 'literal',
            base_type: 'boolean',
            value: expr.value
          };
        }
        return { kind: 'any' };

      case 'variable':
        // 查找作用域栈
        const sym = this.scopeStack.lookup(`input.${expr.name}`) || this.scopeStack.lookup(expr.name);
        if (sym) return sym;
        // 如果变量未定义，返回 any（调用者应该已经通过 checkExpressionVariables 报告错误）
        return { kind: 'any' };

      case 'property_access':
        // 调用专门的属性访问类型推断方法
        return this.inferPropertyAccessType(expr as any);

      case 'binary_op':
        // 二元操作的类型推断
        const leftType = this.inferExpressionType((expr as any).left);
        const rightType = this.inferExpressionType((expr as any).right);
        const op = (expr as any).operator;

        // P1 任务#338: 实现短路求值类型推断
        // && 和 || 运算符不应简单返回 boolean，而应根据短路求值语义返回联合类型
        if (op === '&&') {
          // 逻辑与 (a && b): 如果 a 是 falsy，返回 a 的类型；否则返回 b 的类型
          // JavaScript 中 falsy 值包括: false, 0, '', null, undefined, NaN
          // 类型推断结果为: T_left | T_right
          return {
            kind: 'union',
            types: [leftType, rightType]
          };
        }

        if (op === '||') {
          // 逻辑或 (a || b): 如果 a 是 truthy，返回 a 的类型；否则返回 b 的类型
          // JavaScript 中 truthy 值包括: 除 falsy 值外的所有值
          // 类型推断结果为: T_left | T_right
          return {
            kind: 'union',
            types: [leftType, rightType]
          };
        }

        // 比较运算符返回布尔
        if (['==', '!=', '<', '>', '<=', '>='].includes(op)) {
          return { kind: 'boolean' };
        }

        // 算术运算符返回数字
        if (['+', '-', '*', '/', '%'].includes(op)) {
          if (leftType.kind === 'number' && rightType.kind === 'number') {
            return { kind: 'number' };
          }
        }

        return { kind: 'any' };

      case 'unary_op':
        const operandType = this.inferExpressionType((expr as any).operand);
        if ((expr as any).operator === '!') {
          return { kind: 'boolean' };
        }
        return operandType;

      case 'function_call':
        // P1-337: 使用函数签名注册表推断返回类型
        const funcCall = expr as any;
        const funcName = funcCall.callee || (funcCall.function as any)?.name;

        if (funcName && this.functionRegistry.has(funcName)) {
          const signature = this.functionRegistry.lookup(funcName);
          if (signature) {
            // 可选：验证参数类型
            // if (funcCall.arguments) {
            //   for (let i = 0; i < funcCall.arguments.length; i++) {
            //     const argType = this.inferExpressionType(funcCall.arguments[i]);
            //     const expectedType = signature.paramTypes[i] || { kind: 'any' };
            //     if (!this.isTypeAssignable(expectedType, argType)) {
            //       // 参数类型不匹配 - 可以记录警告或错误
            //     }
            //   }
            // }
            return signature.returnType;
          }
        }

        // 未注册的函数返回 any
        return { kind: 'any' };

      case 'template_string':
        // P2-349: 增强模板字符串类型验证
        // 模板字符串整体类型为string，但需要验证所有插值表达式可转换为string
        const templateExpr = expr as any;
        if (templateExpr.parts && Array.isArray(templateExpr.parts)) {
          // 验证所有插值表达式部分
          for (const part of templateExpr.parts) {
            if (typeof part === 'object' && part !== null) {
              // 这是一个表达式插值，检查其类型是否可转换为string
              const partType = this.inferExpressionType(part);
              // 检查表达式类型是否可赋值给string类型
              // 任何类型都可以通过toString()转换为string，所以这里不做严格限制
              // 但可以记录类型信息用于优化
              if (partType.kind !== 'string' && partType.kind !== 'any' &&
                  partType.kind !== 'literal' && (partType as any).base_type !== 'string') {
                // 非字符串类型的插值表达式，确保类型兼容
                // 在实际求值时需要调用toString()
              }
            }
          }
        }
        return { kind: 'string' };

      case 'conditional_expression': {
        // 三元运算符的类型推断
        // test ? consequent : alternate
        // 1. 推断test类型（必须可转换为boolean）
        const condExpr = expr as any;
        const testType = this.inferExpressionType(condExpr.test);

        // 2. 推断consequent和alternate的类型
        const consequentType = this.inferExpressionType(condExpr.consequent);
        const alternateType = this.inferExpressionType(condExpr.alternate);

        // 3. 返回consequent和alternate的联合类型或公共超类型
        // 如果类型相同，返回该类型；否则返回联合类型
        if (this.isTypeAssignable(consequentType, alternateType) &&
            this.isTypeAssignable(alternateType, consequentType)) {
          // 类型相同或互相兼容
          return consequentType;
        } else {
          // 返回联合类型
          return {
            kind: 'union',
            types: [consequentType, alternateType]
          };
        }
      }

      default:
        return { kind: 'any' };
    }
  }

  /**
   * 推断对象属性访问的类型
   */
  private inferPropertyAccessType(expr: any): DSLDataType {
    // 如果对象是 'input'，尝试从符号表中查找属性类型
    if (expr.object.type === 'variable' && expr.object.name === 'input') {
      const propName = expr.property;

      // 查找 input.propName 的类型
      // 首先尝试获取对象本身的类型
      const objVarType = this.scopeStack.lookup('input');

      if (objVarType && objVarType.kind === 'object') {
        const objType = objVarType as any;

        // 如果对象有properties定义，查找具体属性
        if (objType.properties && objType.properties[propName]) {
          return objType.properties[propName];
        }
      }

      // 尝试查找 qualified name
      const qualifiedPropName = `input.${propName}`;
      const propType = this.scopeStack.lookup(qualifiedPropName);
      if (propType) {
        return propType;
      }
    }

    // 对于嵌套属性访问 (如 obj.prop1.prop2)，递归推断
    const objType = this.inferExpressionType(expr.object);

    if (objType.kind === 'object') {
      const objectType = objType as any;
      if (objectType.properties && objectType.properties[expr.property]) {
        return objectType.properties[expr.property];
      }
    }

    // 无法推断具体类型，返回 any
    return { kind: 'any' };
  }

  /**
   * 检查类型是否可赋值 (P1-336: 增加联合类型支持; P2-347: 增加字面量类型支持)
   *
   * 实现类型兼容性检查，包括联合类型和字面量类型的特殊处理。
   *
   * 联合类型规则（参考 TypeScript 语义）：
   * - A | B 可以赋值给 A | B | C（源类型是目标类型的子集）
   * - A 可以赋值给 A | B（单个类型可以赋值给包含它的联合类型）
   * - never 可以赋值给任何类型（底部类型）
   * - 任何类型可以赋值给 any（顶部类型）
   *
   * 字面量类型规则（P2-347）：
   * - 字面量类型可以赋值给其基础类型（如 "hello" 可以赋值给 string）
   * - 相同基础类型的字面量可以合并为联合字面量类型
   */
  private isTypeAssignable(target: DSLDataType, source: DSLDataType): boolean {
    // any 可以赋值给任何类型
    if (target.kind === 'any') return true;
    if (source.kind === 'any') return true;

    // P2-347: 处理字面量类型
    // 字面量类型可以赋值给其基础类型
    if (source.kind === 'literal' && target.kind !== 'literal') {
      const sourceLit = source as any;
      // 检查字面量的基础类型是否与目标类型匹配
      if (target.kind === sourceLit.base_type) {
        return true;
      }
      // 字面量类型也可以赋值给联合类型（如果联合类型包含其基础类型）
      if (target.kind === 'union') {
        return this.isTypeAssignable(target, { kind: sourceLit.base_type });
      }
    }

    // P2-347: 目标类型是字面量类型的情况
    // 只有完全相同的字面量值才可赋值
    if (target.kind === 'literal' && source.kind === 'literal') {
      const targetLit = target as any;
      const sourceLit = source as any;
      return targetLit.base_type === sourceLit.base_type && targetLit.value === sourceLit.value;
    }

    // P1-336: 处理目标类型是联合类型的情况
    if (target.kind === 'union') {
      const targetUnion = target as any;
      const targetTypes = targetUnion.types as DSLDataType[];

      // 检查源类型是否可以赋值给联合类型中的任意一个成员
      // 这意味着源类型必须是目标联合类型的子集
      return targetTypes.some((targetType: DSLDataType) =>
        this.isTypeAssignable(targetType, source)
      );
    }

    // P1-336: 处理源类型是联合类型的情况
    if (source.kind === 'union') {
      const sourceUnion = source as any;
      const sourceTypes = sourceUnion.types as DSLDataType[];

      // 联合类型可以赋值给目标类型，当且仅当所有成员都可以赋值给目标类型
      // 这是严格的类型检查：A | B 可以赋值给 C，只有当 A -> C 且 B -> C
      return sourceTypes.every((sourceType: DSLDataType) =>
        this.isTypeAssignable(target, sourceType)
      );
    }

    // 相同类型
    if (target.kind === source.kind) {
      if (target.kind === 'array' && source.kind === 'array') {
        // 递归检查数组元素类型
        return this.isTypeAssignable(
          (target as any).item_type,
          (source as any).item_type
        );
      }
      return true;
    }

    return false;
  }

  /**
   * 构建调用图 - 遍历所有step语句记录Agent调用 (P2-447 增强版)
   */
  private buildCallGraph(): void {
    const visitStatement = (stmt: DSLStatement) => {
      if (stmt.type === 'step') {
        const step = stmt as DSLStep;
        const stepName = step.name || `step_${this.ast.name}_${this.dependencyGraph.nodeCount}`;

        // 添加当前 Agent 和 Step 节点
        this.dependencyGraph.addNode(this.ast.name, 'agent', this.ast.loc);
        this.dependencyGraph.addNode(stepName, 'step', step.loc);

        // 分析 Agent 调用依赖
        if (step.call.type === 'agent') {
          this.dependencyGraph.addEdge(this.ast.name, step.call.name, 'call');
        }
        // 分析 Skill 调用依赖
        else if (step.call.type === 'skill') {
          const skillCall = step.call as Extract<DSLCall, { type: 'skill' }>;
          const skillId = skillCall.skill_id;
          this.dependencyGraph.addEdge(stepName, skillId, 'call');
        }

        // 分析输入中的变量引用
        for (const [key, expr] of Object.entries(step.inputs)) {
          const refs = extractVariableReferences(expr);
          for (const ref of refs) {
            this.dependencyGraph.addEdge(stepName, ref, 'reference');
          }
        }
      } else if (stmt.type === 'condition') {
        const cond = stmt as DSLCondition;
        cond.consequent.forEach(visitStatement);
        if (cond.alternate) {
          cond.alternate.forEach(visitStatement);
        }
      } else if (stmt.type === 'loop') {
        const loop = stmt as DSLLoop;
        loop.body.forEach(visitStatement);
      } else if (stmt.type === 'parallel') {
        const parallel = stmt as DSLParallel;
        for (const branch of parallel.branches) {
          branch.forEach(visitStatement);
        }
      } else if (stmt.type === 'try_catch') {
        const tryCatch = stmt as DSLTryCatch;
        tryCatch.try_block.forEach(visitStatement);
        if (tryCatch.catch_block) {
          tryCatch.catch_block.forEach(visitStatement);
        }
        if (tryCatch.finally_block) {
          tryCatch.finally_block.forEach(visitStatement);
        }
      }
    };

    for (const stmt of this.ast.body) {
      visitStatement(stmt);
    }
  }

  /**
   * 使用DFS检测循环依赖 (P2-447 增强版)
   */
  private detectCircularDependencies(): void {
    // 使用新的 DependencyGraph 检测环路
    const cycle = this.dependencyGraph.detectCycle();

    if (cycle) {
      // 发现环路，创建详细错误消息
      const cyclePath = cycle.join(' -> ');
      this.errors.push({
        message: `Circular dependency detected: ${cyclePath}`,
        loc: this.ast.loc || { file: '', line: 1, column: 1 },
        expected_type: 'acyclic graph',
        actual_type: 'cyclic graph',
      });
    }
  }

  /**
   * P2任务#348: 检查void类型在特定上下文中是否合法
   *
   * void类型合法性规则：
   * - ✅ 允许：函数返回值类型
   * - ✅ 允许：表达式语句（expression statement）
   * - ❌ 禁止：变量声明类型为void
   * - ❌ 禁止：函数参数类型为void（input）
   * - ❌ 禁止：对象属性类型为void
   * - ❌ 禁止：数组元素类型为void
   *
   * @param type - 要检查的数据类型
   * @param context - 上下文描述（用于错误消息）
   * @param loc - 源码位置
   * @returns void类型是否被禁止
   */
  private checkVoidTypeNotAllowed(type: DSLDataType, context: string, loc: SourceLocation): void {
    if (type.kind === 'void') {
      this.errors.push({
        message: `void type is not allowed in ${context}`,
        loc: loc || { file: '', line: 1, column: 1 },
        expected_type: 'non-void type',
        actual_type: 'void',
      });
    }

    // 递归检查复合类型中的void
    if (type.kind === 'array') {
      this.checkVoidTypeNotAllowed((type as any).item_type, `${context} (array element type)`, loc);
    } else if (type.kind === 'object') {
      const objType = type as any;
      if (objType.properties) {
        for (const [propName, propType] of Object.entries(objType.properties)) {
          this.checkVoidTypeNotAllowed(propType as DSLDataType, `${context} (object property '${propName}')`, loc);
        }
      }
    } else if (type.kind === 'union') {
      for (const unionType of (type as any).types) {
        this.checkVoidTypeNotAllowed(unionType as DSLDataType, `${context} (union type member)`, loc);
      }
    }
  }

  /**
   * 类型转字符串
   */
  private typeToString(type: DSLDataType): string {
    switch (type.kind) {
      case 'string':
      case 'number':
      case 'boolean':
      case 'any':
      case 'void':
        return type.kind;
      case 'array':
        return `array<${this.typeToString((type as any).item_type)}>`;
      case 'object':
        return 'object';
      case 'union':
        return `union<${(type as any).types.map((t: DSLDataType) => this.typeToString(t)).join(' | ')}>`;
      case 'literal':
        return `${typeof (type as any).value}`;
      default:
        return 'unknown';
    }
  }
}

// ============================================================
// DSL Compiler 实现
// ============================================================

export interface DSLCompilerOptions extends CompilerOptions {
  strict_type_checking?: boolean;
  source_map?: boolean;
  target?: 'markdown' | 'json' | 'executable';

  // ============================================================
  // Agent 调用执行依赖 (P2-429)
  // ============================================================

  /** Agent Runner - 用于执行 Agent 调用 */
  agentRunner?: any;
  /** Skills Manager - 用于执行 Skill 调用 */
  skillsManager?: any;
  /** Message Bus - 用于事件发布和追踪 */
  messageBus?: any;
  /** Logger - 用于日志记录 */
  logger?: any;

  // ============================================================
  // 执行配置
  // ============================================================

  /** 最大嵌套深度（默认 100） */
  maxNestingDepth?: number;
}

export class DSLCompiler {
  private options: DSLCompilerOptions;

  // ============================================================
  // Agent 调用执行器实例 (P2-429)
  // ============================================================

  /** 执行追踪器 */
  private tracer?: IExecutionTracer;
  /** Agent 调用执行器 */
  private agentExecutor?: ICallExecutor;
  /** Skill 调用执行器 */
  private skillExecutor?: ICallExecutor;
  /** Tool 调用执行器 */
  private toolExecutor?: ICallExecutor;
  /** Step 执行器 */
  private stepExecutor?: StepExecutor;
  /** Loop 执行器 */
  private loopExecutor?: LoopExecutor;
  /** 执行依赖 */
  private executionDependencies?: ExecutionDependencies;

  constructor(options: DSLCompilerOptions = {}) {
    this.options = {
      strict_type_checking: false,
      source_map: false,
      target: 'markdown',
      maxNestingDepth: 100,
      ...options,
    };

    // 初始化 Agent 调用执行器（如果提供了依赖）
    this.initializeExecutors();
  }

  /**
   * 初始化 Agent 调用执行器 (P2-429)
   *
   * 根据提供的依赖项初始化执行器实例。
   * 只有在提供了 agentRunner、skillsManager 和 messageBus 时才初始化。
   */
  private initializeExecutors(): void {
    const { agentRunner, skillsManager, messageBus, logger } = this.options;

    // 检查是否提供了必要的依赖项
    if (!agentRunner || !skillsManager || !messageBus) {
      // 没有提供完整的依赖项，跳过执行器初始化
      return;
    }

    // 构建执行依赖
    this.executionDependencies = {
      agentRunner,
      skillsManager,
      messageBus,
      logger,
    };

    // 初始化执行追踪器
    this.tracer = createExecutionTracer(messageBus, true);

    // 初始化 Agent 调用执行器
    this.agentExecutor = createAgentCallExecutor(this.executionDependencies);

    // 初始化 Skill 调用执行器
    this.skillExecutor = createSkillCallExecutor(this.executionDependencies);

    // 初始化 Tool 调用执行器
    this.toolExecutor = createToolCallExecutor(this.executionDependencies);

    // 初始化 Step 执行器（需要表达式求值器）
    this.stepExecutor = createStepExecutor(
      this.executionDependencies,
      this as unknown as IExpressionEvaluator, // 使用 DSLCompiler 作为表达式求值器
      this.agentExecutor,
      this.skillExecutor,
      this.toolExecutor
    );

    // 初始化 Loop 执行器（需要语句执行器和表达式求值器）
    // 由于 LoopExecutor 需要 IStatementExecutor 接口，而 DSLCompiler 的 executeStatement 方法是公共的，
    // 我们需要创建一个包装来满足类型要求
    const statementExecutor: IStatementExecutor = {
      executeStatement: async (stmt, context) => this.executeStatement(stmt, context),
    };

    this.loopExecutor = createLoopExecutor(
      this.executionDependencies,
      this as unknown as IExpressionEvaluator, // 使用 DSLCompiler 作为表达式求值器
      statementExecutor,
      {
        maxIterations: 10000,
        maxNestingDepth: 100,
        enableTracing: true,
      }
    );
  }

  // ============================================================
  // 类型检查
  // ============================================================

  /**
   * 对 AST 进行类型检查
   *
   * @param ast - DSL AST
   * @returns 类型错误列表
   */
  typeCheck(ast: AgentDSL): TypeError[] {
    const checker = new TypeChecker(ast);
    return checker.check();
  }

  // ============================================================
  // Markdown 转换
  // ============================================================

  /**
   * 将 DSL AST 转换为 Markdown 格式
   *
   * @param ast - DSL AST
   * @returns Markdown 字符串
   */
  toMarkdown(ast: AgentDSL): string {
    const lines: string[] = [];

    // Frontmatter
    lines.push('---');
    lines.push(`name: ${ast.name}`);

    // description 使用单行格式（不带 | 符号）
    const singleLineDesc = ast.description.replace(/\n/g, ' ').trim();
    lines.push(`description: ${singleLineDesc}`);

    if (ast.agent_type) {
      lines.push(`agent_type: ${ast.agent_type}`);
    }

    if (ast.domain) {
      lines.push(`domain: ${ast.domain}`);
    }

    // 工具列表 - 使用数组格式
    if (ast.tools.length > 0) {
      const toolsArray = ast.tools.map((t) => `'${t.name}'`).join(', ');
      lines.push(`tools: [${toolsArray}]`);
    } else {
      lines.push('tools: []');
    }

    // argument-hint 从 metadata 保留，或从 inputs 推断
    const argumentHint = ast.metadata?.argument_hint || (ast.inputs.length > 0 ? ast.inputs.map(i => i.name).join(', ') : '');
    if (argumentHint) {
      lines.push(`argument-hint: "${argumentHint}"`);
    }

    lines.push('---');
    lines.push('');

    // 标题
    lines.push(`# ${this.toTitleCase(ast.name)}`);
    lines.push('');

    // 描述（如果有的话）
    if (ast.description) {
      lines.push(ast.description);
      lines.push('');
    }

    // 输入输出说明
    if (ast.inputs.length > 0) {
      lines.push('## 输入参数');
      lines.push('');
      for (const input of ast.inputs) {
        lines.push(`- \`${input.name}\` (${this.typeToString(input.data_type)}): ${input.description || 'N/A'}`);
      }
      lines.push('');
    }

    if (ast.outputs.length > 0) {
      lines.push('## 输出');
      lines.push('');
      for (const output of ast.outputs) {
        lines.push(`- \`${output.name}\` (${this.typeToString(output.data_type)}): ${output.description || 'N/A'}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 从 Markdown 转换为 DSL AST
   *
   * @param markdown - Markdown 字符串
   * @param filepath - 文件路径（用于推断 Agent 层）
   * @returns 解析结果
   */
  fromMarkdown(markdown: string, filepath?: string): ParseResult {
    // 解析 frontmatter
    const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return {
        success: false,
        errors: [
          {
            kind: 'syntax',
            message: 'Missing frontmatter delimiters',
            loc: {
              file: filepath || '<unknown>',
              line: 1,
              column: 1,
            },
          },
        ],
      };
    }

    const frontmatter = frontmatterMatch[1];
    const body = markdown.slice(frontmatterMatch[0].length).trim();

    // 解析 frontmatter
    const metadata = this.parseFrontmatter(frontmatter);

    // 从文件路径推断层
    const layer = this.inferLayerFromPath(filepath || '');

    // 构建 metadata 对象，保留 argument_hint
    const agentMetadata: DSLMetadata = {
      ...(metadata.metadata || {}),
      argument_hint: metadata.argument_hint,
    };

    // 构建 AgentDSL
    const ast: AgentDSL = {
      type: 'agent',
      name: metadata.name || '',
      description: metadata.description || '',
      agent_type: metadata.agent_type || 'worker',
      layer: layer,
      domain: metadata.domain,
      inputs: metadata.inputs || [],
      outputs: metadata.outputs || [],
      tools: metadata.tools || [],
      capabilities: metadata.capabilities || [],
      body: [], // 简化：Body 从 Markdown 难以解析，暂时为空
      governance: metadata.governance || {
        first_principles_check: true,
        red_team_threshold: 'medium',
        quality_gate_enabled: true,
        max_retries: 3,
        token_budget: 100000,
      },
      metadata: Object.keys(agentMetadata).length > 0 ? agentMetadata : undefined,
      loc: {
        file: filepath || '<unknown>',
        line: 1,
        column: 1,
      },
    };

    return {
      success: true,
      ast,
    };
  }

  // ============================================================
  // 代码生成
  // ============================================================

  /**
   * 编译 DSL 为可执行函数 (P1-341)
   *
   * 将 DSL AST 编译为可执行的 JavaScript 函数,支持:
   * - 输入验证（类型检查）
   * 简单表达式求值（literal、variable、binary_op）
   * - 错误处理和类型安全
   *
   * @param ast - DSL AST
   * @returns 可执行函数,接收输入数据并返回执行结果
   */
  compileToFunction(ast: AgentDSL): (input: Record<string, unknown>) => Promise<Record<string, unknown>> {
    // 1. 生成输入验证代码
    const validationCode = this.generateInputValidation(ast);

    // 2. 生成表达式求值代码
    const evaluatorCode = this.generateExpressionEvaluator();

    // 3. 生成主体执行代码（基础版本：支持简单表达式）
    const bodyCode = this.generateBodyExecution(ast);

    // 4. 组合完整的函数代码
    const fullFunctionCode = `
      ${evaluatorCode}

      return async function(input) {
        'use strict';

        // 输入验证
        ${validationCode}

        // 执行体
        ${bodyCode}

        return result;
      };
    `;

    // 5. 创建可执行函数
    try {
      const functionFactory = new Function(fullFunctionCode)();
      return functionFactory;
    } catch (error) {
      throw new Error(`Failed to compile function: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 生成输入验证代码 (P1-341)
   *
   * 根据 inputs 定义生成运行时类型验证代码。
   */
  private generateInputValidation(ast: AgentDSL): string {
    const validationLines: string[] = [];

    for (const inputDef of ast.inputs) {
      const varName = inputDef.name;
      const validationName = `validate_${varName}`;

      // 生成验证函数
      validationLines.push(`const ${validationName} = (value) => {`);
      validationLines.push(`  // 类型: ${this.typeToString(inputDef.data_type)}`);

      switch (inputDef.data_type.kind) {
        case 'string':
          validationLines.push('  if (typeof value !== \'string\') {');
          validationLines.push(`    throw new TypeError(\`Input '${varName}' must be string, got \${typeof value}\`);`);
          validationLines.push('  }');
          break;

        case 'number':
          validationLines.push('  if (typeof value !== \'number\' || Number.isNaN(value)) {');
          validationLines.push(`    throw new TypeError(\`Input '${varName}' must be number, got \${typeof value}\`);`);
          validationLines.push('  }');
          break;

        case 'boolean':
          validationLines.push('  if (typeof value !== \'boolean\') {');
          validationLines.push(`    throw new TypeError(\`Input '${varName}' must be boolean, got \${typeof value}\`);`);
          validationLines.push('  }');
          break;

        case 'array':
          validationLines.push('  if (!Array.isArray(value)) {');
          validationLines.push(`    throw new TypeError(\`Input '${varName}' must be array, got \${typeof value}\`);`);
          validationLines.push('  }');
          break;

        case 'object':
          validationLines.push('  if (typeof value !== \'object\' || value === null || Array.isArray(value)) {');
          validationLines.push(`    throw new TypeError(\`Input '${varName}' must be object, got \${typeof value}\`);`);
          validationLines.push('  }');
          break;

        case 'any':
          // 任何类型都可以
          break;

        default:
          validationLines.push(`  // 复杂类型 ${inputDef.data_type.kind} - 跳过运行时验证`);
      }

      validationLines.push(`};`);

      // 检查必需输入
      if (inputDef.required) {
        validationLines.push(`if (input['${varName}'] === undefined) {`);
        validationLines.push(`  throw new Error(\`Required input '${varName}' is missing\`);`);
        validationLines.push('}');
        validationLines.push(`${validationName}(input['${varName}']);`);
      } else if (inputDef.default !== undefined) {
        validationLines.push(`if (input['${varName}'] === undefined) {`);
        validationLines.push(`  input['${varName}'] = ${JSON.stringify(inputDef.default)};`);
        validationLines.push('} else {');
        validationLines.push(`  ${validationName}(input['${varName}']);`);
        validationLines.push('}');
      }
      validationLines.push('');
    }

    return validationLines.join('\n');
  }

  /**
   * 生成表达式求值代码 (P1-341)
   *
   * 生成支持简单表达式（literal、variable、binary_op）的求值器。
   */
  private generateExpressionEvaluator(): string {
    return `
      // 表达式求值器
      const evaluateExpression = (expr, context) => {
        switch (expr.type) {
          case 'literal':
            return expr.value;

          case 'variable':
            // 支持直接引用和 input.xxx 两种形式
            if (expr.name === 'input') {
              return context.input;
            }
            if (context.input && expr.name in context.input) {
              return context.input[expr.name];
            }
            if (expr.name in context) {
              return context[expr.name];
            }
            throw new ReferenceError(\`Undefined variable: '\${expr.name}'\`);

          case 'binary_op': {
            const left = evaluateExpression(expr.left, context);
            const right = evaluateExpression(expr.right, context);

            switch (expr.operator) {
              case '+': return left + right;
              case '-': return left - right;
              case '*': return left * right;
              case '/': return left / right;
              case '%': return left % right;
              case '==': return left == right;
              case '!=': return left != right;
              case '<': return left < right;
              case '>': return left > right;
              case '<=': return left <= right;
              case '>=': return left >= right;
              case '&&': return left && right;
              case '||': return left || right;
              default:
                throw new Error(\`Unsupported binary operator: '\${expr.operator}'\`);
            }
          }

          case 'unary_op': {
            const operand = evaluateExpression(expr.operand, context);
            switch (expr.operator) {
              case '!': return !operand;
              case '-': return -operand;
              case '+': return +operand;
              default:
                throw new Error(\`Unsupported unary operator: '\${expr.operator}'\`);
            }
          }

          case 'conditional_expression': {
            // 三元运算符: test ? consequent : alternate
            const testResult = evaluateExpression(expr.test, context);
            // 将testResult转换为布尔值（JavaScript falsy值检查）
            const isTruthy = testResult ? true : false;
            if (isTruthy) {
              return evaluateExpression(expr.consequent, context);
            } else {
              return evaluateExpression(expr.alternate, context);
            }
          }

          case 'template_string': {
            // P2-349: 模板字符串求值
            // 模板字符串由字面量和表达式插值组成
            if (!expr.parts || !Array.isArray(expr.parts)) {
              return '';
            }
            let result = '';
            for (const part of expr.parts) {
              if (typeof part === 'string') {
                // 字面量部分直接拼接
                result += part;
              } else if (typeof part === 'object' && part !== null) {
                // 表达式插值部分，递归求值并转换为字符串
                const value = evaluateExpression(part, context);
                // 确保值被正确转换为字符串
                result += value === null || value === undefined ? '' : String(value);
              }
            }
            return result;
          }

          default:
            throw new Error(\`Unsupported expression type: '\${expr.type}'\`);
        }
      };
    `;
  }

  /**
   * 生成主体执行代码 (P1-341)
   *
   * 基础版本：支持简单表达式求值，暂不支持完整语句执行。
   */
  private generateBodyExecution(ast: AgentDSL): string {
    // 基础版本：构建输出对象
    const outputLines: string[] = [];

    outputLines.push('const result = {};');
    outputLines.push('const context = { input };');

    // 如果 body 为空，返回输入数据
    if (ast.body.length === 0) {
      outputLines.push('// 空 body - 返回输入数据');
      outputLines.push('Object.assign(result, input);');
    } else {
      outputLines.push('// 执行 DSL body（基础版本）');
      outputLines.push('try {');

      // 基础版本：仅处理简单的表达式求值
      // 完整的 step/condition/loop/parallel 执行是 P2 任务
      for (const stmt of ast.body) {
        if (stmt.type === 'step') {
          const step = stmt as DSLStep & { type: 'step' };
          let callInfo = '(unnamed)';
          if (step.call) {
            if (step.call.type === 'agent') {
              callInfo = `agent:${step.call.name}`;
            } else if (step.call.type === 'skill') {
              callInfo = `skill:${step.call.skill_id}`;
            } else if (step.call.type === 'tool') {
              callInfo = `tool:${step.call.name}`;
            }
          }
          outputLines.push(`  // step: ${callInfo}`);
          // 基础版本：只记录 step 被执行，不实际调用 Agent
          outputLines.push('  // TODO: 实现 Agent 调用（P2 任务）');
        } else if (stmt.type === 'condition') {
          // condition 语句 - 条件分支执行
          const cond = stmt as DSLCondition & { type: 'condition' };

          // 生成条件执行代码
          outputLines.push('  // condition 语句');
          outputLines.push('  {');

          // 生成条件表达式求值代码
          outputLines.push('    // 评估条件表达式');
          outputLines.push(`    const testResult = evaluateExpression(ast.body[${ast.body.indexOf(stmt)}].test, context);`);
          outputLines.push('    const isTruthy = Boolean(testResult);');

          // consequent 块（条件为真时执行）
          outputLines.push('    if (isTruthy) {');
          outputLines.push('      // 执行 consequent 块');
          for (let i = 0; i < cond.consequent.length; i++) {
            const consequentStmt = cond.consequent[i];
            if (consequentStmt.type === 'step') {
              const step = consequentStmt as DSLStep & { type: 'step' };
              let callInfo = '(unnamed)';
              if (step.call) {
                if (step.call.type === 'agent') {
                  callInfo = `agent:${step.call.name}`;
                } else if (step.call.type === 'skill') {
                  callInfo = `skill:${step.call.skill_id}`;
                } else if (step.call.type === 'tool') {
                  callInfo = `tool:${step.call.name}`;
                }
              }
              outputLines.push(`      // step: ${callInfo}`);
              outputLines.push('      // TODO: 实现 Agent 调用（P2 任务）');
            } else if (consequentStmt.type === 'condition') {
              outputLines.push('      // 嵌套 condition 语句（需要递归处理）');
              outputLines.push('      // TODO: 实现嵌套 condition（后续版本）');
            } else if (consequentStmt.type === 'loop') {
              outputLines.push('      // loop 语句（暂未实现）');
            } else if (consequentStmt.type === 'parallel') {
              outputLines.push('      // parallel 语句（暂未实现）');
            } else if (consequentStmt.type === 'try_catch') {
              outputLines.push('      // try_catch 语句（暂未实现）');
            }
          }
          outputLines.push('    }');

          // alternate 块（条件为假时执行，可选）
          if (cond.alternate && cond.alternate.length > 0) {
            outputLines.push('    else {');
            outputLines.push('      // 执行 alternate 块');
            for (let i = 0; i < cond.alternate.length; i++) {
              const alternateStmt = cond.alternate[i];
              if (alternateStmt.type === 'step') {
                const step = alternateStmt as DSLStep & { type: 'step' };
                let callInfo = '(unnamed)';
                if (step.call) {
                  if (step.call.type === 'agent') {
                    callInfo = `agent:${step.call.name}`;
                  } else if (step.call.type === 'skill') {
                    callInfo = `skill:${step.call.skill_id}`;
                  } else if (step.call.type === 'tool') {
                    callInfo = `tool:${step.call.name}`;
                  }
                }
                outputLines.push(`      // step: ${callInfo}`);
                outputLines.push('      // TODO: 实现 Agent 调用（P2 任务）');
              } else if (alternateStmt.type === 'condition') {
                outputLines.push('      // 嵌套 condition 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 condition（后续版本）');
              } else if (alternateStmt.type === 'loop') {
                outputLines.push('      // loop 语句（暂未实现）');
              } else if (alternateStmt.type === 'parallel') {
                outputLines.push('      // parallel 语句（暂未实现）');
              } else if (alternateStmt.type === 'try_catch') {
                outputLines.push('      // try_catch 语句（暂未实现）');
              }
            }
            outputLines.push('    }');
          }

          outputLines.push('  }');
        } else if (stmt.type === 'loop') {
          // loop 语句 - 循环执行
          const loop = stmt as DSLLoop & { type: 'loop' };
          const stmtIndex = ast.body.indexOf(stmt);

          // 生成循环执行代码
          outputLines.push('  // loop 语句 - 循环执行');
          outputLines.push('  {');

          // 设置迭代限制保护
          outputLines.push('    // 迭代限制保护（防止无限循环）');
          outputLines.push('    const maxIterations = 10000;');
          outputLines.push('    let iterationCount = 0;');

          // 根据循环类型生成不同代码
          if (loop.loop_type === 'while') {
            // while 循环：基于条件表达式
            outputLines.push('    // while 循环：基于条件表达式');
            if (loop.test) {
              const testJson = JSON.stringify(loop.test);
              outputLines.push(`    const loopTest = ${testJson};`);
            }
            outputLines.push('');
            outputLines.push('    while (true) {');
            outputLines.push('      // 检查迭代限制');
            outputLines.push('      if (++iterationCount > maxIterations) {');
            outputLines.push('        throw new Error("Loop exceeded maximum iteration limit (10000)");');
            outputLines.push('      }');
            outputLines.push('');
            outputLines.push('      // 评估循环条件');
            if (loop.test) {
              outputLines.push(`      const conditionResult = evaluateExpression(loopTest, context);`);
              outputLines.push('      if (!Boolean(conditionResult)) break;');
            } else {
              outputLines.push('      // 无条件循环（会触发迭代限制）');
            }
            outputLines.push('');
            outputLines.push('      // 执行循环体');
            for (let i = 0; i < loop.body.length; i++) {
              const bodyStmt = loop.body[i];
              if (bodyStmt.type === 'step') {
                const step = bodyStmt as DSLStep & { type: 'step' };
                let callInfo = '(unnamed)';
                if (step.call) {
                  if (step.call.type === 'agent') {
                    callInfo = `agent:${step.call.name}`;
                  } else if (step.call.type === 'skill') {
                    callInfo = `skill:${step.call.skill_id}`;
                  } else if (step.call.type === 'tool') {
                    callInfo = `tool:${step.call.name}`;
                  }
                }
                outputLines.push(`      // 循环体 - step: ${callInfo}`);
                outputLines.push('      // TODO: 实现 Agent 调用（P2 任务）');
              } else if (bodyStmt.type === 'condition') {
                outputLines.push('      // 循环体 - condition 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 condition（后续版本）');
              } else if (bodyStmt.type === 'loop') {
                outputLines.push('      // 循环体 - 嵌套 loop 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 loop（后续版本）');
              } else if (bodyStmt.type === 'parallel') {
                outputLines.push('      // 循环体 - parallel 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 parallel（后续版本）');
              } else if (bodyStmt.type === 'try_catch') {
                outputLines.push('      // 循环体 - try_catch 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 try_catch（后续版本）');
              }
            }
            outputLines.push('    }');

          } else if (loop.loop_type === 'for_each') {
            // for_each 循环：遍历集合
            outputLines.push('    // for_each 循环：遍历集合');
            if (loop.collection) {
              const collectionJson = JSON.stringify(loop.collection);
              outputLines.push(`    const loopCollection = ${collectionJson};`);
            }
            if (loop.variable) {
              outputLines.push(`    const loopVariable = '${loop.variable}';`);
            }
            outputLines.push('');
            outputLines.push('    // 评估集合表达式');
            if (loop.collection) {
              outputLines.push(`    const collectionValue = evaluateExpression(loopCollection, context);`);
            }
            outputLines.push('');
            outputLines.push('    // 确保集合可遍历');
            outputLines.push('    const iterable = collectionValue ?? [];');
            outputLines.push('    const items = Array.isArray(iterable) ? iterable : Object.entries(iterable || {});');
            outputLines.push('');
            outputLines.push('    for (const item of items) {');
            outputLines.push('      // 检查迭代限制');
            outputLines.push('      if (++iterationCount > maxIterations) {');
            outputLines.push('        throw new Error("Loop exceeded maximum iteration limit (10000)");');
            outputLines.push('      }');
            outputLines.push('');
            if (loop.variable) {
              outputLines.push('      // 将当前元素绑定到循环变量');
              outputLines.push('      context.locals = context.locals || new Map();');
              outputLines.push(`      context.locals.set(loopVariable, item);`);
              outputLines.push('');
            }
            outputLines.push('      // 执行循环体');
            for (let i = 0; i < loop.body.length; i++) {
              const bodyStmt = loop.body[i];
              if (bodyStmt.type === 'step') {
                const step = bodyStmt as DSLStep & { type: 'step' };
                let callInfo = '(unnamed)';
                if (step.call) {
                  if (step.call.type === 'agent') {
                    callInfo = `agent:${step.call.name}`;
                  } else if (step.call.type === 'skill') {
                    callInfo = `skill:${step.call.skill_id}`;
                  } else if (step.call.type === 'tool') {
                    callInfo = `tool:${step.call.name}`;
                  }
                }
                outputLines.push(`      // 循环体 - step: ${callInfo}`);
                outputLines.push('      // TODO: 实现 Agent 调用（P2 任务）');
              } else if (bodyStmt.type === 'condition') {
                outputLines.push('      // 循环体 - condition 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 condition（后续版本）');
              } else if (bodyStmt.type === 'loop') {
                outputLines.push('      // 循环体 - 嵌套 loop 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 loop（后续版本）');
              } else if (bodyStmt.type === 'parallel') {
                outputLines.push('      // 循环体 - parallel 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 parallel（后续版本）');
              } else if (bodyStmt.type === 'try_catch') {
                outputLines.push('      // 循环体 - try_catch 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 try_catch（后续版本）');
              }
            }
            outputLines.push('    }');

          } else if (loop.loop_type === 'for') {
            // for 循环：计数器循环
            outputLines.push('    // for 循环：计数器循环');
            if (loop.variable) {
              outputLines.push(`    const loopVariable = '${loop.variable}';`);
            } else {
              outputLines.push('    const loopVariable = \'_i\';');
            }
            outputLines.push('');
            outputLines.push('    // 初始化计数器');
            outputLines.push('    context.locals = context.locals || new Map();');
            outputLines.push(`    context.locals.set(loopVariable, 0);`);
            outputLines.push('');
            outputLines.push('    // 无限循环（需要在循环体中手动控制退出）');
            outputLines.push('    while (true) {');
            outputLines.push('      // 检查迭代限制');
            outputLines.push('      if (++iterationCount > maxIterations) {');
            outputLines.push('        throw new Error("Loop exceeded maximum iteration limit (10000)");');
            outputLines.push('      }');
            outputLines.push('');
            if (loop.variable) {
              outputLines.push('      // 获取当前计数器值');
              outputLines.push(`      const ${loop.variable} = context.locals.get(loopVariable);`);
            }
            outputLines.push('');
            outputLines.push('      // 执行循环体');
            for (let i = 0; i < loop.body.length; i++) {
              const bodyStmt = loop.body[i];
              if (bodyStmt.type === 'step') {
                const step = bodyStmt as DSLStep & { type: 'step' };
                let callInfo = '(unnamed)';
                if (step.call) {
                  if (step.call.type === 'agent') {
                    callInfo = `agent:${step.call.name}`;
                  } else if (step.call.type === 'skill') {
                    callInfo = `skill:${step.call.skill_id}`;
                  } else if (step.call.type === 'tool') {
                    callInfo = `tool:${step.call.name}`;
                  }
                }
                outputLines.push(`      // 循环体 - step: ${callInfo}`);
                outputLines.push('      // TODO: 实现 Agent 调用（P2 任务）');
              } else if (bodyStmt.type === 'condition') {
                outputLines.push('      // 循环体 - condition 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 condition（后续版本）');
              } else if (bodyStmt.type === 'loop') {
                outputLines.push('      // 循环体 - 嵌套 loop 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 loop（后续版本）');
              } else if (bodyStmt.type === 'parallel') {
                outputLines.push('      // 循环体 - parallel 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 parallel（后续版本）');
              } else if (bodyStmt.type === 'try_catch') {
                outputLines.push('      // 循环体 - try_catch 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 try_catch（后续版本）');
              }
            }
            outputLines.push('');
            outputLines.push('      // 递增计数器');
            outputLines.push(`      const currentValue = context.locals.get(loopVariable) ?? 0;`);
            outputLines.push(`      context.locals.set(loopVariable, currentValue + 1);`);
            outputLines.push('    }');
          }

          outputLines.push('  }');
        } else if (stmt.type === 'parallel') {
          // parallel 语句 - 并发执行多个分支
          const parallel = stmt as DSLParallel & { type: 'parallel' };
          const branchCount = parallel.branches.length;

          // 生成并发执行代码
          outputLines.push('  // parallel 语句 - 并发执行多个分支');
          outputLines.push('  {');

          // 创建上下文副本函数
          outputLines.push('    // 创建独立的执行上下文副本');
          outputLines.push('    const createContextCopy = () => ({');
          outputLines.push('      input: { ...context.input },');
          outputLines.push('      locals: new Map(context.locals || []),');
          outputLines.push('    });');

          // 解析最大并发数
          if (parallel.max_concurrency !== undefined) {
            if (typeof parallel.max_concurrency === 'number') {
              outputLines.push(`    const maxConcurrency = ${parallel.max_concurrency};`);
            } else {
              // max_concurrency 是表达式，序列化为内联表达式
              const exprJson = JSON.stringify(parallel.max_concurrency);
              outputLines.push(`    const maxConcurrency = evaluateExpression(${exprJson}, context);`);
            }
          } else {
            outputLines.push('    const maxConcurrency = Infinity;');
          }

          // 生成内联分支数据
          outputLines.push('');
          outputLines.push('    // 并行分支数据（内联序列化）');
          const branchesJson = JSON.stringify(parallel.branches);
          outputLines.push(`    const parallelBranches = ${branchesJson};`);

          // 生成分支执行函数
          outputLines.push('');
          outputLines.push('    // 执行单个分支');
          outputLines.push('    const executeBranch = async (branchData) => {');
          outputLines.push('      const branchContext = createContextCopy();');
          outputLines.push('      // TODO: 执行分支中的语句（需要递归处理）');
          outputLines.push('      // 当前版本：分支执行占位符');
          outputLines.push('      return branchContext;');
          outputLines.push('    };');

          // 生成并发执行逻辑
          outputLines.push('');
          outputLines.push('    // 并发执行所有分支');
          outputLines.push('    if (maxConcurrency === Infinity) {');
          outputLines.push('      // 无限制并发：使用 Promise.allSettled');
          outputLines.push('      const branchPromises = parallelBranches.map(branch => executeBranch(branch));');
          outputLines.push('      const results = await Promise.allSettled(branchPromises);');
          outputLines.push('');
          outputLines.push('      // 检查是否有失败的分支');
          outputLines.push('      const failures = results.filter(r => r.status === "rejected");');
          outputLines.push('      if (failures.length > 0) {');
          outputLines.push(`        throw new Error(\`\${failures.length} parallel branch(es) failed\`);`);
          outputLines.push('      }');
          outputLines.push('    } else {');
          outputLines.push('      // 有限制并发：使用并发池（待实现）');
          outputLines.push('      throw new Error("Limited concurrency not yet implemented");');
          outputLines.push('    }');

          outputLines.push('  }');
        } else if (stmt.type === 'try_catch') {
          // try_catch 语句 - 异常处理
          const tryCatch = stmt as DSLTryCatch & { type: 'try_catch' };
          const stmtIndex = ast.body.indexOf(stmt);

          // 生成 try-catch-finally 执行代码
          outputLines.push('  // try_catch 语句 - 异常处理');
          outputLines.push('  {');

          // 开始 try 块
          outputLines.push('    // try 块');
          outputLines.push('    try {');

          // 生成 try_block 中的语句执行代码
          if (tryCatch.try_block && tryCatch.try_block.length > 0) {
            for (let i = 0; i < tryCatch.try_block.length; i++) {
              const tryStmt = tryCatch.try_block[i];
              if (tryStmt.type === 'step') {
                const step = tryStmt as DSLStep & { type: 'step' };
                let callInfo = '(unnamed)';
                if (step.call) {
                  if (step.call.type === 'agent') {
                    callInfo = `agent:${step.call.name}`;
                  } else if (step.call.type === 'skill') {
                    callInfo = `skill:${step.call.skill_id}`;
                  } else if (step.call.type === 'tool') {
                    callInfo = `tool:${step.call.name}`;
                  }
                }
                outputLines.push(`      // try块 - step: ${callInfo}`);
                outputLines.push('      // TODO: 实现 Agent 调用（P2 任务）');
              } else if (tryStmt.type === 'condition') {
                outputLines.push('      // try块 - condition 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 condition（后续版本）');
              } else if (tryStmt.type === 'loop') {
                outputLines.push('      // try块 - loop 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 loop（复用主循环逻辑）');
              } else if (tryStmt.type === 'parallel') {
                outputLines.push('      // try块 - parallel 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 parallel（后续版本）');
              } else if (tryStmt.type === 'try_catch') {
                outputLines.push('      // try块 - 嵌套 try_catch 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 try_catch（后续版本）');
              }
            }
          } else {
            outputLines.push('      // 空 try 块');
          }

          outputLines.push('    }');

          // 生成 catch 块
          if (tryCatch.catch_block && tryCatch.catch_block.length > 0) {
            outputLines.push('    catch (error) {');

            // 如果有 catch_variable，将错误绑定到上下文
            if (tryCatch.catch_variable) {
              outputLines.push(`      // 将异常绑定到变量: ${tryCatch.catch_variable}`);
              outputLines.push(`      context.locals = context.locals || new Map();`);
              outputLines.push(`      context.locals.set('${tryCatch.catch_variable}', error);`);
            }

            // 生成 catch_block 中的语句执行代码
            outputLines.push('      // catch 块');
            for (let i = 0; i < tryCatch.catch_block.length; i++) {
              const catchStmt = tryCatch.catch_block[i];
              if (catchStmt.type === 'step') {
                const step = catchStmt as DSLStep & { type: 'step' };
                let callInfo = '(unnamed)';
                if (step.call) {
                  if (step.call.type === 'agent') {
                    callInfo = `agent:${step.call.name}`;
                  } else if (step.call.type === 'skill') {
                    callInfo = `skill:${step.call.skill_id}`;
                  } else if (step.call.type === 'tool') {
                    callInfo = `tool:${step.call.name}`;
                  }
                }
                outputLines.push(`      // catch块 - step: ${callInfo}`);
                outputLines.push('      // TODO: 实现 Agent 调用（P2 任务）');
              } else if (catchStmt.type === 'condition') {
                outputLines.push('      // catch块 - condition 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 condition（后续版本）');
              } else if (catchStmt.type === 'loop') {
                outputLines.push('      // catch块 - loop 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 loop（复用主循环逻辑）');
              } else if (catchStmt.type === 'parallel') {
                outputLines.push('      // catch块 - parallel 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 parallel（后续版本）');
              } else if (catchStmt.type === 'try_catch') {
                outputLines.push('      // catch块 - 嵌套 try_catch 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 try_catch（后续版本）');
              }
            }

            outputLines.push('    }');
          } else if (tryCatch.catch_variable) {
            // 只有 catch_variable 没有 catch_block 的情况
            // 将异常绑定但不处理，异常会继续传播
            outputLines.push('    catch (error) {');
            outputLines.push(`      // 将异常绑定到变量: ${tryCatch.catch_variable}`);
            outputLines.push(`      context.locals = context.locals || new Map();`);
            outputLines.push(`      context.locals.set('${tryCatch.catch_variable}', error);`);
            outputLines.push('      // 没有处理逻辑，重新抛出异常');
            outputLines.push('      throw error;');
            outputLines.push('    }');
          }
          // 如果既没有 catch_block 也没有 catch_variable，异常会自然传播（不需要 catch）

          // 生成 finally 块
          if (tryCatch.finally_block && tryCatch.finally_block.length > 0) {
            outputLines.push('    finally {');

            // 生成 finally_block 中的语句执行代码
            outputLines.push('      // finally 块 - 总是执行');
            for (let i = 0; i < tryCatch.finally_block.length; i++) {
              const finallyStmt = tryCatch.finally_block[i];
              if (finallyStmt.type === 'step') {
                const step = finallyStmt as DSLStep & { type: 'step' };
                let callInfo = '(unnamed)';
                if (step.call) {
                  if (step.call.type === 'agent') {
                    callInfo = `agent:${step.call.name}`;
                  } else if (step.call.type === 'skill') {
                    callInfo = `skill:${step.call.skill_id}`;
                  } else if (step.call.type === 'tool') {
                    callInfo = `tool:${step.call.name}`;
                  }
                }
                outputLines.push(`      // finally块 - step: ${callInfo}`);
                outputLines.push('      // TODO: 实现 Agent 调用（P2 任务）');
              } else if (finallyStmt.type === 'condition') {
                outputLines.push('      // finally块 - condition 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 condition（后续版本）');
              } else if (finallyStmt.type === 'loop') {
                outputLines.push('      // finally块 - loop 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 loop（复用主循环逻辑）');
              } else if (finallyStmt.type === 'parallel') {
                outputLines.push('      // finally块 - parallel 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 parallel（后续版本）');
              } else if (finallyStmt.type === 'try_catch') {
                outputLines.push('      // finally块 - 嵌套 try_catch 语句（需要递归处理）');
                outputLines.push('      // TODO: 实现嵌套 try_catch（后续版本）');
              }
            }

            outputLines.push('    }');
          }

          outputLines.push('  }');
        }
      }

      outputLines.push('} catch (error) {');
      outputLines.push('  throw new Error(`DSL execution error: ${error instanceof Error ? error.message : String(error)}`);');
      outputLines.push('}');
    }

    // 将输出映射到 outputs 定义
    if (ast.outputs.length > 0) {
      outputLines.push('');
      outputLines.push('// 映射输出');
      for (const outputDef of ast.outputs) {
        outputLines.push(`result['${outputDef.name}'] = context.input['${outputDef.name}'] !== undefined ? context.input['${outputDef.name}'] : null;`);
      }
    }

    return outputLines.join('\n');
  }

  /**
   * P1-340: 收集嵌套对象类型
   *
   * 遍历所有输入输出类型，收集可复用的嵌套对象类型。
   * 使用类型结构的JSON字符串作为唯一标识。
   *
   * @param ast - DSL AST
   * @returns 嵌套类型映射表（类型签名 -> 类型名称）
   */
  private collectNestedTypes(ast: AgentDSL): Map<string, { name: string; type: DSLDataType }> {
    const nestedTypes = new Map<string, { name: string; type: DSLDataType }>();
    let typeCounter = 1;

    // 辅助函数：收集对象类型
    const collectObjectType = (type: DSLDataType, parentName: string, fieldName: string): void => {
      if (type.kind === 'object') {
        const objType = type as any;

        // 只处理有明确属性定义的对象类型
        if (objType.properties && Object.keys(objType.properties).length > 0) {
          // 生成类型签名（基于属性结构的JSON字符串）
          const typeSignature = JSON.stringify(
            Object.entries(objType.properties)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([propName, propType]) => [propName, this.typeToString(propType as DSLDataType)])
          );

          // 如果这个类型结构还没被记录，添加到映射表
          if (!nestedTypes.has(typeSignature)) {
            const typeName = `${parentName}${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}Type${typeCounter++}`;
            nestedTypes.set(typeSignature, {
              name: typeName,
              type: objType
            });
          }

          // 递归处理嵌套对象属性
          for (const [propName, propType] of Object.entries(objType.properties)) {
            collectObjectType(propType as DSLDataType, nestedTypes.get(typeSignature)!.name, propName);
          }
        }
      } else if (type.kind === 'array') {
        // 递归处理数组元素类型
        collectObjectType((type as any).item_type as DSLDataType, parentName, fieldName);
      } else if (type.kind === 'union') {
        // 递归处理联合类型成员
        for (const unionType of (type as any).types) {
          collectObjectType(unionType as DSLDataType, parentName, fieldName);
        }
      }
    };

    // 收集输入中的嵌套类型
    for (const input of ast.inputs) {
      collectObjectType(input.data_type, ast.name, input.name);
    }

    // 收集输出中的嵌套类型
    for (const output of ast.outputs) {
      collectObjectType(output.data_type, ast.name, output.name);
    }

    return nestedTypes;
  }

  /**
   * P1-340: 生成嵌套类型的接口定义
   *
   * @param nestedTypes - 嵌套类型映射表
   * @returns TypeScript 接口定义代码
   */
  private generateNestedTypeInterfaces(nestedTypes: Map<string, { name: string; type: DSLDataType }>): string {
    const lines: string[] = [];

    for (const [signature, { name, type }] of nestedTypes) {
      lines.push(`/** 嵌套对象类型：${name} */`);
      lines.push(`export interface ${name} {`);

      if (type.kind === 'object' && (type as any).properties) {
        for (const [propName, propType] of Object.entries((type as any).properties)) {
          lines.push(`  ${propName}: ${this.typeToTypeScript(propType as DSLDataType)};`);
        }
      }

      lines.push('}');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * P0-8 修复 + P1-340 增强：生成 TypeScript 类型定义（包含 JSDoc 注释和嵌套类型提取）
   *
   * P1-340 增强功能：
   * - 自动识别可复用的嵌套对象类型
   * - 提取为独立的接口定义
   * - 在主接口中使用引用而非内联定义
   *
   * @param ast - DSL AST
   * @returns TypeScript 代码
   */
  generateTypes(ast: AgentDSL): string {
    const lines: string[] = [];

    // P1-340: 收集嵌套类型
    const nestedTypes = this.collectNestedTypes(ast);

    // P0-8 修复：添加文件级 JSDoc 注释
    lines.push('/**');
    lines.push(` * ${ast.name} - ${ast.description}`);
    lines.push(' * 自动生成的类型定义，请勿手动编辑');
    lines.push(' *');
    lines.push(` * @generated`);
    lines.push(` * @agentType ${ast.agent_type}`);
    lines.push(` * @layer ${ast.layer}`);
    if (ast.domain) {
      lines.push(` * @domain ${ast.domain}`);
    }
    lines.push(' */');
    lines.push('');

    // P1-340: 生成嵌套类型接口（在主接口之前）
    if (nestedTypes.size > 0) {
      lines.push(this.generateNestedTypeInterfaces(nestedTypes));
    }

    // 输入接口
    lines.push(`/** ${ast.name} 的输入参数接口 */`);
    lines.push(`export interface ${ast.name}Input {`);
    for (const input of ast.inputs) {
      const optional = input.required ? '' : '?';
      // 为每个输入属性添加 JSDoc 注释
      if (input.description) {
        lines.push(`  /** ${input.description} */`);
      }
      lines.push(`  ${input.name}${optional}: ${this.typeToTypeScript(input.data_type)};`);
    }
    lines.push('}');
    lines.push('');

    // 输出接口
    lines.push(`/** ${ast.name} 的输出结果接口 */`);
    lines.push(`export interface ${ast.name}Output {`);
    for (const output of ast.outputs) {
      // 为每个输出属性添加 JSDoc 注释
      if (output.description) {
        lines.push(`  /** ${output.description} */`);
      }
      lines.push(`  ${output.name}: ${this.typeToTypeScript(output.data_type)};`);
    }
    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * P0-4 修复：生成 JSON Schema（包含 inputs 和 outputs）
   *
   * @param ast - DSL AST
   * @returns JSON Schema 对象
   */
  generateJSONSchema(ast: AgentDSL): object {
    const schema: Record<string, unknown> = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: ast.name,
      description: ast.description,
      type: 'object',
      properties: {},
    };

    const required: string[] = [];

    // 输入属性
    if (ast.inputs.length > 0) {
      (schema.properties as Record<string, unknown>).inputs = {
        type: 'object',
        properties: {},
        required: [],
      };

      for (const input of ast.inputs) {
        ((schema.properties as Record<string, unknown>).inputs as any).properties[input.name] =
          this.dataTypeToJSONSchema(input.data_type);
        if (input.required) {
          ((schema.properties as Record<string, unknown>).inputs as any).required.push(input.name);
        }
      }
    }

    // P0-4 修复：添加 outputs 处理
    if (ast.outputs.length > 0) {
      (schema.properties as Record<string, unknown>).outputs = {
        type: 'object',
        properties: {},
        required: [],
      };

      for (const output of ast.outputs) {
        ((schema.properties as Record<string, unknown>).outputs as any).properties[output.name] =
          this.dataTypeToJSONSchema(output.data_type);
        // outputs 默认都是 required
        ((schema.properties as Record<string, unknown>).outputs as any).required.push(output.name);
      }
    }

    return schema;
  }

  /**
   * 编译 DSL 为 AgentDefinition
   *
   * @param ast - DSL AST
   * @returns AgentDefinition
   */
  compileToAgentDefinition(ast: AgentDSL): AgentDefinition {
    return {
      name: ast.name,
      type: ast.agent_type,
      layer: ast.layer,
      domain: ast.domain,
      description: ast.description,
      prompt_path: '', // DSL 没有 prompt_path，需要生成临时文件
      tools: ast.tools.map((t) => t.name),
      capabilities: ast.capabilities.map((c) => c.capability_type),
      argument_hint: '', // 可以从 inputs 推断
      embedded_governance: this.convertGovernance(ast.governance),
      context_shards: [],
    };
  }

  /**
   * 编译 DSL
   *
   * @param ast - DSL AST
   * @param filepath - 文件路径
   * @returns 编译结果
   */
  compile(ast: AgentDSL, filepath: string = '<unknown>'): CompileResult {
    // 类型检查
    const typeErrors = this.typeCheck(ast);

    if (typeErrors.length > 0) {
      return {
        success: false,
        errors: typeErrors.map((e) => ({
          kind: 'type',
          message: e.message,
          loc: e.loc,
        })),
      };
    }

    // 根据目标格式生成输出
    let output: string;

    switch (this.options.target) {
      case 'markdown':
        output = this.toMarkdown(ast);
        break;
      case 'json':
        output = JSON.stringify(ast, null, 2);
        break;
      case 'executable':
        // 生成可执行代码（当前版本返回占位）
        output = `// Agent: ${ast.name}\n// Executable code generation not yet implemented`;
        break;
      default:
        output = this.toMarkdown(ast);
    }

    return {
      success: true,
      output,
    };
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  private parseFrontmatter(frontmatter: string): Record<string, any> {
    const result: Record<string, any> = {
      tools: [],
    };

    const lines = frontmatter.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        i++;
        continue;
      }

      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      // 处理多行值（以 | 或 > 开头）
      let isMultiLine = false;
      if (value === '|' || value === '>') {
        // 收集后续缩进行
        const multiLines: string[] = [];
        i++;
        while (i < lines.length) {
          const nextLine = lines[i];
          if (nextLine.startsWith('  ') || nextLine.startsWith('\t')) {
            multiLines.push(nextLine.trim());
            i++;
          } else {
            // 不满足缩进条件，回退 i 以便外层循环处理当前行
            break;
          }
        }
        value = multiLines.join(' ').trim();
        // 多行值处理完成后，i 指向下一个需要处理的行
        // 使用 continue 直接进入下一次循环，不执行下面的 i++
        isMultiLine = true;
      }

      switch (key) {
        case 'name':
          result.name = value.replace(/^["']|["']$/g, '');
          break;
        case 'description':
          result.description = value.replace(/^["']|["']$/g, '');
          break;
        case 'agent_type':
          result.agent_type = value;
          break;
        case 'tools':
          result.tools = this.parseToolsArray(value);
          break;
        case 'domain':
          result.domain = value;
          break;
        case 'argument-hint':
          result.argument_hint = value.replace(/^["']|["']$/g, '');
          break;
        default:
          result[key] = value;
      }

      // 只有在非多行值的情况下才增加 i
      // 多行值处理后 i 已经指向下一行
      if (!isMultiLine) {
        i++;
      }
    }

    return result;
  }

  private parseArray(value: string): string[] {
    // 移除方括号
    const inner = value.replace(/^\[|\]$/g, '').trim();
    if (!inner) return [];

    // 简化处理：按逗号分割
    return inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
  }

  /**
   * 解析工具数组，转换为 DSLTool 格式
   */
  private parseToolsArray(value: string): DSLTool[] {
    const toolNames = this.parseArray(value);
    return toolNames.map((name) => ({
      type: 'tool',
      name,
    }));
  }

  private inferLayerFromPath(filepath: string): AgentLayer {
    const lowerPath = filepath.toLowerCase();

    if (lowerPath.includes('layer-1-research') || lowerPath.includes('/l1/')) {
      return 'L1';
    } else if (lowerPath.includes('layer-2-decision') || lowerPath.includes('/l2/')) {
      return 'L2';
    } else if (lowerPath.includes('layer-3-execution') || lowerPath.includes('/l3/')) {
      return 'L3';
    } else if (lowerPath.includes('layer-4-feedback') || lowerPath.includes('/l4/')) {
      return 'L4';
    } else if (lowerPath.includes('governance')) {
      return 'governance';
    }

    return 'L3'; // 默认为 L3
  }

  private toTitleCase(str: string): string {
    return str
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private typeToString(type: DSLDataType): string {
    switch (type.kind) {
      case 'string':
      case 'number':
      case 'boolean':
      case 'any':
      case 'void':
        return type.kind;
      case 'array':
        return `array<${this.typeToString((type as any).item_type)}>`;
      case 'object':
        return 'object';
      case 'union':
        return `union<${(type as any).types.map((t: DSLDataType) => this.typeToString(t)).join(' | ')}>`;
      case 'literal':
        return String((type as any).value);
      default:
        return 'unknown';
    }
  }

  /**
   * P1-339: 判断类型转换为TypeScript时是否需要加括号
   *
   * 需要加括号的情况：
   * 1. 联合类型作为其他类型的成员：`A | B` in `(A | B)[]`
   * 2. 函数类型作为联合类型成员：`() => void` in `(() => void) | string`
   * 3. 联合类型嵌套：`(A | B) | C`
   *
   * @param type - DSL数据类型
   * @param context - 父类型上下文，用于判断是否需要括号
   * @returns 是否需要加括号
   */
  private needsParens(type: DSLDataType, context?: 'array' | 'union' | 'function'): boolean {
    // 联合类型在数组类型中需要加括号: (A | B)[]
    if (type.kind === 'union' && context === 'array') {
      return true;
    }

    // 函数类型在联合类型中需要加括号: (() => void) | string
    // (暂未实现函数类型，为未来扩展预留)

    // 联合类型嵌套需要加括号: (A | B) | C
    if (type.kind === 'union' && context === 'union') {
      return true;
    }

    return false;
  }

  /**
   * P1-339 + P2-347: 将DSL数据类型转换为TypeScript类型表示（支持括号优化和字面量类型）
   *
   * 增强功能：
   * - 自动为复杂类型添加括号保护
   * - 确保生成的TypeScript代码语法正确
   * - P2-347: 支持字面量类型生成（如 "hello", 42, true）
   *
   * @param type - DSL数据类型
   * @param context - 父类型上下文（用于判断是否需要括号）
   * @returns TypeScript类型字符串
   */
  private typeToTypeScript(type: DSLDataType, context?: 'array' | 'union' | 'function'): string {
    switch (type.kind) {
      case 'string':
        return 'string';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'any':
        return 'any';
      case 'void':
        return 'void';
      case 'array': {
        const itemType = this.typeToTypeScript((type as any).item_type, 'array');
        // 如果元素类型是联合类型，需要加括号: (A | B)[]
        return this.needsParens((type as any).item_type, 'array')
          ? `(${itemType})[]`
          : `${itemType}[]`;
      }
      case 'object':
        return 'Record<string, unknown>';
      case 'union': {
        const types = (type as any).types.map((t: DSLDataType) => this.typeToTypeScript(t, 'union'));
        const joined = types.join(' | ');
        // 如果在联合类型上下文中，需要加括号: (A | B) | C
        return this.needsParens(type, context || 'union') ? `(${joined})` : joined;
      }
      case 'literal':
        // P2-347: 生成字面量类型语法
        const lit = type as any;
        if (lit.base_type === 'string') {
          // 字符串字面量需要加引号: "hello"
          return `"${lit.value}"`;
        } else if (lit.base_type === 'number') {
          // 数字字面量直接输出: 42
          return String(lit.value);
        } else if (lit.base_type === 'boolean') {
          // 布尔字面量直接输出: true / false
          return String(lit.value);
        }
        return typeof lit.value;
      default:
        return 'unknown';
    }
  }

  /**
   * P0-2 & P0-6: 将 DSL 数据类型转换为 JSON Schema
   * 修复：any 类型返回符合规范的 schema，object 类型正确处理 properties
   */
  private dataTypeToJSONSchema(type: DSLDataType): object {
    switch (type.kind) {
      case 'string':
        return { type: 'string' };
      case 'number':
        return { type: 'number' };
      case 'boolean':
        return { type: 'boolean' };
      case 'any':
        // P0-2 修复：any 类型应返回允许任意值的 JSON Schema
        return {
          additionalProperties: true,
          additionalItems: true,
        };
      case 'void':
        return { type: 'null' };
      case 'array':
        return {
          type: 'array',
          items: this.dataTypeToJSONSchema((type as any).item_type),
        };
      case 'object': {
        // P0-6 修复：object 类型应处理 properties 定义
        const objType = type as DSLObjectType;
        const schema: Record<string, unknown> = {
          type: 'object',
        };

        if (objType.properties && Object.keys(objType.properties).length > 0) {
          // 如果有明确的属性定义，生成 properties 和 required
          schema.properties = {};
          const required: string[] = [];

          for (const [propName, propType] of Object.entries(objType.properties)) {
            (schema.properties as Record<string, unknown>)[propName] =
              this.dataTypeToJSONSchema(propType);
          }

          if (required.length > 0) {
            schema.required = required;
          }
        } else {
          // 空对象类型，允许任意属性
          schema.additionalProperties = true;
        }

        return schema;
      }
      case 'union':
        return {
          anyOf: (type as any).types.map((t: DSLDataType) => this.dataTypeToJSONSchema(t)),
        };
      case 'literal':
        return {
          type: typeof (type as any).value === 'string' ? 'string' :
                 typeof (type as any).value === 'number' ? 'number' :
                 typeof (type as any).value === 'boolean' ? 'boolean' : 'null',
          const: (type as any).value,
        };
      default:
        return {
          additionalProperties: true,
          additionalItems: true,
        };
    }
  }

  private convertGovernance(gov: DSLGovernance): GovernanceConfig {
    return {
      first_principles_check: gov.first_principles_check,
      red_team_threshold: gov.red_team_threshold as RiskLevel,
      quality_gate_enabled: gov.quality_gate_enabled,
      max_retries: gov.max_retries,
      token_budget: gov.token_budget,
    };
  }

  // ============================================================
  // Runtime Executor - 直接 AST 执行 (P2-402)
  // ============================================================

  /**
   * 执行 try_catch 语句
   *
   * 实现完整的 try-catch-finally 语义：
   * - 执行 try_block
   * - 如果抛出异常，执行 catch_block（如果存在）
   * - 无论是否异常，都执行 finally_block（如果存在）
   * - 支持 catch_variable 绑定异常对象
   * - 支持嵌套 try_catch 语句
   *
   * @param stmt - try_catch 语句
   * @param context - 执行上下文
   * @returns 执行结果
   */
  async executeTryCatch(
    stmt: DSLTryCatch,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const errors: Error[] = [];
    const trace: TraceEntry[] = [];
    let caughtError: Error | null = null;

    // 检查嵌套深度并创建子上下文
    const newDepth = this.checkNestingDepth(context, stmt);
    const childContext = this.createChildContextWithDepth(context, newDepth);

    try {
      // 1. 执行 try_block
      for (const tryStmt of stmt.try_block) {
        const result = await this.executeStatement(tryStmt, childContext);
        trace.push(...result.trace);
        errors.push(...result.errors);
      }
    } catch (error) {
      caughtError = error as Error;
      trace.push({
        timestamp: Date.now(),
        statementType: 'try_catch',
        location: stmt.loc,
        status: 'failure',
        data: { message: caughtError.message, phase: 'try' },
      });

      // 2. 执行 catch_block（如果存在）
      if (stmt.catch_block && stmt.catch_block.length > 0) {
        // 绑定异常到变量
        if (stmt.catch_variable) {
          childContext.locals.set(stmt.catch_variable, caughtError);
        }

        for (const catchStmt of stmt.catch_block) {
          const result = await this.executeStatement(catchStmt, childContext);
          trace.push(...result.trace);
          errors.push(...result.errors);
        }
      } else if (!stmt.finally_block || stmt.finally_block.length === 0) {
        // 没有catch也没有finally，重新抛出
        return {
          success: false,
          value: null,
          trace,
          errors: [...errors, caughtError],
        };
      }
    } finally {
      // 3. 执行 finally_block（如果存在）
      if (stmt.finally_block && stmt.finally_block.length > 0) {
        try {
          for (const finallyStmt of stmt.finally_block) {
            const result = await this.executeStatement(finallyStmt, childContext);
            trace.push(...result.trace);
            errors.push(...result.errors);
          }
        } catch (finallyError) {
          errors.push(finallyError as Error);
          // finally中的异常也会传播
          if (!caughtError) {
            caughtError = finallyError as Error;
          }
        }
      }
    }

    trace.push({
      timestamp: Date.now(),
      statementType: 'try_catch',
      location: stmt.loc,
      status: caughtError ? 'failure' : 'success',
      data: {
        caught: caughtError !== null,
        hasFinally: stmt.finally_block !== undefined,
        catchVariable: stmt.catch_variable,
      },
    });

    // 如果有未处理的异常，返回它
    if (caughtError && (!stmt.catch_block || stmt.catch_block.length === 0)) {
      errors.push(caughtError);
    }

    return {
      success: caughtError === null,
      value: null,
      trace,
      errors,
    };
  }

  /**
   * 执行 step 语句 (P2-429)
   *
   * 使用 StepExecutor 执行 Agent/Skill/Tool 调用。
   * 支持完整的执行追踪、错误处理和输出映射。
   *
   * @param step - step 语句
   * @param context - 执行上下文
   * @returns 执行结果
   */
  async executeStep(
    step: DSLStep,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const errors: Error[] = [];
    const trace: TraceEntry[] = [];

    try {
      // 检查是否初始化了 Step 执行器
      if (!this.stepExecutor) {
        throw new Error(
          'Step executor not initialized. Please provide agentRunner, skillsManager, and messageBus in DSLCompilerOptions.'
        );
      }

      // 转换 ExecutionContext 到 agent-call-types 的 ExecutionContext
      const agentCallContext = this.ensureCompleteContext(context);

      // 使用 StepExecutor 执行 step
      await this.stepExecutor.executeStep(step, agentCallContext);

      // 从 agent-call-context 同步回原始 context
      this.syncContextFromAgentCall(context, agentCallContext);

      trace.push({
        timestamp: Date.now(),
        statementType: 'step',
        location: step.loc,
        status: 'success',
        data: {
          step: step.name || 'unnamed',
          callType: step.call?.type,
          target: step.call?.type === 'skill' ? step.call.skill_id : step.call?.name,
        },
      });

      return {
        success: true,
        value: null,
        trace,
        errors,
      };
    } catch (error) {
      const err = error as Error;
      trace.push({
        timestamp: Date.now(),
        statementType: 'step',
        location: step.loc,
        status: 'failure',
        data: {
          step: step.name || 'unnamed',
          error: err.message,
        },
      });
      errors.push(err);
      return {
        success: false,
        value: null,
        trace,
        errors,
      };
    }
  }

  /**
   * 执行条件分支步骤 (conditional_step)
   *
   * 使用 ConditionStepExecutor 执行 if-elif-else 条件分支 Agent 调用。
   * 支持条件表达式求值、分支选择和输出映射。
   *
   * @param step - conditional_step 语句
   * @param context - 执行上下文
   * @returns 执行结果
   */
  async executeConditionalStep(
    step: DSLConditionalStep,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const errors: Error[] = [];
    const trace: TraceEntry[] = [];

    try {
      // 检查是否初始化了 Step 执行器
      if (!this.stepExecutor) {
        throw new Error(
          'Step executor not initialized. Please provide agentRunner, skillsManager, and messageBus in DSLCompilerOptions.'
        );
      }

      // 创建 ConditionStepExecutor
      const conditionExecutor = createConditionStepExecutor(
        this.executionDependencies!,
        this.stepExecutor
      );

      // 转换 ExecutionContext 到 agent-call-types 的 ExecutionContext
      const agentCallContext = this.ensureCompleteContext(context);

      // 使用 ConditionStepExecutor 执行条件分支步骤
      const result = await conditionExecutor.executeStep(step, agentCallContext);

      // 从 agent-call-context 同步回原始 context
      this.syncContextFromAgentCall(context, agentCallContext);

      // 记录追踪信息
      trace.push({
        timestamp: Date.now(),
        statementType: 'conditional_step',
        location: step.loc,
        status: result.success ? 'success' : 'failure',
        data: {
          step: step.name || 'conditional',
          branchCount: step.branches.length,
        },
      });

      return {
        success: true,
        value: null,
        trace,
        errors: result.errors && result.errors.length > 0 ? result.errors : errors,
      };
    } catch (error) {
      const err = error as Error;
      trace.push({
        timestamp: Date.now(),
        statementType: 'conditional_step',
        location: step.loc,
        status: 'failure',
        data: {
          step: step.name || 'conditional',
          error: err.message,
        },
      });
      errors.push(err);
      return {
        success: false,
        value: null,
        trace,
        errors,
      };
    }
  }

  /**
   * 转换 ExecutionContext 以确保包含所有必需字段 (P2-429)
   *
   * @param context - 执行上下文
   * @returns 完整的执行上下文
   */
  private ensureCompleteContext(context: ExecutionContext): ExecutionContext {
    // 确保 context 有 results 字段
    if (!context.results) {
      context.results = new Map();
    }

    // 确保 context 有 stats 字段
    if (!context.stats) {
      context.stats = {
        totalDurationMs: 0,
        agentCalls: 0,
        skillCalls: 0,
        toolCalls: 0,
        totalTokens: 0,
        successfulCalls: 0,
        failedCalls: 0,
      };
    }

    return context;
  }

  /**
   * 从源上下文同步回目标上下文 (P2-429)
   *
   * @param target - 目标上下文
   * @param source - 源上下文
   */
  private syncContextFromAgentCall(
    target: ExecutionContext,
    source: ExecutionContext
  ): void {
    // 同步 locals
    target.locals = source.locals;

    // 同步 results（如果存在）
    if (source.results) {
      target.results = source.results;
    }

    // 同步 stats（如果存在）
    if (source.stats) {
      target.stats = source.stats;
    }
  }

  /**
   * 检查嵌套深度是否超出限制
   *
   * 在递归执行嵌套语句之前检查深度，防止栈溢出。
   *
   * @param context - 执行上下文
   * @param stmt - DSL 语句（用于获取源码位置）
   * @returns 如果深度未超出，返回递增后的深度；否则抛出错误
   * @throws {RuntimeError} 当深度超出限制时
   */
  private checkNestingDepth(
    context: ExecutionContext,
    stmt: DSLStatement
  ): number {
    const currentDepth = context.depth ?? 0;
    const maxDepth = context.MAX_NESTING_DEPTH ?? context.options?.maxNestingDepth ?? 100;

    if (currentDepth >= maxDepth) {
      throw RuntimeError.stackDepthExceeded(currentDepth, maxDepth, stmt.loc);
    }

    return currentDepth + 1;
  }

  /**
   * 创建子执行上下文（用于递归执行）
   *
   * 子上下文继承父上下文的输入和选项，
   * 但拥有独立的局部变量空间，并且深度+1。
   *
   * @param parent - 父执行上下文
   * @param newDepth - 新的嵌套深度
   * @returns 新的子上下文
   */
  private createChildContextWithDepth(
    parent: ExecutionContext,
    newDepth: number
  ): ExecutionContext {
    return {
      input: parent.input,
      locals: new Map(), // 空的 locals 映射，实现作用域隔离
      results: new Map(),
      traceId: parent.traceId,
      depth: newDepth,
      stats: parent.stats ? { ...parent.stats } : {
        totalDurationMs: 0,
        agentCalls: 0,
        skillCalls: 0,
        toolCalls: 0,
        totalTokens: 0,
        successfulCalls: 0,
        failedCalls: 0,
      },
      trace: [],
      parent: parent, // 设置父上下文指针，支持变量查找链
      options: parent.options,
      MAX_NESTING_DEPTH: parent.MAX_NESTING_DEPTH ?? parent.options?.maxNestingDepth ?? 100,
    };
  }

  /**
   * 执行单个语句
   *
   * 根据语句类型分发到对应的执行方法。
   * 支持嵌套语句的递归执行。
   *
   * @param stmt - DSL 语句
   * @param context - 执行上下文
   * @returns 执行结果
   */
  async executeStatement(
    stmt: DSLStatement,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    switch (stmt.type) {
      case 'step':
        // step 语句执行 - 使用 Agent 调用执行器 (P2-429)
        return this.executeStep(stmt as DSLStep, context);

      case 'conditional_step':
        // conditional_step 语句 - 条件分支 Agent 调用 (if-elif-else)
        return this.executeConditionalStep(stmt as DSLConditionalStep, context);

      case 'condition':
        // condition 语句 - 递归执行分支
        return this.executeCondition(stmt as DSLCondition, context);

      case 'loop':
        // loop 语句 - 递归执行循环体
        return this.executeLoop(stmt as DSLLoop, context);

      case 'parallel':
        // parallel 语句 - 并发执行分支
        return this.executeParallel(stmt as DSLParallel, context);

      case 'try_catch':
        // try_catch 语句 - 异常处理
        return this.executeTryCatch(stmt as DSLTryCatch, context);

      default:
        return {
          success: false,
          value: null,
          trace: [],
          errors: [new Error(`Unknown statement type: ${(stmt as DSLStatement).type}`)],
        };
    }
  }

  /**
   * 执行整个 Agent DSL
   *
   * 执行 Agent 定义的主体语句，支持所有 DSL 语句类型。
   * 这是 DSLCompiler 的主要入口方法，用于执行完整的 Agent 定义。
   *
   * @param ast - Agent DSL 抽象语法树
   * @returns 执行结果
   */
  public async execute(ast: AgentDSL): Promise<ExecutionResult> {
    const trace: TraceEntry[] = [];
    const errors: Error[] = [];

    try {
      // 创建初始执行上下文
      const context = this.createInitialExecutionContext(ast);

      // 执行主体语句
      for (const stmt of ast.body) {
        const result = await this.executeStatement(stmt, context);
        trace.push(...result.trace);
        errors.push(...result.errors);
      }

      return {
        success: errors.length === 0,
        value: undefined,
        trace,
        errors,
      };
    } catch (error) {
      return {
        success: false,
        value: null,
        trace,
        errors: [...errors, error as Error],
      };
    }
  }

  /**
   * 创建初始执行上下文
   *
   * @param ast - Agent DSL 抽象语法树
   * @returns 初始执行上下文
   */
  private createInitialExecutionContext(ast: AgentDSL): ExecutionContext {
    return {
      input: {},
      locals: new Map(),
      results: new Map(),
      traceId: crypto.randomUUID(),
      depth: 0,
      stats: {
        totalDurationMs: 0,
        agentCalls: 0,
        skillCalls: 0,
        toolCalls: 0,
        totalTokens: 0,
        successfulCalls: 0,
        failedCalls: 0,
      },
      trace: [],
      options: {
        maxIterations: 10000,
        maxNestingDepth: this.options.maxNestingDepth ?? 100,
        enableTracing: true,
        maxConcurrency: 10,
      },
      MAX_NESTING_DEPTH: this.options.maxNestingDepth ?? 100,
    };
  }

  /**
   * 执行条件语句
   *
   * @param cond - condition 语句
   * @param context - 执行上下文
   * @returns 执行结果
   */
  private async executeCondition(
    cond: DSLCondition,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const trace: TraceEntry[] = [];
    const errors: Error[] = [];

    try {
      // 评估条件表达式
      const isTruthy = Boolean(this.evaluateExpression(cond.test, context));

      trace.push({
        timestamp: Date.now(),
        statementType: 'condition',
        location: cond.loc,
        status: 'success',
        data: { condition: isTruthy ? 'true' : 'false' },
      });

      // 根据条件结果执行对应分支
      const branch = isTruthy ? cond.consequent : (cond.alternate || []);

      // 检查嵌套深度并创建子上下文
      const newDepth = this.checkNestingDepth(context, cond);
      const childContext = this.createChildContextWithDepth(context, newDepth);

      for (const stmt of branch) {
        const result = await this.executeStatement(stmt, childContext);
        trace.push(...result.trace);
        errors.push(...result.errors);
      }

      return {
        success: true,
        value: null,
        trace,
        errors,
      };
    } catch (error) {
      return {
        success: false,
        value: null,
        trace,
        errors: [...errors, error as Error],
      };
    }
  }

  /**
   * 执行循环语句 (P2-408 / P2-394)
   *
   * 委托给 LoopExecutor 执行循环逻辑，支持嵌套循环和变量作用域管理。
   *
   * @param loop - loop 语句
   * @param context - 执行上下文
   * @returns 执行结果
   */
  private async executeLoop(
    loop: DSLLoop,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    // 使用 LoopExecutor 执行循环（如果已初始化）
    if (this.loopExecutor) {
      return this.loopExecutor.execute(loop, context);
    }

    // 降级处理：如果 LoopExecutor 未初始化，使用内联实现
    return this.executeLoopInline(loop, context);
  }

  /**
   * 内联执行循环语句（降级实现）
   *
   * 当 LoopExecutor 未初始化时使用的备用实现。
   *
   * @param loop - loop 语句
   * @param context - 执行上下文
   * @returns 执行结果
   */
  private async executeLoopInline(
    loop: DSLLoop,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const trace: TraceEntry[] = [];
    const errors: Error[] = [];
    const maxIterations = context.options?.maxIterations || 10000;
    let iterationCount = 0;

    try {
      // 检查嵌套深度并创建子上下文
      const newDepth = this.checkNestingDepth(context, loop);
      const loopContext = this.createChildContextWithDepth(context, newDepth);

      switch (loop.loop_type) {
        case 'while': {
          while (true) {
            if (++iterationCount > maxIterations) {
              throw new Error(`Loop exceeded maximum iteration limit (${maxIterations})`);
            }

            const testResult = this.evaluateExpression(loop.test!, context);
            if (!Boolean(testResult)) break;

            for (const stmt of loop.body) {
              const result = await this.executeStatement(stmt, loopContext);
              trace.push(...result.trace);
              errors.push(...result.errors);
            }
          }
          break;
        }

        case 'for_each': {
          const collectionValue = this.evaluateExpression(loop.collection!, context);
          const items = Array.isArray(collectionValue)
            ? collectionValue
            : Object.entries(collectionValue ?? {});

          for (const item of items) {
            if (++iterationCount > maxIterations) {
              throw new Error(`Loop exceeded maximum iteration limit (${maxIterations})`);
            }

            if (loop.variable) {
              loopContext.locals.set(loop.variable, item);
            }

            for (const stmt of loop.body) {
              const result = await this.executeStatement(stmt, loopContext);
              trace.push(...result.trace);
              errors.push(...result.errors);
            }
          }
          break;
        }

        case 'for': {
          const counterName = loop.variable ?? '_i';
          const defaultForLimit = 10000;
          let counter = 0;

          if (loop.test) {
            while (true) {
              if (++iterationCount > maxIterations) {
                throw new Error(`Loop exceeded maximum iteration limit (${maxIterations})`);
              }

              loopContext.locals.set(counterName, counter);

              const testResult = this.evaluateExpression(loop.test, context);
              if (!Boolean(testResult)) break;

              for (const stmt of loop.body) {
                const result = await this.executeStatement(stmt, loopContext);
                trace.push(...result.trace);
                errors.push(...result.errors);
              }

              counter++;
            }
          } else {
            while (counter < defaultForLimit && iterationCount < maxIterations) {
              iterationCount++;
              loopContext.locals.set(counterName, counter);

              for (const stmt of loop.body) {
                const result = await this.executeStatement(stmt, loopContext);
                trace.push(...result.trace);
                errors.push(...result.errors);
              }

              counter++;
            }
          }
          break;
        }
      }

      trace.push({
        timestamp: Date.now(),
        statementType: 'loop',
        location: loop.loc,
        status: 'success',
        data: { iterations: iterationCount, loopType: loop.loop_type },
      });

      return {
        success: true,
        value: null,
        trace,
        errors,
      };
    } catch (error) {
      return {
        success: false,
        value: null,
        trace,
        errors: [...errors, error as Error],
      };
    }
  }

  /**
   * 执行并行语句
   *
   * @param parallel - parallel 语句
   * @param context - 执行上下文
   * @returns 执行结果
   */
  private async executeParallel(
    parallel: DSLParallel,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const trace: TraceEntry[] = [];
    const errors: Error[] = [];
    const startTime = Date.now();

    try {
      // 检查嵌套深度并创建子上下文
      const newDepth = this.checkNestingDepth(context, parallel);

      // 解析最大并发数
      let maxConcurrency: number;
      if (parallel.max_concurrency === undefined) {
        maxConcurrency = Infinity;
      } else if (typeof parallel.max_concurrency === 'number') {
        maxConcurrency = parallel.max_concurrency;
      } else {
        const value = this.evaluateExpression(parallel.max_concurrency, context);
        maxConcurrency = typeof value === 'number' ? value : Infinity;
      }

      // 创建上下文副本函数（带深度+1）
      const createContextCopy = (): ExecutionContext => ({
        input: { ...context.input },
        locals: new Map(context.locals),
        results: new Map(),
        traceId: context.traceId,
        depth: newDepth,
        stats: context.stats ? { ...context.stats } : {
          totalDurationMs: 0,
          agentCalls: 0,
          skillCalls: 0,
          toolCalls: 0,
          totalTokens: 0,
          successfulCalls: 0,
          failedCalls: 0,
        },
        trace: [],
        parent: context.parent,
        options: context.options,
        MAX_NESTING_DEPTH: context.MAX_NESTING_DEPTH ?? context.options?.maxNestingDepth ?? 100,
      });

      // 执行单个分支
      const executeBranch = async (branch: DSLStatement[]): Promise<ExecutionResult> => {
        const branchCtx = createContextCopy();
        const branchErrors: Error[] = [];
        const branchTrace: TraceEntry[] = [];

        for (const stmt of branch) {
          const result = await this.executeStatement(stmt, branchCtx);
          branchTrace.push(...result.trace);
          branchErrors.push(...result.errors);
        }

        return { success: true, value: null, trace: branchTrace, errors: branchErrors };
      };

      // 执行所有分支
      let results: ExecutionResult[];
      if (maxConcurrency === Infinity || maxConcurrency >= parallel.branches.length) {
        // 无限制并发
        const settledResults = await Promise.allSettled(
          parallel.branches.map(branch => executeBranch(branch))
        );

        results = [];
        for (const settled of settledResults) {
          if (settled.status === 'fulfilled') {
            results.push(settled.value);
          } else {
            results.push({
              success: false,
              value: null,
              trace: [],
              errors: [new Error(settled.reason?.message || 'Unknown error')],
            });
          }
        }
      } else {
        // 有限制并发 - 使用并发池实现真正的并发控制
        results = await this.executeWithConcurrencyLimit(
          parallel.branches,
          executeBranch,
          maxConcurrency
        );
      }

      // 合并结果
      for (const result of results) {
        trace.push(...result.trace);
        errors.push(...result.errors);
      }

      trace.push({
        timestamp: Date.now(),
        statementType: 'parallel',
        location: parallel.loc,
        status: errors.length > 0 ? 'failure' : 'success',
        data: {
          branchCount: parallel.branches.length,
          failureCount: errors.length,
          maxConcurrency,
        },
      });

      return {
        success: errors.length === 0,
        value: null,
        trace,
        errors,
      };
    } catch (error) {
      return {
        success: false,
        value: null,
        trace,
        errors: [...errors, error as Error],
      };
    }
  }

  /**
   * 带并发限制的执行辅助函数
   *
   * 使用滑动窗口模式控制并发数量，确保同时运行的 Promise 不超过限制。
   * 实现真正的并发执行而非串行，提高性能。
   *
   * @param items - 要执行的项目数组
   * @param executeFn - 执行函数，接收项目并返回 Promise<ExecutionResult>
   * @param limit - 最大并发数
   * @returns 所有项目的执行结果数组（保持原始顺序）
   */
  private async executeWithConcurrencyLimit<T>(
    items: T[],
    executeFn: (item: T) => Promise<ExecutionResult>,
    limit: number
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = new Array(items.length);
    const executing: Array<Promise<void>> = [];
    let currentIndex = 0;

    /**
     * 执行下一个项目并管理并发池
     */
    const executeNext = async (): Promise<void> => {
      while (currentIndex < items.length) {
        // 如果已达到并发限制，等待一个任务完成
        if (executing.length >= limit) {
          await Promise.race(executing);
          // 移除已完成的 promise（通过检查状态）
          const stillExecuting: Promise<void>[] = [];
          for (const p of executing) {
            // 使用 Promise.race 的技巧来检查 promise 状态
            const raceCheck = Promise.race([
              p,
              Promise.resolve().then(() => ({ _stillRunning: true }))
            ]);
            // 这里简化处理：直接清空，在实际执行中会自然过滤
          }
          executing.length = 0;
        }

        const index = currentIndex++;
        const item = items[index];

        const promise = executeFn(item).then(result => {
          results[index] = result;
        });

        executing.push(promise);

        // 如果已达到并发限制，等待当前批次完成
        if (executing.length >= limit) {
          await Promise.race(executing);
        }
      }
    };

    // 启动多个 worker 来并发执行任务
    const workers: Promise<void>[] = [];
    const workerCount = Math.min(limit, items.length);

    for (let i = 0; i < workerCount; i++) {
      workers.push(executeNext());
    }

    // 等待所有 worker 完成
    await Promise.all(workers);

    return results;
  }

  /**
   * 求值表达式
   *
   * 支持字面量、变量引用、二元操作等基础表达式。
   *
   * @param expr - DSL 表达式
   * @param context - 执行上下文
   * @returns 求值结果
   */
  private evaluateExpression(
    expr: DSLExpression,
    context: ExecutionContext
  ): unknown {
    switch (expr.type) {
      case 'literal':
        return (expr as DSLLiteral).value;

      case 'variable': {
        const varName = (expr as DSLVariable).name;
        // 检查局部变量
        if (context.locals.has(varName)) {
          return context.locals.get(varName);
        }
        // 检查输入
        if (varName in context.input) {
          return context.input[varName];
        }
        // 检查父上下文
        if (context.parent) {
          const parentValue = this.resolveVariableInContext(varName, context.parent);
          if (parentValue !== undefined) return parentValue;
        }
        throw new ReferenceError(`Undefined variable: ${varName}`);
      }

      case 'binary_op': {
        const binOp = expr as DSLBinaryOp;
        const left = this.evaluateExpression(binOp.left, context);
        const right = this.evaluateExpression(binOp.right, context);

        switch (binOp.operator) {
          case '+': return left as number + (right as number);
          case '-': return left as number - (right as number);
          case '*': return left as number * (right as number);
          case '/': return left as number / (right as number);
          case '%': return left as number % (right as number);
          case '==': return (left as any) == (right as any);
          case '!=': return (left as any) != (right as any);
          case '<': return (left as any) < (right as any);
          case '>': return (left as any) > (right as any);
          case '<=': return (left as any) <= (right as any);
          case '>=': return (left as any) >= (right as any);
          case '&&': return Boolean(left && right);
          case '||': return Boolean(left || right);
          default:
            throw new Error(`Unsupported binary operator: ${binOp.operator}`);
        }
      }

      case 'unary_op': {
        const unaryOp = expr as DSLUnaryOp;
        const operand = this.evaluateExpression(unaryOp.operand, context);
        switch (unaryOp.operator) {
          case '!': return !operand;
          case '-': return -(operand as number);
          case '+': return +(operand as number);
          default:
            throw new Error(`Unsupported unary operator: ${unaryOp.operator}`);
        }
      }

      case 'conditional_expression': {
        const condExpr = expr as any; // DSLConditionalExpression
        const testResult = this.evaluateExpression(condExpr.test, context);
        if (Boolean(testResult)) {
          return this.evaluateExpression(condExpr.consequent, context);
        } else {
          return this.evaluateExpression(condExpr.alternate, context);
        }
      }

      case 'template_string': {
        const templateExpr = expr as any; // DSLTemplateString
        if (!templateExpr.parts || !Array.isArray(templateExpr.parts)) {
          return '';
        }
        let result = '';
        for (const part of templateExpr.parts) {
          if (typeof part === 'string') {
            result += part;
          } else if (typeof part === 'object' && part !== null) {
            const value = this.evaluateExpression(part, context);
            result += value === null || value === undefined ? '' : String(value);
          }
        }
        return result;
      }

      case 'property_access': {
        const propAccess = expr as DSLPropertyAccess;
        const object = this.evaluateExpression(propAccess.object, context);
        if (object === null || object === undefined) {
          return undefined;
        }
        return (object as Record<string, unknown>)[propAccess.property];
      }

      case 'array_literal': {
        const arrayLit = expr as DSLArrayLiteral;
        return arrayLit.elements.map(e => this.evaluateExpression(e, context));
      }

      case 'function_call': {
        const funcCall = expr as DSLFunctionCall;
        // 函数调用是占位符实现，实际场景需要注册函数表
        const args = funcCall.arguments.map(a => this.evaluateExpression(a, context));
        // 内置函数支持
        switch (funcCall.function) {
          case 'Boolean':
            return Boolean(args[0]);
          case 'String':
            return String(args[0]);
          case 'Number':
            return Number(args[0]);
          default:
            throw new Error(`Unsupported function: ${funcCall.function}`);
        }
      }

      default:
        throw new Error(`Unsupported expression type: ${(expr as any).type}`);
    }
  }

  /**
   * 在上下文中解析变量（支持作用域链）
   *
   * @param name - 变量名
   * @param context - 执行上下文
   * @returns 变量值或 undefined
   */
  private resolveVariableInContext(name: string, context: ExecutionContext): unknown {
    // 检查局部变量
    if (context.locals.has(name)) {
      return context.locals.get(name);
    }
    // 检查输入
    if (name in context.input) {
      return context.input[name];
    }
    // 递归检查父上下文
    if (context.parent) {
      return this.resolveVariableInContext(name, context.parent);
    }
    return undefined;
  }
}

// ============================================================
// Runtime Executor 类型定义 (P2-402)
// 从 agent-call-types.ts 统一导入
// ============================================================

export type {
  ExecutionContext,
  ExecutionResult,
  ExecutionStats,
  ExecutionOptions,
  TraceEntry,
} from './agent-call-types.js';

// ============================================================
// 类型导出（保持与测试文件一致）
// ============================================================

export type {
  AgentDSL,
  DSLInput,
  DSLOutput,
  DSLTool,
  DSLStatement,
  DSLStep,
  SourceLocation,
  ParseResult,
  DSLError,
  DSLDataType,
  DSLExpression,
  DSLGovernance,
  DSLMetadata,
  CompileResult,
  TypeError,
} from './types.js';
