/**
 * ISCGenerator - ISC（Ideal State Criteria）标准生成器
 *
 * 自动从任务描述中生成可测试、可验证的标准
 *
 * @author PAI
 * @version 1.0.0
 */

import type { ISCCriterion } from './types.js';

/**
 * ISC 生成配置
 */
export interface ISCGeneratorConfig {
  /** 最大生成数量 */
  maxCriteria?: number;
  /** 是否包含反面标准 */
  includeNegative?: boolean;
  /** 语言 */
  language?: 'zh' | 'en';
}

/**
 * ISCGenerator 类
 *
 * 提供 ISC 标准的自动生成能力
 */
export class ISCGenerator {
  private config: Required<ISCGeneratorConfig>;

  constructor(config: ISCGeneratorConfig = {}) {
    this.config = {
      maxCriteria: config.maxCriteria ?? 10,
      includeNegative: config.includeNegative ?? true,
      language: config.language ?? 'zh',
    };
  }

  /**
   * 从任务描述生成 ISC 标准
   */
  static generate(task: string, config?: ISCGeneratorConfig): ISCCriterion[] {
    const generator = new ISCGenerator(config);
    return generator.generateFromTask(task);
  }

  /**
   * 从任务生成 ISC 标准
   */
  generateFromTask(task: string): ISCCriterion[] {
    const criteria: ISCCriterion[] = [];
    const taskLower = task.toLowerCase();

    // 1. 添加功能性标准
    criteria.push(...this.extractFunctionalCriteria(task));

    // 2. 添加非功能性标准（性能、安全等）
    criteria.push(...this.extractNonFunctionalCriteria(task));

    // 3. 提取约束条件
    criteria.push(...this.extractConstraints(task));

    // 4. 提取反面标准（不要做什么）
    if (this.config.includeNegative) {
      criteria.push(...this.extractNegativeCriteria(task));
    }

    // 5. 添加通用质量标准
    criteria.push(...this.extractQualityCriteria(task));

    // 去重并限制数量
    const unique = this.deduplicate(criteria);
    return unique.slice(0, this.config.maxCriteria);
  }

  /**
   * 提取功能性标准
   */
  private extractFunctionalCriteria(task: string): ISCCriterion[] {
    const criteria: ISCCriterion[] = [];
    const taskLower = task.toLowerCase();

    // 登录/认证相关
    if (taskLower.includes('登录') || taskLower.includes('认证') || taskLower.includes('auth')) {
      criteria.push(this.createCriterion('用户可以成功登录系统'));
      criteria.push(this.createCriterion('登录失败时显示错误提示'));
      criteria.push(this.createCriterion('支持记住密码功能'));
    }

    // CRUD 操作
    if (taskLower.includes('创建') || taskLower.includes('添加')) {
      criteria.push(this.createCriterion('可以成功创建新记录'));
      criteria.push(this.createCriterion('创建时进行数据验证'));
    }

    if (taskLower.includes('查询') || taskLower.includes('获取')) {
      criteria.push(this.createCriterion('可以成功查询数据'));
      criteria.push(this.createCriterion('查询结果正确返回'));
    }

    if (taskLower.includes('更新') || taskLower.includes('修改')) {
      criteria.push(this.createCriterion('可以成功更新数据'));
      criteria.push(this.createCriterion('更新后数据一致'));
    }

    if (taskLower.includes('删除')) {
      criteria.push(this.createCriterion('可以成功删除数据'));
      criteria.push(this.createCriterion('删除前有确认提示'));
    }

    // API 相关
    if (taskLower.includes('api') || taskLower.includes('接口')) {
      criteria.push(this.createCriterion('API 返回正确格式'));
      criteria.push(this.createCriterion('API 错误码定义清晰'));
    }

    // 数据库相关
    if (taskLower.includes('数据库') || taskLower.includes('存储')) {
      criteria.push(this.createCriterion('数据持久化成功'));
      criteria.push(this.createCriterion('数据查询性能可接受'));
    }

    // 前端/界面相关
    if (taskLower.includes('界面') || taskLower.includes('前端') || taskLower.includes('ui')) {
      criteria.push(this.createCriterion('界面正确渲染'));
      criteria.push(this.createCriterion('用户交互响应及时'));
    }

    return criteria;
  }

  /**
   * 提取非功能性标准
   */
  private extractNonFunctionalCriteria(task: string): ISCCriterion[] {
    const criteria: ISCCriterion[] = [];
    const taskLower = task.toLowerCase();

    // 性能
    if (taskLower.includes('性能') || taskLower.includes('优化') || taskLower.includes('performance')) {
      criteria.push(this.createCriterion('响应时间在可接受范围内'));
      criteria.push(this.createCriterion('无明显卡顿'));
    }

    // 安全
    if (taskLower.includes('安全') || taskLower.includes('权限') || taskLower.includes('security')) {
      criteria.push(this.createCriterion('未授权访问被拒绝'));
      criteria.push(this.createCriterion('敏感数据加密存储'));
      criteria.push(this.createCriterion('输入进行安全过滤'));
    }

    // 可靠性
    if (taskLower.includes('可靠') || taskLower.includes('稳定')) {
      criteria.push(this.createCriterion('异常情况正确处理'));
      criteria.push(this.createCriterion('系统持续稳定运行'));
    }

    // 可用性
    if (taskLower.includes('可用') || taskLower.includes('易用')) {
      criteria.push(this.createCriterion('操作流程清晰'));
      criteria.push(this.createCriterion('错误提示友好'));
    }

    return criteria;
  }

  /**
   * 提取约束条件
   */
  private extractConstraints(task: string): ISCCriterion[] {
    const criteria: ISCCriterion[] = [];
    const constraints = this.parseConstraints(task);

    for (const constraint of constraints) {
      criteria.push(this.createCriterion(`满足约束: ${constraint}`));
    }

    return criteria;
  }

  /**
   * 解析约束条件
   */
  private parseConstraints(task: string): string[] {
    const constraints: string[] = [];

    // 匹配方括号约束 [xxx]
    const bracketMatch = task.match(/\[([^\]]+)\]/g);
    if (bracketMatch) {
      constraints.push(...bracketMatch.map(m => m.slice(1, -1)));
    }

    // 匹配括号约束 (xxx)
    const parenMatch = task.match(/\(([^)]+)\)/g);
    if (parenMatch) {
      constraints.push(...parenMatch.map(m => m.slice(1, -1)));
    }

    // 匹配 "使用/采用/基于 xxx" 模式
    const usePatterns = [/使用(\S+)/g, /采用(\S+)/g, /基于(\S+)/g];
    for (const pattern of usePatterns) {
      const matches = task.match(pattern);
      if (matches) {
        constraints.push(...matches.map(m => m.replace(pattern, '$1')));
      }
    }

    return constraints;
  }

  /**
   * 提取反面标准
   */
  private extractNegativeCriteria(task: string): ISCCriterion[] {
    const criteria: ISCCriterion[] = [];

    // 匹配否定词
    const negatives = [
      { pattern: /不(.*?)的/g, desc: '不$1' },
      { pattern: /不要(.*)/g, desc: '不要$1' },
      { pattern: /禁止(.*)/g, desc: '禁止$1' },
      { pattern: /避免(.*)/g, desc: '避免$1' },
      { pattern: /防止(.*)/g, desc: '防止$1' },
    ];

    for (const { pattern, desc } of negatives) {
      const matches = task.match(pattern);
      if (matches) {
        for (const match of matches) {
          criteria.push(this.createCriterion(`确保不: ${match.replace(pattern, desc)}`));
        }
      }
    }

    return criteria;
  }

  /**
   * 提取通用质量标准
   */
  private extractQualityCriteria(task: string): ISCCriterion[] {
    const criteria: ISCCriterion[] = [];

    // 添加通用代码质量标准
    if (task.includes('代码') || task.includes('实现') || task.includes('开发')) {
      criteria.push(this.createCriterion('代码符合规范'));
      criteria.push(this.createCriterion('包含必要的注释'));
      criteria.push(this.createCriterion('错误处理完善'));
    }

    // 添加测试相关
    if (!task.includes('测试')) {
      criteria.push(this.createCriterion('功能测试通过'));
    }

    return criteria;
  }

  /**
   * 创建单个标准
   */
  private createCriterion(description: string): ISCCriterion {
    return {
      id: this.generateId(),
      description: this.normalizeDescription(description),
      status: 'pending',
    };
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `isc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 标准化描述
   */
  private normalizeDescription(desc: string): string {
    // 移除多余空格
    let normalized = desc.replace(/\s+/g, ' ').trim();

    // 确保不超过 8 个词（中文按字符计数）
    const words = normalized.split(/[\s,，。,.!?]+/).filter(w => w.length > 0);

    if (this.config.language === 'zh') {
      // 中文：按字符限制
      if (normalized.length > 50) {
        normalized = normalized.slice(0, 50) + '...';
      }
    } else {
      // 英文：按词数限制
      if (words.length > 8) {
        normalized = words.slice(0, 8).join(' ') + '...';
      }
    }

    return normalized;
  }

  /**
   * 去重
   */
  private deduplicate(criteria: ISCCriterion[]): ISCCriterion[] {
    const seen = new Set<string>();
    const result: ISCCriterion[] = [];

    for (const criterion of criteria) {
      const key = criterion.description.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(criterion);
      }
    }

    return result;
  }

  /**
   * 验证标准是否满足
   */
  static verify(criteria: ISCCriterion[], evidence: any): ISCCriterion[] {
    return criteria.map(c => ({
      ...c,
      status: evidence ? 'completed' : 'failed',
      evidence: evidence ? `验证证据: ${JSON.stringify(evidence)}` : undefined,
    }));
  }
}

export default ISCGenerator;
