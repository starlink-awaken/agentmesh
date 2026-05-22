/**
 * OpenAI Skills 类型定义
 * 扩展基础技能定义以支持 OpenAI Skills 格式
 */
import type { SkillDefinition, ReferenceRoute } from '../types.js';

export type { ReferenceRoute } from '../types.js';

/**
 * OpenAI Skill 定义 - 扩展基础 SkillDefinition
 */
export interface OpenAISkillDefinition extends SkillDefinition {
  /** OpenAI Skill ID */
  openaiSkillId?: string;
  /** MCP 服务器配置 */
  mcpServers?: string[];
  /** 外部脚本 URL */
  externalScripts?: string[];
  /** YAML 配置 (来自 SKILL.md) */
  yamlConfig?: OpenAIYamlConfig;
}

/**
 * OpenAI YAML 配置结构
 * 从 SKILL.md 的 yaml 块提取
 */
export interface OpenAIYamlConfig {
  /** 显示名称 */
  display_name: string;
  /** 简短描述 */
  short_description: string;
  /** 默认提示词 */
  default_prompt: string;
}

/**
 * SKILL.md 解析结果
 */
export interface SkillMdParseResult {
  yaml: OpenAIYamlConfig;
  markdown: string;
}

/**
 * OpenAI Skill 源文件
 */
export interface OpenAISkillSource {
  /** 文件名 (不含扩展名) */
  filename: string;
  /** 技能定义 */
  definition: OpenAISkillDefinition;
  /** 原始 YAML 配置 */
  yaml: OpenAIYamlConfig;
  /** 详细描述 (Markdown) */
  markdown: string;
}
