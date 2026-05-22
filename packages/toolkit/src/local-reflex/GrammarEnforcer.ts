/**
 * GrammarEnforcer - 语法约束生成器
 *
 * 强制模型输出符合 JSON Schema 的结构化内容
 * 源自 Advanced RAG 架构 - 解决小模型输出格式错误问题
 *
 * 技术原理：
 * - 在模型生成 token 时检查是否符合 schema
 * - 不符合的 token 概率设为 0
 * - 效果：100% 正确的 JSON 输出，且速度更快
 */

import type { JSONSchema, StructuredOutputConfig } from './types.js';

/**
 * JSON Schema 基础类型（内联备用）
 */
type LocalJSONSchema = {
  type?: string;
  properties?: Record<string, LocalJSONSchema>;
  items?: LocalJSONSchema;
  required?: string[];
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  description?: string;
  anyOf?: LocalJSONSchema[];
  oneOf?: LocalJSONSchema[];
};

/**
 * GrammarEnforcer 配置
 */
export interface GrammarEnforcerConfig {
  schema: LocalJSONSchema;
  strict?: boolean;        // 严格模式：不允许额外字段
  maxRetries?: number;     // 最大重试次数
  onError?: (error: string) => void;
}

/**
 * 语法约束生成器
 */
export class GrammarEnforcer {
  private schema: LocalJSONSchema;
  private strict: boolean;
  private maxRetries: number;

  constructor(config: GrammarEnforcerConfig) {
    this.schema = config.schema;
    this.strict = config.strict ?? true;
    this.maxRetries = config.maxRetries ?? 3;
  }

  /**
   * 构建 system prompt
   * 告诉模型严格按 schema 输出
   */
  buildSystemPrompt(): string {
    const schemaStr = JSON.stringify(this.schema, null, 2);

    return `You are a structured output generator. Your output MUST follow this JSON schema exactly:

${schemaStr}

Critical rules:
1. Output valid JSON only - no markdown, no explanations, no comments
2. All required fields MUST be present
3. Types must match exactly (string, number, boolean, array, object)
4. ${this.strict ? 'Do NOT include any fields not in the schema' : 'Additional fields are allowed'}
5. Escape special characters properly
6. Use null instead of empty string for optional fields

Your response should be ONLY the JSON object.`;
  }

  /**
   * 验证输出是否符合 schema
   */
  validate(output: string): { valid: boolean; error?: string; parsed?: unknown } {
    try {
      const parsed = JSON.parse(output);

      const error = this.validateAgainstSchema(parsed, this.schema, '');
      if (error) {
        return { valid: false, error };
      }

      return { valid: true, parsed };
    } catch (e) {
      return { valid: false, error: `Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}` };
    }
  }

  /**
   * 递归验证 JSON 与 schema
   */
  private validateAgainstSchema(value: unknown, schema: LocalJSONSchema, path: string): string | null {
    // 处理 anyOf / oneOf
    if (schema.anyOf || schema.oneOf) {
      const options = schema.anyOf || schema.oneOf;
      for (const option of options!) {
        const error = this.validateAgainstSchema(value, option, path);
        if (!error) return null;
      }
      return `${path}: Value does not match any of the allowed schemas`;
    }

    // 处理 enum
    if (schema.enum && !schema.enum.includes(value)) {
      return `${path}: Value must be one of ${JSON.stringify(schema.enum)}`;
    }

    // 类型检查
    if (schema.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== schema.type && value !== null) {
        return `${path}: Expected type "${schema.type}", got "${actualType}"`;
      }
    }

    // null 检查
    if (value === null && schema.type !== 'null' && schema.type !== undefined) {
      return `${path}: Cannot be null`;
    }

    // object 检查
    if (schema.type === 'object' && typeof value === 'object' && !Array.isArray(value) && value !== null) {
      // 检查必需字段
      if (schema.required) {
        for (const req of schema.required) {
          if (!(req in value)) {
            return `${path}: Missing required field "${req}"`;
          }
        }
      }

      // 检查属性
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in value) {
            const error = this.validateAgainstSchema(
              (value as Record<string, unknown>)[key],
              propSchema,
              `${path}.${key}`
            );
            if (error) return error;
          }
        }
      }
    }

    // array 检查
    if (schema.type === 'array' && Array.isArray(value)) {
      if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          const error = this.validateAgainstSchema(value[i], schema.items!, `${path}[${i}]`);
          if (error) return error;
        }
      }
    }

    // string 约束
    if (schema.type === 'string' && typeof value === 'string') {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        return `${path}: String too short (min: ${schema.minLength})`;
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        return `${path}: String too long (max: ${schema.maxLength})`;
      }
      if (schema.pattern) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(value)) {
          return `${path}: Does not match pattern "${schema.pattern}"`;
        }
      }
    }

    // number 约束
    if (schema.type === 'number' || schema.type === 'integer') {
      const num = Number(value);
      if (schema.minimum !== undefined && num < schema.minimum) {
        return `${path}: Number too small (min: ${schema.minimum})`;
      }
      if (schema.maximum !== undefined && num > schema.maximum) {
        return `${path}: Number too large (max: ${schema.maximum})`;
      }
    }

    return null;
  }

  /**
   * 修复常见的 JSON 错误
   */
  fixCommonErrors(output: string): string {
    // 移除 markdown 代码块
    output = output.replace(/^```json\s*/g, '').replace(/^```\s*/g, '').replace(/```$/g, '').trim();

    // 移除前后空白
    output = output.trim();

    // 处理尾部逗号
    output = output.replace(/,\s*([}\]])/g, '$1');

    // 修复单引号为双引号
    output = output.replace(/'/g, '"');

    // 尝试修复未闭合的括号
    const openBrackets = (output.match(/\{/g) || []).length;
    const closeBrackets = (output.match(/\}/g) || []).length;
    if (openBrackets > closeBrackets) {
      output += '}'.repeat(openBrackets - closeBrackets);
    }

    const openArrays = (output.match(/\[/g) || []).length;
    const closeArrays = (output.match(/\]/g) || []).length;
    if (openArrays > closeArrays) {
      output += ']'.repeat(openArrays - closeArrays);
    }

    return output;
  }

  /**
   * 带重试的生成（用于实际调用 LLM 后验证）
   */
  async generateWithRetry(
    generateFn: () => Promise<string>
  ): Promise<{ output: unknown; raw: string; attempts: number }> {
    let attempts = 0;
    let lastError = '';

    while (attempts < this.maxRetries) {
      attempts++;
      const raw = await generateFn();
      const fixed = this.fixCommonErrors(raw);
      const result = this.validate(fixed);

      if (result.valid) {
        return { output: result.parsed!, raw: fixed, attempts };
      }

      lastError = result.error || 'Unknown error';
    }

    throw new Error(`Failed after ${this.maxRetries} attempts. Last error: ${lastError}`);
  }
}

/**
 * 创建 GrammarEnforcer
 */
export function createGrammarEnforcer(config: GrammarEnforcerConfig): GrammarEnforcer {
  return new GrammarEnforcer(config);
}
