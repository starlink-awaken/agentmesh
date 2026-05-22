/**
 * Honeycomb Plugin Manager
 *
 * 插件系统核心管理器，负责：
 * - 插件注册与发现
 * - 插件生命周期管理（初始化、启动、停止、卸载）
 * - 依赖验证
 * - 权限控制
 * - 插件事件分发
 * - 沙箱隔离
 */

import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type {
  HoneycombPlugin,
  PluginContext,
  PluginMetadata,
  PluginStatus,
  PluginType,
  PluginPermission,
  PluginEventHandler,
  PluginEventData,
  PluginLoadOptions,
  PluginLoadResult,
  PluginStateInfo,
  SandboxPolicy,
  PluginSandboxContext,
  PermissionCheckResult,
  PluginManifest,
  PluginDiscoveryResult,
} from './plugin-types.js';
import type { Logger } from './logger.js';
import { createSandboxContext } from './plugin-sandbox.js';

// ============================================================
// Plugin Registry Entry
// ============================================================

interface RegistryEntry {
  metadata: PluginMetadata;
  instance?: HoneycombPlugin;
  status: PluginStatus;
  registeredAt: number;
  loadedAt?: number;
  startedAt?: number;
  lastError?: Error;
  dependencies?: RegistryEntry[];
}

// ============================================================
// Plugin Manager Class
// ============================================================

/**
 * Plugin Manager 核心类
 *
 * 管理插件的生命周期、依赖关系、权限和沙箱隔离。
 */
export class PluginManager {
  /** 插件注册表：plugin_id -> RegistryEntry */
  private registry = new Map<string, RegistryEntry>();

  /** 事件处理器：event_type -> handlers */
  private eventHandlers = new Map<string, Set<PluginEventHandler>>();

  /** 插件上下文 */
  private context: PluginContext;

  /** 日志记录器 */
  private logger: Logger;

  /** 沙箱策略（全局默认） */
  private defaultSandboxPolicy: SandboxPolicy;

  // ============================================================
  // Constructor
  // ============================================================

  constructor(context: PluginContext) {
    this.context = context;
    this.logger = context.logger;
    this.defaultSandboxPolicy = context.config.plugins?.sandbox_policy ?? {
      enabled: true,
      filesystem: {
        allow_read: [],
        allow_write: [],
        deny_paths: ['/etc', '/sys', '/proc', '/root'],
      },
      network: {
        allow_network: false,
        allow_domains: [],
        deny_domains: [],
      },
      execution: {
        allow_spawn: false,
        allow_commands: [],
      },
      resources: {
        max_memory_mb: 512,
        max_cpu_percent: 50,
      },
    };
  }

  // ============================================================
  // Plugin Registration
  // ============================================================

  /**
   * 注册插件实例
   * @param plugin 插件实例
   * @throws 如果插件已注册
   */
  registerPlugin(plugin: HoneycombPlugin): void {
    const { plugin_id, name } = plugin.metadata;

    if (this.registry.has(plugin_id)) {
      throw new Error(`Plugin already registered: ${plugin_id} (${name})`);
    }

    const entry: RegistryEntry = {
      metadata: plugin.metadata,
      instance: plugin,
      status: 'registered',
      registeredAt: Date.now(),
    };

    this.registry.set(plugin_id, entry);

    this.logger.info('plugin', `Plugin registered: ${name} (${plugin_id})`, {
      plugin_id,
      version: plugin.metadata.version,
      type: plugin.metadata.type,
    });

    // 触发注册事件
    this.emitEvent('plugin:registered', {
      pluginId: plugin_id,
      timestamp: Date.now(),
      data: { metadata: plugin.metadata },
    });
  }

  /**
   * 批量注册插件
   * @param plugins 插件实例数组
   * @returns 注册结果数组
   */
  registerPlugins(plugins: HoneycombPlugin[]): PluginLoadResult[] {
    const results: PluginLoadResult[] = [];

    for (const plugin of plugins) {
      try {
        this.registerPlugin(plugin);
        results.push({
          pluginId: plugin.metadata.plugin_id,
          success: true,
        });
      } catch (error) {
        results.push({
          pluginId: plugin.metadata.plugin_id,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  // ============================================================
  // Plugin Initialization
  // ============================================================

  /**
   * 初始化插件
   * @param pluginId 插件 ID
   * @throws 如果插件不存在或初始化失败
   */
  async initializePlugin(pluginId: string): Promise<void> {
    const entry = this.getEntry(pluginId);

    // 创建沙箱上下文
    const sandboxContext = this.createSandboxContext(entry.metadata);

    // 创建插件上下文
    const pluginConfig = (this.context.config.plugins as Record<string, unknown> | undefined)?.[pluginId] as
      | Record<string, unknown>
      | undefined;

    const pluginContext: PluginContext = {
      ...this.context,
      pluginConfig,
      sandbox: sandboxContext,
    };

    try {
      // 使用沙箱执行初始化
      await sandboxContext.executeSecurely(async () => {
        if (!entry.instance) {
          throw new Error(`Plugin instance not found: ${pluginId}`);
        }
        await entry.instance.initialize(pluginContext);
      });

      entry.status = 'loaded';
      entry.loadedAt = Date.now();

      this.logger.info('plugin', `Plugin initialized: ${pluginId}`);

      // 触发加载事件
      this.emitEvent('plugin:loaded', {
        pluginId,
        timestamp: Date.now(),
      });
    } catch (error) {
      entry.status = 'error';
      entry.lastError = error instanceof Error ? error : new Error(String(error));

      this.logger.error('plugin', `Plugin initialization failed: ${pluginId}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      // 触发错误事件
      this.emitEvent('plugin:error', {
        pluginId,
        timestamp: Date.now(),
        error: error instanceof Error ? error : new Error(String(error)),
      });

      throw error;
    }
  }

  /**
   * 批量初始化插件（按依赖顺序）
   * @param pluginIds 插件 ID 数组（可选，默认初始化所有已注册插件）
   * @returns 初始化结果数组
   */
  async initializePlugins(pluginIds?: string[]): Promise<PluginLoadResult[]> {
    const idsToInit = pluginIds ?? Array.from(this.registry.keys());

    // 按依赖顺序排序
    const sortedIds = this.topologicalSort(idsToInit);

    const results: PluginLoadResult[] = [];

    for (const pluginId of sortedIds) {
      try {
        await this.initializePlugin(pluginId);
        results.push({
          pluginId,
          success: true,
        });
      } catch (error) {
        results.push({
          pluginId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  // ============================================================
  // Plugin Lifecycle: Start/Stop
  // ============================================================

  /**
   * 启动插件
   * @param pluginId 插件 ID
   * @throws 如果插件未初始化或启动失败
   */
  async startPlugin(pluginId: string): Promise<void> {
    const entry = this.getEntry(pluginId);

    if (entry.status !== 'loaded') {
      throw new Error(
        `Plugin not ready to start: ${pluginId} (current status: ${entry.status})`,
      );
    }

    const sandboxContext = this.createSandboxContext(entry.metadata);

    try {
      await sandboxContext.executeSecurely(async () => {
        if (!entry.instance) {
          throw new Error(`Plugin instance not found: ${pluginId}`);
        }
        await entry.instance.start();
      });

      entry.status = 'active';
      entry.startedAt = Date.now();

      this.logger.info('plugin', `Plugin started: ${pluginId}`);

      // 触发启动事件
      this.emitEvent('plugin:started', {
        pluginId,
        timestamp: Date.now(),
      });
    } catch (error) {
      entry.status = 'error';
      entry.lastError = error instanceof Error ? error : new Error(String(error));

      this.logger.error('plugin', `Plugin start failed: ${pluginId}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      // 触发错误事件
      this.emitEvent('plugin:error', {
        pluginId,
        timestamp: Date.now(),
        error: error instanceof Error ? error : new Error(String(error)),
      });

      throw error;
    }
  }

  /**
   * 停止插件
   * @param pluginId 插件 ID
   * @throws 如果插件不存在或停止失败
   */
  async stopPlugin(pluginId: string): Promise<void> {
    const entry = this.getEntry(pluginId);

    if (entry.status !== 'active') {
      this.logger.warn('plugin', `Plugin not active: ${pluginId} (status: ${entry.status})`);
      return;
    }

    const sandboxContext = this.createSandboxContext(entry.metadata);

    try {
      await sandboxContext.executeSecurely(async () => {
        if (!entry.instance) {
          throw new Error(`Plugin instance not found: ${pluginId}`);
        }
        await entry.instance.stop();
      });

      entry.status = 'loaded';
      entry.startedAt = undefined;

      this.logger.info('plugin', `Plugin stopped: ${pluginId}`);

      // 触发停止事件
      this.emitEvent('plugin:stopped', {
        pluginId,
        timestamp: Date.now(),
      });
    } catch (error) {
      entry.status = 'error';
      entry.lastError = error instanceof Error ? error : new Error(String(error));

      this.logger.error('plugin', `Plugin stop failed: ${pluginId}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      // 触发错误事件
      this.emitEvent('plugin:error', {
        pluginId,
        timestamp: Date.now(),
        error: error instanceof Error ? error : new Error(String(error)),
      });

      throw error;
    }
  }

  /**
   * 启动所有已加载的插件
   * @returns 启动结果映射
   */
  async startAll(): Promise<Map<string, PluginLoadResult>> {
    const results = new Map<string, PluginLoadResult>();

    // 按依赖顺序排序
    const sortedIds = this.topologicalSort(Array.from(this.registry.keys()));

    for (const pluginId of sortedIds) {
      const entry = this.registry.get(pluginId);
      if (entry && entry.status === 'loaded') {
        try {
          await this.startPlugin(pluginId);
          results.set(pluginId, {
            pluginId,
            success: true,
          });
        } catch (error) {
          results.set(pluginId, {
            pluginId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return results;
  }

  /**
   * 停止所有活跃的插件
   * @returns 停止结果映射
   */
  async stopAll(): Promise<Map<string, PluginLoadResult>> {
    const results = new Map<string, PluginLoadResult>();

    // 按依赖逆序停止（先停止依赖者）
    const sortedIds = this.topologicalSort(Array.from(this.registry.keys())).reverse();

    for (const pluginId of sortedIds) {
      const entry = this.registry.get(pluginId);
      if (entry && entry.status === 'active') {
        try {
          await this.stopPlugin(pluginId);
          results.set(pluginId, {
            pluginId,
            success: true,
          });
        } catch (error) {
          results.set(pluginId, {
            pluginId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return results;
  }

  // ============================================================
  // Plugin Lifecycle: Unload
  // ============================================================

  /**
   * 卸载插件
   * @param pluginId 插件 ID
   * @throws 如果插件不存在或被其他插件依赖
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const entry = this.getEntry(pluginId);

    // 检查是否有其他插件依赖此插件
    const dependents = this.findDependents(pluginId);
    if (dependents.length > 0) {
      throw new Error(
        `Cannot unload plugin ${pluginId}: required by ${dependents.join(', ')}`,
      );
    }

    // 先停止插件（如果活跃）
    if (entry.status === 'active') {
      await this.stopPlugin(pluginId);
    }

    // 调用清理方法
    if (entry.instance?.cleanup) {
      const sandboxContext = this.createSandboxContext(entry.metadata);
      try {
        await sandboxContext.executeSecurely(() => entry.instance!.cleanup!());
      } catch (error) {
        this.logger.warn('plugin', `Plugin cleanup warning: ${pluginId}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 从注册表移除
    this.registry.delete(pluginId);

    this.logger.info('plugin', `Plugin unloaded: ${pluginId}`);

    // 触发卸载事件
    this.emitEvent('plugin:unloaded', {
      pluginId,
      timestamp: Date.now(),
    });
  }

  /**
   * 卸载所有插件
   */
  async unloadAll(): Promise<void> {
    // 按依赖逆序卸载
    const sortedIds = this.topologicalSort(Array.from(this.registry.keys())).reverse();

    for (const pluginId of sortedIds) {
      try {
        await this.unloadPlugin(pluginId);
      } catch (error) {
        this.logger.warn('plugin', `Unload warning for ${pluginId}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // ============================================================
  // Plugin Method Invocation
  // ============================================================

  /**
   * 调用插件方法
   * @param pluginId 插件 ID
   * @param method 方法名
   * @param params 参数
   * @returns 方法返回值
   * @throws 如果插件未活跃或不支持方法
   */
  async callPlugin(pluginId: string, method: string, params?: unknown): Promise<unknown> {
    const entry = this.getEntry(pluginId);

    if (entry.status !== 'active') {
      throw new Error(
        `Plugin not active: ${pluginId} (current status: ${entry.status})`,
      );
    }

    const instance = entry.instance;
    if (!instance) {
      throw new Error(`Plugin instance not found: ${pluginId}`);
    }

    if (!instance.handle) {
      throw new Error(`Plugin does not support method calls: ${pluginId}`);
    }

    const sandboxContext = this.createSandboxContext(entry.metadata);

    return sandboxContext.executeSecurely(() => instance.handle!(method, params));
  }

  // ============================================================
  // Plugin Query Methods
  // ============================================================

  /**
   * 获取插件实例
   * @param pluginId 插件 ID
   * @returns 插件实例或 undefined
   */
  getPlugin(pluginId: string): HoneycombPlugin | undefined {
    return this.registry.get(pluginId)?.instance;
  }

  /**
   * 获取插件元数据
   * @param pluginId 插件 ID
   * @returns 插件元数据或 undefined
   */
  getMetadata(pluginId: string): PluginMetadata | undefined {
    return this.registry.get(pluginId)?.metadata;
  }

  /**
   * 获取插件状态
   * @param pluginId 插件 ID
   * @returns 插件状态或 undefined
   */
  getStatus(pluginId: string): PluginStatus | undefined {
    return this.registry.get(pluginId)?.status;
  }

  /**
   * 获取插件状态信息
   * @param pluginId 插件 ID
   * @returns 插件状态信息或 undefined
   */
  getStateInfo(pluginId: string): PluginStateInfo | undefined {
    const entry = this.registry.get(pluginId);
    if (!entry) return undefined;

    return {
      pluginId,
      status: entry.status,
      lastStateChange:
        entry.startedAt ?? entry.loadedAt ?? entry.registeredAt ?? Date.now(),
      error: entry.lastError?.message,
      startedAt: entry.startedAt,
    };
  }

  /**
   * 列出所有插件元数据
   * @returns 插件元数据数组
   */
  listPlugins(): PluginMetadata[] {
    return Array.from(this.registry.values()).map((entry) => entry.metadata);
  }

  /**
   * 按类型列出插件
   * @param type 插件类型
   * @returns 匹配类型的插件元数据数组
   */
  listPluginsByType(type: PluginType): PluginMetadata[] {
    return Array.from(this.registry.values())
      .filter((entry) => entry.metadata.type === type)
      .map((entry) => entry.metadata);
  }

  /**
   * 检查插件是否存在
   * @param pluginId 插件 ID
   * @returns 是否存在
   */
  hasPlugin(pluginId: string): boolean {
    return this.registry.has(pluginId);
  }

  // ============================================================
  // Dependency Validation
  // ============================================================

  /**
   * 验证插件依赖
   * @param pluginId 插件 ID
   * @returns 错误信息数组（空数组表示验证通过）
   */
  validateDependencies(pluginId: string): string[] {
    const entry = this.getEntry(pluginId);
    const errors: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const validate = (id: string, path: string[]): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        errors.push(`Circular dependency detected: ${[...path, id].join(' -> ')}`);
        return;
      }

      visiting.add(id);
      const currentEntry = this.registry.get(id);

      if (!currentEntry) {
        errors.push(`Missing dependency: ${id} (required by ${path[0]})`);
        visiting.delete(id);
        return;
      }

      if (currentEntry.metadata.dependencies) {
        for (const dep of currentEntry.metadata.dependencies) {
          validate(dep, [...path, id]);
        }
      }

      visiting.delete(id);
      visited.add(id);
    };

    if (entry.metadata.dependencies) {
      for (const dep of entry.metadata.dependencies) {
        validate(dep, [pluginId]);
      }
    }

    return errors;
  }

  /**
   * 验证所有插件的依赖
   * @returns 错误信息数组
   */
  validateAllDependencies(): Map<string, string[]> {
    const results = new Map<string, string[]>();

    for (const pluginId of this.registry.keys()) {
      const errors = this.validateDependencies(pluginId);
      if (errors.length > 0) {
        results.set(pluginId, errors);
      }
    }

    return results;
  }

  // ============================================================
  // Permission Control
  // ============================================================

  /**
   * 检查插件是否有权限
   * @param pluginId 插件 ID
   * @param permission 权限
   * @returns 是否有权限
   */
  hasPermission(pluginId: string, permission: PluginPermission): boolean {
    const entry = this.getEntry(pluginId);
    const permissions = entry.metadata.permissions ?? [];

    // 检查通配符权限
    if (permissions.includes('*')) {
      return true;
    }

    // 检查精确匹配
    return permissions.includes(permission);
  }

  /**
   * 检查插件权限集合
   * @param pluginId 插件 ID
   * @param requiredPermissions 所需权限数组
   * @returns 权限检查结果
   */
  checkPermissions(pluginId: string, requiredPermissions: PluginPermission[]): PermissionCheckResult {
    const entry = this.getEntry(pluginId);
    const permissions = entry.metadata.permissions ?? [];

    // 通配符权限
    if (permissions.includes('*')) {
      return { granted: true };
    }

    // 检查每个所需权限
    const missing: PluginPermission[] = [];

    for (const required of requiredPermissions) {
      if (!permissions.includes(required)) {
        missing.push(required);
      }
    }

    return {
      granted: missing.length === 0,
      missing: missing.length > 0 ? missing : undefined,
    };
  }

  /**
   * 检查插件权限并抛出异常（如果不通过）
   * @param pluginId 插件 ID
   * @param permission 权限
   * @throws 如果没有权限
   */
  checkPermission(pluginId: string, permission: PluginPermission): void {
    if (!this.hasPermission(pluginId, permission)) {
      throw new Error(
        `Permission denied: plugin ${pluginId} does not have permission ${permission}`,
      );
    }
  }

  // ============================================================
  // Plugin Discovery
  // ============================================================

  /**
   * 扫描目录查找插件
   * @param dir 目录路径
   * @returns 插件发现结果数组
   */
  async scanDirectory(dir: string): Promise<PluginDiscoveryResult[]> {
    const results: PluginDiscoveryResult[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(dir, entry.name);
          const result = await this.discoverPlugin(pluginPath);
          if (result) {
            results.push(result);
          }
        }
      }
    } catch (error) {
      this.logger.error('plugin', `Failed to scan directory: ${dir}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return results;
  }

  /**
   * 发现单个插件
   * @param pluginPath 插件目录路径
   * @returns 插件发现结果或 null
   */
  async discoverPlugin(pluginPath: string): Promise<PluginDiscoveryResult | null> {
    const manifestPath = path.join(pluginPath, 'plugin.json');
    const errors: string[] = [];

    try {
      // 读取清单文件
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent) as PluginManifest;

      // 验证清单
      if (!manifest.metadata?.plugin_id) {
        errors.push('Missing plugin_id in metadata');
      }
      if (!manifest.metadata?.name) {
        errors.push('Missing name in metadata');
      }
      if (!manifest.metadata?.version) {
        errors.push('Missing version in metadata');
      }
      if (!manifest.main) {
        errors.push('Missing main entry point');
      }

      return {
        path: pluginPath,
        manifest,
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      return {
        path: pluginPath,
        manifest: {} as PluginManifest,
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * 从目录加载插件
   * @param dir 插件目录
   * @param options 加载选项
   * @returns 加载结果数组
   */
  async loadFromDirectory(dir: string, options?: PluginLoadOptions): Promise<PluginLoadResult[]> {
    const discoveries = await this.scanDirectory(dir);
    const results: PluginLoadResult[] = [];

    for (const discovery of discoveries) {
      if (!discovery.valid) {
        results.push({
          pluginId: discovery.manifest.metadata?.plugin_id ?? 'unknown',
          success: false,
          error: `Invalid plugin manifest: ${discovery.errors.join(', ')}`,
        });
        continue;
      }

      try {
        // 动态导入插件
        const pluginPath = path.join(discovery.path, discovery.manifest.main);
        const module = await import(pluginPath);
        const PluginClass = module.default;

        if (!PluginClass) {
          throw new Error('Plugin module must export a default class');
        }

        // 创建插件实例
        const plugin = new PluginClass() as HoneycombPlugin;

        // 注册插件
        this.registerPlugin(plugin);

        // 验证依赖
        if (!options?.ignoreDependencies) {
          const depErrors = this.validateDependencies(plugin.metadata.plugin_id);
          if (depErrors.length > 0) {
            throw new Error(`Dependency errors: ${depErrors.join(', ')}`);
          }
        }

        // 初始化插件
        await this.initializePlugin(plugin.metadata.plugin_id);

        // 自动启动
        if (options?.autoStart) {
          await this.startPlugin(plugin.metadata.plugin_id);
        }

        results.push({
          pluginId: plugin.metadata.plugin_id,
          success: true,
        });
      } catch (error) {
        results.push({
          pluginId: discovery.manifest.metadata?.plugin_id ?? 'unknown',
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  // ============================================================
  // Event Handling
  // ============================================================

  /**
   * 监听插件事件
   * @param event 事件类型
   * @param handler 事件处理器
   * @returns 取消订阅函数
   */
  on(event: string, handler: PluginEventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }

    const handlers = this.eventHandlers.get(event)!;
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    };
  }

  /**
   * 移除事件监听器
   * @param event 事件类型
   * @param handler 事件处理器
   */
  off(event: string, handler: PluginEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * 触发插件事件
   * @param event 事件类型
   * @param data 事件数据
   */
  private emitEvent(event: string, data: PluginEventData): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          void handler(data);
        } catch (error) {
          this.logger.error('plugin', `Event handler error: ${event}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  /**
   * 获取注册表条目
   * @param pluginId 插件 ID
   * @returns 注册表条目
   * @throws 如果插件不存在
   */
  private getEntry(pluginId: string): RegistryEntry {
    const entry = this.registry.get(pluginId);
    if (!entry) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    return entry;
  }

  /**
   * 创建沙箱上下文
   * @param metadata 插件元数据
   * @returns 沙箱上下文
   */
  private createSandboxContext(metadata: PluginMetadata): PluginSandboxContext {
    // 合并全局策略和插件特定策略
    const policy: SandboxPolicy = {
      ...this.defaultSandboxPolicy,
      ...metadata.sandbox_policy,
    };

    return createSandboxContext(policy, metadata.plugin_id, this.logger);
  }

  /**
   * 查找依赖指定插件的其他插件
   * @param pluginId 插件 ID
   * @returns 依赖者插件 ID 数组
   */
  private findDependents(pluginId: string): string[] {
    const dependents: string[] = [];

    for (const [id, entry] of this.registry) {
      if (entry.metadata.dependencies?.includes(pluginId)) {
        dependents.push(id);
      }
    }

    return dependents;
  }

  /**
   * 拓扑排序（处理依赖顺序）
   * @param pluginIds 插件 ID 数组
   * @returns 排序后的插件 ID 数组
   */
  private topologicalSort(pluginIds: string[]): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) return; // 循环依赖，跳过

      visiting.add(id);

      const entry = this.registry.get(id);
      if (entry?.metadata.dependencies) {
        for (const dep of entry.metadata.dependencies) {
          if (pluginIds.includes(dep)) {
            visit(dep);
          }
        }
      }

      visiting.delete(id);
      visited.add(id);
      sorted.push(id);
    };

    for (const id of pluginIds) {
      visit(id);
    }

    return sorted;
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * 创建 PluginManager 实例
 * @param context 插件上下文
 * @returns PluginManager 实例
 */
export function createPluginManager(context: PluginContext): PluginManager {
  return new PluginManager(context);
}
