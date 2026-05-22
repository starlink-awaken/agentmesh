/**
 * Honeycomb v2 - 基准测试运行器
 *
 * 负责执行所有基准测试、收集结果并生成报告
 *
 * 使用方式：
 *   node dist/benchmarks/runner.js
 *   bun run src/benchmarks/runner.ts
 */

import { runAllAgentBenchmarks } from './simulated/agent-execution.js';
import { runAllMessageBusBenchmarks } from './simulated/message-bus.js';
import { runAllCheckpointBenchmarks } from './simulated/checkpoint.js';
import { runAllStateMachineBenchmarks } from './simulated/state-machine.js';
import {
  getEnvironmentInfo,
  generateMarkdownReport,
  generateReportFilename,
  generateReportId,
  getMemoryUsageMB,
} from './utils.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { BenchmarkReport, BenchmarkConfig } from './types.js';

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_CONFIG: BenchmarkConfig = {
  verbose: true,
  outputDir: './src/benchmarks',
  generateMarkdown: true,
  generateJSON: true,
};

// ============================================================
// BenchmarkRunner 类
// ============================================================

export class BenchmarkRunner {
  private config: BenchmarkConfig;
  private startTime: number = 0;

  constructor(config: Partial<BenchmarkConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 运行所有基准测试
   */
  async runAll(): Promise<BenchmarkReport> {
    this.startTime = performance.now();
    this.log('开始 Honeycomb 性能基准测试...\n');

    // 收集环境信息
    const environment = getEnvironmentInfo();
    this.logEnvironmentInfo(environment);

    const report: BenchmarkReport = {
      reportId: generateReportId(),
      environment,
      agentExecution: [],
      messageBus: [],
      checkpoint: [],
      stateMachine: [],
      summary: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        totalDurationMs: 0,
      },
    };

    // 运行 Agent 执行测试
    try {
      this.log('\n=== Agent 执行测试 ===');
      report.agentExecution = await runAllAgentBenchmarks();
    } catch (error) {
      this.log(`Agent 执行测试失败: ${error}`);
    }

    // 运行消息总线测试
    try {
      this.log('\n=== 消息总线测试 ===');
      report.messageBus = await runAllMessageBusBenchmarks();
    } catch (error) {
      this.log(`消息总线测试失败: ${error}`);
    }

    // 运行检查点测试
    try {
      this.log('\n=== 检查点测试 ===');
      report.checkpoint = await runAllCheckpointBenchmarks();
    } catch (error) {
      this.log(`检查点测试失败: ${error}`);
    }

    // 运行状态机测试
    try {
      this.log('\n=== 状态机测试 ===');
      report.stateMachine = await runAllStateMachineBenchmarks();
    } catch (error) {
      this.log(`状态机测试失败: ${error}`);
    }

    // 计算摘要
    report.summary = this.calculateSummary(report);
    report.summary.totalDurationMs = performance.now() - this.startTime;

    return report;
  }

  /**
   * 运行指定类型的基准测试
   */
  async runType(type: 'agent-execution' | 'message-bus' | 'checkpoint' | 'state-machine'): Promise<BenchmarkReport> {
    this.startTime = performance.now();
    const environment = getEnvironmentInfo();

    const report: BenchmarkReport = {
      reportId: generateReportId(),
      environment,
      agentExecution: [],
      messageBus: [],
      checkpoint: [],
      stateMachine: [],
      summary: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        totalDurationMs: 0,
      },
    };

    switch (type) {
      case 'agent-execution':
        report.agentExecution = await runAllAgentBenchmarks();
        break;
      case 'message-bus':
        report.messageBus = await runAllMessageBusBenchmarks();
        break;
      case 'checkpoint':
        report.checkpoint = await runAllCheckpointBenchmarks();
        break;
      case 'state-machine':
        report.stateMachine = await runAllStateMachineBenchmarks();
        break;
    }

    report.summary = this.calculateSummary(report);
    report.summary.totalDurationMs = performance.now() - this.startTime;

    return report;
  }

  /**
   * 保存报告到文件
   */
  saveReport(report: BenchmarkReport): { jsonPath?: string; mdPath?: string } {
    const paths: { jsonPath?: string; mdPath?: string } = {};

    // 确保输出目录存在
    const resultsDir = join(this.config.outputDir, 'results');
    const reportsDir = join(this.config.outputDir, 'reports');

    if (!existsSync(resultsDir)) {
      mkdirSync(resultsDir, { recursive: true });
    }
    if (!existsSync(reportsDir)) {
      mkdirSync(reportsDir, { recursive: true });
    }

    // 保存 JSON 报告
    if (this.config.generateJSON) {
      const jsonFilename = generateReportFilename('json');
      const jsonPath = join(resultsDir, jsonFilename);
      writeFileSync(jsonPath, JSON.stringify(report, null, 2));
      paths.jsonPath = jsonPath;
      this.log(`\nJSON 报告已保存: ${jsonPath}`);
    }

    // 保存 Markdown 报告
    if (this.config.generateMarkdown) {
      const mdContent = generateMarkdownReport(report);
      const mdFilename = generateReportFilename('md');
      const mdPath = join(reportsDir, mdFilename);
      writeFileSync(mdPath, mdContent);
      paths.mdPath = mdPath;
      this.log(`Markdown 报告已保存: ${mdPath}`);
    }

    return paths;
  }

  /**
   * 计算报告摘要
   */
  private calculateSummary(report: BenchmarkReport): BenchmarkReport['summary'] {
    const allResults = [
      ...report.agentExecution,
      ...report.messageBus,
      ...report.checkpoint,
      ...report.stateMachine,
    ];

    const totalTests = allResults.length;
    const passedTests = allResults.filter((r) => r.passed).length;
    const failedTests = totalTests - passedTests;

    return {
      totalTests,
      passedTests,
      failedTests,
      totalDurationMs: report.summary.totalDurationMs,
    };
  }

  /**
   * 输出日志
   */
  private log(message: string): void {
    if (this.config.verbose) {
      console.log(message);
    }
  }

  /**
   * 输出环境信息
   */
  private logEnvironmentInfo(environment: import('./types.js').EnvironmentInfo): void {
    this.log('环境信息:');
    this.log(`  Node 版本: ${environment.nodeVersion}`);
    if (environment.bunVersion) {
      this.log(`  Bun 版本: ${environment.bunVersion}`);
    }
    this.log(`  平台: ${environment.platform} (${environment.arch})`);
    this.log(`  CPU 核心数: ${environment.cpuCores}`);
    this.log(`  总内存: ${environment.totalMemoryMB} MB`);
    this.log(`  时间: ${environment.timestamp}`);

    const mem = getMemoryUsageMB();
    this.log(`  当前堆使用: ${mem.heapUsed.toFixed(2)} MB`);
  }
}

// ============================================================
// CLI 入口点
// ============================================================

/**
 * 打印使用说明
 */
function printHelp(): void {
  console.log(`
Honeycomb 性能基准测试运行器

使用方式:
  node dist/benchmarks/runner.js [选项]
  bun run src/benchmarks/runner.ts [选项]

选项:
  --type <type>      只运行指定类型的测试
                    可选值: agent-execution, message-bus, checkpoint, state-machine
  --output <dir>     指定输出目录 (默认: ./benchmarks)
  --no-json         不生成 JSON 报告
  --no-md           不生成 Markdown 报告
  --quiet           静默模式
  --help            显示此帮助信息

示例:
  # 运行所有测试
  node dist/benchmarks/runner.js

  # 只运行 Agent 执行测试
  node dist/benchmarks/runner.js --type agent-execution

  # 指定输出目录
  node dist/benchmarks/runner.js --output ./my-benchmarks

  # 静默模式，不生成 Markdown
  node dist/benchmarks/runner.js --quiet --no-md
`);
}

/**
 * 解析命令行参数
 */
function parseArgs(args: string[]): Partial<BenchmarkConfig> & { type?: string } {
  const config: Partial<BenchmarkConfig> = {};
  let type: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;

      case '--type':
        type = args[++i];
        break;

      case '--output':
      case '-o':
        config.outputDir = args[++i];
        break;

      case '--no-json':
        config.generateJSON = false;
        break;

      case '--no-md':
        config.generateMarkdown = false;
        break;

      case '--quiet':
      case '-q':
        config.verbose = false;
        break;

      default:
        if (arg.startsWith('-')) {
          console.error(`未知选项: ${arg}`);
          console.log('使用 --help 查看帮助信息');
          process.exit(1);
        }
    }
  }

  return { ...config, type };
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runner = new BenchmarkRunner(args);

  try {
    let report: import('./types.js').BenchmarkReport;

    if (args.type) {
      // 运行指定类型的测试
      const validTypes = ['agent-execution', 'message-bus', 'checkpoint', 'state-machine'];
      if (!validTypes.includes(args.type)) {
        console.error(`无效的测试类型: ${args.type}`);
        console.log(`有效类型: ${validTypes.join(', ')}`);
        process.exit(1);
      }

      report = await runner.runType(args.type as any);
    } else {
      // 运行所有测试
      report = await runner.runAll();
    }

    // 保存报告
    const paths = runner.saveReport(report);

    // 输出摘要
    console.log('\n=== 测试摘要 ===');
    console.log(`总测试数: ${report.summary.totalTests}`);
    console.log(`通过: ${report.summary.passedTests}`);
    console.log(`失败: ${report.summary.failedTests}`);
    console.log(`总耗时: ${report.summary.totalDurationMs.toFixed(2)} ms`);

    if (report.summary.failedTests > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('基准测试运行失败:', error);
    process.exit(1);
  }
}

// 直接运行时执行主函数
// 检查是否是直接运行此文件（兼容 Node.js 和 Bun）
const isMain = process.argv[1]?.endsWith('/runner.ts') ||
               process.argv[1]?.endsWith('\\runner.ts') ||
               process.argv[1]?.endsWith('/runner.js') ||
               process.argv[1]?.endsWith('\\runner.js');

if (isMain) {
  main();
}
