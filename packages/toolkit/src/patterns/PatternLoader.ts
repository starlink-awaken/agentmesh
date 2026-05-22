/**
 * PatternLoader - Fabric 模式加载器
 *
 * 提供模式加载、执行和管理能力
 *
 * @author PAI
 * @version 1.0.0
 */

import type { PatternDefinition, PatternResult } from './types.js';
import {
  allPatterns,
  getPatternById,
  getPatternsByCategory,
  searchPatterns,
  type PatternCategory
} from './fabric.js';

/**
 * 模式执行器选项
 */
export interface PatternLoaderConfig {
  /** 模式目录路径（预留） */
  patternsDir?: string;
  /** 是否启用自定义模式 */
  allowCustom?: boolean;
  /** 最大执行时间 */
  timeout?: number;
}

/**
 * PatternLoader 类
 *
 * 提供 Fabric 模式的加载和执行能力
 */
export class PatternLoader {
  private config: Required<PatternLoaderConfig>;
  private customPatterns: Map<string, PatternDefinition>;

  constructor(config: PatternLoaderConfig = {}) {
    this.config = {
      patternsDir: config.patternsDir ?? './patterns',
      allowCustom: config.allowCustom ?? true,
      timeout: config.timeout ?? 30000,
    };

    this.customPatterns = new Map();
  }

  /**
   * 加载指定 ID 的模式
   */
  load(patternId: string): PatternExecutor {
    const pattern = this.getPattern(patternId);

    if (!pattern) {
      throw new Error(`模式未找到: ${patternId}`);
    }

    return new PatternExecutor(pattern);
  }

  /**
   * 获取模式定义
   */
  getPattern(patternId: string): PatternDefinition | undefined {
    // 先查找内置模式
    const builtIn = getPatternById(patternId);
    if (builtIn) return builtIn;

    // 再查找自定义模式
    return this.customPatterns.get(patternId);
  }

  /**
   * 按分类获取模式
   */
  getByCategory(category: PatternCategory): PatternDefinition[] {
    return getPatternsByCategory(category);
  }

  /**
   * 搜索模式
   */
  search(keyword: string): PatternDefinition[] {
    return searchPatterns(keyword);
  }

  /**
   * 获取所有可用模式
   */
  list(): PatternDefinition[] {
    return allPatterns;
  }

  /**
   * 注册自定义模式
   */
  register(pattern: PatternDefinition): void {
    if (!this.config.allowCustom) {
      throw new Error('不允许注册自定义模式');
    }

    // 验证必填字段
    if (!pattern.id || !pattern.name || !pattern.template) {
      throw new Error('模式定义缺少必填字段');
    }

    this.customPatterns.set(pattern.id, pattern);
  }

  /**
   * 获取模式列表（包含分类）
   */
  getPatternTree(): Record<PatternCategory, PatternDefinition[]> {
    return {
      analyze: this.getByCategory('analyze'),
      extract: this.getByCategory('extract'),
      summarize: this.getByCategory('summarize'),
      transform: this.getByCategory('transform'),
    };
  }
}

/**
 * PatternExecutor - 模式执行器
 *
 * 执行具体的模式模板
 */
export class PatternExecutor {
  private pattern: PatternDefinition;

  constructor(pattern: PatternDefinition) {
    this.pattern = pattern;
  }

  /**
   * 执行模式
   */
  async execute(
    variables: Record<string, string>,
    options?: {
      /** 自定义 LLM 调用函数 */
      llm?: (prompt: string) => Promise<string>;
      /** 其他选项 */
      [key: string]: any;
    }
  ): Promise<PatternResult> {
    try {
      // 1. 验证变量
      this.validateVariables(variables);

      // 2. 生成 prompt
      const prompt = this.generatePrompt(variables);

      // 3. 调用 LLM（如果提供了调用函数）
      let output: string;
      if (options?.llm) {
        output = await options.llm(prompt);
      } else {
        // 默认返回模板（用于测试）
        output = prompt;
      }

      return {
        success: true,
        output,
        metadata: {
          patternId: this.pattern.id,
          patternName: this.pattern.name,
          variables,
        },
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        metadata: {
          patternId: this.pattern.id,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * 验证变量
   */
  private validateVariables(variables: Record<string, string>): void {
    for (const varName of this.pattern.variables) {
      if (!(varName in variables)) {
        throw new Error(`缺少必需变量: ${varName}`);
      }
    }
  }

  /**
   * 生成 prompt
   */
  private generatePrompt(variables: Record<string, string>): string {
    let prompt = this.pattern.template;

    // 替换变量占位符
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    return prompt;
  }

  /**
   * 获取模式信息
   */
  getInfo(): PatternDefinition {
    return { ...this.pattern };
  }
}

export default PatternLoader;
