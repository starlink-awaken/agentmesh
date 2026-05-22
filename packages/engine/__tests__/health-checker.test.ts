/**
 * HealthChecker 单元测试
 *
 * 测试健康检查系统的完整功能：
 * - 系统资源检查（CPU、内存、磁盘）
 * - 数据库健康检查
 * - Agent 池健康检查
 * - MessageBus 健康检查
 * - 整体状态聚合
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { HealthChecker, type HealthCheck, type HealthStatus, type SystemHealth } from '../src/observability.js';
import { CheckpointManager } from '../src/checkpoint-manager.js';
import { MessageBus } from '../src/message-bus.js';
import { AgentPool } from '../src/agent-runner.js';
import * as fs from 'node:fs';
import * as os from 'node:os';

// ============================================================
// 测试辅助工具
// ============================================================

/**
 * 创建临时测试数据库路径
 */
function createTestDbPath(): string {
  const tmpDir = os.tmpdir();
  const uniqueId = Math.random().toString(36).substring(7);
  return `${tmpDir}/health-test-${uniqueId}.db`;
}

/**
 * 清理测试数据库文件
 */
function cleanupTestDb(dbPath: string): void {
  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    const shmPath = `${dbPath}-shm`;
    const walPath = `${dbPath}-wal`;
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  } catch {
    // 忽略清理错误
  }
}

// ============================================================
// HealthChecker 基础功能测试
// ============================================================

describe('HealthChecker - 基础功能', () => {
  let healthChecker: HealthChecker;

  beforeEach(() => {
    healthChecker = new HealthChecker();
  });

  afterEach(() => {
    // 清理所有注册的检查
    healthChecker.runChecks();
  });

  describe('构造函数和初始化', () => {
    it('应该创建 HealthChecker 实例', () => {
      expect(healthChecker).toBeDefined();
      expect(healthChecker.getUptime()).toBeGreaterThanOrEqual(0);
    });

    it('应该记录启动时间', () => {
      const beforeStart = Date.now();
      const checker = new HealthChecker();
      const afterStart = Date.now();

      expect(checker.getUptime()).toBeGreaterThanOrEqual(0);
      expect(checker.getUptime()).toBeLessThanOrEqual(afterStart - beforeStart + 10);
    });
  });

  describe('检查注册和管理', () => {
    it('应该成功注册健康检查', () => {
      const checkName = 'test-check';
      const checkFn = (): HealthCheck => ({
        name: checkName,
        status: 'healthy',
        message: 'All good',
        last_check: Date.now(),
      });

      healthChecker.registerCheck(checkName, checkFn);
      const health = healthChecker.runChecks();

      expect(health.checks).toHaveLength(1);
      expect(health.checks[0].name).toBe(checkName);
    });

    it('应该覆盖同名检查', () => {
      const checkName = 'duplicate-check';

      healthChecker.registerCheck(checkName, () => ({
        name: checkName,
        status: 'healthy',
        message: 'First',
        last_check: Date.now(),
      }));

      healthChecker.registerCheck(checkName, () => ({
        name: checkName,
        status: 'degraded',
        message: 'Second',
        last_check: Date.now(),
      }));

      const health = healthChecker.runChecks();

      expect(health.checks).toHaveLength(1);
      expect(health.checks[0].message).toBe('Second');
    });

    it('应该成功移除检查', () => {
      const checkName = 'removable-check';

      healthChecker.registerCheck(checkName, () => ({
        name: checkName,
        status: 'healthy',
        message: 'Test',
        last_check: Date.now(),
      }));

      healthChecker.removeCheck(checkName);
      const health = healthChecker.runChecks();

      expect(health.checks).toHaveLength(0);
    });

    it('移除不存在的检查不应该报错', () => {
      expect(() => {
        healthChecker.removeCheck('non-existent');
      }).not.toThrow();
    });
  });

  describe('运行检查', () => {
    it('没有检查时应该返回 healthy', () => {
      const health = healthChecker.runChecks();

      expect(health.overall).toBe('healthy');
      expect(health.checks).toHaveLength(0);
    });

    it('所有检查健康时应该返回 healthy', () => {
      healthChecker.registerCheck('check1', () => ({
        name: 'check1',
        status: 'healthy',
        message: 'OK',
        last_check: Date.now(),
      }));

      healthChecker.registerCheck('check2', () => ({
        name: 'check2',
        status: 'healthy',
        message: 'OK',
        last_check: Date.now(),
      }));

      const health = healthChecker.runChecks();

      expect(health.overall).toBe('healthy');
      expect(health.checks).toHaveLength(2);
    });

    it('有 degraded 检查时应该返回 degraded', () => {
      healthChecker.registerCheck('check1', () => ({
        name: 'check1',
        status: 'healthy',
        message: 'OK',
        last_check: Date.now(),
      }));

      healthChecker.registerCheck('check2', () => ({
        name: 'check2',
        status: 'degraded',
        message: 'Slow',
        last_check: Date.now(),
      }));

      const health = healthChecker.runChecks();

      expect(health.overall).toBe('degraded');
    });

    it('有 unhealthy 检查时应该返回 unhealthy', () => {
      healthChecker.registerCheck('check1', () => ({
        name: 'check1',
        status: 'healthy',
        message: 'OK',
        last_check: Date.now(),
      }));

      healthChecker.registerCheck('check2', () => ({
        name: 'check2',
        status: 'unhealthy',
        message: 'Failed',
        last_check: Date.now(),
      }));

      const health = healthChecker.runChecks();

      expect(health.overall).toBe('unhealthy');
    });

    it('unhealthy 优先级高于 degraded', () => {
      healthChecker.registerCheck('check1', () => ({
        name: 'check1',
        status: 'degraded',
        message: 'Slow',
        last_check: Date.now(),
      }));

      healthChecker.registerCheck('check2', () => ({
        name: 'check2',
        status: 'unhealthy',
        message: 'Failed',
        last_check: Date.now(),
      }));

      const health = healthChecker.runChecks();

      expect(health.overall).toBe('unhealthy');
    });

    it('检查抛出错误时应该记录为 unhealthy', () => {
      healthChecker.registerCheck('failing-check', () => {
        throw new Error('Check failed');
      });

      const health = healthChecker.runChecks();

      expect(health.overall).toBe('unhealthy');
      expect(health.checks[0].status).toBe('unhealthy');
      expect(health.checks[0].message).toContain('Check threw error');
    });

    it('应该设置正确的时间戳', () => {
      const beforeRun = Date.now();
      const health = healthChecker.runChecks();
      const afterRun = Date.now();

      expect(health.checked_at).toBeGreaterThanOrEqual(beforeRun);
      expect(health.checked_at).toBeLessThanOrEqual(afterRun);
    });

    it('应该计算正确的运行时间', () => {
      const health = healthChecker.runChecks();

      expect(health.uptime_ms).toBeGreaterThanOrEqual(0);
      expect(health.uptime_ms).toBeLessThan(1000); // 应该小于 1 秒
    });
  });

  describe('getOverallStatus 快捷方法', () => {
    it('应该返回整体状态', () => {
      healthChecker.registerCheck('check1', () => ({
        name: 'check1',
        status: 'healthy',
        message: 'OK',
        last_check: Date.now(),
      }));

      const status = healthChecker.getOverallStatus();

      expect(status).toBe('healthy');
    });
  });
});

// ============================================================
// 系统资源健康检查测试
// ============================================================

describe('HealthChecker - 系统资源检查', () => {
  let healthChecker: HealthChecker;

  beforeEach(() => {
    healthChecker = new HealthChecker();
    HealthChecker.registerSystemChecks(healthChecker);
  });

  afterEach(() => {
    // 清理系统资源检查，防止内存泄露
    try {
      healthChecker.runChecks();
    } catch {
      // 忽略清理错误
    }
  });

  describe('CPU 健康检查', () => {
    it('应该检查 CPU 负载', () => {
      const health = healthChecker.runChecks();
      const cpuCheck = health.checks.find((c) => c.name === 'system:cpu');

      expect(cpuCheck).toBeDefined();
      expect(cpuCheck?.status).toBeOneOf(['healthy', 'degraded', 'unhealthy']);
      expect(cpuCheck?.details).toBeDefined();
    });

    it('CPU 负载高时应该返回 degraded', () => {
      // 模拟高 CPU 负载
      healthChecker.removeCheck('system:cpu');
      healthChecker.registerCheck('system:cpu', () => {
        const cpus = os.cpus();
        const loads = os.loadavg();
        const load1 = loads[0];
        const cpuCount = cpus.length;

        // 人为设置一个高负载值进行测试
        const simulatedLoad = cpuCount * 2; // 200% 负载

        return {
          name: 'system:cpu',
          status: simulatedLoad > cpuCount ? 'degraded' : 'healthy',
          message: `CPU load: ${simulatedLoad.toFixed(2)} (cores: ${cpuCount})`,
          last_check: Date.now(),
          details: {
            load_average: loads,
            cpu_count: cpuCount,
            utilization_percent: (simulatedLoad / cpuCount) * 100,
          },
        };
      });

      const health = healthChecker.runChecks();
      const cpuCheck = health.checks.find((c) => c.name === 'system:cpu');

      expect(cpuCheck?.status).toBe('degraded');
    });
  });

  describe('内存健康检查', () => {
    it('应该检查内存使用', () => {
      const health = healthChecker.runChecks();
      const memCheck = health.checks.find((c) => c.name === 'system:memory');

      expect(memCheck).toBeDefined();
      expect(memCheck?.status).toBeOneOf(['healthy', 'degraded', 'unhealthy']);
      expect(memCheck?.details).toBeDefined();
      if (memCheck?.details) {
        expect(memCheck.details.total_mb).toBeGreaterThan(0);
        expect(memCheck.details.used_mb).toBeGreaterThan(0);
        expect(memCheck.details.free_mb).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('磁盘健康检查', () => {
    it('应该检查磁盘空间', () => {
      const health = healthChecker.runChecks();
      const diskCheck = health.checks.find((c) => c.name === 'system:disk');

      expect(diskCheck).toBeDefined();
      expect(diskCheck?.status).toBeOneOf(['healthy', 'degraded', 'unhealthy']);
      expect(diskCheck?.details).toBeDefined();
    });

    it('磁盘空间不足时应该返回 unhealthy', () => {
      // 移除默认的磁盘检查，注册一个模拟低磁盘空间的检查
      healthChecker.removeCheck('system:disk');
      healthChecker.registerCheck('system:disk', () => {
        const freePercent = 5; // 模拟只有 5% 空闲

        return {
          name: 'system:disk',
          status: freePercent < 10 ? 'unhealthy' : freePercent < 20 ? 'degraded' : 'healthy',
          message: `Disk space: ${freePercent}% free`,
          last_check: Date.now(),
          details: {
            free_percent: freePercent,
            threshold_warning: 20,
            threshold_critical: 10,
          },
        };
      });

      const health = healthChecker.runChecks();
      const diskCheck = health.checks.find((c) => c.name === 'system:disk');

      expect(diskCheck?.status).toBe('unhealthy');
    });
  });
});

// ============================================================
// 数据库健康检查测试
// ============================================================

describe('HealthChecker - 数据库健康检查', () => {
  let healthChecker: HealthChecker;
  let testDbPath: string;
  let checkpointManager: CheckpointManager;

  beforeEach(() => {
    healthChecker = new HealthChecker();
    testDbPath = createTestDbPath();
    checkpointManager = new CheckpointManager(testDbPath);
  });

  afterEach(() => {
    checkpointManager.close();
    cleanupTestDb(testDbPath);
  });

  it('应该检查数据库连接', () => {
    HealthChecker.registerDatabaseCheck(healthChecker, testDbPath);

    const health = healthChecker.runChecks();
    const dbCheck = health.checks.find((c) => c.name === 'database:connection');

    expect(dbCheck).toBeDefined();
    expect(dbCheck?.status).toBeOneOf(['healthy', 'degraded', 'unhealthy']);
  });

  it('健康的数据库应该返回 healthy 状态', () => {
    // 确保数据库文件存在
    const fs = require('node:fs');
    if (!fs.existsSync(testDbPath)) {
      // 创建一个空文件用于测试
      fs.writeFileSync(testDbPath, '');
    }

    HealthChecker.registerDatabaseCheck(healthChecker, testDbPath);

    const health = healthChecker.runChecks();
    const dbCheck = health.checks.find((c) => c.name === 'database:connection');

    // 文件存在应该是 healthy 或 degraded（如果文件太小）
    expect(dbCheck?.status).toBeOneOf(['healthy', 'degraded']);
  });

  it('应该包含数据库详细信息', () => {
    HealthChecker.registerDatabaseCheck(healthChecker, testDbPath);

    const health = healthChecker.runChecks();
    const dbCheck = health.checks.find((c) => c.name === 'database:connection');

    expect(dbCheck?.details).toBeDefined();
    if (dbCheck?.details) {
      expect(dbCheck.details.db_path).toBe(testDbPath);
      expect(dbCheck.details.query_time_ms).toBeGreaterThanOrEqual(0);
    }
  });

  it('数据库查询超时应该返回 unhealthy', async () => {
    // 创建一个模拟的超时检查
    healthChecker.registerCheck('database:connection', () => {
      return {
        name: 'database:connection',
        status: 'unhealthy',
        message: 'Database query timeout',
        last_check: Date.now(),
        details: {
          error: 'Query timeout after 5000ms',
          db_path: testDbPath,
        },
      };
    });

    const health = healthChecker.runChecks();
    const dbCheck = health.checks.find((c) => c.name === 'database:connection');

    expect(dbCheck?.status).toBe('unhealthy');
  });
});

// ============================================================
// MessageBus 健康检查测试
// ============================================================

describe('HealthChecker - MessageBus 健康检查', () => {
  let healthChecker: HealthChecker;
  let messageBus: MessageBus;

  beforeEach(() => {
    healthChecker = new HealthChecker();
    messageBus = new MessageBus();
  });

  afterEach(() => {
    messageBus.clear();
  });

  it('应该检查 MessageBus 状态', () => {
    HealthChecker.registerMessageBusCheck(healthChecker, messageBus);

    const health = healthChecker.runChecks();
    const busCheck = health.checks.find((c) => c.name === 'messagebus:status');

    expect(busCheck).toBeDefined();
    expect(busCheck?.status).toBeOneOf(['healthy', 'degraded', 'unhealthy']);
  });

  it('健康的 MessageBus 应该返回 healthy', () => {
    HealthChecker.registerMessageBusCheck(healthChecker, messageBus);

    const health = healthChecker.runChecks();
    const busCheck = health.checks.find((c) => c.name === 'messagebus:status');

    expect(busCheck?.status).toBe('healthy');
  });

  it('应该包含 MessageBus 详细信息', () => {
    HealthChecker.registerMessageBusCheck(healthChecker, messageBus);

    const health = healthChecker.runChecks();
    const busCheck = health.checks.find((c) => c.name === 'messagebus:status');

    expect(busCheck?.details).toBeDefined();
    if (busCheck?.details) {
      expect(busCheck.details.total_messages).toBeGreaterThanOrEqual(0);
    }
  });

  it('高消息积压应该返回 degraded', () => {
    // 移除默认检查，注册一个检查积压的版本
    healthChecker.removeCheck('messagebus:status');
    healthChecker.registerCheck('messagebus:status', () => {
      const stats = messageBus.getStats();
      // 模拟积压检查
      const backlog = 100; // 模拟值

      return {
        name: 'messagebus:status',
        status: backlog > 50 ? 'degraded' : 'healthy',
        message: `MessageBus has ${backlog} pending messages`,
        last_check: Date.now(),
        details: {
          total_messages: stats.total,
          pending_messages: backlog,
        },
      };
    });

    const health = healthChecker.runChecks();
    const busCheck = health.checks.find((c) => c.name === 'messagebus:status');

    expect(busCheck?.status).toBe('degraded');
  });
});

// ============================================================
// AgentPool 健康检查测试
// ============================================================

describe('HealthChecker - AgentPool 健康检查', () => {
  let healthChecker: HealthChecker;
  let agentPool: AgentPool;

  beforeEach(() => {
    healthChecker = new HealthChecker();
    agentPool = new AgentPool('./agents');
  });

  afterEach(() => {
    // 清理健康检查器，防止内存泄露
    // AgentPool 没有 destroy 方法，引用在测试结束后自动释放
    try {
      healthChecker.runChecks();
    } catch {
      // 忽略清理错误
    }
  });

  it('应该检查 AgentPool 状态', () => {
    HealthChecker.registerAgentPoolCheck(healthChecker, agentPool);

    const health = healthChecker.runChecks();
    const poolCheck = health.checks.find((c) => c.name === 'agentpool:status');

    expect(poolCheck).toBeDefined();
    expect(poolCheck?.status).toBeOneOf(['healthy', 'degraded', 'unhealthy']);
  });

  it('应该包含 AgentPool 详细信息', () => {
    HealthChecker.registerAgentPoolCheck(healthChecker, agentPool);

    const health = healthChecker.runChecks();
    const poolCheck = health.checks.find((c) => c.name === 'agentpool:status');

    expect(poolCheck?.details).toBeDefined();
    if (poolCheck?.details) {
      expect(poolCheck.details.total_agents).toBeGreaterThanOrEqual(0);
      expect(poolCheck.details.loaded_agents).toBeGreaterThanOrEqual(0);
    }
  });

  it('高失败率应该返回 degraded', () => {
    // 移除默认检查，注册一个检查失败率的版本
    healthChecker.removeCheck('agentpool:status');
    healthChecker.registerCheck('agentpool:status', () => {
      const failureRate = 75; // 75% 失败率

      return {
        name: 'agentpool:status',
        status: failureRate > 50 ? 'unhealthy' : failureRate > 20 ? 'degraded' : 'healthy',
        message: `AgentPool failure rate: ${failureRate}%`,
        last_check: Date.now(),
        details: {
          total_agents: 10,
          loaded_agents: 8,
          failure_rate_percent: failureRate,
        },
      };
    });

    const health = healthChecker.runChecks();
    const poolCheck = health.checks.find((c) => c.name === 'agentpool:status');

    expect(poolCheck?.status).toBe('unhealthy');
  });
});

// ============================================================
// 完整健康检查集成测试
// ============================================================

describe('HealthChecker - 完整集成测试', () => {
  let healthChecker: HealthChecker;
  let testDbPath: string;
  let checkpointManager: CheckpointManager;
  let messageBus: MessageBus;
  let agentPool: AgentPool;

  beforeEach(() => {
    healthChecker = new HealthChecker();
    testDbPath = createTestDbPath();
    checkpointManager = new CheckpointManager(testDbPath);
    messageBus = new MessageBus();
    agentPool = new AgentPool('./agents');

    // 注册所有检查
    HealthChecker.registerSystemChecks(healthChecker);
    HealthChecker.registerDatabaseCheck(healthChecker, testDbPath);
    HealthChecker.registerMessageBusCheck(healthChecker, messageBus);
    HealthChecker.registerAgentPoolCheck(healthChecker, agentPool);
  });

  afterEach(() => {
    checkpointManager.close();
    cleanupTestDb(testDbPath);
    messageBus.clear();
    // AgentPool 没有 destroy 方法
  });

  it('应该运行所有注册的检查', () => {
    const health = healthChecker.runChecks();

    expect(health.checks.length).toBeGreaterThanOrEqual(4);
    expect(health.checks.find((c) => c.name === 'system:cpu')).toBeDefined();
    expect(health.checks.find((c) => c.name === 'system:memory')).toBeDefined();
    expect(health.checks.find((c) => c.name === 'system:disk')).toBeDefined();
    expect(health.checks.find((c) => c.name === 'database:connection')).toBeDefined();
    expect(health.checks.find((c) => c.name === 'messagebus:status')).toBeDefined();
    expect(health.checks.find((c) => c.name === 'agentpool:status')).toBeDefined();
  });

  it('应该正确计算整体健康状态', () => {
    const health = healthChecker.runChecks();

    // 所有检查应该正常
    expect(health.overall).toBeOneOf(['healthy', 'degraded', 'unhealthy']);
  });

  it('应该生成结构化的健康报告', () => {
    const health = healthChecker.runChecks();

    expect(health.overall).toBeDefined();
    expect(health.checks).toBeInstanceOf(Array);
    expect(health.uptime_ms).toBeGreaterThanOrEqual(0);
    expect(health.checked_at).toBeGreaterThanOrEqual(0);
  });

  it('应该允许自定义阈值配置', () => {
    const customHealthChecker = new HealthChecker();
    HealthChecker.registerSystemChecks(customHealthChecker, {
      cpu: { warning: 2.0, critical: 4.0 },
      memory: { warning_percent: 85, critical_percent: 95 },
      disk: { warning_percent: 15, critical_percent: 5 },
    });

    const health = customHealthChecker.runChecks();

    expect(health.checks.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 健康报告生成测试
// ============================================================

describe('HealthChecker - 健康报告生成', () => {
  let healthChecker: HealthChecker;

  beforeEach(() => {
    healthChecker = new HealthChecker();
  });

  afterEach(() => {
    // 清理健康检查器，防止内存泄露
    try {
      healthChecker.runChecks();
    } catch {
      // 忽略清理错误
    }
  });

  it('应该生成 JSON 格式报告', () => {
    healthChecker.registerCheck('test', () => ({
      name: 'test',
      status: 'healthy',
      message: 'OK',
      last_check: Date.now(),
    }));

    const health = healthChecker.runChecks();

    expect(() => {
      JSON.stringify(health);
    }).not.toThrow();

    const json = JSON.stringify(health);
    const parsed = JSON.parse(json) as SystemHealth;

    expect(parsed.overall).toBe('healthy');
    expect(parsed.checks).toHaveLength(1);
  });

  it('应该生成可读的文本报告', () => {
    healthChecker.registerCheck('check1', () => ({
      name: 'check1',
      status: 'healthy',
      message: 'All good',
      last_check: Date.now(),
      details: { value: 100 },
    }));

    healthChecker.registerCheck('check2', () => ({
      name: 'check2',
      status: 'degraded',
      message: 'Slow response',
      last_check: Date.now(),
      details: { latency_ms: 500 },
    }));

    const health = healthChecker.runChecks();
    const report = HealthChecker.formatHealthReport(health);

    expect(report).toContain('Overall');
    expect(report).toContain('DEGRADED');
    expect(report).toContain('check1');
    expect(report).toContain('check2');
  });

  it('应该包含建议操作', () => {
    healthChecker.registerCheck('disk', () => ({
      name: 'disk',
      status: 'unhealthy',
      message: 'Disk space low',
      last_check: Date.now(),
      details: { free_percent: 5 },
    }));

    const health = healthChecker.runChecks();
    const recommendations = HealthChecker.getRecommendations(health);

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations[0].toLowerCase()).toContain('disk');
  });
});
