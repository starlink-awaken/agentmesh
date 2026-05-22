/**
 * ResearchFramework 单元测试
 *
 * 测试深度研究框架的规划和执行能力
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ResearchFramework, createResearchFramework, RESEARCH_PHASES, DEPTH_CONFIG, researchPattern, runResearch } from '../src/patterns/ResearchFramework.js';
import type { ResearchConfig, ResearchDepth, ResearchPhase } from '../src/patterns/ResearchFramework.js';

describe('ResearchFramework', () => {
  let framework: ResearchFramework;

  beforeEach(() => {
    framework = new ResearchFramework();
  });

  // ============================================================================
  // 构造函数测试
  // ============================================================================

  describe('constructor', () => {
    it('should create framework', () => {
      expect(framework).toBeDefined();
    });
  });

  // ============================================================================
  // 阶段配置测试
  // ============================================================================

  describe('getPhases', () => {
    it('should return all research phases', () => {
      const phases = framework.getPhases();

      expect(phases.length).toBe(5);
      expect(phases[0].phase).toBe('reconnaissance');
      expect(phases[1].phase).toBe('exploration');
      expect(phases[2].phase).toBe('hypothesis');
      expect(phases[3].phase).toBe('verification');
      expect(phases[4].phase).toBe('synthesis');
    });

    it('should include phase details', () => {
      const phases = framework.getPhases();

      for (const phase of phases) {
        expect(phase.name).toBeDefined();
        expect(phase.nameCN).toBeDefined();
        expect(phase.description).toBeDefined();
        expect(phase.duration).toBeDefined();
        expect(phase.agents).toBeDefined();
        expect(phase.outputs).toBeDefined();
      }
    });
  });

  describe('getPhaseConfig', () => {
    it('should return config for specific phase', () => {
      const config = framework.getPhaseConfig('reconnaissance');

      expect(config).toBeDefined();
      expect(config?.phase).toBe('reconnaissance');
    });

    it('should return undefined for unknown phase', () => {
      const config = framework.getPhaseConfig('invalid' as ResearchPhase);

      expect(config).toBeUndefined();
    });
  });

  // ============================================================================
  // 深度配置测试
  // ============================================================================

  describe('getDepthConfig', () => {
    it('should return standard depth config', () => {
      const config = framework.getDepthConfig('standard');

      expect(config).toBeDefined();
      expect(config.phases).toContain('reconnaissance');
      expect(config.phases).toContain('synthesis');
      expect(config.duration).toBe('2-3分钟');
    });

    it('should return deep depth config', () => {
      const config = framework.getDepthConfig('deep');

      expect(config).toBeDefined();
      expect(config.phases).toContain('hypothesis');
    });

    it('should return exhaustive depth config', () => {
      const config = framework.getDepthConfig('exhaustive');

      expect(config).toBeDefined();
      expect(config.phases).toContain('verification');
    });
  });

  // ============================================================================
  // 获取阶段测试
  // ============================================================================

  describe('getPhasesForDepth', () => {
    it('should return 3 phases for standard depth', () => {
      const phases = framework.getPhasesForDepth('standard');

      expect(phases.length).toBe(3);
    });

    it('should return 4 phases for deep depth', () => {
      const phases = framework.getPhasesForDepth('deep');

      expect(phases.length).toBe(4);
    });

    it('should return 5 phases for exhaustive depth', () => {
      const phases = framework.getPhasesForDepth('exhaustive');

      expect(phases.length).toBe(5);
    });
  });

  // ============================================================================
  // 研究计划测试
  // ============================================================================

  describe('plan', () => {
    it('should create plan for standard research', () => {
      const config: ResearchConfig = {
        topic: 'AI 研究',
        depth: 'standard',
      };

      const plan = framework.plan(config);

      expect(plan.phases.length).toBe(3);
      expect(plan.estimatedDuration).toBeDefined();
      expect(plan.agents).toBeDefined();
      expect(plan.agents.length).toBeGreaterThan(0);
    });

    it('should create plan for deep research', () => {
      const config: ResearchConfig = {
        topic: '深度研究主题',
        depth: 'deep',
      };

      const plan = framework.plan(config);

      expect(plan.phases.length).toBe(4);
    });

    it('should create plan for exhaustive research', () => {
      const config: ResearchConfig = {
        topic: '全面研究主题',
        depth: 'exhaustive',
      };

      const plan = framework.plan(config);

      expect(plan.phases.length).toBe(5);
    });

    it('should include unique agents', () => {
      const config: ResearchConfig = {
        topic: '测试主题',
        depth: 'exhaustive',
      };

      const plan = framework.plan(config);
      const uniqueAgents = new Set(plan.agents);

      expect(plan.agents.length).toBe(uniqueAgents.size);
    });

    it('should handle focus areas in config', () => {
      const config: ResearchConfig = {
        topic: '研究主题',
        depth: 'standard',
        focusAreas: ['技术', '市场'],
      };

      const plan = framework.plan(config);

      expect(plan.phases).toBeDefined();
    });

    it('should handle sources in config', () => {
      const config: ResearchConfig = {
        topic: '研究主题',
        depth: 'standard',
        sources: ['docs', 'papers'],
      };

      const plan = framework.plan(config);

      expect(plan.phases).toBeDefined();
    });

    it('should handle output format in config', () => {
      const config: ResearchConfig = {
        topic: '研究主题',
        depth: 'standard',
        outputFormat: 'json',
      };

      const plan = framework.plan(config);

      expect(plan.phases).toBeDefined();
    });
  });

  // ============================================================================
  // 执行测试
  // ============================================================================

  describe('execute', () => {
    it('should return plan and execution function', async () => {
      const config: ResearchConfig = {
        topic: '测试主题',
        depth: 'standard',
      };

      const result = await framework.execute(config);

      expect(result.plan).toBeDefined();
      expect(result.execution).toBeDefined();
      expect(typeof result.execution).toBe('function');
    });

    it('should include phases in plan', async () => {
      const config: ResearchConfig = {
        topic: '测试主题',
        depth: 'standard',
      };

      const result = await framework.execute(config);

      expect(result.plan.phases.length).toBe(3);
    });

    it('should include estimated duration in plan', async () => {
      const config: ResearchConfig = {
        topic: '测试主题',
        depth: 'standard',
      };

      const result = await framework.execute(config);

      expect(result.plan.estimatedDuration).toBeDefined();
    });
  });

  // ============================================================================
  // Agent Pattern 导出测试
  // ============================================================================

  describe('researchPattern', () => {
    it('should export research pattern', () => {
      expect(researchPattern).toBeDefined();
      expect(researchPattern.id).toBe('research-framework');
      expect(researchPattern.name).toBe('Research Framework');
      expect(researchPattern.category).toBe('execution');
    });

    it('should include use cases', () => {
      expect(researchPattern.useCases.length).toBeGreaterThan(0);
      expect(researchPattern.useCases).toContain('市场调研');
      expect(researchPattern.useCases).toContain('技术分析');
    });

    it('should include code example', () => {
      expect(researchPattern.codeExample).toContain('ResearchFramework');
    });
  });

  // ============================================================================
  // 工厂函数测试
  // ============================================================================

  describe('createResearchFramework', () => {
    it('should create framework instance', () => {
      const instance = createResearchFramework();
      expect(instance).toBeInstanceOf(ResearchFramework);
    });
  });

  // ============================================================================
  // runResearch 测试
  // ============================================================================

  describe('runResearch', () => {
    it('should run research with config and LLM', async () => {
      const config: ResearchConfig = {
        topic: '测试主题',
        depth: 'standard',
      };

      const mockLLM = {
        invoke: async (prompt: string) => 'Research completed'
      };

      const result = await runResearch(config, mockLLM);
      expect(result).toBeDefined();
    });

    it('should handle deep research config', async () => {
      const config: ResearchConfig = {
        topic: '深度研究主题',
        depth: 'deep',
      };

      const mockLLM = {
        invoke: async (prompt: string) => 'Deep research completed'
      };

      const result = await runResearch(config, mockLLM);
      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // 常量导出测试
  // ============================================================================

  describe('constants export', () => {
    it('should export RESEARCH_PHASES', () => {
      expect(RESEARCH_PHASES.length).toBe(5);
    });

    it('should export DEPTH_CONFIG', () => {
      expect(DEPTH_CONFIG.standard).toBeDefined();
      expect(DEPTH_CONFIG.deep).toBeDefined();
      expect(DEPTH_CONFIG.exhaustive).toBeDefined();
    });
  });

  // ============================================================================
  // 边界情况测试
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty topic', async () => {
      const config: ResearchConfig = {
        topic: '',
        depth: 'standard',
      };

      const result = await framework.execute(config);
      expect(result.plan).toBeDefined();
    });

    it('should handle very long topic', async () => {
      const config: ResearchConfig = {
        topic: 'x'.repeat(10000),
        depth: 'standard',
      };

      const result = await framework.execute(config);
      expect(result.plan).toBeDefined();
    });

    it('should handle unicode topic', async () => {
      const config: ResearchConfig = {
        topic: '中文主题 🎉 and English',
        depth: 'standard',
      };

      const result = await framework.execute(config);
      expect(result.plan).toBeDefined();
    });
  });
});
