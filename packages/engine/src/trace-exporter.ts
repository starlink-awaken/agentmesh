/**
 * Trace Exporter - 追踪数据导出器
 *
 * 提供多种格式的追踪数据导出功能：
 * - JSON：用于机器处理和调试
 * - Mermaid：用于文档可视化
 * - Text：用于终端显示
 */

import type {
  TraceContext,
  TraceTreeNode,
  ExportOptions,
} from './trace-types.js';

// ============================================================
// TraceExporter
// ============================================================

/**
 * 追踪数据导出器
 *
 * 将 TraceContext 转换为各种可视化/可读格式
 */
export class TraceExporter {
  /**
   * 导出为 JSON（用于调试和机器处理）
   *
   * @param context - TraceContext
   * @param options - 导出选项
   * @returns JSON 字符串
   */
  exportToJSON(context: TraceContext, options?: ExportOptions): string {
    const spans = context.getSpans();
    let filteredSpans = spans;

    // 应用错误过滤
    if (options?.errorsOnly) {
      filteredSpans = spans.filter((s) => s.status === 'error');
    }

    // 构建 export 数据
    const exportData: Record<string, unknown> = {
      traceId: context.traceId,
      rootSpanId: context.rootSpanId,
      createdAt: context.createdAt,
      metrics: context.getMetrics(),
      spans: filteredSpans.map((span) => {
        const spanData: Record<string, unknown> = {
          spanId: span.spanId,
          operationName: span.operationName,
          startTime: span.startTime,
          endTime: span.endTime,
          duration: span.duration,
          status: span.status,
        };

        if (span.parentSpanId) {
          spanData.parentSpanId = span.parentSpanId;
        }

        if (options?.includeTags && Object.keys(span.tags).length > 0) {
          spanData.tags = span.tags;
        }

        if (span.error) {
          spanData.error = span.error;
        }

        return spanData;
      }),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 导出为 Mermaid 时间线图（用于文档可视化）
   *
   * @param context - TraceContext
   * @param options - 导出选项
   * @returns Mermaid 图表字符串
   */
  exportToMermaid(context: TraceContext, options?: ExportOptions): string {
    const root = context.getRootSpan();
    if (!root) {
      return '%% No root span found\n';
    }

    let mermaid = 'timeline\n';
    mermaid += `    title Trace: ${context.traceId}\n`;

    // 递归添加 span 到时间线
    const addSpanToTimeline = (node: TraceTreeNode, depth: number): void => {
      // 检查深度限制
      if (options?.maxDepth !== undefined && depth > options.maxDepth) {
        return;
      }

      // 检查错误过滤
      if (options?.errorsOnly && node.span.status !== 'error') {
        // 即使不是错误，也需要显示其错误子节点的路径
        const hasErrorDescendant = this.hasErrorDescendant(node);
        if (!hasErrorDescendant) {
          return;
        }
      }

      const span = node.span;
      const indent = '  '.repeat(depth + 1);
      const duration = span.duration ? `${span.duration}ms` : 'running';

      // 状态标识
      let statusIcon = '';
      if (span.status === 'error') {
        statusIcon = ' ❌';
      } else if (span.status === 'success') {
        statusIcon = ' ✅';
      }

      mermaid += `${indent}${span.operationName} : ${duration}${statusIcon}\n`;

      // 递归处理子节点
      for (const child of node.children) {
        addSpanToTimeline(child, depth + 1);
      }
    };

    const tree = context.getTraceTree();
    addSpanToTimeline(tree, 0);

    return mermaid;
  }

  /**
   * 导出为文本格式（用于终端显示）
   *
   * @param context - TraceContext
   * @param options - 导出选项
   * @returns 格式化的文本字符串
   */
  exportToText(context: TraceContext, options?: ExportOptions): string {
    const metrics = context.getMetrics();
    const root = context.getRootSpan();

    let output = `\n╔════════════════════════════════════════════════════════╗\n`;
    output += `║  Trace Report                                          ║\n`;
    output += `╚════════════════════════════════════════════════════════╝\n`;
    output += `Trace ID    : ${context.traceId}\n`;
    output += `Root Span   : ${context.rootSpanId}\n`;
    output += `Created At  : ${new Date(context.createdAt).toISOString()}\n`;
    output += `\n`;

    // 指标摘要
    output += `┌─ Metrics ────────────────────────────────────────────┐\n`;
    output += `│ Total Spans    : ${String(metrics.totalSpans).padStart(12)} │\n`;
    output += `│ Total Duration : ${String(`${metrics.totalDuration}ms`).padStart(12)} │\n`;
    output += `│ Errors         : ${String(metrics.errorCount).padStart(12)} │\n`;
    output += `│ Slowest Span   : ${String(`${metrics.slowestSpan.operationName} (${metrics.slowestSpan.duration}ms)`).padStart(12)} │\n`;
    output += `└──────────────────────────────────────────────────────┘\n`;
    output += `\n`;

    // 按操作分组
    output += `┌─ Span Count by Operation ─────────────────────────────┐\n`;
    for (const [op, count] of Object.entries(metrics.spanCountByOperation)) {
      output += `│ ${op.padEnd(30)} : ${String(count).padStart(5)} │\n`;
    }
    output += `└──────────────────────────────────────────────────────┘\n`;
    output += `\n`;

    // 追踪树
    output += `┌─ Trace Tree ──────────────────────────────────────────┐\n`;
    output += this.formatTree(context.getTraceTree(), options);
    output += `└──────────────────────────────────────────────────────┘\n`;

    return output;
  }

  /**
   * 导出为紧凑的单行摘要（用于日志）
   *
   * @param context - TraceContext
   * @returns 单行摘要字符串
   */
  exportToSummary(context: TraceContext): string {
    const metrics = context.getMetrics();
    return `Trace ${context.traceId}: ${metrics.totalSpans} spans, ${metrics.totalDuration}ms, ${metrics.errorCount} errors`;
  }

  /**
   * 导出为 Markdown 表格（用于文档）
   *
   * @param context - TraceContext
   * @param options - 导出选项
   * @returns Markdown 表格字符串
   */
  exportToMarkdown(context: TraceContext, options?: ExportOptions): string {
    const metrics = context.getMetrics();
    const spans = context.getSpans();

    let markdown = `## Trace Report: ${context.traceId}\n\n`;
    markdown += `**Created:** ${new Date(context.createdAt).toISOString()}\n\n`;

    // 指标表格
    markdown += `### Metrics\n\n`;
    markdown += `| Metric | Value |\n`;
    markdown += `|--------|-------|\n`;
    markdown += `| Total Spans | ${metrics.totalSpans} |\n`;
    markdown += `| Total Duration | ${metrics.totalDuration}ms |\n`;
    markdown += `| Errors | ${metrics.errorCount} |\n`;
    markdown += `| Slowest Span | ${metrics.slowestSpan.operationName} (${metrics.slowestSpan.duration}ms) |\n\n`;

    // Span 列表
    markdown += `### Spans\n\n`;
    markdown += `| Operation | Duration | Status | Error |\n`;
    markdown += `|-----------|----------|--------|-------|\n`;

    for (const span of spans) {
      if (options?.errorsOnly && span.status !== 'error') {
        continue;
      }
      const duration = span.duration ? `${span.duration}ms` : 'running';
      const error = span.error ?? '';
      markdown += `| ${span.operationName} | ${duration} | ${span.status} | ${error} |\n`;
    }

    return markdown;
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /**
   * 格式化树形结构为文本
   *
   * @param node - 树节点
   * @param options - 导出选项
   * @param depth - 当前深度（用于递归）
   * @param prefix - 前缀字符串
   * @returns 格式化的文本
   */
  private formatTree(
    node: TraceTreeNode,
    options?: ExportOptions,
    depth = 0,
    prefix = '',
  ): string {
    const span = node.span;
    const isLast = depth === 0;
    const connector = isLast ? '└─' : '├─';

    // 检查是否应该包含此节点
    if (options?.errorsOnly && span.status !== 'error') {
      // 检查是否有错误后代
      if (!this.hasErrorDescendant(node)) {
        // 跳过此节点，但需要处理子节点
        let childOutput = '';
        const childPrefix = prefix + (isLast ? '  ' : '│ ');
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          const isLastChild = i === node.children.length - 1;
          childOutput += this.formatTree(child, options, depth + 1, childPrefix);
        }
        return childOutput;
      }
    }

    // 检查深度限制
    if (options?.maxDepth !== undefined && depth > options.maxDepth) {
      return '';
    }

    let output = `│${prefix}${connector} ${span.operationName}`;

    // 添加持续时间
    if (span.duration !== undefined) {
      output += ` (${span.duration}ms)`;
    }

    // 添加状态图标
    if (span.status === 'error') {
      output += ` ❌`;
      if (span.error) {
        output += ` ${span.error}`;
      }
    } else if (span.status === 'success') {
      output += ` ✅`;
    } else {
      output += ` ⏳`;
    }

    output += '\n';

    // 递归处理子节点
    const childPrefix = prefix + (isLast ? '  ' : '│ ');
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      output += this.formatTree(child, options, depth + 1, childPrefix);
    }

    return output;
  }

  /**
   * 检查节点或其子孙是否有错误
   *
   * @param node - 树节点
   * @returns 是否有错误后代
   */
  private hasErrorDescendant(node: TraceTreeNode): boolean {
    if (node.span.status === 'error') {
      return true;
    }
    for (const child of node.children) {
      if (this.hasErrorDescendant(child)) {
        return true;
      }
    }
    return false;
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建 TraceExporter
 *
 * @returns 新创建的 TraceExporter
 */
export function createTraceExporter(): TraceExporter {
  return new TraceExporter();
}

/**
 * 导出为 JSON 的快捷函数
 *
 * @param context - TraceContext
 * @param options - 导出选项
 * @returns JSON 字符串
 */
export function exportTraceAsJSON(context: TraceContext, options?: ExportOptions): string {
  const exporter = new TraceExporter();
  return exporter.exportToJSON(context, options);
}

/**
 * 导出为 Mermaid 的快捷函数
 *
 * @param context - TraceContext
 * @param options - 导出选项
 * @returns Mermaid 图表字符串
 */
export function exportTraceAsMermaid(context: TraceContext, options?: ExportOptions): string {
  const exporter = new TraceExporter();
  return exporter.exportToMermaid(context, options);
}

/**
 * 导出为文本的快捷函数
 *
 * @param context - TraceContext
 * @param options - 导出选项
 * @returns 文本字符串
 */
export function exportTraceAsText(context: TraceContext, options?: ExportOptions): string {
  const exporter = new TraceExporter();
  return exporter.exportToText(context, options);
}

/**
 * 导出为摘要的快捷函数
 *
 * @param context - TraceContext
 * @returns 单行摘要字符串
 */
export function exportTraceAsSummary(context: TraceContext): string {
  const exporter = new TraceExporter();
  return exporter.exportToSummary(context);
}

/**
 * 导出为 Markdown 的快捷函数
 *
 * @param context - TraceContext
 * @param options - 导出选项
 * @returns Markdown 表格字符串
 */
export function exportTraceAsMarkdown(context: TraceContext, options?: ExportOptions): string {
  const exporter = new TraceExporter();
  return exporter.exportToMarkdown(context, options);
}
