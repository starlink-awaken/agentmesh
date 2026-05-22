/**
 * Hybrid Types - 规则+生成式混合类型定义
 */

import type { AgentTool } from '../tools/types.js';

/**
 * HybridRule - 混合规则
 */
export interface HybridRule {
  id: string;
  name: string;
  condition: RuleCondition;
  action: RuleAction;
  priority: number;
  enabled: boolean;
}

/**
 * RuleCondition - 规则条件
 */
export interface RuleCondition {
  type: 'exact' | 'pattern' | 'semantic' | 'composite';
  expression: string;
  parameters?: Record<string, unknown>;
}

/**
 * RuleAction - 规则动作
 */
export interface RuleAction {
  type: 'use_rule' | 'use_llm' | 'use_hybrid' | 'fallback';
  config?: Record<string, unknown>;
}

/**
 * ResolutionContext - 解析上下文
 */
export interface ResolutionContext {
  input: unknown;
  sessionId?: string;
  variables?: Record<string, unknown>;
  history?: Array<{ input: unknown; output: unknown }>;
}

/**
 * ResolutionResult - 解析结果
 */
export interface ResolutionResult {
  strategy: 'rule' | 'llm' | 'hybrid';
  confidence: number;
  output: unknown;
  usedRules: string[];
}
