/**
 * SelfJudge - 自我评判器
 *
 * LLM-as-a-Judge：无需外部标签，自我评判任务成功/失败
 * 源自 ReasoningBank 论文
 */
import type { TaskResult, SelfJudgeConfig } from './types.js';

export class SelfJudge {
  private config: SelfJudgeConfig;

  constructor(config: SelfJudgeConfig = {}) {
    this.config = {
      enableRefinement: false,
      ...config,
    };
  }

  /**
   * 评判任务成功/失败 - 无需外部标签
   * 使用 LLM 进行自我评判
   */
  async judge(result: TaskResult): Promise<'success' | 'failure'> {
    // 如果任务已有明确的成功/失败标记，直接使用
    if (result.success !== undefined) {
      return result.success ? 'success' : 'failure';
    }

    // 使用 LLM 进行评判
    return this.judgeWithLLM(result);
  }

  /**
   * 使用 LLM 评判
   */
  private async judgeWithLLM(result: TaskResult): Promise<'success' | 'failure'> {
    // 默认实现：基于错误判断
    // 实际使用时需要接入 LLM
    if (result.error) {
      return 'failure';
    }

    // 简化判断：输出非空视为成功
    if (result.output !== null && result.output !== undefined) {
      return 'success';
    }

    return 'failure';
  }

  /**
   * 分析失败原因
   * 从失败轨迹中提取有价值的反思
   */
  async analyzeFailure(result: TaskResult): Promise<string> {
    if (!result.trajectory || result.trajectory.length === 0) {
      return 'No trajectory available for analysis';
    }

    // 分析失败模式
    const failurePatterns = this.detectFailurePatterns(result.trajectory);

    if (failurePatterns.length > 0) {
      return failurePatterns.join('; ');
    }

    // 默认分析：提取最后几步作为反思
    const lastSteps = result.trajectory.slice(-3);
    return `Failed at: ${lastSteps.join(' -> ')}`;
  }

  /**
   * 检测失败模式
   */
  private detectFailurePatterns(trajectory: string[]): string[] {
    const patterns: string[] = [];

    for (const step of trajectory) {
      if (step.toLowerCase().includes('error') || step.toLowerCase().includes('fail')) {
        patterns.push(`Error detected: ${step}`);
      }
      if (step.toLowerCase().includes('timeout')) {
        patterns.push('Operation timeout');
      }
      if (step.toLowerCase().includes('permission') || step.toLowerCase().includes('denied')) {
        patterns.push('Permission denied');
      }
      if (step.toLowerCase().includes('not found') || step.toLowerCase().includes('404')) {
        patterns.push('Resource not found');
      }
    }

    return patterns;
  }

  /**
   * 精炼记忆（序列扩展）- 从中间推理过程中提取更深层次的洞察
   */
  async refine(memory: {
    content: string;
    trajectory?: string[];
  }): Promise<string> {
    if (!this.config.enableRefinement || !memory.trajectory) {
      return memory.content;
    }

    // 从轨迹中提取中间思考
    const intermediateInsights: string[] = [];

    for (const step of memory.trajectory) {
      // 检测推理关键词
      if (step.includes('think') || step.includes('reason') || step.includes('maybe')) {
        intermediateInsights.push(step);
      }
    }

    if (intermediateInsights.length === 0) {
      return memory.content;
    }

    // 整合原始内容和中间洞察
    return `${memory.content}\n\n---\nRefined insights:\n${intermediateInsights.join('\n')}`;
  }

  /**
   * 构建评判 Prompt
   */
  buildJudgePrompt(result: TaskResult): string {
    const customPrompt = this.config.prompt;

    if (customPrompt) {
      return customPrompt
        .replace('{input}', JSON.stringify(result.input))
        .replace('{output}', JSON.stringify(result.output))
        .replace('{trajectory}', result.trajectory.join('\n'));
    }

    // 默认评判 Prompt
    return `Task Result Judgment

Input: ${JSON.stringify(result.input, null, 2)}
Output: ${JSON.stringify(result.output, null, 2)}
Trajectory: ${result.trajectory.join('\n')}
Duration: ${result.duration}ms

Is this task result a success or failure? Answer with exactly one word: "success" or "failure"
${result.error ? `Error: ${result.error}` : ''}`;
  }
}
