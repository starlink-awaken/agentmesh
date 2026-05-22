/**
 * MCP Discovery Tests
 *
 * 测试 MCP 动态发现和加载能力
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { MCPDiscovery, type MCPConfig, type MCPDiscoveryOptions } from '../src/integrations/MCPServers.js';
import { ToolRegistry } from '../src/tools/ToolRegistry.js';

const testDir = path.join(import.meta.dir, 'test-mcp-temp');

describe('MCPDiscovery', () => {
  let discovery: MCPDiscovery;

  beforeEach(() => {
    discovery = new MCPDiscovery();
  });

  afterEach(async () => {
    await discovery.destroy();
    // 清理临时配置文件
    const configPaths = [
      path.join(testDir, 'mcp.json'),
      path.join(testDir, '.mcp.json'),
    ];
    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
    }
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }
  });

  describe('构造函数', () => {
    it('should create MCPDiscovery instance with default options', () => {
      expect(discovery).toBeDefined();
      const servers = discovery.getServers();
      expect(servers).toEqual([]);
    });

    it('should create MCPDiscovery instance with custom options', () => {
      const options: MCPDiscoveryOptions = {
        envPrefix: 'CUSTOM_',
        autoConnect: true,
        healthCheckInterval: 60000,
        configPaths: ['/custom/path/mcp.json'],
      };

      const customDiscovery = new MCPDiscovery(options);
      expect(customDiscovery).toBeDefined();
    });
  });

  describe('服务器管理', () => {
    it('should add server configuration', () => {
      const config: MCPConfig = {
        id: 'test-server',
        name: 'Test Server',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        autoConnect: false,
      };

      discovery.addServer(config);
      const servers = discovery.getServers();

      expect(servers).toHaveLength(1);
      expect(servers[0].id).toBe('test-server');
      expect(servers[0].command).toBe('npx');
    });

    it('should get server by id', () => {
      const config: MCPConfig = {
        id: 'my-server',
        name: 'My Server',
        command: 'node',
        args: ['server.js'],
      };

      discovery.addServer(config);
      const server = discovery.getServer('my-server');

      expect(server).toBeDefined();
      expect(server?.name).toBe('My Server');
    });

    it('should return undefined for non-existent server', () => {
      const server = discovery.getServer('non-existent');
      expect(server).toBeUndefined();
    });

    it('should remove server configuration', () => {
      const config: MCPConfig = {
        id: 'remove-me',
        name: 'Remove Me',
        command: 'echo',
      };

      discovery.addServer(config);
      expect(discovery.getServers()).toHaveLength(1);

      const removed = discovery.removeServer('remove-me');
      expect(removed).toBe(true);
      expect(discovery.getServers()).toHaveLength(0);
    });

    it('should return false when removing non-existent server', () => {
      const removed = discovery.removeServer('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('discover 方法', () => {
    it('should discover servers with empty options', async () => {
      const servers = await discovery.discover({ configPaths: [] });
      expect(Array.isArray(servers)).toBe(true);
    }, 10000);

    it('should respect autoConnect option', async () => {
      const config: MCPConfig = {
        id: 'auto-connect-test',
        name: 'Auto Connect Test',
        command: 'echo',
        args: ['test'],
        autoConnect: true,
      };

      discovery.addServer(config);
      const servers = await discovery.discover({ autoConnect: false, configPaths: [] });

      // autoConnect: false 不应该连接服务器
      const connection = discovery.getConnection('auto-connect-test');
      expect(connection).toBeUndefined();
    }, 10000);
  });

  describe('状态管理', () => {
    it('should return correct status with no servers', () => {
      const status = discovery.getStatus();

      expect(status.totalServers).toBe(0);
      expect(status.connected).toBe(0);
      expect(status.disconnected).toBe(0);
      expect(status.error).toBe(0);
    });

    it('should track status after adding servers', () => {
      const config: MCPConfig = {
        id: 'status-test',
        name: 'Status Test',
        command: 'echo',
      };

      discovery.addServer(config);
      const status = discovery.getStatus();

      expect(status.totalServers).toBe(1);
    });
  });

  describe('工具注册', () => {
    it('should register tools to ToolRegistry', async () => {
      const config: MCPConfig = {
        id: 'registry-test',
        name: 'Registry Test',
        command: 'echo',
      };

      discovery.addServer(config);
      // 注意：连接需要 MCP 服务器运行，这里测试不连接的情况
      // 实际的工具注册需要先连接服务器

      const registry = new ToolRegistry();
      // 在没有连接的情况下应该抛出错误
      await expect(
        discovery.registerTools('registry-test', registry)
      ).rejects.toThrow();
    });
  });

  describe('健康检查', () => {
    it('should start and stop health check', () => {
      discovery.startHealthCheck();
      // 再次调用应该不重复启动
      discovery.startHealthCheck();

      discovery.stopHealthCheck();
      // 再次调用应该不报错
      discovery.stopHealthCheck();
    });
  });

  describe('destroy', () => {
    it('should clean up all resources', async () => {
      const config: MCPConfig = {
        id: 'cleanup-test',
        name: 'Cleanup Test',
        command: 'echo',
      };

      discovery.addServer(config);
      await discovery.destroy();

      expect(discovery.getServers()).toHaveLength(0);
    });
  });

  describe('ID 管理', () => {
    it('should accept custom server IDs', () => {
      const config: MCPConfig = {
        id: 'my-custom-id',
        name: 'My Custom Server',
        command: 'echo',
      };

      discovery.addServer(config);
      const server = discovery.getServer('my-custom-id');
      expect(server).toBeDefined();
      expect(server?.name).toBe('My Custom Server');
    });

    it('should handle special characters in IDs', () => {
      const config: MCPConfig = {
        id: 'server_with_underscores',
        name: 'Underscore Server',
        command: 'echo',
      };

      discovery.addServer(config);
      const server = discovery.getServer('server_with_underscores');
      expect(server).toBeDefined();
    });
  });
});

describe('MCPConfig 接口', () => {
  it('should accept valid MCPConfig', () => {
    const config: MCPConfig = {
      id: 'valid-config',
      name: 'Valid Config',
      command: 'npx',
      args: ['-y', 'some-package'],
      env: { API_KEY: 'test-key' },
      autoConnect: true,
    };

    expect(config.id).toBe('valid-config');
    expect(config.command).toBe('npx');
    expect(config.args).toEqual(['-y', 'some-package']);
    expect(config.env).toEqual({ API_KEY: 'test-key' });
    expect(config.autoConnect).toBe(true);
  });

  it('should accept minimal MCPConfig', () => {
    const config: MCPConfig = {
      id: 'minimal',
      name: 'Minimal',
      command: 'echo',
    };

    expect(config.args).toBeUndefined();
    expect(config.env).toBeUndefined();
    expect(config.autoConnect).toBeUndefined();
  });
});

describe('MCPDiscoveryOptions 接口', () => {
  it('should accept valid options', () => {
    const options: MCPDiscoveryOptions = {
      configPaths: ['/path/to/config.json'],
      envPrefix: 'MY_MCP_',
      autoConnect: true,
      healthCheckInterval: 60000,
    };

    expect(options.configPaths).toEqual(['/path/to/config.json']);
    expect(options.envPrefix).toBe('MY_MCP_');
    expect(options.autoConnect).toBe(true);
    expect(options.healthCheckInterval).toBe(60000);
  });

  it('should use default values', () => {
    const options: MCPDiscoveryOptions = {};

    expect(options.configPaths).toBeUndefined();
    expect(options.envPrefix).toBeUndefined();
    expect(options.autoConnect).toBeUndefined();
    expect(options.healthCheckInterval).toBeUndefined();
  });
});
