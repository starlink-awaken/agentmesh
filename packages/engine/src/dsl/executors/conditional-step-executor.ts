/**
 * Honeycomb DSL - Condition Step Executor
 *
 * 实现条件分支 Agent 调用执行器，支持 if-elif-else 逻辑
 * 根据条件表达式求值结果选择执行不同的 Agent。
 *
 * @module dsl/executors/conditional-step-executor
 */

import type {
  DSLConditionalStep,
  ConditionalBranch,
  DSLExpression,
  DSLStep,
  DSLCall,
} from '../types.js';

import type {
  ExecutionContext,
  ExecutionDependencies,
  ExecutionResult,
} from '../agent-call-types.js';

// ============================================================
// 表达式求值器接口
// ============================================================

/**
 * 表达式求值器接口
 *
 * 用于在执行过程中求值 DSL 表达式。
 */
export interface IExpressionEvaluator {
  /**
   * 求值表达式
   * @param expr 表达式
   * @param context 执行上下文
   * @returns 求值结果
   */
  evaluate(expr: DSLExpression, context: ExecutionContext): unknown;
}

// ============================================================
// 步骤执行器接口
// ============================================================

/**
 * 步骤执行器接口
 *
 * 用于执行单个步骤（包括常规步骤和条件分支步骤）。
 */
export interface IStepExecutor {
  /**
   * 执行步骤
   * @param step 步骤 AST 节点
   * @param context 执行上下文
   * @returns 更新后的执行上下文
   */
  executeStep(
    step: DSLStep,
    context: ExecutionContext
  ): Promise<ExecutionContext>;
}

// ============================================================
// 条件分支步骤执行器
// ============================================================

/**
 * 条件分支步骤执行器
 *
 * 职责：
 * - 解析条件分支步骤中的输入变量
 * - 遍历分支列表，评估每个分支的条件
 * - 选择第一个匹配的分支（if/elif）或默认分支（else）
 * - 执行选定分支的 Agent 调用
 * - 将结果映射到输出变量
 */
export class ConditionStepExecutor {
  /** 执行依赖 */
  private readonly dependencies: ExecutionDependencies;
  /** 步骤执行器（用于执行 Agent 调用） */
  private readonly stepExecutor: IStepExecutor;
  /** 表达式求值器 */
  private readonly expressionEvaluator: IExpressionEvaluator;

  /**
   * 创建条件分支步骤执行器
   *
   * @param dependencies 执行依赖
   * @param stepExecutor 步骤执行器
   * @param expressionEvaluator 表达式求值器（可选）
   */
  constructor(
    dependencies: ExecutionDependencies,
    stepExecutor: IStepExecutor,
    expressionEvaluator?: IExpressionEvaluator
  ) {
    this.dependencies = dependencies;
    this.stepExecutor = stepExecutor;
    this.expressionEvaluator = expressionEvaluator ?? new DefaultExpressionEvaluator();
  }

  /**
   * 执行条件分支步骤
   *
   * @param step 条件分支步骤 AST 节点
   * @param context 执行上下文
   * @returns 执行结果
   * @throws Error 当没有匹配分支且没有 else 时抛出
   */
  async executeStep(
    step: DSLConditionalStep,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const stepName = step.name || 'conditional';

    // 1. 解析输入变量（用于条件求值和Agent调用）
    const resolvedInputs = this.resolveInputs(step.inputs, context);

    // 2. 将解析的输入添加到上下文中（用于条件表达式求值）
    const enrichedContext = this.enrichContext(context, resolvedInputs);

    // 3. 遍历分支，找到第一个匹配的
    for (let i = 0; i < step.branches.length; i++) {
      const branch = step.branches[i];

      // else 分支（无条件执行）
      if (branch.else) {
        return this.executeCall(branch.else, resolvedInputs, step, enrichedContext);
      }

      // if/elif 分支：评估条件
      if (branch.if && branch.then) {
        const conditionValue = this.evaluateExpression(branch.if, enrichedContext);
        if (this.isTruthy(conditionValue)) {
          return this.executeCall(branch.then, resolvedInputs, step, enrichedContext);
        }
      }
    }

    // 4. 无匹配分支且没有 else - 抛出错误（不要被 catch 捕获）
    const errorMsg = `No matching branch in conditional step '${stepName}'`;
    this.logError(step, new Error(errorMsg), context);
    throw new Error(errorMsg);
  }

  /**
   * 解析输入表达式
   *
   * @param inputs 输入表达式映射
   * @param context 执行上下文
   * @returns 解析后的输入值
   */
  private resolveInputs(
    inputs: Record<string, DSLExpression>,
    context: ExecutionContext
  ): Record<string, unknown> {
    const resolvedInputs: Record<string, unknown> = {};

    for (const [key, expr] of Object.entries(inputs)) {
      try {
        const value = this.expressionEvaluator.evaluate(expr, context);
        resolvedInputs[key] = value;
      } catch (error) {
        throw new Error(
          `Failed to resolve input '${key}': ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return resolvedInputs;
  }

  /**
   * 使用解析后的输入丰富上下文
   *
   * @param context 原始上下文
   * @param resolvedInputs 解析后的输入
   * @returns 丰富后的上下文
   */
  private enrichContext(
    context: ExecutionContext,
    resolvedInputs: Record<string, unknown>
  ): ExecutionContext {
    // 创建一个新的上下文，添加解析后的输入作为局部变量
    const enrichedContext: ExecutionContext = {
      ...context,
      locals: new Map(context.locals),
    };

    // 将解析的输入添加到局部变量
    for (const [key, value] of Object.entries(resolvedInputs)) {
      enrichedContext.locals.set(key, value);
    }

    return enrichedContext;
  }

  /**
   * 求值表达式
   *
   * @param expr 表达式
   * @param context 执行上下文
   * @returns 求值结果
   */
  private evaluateExpression(expr: DSLExpression, context: ExecutionContext): unknown {
    return this.expressionEvaluator.evaluate(expr, context);
  }

  /**
   * 判断值是否为真值
   *
   * @param value 待判断的值
   * @returns 是否为真值
   */
  private isTruthy(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      return value.length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === 'object') {
      return Object.keys(value).length > 0;
    }
    return true;
  }

  /**
   * 执行 Agent 调用
   *
   * @param call Agent 调用配置
   * @param inputs 解析后的输入值
   * @param step 条件分支步骤
   * @param context 执行上下文
   * @returns 执行结果
   */
  private async executeCall(
    call: DSLCall,
    inputs: Record<string, unknown>,
    step: DSLConditionalStep,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    // 获取目标名称作为步骤名称
    const targetName = call.type === 'agent' || call.type === 'tool'
      ? call.name
      : call.type === 'skill'
        ? call.skill_id
        : step.name;

    // 构建临时 step 执行调用
    const tempStep: DSLStep = {
      type: 'step',
      name: targetName, // 使用目标名称而不是条件步骤名称
      call: call,
      inputs: this.inputsToExpressions(inputs),
      outputs: step.outputs,
    };

    try {
      const updatedContext = await this.stepExecutor.executeStep(tempStep, context);

      // 从上下文中收集输出
      const outputs: Record<string, unknown> = {};
      if (step.outputs) {
        for (const [targetVar, _sourcePath] of Object.entries(step.outputs)) {
          if (updatedContext.locals.has(targetVar)) {
            outputs[targetVar] = updatedContext.locals.get(targetVar);
          }
        }
      }

      return {
        success: true,
        value: undefined,
        trace: [],
        errors: [],
        outputs,  // 添加输出映射到返回结果
      };
    } catch (error) {
      return {
        success: false,
        value: null,
        trace: [],
        errors: [error instanceof Error ? error : new Error(String(error))],
      };
    }
  }

  /**
   * 将输入值转换为表达式
   *
   * @param inputs 输入值
   * @returns 表达式映射
   */
  private inputsToExpressions(inputs: Record<string, unknown>): Record<string, DSLExpression> {
    const expressions: Record<string, DSLExpression> = {};
    for (const [key, value] of Object.entries(inputs)) {
      expressions[key] = this.valueToExpression(value);
    }
    return expressions;
  }

  /**
   * 将值转换为字面量表达式
   *
   * @param value 值
   * @returns 字面量表达式
   */
  private valueToExpression(value: unknown): DSLExpression {
    if (value === null) {
      return { type: 'literal', value: null };
    }
    if (typeof value === 'boolean' ||
        typeof value === 'number' ||
        typeof value === 'string') {
      return { type: 'literal', value };
    }
    // 对于复杂类型，转换为字符串传递
    return { type: 'literal', value: String(value) };
  }

  /**
   * 记录错误到日志
   *
   * @param step 条件分支步骤
   * @param error 错误
   * @param context 执行上下文
   */
  private logError(step: DSLConditionalStep, error: unknown, context: ExecutionContext): void {
    const logger = this.dependencies.logger;
    if (!logger) {
      return;
    }

    const stepName = step.name || 'conditional';
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (typeof logger.error === 'function') {
      logger.error(`Conditional step '${stepName}' execution failed`, {
        step: stepName,
        traceId: context.traceId,
        error: errorMessage,
        location: step.loc,
      });
    }
  }
}

// ============================================================
// 默认表达式求值器实现
// ============================================================

/**
 * 默认表达式求值器
 *
 * 支持：
 * - 字面量求值
 * - 变量引用求值
 * - 二元操作求值（算术、比较、逻辑）
 * - 一元操作求值
 * - 属性访问求值
 */
class DefaultExpressionEvaluator implements IExpressionEvaluator {
  /**
   * 求值表达式
   *
   * @param expr 表达式
   * @param context 执行上下文
   * @returns 求值结果
   */
  evaluate(expr: DSLExpression, context: ExecutionContext): unknown {
    switch (expr.type) {
      case 'literal':
        return (expr as { type: 'literal'; value: unknown }).value;

      case 'variable':
        return this.evaluateVariable(expr as { type: 'variable'; name: string }, context);

      case 'binary_op':
        return this.evaluateBinaryOp(expr as {
          type: 'binary_op';
          operator: string;
          left: DSLExpression;
          right: DSLExpression;
        }, context);

      case 'unary_op':
        return this.evaluateUnaryOp(expr as {
          type: 'unary_op';
          operator: string;
          operand: DSLExpression;
        }, context);

      case 'property_access':
        return this.evaluatePropertyAccess(expr as {
          type: 'property_access';
          object: DSLExpression;
          property: string;
        }, context);

      case 'conditional_expression':
        return this.evaluateConditionalExpression(expr as {
          type: 'conditional_expression';
          test: DSLExpression;
          consequent: DSLExpression;
          alternate: DSLExpression;
        }, context);

      default:
        throw new Error(`Unsupported expression type: ${(expr as { type: string }).type}`);
    }
  }

  /**
   * 求值变量引用
   *
   * @param expr 变量表达式
   * @param context 执行上下文
   * @returns 变量值
   */
  private evaluateVariable(
    expr: { type: 'variable'; name: string },
    context: ExecutionContext
  ): unknown {
    const varName = expr.name;

    // 1. 检查 locals
    if (context.locals.has(varName)) {
      return context.locals.get(varName);
    }

    // 2. 检查 input（支持路径访问，如 'input_data.size'）
    if (varName.includes('.')) {
      return this.resolvePath(varName, context);
    }

    // 3. 检查 input 顶层
    if (varName in context.input) {
      return context.input[varName];
    }

    // 4. 递归检查父上下文
    if (context.parent) {
      return this.evaluateVariable(expr, context.parent);
    }

    throw new Error(`Undefined variable: ${varName}`);
  }

  /**
   * 解析路径（如 'user.role' 或 'data.items.0'）
   *
   * @param path 路径字符串
   * @param context 执行上下文
   * @returns 解析后的值
   */
  private resolvePath(path: string, context: ExecutionContext): unknown {
    const parts = path.split('.');

    // 第一个部分可能是变量名
    let current: unknown = this.getVariable(parts[0], context);

    // 遍历剩余部分
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      current = this.getProperty(current, part);
    }

    return current;
  }

  /**
   * 获取变量值（支持 locals 和 input）
   *
   * @param name 变量名
   * @param context 执行上下文
   * @returns 变量值
   */
  private getVariable(name: string, context: ExecutionContext): unknown {
    if (context.locals.has(name)) {
      return context.locals.get(name);
    }
    if (name in context.input) {
      return context.input[name];
    }
    if (context.parent) {
      return this.getVariable(name, context.parent);
    }
    throw new Error(`Undefined variable: ${name}`);
  }

  /**
   * 获取对象属性
   *
   * @param obj 对象
   * @param prop 属性名
   * @returns 属性值
   */
  private getProperty(obj: unknown, prop: string): unknown {
    if (obj === null || obj === undefined) {
      throw new Error(`Cannot access property '${prop}' on null/undefined`);
    }
    if (typeof obj !== 'object') {
      throw new Error(`Cannot access property '${prop}' on non-object type`);
    }
    if (!(prop in (obj as Record<string, unknown>))) {
      throw new Error(`Property '${prop}' does not exist on object`);
    }
    return (obj as Record<string, unknown>)[prop];
  }

  /**
   * 求值二元操作
   *
   * @param expr 二元操作表达式
   * @param context 执行上下文
   * @returns 求值结果
   */
  private evaluateBinaryOp(
    expr: { type: 'binary_op'; op?: string; operator: string; left: DSLExpression; right: DSLExpression },
    context: ExecutionContext
  ): unknown {
    const left = this.evaluate(expr.left, context);
    const right = this.evaluate(expr.right, context);
    const op = expr.op ?? expr.operator;

    // 算术操作
    if (op === '+') {
      if (typeof left === 'number' && typeof right === 'number') {
        return left + right;
      }
      return String(left) + String(right);
    }
    if (op === '-') return (left as number) - (right as number);
    if (op === '*') return (left as number) * (right as number);
    if (op === '/') return (left as number) / (right as number);
    if (op === '%') return (left as number) % (right as number);

    // 比较操作
    if (op === '==') return left === right;
    if (op === '!=') return left !== right;
    if (op === '<') return (left as number) < (right as number);
    if (op === '>') return (left as number) > (right as number);
    if (op === '<=') return (left as number) <= (right as number);
    if (op === '>=') return (left as number) >= (right as number);

    // 逻辑操作
    if (op === '&&') return this.isTruthy(left) && this.isTruthy(right);
    if (op === '||') return this.isTruthy(left) || this.isTruthy(right);

    throw new Error(`Unknown binary operator: ${op}`);
  }

  /**
   * 求值一元操作
   *
   * @param expr 一元操作表达式
   * @param context 执行上下文
   * @returns 求值结果
   */
  private evaluateUnaryOp(
    expr: { type: 'unary_op'; operator: string; operand: DSLExpression },
    context: ExecutionContext
  ): unknown {
    const operand = this.evaluate(expr.operand, context);
    const op = expr.operator;

    if (op === '!') return !this.isTruthy(operand);
    if (op === '-') return -(operand as number);
    if (op === '+') return +(operand as number);

    throw new Error(`Unknown unary operator: ${op}`);
  }

  /**
   * 求值属性访问
   *
   * @param expr 属性访问表达式
   * @param context 执行上下文
   * @returns 求值结果
   */
  private evaluatePropertyAccess(
    expr: { type: 'property_access'; object: DSLExpression; property: string },
    context: ExecutionContext
  ): unknown {
    const obj = this.evaluate(expr.object, context);
    return this.getProperty(obj, expr.property);
  }

  /**
   * 求值三元条件表达式
   *
   * @param expr 三元条件表达式
   * @param context 执行上下文
   * @returns 求值结果
   */
  private evaluateConditionalExpression(
    expr: { type: 'conditional_expression'; test: DSLExpression; consequent: DSLExpression; alternate: DSLExpression },
    context: ExecutionContext
  ): unknown {
    const testResult = this.evaluate(expr.test, context);
    if (this.isTruthy(testResult)) {
      return this.evaluate(expr.consequent, context);
    } else {
      return this.evaluate(expr.alternate, context);
    }
  }

  /**
   * 判断值是否为真值
   *
   * @param value 待判断的值
   * @returns 是否为真值
   */
  private isTruthy(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      return value.length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === 'object') {
      return Object.keys(value).length > 0;
    }
    return true;
  }
}

// ============================================================
// 导出工厂函数
// ============================================================

/**
 * 创建条件分支步骤执行器
 *
 * @param dependencies 执行依赖
 * @param stepExecutor 步骤执行器
 * @param expressionEvaluator 表达式求值器（可选）
 * @returns 条件分支步骤执行器实例
 */
export function createConditionStepExecutor(
  dependencies: ExecutionDependencies,
  stepExecutor: IStepExecutor,
  expressionEvaluator?: IExpressionEvaluator
): ConditionStepExecutor {
  return new ConditionStepExecutor(dependencies, stepExecutor, expressionEvaluator);
}
