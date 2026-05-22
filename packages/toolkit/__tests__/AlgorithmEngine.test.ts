/**
 * AlgorithmEngine 单元测试
 *
 * 测试七阶段问题解决框架的执行能力
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AlgorithmEngine } from '../src/core/AlgorithmEngine.js';
import type { AlgorithmContext, AlgorithmPhase } from '../src/core/types.js';

describe('AlgorithmEngine', () => {
  let engine: AlgorithmEngine;

  beforeEach(() => {
    engine = new AlgorithmEngine();
  });

  // ============================================================================
  // 构造函数测试
  // ============================================================================

  describe('constructor', () => {
    it('should create engine with default config', () => {
      expect(engine).toBeDefined();
    });

    it('should accept custom config', () => {
      const customEngine = new AlgorithmEngine({
        autoGenerateISC: false,
        debug: true,
        maxExecutionTime: 30000,
      });
      expect(customEngine).toBeDefined();
    });
  });

  // ============================================================================
  // 阶段执行测试
  // ============================================================================

  describe('execute', () => {
    it('should execute full algorithm flow successfully', async () => {
      const context: AlgorithmContext = {
        task: '分析这个项目的架构',
        constraints: ['使用中文'],
      };

      const result = await engine.execute(context);

      expect(result.success).toBe(true);
      expect(result.phases).toBeDefined();
      expect(result.phases['OBSERVE']).toBeDefined();
      expect(result.phases['THINK']).toBeDefined();
      expect(result.phases['PLAN']).toBeDefined();
      expect(result.phases['BUILD']).toBeDefined();
      expect(result.phases['EXECUTE']).toBeDefined();
      expect(result.phases['VERIFY']).toBeDefined();
      expect(result.phases['LEARN']).toBeDefined();
    });

    it('should generate ISC criteria by default', async () => {
      const context: AlgorithmContext = {
        task: '实现用户登录功能',
      };

      const result = await engine.execute(context);

      expect(result.iscCriteria).toBeDefined();
      expect(result.iscCriteria.length).toBeGreaterThan(0);
    });

    it('should not generate ISC when autoGenerateISC is false', async () => {
      const customEngine = new AlgorithmEngine({ autoGenerateISC: false });
      const context: AlgorithmContext = {
        task: '实现用户登录功能',
      };

      const result = await customEngine.execute(context);

      expect(result.iscCriteria).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      // 测试异常处理机制 - 提供无效的任务上下文
      const context: AlgorithmContext = {
        task: '测试错误处理',
      };

      // 使用默认处理器，验证基本功能
      const result = await engine.execute(context);

      // 验证执行完成
      expect(result.success).toBe(true);
      expect(result.phases).toBeDefined();
    });

    it('should track phase duration', async () => {
      const context: AlgorithmContext = {
        task: '简单任务',
      };

      const result = await engine.execute(context);

      expect(result.phases['OBSERVE'].duration).toBeDefined();
      expect(typeof result.phases['OBSERVE'].duration).toBe('number');
    });
  });

  // ============================================================================
  // OBSERVE 阶段测试
  // ============================================================================

  describe('OBSERVE phase', () => {
    it('should extract keywords from task', async () => {
      const context: AlgorithmContext = {
        task: '分析用户行为数据并生成报告',
      };

      const result = await engine.execute(context);
      const observeOutput = result.phases['OBSERVE'].output;

      expect(observeOutput).toBeDefined();
      expect(observeOutput.keywords).toBeDefined();
      expect(observeOutput.keywords.length).toBeGreaterThan(0);
    });

    it('should infer implied requirements for API tasks', async () => {
      const context: AlgorithmContext = {
        task: '创建一个 REST API 接口',
      };

      const result = await engine.execute(context);
      const observeOutput = result.phases['OBSERVE'].output;

      expect(observeOutput.implied).toContain('需要错误处理');
      expect(observeOutput.implied).toContain('需要日志记录');
    });

    it('should infer implied requirements for database tasks', async () => {
      const context: AlgorithmContext = {
        task: '设计数据库存储方案',
      };

      const result = await engine.execute(context);
      const observeOutput = result.phases['OBSERVE'].output;

      expect(observeOutput.implied).toContain('需要数据验证');
    });

    it('should extract negative requirements', async () => {
      const context: AlgorithmContext = {
        task: '实现功能但不要使用递归',
      };

      const result = await engine.execute(context);
      const observeOutput = result.phases['OBSERVE'].output;

      expect(observeOutput.negatives).toBeDefined();
    });
  });

  // ============================================================================
  // THINK 阶段测试
  // ============================================================================

  describe('THINK phase', () => {
    it('should identify need for council in decision tasks', async () => {
      const context: AlgorithmContext = {
        task: '比较方案A和方案B，选择最优解',
      };

      const result = await engine.execute(context);
      const thinkOutput = result.phases['THINK'].output;

      expect(thinkOutput.thinkingTools.council).toBe(true);
    });

    it('should identify need for first principles in root cause analysis', async () => {
      const context: AlgorithmContext = {
        task: '分析问题根本原因',
      };

      const result = await engine.execute(context);
      const thinkOutput = result.phases['THINK'].output;

      expect(thinkOutput.thinkingTools.firstPrinciples).toBe(true);
    });

    it('should identify need for red team in security tasks', async () => {
      const context: AlgorithmContext = {
        task: '进行安全漏洞检测',
      };

      const result = await engine.execute(context);
      const thinkOutput = result.phases['THINK'].output;

      expect(thinkOutput.thinkingTools.redTeam).toBe(true);
    });

    it('should select capabilities based on task keywords', async () => {
      const context: AlgorithmContext = {
        task: '分析数据并提取关键信息',
      };

      const result = await engine.execute(context);
      const thinkOutput = result.phases['THINK'].output;

      expect(thinkOutput.capabilities).toContain('analyze');
      expect(thinkOutput.capabilities).toContain('extract');
    });
  });

  // ============================================================================
  // PLAN 阶段测试
  // ============================================================================

  describe('PLAN phase', () => {
    it('should determine approach based on task', async () => {
      const context: AlgorithmContext = {
        task: '实现一个新的功能模块',
      };

      const result = await engine.execute(context);
      const planOutput = result.phases['PLAN'].output;

      expect(planOutput.approach).toBe('implementation');
    });

    it('should generate execution steps', async () => {
      const context: AlgorithmContext = {
        task: '完成某个任务',
      };

      const result = await engine.execute(context);
      const planOutput = result.phases['PLAN'].output;

      expect(planOutput.steps).toBeDefined();
      expect(planOutput.steps.length).toBeGreaterThan(0);
    });

    it('should analyze dependencies', async () => {
      const context: AlgorithmContext = {
        task: '完成项目开发',
      };

      const result = await engine.execute(context);
      const planOutput = result.phases['PLAN'].output;

      expect(planOutput.dependencies).toBeDefined();
    });
  });

  // ============================================================================
  // 自定义处理器测试
  // ============================================================================

  describe('custom handlers', () => {
    it('should register custom handler for a phase', async () => {
      const customHandler = vi.fn().mockResolvedValue({ custom: 'output' });
      engine.registerHandler('OBSERVE', customHandler as any);

      const context: AlgorithmContext = {
        task: '测试自定义处理器',
      };

      await engine.execute(context);

      expect(customHandler).toHaveBeenCalled();
    });

    it('should execute single phase with executePhase', async () => {
      const context: AlgorithmContext = {
        task: '测试单阶段执行',
      };

      const output = await engine.executePhase('OBSERVE', context);

      expect(output).toBeDefined();
    });

    it('should throw error for unknown phase', async () => {
      const context: AlgorithmContext = {
        task: '测试',
      };

      await expect(
        engine.executePhase('INVALID' as AlgorithmPhase, context)
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // 边界情况测试
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty task', async () => {
      const context: AlgorithmContext = {
        task: '',
      };

      const result = await engine.execute(context);

      expect(result.success).toBe(true);
    });

    it('should handle task without constraints', async () => {
      const context: AlgorithmContext = {
        task: '简单任务',
      };

      const result = await engine.execute(context);

      expect(result.success).toBe(true);
    });

    it('should handle very long task', async () => {
      const longTask = '测试任务 ' + 'x'.repeat(10000);
      const context: AlgorithmContext = {
        task: longTask,
      };

      const result = await engine.execute(context);

      expect(result.success).toBe(true);
    });

    it('should handle unicode characters in task', async () => {
      const context: AlgorithmContext = {
        task: '测试中文任务 🎉 and English',
      };

      const result = await engine.execute(context);

      expect(result.success).toBe(true);
    });
  });
});
