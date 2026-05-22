/**
 * CapabilityRouter - 能力路由模块
 *
 * 根据任务类型智能选择合适的处理方式
 *
 * @author PAI
 * @version 1.0.0
 */

import type { CapabilityType } from './types.js';

/**
 * 能力选择结果
 */
export interface CapabilitySelection {
  type: CapabilityType;
  pattern?: string;
  confidence: number;
  reasoning: string;
}

/**
 * 路由配置
 */
export interface RouterConfig {
  /** 最小置信度阈值 */
  minConfidence?: number;
  /** 是否启用模糊匹配 */
  fuzzyMatch?: boolean;
  /** 默认能力 */
  defaultCapability?: CapabilityType;
}

/**
 * 任务分析结果
 */
export interface TaskAnalysis {
  intent: string;
  entities: string[];
  keywords: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  complexity: 'simple' | 'medium' | 'complex';
  domain?: string;
}

/**
 * CapabilityRouter 类
 *
 * 提供智能任务路由能力
 */
export class CapabilityRouter {
  private config: Required<RouterConfig>;
  private capabilityPatterns: Map<CapabilityType, string[]>;

  constructor(config: RouterConfig = {}) {
    this.config = {
      minConfidence: config.minConfidence ?? 0.5,
      fuzzyMatch: config.fuzzyMatch ?? true,
      defaultCapability: config.defaultCapability ?? 'default',
    };

    this.capabilityPatterns = new Map();
    this.initializePatterns();
  }

  /**
   * 初始化能力模式匹配规则
   */
  private initializePatterns(): void {
    // 分析类
    this.capabilityPatterns.set('analyze', [
      '分析', '分析', 'analyze', 'analysis', '评估', '评估', 'evaluate',
      '检查', '检查', '检查', 'review', '诊断', 'diagnose', '审查',
      '检测', 'detect', '发现', 'discover', '研究', 'research'
    ]);

    // 提取类
    this.capabilityPatterns.set('extract', [
      '提取', 'extract', '获取', 'get', '拉取', 'fetch', '抓取',
      '爬取', 'scrape', '解析', 'parse', '抽取', 'extract', '识别',
      'recognize', 'detect'
    ]);

    // 总结类
    this.capabilityPatterns.set('summarize', [
      '总结', 'summarize', '概括', 'summarize', '摘要', 'abstract',
      '提炼', 'extract', '归纳', 'induct', '精简', 'condense'
    ]);

    // 转换类
    this.capabilityPatterns.set('transform', [
      '转换', 'transform', '转换', 'convert', '翻译', 'translate',
      '格式化', 'format', '重构', 'refactor', '改写', 'rewrite'
    ]);

    // 创建类
    this.capabilityPatterns.set('create', [
      '创建', 'create', '生成', 'generate', '构建', 'build',
      '设计', 'design', '开发', 'develop', '实现', 'implement'
    ]);

    // 更新类
    this.capabilityPatterns.set('update', [
      '更新', 'update', '修改', 'modify', '编辑', 'edit',
      '调整', 'adjust', '优化', 'optimize', '改进', 'improve'
    ]);

    // 删除类
    this.capabilityPatterns.set('delete', [
      '删除', 'delete', '移除', 'remove', '清除', 'clear',
      '清理', 'clean', '卸载', 'uninstall'
    ]);

    // 搜索类
    this.capabilityPatterns.set('search', [
      '搜索', 'search', '查找', 'find', '查询', 'query',
      '检索', 'retrieve', '探索', 'explore'
    ]);

    // 测试类
    this.capabilityPatterns.set('test', [
      '测试', 'test', '验证', 'verify', '校验', 'validate',
      '检查', 'check', '确认', 'confirm'
    ]);

    // 安全类
    this.capabilityPatterns.set('security', [
      '安全', 'security', '漏洞', 'vulnerability', '攻击', 'attack',
      '防御', 'defense', '渗透', 'penetrate', '审计', 'audit'
    ]);

    // 默认类
    this.capabilityPatterns.set('default', [
      '处理', 'process', '执行', 'execute', '运行', 'run'
    ]);
  }

  /**
   * 路由任务到合适的处理能力
   */
  async route(task: string, context?: any): Promise<CapabilitySelection> {
    // 1. 分析任务
    const analysis = this.analyzeTask(task);

    // 2. 选择能力
    const selection = this.selectCapability(analysis, context);

    return selection;
  }

  /**
   * 分析任务
   */
  analyzeTask(task: string): TaskAnalysis {
    const keywords = this.extractKeywords(task);
    const intent = this.extractIntent(task);
    const complexity = this.assessComplexity(task);

    return {
      intent,
      entities: this.extractEntities(task),
      keywords,
      sentiment: this.analyzeSentiment(task),
      complexity,
      domain: this.identifyDomain(task),
    };
  }

  /**
   * 选择能力
   */
  selectCapability(analysis: TaskAnalysis, context?: any): CapabilitySelection {
    const scores: { type: CapabilityType; score: number }[] = [];

    // 遍历所有能力类型
    for (const [type, patterns] of this.capabilityPatterns) {
      const score = this.calculateMatchScore(analysis, patterns);
      scores.push({ type, score });
    }

    // 按分数排序
    scores.sort((a, b) => b.score - a.score);

    // 取最高分
    const best = scores[0];

    if (best.score < this.config.minConfidence) {
      return {
        type: this.config.defaultCapability,
        confidence: best.score,
        reasoning: '未达到置信度阈值，使用默认能力',
      };
    }

    return {
      type: best.type,
      pattern: this.selectPattern(analysis, best.type),
      confidence: best.score,
      reasoning: this.generateReasoning(analysis, best.type, best.score),
    };
  }

  /**
   * 计算匹配分数
   */
  private calculateMatchScore(analysis: TaskAnalysis, patterns: string[]): number {
    let score = 0;
    const taskText = `${analysis.intent} ${analysis.keywords.join(' ')}`.toLowerCase();

    for (const pattern of patterns) {
      if (taskText.includes(pattern.toLowerCase())) {
        score += 1;
      }
    }

    // 归一化
    return Math.min(score / patterns.length, 1);
  }

  /**
   * 选择具体模式
   */
  private selectPattern(analysis: TaskAnalysis, capability: CapabilityType): string {
    const intent = analysis.intent.toLowerCase();

    // 根据意图选择子模式
    if (capability === 'analyze') {
      if (intent.includes('趋势')) return 'analyze/trend';
      if (intent.includes('对比')) return 'analyze/compare';
      if (intent.includes('风险')) return 'analyze/risk';
      return 'analyze/default';
    }

    if (capability === 'summarize') {
      if (intent.includes('会议')) return 'summarize/meeting';
      if (intent.includes('文档')) return 'summarize/document';
      if (intent.includes('代码')) return 'summarize/code';
      return 'summarize/default';
    }

    if (capability === 'extract') {
      if (intent.includes('关键词')) return 'extract/keywords';
      if (intent.includes('实体')) return 'extract/entities';
      if (intent.includes('结构')) return 'extract/structure';
      return 'extract/default';
    }

    return `${capability}/default`;
  }

  /**
   * 生成推理说明
   */
  private generateReasoning(
    analysis: TaskAnalysis,
    capability: CapabilityType,
    score: number
  ): string {
    return `任务 "${analysis.intent}" 匹配能力 "${capability}"，置信度 ${(score * 100).toFixed(1)}%`;
  }

  /**
   * 提取关键词
   */
  private extractKeywords(task: string): string[] {
    const stopWords = ['的', '了', '和', '与', '或', '在', '是', '我', '你', '他', '她', '它', '们'];
    const words = task.split(/[\s,，。,.!?]+/).filter(w => w.length > 1);
    return words.filter(w => !stopWords.includes(w));
  }

  /**
   * 提取意图
   */
  private extractIntent(task: string): string {
    // 简单的意图提取
    const firstWord = task.split(/[\s,，。,.!?]+/)[0];
    return firstWord || task.slice(0, 10);
  }

  /**
   * 提取实体
   */
  private extractEntities(task: string): string[] {
    // 简单的实体提取 - 匹配引号和括号内容
    const quoted = task.match(/"([^"]+)"/g) || [];
    const parenthesized = task.match(/\(([^)]+)\)/g) || [];

    return [...quoted, ...parenthesized].map(s => s.slice(1, -1));
  }

  /**
   * 分析情感
   */
  private analyzeSentiment(task: string): 'positive' | 'negative' | 'neutral' {
    const positiveWords = ['好', '喜欢', '棒', '完美', '优秀', 'good', 'great', 'excellent'];
    const negativeWords = ['坏', '差', '糟糕', '问题', '错误', 'bug', 'error', 'bad'];

    const lower = task.toLowerCase();
    const hasPositive = positiveWords.some(w => lower.includes(w));
    const hasNegative = negativeWords.some(w => lower.includes(w));

    if (hasPositive && !hasNegative) return 'positive';
    if (hasNegative && !hasPositive) return 'negative';
    return 'neutral';
  }

  /**
   * 评估复杂度
   */
  private assessComplexity(task: string): 'simple' | 'medium' | 'complex' {
    const length = task.length;
    const words = task.split(/\s+/).length;

    if (length < 50 || words < 10) return 'simple';
    if (length < 200 || words < 30) return 'medium';
    return 'complex';
  }

  /**
   * 识别领域
   */
  private identifyDomain(task: string): string | undefined {
    const domains: Record<string, string[]> = {
      '技术': ['代码', '编程', '开发', 'api', 'database', 'server'],
      '金融': ['钱', '金融', '投资', '股票', '银行', 'money', 'finance'],
      '医疗': ['健康', '医疗', '疾病', '医院', 'doctor', 'medical'],
      '教育': ['学习', '教育', '课程', '学生', '老师', 'learn', 'education'],
    };

    const lower = task.toLowerCase();
    for (const [domain, keywords] of Object.entries(domains)) {
      if (keywords.some(k => lower.includes(k.toLowerCase()))) {
        return domain;
      }
    }

    return undefined;
  }

  /**
   * 注册自定义能力模式
   */
  registerCapability(type: CapabilityType, patterns: string[]): void {
    this.capabilityPatterns.set(type, patterns);
  }

  /**
   * 获取所有可用能力
   */
  getCapabilities(): CapabilityType[] {
    return Array.from(this.capabilityPatterns.keys());
  }
}

export default CapabilityRouter;
