/**
 * PatternDefinition - 模式定义
 */
export interface PatternDefinition {
  id: string;
  name: string;
  description: string;
  category: 'analyze' | 'extract' | 'summarize' | 'transform';
  template: string;
  variables: string[];
  examples?: string[];
}

/**
 * PatternResult - 模式执行结果
 */
export interface PatternResult {
  success: boolean;
  output: string;
  metadata?: Record<string, any>;
}
