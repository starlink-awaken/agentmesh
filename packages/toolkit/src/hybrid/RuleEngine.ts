/**
 * RuleEngine - 规则引擎
 *
 * 管理业务规则，支持精确匹配、模式匹配、语义匹配
 * 源自"规则+生成式融合"设计模式
 */
import type { HybridRule, RuleCondition, ResolutionContext } from './types.js';

export class RuleEngine {
  private rules: Map<string, HybridRule> = new Map();

  /**
   * 添加规则
   */
  addRule(rule: HybridRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * 移除规则
   */
  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * 启用/禁用规则
   */
  setEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
    }
  }

  /**
   * 评估规则
   */
  evaluate(rule: HybridRule, context: ResolutionContext): boolean {
    if (!rule.enabled) return false;

    const inputStr = this.stringifyInput(context.input);

    switch (rule.condition.type) {
      case 'exact':
        return inputStr === rule.condition.expression;

      case 'pattern':
        try {
          const regex = new RegExp(rule.condition.expression);
          return regex.test(inputStr);
        } catch {
          return false;
        }

      case 'semantic':
        // 简化版语义匹配：关键词包含
        const keywords = (rule.condition.expression || '').split(',').map(k => k.trim());
        return keywords.some(kw => inputStr.toLowerCase().includes(kw.toLowerCase()));

      case 'composite':
        return this.evaluateComposite(rule.condition, context);

      default:
        return false;
    }
  }

  /**
   * 评估组合条件
   */
  private evaluateComposite(condition: RuleCondition, context: ResolutionContext): boolean {
    const subRules = condition.parameters?.rules as Array<{
      operator: 'and' | 'or';
      condition: RuleCondition;
    }> | undefined;

    if (!subRules) return false;

    let result = true;

    for (const subRule of subRules) {
      const subResult = this.evaluateCondition(subRule.condition, context);

      if (subRule.operator === 'and') {
        result = result && subResult;
      } else {
        result = result || subResult;
      }
    }

    return result;
  }

  /**
   * 评估单个条件
   */
  private evaluateCondition(condition: RuleCondition, context: ResolutionContext): boolean {
    const rule: HybridRule = {
      id: 'temp',
      name: 'temp',
      condition,
      action: { type: 'use_rule' },
      priority: 0,
      enabled: true,
    };
    return this.evaluate(rule, context);
  }

  /**
   * 查找匹配的规则
   */
  findMatchingRules(context: ResolutionContext): HybridRule[] {
    const matches: Array<{ rule: HybridRule; priority: number }> = [];

    for (const rule of this.rules.values()) {
      if (this.evaluate(rule, context)) {
        matches.push({ rule, priority: rule.priority });
      }
    }

    // 按优先级排序
    matches.sort((a, b) => b.priority - a.priority);

    return matches.map(m => m.rule);
  }

  /**
   * 获取所有规则
   */
  getAllRules(): HybridRule[] {
    return Array.from(this.rules.values());
  }

  private stringifyInput(input: unknown): string {
    if (typeof input === 'string') return input;
    if (typeof input === 'object') return JSON.stringify(input);
    return String(input);
  }
}
