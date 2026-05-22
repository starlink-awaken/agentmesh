/**
 * SkillRouter - 技能路由器
 * 支持关键词匹配和上下文感知路由
 */
import type { SkillDefinition, SkillMatchResult } from './types.js';
import { SkillLoader } from './SkillLoader.js';

export class SkillRouter {
  private loader: SkillLoader;

  constructor(loader: SkillLoader) {
    this.loader = loader;
  }

  /**
   * 根据任务描述匹配最佳技能
   */
  match(task: string, context?: Record<string, unknown>): SkillMatchResult[] {
    const results = this.calculateMatches(task, context);
    return results.filter(r => r.confidence > 0.1).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 计算技能匹配度
   */
  private calculateMatches(
    task: string,
    context?: Record<string, unknown>
  ): SkillMatchResult[] {
    const skills = this.loader.getAll();
    const taskLower = task.toLowerCase();

    // 提取任务关键词
    const taskKeywords = this.extractKeywords(taskLower);

    const results: SkillMatchResult[] = [];

    for (const skill of skills) {
      const matchedTriggers: string[] = [];
      let confidence = 0;

      // 1. 触发词匹配 (最高权重)
      for (const trigger of skill.triggers) {
        const triggerLower = trigger.toLowerCase();
        if (taskLower.includes(triggerLower)) {
          matchedTriggers.push(trigger);
          confidence += 0.3;
        }
      }

      // 2. 名称匹配
      if (skill.name.toLowerCase().split('-').some(part => taskLower.includes(part))) {
        confidence += 0.2;
      }

      // 3. 描述匹配
      if (skill.description.toLowerCase().split(' ').some(word => taskKeywords.has(word))) {
        confidence += 0.1;
      }

      // 4. 上下文匹配
      if (context) {
        confidence += this.calculateContextMatch(skill, context);
      }

      // 5. scope 匹配
      confidence += this.calculateScopeMatch(skill, taskLower);

      // 归一化置信度
      confidence = Math.min(confidence, 1);

      // 计算建议的参考文档
      const suggestedReferences = this.suggestReferences(skill, taskLower, matchedTriggers);

      results.push({
        skill,
        matchedTriggers,
        confidence,
        suggestedReferences,
      });
    }

    return results;
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): Set<string> {
    // 简单分词：去除常见停用词
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
      'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
      'not', 'only', 'just', 'also', 'very', 'too', 'how', 'what', 'which',
      'who', 'whom', 'whose', 'when', 'where', 'why', 'build', 'create',
      'implement', 'add', 'fix', 'update', 'remove', 'delete', 'make',
      'help', 'need', 'want', 'use', 'using', 'my', 'i', 'we', 'our',
    ]);

    const words = text.split(/[\s,.!?;:'"()\[\]{}]+/);
    return new Set(
      words
        .filter(w => w.length > 2 && !stopWords.has(w))
        .map(w => w.toLowerCase())
    );
  }

  /**
   * 计算上下文匹配度
   */
  private calculateContextMatch(skill: SkillDefinition, context: Record<string, unknown>): number {
    let score = 0;

    // 匹配 role
    if (context.role && skill.role === context.role) {
      score += 0.15;
    }

    // 匹配 scope
    if (context.scope && skill.scope === context.scope) {
      score += 0.15;
    }

    // 匹配 category
    if (context.category && skill.category === context.category) {
      score += 0.1;
    }

    return score;
  }

  /**
   * 计算 scope 匹配度
   */
  private calculateScopeMatch(skill: SkillDefinition, task: string): number {
    const scopeKeywords: Record<string, string[]> = {
      implementation: ['build', 'create', 'implement', 'add', 'write', 'code'],
      analysis: ['analyze', 'analyse', 'review', 'check', 'audit', 'examine'],
      design: ['design', 'architect', 'plan', 'structure', 'schema'],
      review: ['review', 'refactor', 'improve', 'optimize', 'enhance'],
      planning: ['plan', 'estimate', 'specify', 'define', 'roadmap'],
    };

    const keywords = scopeKeywords[skill.scope] || [];
    for (const kw of keywords) {
      if (task.includes(kw)) {
        return 0.2;
      }
    }

    return 0;
  }

  /**
   * 建议参考文档
   */
  private suggestReferences(skill: SkillDefinition, task: string, matchedTriggers: string[]): string[] {
    const suggestions: string[] = [];

    // 根据匹配的触发词建议相关参考文档
    for (const route of skill.references) {
      const loadWhenLower = route.loadWhen.toLowerCase();

      // 如果触发词与 loadWhen 相关
      for (const trigger of matchedTriggers) {
        if (loadWhenLower.includes(trigger.toLowerCase())) {
          suggestions.push(route.topic);
          break;
        }
      }

      // 如果任务关键词与 loadWhen 相关
      const keywords = this.extractKeywords(task);
      for (const keyword of keywords) {
        if (loadWhenLower.includes(keyword) && !suggestions.includes(route.topic)) {
          suggestions.push(route.topic);
          break;
        }
      }
    }

    return suggestions;
  }

  /**
   * 获取最佳匹配
   */
  getBestMatch(task: string, context?: Record<string, unknown>): SkillMatchResult | null {
    const matches = this.match(task, context);
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * 获取多个推荐技能
   */
  getRecommendations(task: string, limit = 3, context?: Record<string, unknown>): SkillMatchResult[] {
    const matches = this.match(task, context);
    return matches.slice(0, limit);
  }

  /**
   * 组合多个技能 (用于复合任务)
   */
  compose(task: string, context?: Record<string, unknown>): SkillMatchResult[] {
    const matches = this.match(task, context);

    // 找出可以组合的技能
    const composition: SkillMatchResult[] = [];

    // 1. 添加主要技能
    if (matches.length > 0) {
      composition.push(matches[0]);
    }

    // 2. 尝试添加补充技能
    for (let i = 1; i < matches.length; i++) {
      const candidate = matches[i];
      const mainSkill = composition[0];

      // 检查是否可以组合
      if (this.canCompose(mainSkill.skill, candidate.skill)) {
        composition.push(candidate);
        if (composition.length >= 3) break; // 最多3个
      }
    }

    return composition;
  }

  /**
   * 检查两个技能是否可以组合
   */
  private canCompose(skill1: SkillDefinition, skill2: SkillDefinition): boolean {
    // 互补的角色可以组合
    const complementaryRoles: Record<string, string[]> = {
      specialist: ['reviewer', 'architect'],
      architect: ['specialist', 'reviewer'],
      reviewer: ['specialist'],
      generalist: ['specialist'],
    };

    return complementaryRoles[skill1.role]?.includes(skill2.role) ?? false;
  }
}
