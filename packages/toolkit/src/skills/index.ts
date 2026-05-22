/**
 * Skills Module - 技能系统
 *
 * Progressive Disclosure 模式：
 * - 初始只加载 SkillDefinition (~80 行核心内容)
 * - 根据上下文按需加载 references/
 */
export { SkillLoader } from './SkillLoader.js';
export { SkillRouter } from './SkillRouter.js';
export { SkillController, createSkillController, type ControllerConfig, type SkillScore } from './SkillController.js';
export { SkillExecutor, createSkillExecutor, createCustomExecutor, ActionBlockParser, DefaultRuleExecutor, type ExecutorConfig } from './SkillExecutor.js';
export * from './types.js';
export * from './builtIn.js';

// OpenAI Skills 导出
export * from './openai/index.js';

/**
 * 快速初始化技能系统
 */
import { SkillLoader } from './SkillLoader.js';
import { SkillRouter } from './SkillRouter.js';
import { builtInSkills } from './builtIn.js';
import { openAISkills } from './openai/index.js';

export function createSkillSystem() {
  const loader = new SkillLoader();
  loader.registerMany(builtInSkills);
  // 注册 OpenAI Skills
  loader.registerMany(openAISkills);
  const router = new SkillRouter(loader);
  return { loader, router };
}
