/**
 * KeywordExtractor - 关键词提取器
 *
 * 提供 TF-IDF 权重计算、技术术语识别和 n-gram 提取功能
 */

import type { Keyword, ExtractorConfig } from './types.js';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<ExtractorConfig> = {
  maxKeywords: 50,
  minKeywordLength: 2,
  useNgrams: true,
  ngramMin: 1,
  ngramMax: 3,
  useTFIDF: true,
};

/**
 * 技术术语模式
 */
const TECH_TERMS_PATTERNS = [
  // 编程语言
  /\b(JavaScript|TypeScript|Python|Java|Go|Rust|C\+\+|C#|Ruby|PHP|Kotlin|Swift)\b/gi,
  // 框架/库
  /\b(React|Vue|Angular|Node\.js|Express|NestJS|Django|Flask|Spring|Svelte)\b/gi,
  // 数据库
  /\b(MySQL|PostgreSQL|MongoDB|Redis|Elasticsearch|Cassandra|SQLite|Oracle)\b/gi,
  // 云服务
  /\b(AWS|Azure|GCP|Kubernetes|Docker|Heroku|Vercel|Netlify)\b/gi,
  // 前端
  /\b(HTML|CSS|SASS|LESS|Tailwind|Bootstrap|Webpack|Vite|Rollup)\b/gi,
  // API/协议
  /\b(REST|GraphQL|gRPC|WebSocket|AJAX|JSON|XML|YAML|TOML)\b/gi,
  // 开发工具
  /\b(Git|GitHub|GitLab|Jira|Docker Compose|Terraform|Prometheus)\b/gi,
  // AI/ML
  /\b(TensorFlow|PyTorch|OpenAI|HuggingFace|Pandas|NumPy|Scikit)\b/gi,
  // 概念术语
  /\b(API|SDK|CLI|IDE|CI\/CD|TDD|BDD|DDD|OOP|FP|MVC|MVVM)\b/gi,
];

/**
 * 中文技术术语
 */
const CN_TECH_TERMS = [
  '算法', '框架', '接口', '模块', '组件', '服务', '数据库', '缓存',
  '队列', '负载均衡', '微服务', '容器', '部署', '监控', '日志',
  '认证', '授权', '加密', '压缩', '索引', '分页', '查询', '事务',
];

/**
 * 关键词提取器
 *
 * @example
 * ```typescript
 * const extractor = new KeywordExtractor();
 * const text = 'This is a sample text about TypeScript and React development...';
 * const keywords = extractor.extract(text);
 * const weighted = extractor.calculateTFIDF(keywords, [text, anotherText]);
 * ```
 */
export class KeywordExtractor {
  private config: Required<ExtractorConfig>;

  constructor(config: ExtractorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 提取关键词
   *
   * @param text - 输入文本
   * @returns 关键词列表
   */
  extract(text: string): Keyword[] {
    const keywords: Map<string, Keyword> = new Map();

    // 1. 提取技术术语
    const techTerms = this.extractTechTerms(text);
    for (const term of techTerms) {
      keywords.set(term.text, {
        text: term.text,
        type: 'technical',
        frequency: term.count,
        score: term.count * 1.5, // 技术术语权重更高
      });
    }

    // 2. 提取 n-gram
    if (this.config.useNgrams) {
      const ngrams = this.extractNgrams(text);
      for (const ngram of ngrams) {
        const existing = keywords.get(ngram.text);
        if (existing) {
          existing.frequency += ngram.count;
          existing.score += ngram.count * 0.5;
        } else if (ngram.text.length >= this.config.minKeywordLength) {
          keywords.set(ngram.text, {
            text: ngram.text,
            type: 'ngram',
            frequency: ngram.count,
            score: ngram.count,
          });
        }
      }
    }

    // 3. 计算词频
    const words = this.tokenize(text);
    const wordFreq = this.calculateWordFrequency(words);

    for (const [word, count] of wordFreq.entries()) {
      // 跳过技术术语（已处理）
      if (keywords.has(word)) {
        keywords.get(word)!.frequency += count;
        keywords.get(word)!.score += count * 0.3;
        continue;
      }

      // 跳过短词
      if (word.length < this.config.minKeywordLength) continue;

      // 跳过停用词
      if (this.isStopWord(word)) continue;

      keywords.set(word, {
        text: word,
        type: 'word',
        frequency: count,
        score: count,
      });
    }

    // 排序并限制数量
    const sorted = Array.from(keywords.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxKeywords);

    return sorted;
  }

  /**
   * 提取技术术语
   *
   * @param text - 输入文本
   * @returns 技术术语列表
   */
  private extractTechTerms(text: string): Array<{ text: string; count: number }> {
    const terms: Map<string, number> = new Map();

    // 英文技术术语
    for (const pattern of TECH_TERMS_PATTERNS) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          terms.set(match.toLowerCase(), (terms.get(match.toLowerCase()) || 0) + 1);
        }
      }
    }

    // 中文技术术语
    for (const term of CN_TECH_TERMS) {
      const regex = new RegExp(term, 'g');
      const matches = text.match(regex);
      if (matches) {
        terms.set(term, matches.length);
      }
    }

    return Array.from(terms.entries())
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 提取 n-gram
   *
   * @param text - 输入文本
   * @returns n-gram 列表
   */
  private extractNgrams(text: string): Array<{ text: string; count: number }> {
    const words = this.tokenize(text);
    const ngrams: Map<string, number> = new Map();

    for (let n = this.config.ngramMin; n <= this.config.ngramMax; n++) {
      for (let i = 0; i <= words.length - n; i++) {
        const ngram = words.slice(i, i + n).join(' ');

        // 只保留有意义的 n-gram（至少有一个词长度 >= 3）
        const hasLongWord = words.slice(i, i + n).some(w => w.length >= 3);
        if (hasLongWord) {
          ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1);
        }
      }
    }

    return Array.from(ngrams.entries())
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 分词
   *
   * @param text - 输入文本
   * @returns 词列表
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
  }

  /**
   * 计算词频
   *
   * @param words - 词列表
   * @returns 词频 Map
   */
  private calculateWordFrequency(words: string[]): Map<string, number> {
    const freq: Map<string, number> = new Map();

    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    return freq;
  }

  /**
   * 检查是否为停用词
   *
   * @param word - 词
   * @returns 是否为停用词
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      // 英文停用词
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
      'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
      'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
      'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
      'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then',
      // 中文停用词
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
      '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有',
      '看', '好', '自己', '这', '那', '么', '之', '与', '而', '为', '由', '及',
    ]);

    return stopWords.has(word);
  }

  /**
   * 计算 TF-IDF 权重
   *
   * @param keywords - 关键词列表
   * @param documents - 文档列表
   * @returns 带 TF-IDF 权重的关键词
   */
  calculateTFIDF(keywords: Keyword[], documents: string[]): Keyword[] {
    if (!this.config.useTFIDF || documents.length <= 1) {
      return keywords;
    }

    const docCount = documents.length;

    // 计算每个词在多少个文档中出现
    const docFreq: Map<string, number> = new Map();
    for (const doc of documents) {
      const docKeywords = new Set(
        this.extract(doc).map(k => k.text)
      );
      for (const kw of docKeywords) {
        docFreq.set(kw, (docFreq.get(kw) || 0) + 1);
      }
    }

    // 计算 TF-IDF
    return keywords.map(kw => {
      const df = docFreq.get(kw.text) || 1;
      const idf = Math.log(docCount / df);

      return {
        ...kw,
        tfidf: kw.frequency * idf,
        idf,
      };
    }).sort((a, b) => (b.tfidf || b.score) - (a.tfidf || a.score));
  }

  /**
   * 从章节中提取关键词
   *
   * @param sections - 章节列表
   * @returns 带关键词的章节
   */
  extractFromSections(sections: Array<{ title: string; content: string }>): Map<string, Keyword[]> {
    const result: Map<string, Keyword[]> = new Map();

    for (const section of sections) {
      const fullText = `${section.title} ${section.content}`;
      const keywords = this.extract(fullText);

      // 标题中的关键词权重更高
      const titleKeywords = this.extract(section.title);
      for (const tk of titleKeywords) {
        const existing = keywords.find(k => k.text === tk.text);
        if (existing) {
          existing.score *= 1.5;
        }
      }

      result.set(section.title, keywords.sort((a, b) => b.score - a.score));
    }

    return result;
  }
}

/**
 * 创建 KeywordExtractor 实例
 *
 * @param config - 配置选项
 * @returns KeywordExtractor 实例
 */
export function createKeywordExtractor(config?: ExtractorConfig): KeywordExtractor {
  return new KeywordExtractor(config);
}
