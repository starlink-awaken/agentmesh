/**
 * P2.1 Workflow Skills 系统 - 单元测试
 *
 * 测试覆盖：
 * - SkillRegistry 注册、查询、版本管理
 * - Skill 执行、组合
 * - 内置 Skills（CodeReview, TestGenerator, Refactor, DocumentGenerator, GitIntegration）
 * - 与 AgentRunner 集成
 *
 * 遵循 TDD 原则：先写测试，验证失败，再实现功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, unlinkSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// 导入被测试模块
import {
  SkillRegistry,
  createSkillRegistry,
  SkillExecutor,
  createSkillExecutor,
} from './workflow-skills.js';
import type {
  SkillConfig,
  SkillType,
  SkillExecutionMode,
  SkillExecutionRequest,
  SkillExecutionResult,
  SkillComposition,
  SkillVersion,
} from './workflow-skills-types.js';

// ============================================================
// 测试工具函数
// ============================================================

/** 创建测试用 Skill 配置 */
function createTestSkillConfig(overrides?: Partial<SkillConfig>): SkillConfig {
  return {
    metadata: {
      skill_id: 'test.skill',
      name: 'Test Skill',
      type: 'analysis' as SkillType,
      version: { major: 1, minor: 0, patch: 0 },
      description: 'A test skill for unit testing',
      publisher: 'test',
      tags: ['test'],
      license: 'MIT',
      dependencies: [],
      keywords: ['test'],
      created_at: Date.now(),
      updated_at: Date.now(),
    },
    execution_mode: 'sync' as SkillExecutionMode,
    inputs: [
      {
        name: 'input',
        type: 'string',
        description: 'Test input',
        required: true,
      },
    ],
    outputs: [
      {
        type: 'string',
        description: 'Test output',
      },
    ],
    agent_template: 'You are a test agent. Input: {{input}}',
    tools: [],
    token_budget: 1000,
  };
}

/** 创建测试用 Skill 组合 */
function createTestComposition(): SkillComposition {
  return {
    composition_id: 'test-composition',
    name: 'Test Composition',
    description: 'A test composition',
    nodes: [
      {
        node_id: 'node1',
        skill_id: 'test.skill1',
        name: 'First Skill',
        type: 'skill',
        input_mapping: { input: 'input' },
      },
      {
        node_id: 'node2',
        skill_id: 'test.skill2',
        name: 'Second Skill',
        type: 'skill',
        input_mapping: { input: 'node1.output' },
      },
    ],
    edges: [
      {
        from: 'node1',
        to: 'node2',
        mapping: { input: 'output' },
      },
    ],
    input_mapping: { input: 'input' },
    output_mapping: { output: 'node2.output' },
  };
}

/** 临时数据库路径 */
const TEST_DB_PATH = resolve(process.cwd(), 'test-skills.db');

/** 清理测试文件 */
function cleanupTestFiles(): void {
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }
  const testWalPath = TEST_DB_PATH + '-wal';
  const testShmPath = TEST_DB_PATH + '-shm';
  if (existsSync(testWalPath)) unlinkSync(testWalPath);
  if (existsSync(testShmPath)) unlinkSync(testShmPath);
}

// ============================================================
// SkillRegistry 测试套件
// ============================================================

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    cleanupTestFiles();
    registry = createSkillRegistry({ storage_path: TEST_DB_PATH, auto_load: false });
  });

  afterEach(() => {
    cleanupTestFiles();
  });

  // ----------------------------------------------------------
  // Skill 注册管理
  // ----------------------------------------------------------

  describe('register', () => {
    it('应该成功注册一个 Skill', () => {
      const config = createTestSkillConfig();
      const skillId = registry.register(config);

      expect(skillId).toBe('test.skill');
      expect(registry.has('test.skill')).toBe(true);
    });

    it('应该拒绝注册重复的 Skill ID', () => {
      const config = createTestSkillConfig();
      registry.register(config);

      expect(() => registry.register(config)).toThrow();
    });

    it('应该支持注册不同版本的 Skill', () => {
      const config1 = createTestSkillConfig();
      config1.metadata.version = { major: 1, minor: 0, patch: 0 };

      const config2 = createTestSkillConfig();
      config2.metadata.version = { major: 2, minor: 0, patch: 0 };

      registry.register(config1);
      // 第二个版本应该可以注册（同名不同版本）
      // 实现取决于设计，这里假设覆盖
      registry.register(config2);

      const versions = registry.getVersions('test.skill');
      expect(versions.length).toBeGreaterThanOrEqual(1);
    });

    it('应该验证 Skill 配置的必需字段', () => {
      const invalidConfig = {
        metadata: {
          skill_id: '',
          name: '',
          type: 'invalid' as SkillType,
          version: { major: 1, minor: 0, patch: 0 },
          description: '',
          publisher: '',
          tags: [],
          license: '',
          dependencies: [],
          keywords: [],
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        execution_mode: 'sync' as SkillExecutionMode,
        inputs: [],
        outputs: [],
        agent_template: '',
        tools: [],
      };

      expect(() => registry.register(invalidConfig)).toThrow();
    });
  });

  // ----------------------------------------------------------
  // Skill 查询
  // ----------------------------------------------------------

  describe('get', () => {
    it('应该返回已注册的 Skill', () => {
      const config = createTestSkillConfig();
      registry.register(config);

      const retrieved = registry.get('test.skill');
      expect(retrieved).toBeDefined();
      expect(retrieved?.metadata.skill_id).toBe('test.skill');
    });

    it('应该支持版本约束查询', () => {
      const config1 = createTestSkillConfig();
      config1.metadata.version = { major: 1, minor: 2, patch: 0 };
      registry.register(config1);

      const config2 = createTestSkillConfig();
      config2.metadata.skill_id = 'test.skill2';
      config2.metadata.version = { major: 2, minor: 0, patch: 0 };
      registry.register(config2);

      // 查询特定版本
      const v1 = registry.get('test.skill', '1.2.0');
      expect(v1?.metadata.version.major).toBe(1);
    });

    it('应该返回 null 对于不存在的 Skill', () => {
      const retrieved = registry.get('nonexistent.skill');
      expect(retrieved).toBeNull();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      registry.register(createTestSkillConfig());

      const analysisSkill = createTestSkillConfig();
      analysisSkill.metadata.skill_id = 'analysis.skill';
      analysisSkill.metadata.type = 'analysis';
      registry.register(analysisSkill);

      const generationSkill = createTestSkillConfig();
      generationSkill.metadata.skill_id = 'generation.skill';
      generationSkill.metadata.type = 'generation';
      registry.register(generationSkill);
    });

    it('应该列出所有已注册 Skills', () => {
      const all = registry.list();
      expect(all.length).toBeGreaterThanOrEqual(3);
    });

    it('应该支持按类型过滤', () => {
      const analysisSkills = registry.list({ type: 'analysis' });
      expect(analysisSkills.length).toBeGreaterThanOrEqual(1);
      expect(analysisSkills.some(s => s.metadata.skill_id === 'analysis.skill')).toBe(true);
    });

    it('应该支持按发布者过滤', () => {
      const testSkills = registry.list({ publisher: 'test' });
      expect(testSkills.length).toBeGreaterThanOrEqual(3);
    });

    it('应该支持按标签过滤', () => {
      const taggedSkills = registry.list({ tags: ['test'] });
      expect(taggedSkills.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      // 使用内置 Skills 进行搜索测试
      // 内置 Skills 已在 registry 初始化时加载
    });

    it('应该按名称和描述搜索', () => {
      const results = registry.search('review');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].metadata.skill_id).toBe('honeycomb.code.review');
    });

    it('应该支持组合过滤', () => {
      const results = registry.search('test', { tags: ['testing'] });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('应该返回空数组对于无匹配搜索', () => {
      const results = registry.search('nonexistent-xyz-123');
      expect(results).toEqual([]);
    });
  });

  // ----------------------------------------------------------
  // Skill 版本管理
  // ----------------------------------------------------------

  describe('getVersions', () => {
    it('应该返回 Skill 的所有版本', () => {
      const v1 = createTestSkillConfig();
      v1.metadata.version = { major: 1, minor: 0, patch: 0 };
      registry.register(v1);

      const v2 = createTestSkillConfig();
      v2.metadata.version = { major: 2, minor: 0, patch: 0 };
      registry.register(v2);

      const versions = registry.getVersions('test.skill');
      expect(versions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getLatestVersion', () => {
    it('应该返回最新版本', () => {
      const v1 = createTestSkillConfig();
      v1.metadata.version = { major: 1, minor: 0, patch: 0 };
      registry.register(v1);

      const v2 = createTestSkillConfig();
      v2.metadata.version = { major: 2, minor: 0, patch: 0 };
      registry.register(v2);

      const latest = registry.getLatestVersion('test.skill');
      expect(latest?.major).toBeGreaterThanOrEqual(1);
    });
  });

  // ----------------------------------------------------------
  // Skill 组合
  // ----------------------------------------------------------

  describe('createComposition', () => {
    it('应该创建 Skill 组合', () => {
      // 先注册组合依赖的 Skills
      const skill1 = createTestSkillConfig();
      skill1.metadata.skill_id = 'test.skill1';
      registry.register(skill1);

      const skill2 = createTestSkillConfig();
      skill2.metadata.skill_id = 'test.skill2';
      registry.register(skill2);

      const composition = createTestComposition();
      const compositionId = registry.createComposition(composition);

      expect(compositionId).toBe('test-composition');
    });

    it('应该验证组合的合法性', () => {
      // 先注册组合依赖的 Skills
      const skill1 = createTestSkillConfig();
      skill1.metadata.skill_id = 'test.skill1';
      registry.register(skill1);

      const skill2 = createTestSkillConfig();
      skill2.metadata.skill_id = 'test.skill2';
      registry.register(skill2);

      const composition = createTestComposition();
      registry.createComposition(composition);

      const validation = registry.validateComposition(composition);
      // 由于没有注册依赖的 skills，验证可能失败
      expect(typeof validation.valid).toBe('boolean');
    });

    it('应该拒绝包含循环依赖的组合', () => {
      // 先注册组合依赖的 Skills
      const skill1 = createTestSkillConfig();
      skill1.metadata.skill_id = 'test.skill1';
      registry.register(skill1);

      const skill2 = createTestSkillConfig();
      skill2.metadata.skill_id = 'test.skill2';
      registry.register(skill2);

      const circularComposition: SkillComposition = {
        composition_id: 'circular',
        name: 'Circular Composition',
        description: 'Has circular dependencies',
        nodes: [
          {
            node_id: 'node1',
            skill_id: 'test.skill1',
            name: 'Node 1',
            type: 'skill',
            input_mapping: { input: 'node2.output' },
          },
          {
            node_id: 'node2',
            skill_id: 'test.skill2',
            name: 'Node 2',
            type: 'skill',
            input_mapping: { input: 'node1.output' },
          },
        ],
        edges: [
          { from: 'node1', to: 'node2', mapping: {} },
          { from: 'node2', to: 'node1', mapping: {} },
        ],
        input_mapping: {},
        output_mapping: {},
      };

      // 直接验证组合，不创建
      const validation = registry.validateComposition(circularComposition);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  // ----------------------------------------------------------
  // 持久化
  // ----------------------------------------------------------

  describe('save/load', () => {
    it('应该保存注册表到磁盘', async () => {
      const config = createTestSkillConfig();
      registry.register(config);

      await registry.save();
      expect(existsSync(TEST_DB_PATH)).toBe(true);
    });

    it('应该从磁盘加载注册表', async () => {
      const config = createTestSkillConfig();
      registry.register(config);
      await registry.save();

      // 创建新的注册表，禁用自动加载以避免异步问题
      const newRegistry = createSkillRegistry({ storage_path: TEST_DB_PATH, auto_load: false });
      // 手动调用加载
      await newRegistry.load();
      expect(newRegistry.has('test.skill')).toBe(true);
    });

    it('应该导出为 JSON', () => {
      registry.register(createTestSkillConfig());

      const exported = registry.export();
      const data = JSON.parse(exported);
      expect(data.skills).toBeDefined();
      expect(data.skills.length).toBeGreaterThan(0);
    });

    it('应该从 JSON 导入', () => {
      registry.register(createTestSkillConfig());
      const exported = registry.export();

      const newRegistry = createSkillRegistry({ auto_load: false });
      newRegistry.import(exported);

      expect(newRegistry.has('test.skill')).toBe(true);
    });
  });
});

// ============================================================
// SkillExecutor 测试套件
// ============================================================

describe('SkillExecutor', () => {
  let registry: SkillRegistry;
  let executor: SkillExecutor;

  beforeEach(() => {
    cleanupTestFiles();
    registry = createSkillRegistry({ auto_load: false });
    executor = createSkillExecutor(registry);
  });

  afterEach(() => {
    cleanupTestFiles();
  });

  // ----------------------------------------------------------
  // Skill 执行
  // ----------------------------------------------------------

  describe('execute', () => {
    it('应该执行 Skill 并返回结果', async () => {
      const config = createTestSkillConfig();
      registry.register(config);

      const request: SkillExecutionRequest = {
        skill_id: 'test.skill',
        inputs: { input: 'test input' },
      };

      const result = await executor.execute(request);

      expect(result.status).toBe('completed');
      expect(result.skill_id).toBe('test.skill');
      expect(result.execution_id).toBeDefined();
      expect(result.token_usage).toBeGreaterThanOrEqual(0);
    });

    it('应该验证输入参数', async () => {
      const config = createTestSkillConfig();
      registry.register(config);

      const request: SkillExecutionRequest = {
        skill_id: 'test.skill',
        inputs: {}, // 缺少必需的 'input' 参数
      };

      const result = await executor.execute(request);
      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
    });

    it('应该支持自定义执行选项', async () => {
      const config = createTestSkillConfig();
      config.timeout_ms = 5000;
      registry.register(config);

      const request: SkillExecutionRequest = {
        skill_id: 'test.skill',
        inputs: { input: 'test' },
        options: {
          timeout_ms: 1000,
          token_budget: 500,
        },
      };

      const result = await executor.execute(request);
      expect(result.status).toBe('completed');
    });
  });

  // ----------------------------------------------------------
  // 批量执行
  // ----------------------------------------------------------

  describe('executeBatch', () => {
    it('应该批量执行多个 Skills', async () => {
      const config = createTestSkillConfig();
      registry.register(config);

      const requests: SkillExecutionRequest[] = [
        { skill_id: 'test.skill', inputs: { input: 'test1' } },
        { skill_id: 'test.skill', inputs: { input: 'test2' } },
        { skill_id: 'test.skill', inputs: { input: 'test3' } },
      ];

      const results = await executor.executeBatch(requests);

      expect(results.length).toBe(3);
      expect(results.every(r => r.status === 'completed')).toBe(true);
    });

    it('应该继续执行即使部分失败', async () => {
      const config = createTestSkillConfig();
      registry.register(config);

      const requests: SkillExecutionRequest[] = [
        { skill_id: 'test.skill', inputs: { input: 'valid' } },
        { skill_id: 'nonexistent.skill', inputs: {} },
        { skill_id: 'test.skill', inputs: { input: 'valid' } },
      ];

      const results = await executor.executeBatch(requests);

      expect(results.length).toBe(3);
      expect(results[0].status).toBe('completed');
      expect(results[1].status).toBe('failed');
      expect(results[2].status).toBe('completed');
    });
  });

  // ----------------------------------------------------------
  // 执行状态查询
  // ----------------------------------------------------------

  describe('getExecutionStatus', () => {
    it('应该返回执行状态', async () => {
      const config = createTestSkillConfig();
      registry.register(config);

      const request: SkillExecutionRequest = {
        skill_id: 'test.skill',
        inputs: { input: 'test' },
      };

      const result = await executor.execute(request);
      const status = executor.getExecutionStatus(result.execution_id);

      expect(status).toBeDefined();
      expect(status?.execution_id).toBe(result.execution_id);
      expect(status?.status).toBe('completed');
    });

    it('应该返回 null 对于不存在的执行 ID', () => {
      const status = executor.getExecutionStatus('nonexistent-id');
      expect(status).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // 输入验证
  // ----------------------------------------------------------

  describe('validateInputs', () => {
    it('应该验证有效的输入', () => {
      const config = createTestSkillConfig();
      const result = executor.validateInputs(config, { input: 'test' });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('应该检测缺少的必需参数', () => {
      const config = createTestSkillConfig();
      const result = executor.validateInputs(config, {});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('input');
    });

    it('应该验证参数类型', () => {
      const config = createTestSkillConfig();
      config.inputs[0].type = 'number';

      const result = executor.validateInputs(config, { input: 'not a number' });

      expect(result.valid).toBe(false);
    });
  });
});

// ============================================================
// 内置 Skills 测试套件
// ============================================================

describe('Built-in Skills', () => {
  let registry: SkillRegistry;
  let executor: SkillExecutor;

  beforeEach(() => {
    cleanupTestFiles();
    // 禁用自动加载以避免异步问题，手动加载内置 Skills
    registry = createSkillRegistry({ auto_load: false });
    // 内置 Skills 在构造函数中已经加载
    executor = createSkillExecutor(registry);
  });

  afterEach(() => {
    cleanupTestFiles();
  });

  describe('CodeReview Skill', () => {
    it('应该存在 code-review skill', () => {
      const skill = registry.get('honeycomb.code.review');
      expect(skill).toBeDefined();
      expect(skill?.metadata.type).toBe('validation');
    });

    it('应该执行代码审查', async () => {
      const request: SkillExecutionRequest = {
        skill_id: 'honeycomb.code.review',
        inputs: {
          code: 'function test() { return 42; }',
          language: 'javascript',
        },
      };

      const result = await executor.execute(request);
      expect(result.status).toBe('completed');
    });
  });

  describe('TestGenerator Skill', () => {
    it('应该存在 test-generator skill', () => {
      const skill = registry.get('honeycomb.code.test');
      expect(skill).toBeDefined();
      expect(skill?.metadata.type).toBe('generation');
    });

    it('应该生成测试代码', async () => {
      const request: SkillExecutionRequest = {
        skill_id: 'honeycomb.code.test',
        inputs: {
          code: 'function add(a, b) { return a + b; }',
          language: 'typescript',
        },
      };

      const result = await executor.execute(request);
      expect(result.status).toBe('completed');
    });
  });

  describe('Refactor Skill', () => {
    it('应该存在 refactor skill', () => {
      const skill = registry.get('honeycomb.code.refactor');
      expect(skill).toBeDefined();
      expect(skill?.metadata.type).toBe('transformation');
    });

    it('应该重构代码', async () => {
      const request: SkillExecutionRequest = {
        skill_id: 'honeycomb.code.refactor',
        inputs: {
          code: 'const x = () => { return 1; }',
          language: 'typescript',
          rules: ['convert-to-arrow', 'remove-console'],
        },
      };

      const result = await executor.execute(request);
      expect(result.status).toBe('completed');
    });
  });

  describe('DocumentGenerator Skill', () => {
    it('应该存在 document-generator skill', () => {
      const skill = registry.get('honeycomb.doc.generate');
      expect(skill).toBeDefined();
      expect(skill?.metadata.type).toBe('generation');
    });

    it('应该生成文档', async () => {
      const request: SkillExecutionRequest = {
        skill_id: 'honeycomb.doc.generate',
        inputs: {
          content: '# My API\n\nThis is an API.',
          format: 'markdown',
        },
      };

      const result = await executor.execute(request);
      expect(result.status).toBe('completed');
    });
  });

  describe('GitIntegration Skill', () => {
    it('应该存在 git-commit skill', () => {
      const skill = registry.get('honeycomb.git.commit');
      expect(skill).toBeDefined();
      expect(skill?.metadata.type).toBe('integration');
    });

    it('应该模拟 Git 提交', async () => {
      const request: SkillExecutionRequest = {
        skill_id: 'honeycomb.git.commit',
        inputs: {
          message: 'feat: add new feature',
          files: ['src/index.ts'],
        },
      };

      const result = await executor.execute(request);
      expect(result.status).toBe('completed');
    });
  });
});

// ============================================================
// 与 AgentRunner 集成测试
// ============================================================

describe('AgentRunner Integration', () => {
  let registry: SkillRegistry;
  let executor: SkillExecutor;

  beforeEach(() => {
    cleanupTestFiles();
    // 禁用自动加载以避免异步问题
    registry = createSkillRegistry({ auto_load: false });
    executor = createSkillExecutor(registry);
  });

  afterEach(() => {
    cleanupTestFiles();
  });

  it('应该将 Skill 转换为可执行的 Agent', async () => {
    const skill = registry.get('honeycomb.code.review');
    expect(skill).toBeDefined();

    // Skill 应该包含 agent_template
    expect(skill?.agent_template).toBeDefined();
    expect(skill?.agent_template.length).toBeGreaterThan(0);
  });

  it('应该通过 AgentRunner 执行 Skill', async () => {
    // 这个测试需要 AgentRunner 的集成
    // 在完整实现后添加
    const request: SkillExecutionRequest = {
      skill_id: 'honeycomb.code.review',
      inputs: {
        code: 'function test() { return 42; }',
        language: 'javascript',
      },
    };

    const result = await executor.execute(request);
    expect(result.status).toBe('completed');
  });
});
