/**
 * Honeycomb v2 - Agent 执行器与 Agent 池
 *
 * AgentRunner: 从 Markdown 文件解析并执行单个 Agent 定义
 * AgentPool:   管理完整的 Agent 集合，支持基于层级和复杂度的查询，
 *              并为编排器提供调度接口
 *
 * 设计说明:
 * - 零外部 YAML 依赖；frontmatter 使用简单的字符串操作解析
 * - 目录递归扫描（node:fs + node:path）
 * - 执行支持模拟模式和通过 LLMClient 的真实 LLM API 调用
 *
 * @since v2.0.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

import type {
  AgentDefinition,
  AgentLayer,
  AgentState,
  AgentType,
  ComplexityLevel,
  GovernanceConfig,
  RiskLevel,
} from './types.js';
import { AgentStatus } from './types.js';
import type { LLMClient } from './llm/index.js';
import type { CompletionOptions, CompletionResult } from './llm/types.js';
import type { ContextShardManager } from './context-shard-manager.js';
import type { ContextShard } from './types.js';
import type { Logger } from './logger.js';
import { createLogger } from './logger.js';
import { MessageBus } from './message-bus.js';
import { PluginManager, createPluginManager } from './plugin-manager.js';
import type {
  PluginContext,
  PluginManifest,
  PluginMetadata,
  HoneycombPlugin,
} from './plugin-types.js';

// 导入 Workflow Skills 类型
import type {
  SkillConfig,
  SkillExecutionRequest,
  SkillExecutionResult,
  SkillListFilter,
} from './workflow-skills-types.js';
import type {
  SkillsManager,
  SkillsIntegrationConfig,
  SkillExecutionStats,
} from './agent-runner-skills.js';
import { createSkillsManager } from './agent-runner-skills.js';

// SkillRegistry 和 SkillExecutor 类型定义（从 workflow-skills.js 导入）
type SkillRegistry = import('./workflow-skills.js').SkillRegistry;
type SkillExecutor = import('./workflow-skills.js').SkillExecutor;

// 导入并行执行类型（延迟加载以避免循环依赖）
type ScheduledTask = import('./parallel-execution-types.js').ScheduledTask;
type ParallelExecutionConfig = import('./parallel-execution-types.js').ParallelExecutionConfig;
type AggregatedResult = import('./parallel-execution-types.js').AggregatedResult;
type PartialResult = import('./parallel-execution-types.js').PartialResult;

// ============================================================
// Constants
// ============================================================

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000; // 1s, 2s, 4s exponential

/** Default governance config embedded in every agent unless overridden. */
const DEFAULT_GOVERNANCE: GovernanceConfig = {
  first_principles_check: true,
  red_team_threshold: 'medium' as RiskLevel,
  quality_gate_enabled: true,
  max_retries: MAX_RETRIES,
  token_budget: 100_000,
};

/** Map directory names to agent layers. */
const LAYER_DIR_MAP: Record<string, AgentLayer> = {
  'layer-1-research': 'L1',
  'layer-2-decision': 'L2',
  'layer-3-execution': 'L3',
  'layer-4-feedback': 'L4',
  'governance': 'governance',
};

/** Map directory names to agent types. */
const AGENT_TYPE_MAP: Record<string, AgentType> = {
  'layer-1-research': 'structural',
  'layer-2-decision': 'structural',
  'layer-3-execution': 'worker',
  'layer-4-feedback': 'worker',
  'governance': 'structural',
};

// ============================================================
// Frontmatter Parser (zero-dep)
// ============================================================

interface ParsedFrontmatter {
  name: string;
  description: string;
  argument_hint?: string;
  tools: string[];
}

/**
 * Parse YAML-like frontmatter between `---` delimiters.
 *
 * Handles:
 *   - `name: value`
 *   - `description: |` followed by indented multiline text
 *   - `argument-hint: "value"`
 *   - `tools: ['a', 'b', 'c']`
 *
 * This is intentionally simple; it does NOT handle the full YAML spec.
 */
function parseFrontmatter(raw: string): { frontmatter: ParsedFrontmatter; body: string } {
  const lines = raw.split('\n');

  // Locate the two `---` delimiters
  let fmStart = -1;
  let fmEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (fmStart === -1) {
        fmStart = i;
      } else {
        fmEnd = i;
        break;
      }
    }
  }

  if (fmStart === -1 || fmEnd === -1) {
    throw new Error('Invalid agent Markdown: missing frontmatter delimiters (---)');
  }

  const fmLines = lines.slice(fmStart + 1, fmEnd);
  const body = lines.slice(fmEnd + 1).join('\n').trim();

  let name = '';
  let description = '';
  let argumentHint: string | undefined;
  let tools: string[] = [];

  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i];

    // name:
    if (line.startsWith('name:')) {
      name = extractScalar(line, 'name:');
      continue;
    }

    // description: (potentially multiline with `|`)
    if (line.startsWith('description:')) {
      const inlineValue = extractScalar(line, 'description:');
      if (inlineValue === '|' || inlineValue === '>') {
        // Collect indented continuation lines
        const descLines: string[] = [];
        while (i + 1 < fmLines.length && /^\s{2,}/.test(fmLines[i + 1])) {
          i++;
          descLines.push(fmLines[i].trim());
        }
        description = descLines.join('\n');
      } else {
        description = inlineValue;
      }
      continue;
    }

    // argument-hint:
    if (line.startsWith('argument-hint:')) {
      argumentHint = extractScalar(line, 'argument-hint:');
      continue;
    }

    // tools:
    if (line.startsWith('tools:')) {
      const toolsRaw = line.slice('tools:'.length).trim();
      tools = parseInlineArray(toolsRaw);
      continue;
    }
  }

  if (!name) {
    throw new Error('Invalid agent Markdown: missing "name" in frontmatter');
  }

  return {
    frontmatter: { name, description, argument_hint: argumentHint, tools },
    body,
  };
}

/** Extract a scalar value after `key:`, stripping quotes. */
function extractScalar(line: string, key: string): string {
  return line.slice(key.length).trim().replace(/^["']|["']$/g, '');
}

/** Parse an inline YAML-style array like `['a', 'b', 'c']`. */
function parseInlineArray(raw: string): string[] {
  // Strip outer brackets
  const inner = raw.replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!inner) return [];
  return inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
}

// ============================================================
// Filesystem Helpers
// ============================================================

/** Recursively find all `.md` files under a directory. */
function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Infer the agent layer from its file path by matching known directory names.
 * Falls back to 'L3' (execution) if no match.
 */
function inferLayer(filePath: string): AgentLayer {
  for (const [dirName, layer] of Object.entries(LAYER_DIR_MAP)) {
    if (filePath.includes(`/${dirName}/`) || filePath.includes(`\\${dirName}\\`)) {
      return layer;
    }
  }
  return 'L3';
}

/**
 * Infer the agent type from its file path by matching known directory names.
 * Falls back to 'worker' if no match.
 */
function inferAgentType(filePath: string): AgentType {
  for (const [dirName, agentType] of Object.entries(AGENT_TYPE_MAP)) {
    if (filePath.includes(`/${dirName}/`) || filePath.includes(`\\${dirName}\\`)) {
      return agentType;
    }
  }
  return 'worker';
}

/** Exponential backoff sleep: base * 2^attempt (1s, 2s, 4s). */
function backoffDelay(attempt: number): Promise<void> {
  const ms = BASE_BACKOFF_MS * Math.pow(2, attempt);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// AgentRunner
// ============================================================

/**
 * AgentRunner is responsible for parsing individual Agent Markdown definitions
 * and executing them (currently as a simulation; real Claude API integration
 * replaces the internals of `runAgent`).
 *
 * Plugin Integration:
 * - AgentRunner 集成了 PluginManager 用于管理插件扩展
 * - 插件可以增强 Agent 的能力，如预处理、后处理、自定义工具等
 * - 插件执行在沙箱隔离环境中，确保安全性
 */
export class AgentRunner {
  /** 标记资源是否已释放 */
  private _disposed = false;

  /** In-memory cache of agent states keyed by agent name. */
  private states: Map<string, AgentState> = new Map();

  /** LLM 客户端（可选，由 Orchestrator 注入） */
  private llmClient: LLMClient | null;

  /**
   * 上下文分片管理器（可选，Phase 3: 上下文分片优化）
   * 用于智能加载和管理 Agent 执行所需的上下文，优化 Token 使用 20-30%
   */
  private contextShardManager: ContextShardManager | null;

  /**
   * Plugin Manager（插件管理器）
   * 负责管理插件的生命周期、权限和沙箱隔离
   */
  private pluginManager: PluginManager;

  /**
   * 日志记录器
   */
  private logger: Logger;

  /**
   * 消息总线（用于插件事件分发）
   */
  private messageBus: MessageBus;

  /**
   * Skills Manager（Workflow Skills 集成管理器）
   * 负责 Skill 注册、查询、执行和缓存
   */
  private skillsManager: SkillsManager;

  constructor() {
    this.llmClient = null;
    this.contextShardManager = null;
    this.logger = createLogger({ level: 'info' });
    this.messageBus = new MessageBus();

    // 初始化 PluginManager
    const pluginContext: PluginContext = {
      orchestrator: null,
      logger: this.logger,
      config: {
        db_path: ':memory:',
        agents_root: './agents',
        domains_root: './domains',
        output_dir: './output',
        log_level: 'info',
        default_token_budget: 300000,
        max_concurrent_agents: 6,
        auto_checkpoint: true,
        risk_thresholds: {
          file_count: { low: 10, medium: 50, high: 200 },
          security_keywords_enabled: true,
          custom_rules: [],
        },
      },
      messageBus: this.messageBus,
    };

    this.pluginManager = createPluginManager(pluginContext);

    // 初始化 SkillsManager
    this.skillsManager = createSkillsManager({
      cache_enabled: true,
      cache_max_size: 100,
      cache_ttl_ms: 300000,
      default_timeout_ms: 30000,
    });
    this.skillsManager.setMessageBus(this.messageBus);
  }

  /**
   * 设置 LLM 客户端（用于启用真实 API 调用）
   */
  setLLMClient(client: LLMClient | null): void {
    this.llmClient = client;
  }

  /**
   * 设置上下文分片管理器（Phase 3: 上下文分片集成）
   *
   * @param shardManager - ContextShardManager 实例
   */
  setContextShardManager(shardManager: ContextShardManager | null): void {
    this.contextShardManager = shardManager;
  }

  /**
   * 获取当前使用的上下文分片管理器
   *
   * @returns ContextShardManager 实例或 null
   */
  getContextShardManager(): ContextShardManager | null {
    return this.contextShardManager;
  }

  // ----------------------------------------------------------
  // Plugin Integration
  // ----------------------------------------------------------

  /**
   * 获取 PluginManager 实例（只读访问）
   *
   * @returns PluginManager 实例
   */
  getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  /**
   * 加载插件
   *
   * 通过 manifest 加载插件到 PluginManager
   *
   * @param manifest - 插件清单
   * @returns 加载的插件 ID
   * @throws 如果插件无效或加载失败
   */
  async loadPlugin(manifest: PluginManifest): Promise<string> {
    // 验证 manifest
    if (!manifest.metadata?.plugin_id) {
      throw new Error('Invalid plugin manifest: missing plugin_id');
    }

    // 检查是否已加载
    if (this.pluginManager.hasPlugin(manifest.metadata.plugin_id)) {
      throw new Error(`Plugin already loaded: ${manifest.metadata.plugin_id}`);
    }

    // 这里我们假设插件已经通过某种方式加载
    // 在实际实现中，可能需要动态导入插件模块
    // 当前实现只注册元数据，实际的插件实例需要在外部创建

    this.logger.info('agent-runner', `Plugin manifest loaded: ${manifest.metadata.plugin_id}`);

    return manifest.metadata.plugin_id;
  }

  /**
   * 注册插件实例
   *
   * 直接注册一个已创建的插件实例到 PluginManager
   *
   * @param plugin - 插件实例
   * @returns 注册的插件 ID
   * @throws 如果插件已存在或无效
   */
  registerPlugin(plugin: HoneycombPlugin): string {
    this.pluginManager.registerPlugin(plugin);
    this.logger.info('agent-runner', `Plugin registered: ${plugin.metadata.plugin_id}`);
    return plugin.metadata.plugin_id;
  }

  /**
   * 激活插件
   *
   * 初始化并启动指定插件
   *
   * @param pluginId - 插件 ID
   * @throws 如果插件不存在或激活失败
   */
  async activatePlugin(pluginId: string): Promise<void> {
    // 检查插件是否存在
    if (!this.pluginManager.hasPlugin(pluginId)) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    // 获取当前状态
    const status = this.pluginManager.getStatus(pluginId);

    // 如果已经是 active 状态，直接返回
    if (status === 'active') {
      this.logger.debug('agent-runner', `Plugin already active: ${pluginId}`);
      return;
    }

    // 如果是 registered 状态，先初始化
    if (status === 'registered') {
      await this.pluginManager.initializePlugin(pluginId);
    }

    // 启动插件
    if (this.pluginManager.getStatus(pluginId) === 'loaded') {
      await this.pluginManager.startPlugin(pluginId);
    }

    this.logger.info('agent-runner', `Plugin activated: ${pluginId}`);
  }

  /**
   * 停用插件
   *
   * 停止指定插件（但不卸载）
   *
   * @param pluginId - 插件 ID
   * @throws 如果插件不存在或停用失败
   */
  async deactivatePlugin(pluginId: string): Promise<void> {
    if (!this.pluginManager.hasPlugin(pluginId)) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    await this.pluginManager.stopPlugin(pluginId);

    this.logger.info('agent-runner', `Plugin deactivated: ${pluginId}`);
  }

  /**
   * 调用插件方法
   *
   * 在沙箱隔离环境中调用插件的指定方法
   *
   * @param pluginId - 插件 ID
   * @param method - 方法名
   * @param args - 参数数组
   * @returns 方法返回值
   * @throws 如果插件未激活或方法调用失败
   */
  async callPlugin(pluginId: string, method: string, args: unknown): Promise<unknown> {
    // 检查插件是否存在
    if (!this.pluginManager.hasPlugin(pluginId)) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    // 检查插件是否激活
    const status = this.pluginManager.getStatus(pluginId);
    if (status !== 'active') {
      throw new Error(
        `Plugin not active: ${pluginId} (current status: ${status})`,
      );
    }

    // 调用插件方法
    const result = await this.pluginManager.callPlugin(pluginId, method, args);

    this.logger.debug('agent-runner', `Plugin method called: ${pluginId}.${method}`);

    return result;
  }

  /**
   * 卸载插件
   *
   * 停止并卸载指定插件
   *
   * @param pluginId - 插件 ID
   * @throws 如果插件不存在或被其他插件依赖
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    await this.pluginManager.unloadPlugin(pluginId);

    this.logger.info('agent-runner', `Plugin unloaded: ${pluginId}`);
  }

  /**
   * 列出所有已加载的插件
   *
   * @returns 插件元数据数组
   */
  listPlugins(): PluginMetadata[] {
    return this.pluginManager.listPlugins();
  }

  /**
   * 检查插件是否存在
   *
   * @param pluginId - 插件 ID
   * @returns 是否存在
   */
  hasPlugin(pluginId: string): boolean {
    return this.pluginManager.hasPlugin(pluginId);
  }

  /**
   * 获取插件状态
   *
   * @param pluginId - 插件 ID
   * @returns 插件状态或 undefined
   */
  getPluginStatus(pluginId: string): string | undefined {
    return this.pluginManager.getStatus(pluginId);
  }

  // ----------------------------------------------------------
  // Workflow Skills 集成
  // ----------------------------------------------------------

  /**
   * 注册 Skill
   *
   * @param config - Skill 配置
   * @returns Skill ID
   */
  async registerSkill(config: SkillConfig): Promise<string> {
    return this.skillsManager.registerSkill(config);
  }

  /**
   * 注销 Skill
   *
   * @param skillId - Skill ID
   * @param version - 版本（可选）
   */
  async unregisterSkill(skillId: string, version?: string): Promise<void> {
    return this.skillsManager.unregisterSkill(skillId, version);
  }

  /**
   * 获取 Skill 配置
   *
   * @param skillId - Skill ID
   * @returns Skill 配置或 undefined
   */
  async getSkill(skillId: string): Promise<SkillConfig | undefined> {
    return this.skillsManager.getSkill(skillId);
  }

  /**
   * 检查 Skill 是否存在
   *
   * @param skillId - Skill ID
   * @returns 是否存在
   */
  async hasSkill(skillId: string): Promise<boolean> {
    return this.skillsManager.hasSkill(skillId);
  }

  /**
   * 查询 Skills
   *
   * @param filters - 过滤条件
   * @returns Skills 列表
   */
  async querySkills(filters?: SkillListFilter): Promise<SkillConfig[]> {
    return this.skillsManager.querySkills(filters);
  }

  /**
   * 搜索 Skills
   *
   * @param query - 搜索关键词
   * @param filters - 过滤条件
   * @returns Skills 列表
   */
  async searchSkills(query: string, filters?: SkillListFilter): Promise<SkillConfig[]> {
    return this.skillsManager.searchSkills(query, filters);
  }

  /**
   * 执行 Skill
   *
   * @param request - 执行请求
   * @returns 执行结果
   */
  async executeSkill(request: SkillExecutionRequest): Promise<SkillExecutionResult> {
    return this.skillsManager.executeSkill(request);
  }

  /**
   * 批量执行 Skills
   *
   * @param requests - 执行请求列表
   * @returns 执行结果列表
   */
  async executeSkillBatch(requests: SkillExecutionRequest[]): Promise<SkillExecutionResult[]> {
    return this.skillsManager.executeSkillBatch(requests);
  }

  /**
   * 清除 Skill 缓存
   */
  clearSkillCache(): void {
    this.skillsManager.clearCache();
  }

  /**
   * 获取 Skill 执行统计
   *
   * @returns 执行统计
   */
  getSkillExecutionStats(): SkillExecutionStats {
    return this.skillsManager.getExecutionStats();
  }

  /**
   * 重置 Skill 执行统计
   */
  resetSkillStats(): void {
    this.skillsManager.resetStats();
  }

  /**
   * 设置 SkillRegistry
   *
   * @param registry - SkillRegistry 实例
   */
  async setSkillRegistry(registry: SkillRegistry): Promise<void> {
    return this.skillsManager.setRegistry(registry);
  }

  /**
   * 设置 SkillExecutor
   *
   * @param executor - SkillExecutor 实例
   */
  setSkillExecutor(executor: SkillExecutor): void {
    this.skillsManager.setExecutor(executor);
  }

  /**
   * 获取 SkillsManager
   *
   * @returns SkillsManager 实例
   */
  getSkillsManager(): SkillsManager {
    return this.skillsManager;
  }

  /**
   * 设置 MessageBus（用于 Skill 执行事件追踪）
   *
   * @param messageBus - MessageBus 实例
   */
  setMessageBus(messageBus: MessageBus): void {
    this.messageBus = messageBus;
    this.skillsManager.setMessageBus(messageBus);
    // 注意: PluginManager 可能没有 setMessageBus 方法，根据实际API调整
    // this.pluginManager.setMessageBus(messageBus);
  }

  /**
   * 生成 Trace ID（用于分布式追踪）
   *
   * @returns Trace ID
   */
  generateTraceId(): string {
    return this.messageBus.generateTraceId();
  }

  // ----------------------------------------------------------
  // Resource Disposal
  // ----------------------------------------------------------

  /**
   * 释放所有内部资源
   *
   * 清理内容：
   * - 清空 Agent 状态缓存 (states Map)
   * - 清空消息总线历史和订阅 (messageBus.clear())
   * - 停止并清理所有插件 (pluginManager)
   * - 释放 SkillsManager 资源 (skillsManager.dispose())
   * - 清除所有对象引用，允许垃圾回收
   *
   * 调用后，AgentRunner 处于未初始化状态。
   * 如需继续使用，需要重新初始化。
   *
   * @example
   * ```ts
   * const runner = new AgentRunner();
   * // ... 使用 runner ...
   * runner.dispose(); // 清理资源
   * ```
   */
  dispose(): void {
    // 防止重复释放
    if (this._disposed) {
      return;
    }

    // 1. 清空 Agent 状态缓存
    this.states.clear();

    // 2. 清空消息总线（清除历史、订阅和待处理请求）
    this.messageBus.clear();

    // 3. 停止并清理所有已加载的插件
    // PluginManager 没有 dispose 方法，需要手动清理
    // 获取所有已注册的插件并停止它们
    const plugins = this.pluginManager.listPlugins();
    for (const plugin of plugins) {
      try {
        const status = this.pluginManager.getStatus(plugin.plugin_id);
        if (status === 'active' || status === 'loaded') {
          // 尝试优雅停止插件
          void this.pluginManager.stopPlugin(plugin.plugin_id);
        }
      } catch (error) {
        // 忽略清理过程中的错误，继续清理其他资源
        this.logger.warn('agent-runner', `Failed to stop plugin during dispose: ${plugin.plugin_id}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 4. 释放 SkillsManager 资源
    this.skillsManager.dispose();

    // 5. 清除对象引用（允许垃圾回收）
    this.llmClient = null;
    this.contextShardManager = null;
    // 注意：不清除 logger，因为可能在清理日志时仍需要使用
    // 注意：pluginManager 和 skillsManager 的引用保留，
    //       但它们内部资源已被清理

    // 6. 标记为已释放
    this._disposed = true;

    // 不记录日志 - dispose()是高频操作，测试环境会产生大量调用
    // 如需调试，可临时取消注释下面这行
    // this.logger.debug('agent-runner', 'AgentRunner disposed');
  }

  /**
   * 检查资源是否已释放
   *
   * @returns 是否已释放资源
   */
  isDisposed(): boolean {
    return this._disposed;
  }

  // ----------------------------------------------------------
  // Parsing
  // ----------------------------------------------------------

  /**
   * Parse an Agent Markdown file into an `AgentDefinition`.
   *
   * @param mdPath - Absolute path to the `.md` file.
   * @returns Fully populated `AgentDefinition`.
   */
  parseAgentDefinition(mdPath: string): AgentDefinition {
    const raw = fs.readFileSync(mdPath, 'utf-8');
    const { frontmatter } = parseFrontmatter(raw);

    const layer = inferLayer(mdPath);
    const agentType = inferAgentType(mdPath);

    const definition: AgentDefinition = {
      name: frontmatter.name,
      type: agentType,
      layer,
      description: frontmatter.description,
      prompt_path: mdPath,
      tools: frontmatter.tools,
      capabilities: frontmatter.tools, // capabilities mirrors tools by default
      argument_hint: frontmatter.argument_hint,
      embedded_governance: { ...DEFAULT_GOVERNANCE },
      context_shards: [], // 初始化为空数组，Phase 3: 上下文分片
    };

    // Governance agents get stricter defaults
    if (layer === 'governance') {
      definition.embedded_governance.first_principles_check = true;
      definition.embedded_governance.quality_gate_enabled = true;
    }

    return definition;
  }

  // ----------------------------------------------------------
  // Execution (simulation stub)
  // ----------------------------------------------------------

  /**
   * Execute an agent with the given task and optional context.
   *
   * 支持两种执行模式：
   * - **模拟模式**（默认）：生成模拟输出，用于测试和开发
   * - **真实 LLM API**：当设置了 llmClient 时，调用真实的 LLM API
   *
   * Retry logic: up to `MAX_RETRIES` attempts with exponential backoff
   * (1 s, 2 s, 4 s).
   *
   * @param definition - The parsed agent definition.
   * @param task       - The task description to execute.
   * @param context    - Optional additional context string.
   * @returns The final `AgentState` after execution completes or fails.
   */
  async runAgent(
    definition: AgentDefinition,
    task: string,
    context?: string,
  ): Promise<AgentState> {
    const state: AgentState = {
      agent_name: definition.name,
      status: AgentStatus.RUNNING,
      current_task: task,
      started_at: Date.now(),
      retry_count: 0,
      token_usage: 0,
    };

    this.states.set(definition.name, state);

    const maxRetries = definition.embedded_governance.max_retries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          state.status = AgentStatus.RETRYING;
          state.retry_count = attempt;
          await backoffDelay(attempt - 1); // 1s, 2s, 4s
        }

        // --- 模拟 / 真实 API 边界 ---
        if (this.llmClient) {
          // 真实 LLM API 调用
          const prompt = this.buildPrompt(definition, task, context);
          const systemPrompt = this.loadSystemPrompt(definition);

          const options: CompletionOptions = {
            model: undefined, // 使用 Provider 默认模型
            maxTokens: definition.embedded_governance.token_budget,
            tools: this.convertTools(definition.tools),
            systemPrompt,
            // 使用 phase 作为 metadata（用于追踪）
            metadata: {
              phase: definition.layer,
            },
          };

          const llmResult: CompletionResult = await this.llmClient.complete(prompt, options);

          state.output = llmResult.content;
          state.token_usage = llmResult.totalTokens;
        } else {
          // 模拟执行（保持现有行为）
          const simulatedOutput = this.simulateExecution(definition, task, context);
          state.output = simulatedOutput.output;
          state.token_usage = simulatedOutput.tokens;
        }
        // --- End boundary ---

        state.status = AgentStatus.COMPLETED;
        state.completed_at = Date.now();
        state.last_error = undefined;
        this.states.set(definition.name, state);
        return state;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        state.last_error = errorMessage;

        if (attempt >= maxRetries) {
          state.status = AgentStatus.FAILED;
          state.completed_at = Date.now();
          this.states.set(definition.name, state);
          return state;
        }
      }
    }

    // Should not reach here, but be defensive
    state.status = AgentStatus.FAILED;
    state.completed_at = Date.now();
    this.states.set(definition.name, state);
    return state;
  }

  // ----------------------------------------------------------
  // LLM Integration Helpers
  // ----------------------------------------------------------

  /**
   * 构建 Agent 完整 prompt（从 prompt_path + task + context）
   *
   * Phase 3 增强：支持上下文分片智能加载
   * - 如果配置了 context_shards，从 ContextShardManager 加载分片
   * - 自动包含全局摘要分片
   * - 按优先级排序分片（global-summary > task > module）
   * - 优化 Token 使用 20-30%
   */
  private buildPrompt(definition: AgentDefinition, task: string, context?: string): string {
    const promptContent = fs.readFileSync(definition.prompt_path, 'utf-8');

    // 提取 prompt body（跳过 frontmatter）
    const frontmatterEnd = promptContent.indexOf('---', 4);
    const prompt = frontmatterEnd > 0
      ? promptContent.substring(frontmatterEnd + 4).trim()
      : promptContent;

    let fullPrompt = prompt;

    // Phase 3: 上下文分片集成
    let shardContext: string | null = null;
    if (definition.context_shards && definition.context_shards.length > 0 && this.contextShardManager) {
      const assembleResult = this.contextShardManager.assembleContext(definition.context_shards);

      if (assembleResult.shards.length > 0) {
        // 构建分片上下文，按优先级排序后的顺序
        const contextSections: string[] = [];

        for (const shard of assembleResult.shards) {
          const sectionName = shard.scope === 'global-summary'
            ? 'Global Summary'
            : shard.scope === 'module'
              ? `Module: ${shard.module_name || 'Unknown'}`
              : `Task Context`;

          contextSections.push(`### ${sectionName}\n${shard.content}`);
        }

        shardContext = contextSections.join('\n\n');

        // 添加 Token 使用信息到日志（在实际执行中会记录）
        if (!assembleResult.withinLimit) {
          // 超出限制时，考虑压缩或警告
          // 这里我们依赖 ContextShardManager 的 60% 限制
        }
      }
    }

    // 添加分片上下文（如果有）
    if (shardContext) {
      fullPrompt += `\n\n## Context (Sharded)\n${shardContext}`;
    } else if (context) {
      // 回退到传统上下文
      fullPrompt += `\n\n## Context\n${context}`;
    }

    if (task) {
      fullPrompt += `\n\n## Task\n${task}`;
    }

    return fullPrompt;
  }

  /**
   * 从 Agent 定义文件提取 system prompt
   */
  private loadSystemPrompt(definition: AgentDefinition): string {
    const content = fs.readFileSync(definition.prompt_path, 'utf-8');

    // 提取 description 作为 system prompt
    const frontmatterMatch = content.match(/---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const descMatch = frontmatter.match(/description:\s*(.+)$/m);
      if (descMatch) {
        return descMatch[1];
      }
    }

    return `You are ${definition.name}, a ${definition.layer} ${definition.type} agent.`;
  }

  /**
   * 转换工具列表为 LLM 工具格式
   * 注意：当前版本仅传递工具名称，完整的工具定义需要从域配置加载
   */
  private convertTools(tools: string[]): any[] {
    // 简化实现：仅返回工具名称列表
    // 完整实现需要从域配置加载完整的工具定义（包括 inputSchema）
    return tools.map(name => ({
      name,
      description: `Tool: ${name}`,
    }));
  }

  // ----------------------------------------------------------
  // State Access
  // ----------------------------------------------------------

  /**
   * Retrieve the current runtime state of an agent by name.
   * Returns `undefined` if the agent has never been run.
   */
  getAgentState(agentName: string): AgentState | undefined {
    return this.states.get(agentName);
  }

  // ----------------------------------------------------------
  // Simulation (to be replaced by Claude API)
  // ----------------------------------------------------------

  /**
   * Simulated execution that produces deterministic output for testing.
   * Replace this method body with the real Claude API call.
   */
  private simulateExecution(
    definition: AgentDefinition,
    task: string,
    context?: string,
  ): { output: string; tokens: number } {
    const contextNote = context ? ` | context_length=${context.length}` : '';
    const output = [
      `[Simulated] Agent "${definition.name}" (${definition.layer}) executed.`,
      `Task: ${task}`,
      `Tools available: ${definition.tools.join(', ')}`,
      contextNote ? `Context provided: yes (${context!.length} chars)` : 'Context provided: no',
      `Status: completed (simulation)`,
    ].join('\n');

    // Simulate token usage proportional to task length
    const estimatedTokens = Math.ceil((task.length + (context?.length ?? 0)) / 4) + 50;

    return { output, tokens: estimatedTokens };
  }
}

// ============================================================
// AgentPool
// ============================================================

/**
 * AgentPool manages the full set of agent definitions loaded from the
 * agents directory. It supports querying by layer and complexity level,
 * which the orchestrator uses to decide which agents to activate for a
 * given project.
 */
export class AgentPool {
  private readonly agentsRoot: string;
  private agents: Map<string, AgentDefinition> = new Map();
  private readonly runner: AgentRunner;

  /**
   * @param agentsRoot - Absolute path to the agents directory
   *                     (e.g. `/path/to/honeycomb/agents`).
   */
  constructor(agentsRoot: string) {
    this.agentsRoot = agentsRoot;
    this.runner = new AgentRunner();
    this.loadAgents();
  }

  // ----------------------------------------------------------
  // Context Shard Manager (Phase 3 Integration)
  // ----------------------------------------------------------

  /**
   * 设置上下文分片管理器（Phase 3: 上下文分片集成）
   * 传递给内部的 AgentRunner
   *
   * @param shardManager - ContextShardManager 实例
   */
  setContextShardManager(shardManager: import('./context-shard-manager.js').ContextShardManager | null): void {
    this.runner.setContextShardManager(shardManager);
  }

  /**
   * 获取当前使用的上下文分片管理器
   *
   * @returns ContextShardManager 实例或 null
   */
  getContextShardManager(): import('./context-shard-manager.js').ContextShardManager | null {
    return this.runner.getContextShardManager();
  }

  // ----------------------------------------------------------
  // Loading
  // ----------------------------------------------------------

  /** Scan the agents directory and load all definitions into memory. */
  private loadAgents(): void {
    const definitions = this.scanAgents();
    this.agents.clear();
    for (const def of definitions) {
      this.agents.set(def.name, def);
    }
  }

  /**
   * Scan the agents root directory recursively and parse every `.md` file
   * that contains valid frontmatter into an `AgentDefinition`.
   *
   * Files that fail to parse (e.g. the top-level `honeycomb.md` which may
   * not have agent frontmatter) are silently skipped.
   */
  scanAgents(): AgentDefinition[] {
    const mdFiles = findMarkdownFiles(this.agentsRoot);
    const definitions: AgentDefinition[] = [];

    for (const filePath of mdFiles) {
      try {
        const definition = this.runner.parseAgentDefinition(filePath);
        definitions.push(definition);
      } catch {
        // Skip files that don't conform to agent Markdown format
        // (e.g. honeycomb.md at the root level)
      }
    }

    return definitions;
  }

  // ----------------------------------------------------------
  // Registration
  // ----------------------------------------------------------

  /**
   * Register an agent definition dynamically (e.g., from domain loader).
   * If an agent with the same name already exists, it will be overwritten.
   */
  register(definition: AgentDefinition): void {
    this.agents.set(definition.name, definition);
  }

  // ----------------------------------------------------------
  // Querying
  // ----------------------------------------------------------

  /** Get a single agent definition by name. */
  getAgent(name: string): AgentDefinition | undefined {
    return this.agents.get(name);
  }

  /** Get all agents belonging to a specific architectural layer. */
  getAgentsByLayer(layer: AgentLayer): AgentDefinition[] {
    return Array.from(this.agents.values()).filter((a) => a.layer === layer);
  }

  /**
   * Return the set of agents that should be activated for a given
   * complexity level. This drives the orchestrator's scaling behavior:
   *
   *   - **simple**:     L3 (execution) + L4 (feedback, simplified)
   *   - **standard**:   L2 (decision) + L3 + L4
   *   - **advanced**:   L1 + L2 + L3 + L4 + governance
   *   - **enterprise**: All agents including domain-specific
   *
   * @param complexity - The assessed complexity level of the project.
   */
  getActiveAgents(complexity: ComplexityLevel): AgentDefinition[] {
    const all = Array.from(this.agents.values());

    switch (complexity) {
      case 'simple':
        // Only execution + simplified feedback
        return all.filter((a) => a.layer === 'L3' || a.layer === 'L4');

      case 'standard':
        // Decision + execution + feedback
        return all.filter(
          (a) => a.layer === 'L2' || a.layer === 'L3' || a.layer === 'L4',
        );

      case 'advanced':
        // Full four-layer + governance
        return all;

      case 'enterprise':
        // Everything (including domain agents when they exist)
        return all;

      default:
        return all;
    }
  }

  /** List all loaded agent definitions. */
  listAll(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  // ----------------------------------------------------------
  // Convenience: expose the runner
  // ----------------------------------------------------------

  /** Access the underlying AgentRunner for direct execution. */
  getRunner(): AgentRunner {
    return this.runner;
  }

  /**
   * 设置 LLM 客户端（传递给所有 Agent runners）
   * 由 Orchestrator 在项目启动时调用
   */
  setLLMClient(client: LLMClient | null): void {
    this.runner.setLLMClient(client);
  }

  // ----------------------------------------------------------
  // Parallel Execution
  // ----------------------------------------------------------

  /**
   * 并行执行多个任务
   *
   * 这是 AgentPool 的并行执行入口，支持：
   * - 多级优先级调度
   * - 依赖感知执行
   * - 自动重试
   * - 结果聚合
   *
   * @param tasks - 要执行的任务列表
   * @param config - 并行执行配置
   * @returns 聚合执行结果
   *
   * @example
   * ```ts
   * const tasks: ScheduledTask[] = [
   *   {
   *     taskId: 'task-1',
   *     agentDefinition: pool.getAgent('researcher')!,
   *     taskData: { query: '...' },
   *     priority: TaskPriority.HIGH,
   *     dependencies: [],
   *     estimatedDuration: 1000,
   *     resourceRequirements: { cpu: 1, memory: 100, tokens: 1000 },
   *     retryCount: 0,
   *     status: TaskStatus.PENDING,
   *     createdAt: Date.now(),
   *   },
   * ];
   *
   * const result = await pool.parallelRun(tasks, {
   *   maxConcurrentAgents: 5,
   *   aggregationConfig: { mode: AggregationMode.WAIT_ALL },
   * });
   * ```
   */
  async parallelRun(
    tasks: ScheduledTask[],
    config: Partial<ParallelExecutionConfig> = {},
  ): Promise<AggregatedResult> {
    // 动态导入并行执行模块以避免循环依赖
    const { parallelRun: parallelRunImpl } = await import('./agent-pool-parallel.js');

    // 定义执行函数：使用 AgentRunner 执行单个任务
    const executeFn = async (task: ScheduledTask): Promise<PartialResult> => {
      const startTime = Date.now();

      try {
        // 检查 Agent 是否存在
        let agentDef = this.agents.get(task.agentDefinition.name);
        if (!agentDef) {
          // 尝试使用任务中的定义
          agentDef = task.agentDefinition;
        }

        if (!agentDef) {
          throw new Error(`Agent not found: ${task.agentDefinition.name}`);
        }

        // 执行 Agent
        const agentState = await this.runner.runAgent(
          agentDef,
          JSON.stringify(task.taskData),
        );

        // 构建部分结果
        return {
          taskId: task.taskId,
          agentName: agentDef.name,
          status: agentState.status,
          data: agentState.output,
          timestamp: Date.now(),
          metadata: {
            tokenUsage: agentState.token_usage,
            duration: Date.now() - startTime,
            retryCount: agentState.retry_count,
          },
        };
      } catch (error) {
        // 返回失败结果
        return {
          taskId: task.taskId,
          agentName: task.agentDefinition.name,
          status: AgentStatus.FAILED,
          data: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
          metadata: {
            duration: Date.now() - startTime,
            error,
          },
        };
      }
    };

    // 调用并行执行实现
    return parallelRunImpl(tasks, config, executeFn);
  }
}
