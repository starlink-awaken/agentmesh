/**
 * Principles - 核心原则系统
 *
 * 源自 retro-principles: 10条核心原则 + 8个场景
 * 提供原则检索、场景推荐能力
 */
import type { Principle, Scenario, PrincipleLevel } from './types.js';

// ============================================================================
// 10条核心原则
// ============================================================================

export const CORE_PRINCIPLES: Principle[] = [
  {
    id: 1,
    name: '用户需求验证',
    level: 'iron',
    rule: '没问过用户 = 猜',
    description: '在动手之前，必须先与用户确认需求。任何未经确认的假设都可能偏离用户真实意图。',
    keywords: ['用户需求', '确认', '访谈', '调研', '需求分析'],
    scenarios: ['启动新项目', '用户调研', '需求变更'],
    questions: [
      '这个需求是否与用户确认过？',
      '用户真正想要解决的核心问题是什么？',
      '有没有遗漏的关键利益相关者？',
    ],
  },
  {
    id: 2,
    name: 'ROI保守主义',
    level: 'iron',
    rule: '乐观是幻想，保守是智慧',
    description: '评估任何方案时，始终考虑最坏情况。成本、时间和风险往往比预期更高。',
    keywords: ['成本', '预算', 'ROI', '评估', '风险', '时间'],
    scenarios: ['成本预算', '重大决策', '技术选型'],
    questions: [
      '最坏情况下的成本是多少？',
      '是否有足够的缓冲来应对意外？',
      '收益是否明确可量化？',
    ],
  },
  {
    id: 3,
    name: 'XY Problem警惕',
    level: 'gold',
    rule: '问5次"为什么"再动手',
    description: '用户提出的解决方案（Y）往往不是真正的问题（X）。必须追根溯源，理解真实需求。',
    keywords: ['XY Problem', '为什么', '根本原因', '分析', '问题'],
    scenarios: ['重大决策', '问题分析', '技术讨论'],
    questions: [
      '用户真正想解决的核心问题是什么？',
      '为什么需要这样做？有没有替代方案？',
      '这个问题的根本原因是什么？',
    ],
  },
  {
    id: 4,
    name: '多代理分析ROI',
    level: 'gold',
    rule: '花小钱防大祸',
    description: '复杂决策前，使用多代理视角分析。多个AI代理的讨论成本远低于错误决策的代价。',
    keywords: ['多代理', '分析', '讨论', '视角', 'Council'],
    scenarios: ['重大决策', '风险管理', '技术选型'],
    questions: [
      '是否需要多个视角来评估这个决策？',
      '有没有遗漏重要的利益相关方？',
      '是否应该进行更广泛的讨论？',
    ],
  },
  {
    id: 5,
    name: '竞品沉默',
    level: 'silver',
    rule: '90%有原因',
    description: '如果某个方案竞品不做，先理解原因。不是所有"显而易见"的机会都值得追求。',
    keywords: ['竞品', '分析', '市场', '差异化', '为什么不做'],
    scenarios: ['技术选型', '产品决策', '市场分析'],
    questions: [
      '竞品为什么不做这个？',
      '是否存在我们不知道的隐性障碍？',
      '我们的差异化优势是什么？',
    ],
  },
  {
    id: 6,
    name: '文档金字塔',
    level: 'silver',
    rule: '5%结论，20%方案，75%细节',
    description: '文档结构应遵循金字塔原理。结论先行，然后是支撑方案，最后是详细实现细节。',
    keywords: ['文档', '汇报', '总结', '结构', '金字塔'],
    scenarios: ['文档编写', '汇报演示', '知识传递'],
    questions: [
      '读者最关心的结论是什么？',
      '是否需要背景介绍才能理解？',
      '实现细节是否完整可操作？',
    ],
  },
  {
    id: 7,
    name: '隐性成本',
    level: 'silver',
    rule: '算到的成本只是冰山',
    description: '显性成本（开发、维护）只是总成本的小部分。培训、迁移、机会成本往往被忽视。',
    keywords: ['成本', '预算', '隐性', '评估', 'Total Cost'],
    scenarios: ['成本预算', '技术选型', '重大决策'],
    questions: [
      '除了开发成本，还有哪些隐性成本？',
      '迁移和学习曲线成本考虑了吗？',
      '机会成本是多少？',
    ],
  },
  {
    id: 8,
    name: '可测量',
    level: 'gold',
    rule: '模糊 = 无效',
    description: '任何目标和指标必须是可测量的。"做好一点"不是目标，"转化率提升10%"才是。',
    keywords: ['指标', '测量', 'KPI', '目标', '量化'],
    scenarios: ['验证测试', '项目管理', '效果评估'],
    questions: [
      '如何量化这个目标的成功？',
      '测量方法是否可靠？',
      '基线是什么？',
    ],
  },
  {
    id: 9,
    name: '技术选型',
    level: 'iron',
    rule: '先POC再上车',
    description: '任何新技术必须先做概念验证（POC）。不要盲目追逐新技术，除非经过验证。',
    keywords: ['技术选型', 'POC', '验证', '框架', '工具'],
    scenarios: ['技术选型', '验证测试', '启动新项目'],
    questions: [
      '是否已经做了POC验证？',
      '团队是否有相关经验？',
      '社区支持和文档是否完善？',
    ],
  },
  {
    id: 10,
    name: '分阶段决策',
    level: 'silver',
    rule: '每个阶段必须有退出点',
    description: '重大决策应分阶段进行。每个阶段结束时评估，决定是继续还是退出。',
    keywords: ['分阶段', '里程碑', '退出', '决策点', '迭代'],
    scenarios: ['启动新项目', '分阶段交付', '敏捷迭代'],
    questions: [
      '这个阶段的退出条件是什么？',
      '如何判断是否进入下一阶段？',
      '回滚计划是什么？',
    ],
  },
];

// ============================================================================
// 8个预定义场景
// ============================================================================

export const SCENARIOS: Scenario[] = [
  {
    id: 'new-project',
    name: '启动新项目',
    keywords: ['新项目', '启动', '立项', '从零开始', '新功能'],
    recommendedPrinciples: [1, 10, 2],
    description: '新项目启动时的关键决策点',
  },
  {
    id: 'tech-selection',
    name: '技术选型',
    keywords: ['技术选型', '选框架', '选工具', '选库', '框架'],
    recommendedPrinciples: [9, 5, 7],
    description: '选择技术栈和工具的关键决策',
  },
  {
    id: 'user-research',
    name: '用户调研',
    keywords: ['用户调研', '访谈', '需求', '用户反馈', '痛点'],
    recommendedPrinciples: [1, 3],
    description: '理解用户需求和验证假设',
  },
  {
    id: 'cost-budget',
    name: '成本预算',
    keywords: ['成本', '预算', 'ROI', '资源', '投入'],
    recommendedPrinciples: [2, 7, 8],
    description: '评估和规划项目成本与收益',
  },
  {
    id: 'major-decision',
    name: '重大决策',
    keywords: ['决策', '选择', '评估', '权衡', '利弊'],
    recommendedPrinciples: [3, 4, 2],
    description: '需要多方权衡的关键决策',
  },
  {
    id: 'documentation',
    name: '文档编写',
    keywords: ['文档', '汇报', '总结', '输出', '知识'],
    recommendedPrinciples: [6],
    description: '编写文档和知识输出',
  },
  {
    id: 'risk-management',
    name: '风险管理',
    keywords: ['风险', '问题', '挑战', '隐患', '担忧'],
    recommendedPrinciples: [4, 2, 8],
    description: '识别和应对项目风险',
  },
  {
    id: 'verification',
    name: '验证测试',
    keywords: ['验证', '测试', '检查', '确认', '通过'],
    recommendedPrinciples: [9, 8, 10],
    description: '验证方案可行性和测试结果',
  },
];

// ============================================================================
// Principles 类
// ============================================================================

export class Principles {
  private principles: Principle[];
  private scenarios: Scenario[];

  constructor() {
    this.principles = CORE_PRINCIPLES;
    this.scenarios = SCENARIOS;
  }

  /**
   * 获取所有原则
   */
  getAll(): Principle[] {
    return this.principles;
  }

  /**
   * 按ID获取原则
   */
  getById(id: number): Principle | undefined {
    return this.principles.find(p => p.id === id);
  }

  /**
   * 按级别获取原则
   */
  getByLevel(level: PrincipleLevel): Principle[] {
    return this.principles.filter(p => p.level === level);
  }

  /**
   * 搜索原则 - 关键词匹配
   */
  search(query: string): Principle[] {
    const queryLower = query.toLowerCase();
    return this.principles.filter(p => {
      // 搜索名称、规则、描述、关键词
      return (
        p.name.toLowerCase().includes(queryLower) ||
        p.rule.toLowerCase().includes(queryLower) ||
        p.description.toLowerCase().includes(queryLower) ||
        p.keywords.some(k => k.toLowerCase().includes(queryLower))
      );
    });
  }

  /**
   * 获取所有场景
   */
  getAllScenarios(): Scenario[] {
    return this.scenarios;
  }

  /**
   * 按ID获取场景
   */
  getScenarioById(id: string): Scenario | undefined {
    return this.scenarios.find(s => s.id === id);
  }

  /**
   * 场景匹配 - 根据关键词推荐相关原则
   */
  matchScenario(input: string): Scenario | undefined {
    const inputLower = input.toLowerCase();

    // 精确匹配场景ID
    const exactMatch = this.scenarios.find(s => s.id === inputLower);
    if (exactMatch) return exactMatch;

    // 关键词匹配
    let bestMatch: Scenario | undefined;
    let bestScore = 0;

    for (const scenario of this.scenarios) {
      let score = 0;
      for (const keyword of scenario.keywords) {
        if (inputLower.includes(keyword.toLowerCase())) {
          score += keyword.length; // 更长的关键词权重更高
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = scenario;
      }
    }

    return bestMatch;
  }

  /**
   * 获取场景推荐的原则
   */
  getRecommendedPrinciples(scenarioId: string): Principle[] {
    const scenario = this.getScenarioById(scenarioId);
    if (!scenario) return [];

    return scenario.recommendedPrinciples
      .map(id => this.getById(id))
      .filter((p): p is Principle => p !== undefined);
  }

  /**
   * 根据输入推荐原则（自动场景匹配）
   */
  recommend(input: string): Principle[] {
    // 先尝试场景匹配
    const scenario = this.matchScenario(input);
    if (scenario) {
      return this.getRecommendedPrinciples(scenario.id);
    }

    // 没有场景匹配，搜索原则
    return this.search(input);
  }

  /**
   * 获取场景推荐 + 自检问题
   */
  getGuidance(input: string): {
    principles: Principle[];
    scenario?: Scenario;
    questions: string[];
  } {
    const scenario = this.matchScenario(input);
    const principles = scenario
      ? this.getRecommendedPrinciples(scenario.id)
      : this.search(input);

    // 收集所有相关问题
    const questions = principles.flatMap(p => p.questions);

    return { principles, scenario, questions };
  }
}

/**
 * 快速创建 Principles 实例
 */
export function createPrinciples(): Principles {
  return new Principles();
}
