/**
 * SKILL.md 转换器
 * 将 OpenAI 风格的 SKILL.md 转换为 SkillDefinition
 */
import type { OpenAISkillDefinition, OpenAIYamlConfig, SkillMdParseResult } from './types.js';

/**
 * 从 SKILL.md 内容解析 YAML 配置和 Markdown
 */
export function parseSkillMd(content: string): SkillMdParseResult {
  const yamlBlockMatch = content.match(/```yaml\n([\s\S]*?)```/);

  if (!yamlBlockMatch) {
    throw new Error('Invalid SKILL.md: missing yaml block');
  }

  const yamlContent = yamlBlockMatch[1];
  const yaml = parseYamlConfig(yamlContent);

  // 提取 yaml 块之后的内容作为 markdown
  const markdown = content.slice(yamlBlockMatch[0].length).trim();

  return { yaml, markdown };
}

/**
 * 解析 YAML 配置
 */
function parseYamlConfig(yamlContent: string): OpenAIYamlConfig {
  const config: OpenAIYamlConfig = {
    display_name: '',
    short_description: '',
    default_prompt: '',
  };

  const lines = yamlContent.split('\n');
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      const trimmedValue = value.trim();
      if (key === 'display_name') {
        config.display_name = trimmedValue;
      } else if (key === 'short_description') {
        config.short_description = trimmedValue;
      } else if (key === 'default_prompt') {
        config.default_prompt = trimmedValue;
      }
    }
  }

  return config;
}

/**
 * 将 YAML 配置转换为 SkillDefinition
 */
export function convertYamlToSkillDefinition(
  yaml: OpenAIYamlConfig,
  markdown: string
): OpenAISkillDefinition {
  const id = yaml.display_name.toLowerCase().replace(/\s+/g, '-');

  return {
    id,
    name: yaml.display_name,
    description: yaml.short_description,
    longDescription: markdown,
    triggers: generateTriggers(yaml.display_name, yaml.short_description),
    role: inferRole(markdown),
    scope: inferScope(markdown),
    outputFormat: inferOutputFormat(markdown),
    category: inferCategory(yaml.display_name),
    dependencies: [],
    references: [],
    yamlConfig: yaml,
  };
}

/**
 * 从显示名称和描述生成触发关键词
 */
function generateTriggers(displayName: string, shortDescription: string): string[] {
  const triggers: string[] = [];

  // 添加显示名称的关键词
  const nameWords = displayName.toLowerCase().split(/\s+/);
  triggers.push(...nameWords);

  // 添加描述中的关键词
  const descWords = shortDescription.toLowerCase().split(/\s+/);
  triggers.push(...descWords.filter((w) => w.length > 3));

  // 添加常见变体
  triggers.push(displayName.toLowerCase());

  return [...new Set(triggers)];
}

/**
 * 从 Markdown 内容推断角色
 */
function inferRole(markdown: string): OpenAISkillDefinition['role'] {
  const content = markdown.toLowerCase();

  if (content.includes('architect') || content.includes('design') || content.includes('architecture')) {
    return 'architect';
  }
  if (content.includes('review') || content.includes('audit') || content.includes('check')) {
    return 'reviewer';
  }
  if (content.includes('implement') || content.includes('build') || content.includes('create')) {
    return 'specialist';
  }

  return 'generalist';
}

/**
 * 从 Markdown 内容推断作用域
 */
function inferScope(markdown: string): OpenAISkillDefinition['scope'] {
  const content = markdown.toLowerCase();

  if (content.includes('design') || content.includes('architecture') || content.includes('model')) {
    return 'design';
  }
  if (content.includes('analyze') || content.includes('review') || content.includes('audit')) {
    return 'analysis';
  }
  if (content.includes('plan') || content.includes('strategy') || content.includes('roadmap')) {
    return 'planning';
  }
  if (content.includes('implement') || content.includes('build') || content.includes('code')) {
    return 'implementation';
  }

  return 'implementation';
}

/**
 * 从 Markdown 内容推断输出格式
 */
function inferOutputFormat(markdown: string): OpenAISkillDefinition['outputFormat'] {
  const content = markdown.toLowerCase();

  if (content.includes('code') || content.includes('script') || content.includes('implement')) {
    return 'code';
  }
  if (content.includes('analyze') || content.includes('report') || content.includes('document')) {
    return 'text';
  }

  return 'mixed';
}

/**
 * 从显示名称推断分类
 */
function inferCategory(displayName: string): string {
  const name = displayName.toLowerCase();

  if (name.includes('figma') || name.includes('design') || name.includes('ui') || name.includes('ux')) {
    return 'design';
  }
  if (name.includes('security') || name.includes('secure') || name.includes('vulnerability')) {
    return 'security';
  }
  if (name.includes('test') || name.includes('playwright') || name.includes('e2e')) {
    return 'testing';
  }
  if (name.includes('deploy') || name.includes('vercel') || name.includes('host')) {
    return 'deployment';
  }
  if (name.includes('doc') || name.includes('document') || name.includes('markdown')) {
    return 'documentation';
  }

  return 'tool';
}

/**
 * 创建完整的 OpenAI Skill 定义
 */
export function createOpenAISkill(
  filename: string,
  skillMdContent: string
): OpenAISkillDefinition {
  const { yaml, markdown } = parseSkillMd(skillMdContent);
  return convertYamlToSkillDefinition(yaml, markdown);
}
