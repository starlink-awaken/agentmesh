/**
 * ResearchFramework - 深度研究框架
 *
 * 源自 deep-research-skill: 系统性多阶段深度研究框架
 * 5阶段研究流程 + 3种深度级别
 */
import type { AgentPattern } from './AgentPatterns.js';

// ============================================================================
// 研究阶段定义
// ============================================================================

/**
 * 研究阶段
 */
export type ResearchPhase =
  | 'reconnaissance'  // 阶段1: 知识侦察
  | 'exploration'     // 阶段2: 广度探索
  | 'hypothesis'      // 阶段3: 假设构建
  | 'verification'    // 阶段4: 深度验证
  | 'synthesis';      // 阶段5: 综合输出

/**
 * 研究深度级别
 */
export type ResearchDepth =
  | 'standard'  // 标准: 2-3分钟
  | 'deep'      // 深度: 5-10分钟
  | 'exhaustive'; // 穷举: 10-20分钟

/**
 * 研究阶段配置
 */
export interface PhaseConfig {
  phase: ResearchPhase;
  name: string;
  nameCN: string;
  description: string;
  duration: string;
  agents: string[];
  outputs: string[];
}

/**
 * 研究框架配置
 */
export interface ResearchConfig {
  topic: string;
  depth: ResearchDepth;
  focusAreas?: string[];
  sources?: string[];
  outputFormat?: 'markdown' | 'json' | 'html';
}

/**
 * 研究结果
 */
export interface ResearchResult {
  topic: string;
  depth: ResearchDepth;
  phases: Record<ResearchPhase, PhaseOutput>;
  finalReport: string;
  metadata: {
    duration: number;
    sourcesConsulted: number;
    agentsUsed: string[];
  };
}

/**
 * 阶段输出
 */
export interface PhaseOutput {
  phase: ResearchPhase;
  content: string;
  keyFindings: string[];
  sources: string[];
}

// ============================================================================
// 5阶段定义
// ============================================================================

export const RESEARCH_PHASES: PhaseConfig[] = [
  {
    phase: 'reconnaissance',
    name: 'Knowledge Reconnaissance',
    nameCN: '知识侦察',
    description: '快速建立对研究主题的基础理解',
    duration: '30s-1min',
    agents: ['ClaudeResearcher'],
    outputs: ['主题概述', '关键术语', '基础概念'],
  },
  {
    phase: 'exploration',
    name: 'Breadth Exploration',
    nameCN: '广度探索',
    description: '广泛收集多角度信息和观点',
    duration: '1-3min',
    agents: ['ClaudeResearcher', 'GeminiResearcher', 'GrokResearcher'],
    outputs: ['多角度分析', '不同立场', '相关领域'],
  },
  {
    phase: 'hypothesis',
    name: 'Hypothesis Building',
    nameCN: '假设构建',
    description: '基于已有信息形成研究假设',
    duration: '30s-1min',
    agents: ['Algorithm'],
    outputs: ['核心假设', '验证方法', '预期结论'],
  },
  {
    phase: 'verification',
    name: 'Deep Verification',
    nameCN: '深度验证',
    description: '深入验证假设的可行性和准确性',
    duration: '1-5min',
    agents: ['ClaudeResearcher', 'CodexResearcher'],
    outputs: ['验证结果', '证据支持', '反例分析'],
  },
  {
    phase: 'synthesis',
    name: 'Synthesis & Output',
    nameCN: '综合输出',
    description: '整合所有研究发现，形成最终报告',
    duration: '30s-1min',
    agents: ['Algorithm'],
    outputs: ['综合报告', '结论摘要', '行动建议'],
  },
];

/**
 * 深度级别配置
 */
export const DEPTH_CONFIG: Record<ResearchDepth, {
  phases: ResearchPhase[];
  duration: string;
  description: string;
}> = {
  standard: {
    phases: ['reconnaissance', 'exploration', 'synthesis'],
    duration: '2-3分钟',
    description: '快速了解主题全貌',
  },
  deep: {
    phases: ['reconnaissance', 'exploration', 'hypothesis', 'synthesis'],
    duration: '5-10分钟',
    description: '深入理解并形成观点',
  },
  exhaustive: {
    phases: ['reconnaissance', 'exploration', 'hypothesis', 'verification', 'synthesis'],
    duration: '10-20分钟',
    description: '全面研究并验证假设',
  },
};

// ============================================================================
// ResearchFramework 类
// ============================================================================

/**
 * ResearchFramework - 深度研究框架
 *
 * 使用示例：
 * ```typescript
 * import { ResearchFramework } from 'agent-toolkit';
 *
 * const framework = new ResearchFramework();
 *
 * // 标准研究（2-3分钟）
 * const result = await framework.execute({
 *   topic: "AI Agent 的发展趋势",
 *   depth: 'standard'
 * });
 *
 * // 深度研究（5-10分钟）
 * const deepResult = await framework.execute({
 *   topic: "LLM 在代码生成中的应用",
 *   depth: 'deep'
 * });
 * ```
 */
export class ResearchFramework {
  private phases = RESEARCH_PHASES;
  private depthConfig = DEPTH_CONFIG;

  /**
   * 获取所有阶段
   */
  getPhases(): PhaseConfig[] {
    return this.phases;
  }

  /**
   * 获取阶段配置
   */
  getPhaseConfig(phase: ResearchPhase): PhaseConfig | undefined {
    return this.phases.find(p => p.phase === phase);
  }

  /**
   * 获取深度配置
   */
  getDepthConfig(depth: ResearchDepth) {
    return this.depthConfig[depth];
  }

  /**
   * 获取指定深度包含的阶段
   */
  getPhasesForDepth(depth: ResearchDepth): PhaseConfig[] {
    const depthPhases = this.depthConfig[depth].phases;
    return this.phases.filter(p => depthPhases.includes(p.phase));
  }

  /**
   * 生成研究计划
   */
  plan(config: ResearchConfig): {
    phases: PhaseConfig[];
    estimatedDuration: string;
    agents: string[];
  } {
    const phases = this.getPhasesForDepth(config.depth);
    const agents = [...new Set(phases.flatMap(p => p.agents))];

    return {
      phases,
      estimatedDuration: this.depthConfig[config.depth].duration,
      agents,
    };
  }

  /**
   * 执行研究（框架方法，实际执行需要外部调用LLM）
   *
   * 注意：这是一个框架方法，返回执行计划
   * 实际的研究执行需要在外部调用 LLM
   */
  async execute(config: ResearchConfig): Promise<{
    plan: {
      phases: PhaseConfig[];
      estimatedDuration: string;
      agents: string[];
    };
    execution: (llm: LLMExecutor) => Promise<ResearchResult>;
  }> {
    const plan = this.plan(config);

    const execution = async (llm: LLMExecutor): Promise<ResearchResult> => {
      const startTime = Date.now();
      const phaseOutputs: Record<ResearchPhase, PhaseOutput> = {} as any;
      const allSources: string[] = [];
      const allAgents: string[] = [];

      // 按顺序执行每个阶段
      for (const phaseConfig of plan.phases) {
        const phaseOutput = await this.executePhase(
          llm,
          phaseConfig,
          config,
          phaseOutputs
        );
        phaseOutputs[phaseConfig.phase] = phaseOutput;
        allSources.push(...phaseOutput.sources);
        allAgents.push(...phaseConfig.agents);
      }

      // 生成最终报告
      const finalReport = await this.generateReport(llm, config, phaseOutputs);

      return {
        topic: config.topic,
        depth: config.depth,
        phases: phaseOutputs,
        finalReport,
        metadata: {
          duration: Date.now() - startTime,
          sourcesConsulted: new Set(allSources).size,
          agentsUsed: [...new Set(allAgents)],
        },
      };
    };

    return { plan, execution };
  }

  /**
   * 执行单个阶段
   */
  private async executePhase(
    llm: LLMExecutor,
    phaseConfig: PhaseConfig,
    config: ResearchConfig,
    previousOutputs: Record<ResearchPhase, PhaseOutput>
  ): Promise<PhaseOutput> {
    // 构建阶段提示词
    const prompt = this.buildPhasePrompt(phaseConfig, config, previousOutputs);

    // 调用 LLM
    const response = await llm.invoke(prompt);

    // 解析输出
    return this.parsePhaseOutput(phaseConfig.phase, response);
  }

  /**
   * 构建阶段提示词
   */
  private buildPhasePrompt(
    phaseConfig: PhaseConfig,
    config: ResearchConfig,
    previousOutputs: Record<ResearchPhase, PhaseOutput>
  ): string {
    const context = Object.values(previousOutputs)
      .map(o => `## ${o.phase} 输出\n${o.content}`)
      .join('\n\n');

    return `
# 研究主题: ${config.topic}

## 当前阶段: ${phaseConfig.nameCN} (${phaseConfig.name})

${phaseConfig.description}

## 需要产出:
- ${phaseConfig.outputs.join('\n- ')}

${context ? `## 之前阶段的研究:\n${context}` : ''}

## 要求:
1. 深入分析，提供具体细节和证据
2. 引用可靠的来源和信息
3. 保持客观和批判性思维

请开始${phaseConfig.nameCN}。
`;
  }

  /**
   * 解析阶段输出
   */
  private parsePhaseOutput(phase: ResearchPhase, response: string): PhaseOutput {
    // 简单的解析逻辑，实际可以根据输出格式调整
    const lines = response.split('\n');
    const keyFindings = lines.filter(l => l.startsWith('-')).slice(0, 5);

    return {
      phase,
      content: response,
      keyFindings: keyFindings.map(l => l.replace(/^-\s*/, '')),
      sources: this.extractSources(response),
    };
  }

  /**
   * 提取来源
   */
  private extractSources(content: string): string[] {
    const sourcePattern = /\[([^\]]+)\]/g;
    const sources: string[] = [];
    let match;
    while ((match = sourcePattern.exec(content)) !== null) {
      sources.push(match[1]);
    }
    return sources;
  }

  /**
   * 生成最终报告
   */
  private async generateReport(
    llm: LLMExecutor,
    config: ResearchConfig,
    phaseOutputs: Record<ResearchPhase, PhaseOutput>
  ): Promise<string> {
    const prompt = `
# 研究报告生成

## 研究主题: ${config.topic}
## 研究深度: ${config.depth}

## 各阶段研究发现:

${Object.values(phaseOutputs)
  .map(o => `### ${o.phase} 阶段\n${o.content.slice(0, 500)}...`)
  .join('\n\n')}

请生成一份结构清晰、结论明确的研究报告。
`;

    return llm.invoke(prompt);
  }
}

/**
 * LLM 执行器接口
 */
export interface LLMExecutor {
  invoke(prompt: string): Promise<string>;
}

/**
 * 创建研究框架
 */
export function createResearchFramework(): ResearchFramework {
  return new ResearchFramework();
}

// ============================================================================
// Agent Pattern 导出（供 AgentPatterns 使用）
// ============================================================================

/**
 * 研究模式 - 作为 AgentPattern 导出
 */
export const researchPattern: AgentPattern = {
  id: 'research-framework',
  name: 'Research Framework',
  nameCN: '深度研究框架',
  category: 'execution',
  description: '系统性多阶段深度研究框架，包含5个研究阶段和3种深度级别',
  useCases: [
    '市场调研',
    '技术分析',
    '学术研究',
    '竞品分析',
  ],
  codeExample: `
import { ResearchFramework } from 'agent-toolkit';

const framework = new ResearchFramework();

// 执行深度研究
const { plan, execution } = await framework.execute({
  topic: "AI Agent 的发展趋势",
  depth: 'deep'
});

// 使用 LLM 执行研究
const result = await execution(llm);
console.log(result.finalReport);`,
  frameworks: ['AgentToolkit'],
};

// ============================================================================
// 快速执行函数
// ============================================================================

/**
 * 快速执行研究（需要外部 LLM）
 */
export async function runResearch(
  config: ResearchConfig,
  llm: LLMExecutor
): Promise<ResearchResult> {
  const framework = new ResearchFramework();
  const { execution } = await framework.execute(config);
  return execution(llm);
}
