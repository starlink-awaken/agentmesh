/**
 * Honeycomb DSL Compiler - 性能基准测试框架
 *
 * 提供 DSL 编译器各阶段的性能测量工具：
 * - 词法分析性能（tokens/ms）
 * - 语法分析性能（nodes/ms）
 * - 类型检查性能（类型推断耗时）
 * - 代码生成性能（代码行数/ms）
 *
 * 支持特性：
 * - 多次迭代测量（默认100次）
 * - Warm-up机制（避免冷启动影响，默认10次）
 * - 统计显著性检验（P50/P95/P99百分位数、标准差、均值）
 * - 内存监控支持
 * - 性能对比功能
 */

import { Lexer, Parser, DSLParser } from './parser.js';
import { DSLCompiler } from './compiler.js';
import type { AgentDSL, DSLStatement, ParseResult } from './types.js';

// ============================================================
// 性能测量结果接口
// ============================================================

/**
 * 基准测试结果
 *
 * 记录单次基准测试的完整统计数据
 */
export interface BenchmarkResult {
  /** 测试名称 */
  name: string;
  /** 迭代次数 */
  iterations: number;
  /** 总耗时（毫秒） */
  totalTime: number;
  /** 平均耗时（毫秒） */
  avgTime: number;
  /** 最小耗时（毫秒） */
  minTime: number;
  /** 最大耗时（毫秒） */
  maxTime: number;
  /** P50 百分位数（中位数，毫秒） */
  p50: number;
  /** P95 百分位数（毫秒） */
  p95: number;
  /** P99 百分位数（毫秒） */
  p99: number;
  /** 标准差（毫秒） */
  stdDev: number;
  /** 变异系数（标准差/均值，百分比） */
  coefficientOfVariation: number;
  /** 测试前内存使用（MB） */
  memoryBefore: number;
  /** 测试后内存使用（MB） */
  memoryAfter: number;
  /** 内存变化（MB） */
  memoryDelta: number;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 性能对比结果
 *
 * 比较两个函数性能的结果
 */
export interface ComparisonResult {
  /** 第一个函数的结果 */
  result1: BenchmarkResult;
  /** 第二个函数的结果 */
  result2: BenchmarkResult;
  /** 性能提升百分比（正数表示result2更快） */
  improvement: number;
  /** 是否有统计显著性差异 */
  significant: boolean;
  /** 统计检验使用的检验方法 */
  testMethod: 'welch-t-test' | 'mann-whitney-u';
}

/**
 * DSL 编译器性能指标
 *
 * 记录 DSL 编译器各阶段的详细性能数据
 */
export interface DSLCompilerMetrics {
  /** 词法分析指标 */
  lexer: {
    /** Token数量 */
    tokenCount: number;
    /** 词法分析耗时（毫秒） */
    timeMs: number;
    /** 吞吐量（tokens/ms） */
    throughput: number;
  };
  /** 语法分析指标 */
  parser: {
    /** AST节点数量 */
    nodeCount: number;
    /** 语法分析耗时（毫秒） */
    timeMs: number;
    /** 吞吐量（nodes/ms） */
    throughput: number;
  };
  /** 类型检查指标 */
  typeChecker: {
    /** 类型检查耗时（毫秒） */
    timeMs: number;
    /** 类型错误数量 */
    errorCount: number;
  };
  /** 代码生成指标 */
  codeGenerator: {
    /** 生成代码行数 */
    linesOfCode: number;
    /** 代码生成耗时（毫秒） */
    timeMs: number;
    /** 吞吐量（行/ms） */
    throughput: number;
  };
  /** 总编译时间（毫秒） */
  totalTime: number;
  /** DSL 源码大小（字符数） */
  sourceSize: number;
}

/**
 * DSL 样例分类
 *
 * 按规模和复杂度分类的 DSL 样例
 */
export type DSLSampleSize = 'small' | 'medium' | 'large' | 'xlarge';

/**
 * DSL 样例
 *
 * 用于性能测试的 DSL 样例定义
 */
export interface DSLSample {
  /** 样例名称 */
  name: string;
  /** 样例规模 */
  size: DSLSampleSize;
  /** DSL 源码 */
  source: string;
  /** 预期 Token 数量（可选） */
  expectedTokens?: number;
  /** 预期 AST 节点数量（可选） */
  expectedNodes?: number;
}

// ============================================================
// 性能基准测试器
// ============================================================

/**
 * 性能基准测试器
 *
 * 通用的性能测量工具，支持：
 * - 多次迭代测量
 * - Warm-up 机制
 * - 统计分析（百分位数、标准差）
 * - 内存监控
 * - 性能对比
 */
export class PerformanceBenchmarker {
  /** 默认迭代次数 */
  private readonly DEFAULT_ITERATIONS = 100;
  /** 默认 warm-up 次数 */
  private readonly DEFAULT_WARMUP = 10;

  /**
   * 测量函数性能
   *
   * @param name - 测试名称
   * @param fn - 要测试的函数
   * @param options - 测试选项
   * @returns 基准测试结果
   */
  measure<T>(
    name: string,
    fn: () => T,
    options: {
      /** 迭代次数（默认100） */
      iterations?: number;
      /** Warm-up 次数（默认10） */
      warmup?: number;
    } = {}
  ): BenchmarkResult {
    const iterations = options.iterations ?? this.DEFAULT_ITERATIONS;
    const warmup = options.warmup ?? this.DEFAULT_WARMUP;

    // Warm-up 阶段（避免冷启动影响）
    for (let i = 0; i < warmup; i++) {
      fn();
    }

    // 强制垃圾回收（如果可用）
    if (globalThis.gc) {
      globalThis.gc();
    }

    // 记录内存使用（测试前）
    const memoryBefore = this.getMemoryUsageMB();

    // 执行测量
    const times: number[] = [];
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      const iterStart = performance.now();
      fn();
      const iterEnd = performance.now();
      times.push(iterEnd - iterStart);
    }

    const endTime = performance.now();

    // 记录内存使用（测试后）
    const memoryAfter = this.getMemoryUsageMB();

    // 计算统计数据
    const totalTime = endTime - startTime;
    const sortedTimes = times.slice().sort((a, b) => a - b);

    const result: BenchmarkResult = {
      name,
      iterations,
      totalTime,
      avgTime: totalTime / iterations,
      minTime: sortedTimes[0] ?? 0,
      maxTime: sortedTimes[sortedTimes.length - 1] ?? 0,
      p50: this.percentile(sortedTimes, 50),
      p95: this.percentile(sortedTimes, 95),
      p99: this.percentile(sortedTimes, 99),
      stdDev: this.standardDeviation(times),
      coefficientOfVariation: this.coefficientOfVariation(times),
      memoryBefore,
      memoryAfter,
      memoryDelta: memoryAfter - memoryBefore,
      timestamp: Date.now(),
    };

    return result;
  }

  /**
   * 比较两个函数的性能
   *
   * @param name1 - 第一个函数的名称
   * @param fn1 - 第一个函数
   * @param name2 - 第二个函数的名称
   * @param fn2 - 第二个函数
   * @param options - 测试选项
   * @returns 对比结果
   */
  compare<T>(
    name1: string,
    fn1: () => T,
    name2: string,
    fn2: () => T,
    options: {
      iterations?: number;
      warmup?: number;
    } = {}
  ): ComparisonResult {
    const iterations = options.iterations ?? this.DEFAULT_ITERATIONS;
    const warmup = options.warmup ?? this.DEFAULT_WARMUP;

    // 测量两个函数
    const result1 = this.measure(name1, fn1, { iterations, warmup });
    const result2 = this.measure(name2, fn2, { iterations, warmup });

    // 计算性能提升百分比
    // 正数表示 fn2 更快，负数表示 fn1 更快
    const improvement = ((result1.avgTime - result2.avgTime) / result1.avgTime) * 100;

    // 统计显著性检验（使用 Welch's t-test）
    // 简化版本：如果均值差异超过标准差的2倍，认为显著
    const pooledStdDev = Math.sqrt(
      (result1.stdDev * result1.stdDev + result2.stdDev * result2.stdDev) / 2
    );
    const meanDiff = Math.abs(result1.avgTime - result2.avgTime);
    const significant = meanDiff > 2 * pooledStdDev;

    return {
      result1,
      result2,
      improvement,
      significant,
      testMethod: 'welch-t-test',
    };
  }

  /**
   * 异步测量函数性能
   *
   * @param name - 测试名称
   * @param fn - 要测试的异步函数
   * @param options - 测试选项
   * @returns 基准测试结果
   */
  async measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    options: {
      iterations?: number;
      warmup?: number;
    } = {}
  ): Promise<BenchmarkResult> {
    const iterations = options.iterations ?? this.DEFAULT_ITERATIONS;
    const warmup = options.warmup ?? this.DEFAULT_WARMUP;

    // Warm-up 阶段
    for (let i = 0; i < warmup; i++) {
      await fn();
    }

    // 强制垃圾回收
    if (globalThis.gc) {
      globalThis.gc();
    }

    const memoryBefore = this.getMemoryUsageMB();
    const times: number[] = [];
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      const iterStart = performance.now();
      await fn();
      const iterEnd = performance.now();
      times.push(iterEnd - iterStart);
    }

    const endTime = performance.now();
    const memoryAfter = this.getMemoryUsageMB();

    const sortedTimes = times.slice().sort((a, b) => a - b);

    return {
      name,
      iterations,
      totalTime: endTime - startTime,
      avgTime: (endTime - startTime) / iterations,
      minTime: sortedTimes[0] ?? 0,
      maxTime: sortedTimes[sortedTimes.length - 1] ?? 0,
      p50: this.percentile(sortedTimes, 50),
      p95: this.percentile(sortedTimes, 95),
      p99: this.percentile(sortedTimes, 99),
      stdDev: this.standardDeviation(times),
      coefficientOfVariation: this.coefficientOfVariation(times),
      memoryBefore,
      memoryAfter,
      memoryDelta: memoryAfter - memoryBefore,
      timestamp: Date.now(),
    };
  }

  /**
   * 获取当前内存使用量（MB）
   */
  private getMemoryUsageMB(): number {
    return process.memoryUsage().heapUsed / 1024 / 1024;
  }

  /**
   * 计算百分位数
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  }

  /**
   * 计算标准差
   */
  private standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * 计算变异系数（CV = 标准差/均值）
   */
  private coefficientOfVariation(values: number[]): number {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    if (mean === 0) return 0;
    const stdDev = this.standardDeviation(values);
    return (stdDev / mean) * 100;
  }
}

// ============================================================
// DSL 编译器性能测试器
// ============================================================

/**
 * DSL 编译器性能测试器
 *
 * 专门用于测量 DSL 编译器各阶段性能的工具
 */
export class DSLCompilerPerformance {
  private benchmarker: PerformanceBenchmarker;
  private compiler: DSLCompiler;
  private parser: DSLParser;

  constructor(options?: { iterations?: number; warmupIterations?: number }) {
    this.benchmarker = new PerformanceBenchmarker();
    this.compiler = new DSLCompiler();
    this.parser = new DSLParser();
  }

  /**
   * 测量完整的编译流程性能
   *
   * @param source - DSL 源码
   * @param filename - 文件名（用于错误报告）
   * @param options - 测试选项
   * @returns 编译器性能指标
   */
  measureFullCompilation(
    source: string,
    filename: string = '<unknown>',
    options: {
      iterations?: number;
      warmup?: number;
    } = {}
  ): DSLCompilerMetrics {
    // 空输入验证
    if (!source || source.trim().length === 0) {
      return {
        lexer: { tokenCount: 0, timeMs: 0, throughput: 0 },
        parser: { nodeCount: 0, timeMs: 0, throughput: 0 },
        typeChecker: { timeMs: 0, errorCount: 0 },
        codeGenerator: { linesOfCode: 0, timeMs: 0, throughput: 0 },
        totalTime: 0,
        sourceSize: 0,
      };
    }

    const iterations = options.iterations ?? 50;
    const warmup = options.warmup ?? 5;

    // Warm-up
    for (let i = 0; i < warmup; i++) {
      this.parser.parse(source, filename);
    }

    // 词法分析
    const lexerResult = this.measureLexicalAnalysis(source, filename, { iterations: 1, warmup: 0 });
    const lexer = new Lexer(source, filename);
    const tokens = lexer.tokenize();

    // 语法分析 - 使用更新后的方法签名（接受源码而非 tokens）
    const parserResult = this.measureSyntaxAnalysis(source, filename, { iterations: 1, warmup: 0 });
    const parseResult = this.parser.parse(source, filename);

    let nodeCount = 0;
    if (parseResult.ast) {
      nodeCount = this.countASTNodes(parseResult.ast);
    }

    // 类型检查
    const typeCheckResult = this.measureTypeChecking(parseResult.ast, { iterations: 1, warmup: 0 });

    // 代码生成
    const codeGenResult = this.measureCodeGeneration(parseResult.ast, { iterations: 1, warmup: 0 });

    const totalTime = lexerResult.timeMs + parserResult.timeMs + typeCheckResult.timeMs + codeGenResult.timeMs;

    return {
      lexer: {
        tokenCount: tokens.length,
        timeMs: lexerResult.timeMs,
        throughput: tokens.length / Math.max(lexerResult.timeMs, 0.001),
      },
      parser: {
        nodeCount,
        timeMs: parserResult.timeMs,
        throughput: nodeCount / Math.max(parserResult.timeMs, 0.001),
      },
      typeChecker: {
        timeMs: typeCheckResult.timeMs,
        errorCount: typeCheckResult.errorCount,
      },
      codeGenerator: {
        linesOfCode: codeGenResult.linesOfCode,
        timeMs: codeGenResult.timeMs,
        throughput: codeGenResult.linesOfCode / Math.max(codeGenResult.timeMs, 0.001),
      },
      totalTime,
      sourceSize: source.length,
    };
  }

  /**
   * 测量词法分析性能
   *
   * @param source - DSL 源码
   * @param filename - 文件名
   * @param options - 测试选项
   * @returns 词法分析性能结果
   */
  measureLexicalAnalysis(
    source: string,
    filename: string = '<unknown>',
    options: {
      iterations?: number;
      warmup?: number;
    } = {}
  ): { tokenCount: number; timeMs: number; throughput: number } {
    const result = this.benchmarker.measure(
      'Lexer.tokenize',
      () => {
        const lexer = new Lexer(source, filename);
        return lexer.tokenize();
      },
      options
    );

    const lexer = new Lexer(source, filename);
    const tokens = lexer.tokenize();

    return {
      tokenCount: tokens.length,
      timeMs: result.avgTime,
      throughput: tokens.length / Math.max(result.avgTime, 0.001),
    };
  }

  /**
   * 测量语法分析性能
   *
   * @param source - DSL 源码字符串
   * @param filename - 文件名（用于错误报告）
   * @param options - 测试选项
   * @returns 语法分析性能结果
   */
  measureSyntaxAnalysis(
    source: string,
    filename: string = '<unknown>',
    options: {
      iterations?: number;
      warmup?: number;
    } = {}
  ): { nodeCount: number; timeMs: number; throughput: number } {
    const result = this.benchmarker.measure(
      'DSLParser.parse',
      () => {
        return this.parser.parse(source, filename);
      },
      options
    );

    const parseResult = this.parser.parse(source, filename);
    const nodeCount = parseResult.ast ? this.countASTNodes(parseResult.ast) : 0;

    return {
      nodeCount,
      timeMs: result.avgTime,
      throughput: nodeCount / Math.max(result.avgTime, 0.001),
    };
  }

  /**
   * 测量类型检查性能
   *
   * @param ast - AST 节点
   * @param options - 测试选项
   * @returns 类型检查性能结果
   */
  measureTypeChecking(
    ast: AgentDSL | undefined,
    options: {
      iterations?: number;
      warmup?: number;
    } = {}
  ): { timeMs: number; errorCount: number } {
    if (!ast) {
      return { timeMs: 0, errorCount: 0 };
    }

    const result = this.benchmarker.measure(
      'TypeChecker.check',
      () => {
        return this.compiler.typeCheck(ast);
      },
      options
    );

    const errors = this.compiler.typeCheck(ast);

    return {
      timeMs: result.avgTime,
      errorCount: errors.length,
    };
  }

  /**
   * 测量代码生成性能
   *
   * @param ast - AST 节点
   * @param options - 测试选项
   * @returns 代码生成性能结果
   */
  measureCodeGeneration(
    ast: AgentDSL | undefined,
    options: {
      iterations?: number;
      warmup?: number;
    } = {}
  ): { timeMs: number; linesOfCode: number } {
    if (!ast) {
      return { timeMs: 0, linesOfCode: 0 };
    }

    const result = this.benchmarker.measure(
      'Compiler.compile',
      () => {
        return this.compiler.compile(ast, '<benchmark>');
      },
      options
    );

    // 单独调用一次以获取编译结果（用于计算 linesOfCode）
    const compileResult = this.compiler.compile(ast, '<benchmark>');
    // 只有编译成功时才计算 linesOfCode，避免因类型检查失败导致 linesOfCode = 0
    const linesOfCode = compileResult.success && compileResult.output
      ? compileResult.output.split('\n').length
      : 0;

    return {
      timeMs: result.avgTime,
      linesOfCode,
    };
  }

  /**
   * 运行完整的基准测试套件
   *
   * 使用多个不同规模的 DSL 样例进行测试
   *
   * @param samples - DSL 样例数组
   * @returns 完整的性能报告
   */
  runBenchmarkSuite(samples: DSLSample[]): {
    samples: Array<{
      name: string;
      size: DSLSampleSize;
      metrics: DSLCompilerMetrics;
    }>;
    summary: {
      totalSamples: number;
      avgCompileTime: number;
      avgThroughput: {
        lexer: number;
        parser: number;
        codeGen: number;
      };
    };
  } {
    const results: Array<{
      name: string;
      size: DSLSampleSize;
      metrics: DSLCompilerMetrics;
    }> = [];

    for (const sample of samples) {
      const metrics = this.measureFullCompilation(sample.source, `${sample.name}.dsl`);
      results.push({
        name: sample.name,
        size: sample.size,
        metrics,
      });
    }

    // 计算汇总统计
    const totalCompileTime = results.reduce((sum, r) => sum + r.metrics.totalTime, 0);
    const avgLexerThroughput = results.reduce((sum, r) => sum + r.metrics.lexer.throughput, 0) / results.length;
    const avgParserThroughput = results.reduce((sum, r) => sum + r.metrics.parser.throughput, 0) / results.length;
    const avgCodeGenThroughput = results.reduce((sum, r) => sum + r.metrics.codeGenerator.throughput, 0) / results.length;

    return {
      samples: results,
      summary: {
        totalSamples: results.length,
        avgCompileTime: totalCompileTime / results.length,
        avgThroughput: {
          lexer: avgLexerThroughput,
          parser: avgParserThroughput,
          codeGen: avgCodeGenThroughput,
        },
      },
    };
  }

  /**
   * 计算 AST 中的节点数量
   */
  private countASTNodes(ast: AgentDSL): number {
    let count = 1; // 根节点

    // 计算输入节点
    count += ast.inputs.length;
    // 输入中的表达式
    for (const input of ast.inputs) {
      count += this.countExpressionNodes(input.default);
      count += this.countExpressionNodes(input.validation);
    }

    // 计算输出节点
    count += ast.outputs.length;

    // 计算工具节点
    count += ast.tools.length;

    // 计算能力节点
    count += ast.capabilities.length;

    // 计算体中的语句
    for (const stmt of ast.body) {
      count += this.countStatementNodes(stmt);
    }

    return count;
  }

  /**
   * 计算表达式节点数量
   */
  private countExpressionNodes(expr: unknown): number {
    if (!expr || typeof expr !== 'object') {
      return 0;
    }

    const node = expr as { type?: string; [key: string]: unknown };
    if (!node.type) {
      return 0;
    }

    let count = 1;

    switch (node.type) {
      case 'binary_op':
        count += this.countExpressionNodes(node.left);
        count += this.countExpressionNodes(node.right);
        break;
      case 'unary_op':
        count += this.countExpressionNodes(node.operand);
        break;
      case 'property_access':
        count += this.countExpressionNodes(node.object);
        break;
      case 'function_call':
        if (Array.isArray(node.arguments)) {
          for (const arg of node.arguments) {
            count += this.countExpressionNodes(arg);
          }
        }
        break;
      case 'template_string':
        if (Array.isArray(node.parts)) {
          for (const part of node.parts) {
            if (typeof part === 'object') {
              count += this.countExpressionNodes(part);
            }
          }
        }
        break;
      case 'conditional_expression':
        count += this.countExpressionNodes(node.test);
        count += this.countExpressionNodes(node.consequent);
        count += this.countExpressionNodes(node.alternate);
        break;
    }

    return count;
  }

  /**
   * 计算语句节点数量
   */
  private countStatementNodes(stmt: DSLStatement): number {
    let count = 1;

    switch (stmt.type) {
      case 'step':
        // 计算输入绑定中的表达式
        if (stmt.inputs && typeof stmt.inputs === 'object') {
          for (const value of Object.values(stmt.inputs)) {
            count += this.countExpressionNodes(value);
          }
        }
        break;
      case 'condition':
        count += this.countExpressionNodes(stmt.test);
        if (Array.isArray(stmt.consequent)) {
          for (const s of stmt.consequent) {
            count += this.countStatementNodes(s);
          }
        }
        if (Array.isArray(stmt.alternate)) {
          for (const s of stmt.alternate) {
            count += this.countStatementNodes(s);
          }
        }
        break;
      case 'loop':
        count += this.countExpressionNodes(stmt.collection);
        count += this.countExpressionNodes(stmt.test);
        if (Array.isArray(stmt.body)) {
          for (const s of stmt.body) {
            count += this.countStatementNodes(s);
          }
        }
        break;
      case 'parallel':
        if (Array.isArray(stmt.branches)) {
          for (const branch of stmt.branches) {
            if (Array.isArray(branch)) {
              for (const s of branch) {
                count += this.countStatementNodes(s);
              }
            }
          }
        }
        break;
      case 'try_catch':
        if (Array.isArray(stmt.try_block)) {
          for (const s of stmt.try_block) {
            count += this.countStatementNodes(s);
          }
        }
        if (Array.isArray(stmt.catch_block)) {
          for (const s of stmt.catch_block) {
            count += this.countStatementNodes(s);
          }
        }
        if (Array.isArray(stmt.finally_block)) {
          for (const s of stmt.finally_block) {
            count += this.countStatementNodes(s);
          }
        }
        break;
    }

    return count;
  }
}

// ============================================================
// 预定义的 DSL 样例
// ============================================================

/**
 * 获取预定义的 DSL 样例
 *
 * 返回不同规模和复杂度的 DSL 样例用于性能测试
 */
export function getDSLSamples(): DSLSample[] {
  return [
    // 小型样例
    {
      name: 'simple-agent',
      size: 'small',
      source: `agent SimpleAgent {
  description: "A simple agent for testing"
  type: worker
  layer: L3

  input task: string {
    description: "The task to perform"
    required: true
  }

  output result: string {
    description: "The result"
  }

  tools: []

  capability analysis: intermediate

  body {
    step main {
      call agent: "helper"
      inputs: { task: input.task }
    }
  }

  governance {
    first_principles_check: true
    red_team_threshold: medium
    quality_gate_enabled: true
    max_retries: 3
    token_budget: 100000
  }
}`,
    },
    // 中型样例
    {
      name: 'data-processor',
      size: 'medium',
      source: `agent DataProcessor {
  description: "Processes data with multiple inputs and outputs"
  type: worker
  layer: L3
  domain: software

  input sourceData: array<string> {
    description: "Source data array"
    required: true
  }

  input config: object {
    description: "Configuration object"
    required: false
    default: {}
  }

  input maxItems: number {
    description: "Maximum items to process"
    required: false
    default: 100
  }

  output processedData: array<string> {
    description: "Processed data"
  }

  output statistics: object {
    description: "Processing statistics"
  }

  output success: boolean {
    description: "Success flag"
  }

  tools: [read, write, search, analyze]

  capability data_processing: advanced
  capability analysis: intermediate

  body {
    step validate {
      call agent: "validator"
      inputs: { data: input.sourceData, maxItems: input.maxItems }
    }

    condition checkEmpty {
      test: input.sourceData.length > 0
      consequent: {
        step process {
          call agent: "processor"
          inputs: { data: input.sourceData, config: input.config }
        }
      }
      alternate: {
        step handleError {
          call agent: "error-handler"
          inputs: { message: "No data to process" }
        }
      }
    }

    loop processItems {
      loop_type: for_each
      variable: item
      collection: input.sourceData
      body: {
        step transform {
          call tool: "transform"
          inputs: { item: item }
        }
      }
    }
  }

  governance {
    first_principles_check: true
    red_team_threshold: medium
    quality_gate_enabled: true
    max_retries: 3
    token_budget: 100000
  }
}`,
    },
    // 大型样例
    {
      name: 'enterprise-workflow',
      size: 'large',
      source: `agent EnterpriseWorkflow {
  description: "A comprehensive enterprise workflow automation agent"
  type: structural
  layer: L2
  domain: software

  input workflowConfig: object {
    description: "Complete workflow configuration"
    required: true
  }

  input contextData: object {
    description: "Context data for workflow execution"
    required: false
    default: {}
  }

  input priority: string {
    description: "Workflow priority"
    required: false
    default: "medium"
  }

  input options: object {
    description: "Additional options"
    required: false
    default: {}
  }

  output workflowResult: object {
    description: "Complete workflow execution result"
  }

  output executionMetrics: object {
    description: "Detailed execution metrics"
  }

  output auditLog: array<string> {
    description: "Complete audit trail"
  }

  output status: string {
    description: "Final workflow status"
  }

  tools: [read, write, search, analyze, transform, validate, notify, archive]

  capability workflow_management: expert
  capability data_processing: advanced
  capability error_handling: advanced
  capability monitoring: intermediate

  body {
    step initialize {
      call agent: "initializer"
      inputs: { config: input.workflowConfig, context: input.contextData, priority: input.priority }
      retry: { max_attempts: 3, backoff_ms: 1000 }
    }

    condition validatePriority {
      test: input.priority == "high" || input.priority == "critical"
      consequent: {
        step escalateHandling {
          call agent: "escalation-handler"
          inputs: { priority: input.priority }
        }
      }
    }

    parallel parallelProcessing {
      branches: [
        {
          step validateInput {
            call agent: "input-validator"
            inputs: { config: input.workflowConfig }
          }
        },
        {
          step checkDependencies {
            call agent: "dependency-checker"
            inputs: { config: input.workflowConfig }
          }
        },
        {
          step prepareEnvironment {
            call agent: "environment-prep"
            inputs: { context: input.contextData }
          }
        }
      ]
      max_concurrency: 3
    }

    loop processStages {
      loop_type: while
      test: input.priority != "stop"
      body: {
        step executeStage {
          call agent: "stage-executor"
          inputs: { stage: input.priority, config: input.workflowConfig }
        }
      }
    }

    try_catch mainExecution {
      try_block: {
        step executeWorkflow {
          call agent: "workflow-executor"
          inputs: { config: input.workflowConfig, priority: input.priority }
        }
      }
      catch_variable: error
      catch_block: {
        step logError {
          call tool: "logger"
          inputs: { message: "Workflow execution failed", error: error }
        }
        step notifyFailure {
          call tool: "notifier"
          inputs: { recipients: input.workflowConfig.alertRecipients, message: "Workflow failed" }
        }
      }
      finally_block: {
        step cleanup {
          call agent: "cleanup-agent"
          inputs: { sessionId: input.workflowConfig.sessionId }
        }
      }
    }

    step generateReport {
      call agent: "report-generator"
      inputs: { executionData: input.contextData, metrics: input.options, config: input.options }
    }

    condition verifyCompletion {
      test: input.priority == "completed"
      consequent: {
        step finalizeSuccess {
          call agent: "finalizer"
          inputs: { status: "success", sessionId: input.workflowConfig.sessionId }
        }
      }
      alternate: {
        step finalizeFailure {
          call agent: "finalizer"
          inputs: { status: "failure", sessionId: input.workflowConfig.sessionId, reason: input.contextData }
        }
      }
    }
  }

  governance {
    first_principles_check: true
    red_team_threshold: high
    quality_gate_enabled: true
    max_retries: 5
    token_budget: 500000
  }
}`,
    },
    // 超大型样例
    {
      name: 'multi-domain-orchestrator',
      size: 'xlarge',
      source: generateXLargeSample(),
    },
  ];
}

/**
 * 生成超大型 DSL 样例
 *
 * 通过程序化方式生成一个大型 DSL 样例
 */
function generateXLargeSample(): string {
  const inputs = [];
  const outputs = [];
  const tools = [];
  const capabilities = [];
  const bodySteps = [];

  // 生成多个输入
  for (let i = 1; i <= 10; i++) {
    const isArray = i === 1; // 第一个参数是数组类型，用于 loop 测试
    const type = isArray ? 'array<string>' : 'string';
    inputs.push(`  input param${i}: ${type} {
    description: "Parameter ${i}"
    required: ${i <= 5}
  }`);
  }

  // 生成多个输出
  for (let i = 1; i <= 8; i++) {
    outputs.push(`  output result${i}: string {
    description: "Result ${i}"
  }`);
  }

  // 生成工具列表
  const allTools = ['read', 'write', 'search', 'analyze', 'transform', 'validate', 'notify', 'archive', 'encrypt', 'decrypt'];
  tools.push(`  tools: [${allTools.join(', ')}]`);

  // 生成能力声明
  const caps = ['orchestration', 'data_processing', 'error_handling', 'monitoring', 'security', 'compliance'];
  for (const cap of caps) {
    capabilities.push(`  capability ${cap}: ${cap === 'orchestration' ? 'expert' : 'advanced'}`);
  }

  // 生成多个 step
  for (let i = 1; i <= 5; i++) {
    // 每个step使用对应序号的参数，避免类型冲突
    // param1 是 array<string>，用于 loop；param2-10 是 string
    const inputRef = i === 1 ? 'input.param1' : `input.param${i}`;
    bodySteps.push(`    step step${i} {
      call agent: "agent-${i}"
      inputs: { data: ${inputRef} }
      retry: { max_attempts: 3, backoff_ms: 1000 }
    }`);
  }

  // 生成 condition
  bodySteps.push(`    condition checkCondition${1} {
      test: input.param1 == "proceed"
      consequent: {
        step consequentStep {
          call agent: "consequent-agent"
          inputs: { value: input.param1 }
        }
      }
      alternate: {
        step alternateStep {
          call agent: "alternate-agent"
          inputs: { value: input.param1 }
        }
      }
    }`);

  // 生成 loop
  bodySteps.push(`    loop processLoop {
      loop_type: for_each
      variable: item
      collection: input.param1
      body: {
        step loopStep {
          call tool: "transform"
          inputs: { item: item }
        }
      }
    }`);

  // 生成 parallel
  bodySteps.push(`    parallel parallelExecution {
      branches: [
        {
          step branch1Step {
            call agent: "branch1-agent"
            inputs: { data: input.param1 }
          }
        },
        {
          step branch2Step {
            call agent: "branch2-agent"
            inputs: { data: input.param2 }
          }
        }
      ]
      max_concurrency: 2
    }`);

  // 生成 try_catch
  bodySteps.push(`    try_catch tryCatchBlock {
      try_block: {
        step riskyOperation {
          call agent: "risky-agent"
          inputs: { data: input.param1 }
        }
      }
      catch_variable: error
      catch_block: {
        step handleError {
          call tool: "logger"
          inputs: { message: "Error occurred", error: error }
        }
      }
      finally_block: {
        step cleanup {
          call agent: "cleanup-agent"
          inputs: {}
        }
      }
    }`);

  return `agent XLargeOrchestrator {
  description: "A very large orchestrator agent for comprehensive performance testing"
  type: structural
  layer: L2
  domain: software

${inputs.join('\n')}

${outputs.join('\n')}

${tools.join('\n')}

${capabilities.join('\n')}

  body {
${bodySteps.join('\n\n')}
  }

  governance {
    first_principles_check: true
    red_team_threshold: high
    quality_gate_enabled: true
    max_retries: 5
    token_budget: 1000000
  }
}`;
}

// ============================================================
// 性能回归检测
// ============================================================

/**
 * 性能基线数据
 *
 * 用于存储历史性能基线，以便检测性能回归
 */
export interface PerformanceBaseline {
  /** 基线名称 */
  name: string;
  /** 基线版本 */
  version: string;
  /** 创建时间戳 */
  timestamp: number;
  /** 环境信息 */
  environment: {
    platform: string;
    nodeVersion: string;
    cpuModel: string;
  };
  /** 基线指标 */
  metrics: {
    /** 词法分析吞吐量 (tokens/ms) */
    lexerThroughput: number;
    /** 语法分析吞吐量 (nodes/ms) */
    parserThroughput: number;
    /** 类型检查耗时 (ms) */
    typeCheckTime: number;
    /** 代码生成吞吐量 (lines/ms) */
    codeGenThroughput: number;
    /** 总编译时间 (ms) */
    totalCompileTime: number;
  };
}

/**
 * 性能回归检测结果
 */
export interface RegressionResult {
  /** 是否检测到回归 */
  hasRegression: boolean;
  /** 回退详情 */
  regressions: Array<{
    metric: string;
    baseline: number;
    current: number;
    degradation: number; // 百分比
  }>;
  /** 改进详情 */
  improvements: Array<{
    metric: string;
    baseline: number;
    current: number;
    improvement: number; // 百分比
  }>;
}

/**
 * 性能回归检测器
 *
 * 用于检测性能是否相对于历史基线发生退化
 */
export class PerformanceRegressionDetector {
  private baseline: PerformanceBaseline | null = null;

  /**
   * 加载性能基线
   */
  loadBaseline(baseline: PerformanceBaseline): void {
    this.baseline = baseline;
  }

  /**
   * 检测性能回归
   *
   * @param currentMetrics - 当前性能指标
   * @param threshold - 回退阈值（百分比，默认10%）
   * @returns 回归检测结果
   */
  detectRegression(
    currentMetrics: DSLCompilerMetrics,
    threshold: number = 10
  ): RegressionResult {
    if (!this.baseline) {
      return {
        hasRegression: false,
        regressions: [],
        improvements: [],
      };
    }

    const regressions: RegressionResult['regressions'] = [];
    const improvements: RegressionResult['improvements'] = [];

    // 检查词法分析性能
    const currentLexerThroughput = currentMetrics.lexer.throughput;
    const baselineLexerThroughput = this.baseline.metrics.lexerThroughput;
    const lexerChange = ((currentLexerThroughput - baselineLexerThroughput) / baselineLexerThroughput) * 100;
    if (lexerChange < -threshold) {
      regressions.push({
        metric: 'lexerThroughput',
        baseline: baselineLexerThroughput,
        current: currentLexerThroughput,
        degradation: Math.abs(lexerChange),
      });
    } else if (lexerChange > threshold) {
      improvements.push({
        metric: 'lexerThroughput',
        baseline: baselineLexerThroughput,
        current: currentLexerThroughput,
        improvement: lexerChange,
      });
    }

    // 检查语法分析性能
    const currentParserThroughput = currentMetrics.parser.throughput;
    const baselineParserThroughput = this.baseline.metrics.parserThroughput;
    const parserChange = ((currentParserThroughput - baselineParserThroughput) / baselineParserThroughput) * 100;
    if (parserChange < -threshold) {
      regressions.push({
        metric: 'parserThroughput',
        baseline: baselineParserThroughput,
        current: currentParserThroughput,
        degradation: Math.abs(parserChange),
      });
    } else if (parserChange > threshold) {
      improvements.push({
        metric: 'parserThroughput',
        baseline: baselineParserThroughput,
        current: currentParserThroughput,
        improvement: parserChange,
      });
    }

    // 检查类型检查性能
    const currentTypeCheckTime = currentMetrics.typeChecker.timeMs;
    const baselineTypeCheckTime = this.baseline.metrics.typeCheckTime;
    const typeCheckChange = ((currentTypeCheckTime - baselineTypeCheckTime) / baselineTypeCheckTime) * 100;
    if (typeCheckChange > threshold) {
      regressions.push({
        metric: 'typeCheckTime',
        baseline: baselineTypeCheckTime,
        current: currentTypeCheckTime,
        degradation: typeCheckChange,
      });
    } else if (typeCheckChange < -threshold) {
      improvements.push({
        metric: 'typeCheckTime',
        baseline: baselineTypeCheckTime,
        current: currentTypeCheckTime,
        improvement: Math.abs(typeCheckChange),
      });
    }

    // 检查代码生成性能
    const currentCodeGenThroughput = currentMetrics.codeGenerator.throughput;
    const baselineCodeGenThroughput = this.baseline.metrics.codeGenThroughput;
    const codeGenChange = ((currentCodeGenThroughput - baselineCodeGenThroughput) / baselineCodeGenThroughput) * 100;
    if (codeGenChange < -threshold) {
      regressions.push({
        metric: 'codeGenThroughput',
        baseline: baselineCodeGenThroughput,
        current: currentCodeGenThroughput,
        degradation: Math.abs(codeGenChange),
      });
    } else if (codeGenChange > threshold) {
      improvements.push({
        metric: 'codeGenThroughput',
        baseline: baselineCodeGenThroughput,
        current: currentCodeGenThroughput,
        improvement: codeGenChange,
      });
    }

    // 检查总编译时间
    const currentTotalTime = currentMetrics.totalTime;
    const baselineTotalTime = this.baseline.metrics.totalCompileTime;
    const totalTimeChange = ((currentTotalTime - baselineTotalTime) / baselineTotalTime) * 100;
    if (totalTimeChange > threshold) {
      regressions.push({
        metric: 'totalCompileTime',
        baseline: baselineTotalTime,
        current: currentTotalTime,
        degradation: totalTimeChange,
      });
    } else if (totalTimeChange < -threshold) {
      improvements.push({
        metric: 'totalCompileTime',
        baseline: baselineTotalTime,
        current: currentTotalTime,
        improvement: Math.abs(totalTimeChange),
      });
    }

    return {
      hasRegression: regressions.length > 0,
      regressions,
      improvements,
    };
  }

  /**
   * 创建基线
   *
   * 从当前性能指标创建基线数据
   */
  createBaseline(
    name: string,
    version: string,
    metrics: DSLCompilerMetrics
  ): PerformanceBaseline {
    return {
      name,
      version,
      timestamp: Date.now(),
      environment: {
        platform: process.platform,
        nodeVersion: process.version,
        cpuModel: 'unknown', // 无法在 JS 中轻松获取
      },
      metrics: {
        lexerThroughput: metrics.lexer.throughput,
        parserThroughput: metrics.parser.throughput,
        typeCheckTime: metrics.typeChecker.timeMs,
        codeGenThroughput: metrics.codeGenerator.throughput,
        totalCompileTime: metrics.totalTime,
      },
    };
  }
}
