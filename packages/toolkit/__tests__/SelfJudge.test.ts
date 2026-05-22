/**
 * SelfJudge 单元测试
 *
 * 测试自我评判器的评判能力
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SelfJudge } from '../src/memory/SelfJudge.js';
import type { TaskResult } from '../src/memory/types.js';

describe('SelfJudge', () => {
  let judge: SelfJudge;

  beforeEach(() => {
    judge = new SelfJudge();
  });

  // ============================================================================
  // 构造函数测试
  // ============================================================================

  describe('constructor', () => {
    it('should create self judge', () => {
      expect(judge).toBeDefined();
    });

    it('should accept custom config', () => {
      const customJudge = new SelfJudge({
        enableRefinement: true,
        judgeLLM: 'gpt-4',
      });
      expect(customJudge).toBeDefined();
    });
  });

  // ============================================================================
  // 评判功能测试
  // ============================================================================

  describe('judge', () => {
    it('should return success when success is true', async () => {
      const result: TaskResult = {
        input: 'test',
        output: {},
        success: true,
      };

      const outcome = await judge.judge(result);
      expect(outcome).toBe('success');
    });

    it('should return failure when success is false', async () => {
      const result: TaskResult = {
        input: 'test',
        output: {},
        success: false,
      };

      const outcome = await judge.judge(result);
      expect(outcome).toBe('failure');
    });

    it('should return failure when error exists', async () => {
      const result: TaskResult = {
        input: 'test',
        output: {},
        error: 'Something went wrong',
      };

      const outcome = await judge.judge(result);
      expect(outcome).toBe('failure');
    });

    it('should return success when output is not null', async () => {
      const result: TaskResult = {
        input: 'test',
        output: { data: 'some data' },
      };

      const outcome = await judge.judge(result);
      expect(outcome).toBe('success');
    });

    it('should return failure when output is null', async () => {
      const result: TaskResult = {
        input: 'test',
        output: null,
      };

      const outcome = await judge.judge(result);
      expect(outcome).toBe('failure');
    });

    it('should return failure when output is undefined', async () => {
      const result: TaskResult = {
        input: 'test',
      };

      const outcome = await judge.judge(result);
      expect(outcome).toBe('failure');
    });
  });

  // ============================================================================
  // 失败分析测试
  // ============================================================================

  describe('analyzeFailure', () => {
    it('should analyze failure with trajectory', async () => {
      const result: TaskResult = {
        input: 'test',
        output: null,
        trajectory: ['step1', 'step2', 'error in step3'],
      };

      const analysis = await judge.analyzeFailure(result);
      expect(analysis).toBeDefined();
    });

    it('should return message for empty trajectory', async () => {
      const result: TaskResult = {
        input: 'test',
        output: null,
        trajectory: [],
      };

      const analysis = await judge.analyzeFailure(result);
      expect(analysis).toContain('No trajectory available');
    });

    it('should detect timeout pattern', async () => {
      const result: TaskResult = {
        input: 'test',
        output: null,
        trajectory: ['request started', 'timeout after 30s'],
      };

      const analysis = await judge.analyzeFailure(result);
      expect(analysis).toContain('timeout');
    });

    it('should detect permission denied pattern', async () => {
      const result: TaskResult = {
        input: 'test',
        output: null,
        trajectory: ['attempting to access', 'permission denied'],
      };

      const analysis = await judge.analyzeFailure(result);
      expect(analysis).toContain('Permission denied');
    });

    it('should detect not found pattern', async () => {
      const result: TaskResult = {
        input: 'test',
        output: null,
        trajectory: ['looking for resource', '404 not found'],
      };

      const analysis = await judge.analyzeFailure(result);
      expect(analysis).toContain('not found');
    });

    it('should extract last steps when no pattern detected', async () => {
      const result: TaskResult = {
        input: 'test',
        output: null,
        trajectory: ['step1', 'step2', 'step3', 'step4'],
      };

      const analysis = await judge.analyzeFailure(result);
      expect(analysis).toBeDefined();
    });
  });

  // ============================================================================
  // 精炼功能测试
  // ============================================================================

  describe('refine', () => {
    it('should return original content when refinement disabled', async () => {
      const customJudge = new SelfJudge({ enableRefinement: false });
      const memory = {
        content: 'Original content',
        trajectory: ['think about this'],
      };

      const refined = await customJudge.refine(memory);
      expect(refined).toBe('Original content');
    });

    it('should return original content when no trajectory', async () => {
      const customJudge = new SelfJudge({ enableRefinement: true });
      const memory = {
        content: 'Original content',
      };

      const refined = await customJudge.refine(memory);
      expect(refined).toBe('Original content');
    });

    it('should extract reasoning from trajectory when enabled', async () => {
      const customJudge = new SelfJudge({ enableRefinement: true });
      const memory = {
        content: 'Original content',
        trajectory: ['maybe we should try', 'I think this works'],
      };

      const refined = await customJudge.refine(memory);
      expect(refined).toContain('Original content');
    });
  });

  // ============================================================================
  // 构建评判 Prompt 测试
  // ============================================================================

  describe('buildJudgePrompt', () => {
    it('should build default prompt', () => {
      const result: TaskResult = {
        input: 'test input',
        output: { data: 'test' },
        trajectory: ['step1'],
        duration: 100,
      };

      const prompt = judge.buildJudgePrompt(result);
      expect(prompt).toContain('test input');
    });

    it('should include error in prompt', () => {
      const result: TaskResult = {
        input: 'test',
        output: {},
        error: 'Error message',
        trajectory: [],
      };

      const prompt = judge.buildJudgePrompt(result);
      expect(prompt).toContain('Error message');
    });

    it('should use custom prompt template', () => {
      const customJudge = new SelfJudge({
        prompt: 'Input: {input}, Output: {output}, Trajectory: {trajectory}',
      });

      const result: TaskResult = {
        input: 'custom input',
        output: { result: 'data' },
        trajectory: ['traj1', 'traj2'],
      };

      const prompt = customJudge.buildJudgePrompt(result);
      expect(prompt).toContain('custom input');
      expect(prompt).toContain('data');
      expect(prompt).toContain('traj1');
    });
  });

  // ============================================================================
  // 边界情况测试
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty input', async () => {
      const result: TaskResult = {
        input: '',
        output: {},
        success: true,
      };

      const outcome = await judge.judge(result);
      expect(outcome).toBe('success');
    });

    it('should handle complex output objects', async () => {
      const result: TaskResult = {
        input: 'test',
        output: { nested: { deep: 'value' }, array: [1, 2, 3] },
      };

      const outcome = await judge.judge(result);
      expect(outcome).toBe('success');
    });

    it('should handle long trajectories', async () => {
      const result: TaskResult = {
        input: 'test',
        output: null,
        trajectory: Array(100).fill('step').map((s, i) => `${s}${i}`),
      };

      const analysis = await judge.analyzeFailure(result);
      expect(analysis).toBeDefined();
    });

    it('should handle unicode in input', async () => {
      const result: TaskResult = {
        input: '测试中文 🎉',
        output: {},
        success: true,
      };

      const outcome = await judge.judge(result);
      expect(outcome).toBe('success');
    });
  });
});
