/**
 * Honeycomb Plugin System Type Definitions
 *
 * 定义插件系统的核心类型和接口，包括：
 * - PluginType: 插件类型枚举
 * - PluginStatus: 插件状态枚举
 * - PluginMetadata: 插件元数据
 * - HoneycombPlugin: 插件接口
 * - PluginContext: 插件上下文
 * - PluginPermission: 权限定义
 * - SandboxPolicy: 沙箱策略
 */

import type { Logger } from './logger.js';
import type { MessageBus } from './message-bus.js';
import type { EngineConfig } from './types.js';

// ============================================================
// Plugin Type 枚举
// ============================================================

/**
 * Plugin 类型定义
 * 每种类型对应不同的扩展点和集成方式
 */
export type PluginType =
  | 'protocol'       // 协议插件（SwarmProtocol 扩展）
  | 'decomposer'     // 分解插件（Decomposer 策略扩展）
  | 'contract'       // 合同插件（ContractManager 模板扩展）
  | 'observability'  // 可观测性插件（ObservabilityStack 导出扩展）
  | 'storage'        // 存储插件（非 SQLite 存储后端）
  | 'notification'   // 通知插件（告警发送扩展）
  | 'auth'           // 认证插件（非 RBAC 认证方式）
  | 'agent'          // Agent 插件（自定义 Agent 扩展）
  | 'skill'          // Skill 插件（Agent 能力扩展）
  | 'integration'    // 集成插件（第三方服务集成）
  | 'custom';        // 自定义插件

/**
 * Plugin 状态枚举
 * 跟踪插件在其生命周期中的当前状态
 */
export type PluginStatus =
  | 'registered'  // 已注册，等待初始化
  | 'loaded'      // 已加载（initialize 完成）
  | 'active'      // 活跃中（start 完成）
  | 'inactive'    // 已停用（stop 完成）
  | 'error'       // 错误状态
  | 'unloaded';   // 已卸载

// ============================================================
// Plugin Metadata
// ============================================================

/**
 * Plugin 元数据定义
 * 包含插件的基本信息和配置要求
 */
export interface PluginMetadata {
  /** Plugin 唯一标识符 */
  plugin_id: string;

  /** Plugin 显示名称 */
  name: string;

  /** Plugin 类型 */
  type: PluginType;

  /** Plugin 版本号（遵循 semver） */
  version: string;

  /** 兼容的 Honeycomb 版本范围（遵循 semver 范围语法） */
  honeycomb_version: string;

  /** Plugin 描述 */
  description: string;

  /** Plugin 作者 */
  author?: string;

  /** Plugin 许可证 */
  license?: string;

  /** Plugin 主页 */
  homepage?: string;

  /** Plugin 仓库地址 */
  repository?: string;

  /** 依赖的其他插件 ID 列表 */
  dependencies?: string[];

  /** 所需权限列表 */
  permissions?: PluginPermission[];

  /** 沙箱策略配置 */
  sandbox_policy?: SandboxPolicy;

  /** 配置 Schema（JSON Schema 格式） */
  config_schema?: Record<string, unknown>;

  /** 最小 Honeycomb 版本 */
  min_honeycomb_version?: string;

  /** 最大 Honeycomb 版本 */
  max_honeycomb_version?: string;
}

// ============================================================
// Plugin Permissions
// ============================================================

/**
 * Plugin 权限定义
 * 控制插件可以访问的系统资源和操作
 */
export type PluginPermission =
  // 配置相关
  | 'read:config'
  | 'write:config'
  // 项目相关
  | 'read:projects'
  | 'write:projects'
  | 'delete:projects'
  // Agent 相关
  | 'read:agents'
  | 'write:agents'
  | 'control:agents'
  // 工件相关
  | 'read:artifacts'
  | 'write:artifacts'
  | 'delete:artifacts'
  // 检查点相关
  | 'read:checkpoints'
  | 'write:checkpoints'
  | 'restore:checkpoints'
  // 消息总线相关
  | 'read:messages'
  | 'write:messages'
  | 'subscribe:messages'
  // 网络相关
  | 'network:read'
  | 'network:write'
  // 文件系统相关
  | 'fs:read'
  | 'fs:write'
  | 'fs:delete'
  // 系统相关
  | 'system:execute'
  | 'system:spawn'
  // 通配符：所有权限
  | '*';

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  /** 是否有权限 */
  granted: boolean;

  /** 缺失的权限 */
  missing?: PluginPermission[];

  /** 错误信息 */
  error?: string;
}

// ============================================================
// Sandbox Policy
// ============================================================

/**
 * 沙箱策略配置
 * 控制插件运行时的安全限制
 */
export interface SandboxPolicy {
  /** 是否启用沙箱 */
  enabled: boolean;

  /** 文件系统访问限制 */
  filesystem?: FilesystemSandboxPolicy;

  /** 网络访问限制 */
  network?: NetworkSandboxPolicy;

  /** 进程/执行限制 */
  execution?: ExecutionSandboxPolicy;

  /** 资源限制 */
  resources?: ResourceSandboxPolicy;
}

/**
 * 文件系统沙箱策略
 */
export interface FilesystemSandboxPolicy {
  /** 允许读取的路径（支持通配符） */
  allow_read?: string[];

  /** 允许写入的路径（支持通配符） */
  allow_write?: string[];

  /** 禁止访问的路径（优先级高于 allow） */
  deny_paths?: string[];

  /** 是否允许读取项目目录 */
  allow_project_read?: boolean;

  /** 是否允许写入输出目录 */
  allow_output_write?: boolean;
}

/**
 * 网络沙箱策略
 */
export interface NetworkSandboxPolicy {
  /** 是否允许网络访问 */
  allow_network?: boolean;

  /** 允许的域名白名单 */
  allow_domains?: string[];

  /** 允许的端口范围 */
  allow_ports?: string[];

  /** 禁止的域名黑名单 */
  deny_domains?: string[];
}

/**
 * 执行沙箱策略
 */
export interface ExecutionSandboxPolicy {
  /** 是否允许子进程执行 */
  allow_spawn?: boolean;

  /** 允许执行的命令白名单 */
  allow_commands?: string[];

  /** 禁止执行的命令黑名单 */
  deny_commands?: string[];

  /** 最大执行时间（毫秒） */
  max_execution_time?: number;
}

/**
 * 资源沙箱策略
 */
export interface ResourceSandboxPolicy {
  /** 最大内存使用（字节） */
  max_memory_mb?: number;

  /** 最大 CPU 使用率（百分比） */
  max_cpu_percent?: number;

  /** 最大文件描述符数 */
  max_file_descriptors?: number;
}

// ============================================================
// Plugin Interface
// ============================================================

/**
 * Honeycomb Plugin 接口
 * 所有插件必须实现此接口
 */
export interface HoneycombPlugin {
  /** Plugin 元数据 */
  metadata: PluginMetadata;

  /**
   * 初始化插件
   * 在插件加载后调用一次，用于设置插件状态
   * @param context 插件上下文，包含系统服务和配置
   */
  initialize(context: PluginContext): Promise<void>;

  /**
   * 启动插件
   * 在初始化后调用，用于启动插件的后台任务
   */
  start(): Promise<void>;

  /**
   * 停止插件
   * 停止插件的后台任务并清理资源
   */
  stop(): Promise<void>;

  /**
   * 获取插件配置 Schema
   * 可选方法，用于描述插件需要的配置
   */
  getConfigSchema?(): Record<string, unknown>;

  /**
   * 处理插件请求
   * 可选方法，用于处理来自系统或其他插件的请求
   * @param method 请求方法名
   * @param params 请求参数
   */
  handle?(method: string, params: unknown): Promise<unknown>;

  /**
   * 健康检查
   * 可选方法，用于检查插件健康状态
   */
  healthCheck?(): Promise<{ healthy: boolean; message?: string }>;

  /**
   * 清理插件资源
   * 在插件卸载前调用
   */
  cleanup?(): Promise<void>;
}

// ============================================================
// Plugin Context
// ============================================================

/**
 * Plugin 上下文
 * 提供给插件的系统服务和配置
 */
export interface PluginContext {
  /** 编排器引用（类型为 unknown 以避免循环依赖） */
  orchestrator: unknown;

  /** 日志记录器 */
  logger: Logger;

  /** 系统配置 */
  config: EngineConfig;

  /** 消息总线 */
  messageBus: MessageBus;

  /** 插件配置（来自 EngineConfig.plugins） */
  pluginConfig?: Record<string, unknown>;

  /** 沙箱上下文（用于权限控制） */
  sandbox?: PluginSandboxContext;
}

/**
 * Plugin 沙箱上下文
 * 提供沙箱运行时的信息和控制
 */
export interface PluginSandboxContext {
  /** 沙箱策略 */
  policy: SandboxPolicy;

  /** 沙箱 ID */
  sandboxId: string;

  /** 权限检查器 */
  checkPermission: (permission: PluginPermission) => boolean;

  /** 安全执行包装器 */
  executeSecurely: <T>(fn: () => Promise<T>) => Promise<T>;
}

// ============================================================
// Plugin Manager Types
// ============================================================

/**
 * Plugin 加载选项
 */
export interface PluginLoadOptions {
  /** 是否自动启动 */
  autoStart?: boolean;

  /** 是否忽略依赖错误 */
  ignoreDependencies?: boolean;

  /** 是否忽略版本不兼容 */
  ignoreVersion?: boolean;
}

/**
 * Plugin 事件类型
 */
export type PluginEventType =
  | 'plugin:registered'
  | 'plugin:loaded'
  | 'plugin:started'
  | 'plugin:stopped'
  | 'plugin:unloaded'
  | 'plugin:error';

/**
 * Plugin 事件数据
 */
export interface PluginEventData {
  /** 插件 ID */
  pluginId: string;

  /** 事件时间戳 */
  timestamp: number;

  /** 错误信息（仅 error 事件） */
  error?: Error;

  /** 额外数据 */
  data?: Record<string, unknown>;
}

/**
 * Plugin 事件处理器
 */
export type PluginEventHandler = (data: PluginEventData) => void | Promise<void>;

/**
 * Plugin 加载结果
 */
export interface PluginLoadResult {
  /** 插件 ID */
  pluginId: string;

  /** 是否成功 */
  success: boolean;

  /** 错误信息 */
  error?: string;

  /** 警告信息 */
  warnings?: string[];
}

/**
 * Plugin 状态信息
 */
export interface PluginStateInfo {
  /** 插件 ID */
  pluginId: string;

  /** 插件状态 */
  status: PluginStatus;

  /** 最后状态变更时间 */
  lastStateChange: number;

  /** 错误信息（如果有） */
  error?: string;

  /** 启动时间（如果是 active 状态） */
  startedAt?: number;
}

// ============================================================
// Plugin Discovery Types
// ============================================================

/**
 * Plugin 清单文件格式（plugin.json）
 */
export interface PluginManifest {
  /** Plugin 元数据 */
  metadata: PluginMetadata;

  /** 主入口文件路径（相对于插件目录） */
  main: string;

  /** 插件类型定义文件路径 */
  types?: string;

  /** 构建输出目录 */
  dist?: string;

  /** 可选的依赖（npm 包） */
  npm_dependencies?: Record<string, string>;
}

/**
 * Plugin 发现结果
 */
export interface PluginDiscoveryResult {
  /** 插件路径 */
  path: string;

  /** 插件清单 */
  manifest: PluginManifest;

  /** 是否有效 */
  valid: boolean;

  /** 验证错误 */
  errors: string[];
}

// ============================================================
// Plugin Registry Types
// ============================================================

/**
 * Plugin 注册表条目
 */
export interface PluginRegistryEntry {
  /** 插件元数据 */
  metadata: PluginMetadata;

  /** 插件实例 */
  instance?: HoneycombPlugin;

  /** 插件状态 */
  status: PluginStatus;

  /** 注册时间 */
  registeredAt: number;

  /** 加载时间 */
  loadedAt?: number;

  /** 启动时间 */
  startedAt?: number;

  /** 最后错误 */
  lastError?: Error;

  /** 依赖的插件（已解析） */
  dependencies?: PluginRegistryEntry[];
}

// ============================================================
// Version Compatibility
// ============================================================

/**
 * 版本比较结果
 */
export enum VersionCompareResult {
  COMPATIBLE = 'compatible',
  INCOMPATIBLE = 'incompatible',
  MAJOR_MISMATCH = 'major_mismatch',
  MINOR_MISMATCH = 'minor_mismatch',
  PATCH_MISMATCH = 'patch_mismatch',
}

/**
 * 版本兼容性检查结果
 */
export interface VersionCompatibilityResult {
  /** 是否兼容 */
  compatible: boolean;

  /** 比较结果 */
  result: VersionCompareResult;

  /** 插件版本 */
  pluginVersion: string;

  /** Honeycomb 版本 */
  honeycombVersion: string;

  /** 详细信息 */
  details: string;
}
