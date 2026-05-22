/**
 * AgentRunner Skills 集成
 *
 * 为 AgentRunner 添加 Workflow Skills 系统的集成支持：
 * - Skill 注册和查询
 * - Skill 执行
 * - Skill 结果缓存
 * - Trace ID 追踪
 * - Agent 与 Skill 的互操作
 *
 * @module agent-runner-skills
 */

import * as crypto from 'node:crypto';

// 导入 Workflow Skills 类型
import type {
  SkillConfig,
  SkillExecutionRequest,
  SkillExecutionResult,
  SkillListFilter,
} from './workflow-skills-types.js';

// 延迟加载 Skills 类（避免循环依赖）
let SkillRegistryClass: any = null;
let SkillExecutorClass: any = null;
let createSkillRegistryFn: any = null;
let createSkillExecutorFn: any = null;

async function loadSkillClasses() {
  if (SkillRegistryClass && SkillExecutorClass) {
    return {
      SkillRegistry: SkillRegistryClass,
      SkillExecutor: SkillExecutorClass,
      createSkillRegistry: createSkillRegistryFn,
      createSkillExecutor: createSkillExecutorFn,
    };
  }
  const module = await import('./workflow-skills.js');
  SkillRegistryClass = module.SkillRegistry;
  SkillExecutorClass = module.SkillExecutor;
  createSkillRegistryFn = module.createSkillRegistry;
  createSkillExecutorFn = module.createSkillExecutor;
  return {
    SkillRegistry: SkillRegistryClass,
    SkillExecutor: SkillExecutorClass,
    createSkillRegistry: createSkillRegistryFn,
    createSkillExecutor: createSkillExecutorFn,
  };
}

// ============================================================
// 类型定义
// ============================================================

/** Skill 执行统计 */
export interface SkillExecutionStats {
  /** 总执行次数 */
  total_executions: number;
  /** 成功次数 */
  successful: number;
  /** 失败次数 */
  failed: number;
  /** 平均执行时间（毫秒） */
  avg_duration_ms: number;
  /** 按 Skill ID 的统计 */
  by_skill: Record<string, number>;
}

/** Skill 缓存条目 */
interface SkillCacheEntry {
  result: SkillExecutionResult;
  timestamp: number;
  hash: string;
}

/** Skills 集成配置 */
export interface SkillsIntegrationConfig {
  /** 是否启用缓存 */
  cache_enabled?: boolean;
  /** 缓存最大条目数 */
  cache_max_size?: number;
  /** 缓存 TTL（毫秒） */
  cache_ttl_ms?: number;
  /** 默认执行超时（毫秒） */
  default_timeout_ms?: number;
}

// ============================================================
// SkillsManager 类
// ============================================================

/**
 * SkillsManager - AgentRunner 的 Skills 集成管理器
 *
 * 职责：
 * - 管理 SkillRegistry 和 SkillExecutor
 * - 提供 Skill 注册、查询、执行接口
 * - 实现 Skill 结果缓存
 * - 跟踪执行统计
 * - 集成 Trace ID 追踪
 */
export class SkillsManager {
  /** Skill 注册表 */
  private registry: any = null;

  /** Skill 执行器 */
  private executor: any = null;

  /** Skill 结果缓存 */
  private cache: Map<string, SkillCacheEntry> = new Map();

  /** 执行统计 */
  private stats: SkillExecutionStats = {
    total_executions: 0,
    successful: 0,
    failed: 0,
    avg_duration_ms: 0,
    by_skill: {},
  };

  /** 配置 */
  private config: Required<SkillsIntegrationConfig>;

  /** 当前 Trace ID（用于追踪） */
  private currentTraceId: string | null = null;

  /** MessageBus（用于发送 Skill 执行事件） */
  private messageBus: any = null;

  constructor(config: SkillsIntegrationConfig = {}) {
    this.config = {
      cache_enabled: config.cache_enabled ?? true,
      cache_max_size: config.cache_max_size ?? 100,
      cache_ttl_ms: config.cache_ttl_ms ?? 300000, // 5 分钟
      default_timeout_ms: config.default_timeout_ms ?? 30000,
    };

    // 延迟初始化
    this.initialize();
  }

  /**
   * 初始化 Skills 组件
   */
  private async initialize(): Promise<void> {
    const { SkillRegistry, SkillExecutor, createSkillRegistry } = await loadSkillClasses();

    if (!this.registry) {
      // 使用 createSkillRegistry 工厂函数或直接实例化
      if (createSkillRegistry && typeof createSkillRegistry === 'function') {
        this.registry = createSkillRegistry({ storage_path: ':memory:', auto_load: true });
      } else {
        this.registry = new SkillRegistry({ storage_path: ':memory:', auto_load: true });
      }
    }

    if (!this.executor) {
      this.executor = new SkillExecutor(this.registry);
    }
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.registry || !this.executor) {
      await this.initialize();
    }
  }

  // ----------------------------------------------------------
  // Skill 注册和查询
  // ----------------------------------------------------------

  /**
   * 注册 Skill
   *
   * @param config - Skill 配置
   * @returns Skill ID
   */
  async registerSkill(config: SkillConfig): Promise<string> {
    await this.ensureInitialized();
    return this.registry.register(config);
  }

  /**
   * 注销 Skill
   *
   * @param skillId - Skill ID
   * @param version - 版本（可选）
   */
  async unregisterSkill(skillId: string, version?: string): Promise<void> {
    await this.ensureInitialized();
    this.registry.unregister(skillId, version);
    // 清除相关缓存
    this.clearCacheForSkill(skillId);
  }

  /**
   * 获取 Skill 配置
   *
   * @param skillId - Skill ID
   * @returns Skill 配置或 undefined
   */
  async getSkill(skillId: string): Promise<SkillConfig | undefined> {
    await this.ensureInitialized();
    return this.registry.get(skillId) ?? undefined;
  }

  /**
   * 检查 Skill 是否存在
   *
   * @param skillId - Skill ID
   * @returns 是否存在
   */
  async hasSkill(skillId: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.registry.has(skillId);
  }

  /**
   * 查询 Skills
   *
   * @param filters - 过滤条件
   * @returns Skills 列表
   */
  async querySkills(filters?: SkillListFilter): Promise<SkillConfig[]> {
    await this.ensureInitialized();
    return this.registry.list(filters);
  }

  /**
   * 搜索 Skills
   *
   * @param query - 搜索关键词
   * @param filters - 过滤条件
   * @returns Skills 列表
   */
  async searchSkills(query: string, filters?: SkillListFilter): Promise<SkillConfig[]> {
    await this.ensureInitialized();
    return this.registry.search(query, filters);
  }

  // ----------------------------------------------------------
  // Skill 执行
  // ----------------------------------------------------------

  /**
   * 执行 Skill
   *
   * @param request - 执行请求
   * @returns 执行结果
   */
  async executeSkill(request: SkillExecutionRequest): Promise<SkillExecutionResult> {
    await this.ensureInitialized();

    // 生成缓存键
    const cacheKey = this.generateCacheKey(request);

    // 检查缓存
    if (this.config.cache_enabled) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // 更新统计
    this.stats.total_executions++;

    const startTime = Date.now();

    try {
      // 设置 Trace ID
      if (!this.currentTraceId) {
        this.currentTraceId = this.generateTraceId();
      }

      // 执行 Skill
      const result = await this.executor.execute(request);

      // 更新统计
      const duration = Date.now() - startTime;
      if (result.status === 'completed') {
        this.stats.successful++;
      } else {
        this.stats.failed++;
      }

      // 更新平均执行时间
      this.updateAvgDuration(duration);

      // 更新按 Skill 统计
      const skillId = request.skill_id;
      this.stats.by_skill[skillId] = (this.stats.by_skill[skillId] || 0) + 1;

      // 缓存结果
      if (this.config.cache_enabled && result.status === 'completed') {
        this.setToCache(cacheKey, result);
      }

      // 发送事件到 MessageBus
      if (this.messageBus) {
        this.messageBus.send({
          id: crypto.randomUUID(),
          from: 'SkillsManager',
          to: '*',
          type: 'event' as const,
          priority: 1,
          payload: {
            event: 'skill:executed',
            skill_id: request.skill_id,
            status: result.status,
            duration_ms: duration,
          },
          context_shards: [],
          timestamp: Date.now(),
          trace_id: this.currentTraceId,
        });
      }

      return result;
    } catch (error) {
      this.stats.failed++;
      throw error;
    }
  }

  /**
   * 批量执行 Skills
   *
   * @param requests - 执行请求列表
   * @returns 执行结果列表
   */
  async executeSkillBatch(requests: SkillExecutionRequest[]): Promise<SkillExecutionResult[]> {
    await this.ensureInitialized();
    return this.executor.executeBatch(requests);
  }

  // ----------------------------------------------------------
  // 缓存管理
  // ----------------------------------------------------------

  /**
   * 生成缓存键
   */
  private generateCacheKey(request: SkillExecutionRequest): string {
    const key = `${request.skill_id}:${JSON.stringify(request.inputs)}`;
    // 简单哈希
    return crypto.createHash('md5').update(key).digest('hex');
  }

  /**
   * 从缓存获取
   */
  private getFromCache(key: string): SkillExecutionResult | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // 检查 TTL
    const age = Date.now() - entry.timestamp;
    if (age > this.config.cache_ttl_ms) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  /**
   * 设置缓存
   */
  private setToCache(key: string, result: SkillExecutionResult): void {
    // 检查缓存大小限制
    if (this.cache.size >= this.config.cache_max_size) {
      // 删除最旧的条目（简单的 FIFO）
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      hash: key,
    });
  }

  /**
   * 清除所有缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 清除指定 Skill 的缓存
   */
  clearCacheForSkill(skillId: string): void {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.result.skill_id === skillId) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 获取缓存大小
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  // ----------------------------------------------------------
  // 统计和监控
  // ----------------------------------------------------------

  /**
   * 获取执行统计
   */
  getExecutionStats(): SkillExecutionStats {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      total_executions: 0,
      successful: 0,
      failed: 0,
      avg_duration_ms: 0,
      by_skill: {},
    };
  }

  /**
   * 更新平均执行时间
   */
  private updateAvgDuration(duration: number): void {
    const total = this.stats.total_executions;
    const currentAvg = this.stats.avg_duration_ms;
    this.stats.avg_duration_ms = (currentAvg * (total - 1) + duration) / total;
  }

  // ----------------------------------------------------------
  // Trace ID 管理
  // ----------------------------------------------------------

  /**
   * 生成新的 Trace ID
   */
  generateTraceId(): string {
    this.currentTraceId = crypto.randomUUID();
    return this.currentTraceId;
  }

  /**
   * 获取当前 Trace ID
   */
  getCurrentTraceId(): string | null {
    return this.currentTraceId;
  }

  /**
   * 设置当前 Trace ID
   */
  setCurrentTraceId(traceId: string): void {
    this.currentTraceId = traceId;
  }

  /**
   * 清除当前 Trace ID
   */
  clearTraceId(): void {
    this.currentTraceId = null;
  }

  // ----------------------------------------------------------
  // MessageBus 集成
  // ----------------------------------------------------------

  /**
   * 设置 MessageBus
   */
  setMessageBus(messageBus: any): void {
    this.messageBus = messageBus;
  }

  /**
   * 获取 MessageBus
   */
  getMessageBus(): any {
    return this.messageBus;
  }

  // ----------------------------------------------------------
  // 直接访问底层组件
  // ----------------------------------------------------------

  /**
   * 获取 SkillRegistry
   */
  getRegistry(): any {
    return this.registry;
  }

  /**
   * 设置 SkillRegistry
   */
  async setRegistry(registry: any): Promise<void> {
    this.registry = registry;
    // 重新创建执行器
    const { SkillExecutor } = await loadSkillClasses();
    this.executor = new SkillExecutor(this.registry);
  }

  /**
   * 获取 SkillExecutor
   */
  getExecutor(): any {
    return this.executor;
  }

  /**
   * 设置 SkillExecutor
   */
  setExecutor(executor: any): void {
    this.executor = executor;
  }

  // ----------------------------------------------------------
  // 资源清理
  // ----------------------------------------------------------

  /**
   * 释放所有内部资源
   *
   * 清理内容：
   * - 清空 Skill 结果缓存
   * - 释放 SkillRegistry 和 SkillExecutor 引用
   * - 重置执行统计
   * - 清除 Trace ID
   * - 清除 MessageBus 引用
   *
   * 调用后，SkillsManager 处于未初始化状态。
   * 如需继续使用，需要重新初始化。
   */
  dispose(): void {
    // 清空缓存
    this.cache.clear();

    // 释放底层组件引用
    this.registry = null;
    this.executor = null;

    // 重置统计
    this.stats = {
      total_executions: 0,
      successful: 0,
      failed: 0,
      avg_duration_ms: 0,
      by_skill: {},
    };

    // 清除 Trace ID
    this.currentTraceId = null;

    // 清除 MessageBus 引用
    this.messageBus = null;
  }

  /**
   * 检查是否已释放资源
   *
   * @returns 是否已释放
   */
  isDisposed(): boolean {
    return this.registry === null && this.executor === null;
  }
}

// ============================================================
// 导出工厂函数
// ============================================================

/**
 * 创建 SkillsManager 实例
 *
 * @param config - 配置选项
 * @returns SkillsManager 实例
 */
export function createSkillsManager(config?: SkillsIntegrationConfig): SkillsManager {
  return new SkillsManager(config);
}
