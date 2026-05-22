/**
 * Hybrid Module - 规则+生成式混合模块
 *
 * 提供规则引擎和混合解析能力
 * 源自"规则+生成式融合"设计模式
 */
export { RuleEngine } from './RuleEngine.js';

export type {
  HybridRule,
  RuleCondition,
  RuleAction,
  ResolutionContext,
  ResolutionResult,
} from './types.js';
