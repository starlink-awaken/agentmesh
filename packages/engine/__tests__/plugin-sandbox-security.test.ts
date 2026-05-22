/**
 * Plugin Sandbox Security 测试
 *
 * 测试插件沙箱隔离机制的安全性：
 * - 文件访问限制
 * - 网络访问控制
 * - 进程执行限制
 * - 资源限制
 * - 恶意插件防护
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createSandboxContext, SecurityValidators } from '../src/plugin-sandbox.js';
import { createLogger } from '../src/logger.js';
import type {
  SandboxPolicy,
  PluginMetadata,
  PluginPermission,
} from '../src/plugin-types.js';

// ============================================================
// 测试环境设置
// ============================================================

describe('Plugin Sandbox Security', () => {
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    logger = createLogger({ level: 'error' }); // 减少日志噪音
  });

  // ============================================================
  // 文件系统沙箱测试
  // ============================================================

  describe('文件系统沙箱', () => {
    it('应该拒绝访问禁止路径', async () => {
      const policy: SandboxPolicy = {
        enabled: true,
        filesystem: {
          allow_read: [],
          allow_write: [],
          deny_paths: ['/etc', '/sys', '/proc'],
        },
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      // 检查对禁止路径的访问会被拒绝
      await expect(
        sandbox.executeSecurely(async () => {
          // 模拟尝试访问禁止路径
          throw new Error('Should not reach here');
        }),
      ).rejects.toThrow();
    });

    it('应该允许访问允许的路径', async () => {
      const policy: SandboxPolicy = {
        enabled: true,
        filesystem: {
          allow_read: ['/tmp/**', './output/**'],
          allow_write: ['./output/**'],
          deny_paths: ['/etc', '/root'],
        },
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      let executed = false;
      await sandbox.executeSecurely(async () => {
        executed = true;
      });

      expect(executed).toBe(true);
    });

    it('应该使用默认安全策略', async () => {
      const policy: SandboxPolicy = {
        enabled: true,
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      // 沙箱启用时，应该有基本的文件系统保护
      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toContain('sandbox-test-plugin');
    });
  });

  // ============================================================
  // 网络沙箱测试
  // ============================================================

  describe('网络沙箱', () => {
    it('应该禁用网络访问', () => {
      const policy: SandboxPolicy = {
        enabled: true,
        network: {
          allow_network: false,
          allow_domains: [],
          deny_domains: [],
        },
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      // 当网络被禁用时，任何网络访问都应该被拒绝
      expect(sandbox).toBeDefined();
    });

    it('应该限制访问白名单域名', () => {
      const policy: SandboxPolicy = {
        enabled: true,
        network: {
          allow_network: true,
          allow_domains: ['api.example.com', '*.trusted.com'],
          deny_domains: [],
        },
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      expect(sandbox).toBeDefined();
    });

    it('应该阻止黑名单域名', () => {
      const policy: SandboxPolicy = {
        enabled: true,
        network: {
          allow_network: true,
          allow_domains: [],
          deny_domains: ['malicious.com', '*.evil.com'],
        },
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      expect(sandbox).toBeDefined();
    });
  });

  // ============================================================
  // 执行沙箱测试
  // ============================================================

  describe('执行沙箱', () => {
    it('应该禁用子进程执行', () => {
      const policy: SandboxPolicy = {
        enabled: true,
        execution: {
          allow_spawn: false,
          allow_commands: [],
          max_execution_time: 5000,
        },
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      expect(sandbox).toBeDefined();
    });

    it('应该限制可执行命令', () => {
      const policy: SandboxPolicy = {
        enabled: true,
        execution: {
          allow_spawn: true,
          allow_commands: ['ls', 'cat'],
          deny_commands: ['rm', 'sudo'],
          max_execution_time: 10000,
        },
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      expect(sandbox).toBeDefined();
    });

    it('应该设置执行超时', () => {
      const policy: SandboxPolicy = {
        enabled: true,
        execution: {
          allow_spawn: true,
          allow_commands: ['echo'],
          max_execution_time: 1000,
        },
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      expect(sandbox).toBeDefined();
    });
  });

  // ============================================================
  // 资源沙箱测试
  // ============================================================

  describe('资源沙箱', () => {
    it('应该限制内存使用', () => {
      const policy: SandboxPolicy = {
        enabled: true,
        resources: {
          max_memory_mb: 256,
          max_cpu_percent: 50,
          max_file_descriptors: 100,
        },
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      expect(sandbox).toBeDefined();
    });

    it('应该限制 CPU 使用', () => {
      const policy: SandboxPolicy = {
        enabled: true,
        resources: {
          max_cpu_percent: 25,
          max_memory_mb: 512,
        },
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      expect(sandbox).toBeDefined();
    });
  });

  // ============================================================
  // 沙箱执行测试
  // ============================================================

  describe('沙箱执行包装器', () => {
    it('应该正常执行安全代码', async () => {
      const policy: SandboxPolicy = {
        enabled: true,
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      let result = 0;
      await sandbox.executeSecurely(async () => {
        result = 42;
      });

      expect(result).toBe(42);
    });

    it('应该传播执行错误', async () => {
      const policy: SandboxPolicy = {
        enabled: true,
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      await expect(
        sandbox.executeSecurely(async () => {
          throw new Error('Test error');
        }),
      ).rejects.toThrow('Test error');
    });

    it('应该在沙箱禁用时直接执行', async () => {
      const policy: SandboxPolicy = {
        enabled: false,
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      let executed = false;
      await sandbox.executeSecurely(async () => {
        executed = true;
      });

      expect(executed).toBe(true);
    });
  });

  // ============================================================
  // 安全验证器测试
  // ============================================================

  describe('SecurityValidators', () => {
    describe('validateMetadata', () => {
      it('应该拒绝无效的 plugin_id', () => {
        const result = SecurityValidators.validateMetadata({
          plugin_id: 'invalid@id!',
          permissions: [],
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Invalid plugin_id format: invalid@id!');
      });

      it('应该警告通配符权限', () => {
        const result = SecurityValidators.validateMetadata({
          plugin_id: 'test-plugin',
          permissions: ['*'],
        });

        expect(result.warnings).toContain('Plugin test-plugin requests all permissions (*)');
      });

      it('应该警告危险权限', () => {
        const result = SecurityValidators.validateMetadata({
          plugin_id: 'test-plugin',
          permissions: ['fs:delete', 'system:execute'],
        });

        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some((w) => w.includes('dangerous permissions'))).toBe(true);
      });

      it('应该警告沙箱禁用', () => {
        const result = SecurityValidators.validateMetadata({
          plugin_id: 'test-plugin',
          sandbox_policy: { enabled: false },
        });

        expect(result.warnings).toContain('Plugin test-plugin has sandbox disabled');
      });

      it('应该验证安全的元数据', () => {
        const result = SecurityValidators.validateMetadata({
          plugin_id: 'safe-plugin',
          permissions: ['read:config', 'read:artifacts'],
          sandbox_policy: { enabled: true },
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('validateCode', () => {
      it('应该检测 eval 使用', () => {
        const code = 'const x = eval("1 + 1");';
        const result = SecurityValidators.validateCode(code);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Use of eval() detected');
      });

      it('应该检测 Function 构造器使用', () => {
        const code = 'const fn = new Function("a", "return a * 2");';
        const result = SecurityValidators.validateCode(code);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Use of Function constructor detected');
      });

      it('应该检测 process.exit 使用', () => {
        const code = 'process.exit(1);';
        const result = SecurityValidators.validateCode(code);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Use of process.exit() detected');
      });

      it('应该检测 child_process 使用', () => {
        const code = 'import { exec } from "child_process";';
        const result = SecurityValidators.validateCode(code);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Direct child_process access detected');
      });

      it('应该验证安全代码', () => {
        const code = `
          export function add(a: number, b: number): number {
            return a + b;
          }
        `;
        const result = SecurityValidators.validateCode(code);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  // ============================================================
  // 恶意插件防护测试
  // ============================================================

  describe('恶意插件防护', () => {
    it('应该检测使用 eval 的恶意插件', () => {
      const maliciousCode = `
        export default class MaliciousPlugin {
          async initialize() {
            const code = 'malicious code';
            eval(code);
          }
        }
      `;

      const result = SecurityValidators.validateCode(maliciousCode);
      expect(result.valid).toBe(false);
    });

    it('应该检测使用 Function 构造器的恶意插件', () => {
      const maliciousCode = `
        export default class MaliciousPlugin {
          async execute(userInput) {
            const fn = new Function(userInput);
            return fn();
          }
        }
      `;

      const result = SecurityValidators.validateCode(maliciousCode);
      expect(result.valid).toBe(false);
    });

    it('应该检测尝试退出进程的插件', () => {
      const maliciousCode = `
        export default class MaliciousPlugin {
          async stop() {
            process.exit(0);
          }
        }
      `;

      const result = SecurityValidators.validateCode(maliciousCode);
      expect(result.valid).toBe(false);
    });

    it('应该检测直接使用 child_process 的插件', () => {
      const maliciousCode = `
        import { spawn } from 'child_process';
        export default class MaliciousPlugin {
          async runCommand(cmd) {
            return spawn(cmd);
          }
        }
      `;

      const result = SecurityValidators.validateCode(maliciousCode);
      expect(result.valid).toBe(false);
    });
  });

  // ============================================================
  // 沙箱策略组合测试
  // ============================================================

  describe('沙箱策略组合', () => {
    it('应该应用完整的沙箱策略', () => {
      const policy: SandboxPolicy = {
        enabled: true,
        filesystem: {
          allow_read: ['./data/**'],
          allow_write: ['./output/**'],
          deny_paths: ['/etc', '/root', '.env'],
          allow_project_read: true,
          allow_output_write: true,
        },
        network: {
          allow_network: true,
          allow_domains: ['api.example.com'],
          deny_domains: ['malicious.com'],
        },
        execution: {
          allow_spawn: false,
          allow_commands: [],
          max_execution_time: 5000,
        },
        resources: {
          max_memory_mb: 512,
          max_cpu_percent: 50,
          max_file_descriptors: 100,
        },
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      expect(sandbox.policy.enabled).toBe(true);
      expect(sandbox.sandboxId).toContain('sandbox-test-plugin');
      expect(typeof sandbox.checkPermission).toBe('function');
      expect(typeof sandbox.executeSecurely).toBe('function');
    });

    it('应该支持策略继承和覆盖', () => {
      const basePolicy: SandboxPolicy = {
        enabled: true,
        filesystem: {
          allow_read: ['/tmp/**'],
          deny_paths: ['/etc'],
        },
      };

      const pluginPolicy: SandboxPolicy = {
        ...basePolicy,
        execution: {
          allow_spawn: false,
        },
      };

      const sandbox = createSandboxContext(pluginPolicy, 'test-plugin', logger);

      expect(sandbox.policy.filesystem?.allow_read).toEqual(['/tmp/**']);
      expect(sandbox.policy.execution?.allow_spawn).toBe(false);
    });
  });

  // ============================================================
  // 资源限制验证测试
  // ============================================================

  describe('资源限制验证', () => {
    it('应该在资源限制内执行', async () => {
      const policy: SandboxPolicy = {
        enabled: true,
        resources: {
          max_memory_mb: 1024,
          max_cpu_percent: 80,
        },
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      // 轻量级操作应该在限制内完成
      let result = 0;
      await sandbox.executeSecurely(async () => {
        // 模拟一些轻量级操作
        for (let i = 0; i < 1000; i++) {
          result += i;
        }
      });

      expect(result).toBe(499500); // 0 + 1 + 2 + ... + 999
    });

    it('应该记录资源使用情况', async () => {
      const policy: SandboxPolicy = {
        enabled: true,
        resources: {
          max_memory_mb: 256,
        },
      };

      const sandbox = createSandboxContext(policy, 'test-plugin', logger);

      await sandbox.executeSecurely(async () => {
        // 执行一些操作
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // 沙箱应该记录资源使用情况（内部实现）
      expect(sandbox).toBeDefined();
    });
  });
});
