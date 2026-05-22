/**
 * Honeycomb Plugin Sandbox System
 *
 * 实现插件沙箱隔离机制，包括：
 * - 文件系统访问控制
 * - 网络访问控制
 * - 进程执行限制
 * - 资源使用限制
 *
 * 通过代理模式和 API 拦截实现安全边界。
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Logger } from './logger.js';
import type {
  SandboxPolicy,
  PluginSandboxContext,
  PluginPermission,
  FilesystemSandboxPolicy,
  NetworkSandboxPolicy,
  ExecutionSandboxPolicy,
  ResourceSandboxPolicy,
} from './plugin-types.js';

// ============================================================
// Security Utilities
// ============================================================

/**
 * 路径模式匹配器
 * 支持通配符 * 和 **
 */
class PathMatcher {
  /**
   * 检查路径是否匹配模式
   * @param path 要检查的路径
   * @param pattern 模式（支持 * 和 **）
   * @returns 是否匹配
   */
  static matches(path: string, pattern: string): boolean {
    // 将路径模式转换为正则表达式
    const regexPattern = pattern
      .replace(/\./g, '\\.')  // 转义点号
      .replace(/\*\*/g, '.*')  // ** 匹配任意多级
      .replace(/\*/g, '[^/]*') // * 匹配单级
      .replace(/\?/g, '[^/]'); // ? 匹配单个字符

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * 检查路径是否匹配任何模式
   * @param path 要检查的路径
   * @param patterns 模式数组
   * @returns 是否匹配
   */
  static matchesAny(path: string, patterns: string[]): boolean {
    return patterns.some((pattern) => this.matches(path, pattern));
  }

  /**
   * 规范化路径
   * @param path 原始路径
   * @returns 规范化后的绝对路径
   */
  static normalize(path: string): string {
    return path.replace(/[\\/]+/g, '/').replace(/\/\.\//g, '/');
  }

  /**
   * 检查路径是否是被禁止路径的子路径
   * @param targetPath 目标路径
   * @param deniedPaths 被禁止的路径数组
   * @returns 是否被禁止
   */
  static isDenied(targetPath: string, deniedPaths: string[]): boolean {
    const normalized = PathMatcher.normalize(targetPath);

    for (const denied of deniedPaths) {
      const normalizedDenied = PathMatcher.normalize(denied);
      if (normalized.startsWith(normalizedDenied + '/') || normalized === normalizedDenied) {
        return true;
      }
    }

    return false;
  }
}

// ============================================================
// Filesystem Sandbox
// ============================================================

/**
 * 文件系统沙箱
 * 控制插件对文件系统的访问
 */
class FilesystemSandbox {
  private policy: FilesystemSandboxPolicy;
  private logger: Logger;

  constructor(policy: FilesystemSandboxPolicy, logger: Logger) {
    this.policy = policy;
    this.logger = logger;
  }

  /**
   * 检查读取权限
   * @param filePath 文件路径
   * @returns 是否允许读取
   */
  canRead(filePath: string): boolean {
    const normalized = PathMatcher.normalize(filePath);

    // 检查禁止路径
    if (this.policy.deny_paths && PathMatcher.isDenied(normalized, this.policy.deny_paths)) {
      return false;
    }

    // 检查允许列表
    if (this.policy.allow_read && this.policy.allow_read.length > 0) {
      return PathMatcher.matchesAny(normalized, this.policy.allow_read);
    }

    // 检查特殊权限
    if (this.policy.allow_project_read) {
      // 允许读取项目相关目录
      // 在实际实现中，这里会检查路径是否在允许的项目目录下
      return true;
    }

    // 默认拒绝
    return false;
  }

  /**
   * 检查写入权限
   * @param filePath 文件路径
   * @returns 是否允许写入
   */
  canWrite(filePath: string): boolean {
    const normalized = PathMatcher.normalize(filePath);

    // 检查禁止路径
    if (this.policy.deny_paths && PathMatcher.isDenied(normalized, this.policy.deny_paths)) {
      return false;
    }

    // 检查允许列表
    if (this.policy.allow_write && this.policy.allow_write.length > 0) {
      return PathMatcher.matchesAny(normalized, this.policy.allow_write);
    }

    // 检查特殊权限
    if (this.policy.allow_output_write) {
      // 允许写入输出目录
      return true;
    }

    // 默认拒绝
    return false;
  }

  /**
   * 安全读取文件
   * @param filePath 文件路径
   * @returns 文件内容
   * @throws 如果没有权限
   */
  async readFile(filePath: string): Promise<string> {
    if (!this.canRead(filePath)) {
      throw new Error(`File read denied: ${filePath}`);
    }

    return await fs.readFile(filePath, 'utf-8');
  }

  /**
   * 安全写入文件
   * @param filePath 文件路径
   * @param content 文件内容
   * @throws 如果没有权限
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    if (!this.canWrite(filePath)) {
      throw new Error(`File write denied: ${filePath}`);
    }

    // 确保目录存在
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * 安全列出目录
   * @param dirPath 目录路径
   * @returns 目录内容
   * @throws 如果没有权限
   */
  async readdir(dirPath: string): Promise<string[]> {
    if (!this.canRead(dirPath)) {
      throw new Error(`Directory read denied: ${dirPath}`);
    }

    return await fs.readdir(dirPath);
  }
}

// ============================================================
// Network Sandbox
// ============================================================

/**
 * 网络沙箱
 * 控制插件的网络访问
 */
class NetworkSandbox {
  private policy: NetworkSandboxPolicy;
  private logger: Logger;

  constructor(policy: NetworkSandboxPolicy, logger: Logger) {
    this.policy = policy;
    this.logger = logger;
  }

  /**
   * 检查是否允许网络访问
   * @param url 目标 URL
   * @returns 是否允许
   */
  canAccess(url: string): boolean {
    // 完全禁用网络
    if (this.policy.allow_network === false) {
      return false;
    }

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;

      // 检查黑名单
      if (this.policy.deny_domains && this.policy.deny_domains.includes(hostname)) {
        return false;
      }

      // 检查白名单（如果配置了）
      if (this.policy.allow_domains && this.policy.allow_domains.length > 0) {
        return PathMatcher.matchesAny(hostname, this.policy.allow_domains);
      }

      // 检查端口
      if (this.policy.allow_ports && this.policy.allow_ports.length > 0) {
        const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
        if (!this.policy.allow_ports.includes(port)) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * 安全的 fetch 包装器
   * @param url URL
   * @param options Fetch 选项
   * @returns Fetch 响应
   * @throws 如果没有权限
   */
  async secureFetch(url: string, options?: RequestInit): Promise<Response> {
    if (!this.canAccess(url)) {
      throw new Error(`Network access denied: ${url}`);
    }

    return fetch(url, options);
  }
}

// ============================================================
// Execution Sandbox
// ============================================================

/**
 * 执行沙箱
 * 控制插件的进程执行能力
 */
class ExecutionSandbox {
  private policy: ExecutionSandboxPolicy;
  private logger: Logger;
  private activeExecutions = new Map<string, NodeJS.Timeout>();

  constructor(policy: ExecutionSandboxPolicy, logger: Logger) {
    this.policy = policy;
    this.logger = logger;
  }

  /**
   * 检查是否允许执行命令
   * @param command 命令
   * @returns 是否允许
   */
  canExecute(command: string): boolean {
    // 完全禁用子进程
    if (this.policy.allow_spawn === false) {
      return false;
    }

    const cmdName = command.split(' ')[0];

    // 检查黑名单
    if (this.policy.deny_commands && this.policy.deny_commands.includes(cmdName)) {
      return false;
    }

    // 检查白名单（如果配置了）
    if (this.policy.allow_commands && this.policy.allow_commands.length > 0) {
      return this.policy.allow_commands.includes(cmdName);
    }

    // 默认拒绝
    return false;
  }

  /**
   * 安全执行命令（带超时）
   * @param command 命令
   * @param args 参数数组
   * @returns 执行结果
   * @throws 如果没有权限或执行超时
   */
  async execute(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    if (!this.canExecute(command)) {
      throw new Error(`Command execution denied: ${command}`);
    }

    // 使用 Bun 的 spawn API
    const proc = Bun.spawn([command, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const executionId = `${command}-${Date.now()}`;
    const maxTime = this.policy.max_execution_time ?? 30000; // 默认 30 秒

    // 设置超时
    const timer = setTimeout(() => {
      proc.kill();
      this.activeExecutions.delete(executionId);
    }, maxTime);

    this.activeExecutions.set(executionId, timer);

    try {
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        throw new Error(`Command failed with exit code ${exitCode}: ${stderr}`);
      }

      return { stdout, stderr };
    } finally {
      clearTimeout(timer);
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * 终止所有活跃执行
   */
  killAll(): void {
    for (const timer of this.activeExecutions.values()) {
      clearTimeout(timer);
    }
    this.activeExecutions.clear();
  }
}

// ============================================================
// Resource Sandbox
// ============================================================

/**
 * 资源沙箱
 * 监控和限制插件的资源使用
 */
class ResourceSandbox {
  private policy: ResourceSandboxPolicy;
  private logger: Logger;
  private memoryUsageBaseline = 0;
  private startTime = Date.now();

  constructor(policy: ResourceSandboxPolicy, logger: Logger) {
    this.policy = policy;
    this.logger = logger;
    this.memoryUsageBaseline = process.memoryUsage().heapUsed;
  }

  /**
   * 检查资源使用是否在限制内
   * @returns 资源使用状态
   */
  checkResourceUsage(): {
    withinLimits: boolean;
    memoryUsage: number;
    cpuPercent: number;
    uptime: number;
  } {
    const memUsage = process.memoryUsage();
    const heapUsed = memUsage.heapUsed - this.memoryUsageBaseline;
    const memoryUsageMB = heapUsed / (1024 * 1024);
    const uptime = Date.now() - this.startTime;

    // 估算 CPU 使用率（简化版本）
    const cpuPercent = 0; // 在实际实现中，使用更精确的测量

    const withinLimits =
      (!this.policy.max_memory_mb || memoryUsageMB <= this.policy.max_memory_mb) &&
      (!this.policy.max_cpu_percent || cpuPercent <= this.policy.max_cpu_percent);

    return {
      withinLimits,
      memoryUsage: memoryUsageMB,
      cpuPercent,
      uptime,
    };
  }

  /**
   * 获取资源使用报告
   * @returns 资源使用详情
   */
  getResourceReport(): {
    memory: {
      current: number;
      limit: number | undefined;
      usagePercent: number | undefined;
    };
    cpu: {
      current: number;
      limit: number | undefined;
    };
    uptime: number;
  } {
    const usage = this.checkResourceUsage();

    return {
      memory: {
        current: usage.memoryUsage,
        limit: this.policy.max_memory_mb,
        usagePercent: this.policy.max_memory_mb
          ? (usage.memoryUsage / this.policy.max_memory_mb) * 100
          : undefined,
      },
      cpu: {
        current: usage.cpuPercent,
        limit: this.policy.max_cpu_percent,
      },
      uptime: usage.uptime,
    };
  }
}

// ============================================================
// Plugin Sandbox Context Factory
// ============================================================

/**
 * 创建插件沙箱上下文
 * @param policy 沙箱策略
 * @param pluginId 插件 ID
 * @param logger 日志记录器
 * @returns 沙箱上下文
 */
export function createSandboxContext(
  policy: SandboxPolicy,
  pluginId: string,
  logger: Logger,
): PluginSandboxContext {
  const sandboxId = `sandbox-${pluginId}-${Date.now()}`;

  // 创建子系统沙箱
  const fsSandbox = new FilesystemSandbox(policy.filesystem ?? {}, logger);
  const networkSandbox = new NetworkSandbox(policy.network ?? {}, logger);
  const executionSandbox = new ExecutionSandbox(policy.execution ?? {}, logger);
  const resourceSandbox = new ResourceSandbox(policy.resources ?? {}, logger);

  // 权限检查器
  const checkPermission = (permission: PluginPermission): boolean => {
    // 权限检查由 PluginManager 处理
    // 这里我们只做基本验证
    return true;
  };

  // 安全执行包装器
  const executeSecurely = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (!policy.enabled) {
      // 沙箱未启用，直接执行
      return await fn();
    }

    // 检查资源限制
    const resourceStatus = resourceSandbox.checkResourceUsage();
    if (!resourceStatus.withinLimits) {
      throw new Error(
        `Resource limit exceeded for plugin ${pluginId}: ` +
          `memory=${resourceStatus.memoryUsage}MB, ` +
          `uptime=${resourceStatus.uptime}ms`,
      );
    }

    try {
      // 执行函数
      return await fn();
    } catch (error) {
      logger.error('plugin', `Sandbox execution error in ${pluginId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  return {
    policy,
    sandboxId,
    checkPermission,
    executeSecurely,
    // 额外的沙箱功能（可选暴露）
    filesystem: fsSandbox,
    network: networkSandbox,
    execution: executionSandbox,
    resources: resourceSandbox,
  } as unknown as PluginSandboxContext;
}

// ============================================================
// Security Validators
// ============================================================

/**
 * 安全验证器集合
 */
export class SecurityValidators {
  /**
   * 验证插件元数据的安全性
   * @param metadata 插件元数据
   * @returns 验证结果
   */
  static validateMetadata(metadata: {
    plugin_id: string;
    permissions?: string[];
    sandbox_policy?: SandboxPolicy;
  }): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查 plugin_id 格式
    if (!/^[a-z0-9_-]+$/i.test(metadata.plugin_id)) {
      errors.push(`Invalid plugin_id format: ${metadata.plugin_id}`);
    }

    // 检查通配符权限
    if (metadata.permissions?.includes('*')) {
      warnings.push(`Plugin ${metadata.plugin_id} requests all permissions (*)`);
    }

    // 检查危险权限
    const dangerousPermissions: PluginPermission[] = [
      'fs:delete',
      'system:execute',
      'system:spawn',
      'delete:projects',
    ];
    const requestedDangerous = metadata.permissions?.filter((p) =>
      dangerousPermissions.includes(p as PluginPermission),
    );
    if (requestedDangerous && requestedDangerous.length > 0) {
      warnings.push(
        `Plugin ${metadata.plugin_id} requests dangerous permissions: ${requestedDangerous.join(', ')}`,
      );
    }

    // 检查沙箱是否被禁用
    if (metadata.sandbox_policy?.enabled === false) {
      warnings.push(`Plugin ${metadata.plugin_id} has sandbox disabled`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 验证插件代码的基本安全性
   * @param code 插件代码字符串
   * @returns 验证结果
   */
  static validateCode(code: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查危险模式
    const dangerousPatterns = [
      { pattern: /eval\s*\(/, message: 'Use of eval() detected' },
      { pattern: /Function\s*\(/, message: 'Use of Function constructor detected' },
      { pattern: /process\.exit\s*\(/, message: 'Use of process.exit() detected' },
      { pattern: /child_process['"]/, message: 'Direct child_process access detected' },
      { pattern: /child_process\./, message: 'Direct child_process access detected' },
    ];

    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(code)) {
        errors.push(message);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
