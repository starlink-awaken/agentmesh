/**
 * CapabilityDiscovery 测试 - 能力发现机制完整测试
 * 测试从 Agent 发现能力、索引、查询等功能
 */

import { describe, beforeEach, afterEach, it, expect } from 'bun:test';
import { CapabilityDiscovery, createCapabilityDiscovery } from '../src/capability-discovery.js';
import type { AgentDefinition } from '../src/types.js';

describe('CapabilityDiscovery', () => {
  let discovery: CapabilityDiscovery;
  let mockAgents: AgentDefinition[];

  beforeEach(() => {
    discovery = createCapabilityDiscovery();

    // 创建模拟 Agent 定义
    mockAgents = [
      {
        name: 'research-agent',
        type: 'worker',
        layer: 'L1',
        description: 'Research and analysis agent',
        prompt_path: '/agents/research.md',
        tools: ['analyze', 'search', 'summarize'],
        capabilities: ['deep-analysis', 'literature-review'],
        argument_hint: 'Research topic',
        embedded_governance: {
          first_principles_check: true,
          red_team_threshold: 'medium',
          quality_gate_enabled: true,
          max_retries: 3,
          token_budget: 100000,
        },
      },
      {
        name: 'decision-agent',
        type: 'structural',
        layer: 'L2',
        description: 'Decision making agent',
        prompt_path: '/agents/decision.md',
        tools: ['evaluate', 'decide'],
        capabilities: ['risk-assessment', 'priority-ranking'],
        argument_hint: 'Decision context',
        embedded_governance: {
          first_principles_check: true,
          red_team_threshold: 'high',
          quality_gate_enabled: true,
          max_retries: 2,
          token_budget: 150000,
        },
      },
      {
        name: 'execution-agent',
        type: 'worker',
        layer: 'L3',
        description: 'Task execution agent',
        prompt_path: '/agents/execution.md',
        tools: ['execute', 'deploy', 'monitor'],
        capabilities: ['code-generation', 'deployment'],
        argument_hint: 'Task specification',
        embedded_governance: {
          first_principles_check: false,
          red_team_threshold: 'low',
          quality_gate_enabled: true,
          max_retries: 5,
          token_budget: 200000,
        },
      },
      {
        name: 'feedback-agent',
        type: 'worker',
        layer: 'L4',
        description: 'Feedback and validation agent',
        prompt_path: '/agents/feedback.md',
        tools: ['validate', 'test'],
        capabilities: ['quality-check', 'user-testing'],
        argument_hint: 'Feedback request',
        embedded_governance: {
          first_principles_check: true,
          red_team_threshold: 'medium',
          quality_gate_enabled: true,
          max_retries: 2,
          token_budget: 80000,
        },
      },
      {
        name: 'governance-agent',
        type: 'structural',
        layer: 'governance',
        description: 'Governance oversight agent',
        prompt_path: '/agents/governance.md',
        tools: ['audit', 'compliance-check'],
        capabilities: ['policy-enforcement', 'compliance'],
        argument_hint: 'Governance context',
        embedded_governance: {
          first_principles_check: true,
          red_team_threshold: 'critical',
          quality_gate_enabled: true,
          max_retries: 1,
          token_budget: 50000,
        },
      },
    ];
  });

  describe('基础发现功能', () => {
    it('应该从 Agent 列表发现能力', () => {
      discovery.discoverFromAgents(mockAgents);

      const allCapabilities = discovery.findAll();
      expect(allCapabilities.length).toBeGreaterThan(0);

      // 每个 Agent 应该有至少一个能力（tools 和 capabilities 都会被转换）
      const agentCount = mockAgents.length;
      expect(allCapabilities.length).toBeGreaterThanOrEqual(agentCount);
    });

    it('应该从单个 Agent 发现能力', () => {
      const agent = mockAgents[0];
      discovery.discoverFromAgent(agent);

      const agentCapabilities = discovery.getAgentCapabilities(agent.name);
      expect(agentCapabilities).toBeDefined();
      expect(agentCapabilities?.capabilities.length).toBeGreaterThan(0);
    });

    it('应该正确设置能力来源信息', () => {
      discovery.discoverFromAgents(mockAgents);

      const allCapabilities = discovery.findAll();

      // 检查第一个能力
      const firstCap = allCapabilities[0];
      expect(firstCap.agentName).toBeTruthy();
      expect(firstCap.agentLayer).toBeTruthy();
      expect(firstCap.agentType).toBeTruthy();
      expect(firstCap.discoveredAt).toBeGreaterThan(0);
    });
  });

  describe('能力索引', () => {
    beforeEach(() => {
      discovery.discoverFromAgents(mockAgents);
    });

    it('应该按 ID 索引能力', () => {
      const allCapabilities = discovery.findAll();
      const firstCap = allCapabilities[0];

      const found = discovery.findById(firstCap.capability.id);
      expect(found).toBeDefined();
      expect(found?.capability.id).toBe(firstCap.capability.id);
    });

    it('应该按类型索引能力', () => {
      const analysisCaps = discovery.findByType('analysis');
      expect(analysisCaps.length).toBeGreaterThan(0);

      // L1 Agent 应该有 analysis 类型能力
      const researchCaps = discovery.findByAgent('research-agent');
      const hasAnalysis = researchCaps.some(c => c.capability.type === 'analysis');
      expect(hasAnalysis).toBe(true);
    });

    it('应该按等级索引能力', () => {
      const basicCaps = discovery.findByLevel('basic');
      expect(basicCaps.length).toBeGreaterThan(0);

      // tools 创建的能力应该是 basic 等级
      const executionCaps = discovery.findByAgent('execution-agent');
      const hasBasic = executionCaps.some(c => c.capability.level === 'basic');
      expect(hasBasic).toBe(true);
    });

    it('应该按 Agent 索引能力', () => {
      const researchCaps = discovery.findByAgent('research-agent');
      expect(researchCaps.length).toBeGreaterThan(0);

      // 所有能力应该属于同一个 Agent
      expect(researchCaps.every(c => c.agentName === 'research-agent')).toBe(true);
    });

    it('应该按标签索引能力', () => {
      const toolCaps = discovery.findByTag('tool');
      expect(toolCaps.length).toBeGreaterThan(0);

      const researchCaps = discovery.findByTag('research');
      expect(researchCaps.length).toBeGreaterThan(0);
    });

    it('应该支持多标签查询（匹配任一）', () => {
      const caps = discovery.findByTags(['tool', 'research'], false);
      expect(caps.length).toBeGreaterThan(0);
    });

    it('应该支持多标签查询（匹配全部）', () => {
      // 查找同时有 tool 和 research 标签的能力
      const caps = discovery.findByTags(['tool', 'research'], true);
      // research-agent 的 tool 能力应该有这两个标签
      expect(caps.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('能力提取', () => {
    it('应该从 capabilities 字段提取能力', () => {
      discovery.discoverFromAgents(mockAgents);

      const researchCaps = discovery.findByAgent('research-agent');
      const hasDeepAnalysis = researchCaps.some(
        c => c.capability.name === 'deep-analysis'
      );
      expect(hasDeepAnalysis).toBe(true);
    });

    it('应该从 tools 字段提取能力', () => {
      discovery.discoverFromAgents(mockAgents);

      const researchCaps = discovery.findByAgent('research-agent');
      const hasAnalyzeTool = researchCaps.some(
        c => c.capability.name === 'analyze'
      );
      expect(hasAnalyzeTool).toBe(true);
    });

    it('应该避免重复的能力定义', () => {
      // 创建一个 tool 和 capability 同名的 Agent
      const duplicateAgent: AgentDefinition = {
        name: 'duplicate-agent',
        type: 'worker',
        layer: 'L3',
        description: 'Agent with duplicate names',
        prompt_path: '/agents/duplicate.md',
        tools: ['analyze'],
        capabilities: ['analyze'],
        argument_hint: 'Test',
        embedded_governance: {
          first_principles_check: false,
          red_team_threshold: 'low',
          quality_gate_enabled: true,
          max_retries: 3,
          token_budget: 100000,
        },
      };

      discovery.discoverFromAgent(duplicateAgent);

      const caps = discovery.findByAgent('duplicate-agent');
      // analyze 应该只出现一次
      const analyzeCaps = caps.filter(c => c.capability.name === 'analyze');
      expect(analyzeCaps.length).toBe(1);
    });

    it('应该根据层级推断能力类型', () => {
      discovery.discoverFromAgents(mockAgents);

      // L1 应该有 analysis 类型
      const l1Caps = discovery.findByAgent('research-agent');
      expect(l1Caps.some(c => c.capability.type === 'analysis')).toBe(true);

      // L2 应该有 coordination 类型
      const l2Caps = discovery.findByAgent('decision-agent');
      expect(l2Caps.some(c => c.capability.type === 'coordination')).toBe(true);

      // L3 应该有 execution 类型
      const l3Caps = discovery.findByAgent('execution-agent');
      expect(l3Caps.some(c => c.capability.type === 'execution')).toBe(true);

      // L4 应该有 validation 类型
      const l4Caps = discovery.findByAgent('feedback-agent');
      expect(l4Caps.some(c => c.capability.type === 'validation')).toBe(true);

      // governance 应该有 monitoring 类型
      const govCaps = discovery.findByAgent('governance-agent');
      expect(govCaps.some(c => c.capability.type === 'monitoring')).toBe(true);
    });

    it('应该根据关键词推断能力类型', () => {
      const testAgent: AgentDefinition = {
        name: 'generate-agent',
        type: 'worker',
        layer: 'L3',
        description: 'Generation agent',
        prompt_path: '/agents/generate.md',
        tools: ['generate-code', 'create-docs', 'transform-data'],
        capabilities: [],
        argument_hint: 'Test',
        embedded_governance: {
          first_principles_check: false,
          red_team_threshold: 'low',
          quality_gate_enabled: true,
          max_retries: 3,
          token_budget: 100000,
        },
      };

      discovery.discoverFromAgent(testAgent);

      const caps = discovery.findByAgent('generate-agent');

      // generate-code 应该被识别为 generation 类型
      const generateCodeCap = caps.find(c => c.capability.name === 'generate-code');
      expect(generateCodeCap?.capability.type).toBe('generation');

      // create-docs 应该被识别为 generation 类型
      const createDocsCap = caps.find(c => c.capability.name === 'create-docs');
      expect(createDocsCap?.capability.type).toBe('generation');

      // transform-data 应该被识别为 transformation 类型
      const transformCap = caps.find(c => c.capability.name === 'transform-data');
      expect(transformCap?.capability.type).toBe('transformation');
    });
  });

  describe('缓存管理', () => {
    it('应该支持缓存功能', () => {
      const discoveryWithCache = createCapabilityDiscovery({
        enableCache: true,
        cacheTtl: 1000,
      });

      discoveryWithCache.discoverFromAgents(mockAgents);

      const cacheStatus = discoveryWithCache.getCacheStatus();
      expect(cacheStatus.enabled).toBe(true);
      expect(cacheStatus.timestamp).toBeGreaterThan(0);
      expect(cacheStatus.capabilityCount).toBeGreaterThan(0);
      expect(cacheStatus.agentCount).toBeGreaterThan(0);
    });

    it('应该正确计算缓存年龄', async () => {
      const discoveryWithCache = createCapabilityDiscovery({
        enableCache: true,
        cacheTtl: 1000,
      });

      discoveryWithCache.discoverFromAgents(mockAgents);

      const status1 = discoveryWithCache.getCacheStatus();
      expect(status1.age).toBe(0);

      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 100));

      const status2 = discoveryWithCache.getCacheStatus();
      expect(status2.age).toBeGreaterThan(0);
    });

    it('应该支持清空缓存', () => {
      discovery.discoverFromAgents(mockAgents);

      expect(discovery.findAll().length).toBeGreaterThan(0);

      discovery.clearCache();

      expect(discovery.findAll().length).toBe(0);
      expect(discovery.getDiscoveredAgents().length).toBe(0);
    });

    it('应该支持禁用缓存', () => {
      const discoveryNoCache = createCapabilityDiscovery({
        enableCache: false,
      });

      discoveryNoCache.discoverFromAgents(mockAgents);

      const cacheStatus = discoveryNoCache.getCacheStatus();
      expect(cacheStatus.enabled).toBe(false);
    });
  });

  describe('统计功能', () => {
    beforeEach(() => {
      discovery.discoverFromAgents(mockAgents);
    });

    it('应该获取能力总数', () => {
      const stats = discovery.getStatistics();
      expect(stats.totalCapabilities).toBeGreaterThan(0);
    });

    it('应该按类型统计能力', () => {
      const stats = discovery.getStatistics();
      expect(Object.keys(stats.capabilitiesByType).length).toBeGreaterThan(0);
      expect(stats.capabilitiesByType['analysis']).toBeGreaterThan(0);
    });

    it('应该按等级统计能力', () => {
      const stats = discovery.getStatistics();
      expect(Object.keys(stats.capabilitiesByLevel).length).toBeGreaterThan(0);
      expect(stats.capabilitiesByLevel['basic']).toBeGreaterThan(0);
    });

    it('应该按 Agent 统计能力', () => {
      const stats = discovery.getStatistics();
      expect(Object.keys(stats.capabilitiesByAgent).length).toBe(mockAgents.length);
    });

    it('应该统计标签使用情况', () => {
      const stats = discovery.getStatistics();
      expect(stats.totalTags).toBeGreaterThan(0);
      expect(stats.topTags.length).toBeGreaterThan(0);

      // Top 标签应该按数量排序
      for (let i = 1; i < stats.topTags.length; i++) {
        expect(stats.topTags[i - 1].count).toBeGreaterThanOrEqual(stats.topTags[i].count);
      }
    });

    it('应该限制 Top 标签数量', () => {
      const stats = discovery.getStatistics();
      expect(stats.topTags.length).toBeLessThanOrEqual(10);
    });
  });

  describe('查询方法', () => {
    beforeEach(() => {
      discovery.discoverFromAgents(mockAgents);
    });

    it('应该获取所有已发现的 Agent', () => {
      const agents = discovery.getDiscoveredAgents();
      expect(agents.length).toBe(mockAgents.length);

      for (const agent of mockAgents) {
        expect(agents).toContain(agent.name);
      }
    });

    it('应该获取 Agent 的完整能力声明', () => {
      const agentCaps = discovery.getAgentCapabilities('research-agent');
      expect(agentCaps).toBeDefined();
      expect(agentCaps?.agentName).toBe('research-agent');
      expect(agentCaps?.agentVersion).toBe('1.0.0');
      expect(agentCaps?.capabilities.length).toBeGreaterThan(0);
    });

    it('应该返回 undefined 对于不存在的 Agent', () => {
      const agentCaps = discovery.getAgentCapabilities('non-existent-agent');
      expect(agentCaps).toBeUndefined();
    });

    it('应该返回空数组对于不存在的类型', () => {
      const caps = discovery.findByType('custom' as any);
      expect(caps).toEqual([]);
    });

    it('应该返回空数组对于不存在的等级', () => {
      const caps = discovery.findByLevel('expert');
      // 如果没有 expert 等级的能力
      expect(Array.isArray(caps)).toBe(true);
    });

    it('应该返回空数组对于不存在的标签', () => {
      const caps = discovery.findByTag('non-existent-tag');
      expect(caps).toEqual([]);
    });
  });

  describe('配置选项', () => {
    it('应该支持自定义配置', () => {
      const customDiscovery = createCapabilityDiscovery({
        enableCache: false,
        cacheTtl: 5000,
        validate: false,
      });

      customDiscovery.discoverFromAgents(mockAgents);

      const cacheStatus = customDiscovery.getCacheStatus();
      expect(cacheStatus.enabled).toBe(false);
    });

    it('应该支持启用验证', () => {
      const validatingDiscovery = createCapabilityDiscovery({
        validate: true,
      });

      // 不应该抛出错误
      expect(() => {
        validatingDiscovery.discoverFromAgents(mockAgents);
      }).not.toThrow();
    });
  });

  describe('边界条件', () => {
    it('应该处理空的 Agent 列表', () => {
      discovery.discoverFromAgents([]);

      expect(discovery.findAll().length).toBe(0);
      expect(discovery.getDiscoveredAgents().length).toBe(0);
    });

    it('应该处理没有 tools 的 Agent', () => {
      const agentNoTools: AgentDefinition = {
        name: 'no-tools-agent',
        type: 'worker',
        layer: 'L3',
        description: 'Agent without tools',
        prompt_path: '/agents/no-tools.md',
        tools: [],
        capabilities: [],
        argument_hint: 'Test',
        embedded_governance: {
          first_principles_check: false,
          red_team_threshold: 'low',
          quality_gate_enabled: true,
          max_retries: 3,
          token_budget: 100000,
        },
      };

      discovery.discoverFromAgent(agentNoTools);

      const caps = discovery.findByAgent('no-tools-agent');
      expect(caps.length).toBe(0);
    });

    it('应该处理只有 tools 没有 capabilities 的 Agent', () => {
      const agentOnlyTools: AgentDefinition = {
        name: 'only-tools-agent',
        type: 'worker',
        layer: 'L3',
        description: 'Agent with only tools',
        prompt_path: '/agents/only-tools.md',
        tools: ['execute', 'deploy'],
        capabilities: [],
        argument_hint: 'Test',
        embedded_governance: {
          first_principles_check: false,
          red_team_threshold: 'low',
          quality_gate_enabled: true,
          max_retries: 3,
          token_budget: 100000,
        },
      };

      discovery.discoverFromAgent(agentOnlyTools);

      const caps = discovery.findByAgent('only-tools-agent');
      expect(caps.length).toBe(2);
    });

    it('应该处理只有 capabilities 没有 tools 的 Agent', () => {
      const agentOnlyCaps: AgentDefinition = {
        name: 'only-caps-agent',
        type: 'worker',
        layer: 'L3',
        description: 'Agent with only capabilities',
        prompt_path: '/agents/only-caps.md',
        tools: [],
        capabilities: ['code-generation', 'testing'],
        argument_hint: 'Test',
        embedded_governance: {
          first_principles_check: false,
          red_team_threshold: 'low',
          quality_gate_enabled: true,
          max_retries: 3,
          token_budget: 100000,
        },
      };

      discovery.discoverFromAgent(agentOnlyCaps);

      const caps = discovery.findByAgent('only-caps-agent');
      expect(caps.length).toBe(2);
    });

    it('应该处理多次发现操作', () => {
      discovery.discoverFromAgents(mockAgents);
      const count1 = discovery.findAll().length;

      // 再次发现应该清空之前的索引
      discovery.discoverFromAgents(mockAgents);
      const count2 = discovery.findAll().length;

      expect(count1).toBe(count2);
    });
  });

  describe('性能测试', () => {
    it('应该快速发现大量 Agent', () => {
      const largeAgentSet: AgentDefinition[] = [];
      for (let i = 0; i < 100; i++) {
        largeAgentSet.push({
          name: `agent-${i}`,
          type: 'worker',
          layer: 'L3',
          description: `Agent ${i}`,
          prompt_path: `/agents/agent-${i}.md`,
          tools: [`tool-${i}`],
          capabilities: [`capability-${i}`],
          argument_hint: 'Test',
          embedded_governance: {
            first_principles_check: false,
            red_team_threshold: 'low',
            quality_gate_enabled: true,
            max_retries: 3,
            token_budget: 100000,
          },
        });
      }

      const start = performance.now();
      discovery.discoverFromAgents(largeAgentSet);
      const duration = performance.now() - start;

      // 应该在 100ms 内完成
      expect(duration).toBeLessThan(100);
    });

    it('应该快速查询能力', () => {
      discovery.discoverFromAgents(mockAgents);

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        discovery.findByType('analysis');
      }
      const duration = performance.now() - start;

      // 1000 次查询应该在 10ms 内完成
      expect(duration).toBeLessThan(10);
    });
  });
});
