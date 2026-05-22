/**
 * SkillController - 技能选择器
 *
 * 基于兼容性的技能评分
 * Top-K 选择逻辑
 * Gumbel-Top-K 采样（简化版）
 */
import type {
  DynamicSkillDefinition,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillExecutor,
  SkillAction,
} from './types.js';
import { OllamaClient } from '../local-reflex/OllamaClient.js';

export interface SkillScore {
  skill: DynamicSkillDefinition;
  score: number;
  reason?: string;
}

export interface ControllerConfig {
  /** Top-K 选择数量 */
  topK: number;
  /** 温度参数 (用于 Gumbel-Top-K) */
  temperature: number;
  /** 置信度阈值 */
  confidenceThreshold: number;
  /** 是否使用 Gumbel-Top-K 采样 */
  useGumbelSampling: boolean;
  /** LLM 客户端配置 */
  llmConfig?: {
    baseUrl?: string;
    model?: string;
    temperature?: number;
  };
}

const DEFAULT_CONFIG: ControllerConfig = {
  topK: 3,
  temperature: 1.0,
  confidenceThreshold: 0.3,
  useGumbelSampling: true,
};

/**
 * 技能控制器
 * 负责技能选择、评分和执行协调
 */
export class SkillController {
  private skills: Map<string, DynamicSkillDefinition> = new Map();
  private config: ControllerConfig;
  private llmClient?: OllamaClient;

  constructor(config: Partial<ControllerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.llmConfig) {
      this.llmClient = new OllamaClient({
        baseUrl: this.config.llmConfig.baseUrl,
        model: this.config.llmConfig.model,
      });
    }
  }

  /**
   * 注册技能
   */
  register(skill: DynamicSkillDefinition): void {
    this.skills.set(skill.id, skill);
  }

  /**
   * 批量注册技能
   */
  registerMany(skills: DynamicSkillDefinition[]): void {
    for (const skill of skills) {
      this.register(skill);
    }
  }

  /**
   * 获取所有技能
   */
  getAll(): DynamicSkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * 根据 ID 获取技能
   */
  get(skillId: string): DynamicSkillDefinition | undefined {
    return this.skills.get(skillId);
  }

  /**
   * 更新技能使用统计
   */
  updateUsageStats(skillId: string, success: boolean): void {
    const skill = this.skills.get(skillId);
    if (!skill) return;

    skill.usageStats.lastUsed = new Date();
    if (success) {
      skill.usageStats.successCount++;
    } else {
      skill.usageStats.failCount++;
    }
  }

  /**
   * 计算技能兼容性评分
   * 基于任务匹配度、使用统计和向量相似度
   */
  calculateCompatibilityScore(
    skill: DynamicSkillDefinition,
    context: SkillExecutionContext
  ): number {
    let score = 0;

    // 1. 任务匹配评分 (0-0.4)
    const taskMatchScore = this.calculateTaskMatchScore(skill, context.task);
    score += taskMatchScore * 0.4;

    // 2. 使用统计评分 (0-0.3)
    const usageScore = this.calculateUsageScore(skill);
    score += usageScore * 0.3;

    // 3. 向量相似度评分 (0-0.3)
    if (skill.embedding && context.retrievedMemories.length > 0) {
      const similarityScore = this.calculateEmbeddingSimilarity(skill, context.retrievedMemories);
      score += similarityScore * 0.3;
    }

    return Math.min(score, 1.0);
  }

  /**
   * 计算任务匹配评分
   */
  private calculateTaskMatchScore(skill: DynamicSkillDefinition, task: string): number {
    const taskLower = task.toLowerCase();

    // 触发词匹配
    for (const trigger of skill.triggers) {
      if (taskLower.includes(trigger.toLowerCase())) {
        return 1.0;
      }
    }

    // 名称匹配
    const nameParts = skill.name.toLowerCase().split(/[-_\s]/);
    for (const part of nameParts) {
      if (part.length > 2 && taskLower.includes(part)) {
        return 0.7;
      }
    }

    // 描述关键词匹配
    const descWords = skill.description.toLowerCase().split(/\s+/);
    for (const word of descWords) {
      if (word.length > 3 && taskLower.includes(word)) {
        return 0.5;
      }
    }

    return 0.1;
  }

  /**
   * 计算使用统计评分
   */
  private calculateUsageScore(skill: DynamicSkillDefinition): number {
    const { successCount, failCount } = skill.usageStats;
    const total = successCount + failCount;

    if (total === 0) {
      return 0.5; // 无历史数据时返回中性分数
    }

    // 成功率
    const successRate = successCount / total;

    // 考虑使用频率 (使用过更多次的技能可能更可靠)
    const frequencyWeight = Math.min(Math.log10(total + 1) / 5, 1.0);

    return successRate * 0.7 + frequencyWeight * 0.3;
  }

  /**
   * 计算向量相似度
   */
  private calculateEmbeddingSimilarity(
    skill: DynamicSkillDefinition,
    memories: string[]
  ): number {
    // 简化版: 基于关键词重叠计算相似度
    // 实际实现应使用向量点积或余弦相似度
    if (!skill.embedding || skill.embedding.length === 0) {
      return 0.3;
    }

    // 这里使用简化的相似度计算
    // 实际场景应该对 memories 进行向量化后计算
    const skillKeywords = new Set(
      skill.description.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    );

    let totalOverlap = 0;
    for (const memory of memories) {
      const memoryWords = new Set(
        memory.toLowerCase().split(/\s+/).filter(w => w.length > 2)
      );

      let overlap = 0;
      for (const word of skillKeywords) {
        if (memoryWords.has(word)) {
          overlap++;
        }
      }
      totalOverlap += overlap / Math.max(skillKeywords.size, 1);
    }

    return Math.min(totalOverlap / Math.max(memories.length, 1), 1.0);
  }

  /**
   * Top-K 选择
   * 返回评分最高的 K 个技能
   */
  selectTopK(context: SkillExecutionContext): SkillScore[] {
    const scores: SkillScore[] = [];

    for (const skill of this.skills.values()) {
      const score = this.calculateCompatibilityScore(skill, context);
      if (score >= this.config.confidenceThreshold) {
        scores.push({ skill, score });
      }
    }

    // 按分数降序排序
    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, this.config.topK);
  }

  /**
   * Gumbel-Top-K 采样 (简化版)
   * 用于在探索和利用之间取得平衡
   */
  selectWithGumbelSampling(context: SkillExecutionContext): SkillScore[] {
    const scores: SkillScore[] = [];

    for (const skill of this.skills.values()) {
      const baseScore = this.calculateCompatibilityScore(skill, context);

      // 添加 Gumbel 噪声
      const gumbelNoise = this.sampleGumbel();
      const adjustedScore = baseScore + (gumbelNoise * this.config.temperature);

      scores.push({
        skill,
        score: adjustedScore,
        reason: `base=${baseScore.toFixed(3)}, gumbel=${gumbelNoise.toFixed(3)}`,
      });
    }

    // 按调整后的分数降序排序
    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, this.config.topK);
  }

  /**
   * 采样 Gumbel 噪声
   * Gumbel(0, 1) = -log(-log(U)), U ~ Uniform(0,1)
   */
  private sampleGumbel(): number {
    const u = Math.random();
    return -Math.log(-Math.log(Math.max(u, 1e-10)));
  }

  /**
   * 选择技能 (根据配置选择使用 Top-K 或 Gumbel-Top-K)
   */
  select(context: SkillExecutionContext): SkillScore[] {
    if (this.config.useGumbelSampling) {
      return this.selectWithGumbelSampling(context);
    }
    return this.selectTopK(context);
  }

  /**
   * 执行选中的技能
   */
  async execute(
    context: SkillExecutionContext,
    selectedSkills?: SkillScore[]
  ): Promise<SkillExecutionResult[]> {
    const skillsToExecute = selectedSkills || this.select(context);
    const results: SkillExecutionResult[] = [];

    for (const { skill } of skillsToExecute) {
      try {
        // 如果有自定义执行器，使用它
        if (skill.executor) {
          const result = await skill.executor(context, context.retrievedMemories);
          results.push(result);
        } else {
          // 否则使用默认执行器
          const result = await this.defaultExecute(context, skill);
          results.push(result);
        }

        // 更新使用统计
        this.updateUsageStats(skill.id, true);
      } catch (error) {
        results.push({
          action: 'NOOP',
          success: false,
          reasoning: error instanceof Error ? error.message : 'Unknown error',
        });
        this.updateUsageStats(skill.id, false);
      }
    }

    return results;
  }

  /**
   * 默认执行器
   * 使用 LLM 生成记忆操作
   */
  private async defaultExecute(
    context: SkillExecutionContext,
    skill: DynamicSkillDefinition
  ): Promise<SkillExecutionResult> {
    // 构建提示词
    const prompt = this.buildExecutionPrompt(context, skill);

    if (this.llmClient) {
      try {
        const response = await this.llmClient.chat(
          [
            {
              role: 'system',
              content: '你是一个技能执行助手。根据给定的任务和记忆，执行相应的操作并返回结果。',
            },
            { role: 'user', content: prompt },
          ],
          { temperature: 0.3 }
        );

        return this.parseActionResponse(response.response);
      } catch {
        // LLM 调用失败时使用规则执行器
        return this.ruleBasedExecute(context, skill);
      }
    }

    // 无 LLM 客户端时使用规则执行器
    return this.ruleBasedExecute(context, skill);
  }

  /**
   * 构建执行提示词
   */
  private buildExecutionPrompt(
    context: SkillExecutionContext,
    skill: DynamicSkillDefinition
  ): string {
    return `任务: ${context.task}
输入: ${context.input || ''}

相关记忆:
${context.retrievedMemories.map((m, i) => `${i}: ${m}`).join('\n')}

技能: ${skill.name} - ${skill.description}

请分析上述信息，确定需要执行的记忆操作（INSERT/UPDATE/DELETE/NOOP），并给出理由。

返回格式:
ACTION: <操作类型>
REASONING: <执行理由>`;
  }

  /**
   * 解析 LLM 响应
   */
  private parseActionResponse(response: string): SkillExecutionResult {
    const actionMatch = response.match(/ACTION:\s*(\w+)/i);
    const reasoningMatch = response.match(/REASONING:\s*(.+)/i);

    const action = (actionMatch?.[1]?.toUpperCase() as SkillAction) || 'NOOP';
    const validActions: SkillAction[] = ['INSERT', 'UPDATE', 'DELETE', 'NOOP'];

    return {
      action: validActions.includes(action) ? action : 'NOOP',
      success: true,
      reasoning: reasoningMatch?.[1]?.trim() || 'Action determined from LLM response',
    };
  }

  /**
   * 基于规则的默认执行器
   * 当没有 LLM 客户端时使用
   */
  private ruleBasedExecute(
    context: SkillExecutionContext,
    skill: DynamicSkillDefinition
  ): SkillExecutionResult {
    const task = context.task.toLowerCase();

    // 基于任务关键词确定操作
    if (task.includes('add') || task.includes('create') || task.includes('insert')) {
      return {
        action: 'INSERT',
        success: true,
        reasoning: `Task indicates adding new content, matched skill: ${skill.name}`,
      };
    }

    if (task.includes('update') || task.includes('modify') || task.includes('change')) {
      return {
        action: 'UPDATE',
        success: true,
        reasoning: `Task indicates updating content, matched skill: ${skill.name}`,
      };
    }

    if (task.includes('delete') || task.includes('remove')) {
      return {
        action: 'DELETE',
        success: true,
        reasoning: `Task indicates deleting content, matched skill: ${skill.name}`,
      };
    }

    // 默认不执行操作
    return {
      action: 'NOOP',
      success: true,
      reasoning: `No clear action determined, matched skill: ${skill.name}`,
    };
  }

  /**
   * 设置自定义执行器
   */
  setExecutor(skillId: string, executor: SkillExecutor): void {
    const skill = this.skills.get(skillId);
    if (skill) {
      skill.executor = executor;
    }
  }

  /**
   * 获取配置
   */
  getConfig(): ControllerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ControllerConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.config.llmConfig && !this.llmClient) {
      this.llmClient = new OllamaClient({
        baseUrl: this.config.llmConfig.baseUrl,
        model: this.config.llmConfig.model,
      });
    }
  }
}

/**
 * 创建技能控制器
 */
export function createSkillController(
  config?: Partial<ControllerConfig>
): SkillController {
  return new SkillController(config);
}
