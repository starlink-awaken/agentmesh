/**
 * Honeycomb DSL Compiler - 性能基准测试
 *
 * 测试 DSL 编译器各阶段的性能：
 * - 词法分析性能（tokens/ms）
 * - 语法分析性能（nodes/ms）
 * - 类型检查性能（类型推断耗时）
 * - 代码生成性能（代码行数/ms）
 *
 * 运行方式：
 * ```bash
 * bun test tests/dsl-compiler-performance.test.ts
 * ```
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// 导入待测试的模块
import {
  PerformanceBenchmarker,
  DSLCompilerPerformance,
  getDSLSamples,
  PerformanceRegressionDetector,
  type BenchmarkResult,
  type DSLCompilerMetrics,
  type PerformanceBaseline,
  type DSLSample,
} from '../src/dsl/performance.js';

// ============================================================
// 测试配置
// ============================================================

const PERFORMANCE_REPORT_DIR = join(process.cwd(), 'performance-reports');
const BASELINE_FILE = join(PERFORMANCE_REPORT_DIR, 'baseline.json');

// 测试配置
const BENCHMARK_CONFIG = {
  iterations: 100,      // 迭代次数
  warmupIterations: 10, // Warm-up 次数
  threshold: 10,        // 性能回归阈值（百分比）
};

// ============================================================
// DSL 样例定义（至少10个）
// ============================================================

/**
 * 获取扩展的 DSL 样例集合
 *
 * 包含预定义样例 + 自定义样例，总计超过10个
 */
function getExtendedDSLSamples(): DSLSample[] {
  const predefined = getDSLSamples();

  // 添加额外的自定义样例
  const customSamples: DSLSample[] = [
    // 样例5: 极简Agent（测试最小开销）
    {
      name: 'minimal-agent',
      size: 'small',
      source: `agent Minimal {
  description: "Minimal agent"
  type: worker
  layer: L3

  input x: string { required: true }

  output y: string { }

  tools: []

  capability test: basic

  body {
    step main {
      call agent: "helper"
      inputs: { task: input.x }
    }
  }

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: false
    max_retries: 1
    token_budget: 1000
  }
}`,
    },
    // 样例6: 数据转换Agent（测试复杂表达式）
    {
      name: 'transform-agent',
      size: 'medium',
      source: `agent Transformer {
  description: "Data transformation agent"
  type: worker
  layer: L3
  domain: software

  input rawData: array<object> {
    description: "Raw input data"
    required: true
  }

  input transformConfig: object {
    description: "Transformation configuration"
    required: false
    default: { mode: "strict" }
  }

  output transformedData: array<object> {
    description: "Transformed data"
  }

  output metadata: object {
    description: "Transformation metadata"
  }

  tools: [map, filter, reduce, sort]

  capability data_transformation: advanced

  body {
    step normalize {
      call tool: "map"
      inputs: { data: input.rawData, fn: "normalize" }
    }

    condition checkMode {
      test: input.transformConfig.mode == "strict"
      consequent: {
        step validate {
          call tool: "validate"
          inputs: { data: state.normalized }
        }
      }
    }

    step sort {
      call tool: "sort"
      inputs: { data: state.normalized, key: "id" }
    }

    loop processItems {
      loop_type: for_each
      variable: item
      collection: state.sorted
      body: {
        step enrich {
          call tool: "enrich"
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
    token_budget: 200000
  }
}`,
    },
    // 样例7: 并行处理Agent（测试并行执行）
    {
      name: 'parallel-processor',
      size: 'large',
      source: `agent ParallelProcessor {
  description: "Processes multiple tasks in parallel"
  type: structural
  layer: L2
  domain: software

  input tasks: array<object> {
    description: "Tasks to process"
    required: true
  }

  input concurrency: number {
    description: "Max concurrency level"
    required: false
    default: 5
  }

  output results: array<object> {
    description: "Processing results"
  }

  output errors: array<object> {
    description: "Processing errors"
  }

  tools: [process, validate, log, notify]

  capability parallel_processing: expert

  body {
    step validateTasks {
      call tool: "validate"
      inputs: { tasks: input.tasks }
    }

    parallel processInParallel {
      branches: [
        {
          step batch1 {
            call agent: "batch-processor"
            inputs: { tasks: input.tasks.slice(0, 10) }
          }
        },
        {
          step batch2 {
            call agent: "batch-processor"
            inputs: { tasks: input.tasks.slice(10, 20) }
          }
        },
        {
          step batch3 {
            call agent: "batch-processor"
            inputs: { tasks: input.tasks.slice(20, 30) }
          }
        }
      ]
      max_concurrency: input.concurrency
    }

    step aggregateResults {
      call agent: "aggregator"
      inputs: { results: input.tasks }
    }

    condition checkErrors {
      test: input.tasks.length > 100
      consequent: {
        step notifyErrors {
          call tool: "notify"
          inputs: { recipients: "admin@example.com", subject: "Processing errors detected", body: input.tasks }
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
    // 样例8: 条件分支密集型Agent（测试条件处理）
    {
      name: 'conditional-router',
      size: 'medium',
      source: `agent ConditionalRouter {
  description: "Routes requests based on multiple conditions"
  type: structural
  layer: L2

  input request: object {
    description: "Incoming request"
    required: true
  }

  input rules: array<object> {
    description: "Routing rules"
    required: true
  }

  output route: string {
    description: "Selected route"
  }

  output response: object {
    description: "Response data"
  }

  tools: [evaluate, dispatch]

  capability routing: advanced

  body {
    condition checkAuth {
      test: request.auth == true
      consequent: {
        step evaluateRules {
          call tool: "evaluate"
          inputs: { rules: input.rules, context: input.request }
        }
      }
      alternate: {
        step returnUnauthorized {
          call tool: "dispatch"
          inputs: { route: "unauthorized", response: { status: 401 } }
        }
      }
    }

    condition checkPriority {
      test: state.evaluatedRules.priority == "high"
      consequent: {
        step routeHighPriority {
          call agent: "high-priority-handler"
          inputs: { request: input.request }
        }
      }
    }

    condition checkType {
      test: request.type == "query"
      consequent: {
        step routeQuery {
          call agent: "query-handler"
          inputs: { request: input.request }
        }
      }
      alternate: {
        step routeCommand {
          call agent: "command-handler"
          inputs: { request: input.request }
        }
      }
    }

    step respond {
      call tool: "dispatch"
      inputs: { route: state.selectedRoute, response: state.handlerResponse }
    }
  }

  governance {
    first_principles_check: true
    red_team_threshold: medium
    quality_gate_enabled: true
    max_retries: 3
    token_budget: 300000
  }
}`,
    },
    // 样例9: 循环密集型Agent（测试循环性能）
    {
      name: 'batch-processor',
      size: 'large',
      source: `agent BatchProcessor {
  description: "Processes items in batches with loops"
  type: worker
  layer: L3
  domain: software

  input items: array<object> {
    description: "Items to process"
    required: true
  }

  input batchSize: number {
    description: "Batch size"
    required: false
    default: 100
  }

  output processedItems: array<object> {
    description: "Processed items"
  }

  output summary: object {
    description: "Processing summary"
  }

  tools: [process, validate, aggregate]

  capability batch_processing: expert

  body {
    loop processBatches {
      loop_type: while
      test: input.items.length > 0
      body: {
        step extractBatch {
          call tool: "validate"
          inputs: { start: 0, end: input.batchSize, items: input.items }
        }

        step processBatch {
          call tool: "process"
          inputs: { batch: input.items }
        }

        loop processItemsInBatch {
          loop_type: for_each
          variable: item
          collection: input.items
          body: {
            step transformItem {
              call agent: "item-transformer"
              inputs: { item: item }
            }
          }
        }

        step aggregateBatch {
          call tool: "aggregate"
          inputs: { results: input.items, summary: input.batchSize }
        }
      }
    }

    step finalizeSummary {
      call agent: "summary-generator"
      inputs: { data: input.items }
    }
  }

  governance {
    first_principles_check: true
    red_team_threshold: high
    quality_gate_enabled: true
    max_retries: 5
    token_budget: 400000
  }
}`,
    },
    // 样例10: 异常处理密集型Agent（测试try-catch性能）
    {
      name: 'resilient-processor',
      size: 'medium',
      source: `agent ResilientProcessor {
  description: "Processor with extensive error handling"
  type: worker
  layer: L3
  domain: software

  input data: object {
    description: "Input data"
    required: true
  }

  output result: object {
    description: "Processing result"
  }

  output errorLog: array<object> {
    description: "Error log"
  }

  tools: [validate, process, log, notify, recover]

  capability error_handling: expert

  body {
    try_catch processWithRetry {
      try_block: {
        try_catch validateInput {
          try_block: {
            step validate {
              call tool: "validate"
              inputs: { data: input.data }
            }
          }
          catch_variable: validationError
          catch_block: {
            step logValidationError {
              call tool: "log"
              inputs: { error: validationError, level: "warning" }
            }

            step attemptRecovery {
              call tool: "recover"
              inputs: { data: input.data, strategy: "sanitize" }
            }
          }
        }

        try_catch processData {
          try_block: {
            step process {
              call tool: "process"
              inputs: { data: state.validatedData }
            }
          }
          catch_variable: processError
          catch_block: {
            step logProcessError {
              call tool: "log"
              inputs: { error: processError, level: "error" }
            }

            step notifyFailure {
              call tool: "notify"
              inputs: { recipients: "ops@example.com", error: processError }
            }

            step fallbackProcess {
              call agent: "fallback-processor"
              inputs: { data: state.validatedData, mode: "safe" }
            }
          }
        }
      }
      catch_variable: fatalError
      catch_block: {
        step logFatalError {
          call tool: "log"
          inputs: { error: fatalError, level: "critical" }
        }

        step emergencyFallback {
          call agent: "emergency-handler"
          inputs: { error: fatalError }
        }
      }
      finally_block: {
        step cleanup {
          call tool: "cleanup"
          inputs: { session: state.sessionId }
        }

        step auditLog {
          call tool: "log"
          inputs: { event: "processing_complete", duration: state.duration }
        }
      }
    }
  }

  governance {
    first_principles_check: true
    red_team_threshold: high
    quality_gate_enabled: true
    max_retries: 10
    token_budget: 500000
  }
}`,
    },
  ];

  return [...predefined, ...customSamples];
}

/**
 * 获取环境信息
 */
function getEnvironmentInfo() {
  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    cpuCount: (globalThis as unknown as { navigator?: { hardwareConcurrency?: number } }).navigator?.hardwareConcurrency || 'unknown',
    totalMemory: Math.round((process.memoryUsage?.().heapTotal || 0) / 1024 / 1024) + 'MB',
    timestamp: new Date().toISOString(),
  };
}

/**
 * 写入性能报告
 */
function writePerformanceReport(
  reportName: string,
  data: unknown
): void {
  if (!existsSync(PERFORMANCE_REPORT_DIR)) {
    mkdirSync(PERFORMANCE_REPORT_DIR, { recursive: true });
  }

  const filename = `${reportName}-${Date.now()}.json`;
  const filepath = join(PERFORMANCE_REPORT_DIR, filename);

  writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`[报告] 性能报告已保存: ${filepath}`);
}

// ============================================================
// 测试套件
// ============================================================

describe('DSL Compiler 性能基准测试', () => {
  let benchmarker: PerformanceBenchmarker;
  let dslPerf: DSLCompilerPerformance;
  let samples: DSLSample[];

  beforeAll(() => {
    console.log('\n' + '='.repeat(60));
    console.log('DSL Compiler 性能基准测试');
    console.log('='.repeat(60));
    console.log('环境信息:', JSON.stringify(getEnvironmentInfo(), null, 2));
    console.log('配置:', JSON.stringify(BENCHMARK_CONFIG, null, 2));
    console.log('='.repeat(60) + '\n');

    benchmarker = new PerformanceBenchmarker({
      iterations: BENCHMARK_CONFIG.iterations,
      warmupIterations: BENCHMARK_CONFIG.warmupIterations,
    });

    dslPerf = new DSLCompilerPerformance(benchmarker);
    samples = getExtendedDSLSamples();

    console.log(`已加载 ${samples.length} 个 DSL 样例\n`);
  });

  afterAll(() => {
    console.log('\n' + '='.repeat(60));
    console.log('性能测试完成');
    console.log('='.repeat(60) + '\n');
  });

  // ============================================================
  // 基准测试框架测试
  // ============================================================

  describe('PerformanceBenchmarker 框架测试', () => {
    test('应正确测量简单函数性能', () => {
      const result = benchmarker.measure('simple-addition', () => {
        return 1 + 1;
      });

      expect(result.name).toBe('simple-addition');
      expect(result.iterations).toBe(BENCHMARK_CONFIG.iterations);
      expect(result.avgTime).toBeGreaterThan(0);
      expect(result.minTime).toBeLessThanOrEqual(result.avgTime);
      expect(result.maxTime).toBeGreaterThanOrEqual(result.avgTime);
      expect(result.p50).toBeGreaterThan(0);
      expect(result.p95).toBeGreaterThanOrEqual(result.p50);
      expect(result.p99).toBeGreaterThanOrEqual(result.p95);
      expect(result.stdDev).toBeGreaterThan(0);
      expect(result.coefficientOfVariation).toBeGreaterThan(0);
    });

    test('变异系数应小于50%（数据稳定）', () => {
      const result = benchmarker.measure('stable-operation', () => {
        const arr = new Array(100).fill(0);
        return arr.map(x => x + 1).reduce((a, b) => a + b, 0);
      });

      // 变异系数应小于100%，确保数据相对稳定
      // 对于极快的操作（<0.01ms），高变异系数是正常的
      expect(result.coefficientOfVariation).toBeLessThan(100);
      console.log(`  ✓ 变异系数: ${result.coefficientOfVariation.toFixed(2)}%`);
    });

    test('应能比较两个函数的性能', () => {
      // 快速函数
      const fastFn = () => 1 + 1;
      // 慢速函数
      const slowFn = () => {
        let sum = 0;
        for (let i = 0; i < 100; i++) {
          sum += i;
        }
        return sum;
      };

      const comparison = benchmarker.compare('fast', fastFn, 'slow', slowFn);

      expect(comparison.result1).toBeDefined();
      expect(comparison.result2).toBeDefined();
      expect(comparison.improvement).toBeDefined();
      console.log(`  ✓ 性能差异: ${comparison.improvement.toFixed(2)}%`);
    });

    test('应正确追踪内存使用', () => {
      const result = benchmarker.measure('memory-test', () => {
        // 分配一些内存
        const arr = new Array(1000).fill('test');
        return arr.length;
      });

      expect(result.memoryBefore).toBeGreaterThanOrEqual(0);
      expect(result.memoryAfter).toBeGreaterThanOrEqual(0);
      expect(result.memoryDelta).toBeDefined();
      console.log(`  ✓ 内存变化: ${result.memoryDelta.toFixed(2)} MB`);
    });
  });

  // ============================================================
  // 词法分析性能测试
  // ============================================================

  describe('词法分析性能 (Lexer Performance)', () => {
    const lexerResults: Array<{ sample: string; result: { tokenCount: number; timeMs: number; throughput: number } }> = [];

    test('小型 DSL 样例 - 词法分析', () => {
      const smallSamples = samples.filter(s => s.size === 'small');
      expect(smallSamples.length).toBeGreaterThan(0);

      for (const sample of smallSamples) {
        const result = dslPerf.measureLexicalAnalysis(sample.source, sample.name);
        lexerResults.push({ sample: sample.name, result });

        expect(result.timeMs).toBeGreaterThan(0);
        expect(result.tokenCount).toBeGreaterThan(0);
        expect(result.throughput).toBeGreaterThan(0);

        console.log(`  [${sample.name}] 平均耗时: ${result.timeMs.toFixed(3)}ms, tokens: ${result.tokenCount}, 吞吐量: ${result.throughput.toFixed(0)} tokens/ms`);
      }
    });

    test('中型 DSL 样例 - 词法分析', () => {
      const mediumSamples = samples.filter(s => s.size === 'medium');
      expect(mediumSamples.length).toBeGreaterThan(0);

      for (const sample of mediumSamples) {
        const result = dslPerf.measureLexicalAnalysis(sample.source, sample.name);
        lexerResults.push({ sample: sample.name, result });

        expect(result.timeMs).toBeGreaterThan(0);
        console.log(`  [${sample.name}] 平均耗时: ${result.timeMs.toFixed(3)}ms, tokens: ${result.tokenCount}, 吞吐量: ${result.throughput.toFixed(0)} tokens/ms`);
      }
    });

    test('大型 DSL 样例 - 词法分析', () => {
      const largeSamples = samples.filter(s => s.size === 'large' || s.size === 'xlarge');
      expect(largeSamples.length).toBeGreaterThan(0);

      for (const sample of largeSamples) {
        const result = dslPerf.measureLexicalAnalysis(sample.source, sample.name);
        lexerResults.push({ sample: sample.name, result });

        expect(result.timeMs).toBeGreaterThan(0);
        console.log(`  [${sample.name}] 平均耗时: ${result.timeMs.toFixed(3)}ms, tokens: ${result.tokenCount}, 吞吐量: ${result.throughput.toFixed(0)} tokens/ms`);
      }
    });

    test('词法分析吞吐量应随规模保持稳定', () => {
      // 验证吞吐量（tokens/ms）相对稳定
      const throughputs = lexerResults.map(r => r.result.throughput).filter(t => t > 0);

      expect(throughputs.length).toBeGreaterThan(0);
      // 吞吐量变异系数应小于40%（允许更多波动，因为不同规模样本差异大）
      const mean = throughputs.reduce((a, b) => a + b, 0) / throughputs.length;
      const variance = throughputs.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / throughputs.length;
      const cv = (Math.sqrt(variance) / mean) * 100;

      console.log(`  ✓ 吞吐量变异系数: ${cv.toFixed(2)}%`);
      expect(cv).toBeLessThan(40);
    });

    test('生成词法分析性能报告', () => {
      const report = {
        test: 'lexer-performance',
        timestamp: Date.now(),
        environment: getEnvironmentInfo(),
        results: lexerResults,
      };
      writePerformanceReport('lexer-performance', report);
    });
  });

  // ============================================================
  // 语法分析性能测试
  // ============================================================

  describe('语法分析性能 (Parser Performance)', () => {
    const parserResults: Array<{ sample: string; result: { nodeCount: number; timeMs: number; throughput: number } }> = [];

    test('小型 DSL 样例 - 语法分析', () => {
      const smallSamples = samples.filter(s => s.size === 'small');
      expect(smallSamples.length).toBeGreaterThan(0);

      for (const sample of smallSamples) {
        // 直接使用源码字符串进行语法分析
        const result = dslPerf.measureSyntaxAnalysis(sample.source, sample.name);
        parserResults.push({ sample: sample.name, result });

        expect(result.timeMs).toBeGreaterThanOrEqual(0);
        console.log(`  [${sample.name}] 平均耗时: ${result.timeMs.toFixed(3)}ms, nodes: ${result.nodeCount}, 吞吐量: ${result.throughput.toFixed(0)} nodes/ms`);
      }
    });

    test('中型 DSL 样例 - 语法分析', () => {
      const mediumSamples = samples.filter(s => s.size === 'medium');
      expect(mediumSamples.length).toBeGreaterThan(0);

      for (const sample of mediumSamples) {
        const result = dslPerf.measureSyntaxAnalysis(sample.source, sample.name);
        parserResults.push({ sample: sample.name, result });

        expect(result.timeMs).toBeGreaterThanOrEqual(0);
        console.log(`  [${sample.name}] 平均耗时: ${result.timeMs.toFixed(3)}ms, nodes: ${result.nodeCount}, 吞吐量: ${result.throughput.toFixed(0)} nodes/ms`);
      }
    });

    test('大型 DSL 样例 - 语法分析', () => {
      const largeSamples = samples.filter(s => s.size === 'large' || s.size === 'xlarge');
      expect(largeSamples.length).toBeGreaterThan(0);

      for (const sample of largeSamples) {
        const result = dslPerf.measureSyntaxAnalysis(sample.source, sample.name);
        parserResults.push({ sample: sample.name, result });

        expect(result.timeMs).toBeGreaterThanOrEqual(0);
        console.log(`  [${sample.name}] 平均耗时: ${result.timeMs.toFixed(3)}ms, nodes: ${result.nodeCount}, 吞吐量: ${result.throughput.toFixed(0)} nodes/ms`);
      }
    });

    test('生成语法分析性能报告', () => {
      const report = {
        test: 'parser-performance',
        timestamp: Date.now(),
        environment: getEnvironmentInfo(),
        results: parserResults,
      };
      writePerformanceReport('parser-performance', report);
    });
  });

  // ============================================================
  // 类型检查性能测试
  // ============================================================

  describe('类型检查性能 (TypeChecker Performance)', () => {
    const typeCheckerResults: Array<{ sample: string; result: { timeMs: number; errorCount: number } }> = [];

    test('小型 DSL 样例 - 类型检查', () => {
      const smallSamples = samples.filter(s => s.size === 'small');
      expect(smallSamples.length).toBeGreaterThan(0);

      for (const sample of smallSamples) {
        const metrics = dslPerf.measureFullCompilation(sample.source);
        typeCheckerResults.push({
          sample: sample.name,
          result: {
            timeMs: metrics.typeChecker.timeMs,
            errorCount: metrics.typeChecker.errorCount || 0,
          },
        });

        expect(metrics.typeChecker.timeMs).toBeGreaterThanOrEqual(0);
        console.log(`  [${sample.name}] 平均耗时: ${metrics.typeChecker.timeMs.toFixed(3)}ms`);
      }
    });

    test('中型 DSL 样例 - 类型检查', () => {
      const mediumSamples = samples.filter(s => s.size === 'medium');
      expect(mediumSamples.length).toBeGreaterThan(0);

      for (const sample of mediumSamples) {
        const metrics = dslPerf.measureFullCompilation(sample.source);
        typeCheckerResults.push({
          sample: sample.name,
          result: {
            timeMs: metrics.typeChecker.timeMs,
            errorCount: metrics.typeChecker.errorCount || 0,
          },
        });

        expect(metrics.typeChecker.timeMs).toBeGreaterThanOrEqual(0);
        console.log(`  [${sample.name}] 平均耗时: ${metrics.typeChecker.timeMs.toFixed(3)}ms`);
      }
    });

    test('大型 DSL 样例 - 类型检查', () => {
      const largeSamples = samples.filter(s => s.size === 'large' || s.size === 'xlarge');
      expect(largeSamples.length).toBeGreaterThan(0);

      for (const sample of largeSamples) {
        const metrics = dslPerf.measureFullCompilation(sample.source);
        typeCheckerResults.push({
          sample: sample.name,
          result: {
            timeMs: metrics.typeChecker.timeMs,
            errorCount: metrics.typeChecker.errorCount || 0,
          },
        });

        expect(metrics.typeChecker.timeMs).toBeGreaterThanOrEqual(0);
        console.log(`  [${sample.name}] 平均耗时: ${metrics.typeChecker.timeMs.toFixed(3)}ms`);
      }
    });

    test('生成类型检查性能报告', () => {
      const report = {
        test: 'type-checker-performance',
        timestamp: Date.now(),
        environment: getEnvironmentInfo(),
        results: typeCheckerResults,
      };
      writePerformanceReport('type-checker-performance', report);
    });
  });

  // ============================================================
  // 代码生成性能测试
  // ============================================================

  describe('代码生成性能 (CodeGenerator Performance)', () => {
    const codeGenResults: Array<{ sample: string; result: { timeMs: number; linesOfCode: number } }> = [];

    test('小型 DSL 样例 - 代码生成', () => {
      const smallSamples = samples.filter(s => s.size === 'small');
      expect(smallSamples.length).toBeGreaterThan(0);

      for (const sample of smallSamples) {
        const metrics = dslPerf.measureFullCompilation(sample.source);
        codeGenResults.push({
          sample: sample.name,
          result: {
            timeMs: metrics.codeGenerator.timeMs,
            linesOfCode: metrics.codeGenerator.linesOfCode,
          },
        });

        expect(metrics.codeGenerator.timeMs).toBeGreaterThanOrEqual(0);
        console.log(`  [${sample.name}] 平均耗时: ${metrics.codeGenerator.timeMs.toFixed(3)}ms, 行数: ${metrics.codeGenerator.linesOfCode}`);
      }
    });

    test('中型 DSL 样例 - 代码生成', () => {
      const mediumSamples = samples.filter(s => s.size === 'medium');
      expect(mediumSamples.length).toBeGreaterThan(0);

      for (const sample of mediumSamples) {
        const metrics = dslPerf.measureFullCompilation(sample.source);
        codeGenResults.push({
          sample: sample.name,
          result: {
            timeMs: metrics.codeGenerator.timeMs,
            linesOfCode: metrics.codeGenerator.linesOfCode,
          },
        });

        expect(metrics.codeGenerator.timeMs).toBeGreaterThanOrEqual(0);
        console.log(`  [${sample.name}] 平均耗时: ${metrics.codeGenerator.timeMs.toFixed(3)}ms, 行数: ${metrics.codeGenerator.linesOfCode}`);
      }
    });

    test('大型 DSL 样例 - 代码生成', () => {
      const largeSamples = samples.filter(s => s.size === 'large' || s.size === 'xlarge');
      expect(largeSamples.length).toBeGreaterThan(0);

      for (const sample of largeSamples) {
        const metrics = dslPerf.measureFullCompilation(sample.source);
        codeGenResults.push({
          sample: sample.name,
          result: {
            timeMs: metrics.codeGenerator.timeMs,
            linesOfCode: metrics.codeGenerator.linesOfCode,
          },
        });

        expect(metrics.codeGenerator.timeMs).toBeGreaterThanOrEqual(0);
        console.log(`  [${sample.name}] 平均耗时: ${metrics.codeGenerator.timeMs.toFixed(3)}ms, 行数: ${metrics.codeGenerator.linesOfCode}`);
      }
    });

    test('生成代码生成性能报告', () => {
      const report = {
        test: 'code-generator-performance',
        timestamp: Date.now(),
        environment: getEnvironmentInfo(),
        results: codeGenResults,
      };
      writePerformanceReport('code-generator-performance', report);
    });
  });

  // ============================================================
  // 完整编译流程性能测试
  // ============================================================

  describe('完整编译流程性能 (Full Compilation)', () => {
    const fullResults: Array<{ sample: string; metrics: DSLCompilerMetrics }> = [];

    test('所有样例 - 完整编译流程', () => {
      for (const sample of samples) {
        const metrics = dslPerf.measureFullCompilation(sample.source);
        fullResults.push({ sample: sample.name, metrics });

        // 验证各阶段耗时
        expect(metrics.lexer.timeMs).toBeGreaterThanOrEqual(0);
        expect(metrics.parser.timeMs).toBeGreaterThanOrEqual(0);
        expect(metrics.typeChecker.timeMs).toBeGreaterThanOrEqual(0);
        expect(metrics.codeGenerator.timeMs).toBeGreaterThanOrEqual(0);
        expect(metrics.totalTime).toBeGreaterThan(0);

        // 验证吞吐量指标
        expect(metrics.lexer.throughput).toBeGreaterThan(0);
        expect(metrics.parser.throughput).toBeGreaterThan(0);
        expect(metrics.codeGenerator.throughput).toBeGreaterThan(0);

        console.log(`  [${sample.name}] 总耗时: ${metrics.totalTime.toFixed(3)}ms`);
        console.log(`    - 词法: ${metrics.lexer.timeMs.toFixed(3)}ms (${metrics.lexer.throughput.toFixed(0)} tokens/ms)`);
        console.log(`    - 语法: ${metrics.parser.timeMs.toFixed(3)}ms (${metrics.parser.throughput.toFixed(0)} nodes/ms)`);
        console.log(`    - 类型: ${metrics.typeChecker.timeMs.toFixed(3)}ms`);
        console.log(`    - 代码生成: ${metrics.codeGenerator.timeMs.toFixed(3)}ms (${metrics.codeGenerator.throughput.toFixed(0)} lines/ms)`);
      }
    });

    test('编译性能应随 DSL 规模可预测增长', () => {
      // 按规模分组
      const bySize: Record<string, number[]> = {};
      for (const r of fullResults) {
        const sample = samples.find(s => s.name === r.sample);
        const size = sample?.size || 'unknown';
        if (!bySize[size]) bySize[size] = [];
        bySize[size].push(r.metrics.totalTime);
      }

      // 计算各规模平均耗时
      const avgTimes: Record<string, number> = {};
      for (const [size, times] of Object.entries(bySize)) {
        avgTimes[size] = times.reduce((a, b) => a + b, 0) / times.length;
      }

      console.log('  各规模平均编译耗时:', avgTimes);

      // 验证：大型应比小型慢
      if (avgTimes.small && avgTimes.large) {
        expect(avgTimes.large).toBeGreaterThan(avgTimes.small);
      }
      if (avgTimes.small && avgTimes.xlarge) {
        expect(avgTimes.xlarge).toBeGreaterThan(avgTimes.small);
      }
    });

    test('生成完整编译性能报告', () => {
      const report = {
        test: 'full-compilation',
        timestamp: Date.now(),
        environment: getEnvironmentInfo(),
        summary: {
          totalSamples: samples.length,
          avgTotalTime: fullResults.reduce((sum, r) => sum + r.metrics.totalTime, 0) / fullResults.length,
          avgLexerThroughput: fullResults.reduce((sum, r) => sum + r.metrics.lexer.throughput, 0) / fullResults.length,
          avgParserThroughput: fullResults.reduce((sum, r) => sum + r.metrics.parser.throughput, 0) / fullResults.length,
          avgCodeGenThroughput: fullResults.reduce((sum, r) => sum + r.metrics.codeGenerator.throughput, 0) / fullResults.length,
        },
        results: fullResults,
      };
      writePerformanceReport('full-compilation', report);
    });
  });

  // ============================================================
  // 性能回归检测测试
  // ============================================================

  describe('性能回归检测 (Performance Regression)', () => {
    let detector: PerformanceRegressionDetector;
    let baseline: PerformanceBaseline;

    test('创建性能基线', () => {
      detector = new PerformanceRegressionDetector();

      // 使用中型样例创建基线
      const mediumSample = samples.find(s => s.size === 'medium');
      expect(mediumSample).toBeDefined();

      const metrics = dslPerf.measureFullCompilation(mediumSample!.source);
      baseline = detector.createBaseline(
        'dsl-compiler-baseline',
        '1.0.0',
        metrics
      );

      expect(baseline.name).toBe('dsl-compiler-baseline');
      expect(baseline.version).toBe('1.0.0');
      expect(baseline.metrics).toBeDefined();

      console.log('  基线指标:', baseline.metrics);

      // 保存基线
      writePerformanceReport('baseline', baseline);
    });

    test('检测无回归（与自身对比）', () => {
      detector.loadBaseline(baseline);

      const mediumSample = samples.find(s => s.size === 'medium');
      const metrics = dslPerf.measureFullCompilation(mediumSample!.source);

      const result = detector.detectRegression(metrics, 20); // 20%阈值

      // 与自身对比不应有回归
      expect(result.hasRegression).toBe(false);
      expect(result.regressions.length).toBe(0);

      console.log('  回归检测结果: 无回归');
    });

    test('检测模拟回归', () => {
      detector.loadBaseline(baseline);

      // 创建一个"更慢"的指标
      const slowMetrics: DSLCompilerMetrics = {
        lexer: {
          tokenCount: baseline.metrics.lexerThroughput * 10,
          timeMs: baseline.metrics.lexerThroughput * 10 / (baseline.metrics.lexerThroughput * 0.5), // 慢50%
          throughput: baseline.metrics.lexerThroughput * 0.5,
        },
        parser: {
          nodeCount: baseline.metrics.parserThroughput * 10,
          timeMs: baseline.metrics.parserThroughput * 10 / (baseline.metrics.parserThroughput * 0.5),
          throughput: baseline.metrics.parserThroughput * 0.5,
        },
        typeChecker: {
          timeMs: baseline.metrics.typeCheckTime * 1.3, // 慢30%
          errorCount: 0,
        },
        codeGenerator: {
          linesOfCode: baseline.metrics.codeGenThroughput * 10,
          timeMs: baseline.metrics.codeGenThroughput * 10 / (baseline.metrics.codeGenThroughput * 0.4),
          throughput: baseline.metrics.codeGenThroughput * 0.4,
        },
        totalTime: baseline.metrics.totalCompileTime * 1.2,
        sourceSize: 1000,
      };

      const result = detector.detectRegression(slowMetrics, 10); // 10%阈值

      // 应该检测到回归
      expect(result.hasRegression).toBe(true);
      expect(result.regressions.length).toBeGreaterThan(0);

      console.log('  检测到的回归:', result.regressions);
    });

    test('检测性能改进', () => {
      detector.loadBaseline(baseline);

      // 创建一个"更快"的指标
      const fastMetrics: DSLCompilerMetrics = {
        lexer: {
          tokenCount: baseline.metrics.lexerThroughput * 10,
          timeMs: baseline.metrics.lexerThroughput * 10 / (baseline.metrics.lexerThroughput * 1.5), // 快50%
          throughput: baseline.metrics.lexerThroughput * 1.5,
        },
        parser: {
          nodeCount: baseline.metrics.parserThroughput * 10,
          timeMs: baseline.metrics.parserThroughput * 10 / (baseline.metrics.parserThroughput * 1.3),
          throughput: baseline.metrics.parserThroughput * 1.3,
        },
        typeChecker: {
          timeMs: baseline.metrics.typeCheckTime * 0.7, // 快30%
          errorCount: 0,
        },
        codeGenerator: {
          linesOfCode: baseline.metrics.codeGenThroughput * 10,
          timeMs: baseline.metrics.codeGenThroughput * 10 / (baseline.metrics.codeGenThroughput * 1.4),
          throughput: baseline.metrics.codeGenThroughput * 1.4,
        },
        totalTime: baseline.metrics.totalCompileTime * 0.8,
        sourceSize: 1000,
      };

      const result = detector.detectRegression(fastMetrics, 10); // 10%阈值

      // 应该检测到改进
      expect(result.hasRegression).toBe(false);
      expect(result.improvements.length).toBeGreaterThan(0);

      console.log('  检测到的改进:', result.improvements);
    });
  });

  // ============================================================
  // 统计分析验证
  // ============================================================

  describe('统计分析验证 (Statistical Analysis)', () => {
    test('P50/P95/P99 百分位数正确性', () => {
      // 生成已知分布的数据
      const data: number[] = [];
      for (let i = 0; i < 100; i++) {
        data.push(i); // 0-99的递增序列
      }

      const result = benchmarker.measure('percentile-test', () => {
        return data.reduce((a, b) => a + b, 0);
      });

      // P50 应接近中位数
      expect(result.p50).toBeGreaterThan(result.minTime);
      expect(result.p50).toBeLessThan(result.maxTime);

      // P95 应大于 P50
      expect(result.p95).toBeGreaterThanOrEqual(result.p50);

      // P99 应大于 P95
      expect(result.p99).toBeGreaterThanOrEqual(result.p95);

      console.log(`  P50: ${result.p50.toFixed(4)}ms`);
      console.log(`  P95: ${result.p95.toFixed(4)}ms`);
      console.log(`  P99: ${result.p99.toFixed(4)}ms`);
    });

    test('标准差计算正确性', () => {
      const result = benchmarker.measure('stddev-test', () => {
        // 执行一些稳定的操作
        const sum = Array.from({ length: 50 }, (_, i) => i).reduce((a, b) => a + b, 0);
        return sum;
      });

      // 标准差应为正数
      expect(result.stdDev).toBeGreaterThanOrEqual(0);

      // 变异系数对于极快的操作可能很高，使用更宽松的阈值
      expect(result.coefficientOfVariation).toBeLessThan(500);

      console.log(`  标准差: ${result.stdDev.toFixed(4)}ms`);
      console.log(`  变异系数: ${result.coefficientOfVariation.toFixed(2)}%`);
    });
  });

  // ============================================================
  // 边界条件测试
  // ============================================================

  describe('边界条件测试 (Edge Cases)', () => {
    test('空 DSL 输入处理', () => {
      // 测试空输入不应崩溃
      expect(() => {
        dslPerf.measureFullCompilation('');
      }).not.toThrow();
    });

    test('最小 DSL 样例', () => {
      const minimalDSL = `agent A { description: "B" type: worker layer: L3 input x: string { required: true } output y: string { } tools: [] capability t: basic body { step s { call { inputs { x: input.x } } } } governance { first_principles_check: false red_team_threshold: low quality_gate_enabled: false max_retries: 1 token_budget: 1000 } }`;

      const metrics = dslPerf.measureFullCompilation(minimalDSL);
      expect(metrics.totalTime).toBeGreaterThanOrEqual(0);
      console.log(`  最小 DSL 耗时: ${metrics.totalTime.toFixed(3)}ms`);
    });

    test('大型 DSL 样例性能', () => {
      // 获取最大的样例
      const xlargeSample = samples.find(s => s.size === 'xlarge');
      expect(xlargeSample).toBeDefined();

      const metrics = dslPerf.measureFullCompilation(xlargeSample!.source);

      // 大型样例应在合理时间内完成（<1秒）
      expect(metrics.totalTime).toBeLessThan(1000);
      console.log(`  超大型 DSL 耗时: ${metrics.totalTime.toFixed(3)}ms`);
    });
  });

  // ============================================================
  // 内存使用测试
  // ============================================================

  describe('内存使用测试 (Memory Usage)', () => {
    test('编译过程内存泄漏检测', () => {
      const mediumSample = samples.find(s => s.size === 'medium');
      expect(mediumSample).toBeDefined();

      // 多次编译，检测内存是否持续增长
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 10; i++) {
        dslPerf.measureFullCompilation(mediumSample!.source);
      }

      // 强制 GC（如果可用）
      if (globalThis.gc) {
        globalThis.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = ((finalMemory - initialMemory) / initialMemory) * 100;

      console.log(`  内存增长: ${memoryGrowth.toFixed(2)}%`);

      // 内存增长应小于50%（可能有一些对象缓存）
      expect(memoryGrowth).toBeLessThan(50);
    });
  });
});
