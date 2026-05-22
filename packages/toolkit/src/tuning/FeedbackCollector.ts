/**
 * FeedbackCollector - 反馈收集器
 *
 * 收集工具执行反馈，用于微调
 */
import type { TuningFeedback } from './types.js';

export class FeedbackCollector {
  private feedbacks: Map<string, TuningFeedback[]> = new Map();

  /**
   * 收集反馈
   */
  collect(feedback: Omit<TuningFeedback, 'id' | 'timestamp'>): TuningFeedback {
    const fullFeedback: TuningFeedback = {
      ...feedback,
      id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    const toolId = feedback.context?.toolId as string || 'default';
    if (!this.feedbacks.has(toolId)) {
      this.feedbacks.set(toolId, []);
    }
    this.feedbacks.get(toolId)!.push(fullFeedback);

    return fullFeedback;
  }

  /**
   * 获取工具反馈
   */
  getByTool(toolId: string): TuningFeedback[] {
    return this.feedbacks.get(toolId) || [];
  }

  /**
   * 获取所有反馈
   */
  getAll(): TuningFeedback[] {
    const all: TuningFeedback[] = [];
    for (const feedbacks of this.feedbacks.values()) {
      all.push(...feedbacks);
    }
    return all;
  }

  /**
   * 获取高质量反馈（用于微调）
   */
  getHighQuality(threshold = 0.7): TuningFeedback[] {
    return this.getAll().filter(f => f.score >= threshold);
  }

  /**
   * 清除反馈
   */
  clear(toolId?: string): void {
    if (toolId) {
      this.feedbacks.delete(toolId);
    } else {
      this.feedbacks.clear();
    }
  }

  /**
   * 统计信息
   */
  getStats(): {
    total: number;
    byTool: Record<string, number>;
    averageScore: number;
  } {
    const all = this.getAll();
    const byTool: Record<string, number> = {};

    for (const [toolId, feedbacks] of this.feedbacks) {
      byTool[toolId] = feedbacks.length;
    }

    const averageScore = all.length > 0
      ? all.reduce((sum, f) => sum + f.score, 0) / all.length
      : 0;

    return {
      total: all.length,
      byTool,
      averageScore,
    };
  }
}
