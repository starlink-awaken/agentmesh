/**
 * OpenAI Skills 模块
 *
 * 提供 OpenAI 风格的 Skills 支持，包括：
 * - 类型定义扩展
 * - SKILL.md 转换器
 * - 核心技能库
 */
export type { OpenAISkillDefinition, OpenAIYamlConfig, SkillMdParseResult, OpenAISkillSource } from './types.js';

export { parseSkillMd, convertYamlToSkillDefinition, createOpenAISkill } from './converter.js';

// 核心技能导出
export { figmaSkill } from './figma.js';
export { securityBestPracticesSkill } from './security-best-practices.js';
export { playwrightSkill } from './playwright.js';
export { vercelDeploySkill } from './vercel-deploy.js';
export { docSkill } from './doc.js';
export { agentToolkitSkill } from './agent-toolkit.js';

/**
 * 所有 OpenAI 核心技能
 */
import type { OpenAISkillDefinition } from './types.js';
import { figmaSkill } from './figma.js';
import { securityBestPracticesSkill } from './security-best-practices.js';
import { playwrightSkill } from './playwright.js';
import { vercelDeploySkill } from './vercel-deploy.js';
import { docSkill } from './doc.js';
import { agentToolkitSkill } from './agent-toolkit.js';

/**
 * OpenAI Skills 列表
 */
export const openAISkills: OpenAISkillDefinition[] = [
  figmaSkill,
  securityBestPracticesSkill,
  playwrightSkill,
  vercelDeploySkill,
  docSkill,
  agentToolkitSkill,
];

/**
 * 根据 ID 获取 OpenAI Skill
 */
export function getOpenAISkillById(id: string): OpenAISkillDefinition | undefined {
  return openAISkills.find((skill) => skill.id === id);
}

/**
 * 根据触发词查找匹配的 OpenAI Skill
 */
export function findOpenAISkillByTrigger(trigger: string): OpenAISkillDefinition | undefined {
  const normalizedTrigger = trigger.toLowerCase();
  return openAISkills.find((skill) =>
    skill.triggers.some((t) => t.toLowerCase().includes(normalizedTrigger))
  );
}
