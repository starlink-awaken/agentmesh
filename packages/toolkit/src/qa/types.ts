/**
 * QA Module - 测试质量评估系统
 *
 * 源自 test-council: 智能测试编排和质量评估
 */

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 测试类型
 */
export type TestType = 'unit' | 'integration' | 'e2e' | 'performance' | 'security';

/**
 * 测试结果
 */
export interface TestResult {
  type: TestType;
  passed: boolean;
  duration: number;
  coverage?: number;
  defects?: number;
  passedCount?: number;
  totalCount?: number;
}

/**
 * 质量评分输入
 */
export interface QualityInput {
  testResults: TestResult[];
  regressionTests?: {
    passed: number;
    total: number;
  };
}

/**
 * 质量评分
 */
export interface QualityScore {
  total: number;           // 总分 0-100
  breakdown: {
    coverage: number;      // 25%
    defects: number;       // 30%
    passRate: number;      // 30%
    regression: number;    // 15%
  };
  decision: 'pass' | 'conditional' | 'fix' | 'reject';
  recommendations: string[];
}

/**
 * 测试分发配置
 */
export interface DispatchConfig {
  testType: TestType;
  language?: string;
  framework?: string;
}

/**
 * 测试Agent配置
 */
export interface AgentConfig {
  id: string;
  name: string;
  type: TestType;
  languages: string[];
  framework?: string;
}

/**
 * 测试分发结果
 */
export interface DispatchResult {
  agent: AgentConfig;
  config: DispatchConfig;
  estimatedTime?: string;
}
