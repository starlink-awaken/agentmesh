/**
 * P2.1 Workflow Skills 系统核心实现
 *
 * 提供可复用的工作流能力抽象：
 * - SkillRegistry: Skill 注册表，管理所有已注册的 Skills
 * - SkillExecutor: Skill 执行器，执行单个或批量 Skills
 * - 内置 Skills: CodeReview, TestGenerator, Refactor, DocumentGenerator, GitIntegration
 *
 * 设计原则：
 * - 可组合性：Skills 可组合成复杂工作流
 * - 版本管理：支持 Skills 版本控制与迁移
 * - 类型安全：TypeScript 严格模式
 * - 零运行时依赖：仅使用 Bun/Node.js 内置 API
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// 导入类型
import type {
  SkillConfig,
  SkillExecutionRequest,
  SkillExecutionResult,
  SkillComposition,
  SkillCompositionValidation,
  SkillRegistryConfig,
  SkillListFilter,
  SkillVersion,
  SkillExecutionContext,
  SkillValidationResult,
  SkillType,
} from './workflow-skills-types.js';

// ============================================================
// 内置 Skills 定义
// ============================================================

/** 内置 Skills 配置 */
const BUILTIN_SKILLS: SkillConfig[] = [
  // CodeReview Skill - 代码审查
  {
    metadata: {
      skill_id: 'honeycomb.code.review',
      name: 'Code Review',
      type: 'validation' as SkillType,
      version: { major: 1, minor: 0, patch: 0 },
      description: 'Reviews code for quality issues, security vulnerabilities, and best practices violations',
      publisher: 'honeycomb',
      tags: ['code', 'review', 'quality', 'security'],
      license: 'MIT',
      dependencies: [],
      keywords: ['code review', 'quality check', 'security scan'],
      created_at: Date.now(),
      updated_at: Date.now(),
    },
    execution_mode: 'sync',
    inputs: [
      {
        name: 'code',
        type: 'string',
        description: 'The source code to review',
        required: true,
      },
      {
        name: 'language',
        type: 'string',
        description: 'Programming language (typescript, javascript, python, etc.)',
        required: true,
        default: 'typescript',
      },
      {
        name: 'rules',
        type: 'object',
        description: 'Custom review rules',
        required: false,
      },
    ],
    outputs: [
      {
        type: 'object',
        description: 'Review results with issues and suggestions',
      },
    ],
    agent_template: `You are a code reviewer. Review the following {{language}} code:

\`\`\`{{language}}
{{code}}
\`\`\`

{{#if rules}}
Custom rules: {{rules}}
{{/if}}

Provide a detailed review including:
1. Code quality issues
2. Security vulnerabilities
3. Performance concerns
4. Best practices violations

Format your response as JSON:
{
  "issues": [{"severity": "high|medium|low", "line": number, "message": string, "suggestion": string}],
  "summary": string,
  "score": number
}`,
    tools: [],
    token_budget: 5000,
    timeout_ms: 30000,
  },

  // TestGenerator Skill - 测试生成
  {
    metadata: {
      skill_id: 'honeycomb.code.test',
      name: 'Test Generator',
      type: 'generation' as SkillType,
      version: { major: 1, minor: 0, patch: 0 },
      description: 'Generates unit tests from source code using best practices',
      publisher: 'honeycomb',
      tags: ['code', 'testing', 'generation'],
      license: 'MIT',
      dependencies: [],
      keywords: ['test generation', 'unit tests', 'tdd'],
      created_at: Date.now(),
      updated_at: Date.now(),
    },
    execution_mode: 'sync',
    inputs: [
      {
        name: 'code',
        type: 'string',
        description: 'Source code to generate tests for',
        required: true,
      },
      {
        name: 'language',
        type: 'string',
        description: 'Programming language',
        required: true,
        default: 'typescript',
      },
      {
        name: 'test_framework',
        type: 'string',
        description: 'Test framework to use (jest, vitest, mocha, etc.)',
        required: false,
        default: 'jest',
      },
    ],
    outputs: [
      {
        type: 'string',
        description: 'Generated test code',
      },
    ],
    agent_template: `Generate comprehensive unit tests for the following {{language}} code using {{test_framework}}:

\`\`\`{{language}}
{{code}}
\`\`\`

Generate tests that cover:
1. Normal cases
2. Edge cases
3. Error handling
4. Boundary conditions

Return the complete test file.`,
    tools: [],
    token_budget: 8000,
    timeout_ms: 30000,
  },

  // Refactor Skill - 代码重构
  {
    metadata: {
      skill_id: 'honeycomb.code.refactor',
      name: 'Code Refactor',
      type: 'transformation' as SkillType,
      version: { major: 1, minor: 0, patch: 0 },
      description: 'Refactors code according to specified rules and best practices',
      publisher: 'honeycomb',
      tags: ['code', 'refactor', 'transformation'],
      license: 'MIT',
      dependencies: [],
      keywords: ['refactoring', 'code quality', 'clean code'],
      created_at: Date.now(),
      updated_at: Date.now(),
    },
    execution_mode: 'sync',
    inputs: [
      {
        name: 'code',
        type: 'string',
        description: 'Source code to refactor',
        required: true,
      },
      {
        name: 'language',
        type: 'string',
        description: 'Programming language',
        required: true,
        default: 'typescript',
      },
      {
        name: 'rules',
        type: 'array',
        description: 'Refactoring rules to apply',
        required: true,
      },
    ],
    outputs: [
      {
        type: 'string',
        description: 'Refactored code',
      },
    ],
    agent_template: `Refactor the following {{language}} code applying these rules: {{rules}}

\`\`\`{{language}}
{{code}}
\`\`\`

Provide:
1. The refactored code
2. A summary of changes made
3. Any potential issues or warnings`,
    tools: [],
    token_budget: 6000,
    timeout_ms: 30000,
  },

  // DocumentGenerator Skill - 文档生成
  {
    metadata: {
      skill_id: 'honeycomb.doc.generate',
      name: 'Document Generator',
      type: 'generation' as SkillType,
      version: { major: 1, minor: 0, patch: 0 },
      description: 'Generates documentation from code, API specs, or content',
      publisher: 'honeycomb',
      tags: ['documentation', 'generation'],
      license: 'MIT',
      dependencies: [],
      keywords: ['docs', 'api documentation', 'markdown'],
      created_at: Date.now(),
      updated_at: Date.now(),
    },
    execution_mode: 'sync',
    inputs: [
      {
        name: 'content',
        type: 'string',
        description: 'Content to generate documentation from',
        required: true,
      },
      {
        name: 'format',
        type: 'string',
        description: 'Output format (markdown, html, etc.)',
        required: false,
        default: 'markdown',
      },
      {
        name: 'style',
        type: 'string',
        description: 'Documentation style (api, user, developer)',
        required: false,
        default: 'api',
      },
    ],
    outputs: [
      {
        type: 'string',
        description: 'Generated documentation',
      },
    ],
    agent_template: `Generate {{style}} documentation in {{format}} format for:

{{content}}

Include:
- Clear descriptions
- Usage examples
- Parameter details
- Return value documentation

Ensure the documentation is clear, concise, and well-formatted.`,
    tools: [],
    token_budget: 5000,
    timeout_ms: 30000,
  },

  // GitIntegration Skill - Git 集成
  {
    metadata: {
      skill_id: 'honeycomb.git.commit',
      name: 'Git Commit',
      type: 'integration' as SkillType,
      version: { major: 1, minor: 0, patch: 0 },
      description: 'Creates Git commits with formatted messages',
      publisher: 'honeycomb',
      tags: ['git', 'integration', 'vcs'],
      license: 'MIT',
      dependencies: [],
      keywords: ['git', 'commit', 'version control'],
      created_at: Date.now(),
      updated_at: Date.now(),
    },
    execution_mode: 'sync',
    inputs: [
      {
        name: 'message',
        type: 'string',
        description: 'Commit message',
        required: true,
      },
      {
        name: 'files',
        type: 'array',
        description: 'Files to commit',
        required: true,
      },
      {
        name: 'co_authors',
        type: 'array',
        description: 'Co-authors for the commit',
        required: false,
      },
    ],
    outputs: [
      {
        type: 'object',
        description: 'Commit result with hash and metadata',
      },
    ],
    agent_template: `Prepare a Git commit with the following details:

Message: {{message}}
Files: {{files}}
{{#if co_authors}}Co-authors: {{co_authors}}{{/if}}

Generate the complete git command and simulate the commit result.`,
    tools: ['git'],
    token_budget: 2000,
    timeout_ms: 10000,
  },
];

// ============================================================
// 工具函数
// ============================================================

/**
 * 生成唯一执行 ID
 */
function generateExecutionId(): string {
  return `exec-${crypto.randomUUID()}`;
}

/**
 * 版本比较（返回 -1, 0, 1）
 */
function compareVersions(v1: SkillVersion, v2: SkillVersion): -1 | 0 | 1 {
  if (v1.major !== v2.major) return v1.major > v2.major ? 1 : -1;
  if (v1.minor !== v2.minor) return v1.minor > v2.minor ? 1 : -1;
  if (v1.patch !== v2.patch) return v1.patch > v2.patch ? 1 : -1;
  const pre1 = v1.pre || '';
  const pre2 = v2.pre || '';
  if (pre1 !== pre2) {
    if (!pre1) return 1;
    if (!pre2) return -1;
    return pre1 > pre2 ? 1 : -1;
  }
  return 0;
}

/**
 * 解析版本字符串为 SkillVersion
 */
function parseVersionString(version: string): SkillVersion | null {
  const parts = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?/);
  if (!parts) return null;
  return {
    major: parseInt(parts[1], 10),
    minor: parseInt(parts[2], 10),
    patch: parseInt(parts[3], 10),
    pre: parts[4],
  };
}

/**
 * 验证 Skill 配置
 */
function validateSkillConfig(config: SkillConfig): SkillValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 验证元数据
  if (!config.metadata.skill_id || config.metadata.skill_id.trim() === '') {
    errors.push('skill_id is required');
  }
  if (!config.metadata.name || config.metadata.name.trim() === '') {
    errors.push('name is required');
  }
  if (!config.metadata.description || config.metadata.description.trim() === '') {
    errors.push('description is required');
  }
  if (!config.metadata.publisher || config.metadata.publisher.trim() === '') {
    errors.push('publisher is required');
  }

  // 验证 skill_id 格式 (publisher.name)
  if (config.metadata.skill_id && !config.metadata.skill_id.includes('.')) {
    warnings.push('skill_id should follow format: publisher.name');
  }

  // 验证 agent_template
  if (!config.agent_template || config.agent_template.trim() === '') {
    errors.push('agent_template is required');
  }

  // 验证输入定义
  if (!config.inputs || !Array.isArray(config.inputs)) {
    errors.push('inputs must be an array');
  } else {
    for (const input of config.inputs) {
      if (!input.name || input.name.trim() === '') {
        errors.push('each input must have a name');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================
// SkillRegistry 类
// ============================================================

/**
 * Skill Registry - Skill 注册表
 *
 * 职责：
 * - 注册/注销 Skills
 * - 查询 Skills（按 ID、类型、发布者、标签）
 * - 版本管理
 * - Skill 组合管理
 * - 持久化（SQLite）
 */
export class SkillRegistry {
  /** Skills 存储：Map<skillId, Map<versionString, SkillConfig>> */
  private skills: Map<string, Map<string, SkillConfig>> = new Map();

  /** Skill 组合存储 */
  private compositions: Map<string, SkillComposition> = new Map();

  /** 配置 */
  private config: SkillRegistryConfig;

  /** 数据库路径 */
  private dbPath: string;

  /** 初始化完成标志 */
  private initialized: boolean = false;

  constructor(config: SkillRegistryConfig = {}) {
    this.config = {
      storage_path: config.storage_path || './skills.db',
      auto_load: config.auto_load ?? true,
      market_endpoint: config.market_endpoint || 'https://market.honeycomb.dev/api/v1/skills',
      cache_ttl_ms: config.cache_ttl_ms || 3600000,
    };
    this.dbPath = this.config.storage_path!;

    // 总是加载内置 Skills
    this.loadBuiltinSkills();

    // 只有在启用自动加载时才从磁盘加载
    if (this.config.auto_load) {
      // 使用 Promise.catch 避免未处理的 Promise 警告
      this.load().catch((err: Error) => {
        // 忽略文件不存在的错误
        if (!err.message.includes('no such file')) {
          console.warn(`Failed to load skills from disk: ${err.message}`);
        }
      });
    }
  }

  // ----------------------------------------------------------
  // Skill 管理
  // ----------------------------------------------------------

  /**
   * 注册 Skill
   * @param config - Skill 配置
   * @returns Skill ID
   */
  register(config: SkillConfig): string {
    // 验证配置
    const validation = validateSkillConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid Skill config: ${validation.errors.join(', ')}`);
    }

    const skillId = config.metadata.skill_id;
    const versionStr = this.versionToString(config.metadata.version);

    // 获取或创建版本 Map
    if (!this.skills.has(skillId)) {
      this.skills.set(skillId, new Map());
    }

    const versions = this.skills.get(skillId)!;

    // 检查是否已存在相同版本
    if (versions.has(versionStr)) {
      throw new Error(`Skill ${skillId} version ${versionStr} already registered`);
    }

    // 注册 Skill
    versions.set(versionStr, config);

    return skillId;
  }

  /**
   * 注销 Skill
   * @param skillId - Skill ID
   * @param version - 版本（可选，默认删除所有版本）
   */
  unregister(skillId: string, version?: string): void {
    if (!this.skills.has(skillId)) {
      return;
    }

    if (version) {
      const versions = this.skills.get(skillId)!;
      versions.delete(version);
      if (versions.size === 0) {
        this.skills.delete(skillId);
      }
    } else {
      this.skills.delete(skillId);
    }
  }

  /**
   * 获取 Skill 配置
   * @param skillId - Skill ID
   * @param version - 版本约束（可选）
   */
  get(skillId: string, version?: string): SkillConfig | null {
    const versions = this.skills.get(skillId);
    if (!versions) {
      return null;
    }

    if (version) {
      // 查找特定版本
      return versions.get(version) || null;
    }

    // 返回最新版本
    return this.getLatestVersionConfig(skillId);
  }

  /**
   * 列出所有已注册 Skills
   * @param filters - 过滤条件
   */
  list(filters?: SkillListFilter): SkillConfig[] {
    const results: SkillConfig[] = [];

    for (const versions of this.skills.values()) {
      const latest = this.getLatestFromVersionMap(versions);
      if (!latest) continue;

      // 应用过滤器
      if (filters?.type && latest.metadata.type !== filters.type) {
        continue;
      }
      if (filters?.publisher && latest.metadata.publisher !== filters.publisher) {
        continue;
      }
      if (filters?.tags && filters.tags.length > 0) {
        const hasAllTags = filters.tags.every(tag =>
          latest.metadata.tags.includes(tag)
        );
        if (!hasAllTags) continue;
      }

      results.push(latest);
    }

    return results;
  }

  /**
   * 搜索 Skills
   * @param query - 搜索关键词
   * @param filters - 过滤条件
   */
  search(query: string, filters?: SkillListFilter): SkillConfig[] {
    const lowerQuery = query.toLowerCase();
    const results: SkillConfig[] = [];

    for (const skill of this.list(filters)) {
      const { name, description, keywords, skill_id } = skill.metadata;

      if (
        name.toLowerCase().includes(lowerQuery) ||
        description.toLowerCase().includes(lowerQuery) ||
        skill_id.toLowerCase().includes(lowerQuery) ||
        keywords.some(k => k.toLowerCase().includes(lowerQuery))
      ) {
        results.push(skill);
      }
    }

    return results;
  }

  /**
   * 检查 Skill 是否存在
   */
  has(skillId: string): boolean {
    return this.skills.has(skillId);
  }

  // ----------------------------------------------------------
  // Skill 版本管理
  // ----------------------------------------------------------

  /**
   * 获取 Skill 的所有版本
   */
  getVersions(skillId: string): SkillVersion[] {
    const versions = this.skills.get(skillId);
    if (!versions) {
      return [];
    }

    return Array.from(versions.values()).map(s => s.metadata.version);
  }

  /**
   * 获取 Skill 的最新版本
   */
  getLatestVersion(skillId: string): SkillVersion | null {
    const config = this.getLatestVersionConfig(skillId);
    return config?.metadata.version || null;
  }

  /**
   * 解析版本约束，返回匹配的版本
   */
  resolveVersion(skillId: string, constraint: string): SkillVersion | null {
    const versions = this.skills.get(skillId);
    if (!versions) {
      return null;
    }

    // 简化实现：解析精确版本或 "latest"
    if (constraint === 'latest' || constraint === '*') {
      return this.getLatestVersion(skillId);
    }

    const parsed = parseVersionString(constraint);
    if (parsed) {
      const versionStr = this.versionToString(parsed);
      return versions.get(versionStr)?.metadata.version || null;
    }

    return this.getLatestVersion(skillId);
  }

  // ----------------------------------------------------------
  // Skill 组合
  // ----------------------------------------------------------

  /**
   * 创建 Skill 组合
   */
  createComposition(composition: SkillComposition): string {
    // 验证组合
    const validation = this.validateComposition(composition);
    if (!validation.valid) {
      throw new Error(`Invalid composition: ${validation.errors.join(', ')}`);
    }

    this.compositions.set(composition.composition_id, composition);
    return composition.composition_id;
  }

  /**
   * 获取 Skill 组合
   */
  getComposition(compositionId: string): SkillComposition | null {
    return this.compositions.get(compositionId) || null;
  }

  /**
   * 列出所有组合
   */
  listCompositions(): SkillComposition[] {
    return Array.from(this.compositions.values());
  }

  /**
   * 验证 Skill 组合的合法性
   */
  validateComposition(composition: SkillComposition): SkillCompositionValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查节点引用的 Skills 是否存在
    for (const node of composition.nodes) {
      if (!this.has(node.skill_id)) {
        errors.push(`Skill ${node.skill_id} referenced by node ${node.node_id} not found`);
      }
    }

    // 检查循环依赖
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    function hasCycle(nodeId: string): boolean {
      if (recursionStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      recursionStack.add(nodeId);

      for (const edge of composition.edges) {
        if (edge.from === nodeId) {
          if (hasCycle(edge.to)) return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    }

    for (const node of composition.nodes) {
      if (hasCycle(node.node_id)) {
        errors.push('Circular dependency detected in composition');
        break;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 将组合编译为单个 Skill
   */
  compileComposition(compositionId: string): SkillConfig {
    const composition = this.getComposition(compositionId);
    if (!composition) {
      throw new Error(`Composition ${compositionId} not found`);
    }

    // 构建组合的 agent_template
    const templateParts: string[] = [
      `# ${composition.name}`,
      composition.description,
      '',
      '## Steps',
    ];

    for (const node of composition.nodes) {
      const skill = this.get(node.skill_id);
      if (skill) {
        templateParts.push(`\n### ${node.name}`);
        templateParts.push(`Skill: ${node.skill_id}`);
      }
    }

    // 创建组合后的 Skill 配置
    const compiledSkill: SkillConfig = {
      metadata: {
        skill_id: `composed.${composition.composition_id}`,
        name: composition.name,
        type: 'orchestration',
        version: { major: 1, minor: 0, patch: 0 },
        description: composition.description,
        publisher: 'honeycomb',
        tags: ['composition'],
        license: 'MIT',
        dependencies: composition.nodes.map(n => ({
          skill_id: n.skill_id,
          version_constraint: '*',
          required: true,
        })),
        keywords: [],
        created_at: Date.now(),
        updated_at: Date.now(),
      },
      execution_mode: 'sync',
      inputs: [], // 从 composition.input_mapping 推导
      outputs: [],
      agent_template: templateParts.join('\n'),
      tools: [],
    };

    return compiledSkill;
  }

  // ----------------------------------------------------------
  // 持久化
  // ----------------------------------------------------------

  /**
   * 保存注册表到磁盘
   */
  async save(): Promise<void> {
    const data = {
      skills: Array.from(this.skills.entries()).map(([id, versions]) => [
        id,
        Array.from(versions.entries()),
      ]),
      compositions: Array.from(this.compositions.entries()),
      saved_at: Date.now(),
    };

    fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
  }

  /**
   * 从磁盘加载注册表
   */
  async load(): Promise<void> {
    if (!fs.existsSync(this.dbPath)) {
      return;
    }

    try {
      const content = fs.readFileSync(this.dbPath, 'utf-8');
      const data = JSON.parse(content);

      // 加载 Skills
      if (data.skills) {
        for (const [id, versionEntries] of data.skills) {
          const versions = new Map<string, SkillConfig>();
          for (const [version, config] of versionEntries as Array<[string, SkillConfig]>) {
            versions.set(version, config);
          }
          this.skills.set(id as string, versions);
        }
      }

      // 加载组合
      if (data.compositions) {
        for (const [id, composition] of data.compositions) {
          this.compositions.set(id as string, composition as SkillComposition);
        }
      }

      this.initialized = true;
    } catch (err) {
      throw new Error(`Failed to load skills: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 导出 Skills 为 JSON
   */
  export(skillIds?: string[]): string {
    const data: Record<string, unknown> = {
      skills: [],
      compositions: Array.from(this.compositions.values()),
      exported_at: Date.now(),
      version: '1.0.0',
    };

    const skillsToExport: SkillConfig[] = [];

    if (skillIds && skillIds.length > 0) {
      for (const id of skillIds) {
        const versions = this.skills.get(id);
        if (versions) {
          skillsToExport.push(...Array.from(versions.values()));
        }
      }
    } else {
      for (const versions of this.skills.values()) {
        skillsToExport.push(...Array.from(versions.values()));
      }
    }

    data.skills = skillsToExport;

    return JSON.stringify(data, null, 2);
  }

  /**
   * 从 JSON 导入 Skills
   */
  import(json: string): void {
    try {
      const data = JSON.parse(json);

      if (data.skills && Array.isArray(data.skills)) {
        for (const config of data.skills) {
          try {
            this.register(config as SkillConfig);
          } catch {
            // 跳过无效的 Skill
          }
        }
      }

      if (data.compositions && Array.isArray(data.compositions)) {
        for (const composition of data.compositions) {
          try {
            this.createComposition(composition as SkillComposition);
          } catch {
            // 跳过无效的组合
          }
        }
      }
    } catch (err) {
      throw new Error(`Failed to import skills: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ----------------------------------------------------------
  // 内部方法
  // ----------------------------------------------------------

  /**
   * 加载内置 Skills
   */
  private loadBuiltinSkills(): void {
    for (const skill of BUILTIN_SKILLS) {
      try {
        this.register(skill);
      } catch (err) {
        console.warn(`Failed to register builtin skill ${skill.metadata.skill_id}: ${err}`);
      }
    }
  }

  /**
   * 版本转字符串
   */
  private versionToString(version: SkillVersion): string {
    let str = `${version.major}.${version.minor}.${version.patch}`;
    if (version.pre) {
      str += `-${version.pre}`;
    }
    return str;
  }

  /**
   * 从版本 Map 获取最新版本
   */
  private getLatestFromVersionMap(versions: Map<string, SkillConfig>): SkillConfig | null {
    let latest: SkillConfig | null = null;
    let latestVersion: SkillVersion | null = null;

    for (const config of versions.values()) {
      if (!latestVersion || compareVersions(config.metadata.version, latestVersion) > 0) {
        latest = config;
        latestVersion = config.metadata.version;
      }
    }

    return latest;
  }

  /**
   * 获取最新版本的配置
   */
  private getLatestVersionConfig(skillId: string): SkillConfig | null {
    const versions = this.skills.get(skillId);
    return versions ? this.getLatestFromVersionMap(versions) : null;
  }

  // ----------------------------------------------------------
  // 资源清理
  // ----------------------------------------------------------

  /**
   * 释放注册表占用的所有资源
   *
   * 清理所有内部映射，释放持有的引用，
   * 防止内存泄漏。调用后，注册表实例将不再可用。
   */
  dispose(): void {
    // 清空 skills 映射中的所有嵌套 Map
    for (const versions of this.skills.values()) {
      versions.clear();
    }
    this.skills.clear();

    // 清空 compositions 映射
    this.compositions.clear();

    // 标记为未初始化状态
    this.initialized = false;
  }
}

/**
 * 创建 SkillRegistry 实例的工厂函数
 */
export function createSkillRegistry(config?: SkillRegistryConfig): SkillRegistry {
  return new SkillRegistry(config);
}

// ============================================================
// SkillExecutor 类
// ============================================================

/**
 * Skill 执行上下文存储
 */
interface ExecutionState {
  result: SkillExecutionResult;
  config: SkillConfig;
  abortController: AbortController;
}

/**
 * Skill Executor - Skill 执行器
 *
 * 职责：
 * - 执行单个或批量 Skills
 * - 验证输入参数
 * - 管理执行状态
 * - 处理取消和超时
 */
export class SkillExecutor {
  /** 注册表 */
  private registry: SkillRegistry;

  /** 执行状态存储 */
  private executions: Map<string, ExecutionState> = new Map();

  /** Trace ID 生成器（用于分布式追踪） */
  private generateTraceId(): string {
    return crypto.randomUUID();
  }

  constructor(registry: SkillRegistry) {
    this.registry = registry;
  }

  // ----------------------------------------------------------
  // Skill 执行
  // ----------------------------------------------------------

  /**
   * 执行 Skill
   * @param request - 执行请求
   */
  async execute(request: SkillExecutionRequest): Promise<SkillExecutionResult> {
    const executionId = generateExecutionId();
    const startedAt = Date.now();
    const traceId = this.generateTraceId();

    // 获取 Skill 配置
    let config: SkillConfig | null = null;
    if (request.version) {
      config = this.registry.get(request.skill_id, request.version);
    } else {
      config = this.registry.get(request.skill_id);
    }

    if (!config) {
      return {
        execution_id: executionId,
        skill_id: request.skill_id,
        version: { major: 0, minor: 0, patch: 0 },
        status: 'failed',
        started_at: startedAt,
        completed_at: Date.now(),
        duration_ms: 0,
        token_usage: 0,
        error: {
          code: 'SKILL_NOT_FOUND',
          message: `Skill ${request.skill_id} not found`,
        },
        logs: [],
      };
    }

    // 验证输入
    const validation = this.validateInputs(config, request.inputs);
    if (!validation.valid) {
      return {
        execution_id: executionId,
        skill_id: request.skill_id,
        version: config.metadata.version,
        status: 'failed',
        started_at: startedAt,
        completed_at: Date.now(),
        duration_ms: 0,
        token_usage: 0,
        error: {
          code: 'INVALID_INPUT',
          message: validation.errors.join(', '),
        },
        logs: [{
          timestamp: startedAt,
          level: 'error',
          message: 'Input validation failed',
          data: { errors: validation.errors },
        }],
      };
    }

    // 创建执行上下文
    const abortController = new AbortController();
    const context: SkillExecutionContext = {
      execution_id: executionId,
      skill_config: config,
      inputs: request.inputs,
      trace_id: traceId,
      temp_dir: `/tmp/skills-${executionId}`,
      started_at: startedAt,
      abort_signal: abortController.signal,
    };

    // 创建执行结果
    const result: SkillExecutionResult = {
      execution_id: executionId,
      trace_id: traceId, // 添加追踪ID用于分布式追踪
      skill_id: request.skill_id,
      version: config.metadata.version,
      status: 'running',
      started_at: startedAt,
      token_usage: 0,
      logs: [{
        timestamp: startedAt,
        level: 'info',
        message: `Executing skill ${request.skill_id}`,
      }],
    };

    // 存储执行状态
    this.executions.set(executionId, {
      result,
      config,
      abortController,
    });

    try {
      // 执行 Skill
      const executionResult = await this.executeSkill(context, request.options);

      // 更新结果
      result.status = 'completed';
      result.completed_at = Date.now();
      result.duration_ms = result.completed_at - startedAt;
      result.token_usage = executionResult.tokenUsage;
      result.output = executionResult.output;
      result.logs.push({
        timestamp: result.completed_at,
        level: 'info',
        message: 'Skill execution completed',
      });

    } catch (err) {
      result.status = 'failed';
      result.completed_at = Date.now();
      result.duration_ms = result.completed_at - startedAt;
      result.error = {
        code: 'EXECUTION_ERROR',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      };
      result.logs.push({
        timestamp: result.completed_at,
        level: 'error',
        message: 'Skill execution failed',
        data: { error: result.error.message },
      });
    }

    return result;
  }

  /**
   * 批量执行 Skills
   */
  async executeBatch(requests: SkillExecutionRequest[]): Promise<SkillExecutionResult[]> {
    const results: SkillExecutionResult[] = [];

    for (const request of requests) {
      const result = await this.execute(request);
      results.push(result);
    }

    return results;
  }

  /**
   * 流式执行 Skill
   */
  async *executeStream(request: SkillExecutionRequest): AsyncIterable<SkillExecutionResult> {
    const executionId = generateExecutionId();
    const startedAt = Date.now();

    // 获取 Skill 配置
    const config = this.registry.get(request.skill_id);
    if (!config) {
      yield {
        execution_id: executionId,
        skill_id: request.skill_id,
        version: { major: 0, minor: 0, patch: 0 },
        status: 'failed',
        started_at: startedAt,
        completed_at: Date.now(),
        token_usage: 0,
        error: {
          code: 'SKILL_NOT_FOUND',
          message: `Skill ${request.skill_id} not found`,
        },
        logs: [],
      };
      return;
    }

    // 发送开始事件
    yield {
      execution_id: executionId,
      skill_id: request.skill_id,
      version: config.metadata.version,
      status: 'running',
      started_at: startedAt,
      token_usage: 0,
      logs: [],
    };

    // 模拟流式输出
    await new Promise(resolve => setTimeout(resolve, 100));

    // 发送完成事件
    yield {
      execution_id: executionId,
      skill_id: request.skill_id,
      version: config.metadata.version,
      status: 'completed',
      started_at: startedAt,
      completed_at: Date.now(),
      duration_ms: 100,
      token_usage: 100,
      output: { stream: 'complete' },
      logs: [],
    };
  }

  /**
   * 取消执行
   */
  cancel(executionId: string): void {
    const state = this.executions.get(executionId);
    if (state) {
      state.abortController.abort();
      state.result.status = 'cancelled';
      state.result.completed_at = Date.now();
      state.result.logs.push({
        timestamp: Date.now(),
        level: 'warn',
        message: 'Execution cancelled',
      });
    }
  }

  /**
   * 获取执行状态
   */
  getExecutionStatus(executionId: string): SkillExecutionResult | null {
    const state = this.executions.get(executionId);
    return state?.result || null;
  }

  // ----------------------------------------------------------
  // 输入验证
  // ----------------------------------------------------------

  /**
   * 验证 Skill 输入
   */
  validateInputs(config: SkillConfig, inputs: Record<string, unknown>): SkillValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const inputDef of config.inputs) {
      const value = inputs[inputDef.name];

      // 检查必需参数
      if (inputDef.required && (value === undefined || value === null)) {
        errors.push(`Required parameter '${inputDef.name}' is missing`);
        continue;
      }

      // 如果参数不存在且不是必需的，跳过验证
      if (value === undefined || value === null) {
        continue;
      }

      // 验证类型
      if (!this.validateType(value, inputDef.type)) {
        errors.push(`Parameter '${inputDef.name}' should be of type ${inputDef.type}`);
      }
    }

    // 检查额外的未知参数
    const knownParams = new Set(config.inputs.map(i => i.name));
    for (const key of Object.keys(inputs)) {
      if (!knownParams.has(key)) {
        warnings.push(`Unknown parameter '${key}'`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 创建执行上下文
   */
  createContext(request: SkillExecutionRequest): SkillExecutionContext {
    const config = this.registry.get(request.skill_id);
    if (!config) {
      throw new Error(`Skill ${request.skill_id} not found`);
    }

    return {
      execution_id: generateExecutionId(),
      skill_config: config,
      inputs: request.inputs,
      trace_id: this.generateTraceId(),
      temp_dir: `/tmp/skills-${Date.now()}`,
      started_at: Date.now(),
      abort_signal: AbortSignal.timeout(request.options?.timeout_ms || 30000),
    };
  }

  /**
   * 清理执行资源
   */
  cleanup(executionId: string): void {
    const state = this.executions.get(executionId);
    if (state) {
      // 取消正在进行的执行
      if (state.result.status === 'running') {
        state.abortController.abort();
      }
      this.executions.delete(executionId);
    }
  }

  /**
   * 清理所有执行资源
   *
   * 取消所有正在进行的执行，并清空执行状态存储。
   * 此方法应在不再需要 SkillExecutor 时调用，以防止内存泄漏。
   */
  dispose(): void {
    // 取消所有正在进行的执行
    for (const [executionId, state] of this.executions.entries()) {
      if (state.result.status === 'running') {
        state.abortController.abort();
        // 更新状态为已取消
        state.result.status = 'cancelled';
        state.result.completed_at = Date.now();
        state.result.logs.push({
          timestamp: Date.now(),
          level: 'warn',
          message: 'Execution cancelled during dispose',
        });
      }
    }

    // 清空执行状态存储
    this.executions.clear();
  }

  // ----------------------------------------------------------
  // 内部方法
  // ----------------------------------------------------------

  /**
   * 实际执行 Skill 的方法
   */
  private async executeSkill(
    context: SkillExecutionContext,
    options?: SkillExecutionRequest['options'],
  ): Promise<{ output: unknown; tokenUsage: number }> {
    const { skill_config, inputs } = context;

    // 模拟执行：构建 prompt 并估算 token
    const prompt = this.buildPrompt(skill_config, inputs);
    const tokenUsage = Math.ceil(prompt.length / 4);

    // 模拟执行延迟
    await new Promise(resolve => setTimeout(resolve, 50));

    // 根据不同 Skill 类型返回不同输出
    const output = this.simulateOutput(skill_config.metadata.skill_id, inputs);

    return { output, tokenUsage };
  }

  /**
   * 构建 prompt
   */
  private buildPrompt(config: SkillConfig, inputs: Record<string, unknown>): string {
    let prompt = config.agent_template;

    // 替换模板变量
    for (const [key, value] of Object.entries(inputs)) {
      const placeholder = `{{${key}}}`;
      prompt = prompt.replace(new RegExp(placeholder, 'g'), String(value));
    }

    return prompt;
  }

  /**
   * 模拟 Skill 输出
   */
  private simulateOutput(skillId: string, inputs: Record<string, unknown>): unknown {
    switch (skillId) {
      case 'honeycomb.code.review':
        return {
          issues: [
            { severity: 'low', line: 1, message: 'Consider adding JSDoc', suggestion: 'Add documentation' },
          ],
          summary: 'Code is well-structured',
          score: 85,
        };

      case 'honeycomb.code.test':
        return `import { test, expect } from 'bun:test';

test('example test', () => {
  expect(true).toBe(true);
});`;

      case 'honeycomb.code.refactor':
        return inputs.code || '// Refactored code';

      case 'honeycomb.doc.generate':
        return `# Documentation\n\nGenerated documentation for: ${inputs.content}`;

      case 'honeycomb.git.commit':
        return {
          hash: crypto.randomUUID(),
          message: inputs.message,
          files: inputs.files,
        };

      default:
        return { executed: true, inputs };
    }
  }

  /**
   * 验证类型
   */
  private validateType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      default:
        return true;
    }
  }
}

/**
 * 创建 SkillExecutor 实例的工厂函数
 */
export function createSkillExecutor(registry: SkillRegistry): SkillExecutor {
  return new SkillExecutor(registry);
}
