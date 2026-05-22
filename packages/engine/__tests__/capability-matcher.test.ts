/**
 * CapabilityMatcher 测试 - 能力匹配算法完整测试
 * 测试精确匹配、模糊匹配、任意匹配等功能
 */

import { describe, beforeEach, afterEach, it, expect } from 'bun:test';
import { CapabilityMatcher, createCapabilityMatcher } from '../src/capability-matcher.js';
import type { DiscoveredCapability } from '../src/capability-discovery.js';
import type { CapabilityMatchRequest, CapabilityDefinition } from '../src/capability-schema.js';

describe('CapabilityMatcher', () => {
  let matcher: CapabilityMatcher;
  let mockCapabilities: DiscoveredCapability[];

  beforeEach(() => {
    // 创建模拟能力数据
    mockCapabilities = [
      {
        capability: {
          id: 'cap-001',
          type: 'generation',
          name: 'code-generation',
          description: 'Generate code from specifications',
          level: 'expert',
          tags: ['coding', 'development', 'tool', 'execution'],
          input: { type: 'string', description: 'Code specification' },
          output: { type: 'string', description: 'Generated code' },
          performance: {
            avgDurationMs: 500,
            avgTokens: 1000,
            successRate: 0.95,
          },
        },
        agentName: 'dev-agent',
        agentLayer: 'L3',
        agentType: 'worker',
        discoveredAt: Date.now(),
      },
      {
        capability: {
          id: 'cap-002',
          type: 'analysis',
          name: 'code-analysis',
          description: 'Analyze code for issues',
          level: 'advanced',
          tags: ['analysis', 'coding', 'research'],
          input: { type: 'string', description: 'Code to analyze' },
          output: { type: 'object', description: 'Analysis results' },
          performance: {
            avgDurationMs: 300,
            avgTokens: 500,
            successRate: 0.98,
          },
        },
        agentName: 'analyst-agent',
        agentLayer: 'L1',
        agentType: 'worker',
        discoveredAt: Date.now(),
      },
      {
        capability: {
          id: 'cap-003',
          type: 'validation',
          name: 'code-validation',
          description: 'Validate code against standards',
          level: 'intermediate',
          tags: ['validation', 'coding', 'feedback'],
          input: { type: 'string', description: 'Code to validate' },
          output: { type: 'boolean', description: 'Validation result' },
          performance: {
            avgDurationMs: 200,
            avgTokens: 300,
            successRate: 0.99,
          },
        },
        agentName: 'validator-agent',
        agentLayer: 'L4',
        agentType: 'worker',
        discoveredAt: Date.now(),
      },
      {
        capability: {
          id: 'cap-004',
          type: 'generation',
          name: 'doc-generation',
          description: 'Generate documentation',
          level: 'basic',
          tags: ['documentation', 'writing', 'tool'],
          performance: {
            avgDurationMs: 1000,
            avgTokens: 2000,
            successRate: 0.90,
          },
        },
        agentName: 'doc-agent',
        agentLayer: 'L3',
        agentType: 'worker',
        discoveredAt: Date.now(),
      },
      {
        capability: {
          id: 'cap-005',
          type: 'coordination',
          name: 'task-coordination',
          description: 'Coordinate multiple tasks',
          level: 'advanced',
          tags: ['coordination', 'management', 'decision'],
          performance: {
            avgDurationMs: 2000,
            avgTokens: 1500,
            successRate: 0.92,
          },
        },
        agentName: 'coordinator-agent',
        agentLayer: 'L2',
        agentType: 'structural',
        discoveredAt: Date.now(),
      },
    ];

    matcher = createCapabilityMatcher(mockCapabilities);
  });

  describe('精确匹配 (exact mode)', () => {
    it('应该按类型精确匹配', () => {
      const request: CapabilityMatchRequest = {
        type: 'generation',
        mode: 'exact',
      };

      const results = matcher.match(request);

      expect(results.length).toBe(2); // cap-001 和 cap-004
      expect(results.every(r => r.capability.type === 'generation')).toBe(true);
    });

    it('应该按类型和等级精确匹配', () => {
      const request: CapabilityMatchRequest = {
        type: 'generation',
        minLevel: 'advanced',
        mode: 'exact',
      };

      const results = matcher.match(request);

      expect(results.length).toBe(1);
      expect(results[0].capability.id).toBe('cap-001');
      expect(results[0].capability.level).toBe('expert');
    });

    it('应该按标签精确匹配（必须包含所有标签）', () => {
      const request: CapabilityMatchRequest = {
        tags: ['coding', 'development'],
        mode: 'exact',
      };

      const results = matcher.match(request);

      expect(results.length).toBe(1);
      expect(results[0].capability.id).toBe('cap-001');
    });

    it('应该按性能约束精确匹配', () => {
      const request: CapabilityMatchRequest = {
        type: 'generation',
        maxDurationMs: 800,
        maxTokens: 1500,
        mode: 'exact',
      };

      const results = matcher.match(request);

      // cap-001 符合条件
      expect(results.length).toBe(1);
      expect(results[0].capability.id).toBe('cap-001');
    });

    it('应该返回空数组当没有匹配时', () => {
      const request: CapabilityMatchRequest = {
        type: 'monitoring',
        mode: 'exact',
      };

      const results = matcher.match(request);

      expect(results).toEqual([]);
    });

    it('应该按输出 Schema 精确匹配', () => {
      const request: CapabilityMatchRequest = {
        type: 'validation',
        outputSchema: { type: 'boolean', description: 'Result' },
        mode: 'exact',
      };

      const results = matcher.match(request);

      expect(results.length).toBe(1);
      expect(results[0].capability.id).toBe('cap-003');
    });
  });

  describe('模糊匹配 (fuzzy mode)', () => {
    it('应该计算类型匹配分数', () => {
      const request: CapabilityMatchRequest = {
        type: 'generation',
        mode: 'fuzzy',
      };

      const results = matcher.match(request);

      expect(results.length).toBeGreaterThan(0);
      // generation 类型的能力应该有更高分数
      const genResults = results.filter(r => r.capability.type === 'generation');
      expect(genResults.length).toBe(2);
      expect(genResults[0].score).toBeGreaterThan(0);
    });

    it('应该计算标签匹配分数', () => {
      const request: CapabilityMatchRequest = {
        tags: ['coding'],
        mode: 'fuzzy',
      };

      const results = matcher.match(request);

      // 有 coding 标签的能力应该有更高分数
      const codingResults = results.filter(r =>
        r.capability.tags?.includes('coding')
      );
      expect(codingResults.length).toBe(3);
    });

    it('应该计算等级匹配分数', () => {
      const request: CapabilityMatchRequest = {
        minLevel: 'advanced',
        mode: 'fuzzy',
      };

      const results = matcher.match(request);

      // expert 和 advanced 等级应该有更高分数
      const advancedResults = results.filter(r =>
        r.capability.level === 'expert' || r.capability.level === 'advanced'
      );
      expect(advancedResults.length).toBeGreaterThan(0);
    });

    it('应该按分数排序结果', () => {
      const request: CapabilityMatchRequest = {
        type: 'generation',
        tags: ['tool'],
        mode: 'fuzzy',
      };

      const results = matcher.match(request);

      // 检查分数是否降序排列
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('应该包含匹配原因', () => {
      const request: CapabilityMatchRequest = {
        type: 'generation',
        tags: ['coding'],
        mode: 'fuzzy',
      };

      const results = matcher.match(request);

      for (const result of results) {
        expect(result.reasons).toBeDefined();
        expect(Array.isArray(result.reasons)).toBe(true);
      }
    });
  });

  describe('任意匹配 (any mode)', () => {
    it('应该返回所有能力', () => {
      const request: CapabilityMatchRequest = {
        mode: 'any',
      };

      const results = matcher.match(request);

      expect(results.length).toBe(mockCapabilities.length);
    });

    it('应该根据偏好调整分数', () => {
      const request: CapabilityMatchRequest = {
        type: 'generation',
        mode: 'any',
      };

      const results = matcher.match(request);

      // generation 类型的能力应该有更高分数
      const genResult = results.find(r => r.capability.type === 'generation');
      const nonGenResult = results.find(r => r.capability.type !== 'generation');

      expect(genResult?.score).toBeGreaterThan(nonGenResult?.score || 0.5);
    });

    it('应该对标签匹配加分', () => {
      const request: CapabilityMatchRequest = {
        tags: ['coding'],
        mode: 'any',
      };

      const results = matcher.match(request);

      const codingResult = results.find(r =>
        r.capability.tags?.includes('coding')
      );
      const nonCodingResult = results.find(r =>
        !r.capability.tags?.includes('coding')
      );

      expect(codingResult?.score).toBeGreaterThan(nonCodingResult?.score || 0.5);
    });
  });

  describe('辅助方法', () => {
    it('应该返回最佳匹配', () => {
      const request: CapabilityMatchRequest = {
        type: 'generation',
        mode: 'fuzzy',
      };

      const bestMatch = matcher.findBestMatch(request);

      expect(bestMatch).toBeDefined();
      expect(bestMatch?.capability.type).toBe('generation');
    });

    it('应该返回 undefined 当没有匹配时', () => {
      const request: CapabilityMatchRequest = {
        type: 'monitoring' as any,
        mode: 'exact',
      };

      const bestMatch = matcher.findBestMatch(request);

      expect(bestMatch).toBeUndefined();
    });

    it('应该返回前 N 个匹配', () => {
      const request: CapabilityMatchRequest = {
        mode: 'any',
      };

      const top2 = matcher.findTopMatches(request, 2);

      expect(top2.length).toBe(2);
      expect(top2[0].score).toBeGreaterThanOrEqual(top2[1].score);
    });

    it('应该处理 N 大于结果数量', () => {
      const request: CapabilityMatchRequest = {
        mode: 'any',
      };

      const top10 = matcher.findTopMatches(request, 10);

      expect(top10.length).toBe(mockCapabilities.length);
    });

    it('应该更新已发现的能力列表', () => {
      const newCapabilities: DiscoveredCapability[] = [
        {
          capability: {
            id: 'cap-new',
            type: 'monitoring',
            name: 'new-monitoring',
            description: 'New monitoring capability',
            level: 'basic',
          },
          agentName: 'new-agent',
          agentLayer: 'governance',
          agentType: 'structural',
          discoveredAt: Date.now(),
        },
      ];

      matcher.updateDiscoveredCapabilities(newCapabilities);

      const results = matcher.match({ mode: 'any' });

      expect(results.length).toBe(1);
      expect(results[0].capability.id).toBe('cap-new');
    });
  });

  describe('Schema 兼容性检查', () => {
    it('应该检查输入 Schema 兼容性', () => {
      const request: CapabilityMatchRequest = {
        type: 'generation',
        input: 'specification text',
        mode: 'fuzzy',
      };

      const results = matcher.match(request);

      expect(results.length).toBeGreaterThan(0);
    });

    it('应该接受兼容的输入类型', () => {
      const request: CapabilityMatchRequest = {
        type: 'generation',
        input: 'specification text', // string 类型与 cap-001 的 input 兼容
        outputSchema: { type: 'string' },
        mode: 'exact',
      };

      const results = matcher.match(request);

      // cap-001 有 string input 和 string output
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('应该检查输出 Schema 兼容性', () => {
      const request: CapabilityMatchRequest = {
        type: 'validation',
        outputSchema: { type: 'boolean' },
        mode: 'exact',
      };

      const results = matcher.match(request);

      expect(results.length).toBe(1);
      expect(results[0].capability.id).toBe('cap-003');
    });
  });

  describe('权重配置', () => {
    it('应该支持自定义权重', () => {
      const customMatcher = createCapabilityMatcher(mockCapabilities, {
        typeMatch: 0.5,
        tagMatch: 0.3,
        levelMatch: 0.1,
        performanceMatch: 0.05,
        schemaCompatibility: 0.05,
      });

      const request: CapabilityMatchRequest = {
        type: 'generation',
        mode: 'fuzzy',
      };

      const results = customMatcher.match(request);

      expect(results.length).toBeGreaterThan(0);
    });

    it('应该根据权重影响分数', () => {
      // 高类型权重，低标签权重
      const highTypeWeight = createCapabilityMatcher(mockCapabilities, {
        typeMatch: 0.8,
        tagMatch: 0.05,
        levelMatch: 0.05,
        performanceMatch: 0.05,
        schemaCompatibility: 0.05,
      });

      const request: CapabilityMatchRequest = {
        type: 'generation',
        tags: ['coding'],
        mode: 'fuzzy',
      };

      const results = highTypeWeight.match(request);

      // 类型匹配应该占主导地位
      const genResults = results.filter(r => r.capability.type === 'generation');
      expect(genResults[0].score).toBeGreaterThan(0.5);
    });
  });

  describe('边界条件', () => {
    it('应该处理空的能力列表', () => {
      const emptyMatcher = createCapabilityMatcher([]);

      const results = emptyMatcher.match({ mode: 'any' });

      expect(results).toEqual([]);
    });

    it('应该处理无效的模式', () => {
      const request = {
        mode: 'invalid' as any,
      };

      const results = matcher.match(request);

      expect(results).toEqual([]);
    });

    it('应该处理空的标签数组', () => {
      const request: CapabilityMatchRequest = {
        tags: [],
        mode: 'exact',
      };

      const results = matcher.match(request);

      // 空标签应该匹配所有能力
      expect(results.length).toBe(mockCapabilities.length);
    });

    it('应该处理没有性能数据的能力', () => {
      const noPerfCapabilities: DiscoveredCapability[] = [
        {
          capability: {
            id: 'cap-no-perf',
            type: 'generation',
            name: 'no-perf',
            description: 'Capability without performance data',
            level: 'basic',
          },
          agentName: 'test-agent',
          agentLayer: 'L3',
          agentType: 'worker',
          discoveredAt: Date.now(),
        },
      ];

      const noPerfMatcher = createCapabilityMatcher(noPerfCapabilities);

      const request: CapabilityMatchRequest = {
        type: 'generation',
        mode: 'any',
      };

      const results = noPerfMatcher.match(request);

      // any 模式应该返回所有能力
      expect(results.length).toBe(1);
    });

    it('应该处理 undefined 的 output Schema', () => {
      const request: CapabilityMatchRequest = {
        type: 'generation',
        mode: 'any',
      };

      const results = matcher.match(request);

      // cap-004 没有 output，any 模式下应该包含
      const hasCap004 = results.some(r => r.capability.id === 'cap-004');
      expect(hasCap004).toBe(true);
    });
  });

  describe('等级比较', () => {
    it('应该正确比较能力等级', () => {
      const request: CapabilityMatchRequest = {
        minLevel: 'intermediate',
        mode: 'exact',
      };

      const results = matcher.match(request);

      // 只有 intermediate、advanced、expert 等级应该匹配
      for (const result of results) {
        expect(['intermediate', 'advanced', 'expert']).toContain(result.capability.level);
      }
    });

    it('应该按等级排序', () => {
      const request: CapabilityMatchRequest = {
        minLevel: 'basic',
        mode: 'fuzzy',
      };

      const results = matcher.match(request);

      // 检查排序结果
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('性能测试', () => {
    it('应该快速匹配大量能力', () => {
      // 创建大量能力
      const largeCapabilities: DiscoveredCapability[] = [];
      for (let i = 0; i < 1000; i++) {
        largeCapabilities.push({
          capability: {
            id: `cap-${i}`,
            type: i % 2 === 0 ? 'generation' : 'analysis',
            name: `capability-${i}`,
            description: `Test capability ${i}`,
            level: ['basic', 'intermediate', 'advanced', 'expert'][i % 4] as any,
            tags: [`tag-${i % 10}`],
          },
          agentName: `agent-${i % 10}`,
          agentLayer: 'L3',
          agentType: 'worker',
          discoveredAt: Date.now(),
        });
      }

      const largeMatcher = createCapabilityMatcher(largeCapabilities);

      const start = performance.now();
      const results = largeMatcher.match({
        type: 'generation',
        mode: 'fuzzy',
      });
      const duration = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      // 应该在 50ms 内完成 1000 个能力的匹配
      expect(duration).toBeLessThan(50);
    });

    it('应该快速查找最佳匹配', () => {
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        matcher.findBestMatch({
          type: 'generation',
          mode: 'fuzzy',
        });
      }
      const duration = performance.now() - start;

      // 100 次查找应该在 20ms 内完成
      expect(duration).toBeLessThan(20);
    });
  });

  describe('匹配原因', () => {
    it('应该提供详细的匹配原因', () => {
      const request: CapabilityMatchRequest = {
        type: 'generation',
        tags: ['coding'],
        minLevel: 'advanced',
        mode: 'fuzzy',
      };

      const results = matcher.match(request);

      for (const result of results) {
        expect(result.reasons.length).toBeGreaterThan(0);

        // 原因应该是字符串
        for (const reason of result.reasons) {
          expect(typeof reason).toBe('string');
        }
      }
    });

    it('应该包含不同类型的匹配原因', () => {
      const request: CapabilityMatchRequest = {
        type: 'generation',
        tags: ['tool'],
        maxDurationMs: 1000,
        mode: 'fuzzy',
      };

      const results = matcher.match(request);

      const topResult = results[0];
      const reasonText = topResult.reasons.join(' ');

      // 应该包含类型、标签等信息
      expect(reasonText.length).toBeGreaterThan(0);
    });
  });
});
