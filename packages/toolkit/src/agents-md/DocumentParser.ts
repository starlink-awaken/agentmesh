/**
 * DocumentParser - 文档解析与压缩器
 *
 * 实现 Vercel 风格的 8KB 压缩索引格式
 * 用于 AGENTS.md 文档的扫描、章节提取、重要性排序和压缩
 */

import type { Section, CompressedIndex, DocumentStats } from './types.js';

/**
 * 章节提取配置
 */
export interface ParserConfig {
  maxSectionLength?: number;
  minSectionLength?: number;
  extractCodeBlocks?: boolean;
  extractHeadings?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<ParserConfig> = {
  maxSectionLength: 2000,
  minSectionLength: 100,
  extractCodeBlocks: true,
  extractHeadings: true,
};

/**
 * 文档解析器
 *
 * @example
 * ```typescript
 * const parser = new DocumentParser();
 * const content = await fs.readFile('AGENTS.md', 'utf-8');
 * const sections = parser.parse(content);
 * const compressed = parser.compress(sections);
 * ```
 */
export class DocumentParser {
  private config: Required<ParserConfig>;

  constructor(config: ParserConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 解析文档内容，提取章节
   *
   * @param content - 原始文档内容
   * @returns 提取的章节列表
   */
  parse(content: string): Section[] {
    const sections: Section[] = [];
    const lines = content.split('\n');

    let currentSection: Section | null = null;
    let currentContent: string[] = [];
    let headingLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        // 保存之前的章节
        if (currentSection && currentContent.length > 0) {
          currentSection.content = currentContent.join('\n').trim();
          sections.push(this.calculateSectionImportance(currentSection));
        }

        // 开始新章节
        headingLevel = headingMatch[1].length;
        const title = headingMatch[2].trim();

        currentSection = {
          id: this.generateSectionId(title, sections.length),
          title,
          level: headingLevel,
          content: '',
          startLine: i + 1,
          endLine: i + 1,
          importance: 0,
          keywords: [],
        };
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
        currentSection.endLine = i + 1;
      }
    }

    // 保存最后一个章节
    if (currentSection && currentContent.length > 0) {
      currentSection.content = currentContent.join('\n').trim();
      sections.push(this.calculateSectionImportance(currentSection));
    }

    // 处理没有标题的文档（作为单一章节）
    if (sections.length === 0 && content.trim().length > 0) {
      sections.push(this.calculateSectionImportance({
        id: 'content',
        title: '内容',
        level: 1,
        content: content.trim(),
        startLine: 1,
        endLine: lines.length,
        importance: 0,
        keywords: [],
      }));
    }

    return sections;
  }

  /**
   * 提取代码块
   *
   * @param content - 文档内容
   * @returns 提取的代码块列表
   */
  extractCodeBlocks(content: string): Array<{ language: string; code: string; startLine: number }> {
    if (!this.config.extractCodeBlocks) return [];

    const codeBlocks: Array<{ language: string; code: string; startLine: number }> = [];
    const lines = content.split('\n');
    let inCodeBlock = false;
    let currentLanguage = '';
    let currentCode: string[] = [];
    let codeStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          currentLanguage = line.slice(3).trim() || 'text';
          currentCode = [];
          codeStartLine = i + 1;
        } else {
          inCodeBlock = false;
          codeBlocks.push({
            language: currentLanguage,
            code: currentCode.join('\n'),
            startLine: codeStartLine,
          });
        }
      } else if (inCodeBlock) {
        currentCode.push(line);
      }
    }

    return codeBlocks;
  }

  /**
   * 计算章节重要性分数
   *
   * @param section - 章节
   * @returns 带重要性分数的章节
   */
  private calculateSectionImportance(section: Section): Section {
    let importance = 0;

    // 标题长度贡献（简短精确的标题更重要）
    if (section.title.length > 0 && section.title.length <= 30) {
      importance += 0.2;
    }

    // 内容长度贡献
    const contentLength = section.content.length;
    if (contentLength >= this.config.minSectionLength) {
      importance += Math.min(0.3, contentLength / 10000);
    }

    // 标题关键词贡献
    const importantKeywords = [
      'usage', 'install', 'api', 'config', 'example', 'example',
      '使用', '安装', '配置', '示例', '接口', '参数', '返回',
      'important', 'warning', 'note', 'tip',
    ];

    const titleLower = section.title.toLowerCase();
    for (const keyword of importantKeywords) {
      if (titleLower.includes(keyword)) {
        importance += 0.15;
        break;
      }
    }

    // 代码块贡献
    const codeBlocks = this.extractCodeBlocks(section.content);
    importance += Math.min(0.2, codeBlocks.length * 0.1);

    // 列表/表格贡献（结构化内容）
    const hasList = /^[*-]\s/m.test(section.content);
    const hasTable = /\|.+\|/.test(section.content);
    if (hasList) importance += 0.1;
    if (hasTable) importance += 0.15;

    return {
      ...section,
      importance: Math.min(1, importance),
    };
  }

  /**
   * 压缩章节为 8KB 索引格式
   *
   * @param sections - 章节列表
   * @returns 压缩后的索引
   */
  compress(sections: Section[]): CompressedIndex {
    // 按重要性排序
    const sorted = [...sections].sort((a, b) => b.importance - a.importance);

    // 选择最重要的内容（目标约 8KB）
    const targetSize = 8 * 1024;
    const selected: Section[] = [];
    let currentSize = 0;

    for (const section of sorted) {
      const sectionSize = section.content.length + section.title.length + 200;

      if (currentSize + sectionSize <= targetSize) {
        selected.push(section);
        currentSize += sectionSize;
      } else if (selected.length === 0) {
        // 确保至少有一个章节
        selected.push({
          ...section,
          content: section.content.slice(0, targetSize - 300),
        });
        break;
      } else {
        break;
      }
    }

    // 按原始顺序重新排序
    selected.sort((a, b) => a.startLine - b.startLine);

    return {
      sections: selected,
      totalSections: sections.length,
      compressedSize: currentSize,
      originalSize: sections.reduce((sum, s) => sum + s.content.length + s.title.length, 0),
      metadata: {
        version: '1.0',
        createdAt: new Date().toISOString(),
        format: 'vercel-8kb',
      },
    };
  }

  /**
   * 生成章节 ID
   */
  private generateSectionId(title: string, index: number): string {
    const slug = title
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50);

    return slug || `section-${index}`;
  }

  /**
   * 获取文档统计信息
   *
   * @param content - 文档内容
   * @returns 统计信息
   */
  getStats(content: string): DocumentStats {
    const lines = content.split('\n');
    const sections = this.parse(content);
    const codeBlocks = this.extractCodeBlocks(content);

    return {
      totalLines: lines.length,
      totalChars: content.length,
      totalSections: sections.length,
      codeBlocks: codeBlocks.length,
      avgSectionLength: sections.length > 0
        ? sections.reduce((sum, s) => sum + s.content.length, 0) / sections.length
        : 0,
    };
  }
}

/**
 * 创建 DocumentParser 实例
 *
 * @param config - 配置选项
 * @returns DocumentParser 实例
 */
export function createDocumentParser(config?: ParserConfig): DocumentParser {
  return new DocumentParser(config);
}
