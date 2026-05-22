/**
 * HealthChecker - 健康检查系统
 *
 * 支持注册检查、运行检查和获取健康状态
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  HealthCheck as HealthCheckFunc,
  HealthCheckResult,
  HealthStatus,
  HealthCheckRegistration,
  HealthCheckConfig,
} from './types.js';
import { EventEmitter } from './EventEmitter.js';

/**
 * HealthChecker - 健康检查类
 */
export class HealthChecker extends EventEmitter {
  private checks: Map<string, HealthCheckRegistration> = new Map();
  private lastResults: Map<string, HealthCheckResult> = new Map();
  private intervalId?: ReturnType<typeof setInterval>;
  private config: {
    interval?: number;
    timeout?: number;
  };

  constructor(config: HealthCheckConfig = { checks: {} }) {
    super();
    this.config = {
      interval: config.interval,
      timeout: config.timeout ?? 30000,
    };

    // 注册初始检查
    for (const [name, check] of Object.entries(config.checks)) {
      this.registerCheck(name, check);
    }
  }

  /**
   * 注册健康检查
   */
  registerCheck(name: string, check: HealthCheckFunc, critical: boolean = true): void {
    this.checks.set(name, {
      name,
      check,
      critical,
    });

    // 触发注册事件
    this.emit('register', { name, critical });
  }

  /**
   * 移除健康检查
   */
  removeCheck(name: string): boolean {
    const result = this.checks.delete(name);
    if (result) {
      this.lastResults.delete(name);
      this.emit('unregister', { name });
    }
    return result;
  }

  /**
   * 运行单个健康检查
   */
  async runCheck(name: string): Promise<HealthCheckResult> {
    const registration = this.checks.get(name);
    if (!registration) {
      return {
        name,
        status: 'unhealthy',
        message: `Check "${name}" not found`,
        timestamp: new Date().toISOString(),
      };
    }

    const startTime = Date.now();

    try {
      // 支持异步和同步检查
      let result: HealthCheckResult;

      const checkFn = registration.check;
      const checkResult = checkFn();

      if (checkResult && typeof checkResult === 'object' && 'then' in checkResult) {
        // 添加超时
        const timeoutPromise = new Promise<HealthCheckResult>((_, reject) => {
          setTimeout(() => reject(new Error('Health check timeout')), this.config.timeout);
        });

        result = await Promise.race([checkResult as Promise<HealthCheckResult>, timeoutPromise]) as HealthCheckResult;
      } else {
        result = checkResult as HealthCheckResult;
      }

      const duration = Date.now() - startTime;

      const finalResult: HealthCheckResult = {
        name,
        status: result.status,
        message: result.message,
        timestamp: result.timestamp ?? new Date().toISOString(),
        duration,
        metadata: result.metadata,
      };

      this.lastResults.set(name, finalResult);
      return finalResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: HealthCheckResult = {
        name,
        status: 'unhealthy',
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        duration,
      };

      this.lastResults.set(name, result);
      return result;
    }
  }

  /**
   * 运行所有健康检查
   */
  async runChecks(): Promise<HealthCheckResult[]> {
    const checkNames = Array.from(this.checks.keys());
    const results: HealthCheckResult[] = [];

    // 并行运行所有检查
    const promises = checkNames.map(async (name) => {
      const result = await this.runCheck(name);
      return result;
    });

    const allResults = await Promise.all(promises);
    results.push(...allResults);

    // 触发完成事件
    this.emit('checksComplete', results);

    return results;
  }

  /**
   * 获取总体健康状态
   */
  getStatus(): HealthStatus {
    const results = Array.from(this.lastResults.values());

    if (results.length === 0) {
      return 'healthy';
    }

    // 检查关键检查项
    const criticalResults = results.filter((r) => {
      const registration = this.checks.get(r.name);
      return registration?.critical;
    });

    // 如果有关键检查项失败，返回 unhealthy
    if (criticalResults.some((r) => r.status === 'unhealthy')) {
      return 'unhealthy';
    }

    // 如果任何检查项失败或降级，返回 degraded
    if (results.some((r) => r.status === 'unhealthy' || r.status === 'degraded')) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * 获取详细健康报告
   */
  getReport(): {
    status: HealthStatus;
    checks: HealthCheckResult[];
    timestamp: string;
  } {
    const results = Array.from(this.lastResults.values());
    return {
      status: this.getStatus(),
      checks: results,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 获取单个检查的最后结果
   */
  getLastResult(name: string): HealthCheckResult | undefined {
    return this.lastResults.get(name);
  }

  /**
   * 获取所有最后结果
   */
  getLastResults(): HealthCheckResult[] {
    return Array.from(this.lastResults.values());
  }

  /**
   * 启动定期检查
   */
  startPeriodicChecks(intervalMs?: number): void {
    if (this.intervalId) {
      this.stopPeriodicChecks();
    }

    const interval = intervalMs ?? this.config.interval ?? 60000;

    this.intervalId = setInterval(async () => {
      await this.runChecks();
    }, interval);

    // 立即运行一次
    this.runChecks();
  }

  /**
   * 停止定期检查
   */
  stopPeriodicChecks(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * 获取已注册检查列表
   */
  getRegisteredChecks(): string[] {
    return Array.from(this.checks.keys());
  }

  /**
   * 获取检查统计信息
   */
  getStats(): {
    totalChecks: number;
    criticalChecks: number;
    lastCheckTime?: string;
  } {
    const criticalChecks = Array.from(this.checks.values()).filter((c) => c.critical).length;
    const lastResults = Array.from(this.lastResults.values());
    const lastCheckTime = lastResults.length > 0
      ? lastResults.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.timestamp
      : undefined;

    return {
      totalChecks: this.checks.size,
      criticalChecks,
      lastCheckTime,
    };
  }
}

/**
 * 创建健康检查的便捷函数
 */
export function createHealthCheck(config?: HealthCheckConfig): HealthChecker {
  return new HealthChecker(config);
}

/**
 * 预定义健康检查 - 内存使用率
 */
export function createMemoryHealthCheck(threshold: number = 0.9): HealthCheckFunc {
  return () => {
    const usage = process.memoryUsage();
    const heapUsedRatio = usage.heapUsed / usage.heapTotal;

    return {
      name: 'memory',
      status: heapUsedRatio > threshold ? 'unhealthy' : heapUsedRatio > threshold * 0.8 ? 'degraded' : 'healthy',
      message: `Heap usage: ${(heapUsedRatio * 100).toFixed(2)}%`,
      timestamp: new Date().toISOString(),
      metadata: {
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        heapUsedRatio,
      },
    };
  };
}

/**
 * 预定义健康检查 - CPU 使用率
 */
export function createCpuHealthCheck(threshold: number = 0.9): HealthCheckFunc {
  let lastCpuUsage: NodeJS.CpuUsage | undefined;

  return () => {
    const cpuUsage = process.cpuUsage(lastCpuUsage);
    lastCpuUsage = process.cpuUsage();

    const totalMs = (cpuUsage.user + cpuUsage.system) / 1000;
    const cpuPercent = Math.min(100, totalMs);

    return {
      name: 'cpu',
      status: cpuPercent > threshold * 100 ? 'unhealthy' : cpuPercent > threshold * 80 ? 'degraded' : 'healthy',
      message: `CPU usage: ${cpuPercent.toFixed(2)}%`,
      timestamp: new Date().toISOString(),
      metadata: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        total: totalMs,
      },
    };
  };
}

/**
 * 预定义健康检查 - 活跃事件循环延迟
 */
export function createEventLoopHealthCheck(thresholdMs: number = 100): HealthCheckFunc {
  return () => {
    const start = process.hrtime.bigint();

    // 调度一个立即执行的回调
    return new Promise<HealthCheckResult>((resolve) => {
      setImmediate(() => {
        const end = process.hrtime.bigint();
        const delayMs = Number(end - start) / 1_000_000;

        resolve({
          name: 'eventLoop',
          status: delayMs > thresholdMs ? 'unhealthy' : delayMs > thresholdMs * 0.8 ? 'degraded' : 'healthy',
          message: `Event loop delay: ${delayMs.toFixed(2)}ms`,
          timestamp: new Date().toISOString(),
          metadata: {
            delayMs,
            thresholdMs,
          },
        });
      });
    });
  };
}

/**
 * 默认健康检查实例
 */
let defaultHealthCheck: HealthChecker | null = null;

/**
 * 获取默认健康检查实例
 */
export function getDefaultHealthCheck(): HealthChecker {
  if (!defaultHealthCheck) {
    defaultHealthCheck = new HealthChecker();
  }
  return defaultHealthCheck;
}

/**
 * 设置默认健康检查实例
 */
export function setDefaultHealthCheck(healthCheck: HealthChecker): void {
  defaultHealthCheck = healthCheck;
}
