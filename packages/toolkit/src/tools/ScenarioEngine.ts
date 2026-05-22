/**
 * ScenarioEngine - 场景引擎工具
 *
 * 基于 Principles 的场景匹配能力
 * 可作为 Agent 工具直接调用
 */
import { Principles } from '../memory/Principles.js';
import type { Principle, Scenario } from '../memory/types.js';

export interface ScenarioInput {
  query: string;
  includeQuestions?: boolean;
}

export interface ScenarioResult {
  matched: boolean;
  scenario?: {
    id: string;
    name: string;
    description: string;
  };
  principles: Array<{
    id: number;
    name: string;
    level: string;
    rule: string;
    description: string;
  }>;
  questions: string[];
}

/**
 * ScenarioEngine - 场景引擎
 *
 * 根据用户输入自动识别场景，推荐相关原则和自检问题
 *
 * 使用方式：
 * ```typescript
 * import { ScenarioEngine } from 'agent-toolkit';
 *
 * const engine = new ScenarioEngine();
 * const result = await engine.execute({ query: '我想启动一个新项目' });
 * ```
 */
export class ScenarioEngine {
  private principles: Principles;

  constructor() {
    this.principles = new Principles();
  }

  /**
   * 执行场景分析
   */
  async execute(input: ScenarioInput): Promise<ScenarioResult> {
    const { query, includeQuestions = true } = input;

    // 获取指导
    const guidance = this.principles.getGuidance(query);

    return {
      matched: !!guidance.scenario,
      scenario: guidance.scenario
        ? {
            id: guidance.scenario.id,
            name: guidance.scenario.name,
            description: guidance.scenario.description,
          }
        : undefined,
      principles: guidance.principles.map(p => ({
        id: p.id,
        name: p.name,
        level: p.level,
        rule: p.rule,
        description: p.description,
      })),
      questions: includeQuestions ? guidance.questions : [],
    };
  }

  /**
   * 搜索原则
   */
  search(query: string): Principle[] {
    return this.principles.search(query);
  }

  /**
   * 获取所有场景
   */
  getAllScenarios(): Scenario[] {
    return this.principles.getAllScenarios();
  }

  /**
   * 手动匹配场景
   */
  matchScenario(query: string): Scenario | undefined {
    return this.principles.matchScenario(query);
  }

  /**
   * 获取原则详情
   */
  getPrinciple(id: number): Principle | undefined {
    return this.principles.getById(id);
  }

  /**
   * 获取所有原则
   */
  getAllPrinciples(): Principle[] {
    return this.principles.getAll();
  }

  /**
   * 按级别获取原则
   */
  getPrinciplesByLevel(level: 'iron' | 'gold' | 'silver'): Principle[] {
    return this.principles.getByLevel(level);
  }
}

/**
 * 创建场景引擎
 */
export function createScenarioEngine(): ScenarioEngine {
  return new ScenarioEngine();
}
