/**
 * Honeycomb v2 - 基准测试工具函数
 *
 * 提供统计计算、时间测量、报告生成等工具函数
 */

import type { StatsMetrics, BenchmarkReport, EnvironmentInfo } from './types.js';
import { randomUUID } from 'node:crypto';

// ============================================================
// 时间测量工具
// ============================================================

/**
 * 测量同步函数执行时间
 */
export function measureTime<T>(fn: () => T): { result: T; durationMs: number } {
  const start = performance.now();
  const result = fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/**
 * 测量异步函数执行时间
 */
export async function measureTimeAsync<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/**
 * 执行函数多次并收集时间样本
 */
export function collectSamples<T>(
  fn: () => T,
  samples: number,
): { results: T[]; durationsMs: number[] } {
  const results: T[] = [];
  const durationsMs: number[] = [];

  // 预热运行（不计入统计）
  for (let i = 0; i < Math.min(5, Math.floor(samples / 10)); i++) {
    fn();
  }

  // 正式测量
  for (let i = 0; i < samples; i++) {
    const { result, durationMs } = measureTime(fn);
    results.push(result);
    durationsMs.push(durationMs);
  }

  return { results, durationsMs };
}

/**
 * 执行异步函数多次并收集时间样本
 */
export async function collectSamplesAsync<T>(
  fn: () => Promise<T>,
  samples: number,
): Promise<{ results: T[]; durationsMs: number[] }> {
  const results: T[] = [];
  const durationsMs: number[] = [];

  // 预热运行
  for (let i = 0; i < Math.min(5, Math.floor(samples / 10)); i++) {
    await fn();
  }

  // 正式测量
  for (let i = 0; i < samples; i++) {
    const { result, durationMs } = await measureTimeAsync(fn);
    results.push(result);
    durationsMs.push(durationMs);
  }

  return { results, durationsMs };
}

// ============================================================
// 统计计算工具
// ============================================================

/**
 * 计算数组的统计指标
 */
export function calculateStats(values: number[]): StatsMetrics {
  if (values.length === 0) {
    return {
      min: 0,
      max: 0,
      avg: 0,
      median: 0,
      p95: 0,
      p99: 0,
      samples: 0,
      stdDev: 0,
    };
  }

  // 排序用于计算百分位数
  const sorted = [...values].sort((a, b) => a - b);

  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;

  // 中位数
  const median = percentile(sorted, 50);

  // 百分位数
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);

  // 标准差
  const variance = sorted.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / sorted.length;
  const stdDev = Math.sqrt(variance);

  return {
    min,
    max,
    avg,
    median,
    p95,
    p99,
    samples: sorted.length,
    stdDev,
  };
}

/**
 * 计算百分位数
 */
function percentile(sorted: number[], p: number): number {
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (upper >= sorted.length) {
    return sorted[sorted.length - 1];
  }

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

// ============================================================
// 环境信息收集
// ============================================================

/**
 * 获取环境信息
 */
export function getEnvironmentInfo(): EnvironmentInfo {
  const memStats = process.memoryUsage();
  const cpus = require('node:os').cpus();

  return {
    nodeVersion: process.version,
    bunVersion: getBunVersion(),
    platform: process.platform,
    arch: process.arch,
    cpuCores: cpus?.length ?? navigator.hardwareConcurrency ?? 4,
    totalMemoryMB: Math.round(memStats.heapTotal / 1024 / 1024),
    timestamp: new Date().toISOString(),
  };
}

/**
 * 尝试获取 Bun 版本
 */
function getBunVersion(): string | undefined {
  try {
    // @ts-ignore - Bun 全局变量
    if (typeof Bun !== 'undefined') {
      // @ts-ignore
      return Bun.version;
    }
  } catch {
    // 忽略
  }
  return undefined;
}

/**
 * 获取当前内存使用（MB）
 */
export function getMemoryUsageMB(): {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
} {
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed / 1024 / 1024,
    heapTotal: usage.heapTotal / 1024 / 1024,
    rss: usage.rss / 1024 / 1024,
    external: usage.external / 1024 / 1024,
  };
}

// ============================================================
// 报告生成工具
// ============================================================

/**
 * 生成 Markdown 格式的基准测试报告
 */
export function generateMarkdownReport(report: BenchmarkReport): string {
  const lines: string[] = [];

  // 标题
  lines.push('# Honeycomb 性能基准测试报告');
  lines.push('');
  lines.push(`**报告 ID**: ${report.reportId}`);
  lines.push(`**时间**: ${report.environment.timestamp}`);
  lines.push('');

  // 环境信息
  lines.push('## 环境信息');
  lines.push('');
  lines.push('| 项目 | 值 |');
  lines.push('|------|-----|');
  lines.push(`| Node 版本 | ${report.environment.nodeVersion} |`);
  if (report.environment.bunVersion) {
    lines.push(`| Bun 版本 | ${report.environment.bunVersion} |`);
  }
  lines.push(`| 平台 | ${report.environment.platform} (${report.environment.arch}) |`);
  lines.push(`| CPU 核心数 | ${report.environment.cpuCores} |`);
  lines.push(`| 总内存 | ${report.environment.totalMemoryMB} MB |`);
  lines.push('');

  // 总体摘要
  lines.push('## 总体摘要');
  lines.push('');
  lines.push(`- **总测试数**: ${report.summary.totalTests}`);
  lines.push(`- **通过**: ${report.summary.passedTests}`);
  lines.push(`- **失败**: ${report.summary.failedTests}`);
  lines.push(`- **总耗时**: ${report.summary.totalDurationMs.toFixed(2)} ms`);
  lines.push('');

  // Agent 执行测试
  if (report.agentExecution.length > 0) {
    lines.push('## Agent 执行性能');
    lines.push('');
    lines.push('| 测试 | 平均值 | 中位数 | P95 | P99 | 样本数 | 状态 |');
    lines.push('|------|--------|--------|-----|-----|--------|------|');

    for (const result of report.agentExecution) {
      const status = result.passed ? '通过' : '失败';
      lines.push(
        `| ${result.name} | ${result.stats.avg.toFixed(3)} ms | ${result.stats.median.toFixed(3)} ms | ` +
          `${result.stats.p95.toFixed(3)} ms | ${result.stats.p99.toFixed(3)} ms | ${result.stats.samples} | ${status} |`
      );
    }
    lines.push('');
  }

  // 消息总线测试
  if (report.messageBus.length > 0) {
    lines.push('## 消息总线性能');
    lines.push('');
    lines.push('| 测试 | 平均值 | 吞吐量 | 消息数 | 状态 |');
    lines.push('|------|--------|--------|--------|------|');

    for (const result of report.messageBus) {
      const status = result.passed ? '通过' : '失败';
      const throughput = result.throughput ? `${result.throughput.opsPerSecond.toFixed(0)} msg/s` : 'N/A';
      lines.push(
        `| ${result.name} | ${result.stats.avg.toFixed(3)} ms | ${throughput} | ${result.messageCount} | ${status} |`
      );
    }
    lines.push('');
  }

  // 检查点测试
  if (report.checkpoint.length > 0) {
    lines.push('## 检查点性能');
    lines.push('');
    lines.push('| 测试 | 平均值 | P95 | P99 | 检查点数 | 状态 |');
    lines.push('|------|--------|-----|-----|----------|------|');

    for (const result of report.checkpoint) {
      const status = result.passed ? '通过' : '失败';
      lines.push(
        `| ${result.name} | ${result.stats.avg.toFixed(3)} ms | ${result.stats.p95.toFixed(3)} ms | ` +
          `${result.stats.p99.toFixed(3)} ms | ${result.checkpointCount} | ${status} |`
      );
    }
    lines.push('');
  }

  // 状态机测试
  if (report.stateMachine.length > 0) {
    lines.push('## 状态机性能');
    lines.push('');
    lines.push('| 测试 | 平均值 | P95 | 转换数 | 状态 |');
    lines.push('|------|--------|-----|--------|------|');

    for (const result of report.stateMachine) {
      const status = result.passed ? '通过' : '失败';
      lines.push(
        `| ${result.name} | ${result.stats.avg.toFixed(4)} ms | ${result.stats.p95.toFixed(4)} ms | ` +
          `${result.transitionCount} | ${status} |`
      );
    }
    lines.push('');
  }

  // 失败测试详情
  const allResults = [
    ...report.agentExecution,
    ...report.messageBus,
    ...report.checkpoint,
    ...report.stateMachine,
  ];
  const failed = allResults.filter((r) => !r.passed);

  if (failed.length > 0) {
    lines.push('## 失败测试详情');
    lines.push('');

    for (const result of failed) {
      lines.push(`### ${result.name}`);
      lines.push('');
      lines.push(`**原因**: ${result.error || '未知错误'}`);
      if (result.threshold !== undefined) {
        lines.push(`**阈值**: ${result.threshold} ms`);
        lines.push(`**实际**: ${result.stats.avg.toFixed(3)} ms`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * 生成报告文件名
 */
export function generateReportFilename(extension: 'json' | 'md'): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  return `benchmark-${timestamp}-${time}.${extension}`;
}

/**
 * 生成报告 ID
 */
export function generateReportId(): string {
  return `bench-${Date.now()}-${randomUUID().slice(0, 8)}`;
}
