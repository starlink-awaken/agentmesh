/**
 * Honeycomb v2 - Agent Capability Schema Tests
 *
 * 测试 Agent 能力模式化系统的核心功能：
 * - CapabilitySchema 类型系统
 * - 能力定义验证
 * - 能力发现机制
 * - 能力匹配算法
 */

import { describe, it, expect, beforeEach } from 'bun:test';

// 导入被测试的模块
import {
  CapabilityType,
  CapabilityLevel,
  IOSchema,
  CapabilityDependency,
  CapabilityDefinition,
  AgentCapabilities,
  CapabilityMatchRequest,
  CapabilityMatchResult,
  compareCapabilityLevels,
  meetsCapabilityLevel,
  getCapabilityLevels,
  isValidCapabilityType,
  isValidCapabilityLevel,
  CAPABILITY_TYPES,
  CAPABILITY_LEVEL_VALUES,
} from '../src/capability-schema.js';

import {
  validateIOSchema,
  validateCapabilityDefinition,
  detectCircularDependencies,
  validateLevelConsistency,
  validateAgentCapabilities,
  createValidationResult,
} from '../src/capability-validator.js';

import {
  CapabilityDiscovery,
  createCapabilityDiscovery,
  type DiscoveredCapability,
} from '../src/capability-discovery.js';

import {
  CapabilityMatcher,
  createCapabilityMatcher,
} from '../src/capability-matcher.js';

import type { AgentDefinition } from '../src/types.js';

// ============================================================
// 测试数据
// ============================================================

const mockAgentDefinitions: AgentDefinition[] = [
  {
    name: 'code-analyzer',
    type: 'worker',
    layer: 'L1',
    description: 'Analyzes code structure and quality',
    prompt_path: '/agents/layer-1-research/code-analyzer.md',
    tools: ['ast-parse', 'complexity-calculate'],
    capabilities: ['ast-parse', 'complexity-calculate'],
    argument_hint: 'Code to analyze',
    embedded_governance: {
      first_principles_check: true,
      red_team_threshold: 'medium',
      quality_gate_enabled: true,
      max_retries: 3,
      token_budget: 100000,
    },
  },
  {
    name: 'code-generator',
    type: 'worker',
    layer: 'L3',
    description: 'Generates code from specifications',
    prompt_path: '/agents/layer-3-execution/code-generator.md',
    tools: ['code-generate'],
    capabilities: ['code-generate'],
    argument_hint: 'Code specification',
    embedded_governance: {
      first_principles_check: true,
      red_team_threshold: 'medium',
      quality_gate_enabled: true,
      max_retries: 3,
      token_budget: 100000,
    },
  },
  {
    name: 'quality-validator',
    type: 'structural',
    layer: 'L4',
    description: 'Validates code quality',
    prompt_path: '/agents/layer-4-feedback/quality-validator.md',
    tools: ['syntax-check', 'style-check', 'security-scan'],
    capabilities: ['syntax-check', 'style-check', 'security-scan'],
    argument_hint: 'Code to validate',
    embedded_governance: {
      first_principles_check: true,
      red_team_threshold: 'medium',
      quality_gate_enabled: true,
      max_retries: 3,
      token_budget: 100000,
    },
  },
];

// ============================================================
// CapabilitySchema 类型系统测试
// ============================================================

describe('CapabilitySchema', () => {
  describe('类型系统', () => {
    it('应该正确定义所有能力类型', () => {
      const types: CapabilityType[] = [
        'analysis',
        'generation',
        'validation',
        'transformation',
        'execution',
        'coordination',
        'monitoring',
        'custom',
      ];
      expect(types).toHaveLength(8);
      expect(CAPABILITY_TYPES).toHaveLength(8);
    });

    it('应该正确定义所有能力等级', () => {
      const levels: CapabilityLevel[] = ['basic', 'intermediate', 'advanced', 'expert'];
      expect(levels).toHaveLength(4);
    });

    it('应该支持能力等级排序', () => {
      expect(CAPABILITY_LEVEL_VALUES.basic).toBe(0);
      expect(CAPABILITY_LEVEL_VALUES.expert).toBe(3);
      expect(compareCapabilityLevels('basic', 'expert')).toBeLessThan(0);
      expect(compareCapabilityLevels('expert', 'basic')).toBeGreaterThan(0);
      expect(compareCapabilityLevels('intermediate', 'intermediate')).toBe(0);
    });

    it('应该检查能力等级满足', () => {
      expect(meetsCapabilityLevel('expert', 'basic')).toBe(true);
      expect(meetsCapabilityLevel('advanced', 'intermediate')).toBe(true);
      expect(meetsCapabilityLevel('basic', 'expert')).toBe(false);
      expect(meetsCapabilityLevel('intermediate', 'advanced')).toBe(false);
    });

    it('应该获取排序后的能力等级', () => {
      const levels = getCapabilityLevels();
      expect(levels).toEqual(['basic', 'intermediate', 'advanced', 'expert']);
    });

    it('应该验证能力类型有效性', () => {
      expect(isValidCapabilityType('analysis')).toBe(true);
      expect(isValidCapabilityType('generation')).toBe(true);
      expect(isValidCapabilityType('invalid')).toBe(false);
    });

    it('应该验证能力等级有效性', () => {
      expect(isValidCapabilityLevel('basic')).toBe(true);
      expect(isValidCapabilityLevel('expert')).toBe(true);
      expect(isValidCapabilityLevel('invalid')).toBe(false);
    });
  });

  describe('IOSchema', () => {
    it('应该支持基本类型定义', () => {
      const stringSchema: IOSchema = { type: 'string' };
      const numberSchema: IOSchema = { type: 'number' };
      const boolSchema: IOSchema = { type: 'boolean' };

      expect(stringSchema.type).toBe('string');
      expect(numberSchema.type).toBe('number');
      expect(boolSchema.type).toBe('boolean');
    });

    it('应该支持复杂对象类型定义', () => {
      const objectSchema: IOSchema = {
        type: 'object',
        description: '项目配置',
        properties: {
          name: { type: 'string', description: '项目名称' },
          complexity: {
            type: 'string',
            enum: ['simple', 'standard', 'advanced', 'enterprise'],
          },
          tokenBudget: { type: 'number', minimum: 0 },
        },
        required: ['name', 'complexity'],
      };

      expect(objectSchema.properties).toBeDefined();
      expect(objectSchema.properties?.name.type).toBe('string');
      expect(objectSchema.required).toContain('name');
    });

    it('应该支持数组类型定义', () => {
      const arraySchema: IOSchema = {
        type: 'array',
        description: '任务列表',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            description: { type: 'string' },
          },
        },
      };

      expect(arraySchema.items).toBeDefined();
      expect(arraySchema.items?.type).toBe('object');
    });
  });

  describe('CapabilityDefinition', () => {
    it('应该创建完整的能力定义', () => {
      const capability: CapabilityDefinition = {
        id: 'code-analysis',
        type: 'analysis',
        name: '代码分析',
        description: '分析代码质量、复杂度和潜在问题',
        level: 'advanced',
        input: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            language: { type: 'string' },
          },
          required: ['code'],
        },
        output: {
          type: 'object',
          properties: {
            issues: { type: 'array' },
            complexity: { type: 'number' },
            suggestions: { type: 'array' },
          },
        },
        dependencies: [
          { capability: 'code-parsing', minLevel: 'intermediate', required: true },
        ],
        tags: ['code', 'quality', 'static-analysis'],
        version: '1.0.0',
        performance: {
          avgDurationMs: 5000,
          avgTokens: 2000,
          successRate: 0.95,
        },
      };

      expect(capability.id).toBe('code-analysis');
      expect(capability.type).toBe('analysis');
      expect(capability.level).toBe('advanced');
      expect(capability.dependencies).toHaveLength(1);
      expect(capability.tags).toContain('code');
    });

    it('应该支持最小化能力定义', () => {
      const minimalCapability: CapabilityDefinition = {
        id: 'simple-task',
        type: 'execution',
        name: '简单任务执行',
        description: '执行简单任务',
        level: 'basic',
      };

      expect(minimalCapability.id).toBe('simple-task');
      expect(minimalCapability.dependencies).toBeUndefined();
    });
  });

  describe('AgentCapabilities', () => {
    it('应该聚合多个能力定义', () => {
      const agentCapabilities: AgentCapabilities = {
        agentName: 'code-reviewer',
        agentVersion: '1.0.0',
        defaultLevel: 'intermediate',
        capabilities: [
          {
            id: 'syntax-check',
            type: 'validation',
            name: '语法检查',
            description: '检查代码语法错误',
            level: 'basic',
          },
          {
            id: 'style-check',
            type: 'validation',
            name: '风格检查',
            description: '检查代码风格一致性',
            level: 'intermediate',
          },
          {
            id: 'security-scan',
            type: 'analysis',
            name: '安全扫描',
            description: '扫描代码安全问题',
            level: 'advanced',
          },
        ],
      };

      expect(agentCapabilities.agentName).toBe('code-reviewer');
      expect(agentCapabilities.capabilities).toHaveLength(3);
    });
  });

  describe('CapabilityMatchRequest', () => {
    it('应该支持精确匹配请求', () => {
      const exactRequest: CapabilityMatchRequest = {
        type: 'validation',
        tags: ['code', 'syntax'],
        minLevel: 'intermediate',
        mode: 'exact',
      };

      expect(exactRequest.mode).toBe('exact');
      expect(exactRequest.type).toBe('validation');
    });

    it('应该支持模糊匹配请求', () => {
      const fuzzyRequest: CapabilityMatchRequest = {
        tags: ['code'],
        maxDurationMs: 10000,
        mode: 'fuzzy',
      };

      expect(fuzzyRequest.mode).toBe('fuzzy');
      expect(fuzzyRequest.maxDurationMs).toBe(10000);
    });

    it('应该支持带输入数据的匹配请求', () => {
      const requestWithData: CapabilityMatchRequest = {
        type: 'transformation',
        input: { code: 'function x() {}', language: 'typescript' },
        outputSchema: {
          type: 'object',
          properties: {
            transformed: { type: 'string' },
          },
        },
        mode: 'exact',
      };

      expect(requestWithData.input).toBeDefined();
      expect(requestWithData.outputSchema).toBeDefined();
    });
  });
});

// ============================================================
// CapabilityValidator 测试
// ============================================================

describe('CapabilityValidator', () => {
  describe('IOSchema 验证', () => {
    it('应该验证有效的基本 Schema', () => {
      const schema: IOSchema = { type: 'string' };
      const result = validateIOSchema(schema);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测无效的类型', () => {
      const schema = { type: 'invalid' as any };
      const result = validateIOSchema(schema);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('应该验证对象 Schema 的 properties', () => {
      const schema: IOSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };
      const result = validateIOSchema(schema);

      expect(result.valid).toBe(true);
    });

    it('应该检测不在 properties 中的 required 字段', () => {
      const schema: IOSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name', 'missing'],
      };
      const result = validateIOSchema(schema);

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('missing'))).toBe(true);
    });

    it('应该验证数值约束', () => {
      const schema: IOSchema = {
        type: 'number',
        minimum: 10,
        maximum: 5,
      };
      const result = validateIOSchema(schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Minimum'))).toBe(true);
    });

    it('应该验证正则表达式模式', () => {
      const schema: IOSchema = {
        type: 'string',
        pattern: '[invalid(regex',
      };
      const result = validateIOSchema(schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid regex'))).toBe(true);
    });
  });

  describe('能力定义验证', () => {
    it('应该验证有效的能力定义', () => {
      const definition: CapabilityDefinition = {
        id: 'test-capability',
        type: 'analysis',
        name: '测试能力',
        description: '这是一个测试能力',
        level: 'intermediate',
      };
      const result = validateCapabilityDefinition(definition);

      expect(result.valid).toBe(true);
    });

    it('应该检测缺失的必需字段', () => {
      const definition = {} as CapabilityDefinition;
      const result = validateCapabilityDefinition(definition);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('应该检测自依赖', () => {
      const definition: CapabilityDefinition = {
        id: 'self-dependent',
        type: 'analysis',
        name: '自依赖能力',
        description: '测试自依赖',
        level: 'intermediate',
        dependencies: [
          { capability: 'self-dependent', required: true },
        ],
      };
      const result = validateCapabilityDefinition(definition);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('self-dependency'))).toBe(true);
    });

    it('应该验证性能指标范围', () => {
      const definition: CapabilityDefinition = {
        id: 'test-capability',
        type: 'analysis',
        name: '测试能力',
        description: '测试',
        level: 'intermediate',
        performance: {
          successRate: 1.5, // 无效：应该 <= 1
        },
      };
      const result = validateCapabilityDefinition(definition);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('successRate'))).toBe(true);
    });
  });

  describe('循环依赖检测', () => {
    it('应该检测直接循环依赖', () => {
      const capabilities = new Map<string, CapabilityDefinition>();
      capabilities.set('A', {
        id: 'A',
        type: 'analysis',
        name: 'A',
        description: 'A',
        level: 'intermediate',
        dependencies: [{ capability: 'B', required: true }],
      });
      capabilities.set('B', {
        id: 'B',
        type: 'analysis',
        name: 'B',
        description: 'B',
        level: 'intermediate',
        dependencies: [{ capability: 'A', required: true }],
      });

      const errors = detectCircularDependencies(capabilities);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('A -> B -> A');
    });

    it('应该检测复杂循环依赖', () => {
      const capabilities = new Map<string, CapabilityDefinition>();
      capabilities.set('A', {
        id: 'A',
        type: 'analysis',
        name: 'A',
        description: 'A',
        level: 'intermediate',
        dependencies: [{ capability: 'B', required: true }],
      });
      capabilities.set('B', {
        id: 'B',
        type: 'analysis',
        name: 'B',
        description: 'B',
        level: 'intermediate',
        dependencies: [{ capability: 'C', required: true }],
      });
      capabilities.set('C', {
        id: 'C',
        type: 'analysis',
        name: 'C',
        description: 'C',
        level: 'intermediate',
        dependencies: [{ capability: 'A', required: true }],
      });

      const errors = detectCircularDependencies(capabilities);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('应该不报告无循环的情况', () => {
      const capabilities = new Map<string, CapabilityDefinition>();
      capabilities.set('A', {
        id: 'A',
        type: 'analysis',
        name: 'A',
        description: 'A',
        level: 'intermediate',
        dependencies: [{ capability: 'B', required: true }],
      });
      capabilities.set('B', {
        id: 'B',
        type: 'analysis',
        name: 'B',
        description: 'B',
        level: 'intermediate',
        dependencies: [],
      });

      const errors = detectCircularDependencies(capabilities);

      expect(errors).toHaveLength(0);
    });
  });

  describe('等级一致性验证', () => {
    it('应该检测不满足依赖等级要求的情况', () => {
      const capabilities = new Map<string, CapabilityDefinition>();
      capabilities.set('A', {
        id: 'A',
        type: 'analysis',
        name: 'A',
        description: 'A',
        level: 'expert',
        dependencies: [{ capability: 'B', minLevel: 'advanced', required: true }],
      });
      capabilities.set('B', {
        id: 'B',
        type: 'analysis',
        name: 'B',
        description: 'B',
        level: 'basic', // 低于要求的 advanced
      });

      const result = validateLevelConsistency(capabilities);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('advanced');
    });
  });

  describe('Agent 能力集合验证', () => {
    it('应该验证有效的 Agent 能力集合', () => {
      const agentCaps: AgentCapabilities = {
        agentName: 'test-agent',
        capabilities: [
          {
            id: 'cap1',
            type: 'analysis',
            name: '能力1',
            description: '描述',
            level: 'basic',
          },
        ],
      };

      const result = validateAgentCapabilities(agentCaps);

      expect(result.valid).toBe(true);
    });

    it('应该检测重复的能力 ID', () => {
      const agentCaps: AgentCapabilities = {
        agentName: 'test-agent',
        capabilities: [
          {
            id: 'duplicate',
            type: 'analysis',
            name: '能力1',
            description: '描述',
            level: 'basic',
          },
          {
            id: 'duplicate', // 重复 ID
            type: 'validation',
            name: '能力2',
            description: '描述',
            level: 'intermediate',
          },
        ],
      };

      const result = validateAgentCapabilities(agentCaps);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Duplicate'))).toBe(true);
    });
  });
});

// ============================================================
// CapabilityDiscovery 测试
// ============================================================

describe('CapabilityDiscovery', () => {
  let discovery: CapabilityDiscovery;

  beforeEach(() => {
    discovery = createCapabilityDiscovery();
  });

  describe('发现能力', () => {
    it('应该从 AgentDefinition 列表发现能力', () => {
      discovery.discoverFromAgents(mockAgentDefinitions);

      const allCapabilities = discovery.findAll();

      expect(allCapabilities.length).toBeGreaterThan(0);
    });

    it('应该按类型查找能力', () => {
      discovery.discoverFromAgents(mockAgentDefinitions);

      const analysisCapabilities = discovery.findByType('analysis');

      expect(Array.isArray(analysisCapabilities)).toBe(true);
    });

    it('应该按等级查找能力', () => {
      discovery.discoverFromAgents(mockAgentDefinitions);

      const basicCapabilities = discovery.findByLevel('basic');

      expect(Array.isArray(basicCapabilities)).toBe(true);
    });

    it('应该按 Agent 查找能力', () => {
      discovery.discoverFromAgents(mockAgentDefinitions);

      const codeAnalyzerCapabilities = discovery.findByAgent('code-analyzer');

      expect(codeAnalyzerCapabilities.length).toBeGreaterThan(0);
      expect(codeAnalyzerCapabilities.every((c) => c.agentName === 'code-analyzer')).toBe(true);
    });

    it('应该按标签查找能力', () => {
      discovery.discoverFromAgents(mockAgentDefinitions);

      const toolCapabilities = discovery.findByTag('tool');

      expect(Array.isArray(toolCapabilities)).toBe(true);
    });

    it('应该按多个标签查找能力', () => {
      discovery.discoverFromAgents(mockAgentDefinitions);

      const results = discovery.findByTags(['tool', 'research']);

      expect(Array.isArray(results)).toBe(true);
    });

    it('应该支持查找所有匹配任一标签的能力', () => {
      discovery.discoverFromAgents(mockAgentDefinitions);

      const results = discovery.findByTags(['tool', 'execution'], false);

      expect(Array.isArray(results)).toBe(true);
    });

    it('应该支持查找所有匹配全部标签的能力', () => {
      discovery.discoverFromAgents(mockAgentDefinitions);

      const results = discovery.findByTags(['tool'], true);

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('缓存管理', () => {
    it('应该正确报告缓存状态', () => {
      discovery.discoverFromAgents(mockAgentDefinitions);

      const status = discovery.getCacheStatus();

      expect(status.enabled).toBe(true);
      expect(status.capabilityCount).toBeGreaterThan(0);
    });

    it('应该清空缓存', () => {
      discovery.discoverFromAgents(mockAgentDefinitions);

      expect(discovery.findAll().length).toBeGreaterThan(0);

      discovery.clearCache();

      expect(discovery.findAll().length).toBe(0);
    });
  });

  describe('统计信息', () => {
    it('应该提供能力统计信息', () => {
      discovery.discoverFromAgents(mockAgentDefinitions);

      const stats = discovery.getStatistics();

      expect(stats.totalCapabilities).toBeGreaterThan(0);
      expect(typeof stats.capabilitiesByType).toBe('object');
      expect(typeof stats.capabilitiesByLevel).toBe('object');
      expect(Array.isArray(stats.topTags)).toBe(true);
    });
  });
});

// ============================================================
// CapabilityMatcher 测试
// ============================================================

describe('CapabilityMatcher', () => {
  let discovery: CapabilityDiscovery;
  let discoveredCapabilities: DiscoveredCapability[];

  beforeEach(() => {
    discovery = createCapabilityDiscovery();
    discovery.discoverFromAgents(mockAgentDefinitions);
    discoveredCapabilities = discovery.findAll();
  });

  describe('精确匹配', () => {
    it('应该执行精确类型匹配', () => {
      const matcher = createCapabilityMatcher(discoveredCapabilities);
      const request: CapabilityMatchRequest = {
        type: 'analysis',
        mode: 'exact',
      };

      const results = matcher.match(request);

      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0].capability.type).toBe('analysis');
      }
    });

    it('应该执行精确标签匹配', () => {
      const matcher = createCapabilityMatcher(discoveredCapabilities);
      const request: CapabilityMatchRequest = {
        tags: ['tool'],
        mode: 'exact',
      };

      const results = matcher.match(request);

      expect(Array.isArray(results)).toBe(true);
    });

    it('应该执行精确等级匹配', () => {
      const matcher = createCapabilityMatcher(discoveredCapabilities);
      const request: CapabilityMatchRequest = {
        minLevel: 'basic',
        mode: 'exact',
      };

      const results = matcher.match(request);

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('模糊匹配', () => {
    it('应该计算模糊匹配分数', () => {
      const matcher = createCapabilityMatcher(discoveredCapabilities);
      const request: CapabilityMatchRequest = {
        tags: ['code', 'tool'],
        mode: 'fuzzy',
      };

      const results = matcher.match(request);

      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0].score).toBeGreaterThanOrEqual(0);
        expect(results[0].score).toBeLessThanOrEqual(1);
      }
    });

    it('应该按分数降序排序结果', () => {
      const matcher = createCapabilityMatcher(discoveredCapabilities);
      const request: CapabilityMatchRequest = {
        mode: 'fuzzy',
      };

      const results = matcher.match(request);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  describe('任意匹配', () => {
    it('应该返回所有能力', () => {
      const matcher = createCapabilityMatcher(discoveredCapabilities);
      const request: CapabilityMatchRequest = {
        mode: 'any',
      };

      const results = matcher.match(request);

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('便利方法', () => {
    it('应该找到最佳匹配', () => {
      const matcher = createCapabilityMatcher(discoveredCapabilities);
      const request: CapabilityMatchRequest = {
        type: 'analysis',
        mode: 'exact',
      };

      const best = matcher.findBestMatch(request);

      if (best) {
        expect(best.capability.type).toBe('analysis');
      }
    });

    it('应该找到前 N 个匹配', () => {
      const matcher = createCapabilityMatcher(discoveredCapabilities);
      const request: CapabilityMatchRequest = {
        mode: 'any',
      };

      const top3 = matcher.findTopMatches(request, 3);

      expect(top3.length).toBeLessThanOrEqual(3);
    });
  });
});
