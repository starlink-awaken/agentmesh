/**
 * ADRManager - 架构决策记录管理工具
 *
 * ADR (Architecture Decision Record) 生命周期管理
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * ADR 状态
 */
export type ADRStatus =
  | 'proposed'    // 提议中
  | 'accepted'    // 已接受
  | 'deprecated'  // 已废弃
  | 'superseded'  // 已替代
  | 'rejected';   // 已拒绝

/**
 * ADR 记录
 */
export interface ADRRecord {
  id: string;
  title: string;
  status: ADRStatus;
  context: string;      // 背景/问题描述
  decision: string;    // 决策内容
  consequences: string[];  // 后果/影响
  supersedes?: string;     // 替代的 ADR ID
  supersededBy?: string;   // 被哪个 ADR 替代
  createdAt: number;
  updatedAt: number;
  author?: string;
  tags?: string[];
}

/**
 * ADR 查询选项
 */
export interface ADRSearchOptions {
  status?: ADRStatus[];
  tags?: string[];
  keyword?: string;
  dateRange?: { from: number; to: number };
}

/**
 * ADRManager 类
 *
 * 提供 ADR 的创建、查询、管理能力
 */
export class ADRManager {
  private records: Map<string, ADRRecord> = new Map();

  /**
   * 创建新的 ADR
   */
  create(record: Omit<ADRRecord, 'id' | 'createdAt' | 'updatedAt'>): ADRRecord {
    const id = this.generateId(record.title);
    const now = Date.now();

    const newRecord: ADRRecord = {
      ...record,
      id,
      createdAt: now,
      updatedAt: now,
    };

    // 如果有替代关系，更新相关记录
    if (record.supersedes) {
      const superseded = this.records.get(record.supersedes);
      if (superseded) {
        this.records.set(record.supersedes, {
          ...superseded,
          status: 'superseded',
          supersededBy: id,
          updatedAt: now,
        });
      }
    }

    this.records.set(id, newRecord);
    return newRecord;
  }

  /**
   * 更新 ADR
   */
  update(id: string, updates: Partial<ADRRecord>): ADRRecord | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;

    const updated: ADRRecord = {
      ...record,
      ...updates,
      id: record.id,
      createdAt: record.createdAt,
      updatedAt: Date.now(),
    };

    this.records.set(id, updated);
    return updated;
  }

  /**
   * 获取 ADR
   */
  get(id: string): ADRRecord | undefined {
    return this.records.get(id);
  }

  /**
   * 删除 ADR
   */
  delete(id: string): boolean {
    return this.records.delete(id);
  }

  /**
   * 搜索 ADR
   */
  search(options: ADRSearchOptions): ADRRecord[] {
    let results = Array.from(this.records.values());

    // 按状态过滤
    if (options.status && options.status.length > 0) {
      results = results.filter(r => options.status!.includes(r.status));
    }

    // 按标签过滤
    if (options.tags && options.tags.length > 0) {
      results = results.filter(r =>
        r.tags && options.tags!.some(tag => r.tags!.includes(tag))
      );
    }

    // 按关键词搜索
    if (options.keyword) {
      const keyword = options.keyword.toLowerCase();
      results = results.filter(r =>
        r.title.toLowerCase().includes(keyword) ||
        r.context.toLowerCase().includes(keyword) ||
        r.decision.toLowerCase().includes(keyword)
      );
    }

    // 按日期范围过滤
    if (options.dateRange) {
      results = results.filter(r =>
        r.createdAt >= options.dateRange!.from &&
        r.createdAt <= options.dateRange!.to
      );
    }

    return results;
  }

  /**
   * 获取所有 ADR
   */
  list(): ADRRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * 获取最新创建的 ADR
   */
  getLatest(count: number = 10): ADRRecord[] {
    const all = Array.from(this.records.values());
    all.sort((a, b) => b.createdAt - a.createdAt);
    return all.slice(0, count);
  }

  /**
   * 获取所有有效（未被废弃）的 ADR
   */
  getActive(): ADRRecord[] {
    return Array.from(this.records.values()).filter(
      r => r.status === 'accepted' || r.status === 'proposed'
    );
  }

  /**
   * 状态转换
   */
  changeStatus(id: string, newStatus: ADRStatus): ADRRecord | undefined {
    return this.update(id, { status: newStatus });
  }

  /**
   * 生成 ADR ID
   */
  private generateId(title: string): string {
    const prefix = 'ADR';
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

    // 检查是否已存在
    let id = `${prefix}-${slug}`;
    let counter = 1;

    while (this.records.has(id)) {
      id = `${prefix}-${slug}-${counter}`;
      counter++;
    }

    return id;
  }

  /**
   * 导出为 Markdown
   */
  toMarkdown(id: string): string | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;

    const lines: string[] = [];

    lines.push(`# ${record.id}: ${record.title}`);
    lines.push('');
    lines.push(`**状态**: ${this.statusToChinese(record.status)}`);
    if (record.author) {
      lines.push(`**作者**: ${record.author}`);
    }
    if (record.tags && record.tags.length > 0) {
      lines.push(`**标签**: ${record.tags.join(', ')}`);
    }
    lines.push(`**创建时间**: ${new Date(record.createdAt).toLocaleDateString('zh-CN')}`);
    lines.push('');

    lines.push('## 背景');
    lines.push('');
    lines.push(record.context);
    lines.push('');

    lines.push('## 决策');
    lines.push('');
    lines.push(record.decision);
    lines.push('');

    lines.push('## 后果');
    lines.push('');
    for (const consequence of record.consequences) {
      lines.push(`- ${consequence}`);
    }

    if (record.supersedes) {
      lines.push('');
      lines.push(`**替代**: ${record.supersedes}`);
    }

    if (record.supersededBy) {
      lines.push('');
      lines.push(`**被替代**: ${record.supersededBy}`);
    }

    return lines.join('\n');
  }

  /**
   * 状态转中文
   */
  private statusToChinese(status: ADRStatus): string {
    const map: Record<ADRStatus, string> = {
      proposed: '提议中',
      accepted: '已接受',
      deprecated: '已废弃',
      superseded: '已替代',
      rejected: '已拒绝',
    };
    return map[status];
  }

  /**
   * 导出所有为 Markdown 目录
   */
  exportAll(dirPath?: string): string {
    const records = Array.from(this.records.values());

    let output = '# 架构决策记录\n\n';
    output += '## 索引\n\n';

    // 按状态分组
    const byStatus: Record<ADRStatus, ADRRecord[]> = {
      proposed: [],
      accepted: [],
      deprecated: [],
      superseded: [],
      rejected: [],
    };

    for (const record of records) {
      byStatus[record.status].push(record);
    }

    // 输出索引
    for (const [status, list] of Object.entries(byStatus)) {
      if (list.length > 0) {
        output += `### ${this.statusToChinese(status as ADRStatus)}\n\n`;
        for (const record of list.sort((a, b) => b.createdAt - a.createdAt)) {
          output += `- [${record.id}: ${record.title}](./${dirPath || ''}${record.id}.md)\n`;
        }
        output += '\n';
      }
    }

    return output;
  }

  /**
   * 导出为 JSON
   */
  toJSON(): ADRRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * 从 JSON 导入
   */
  static fromJSON(records: ADRRecord[]): ADRManager {
    const manager = new ADRManager();
    for (const record of records) {
      manager.records.set(record.id, record);
    }
    return manager;
  }
}

export default ADRManager;
