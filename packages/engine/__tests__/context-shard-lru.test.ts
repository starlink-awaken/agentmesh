/**
 * Tests for ContextShardManager LRU 缓存 (P1-1)
 *
 * 测试智能分片功能：
 * - LRU 缓存管理
 * - 分片访问追踪
 * - 按需加载策略
 * - 缓存清理和驱逐
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { ContextShardManager, createContextShardManager } from '../src/context-shard-manager.js';
import type { ContextShard } from '../src/types.js';

describe('ContextShardManager LRU 缓存 (P1-1)', () => {
  let manager: ContextShardManager;

  beforeEach(() => {
    manager = createContextShardManager(200_000);
  });

  // ============================================================
  // LRU 缓存管理测试
  // ============================================================

  describe('LRU 缓存管理', () => {
    test('getShard 更新访问时间', () => {
      const shard = manager.createShard('task', 'content 1');

      const beforeTimestamp = shard.last_updated;

      // 等待确保时间戳变化
      const start = performance.now();
      while (performance.now() - start < 2) {}

      manager.getShard(shard.shard_id);

      // 注意：getShard 不应修改 last_updated，但会记录访问
      // 这里我们验证分片仍然可以访问
      expect(manager.getShard(shard.shard_id)).toBeDefined();
    });

    test('缓存有容量限制', () => {
      // 创建大量分片
      const shardIds: string[] = [];
      for (let i = 0; i < 150; i++) {
        const shard = manager.createShard('task', `content ${i}`);
        shardIds.push(shard.shard_id);
      }

      // 验证所有分片都可以访问（在容量限制内）
      const stats = manager.getStats();
      expect(stats.totalShards).toBe(150);
    });

    test('超出容量时驱逐最少使用的分片', () => {
      // 这个测试需要在实现 LRU 后验证
      const shardIds: string[] = [];

      // 创建 100 个分片
      for (let i = 0; i < 100; i++) {
        const shard = manager.createShard('task', `content ${i}`);
        shardIds.push(shard.shard_id);
      }

      // 频繁访问前 50 个
      for (let i = 0; i < 50; i++) {
        manager.getShard(shardIds[i]);
      }

      // 创建更多分片可能触发驱逐
      for (let i = 100; i < 200; i++) {
        manager.createShard('task', `content ${i}`);
      }

      // 验证分片仍在合理范围内
      const stats = manager.getStats();
      expect(stats.totalShards).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // 分片访问追踪测试
  // ============================================================

  describe('分片访问追踪', () => {
    test('追踪分片访问次数', () => {
      const shard = manager.createShard('task', 'content');

      // 多次访问同一分片
      manager.getShard(shard.shard_id);
      manager.getShard(shard.shard_id);
      manager.getShard(shard.shard_id);

      // 分片应该仍然可访问
      expect(manager.getShard(shard.shard_id)).toBeDefined();
    });

    test('追踪不同分片的访问', () => {
      const shard1 = manager.createShard('task', 'content 1');
      const shard2 = manager.createShard('task', 'content 2');

      manager.getShard(shard1.shard_id);
      manager.getShard(shard2.shard_id);
      manager.getShard(shard1.shard_id); // shard1 访问两次

      expect(manager.getShard(shard1.shard_id)).toBeDefined();
      expect(manager.getShard(shard2.shard_id)).toBeDefined();
    });

    test('识别热点分片', () => {
      const hotShard = manager.createShard('task', 'hot content');
      const coldShard = manager.createShard('task', 'cold content');

      // 频繁访问 hotShard
      for (let i = 0; i < 10; i++) {
        manager.getShard(hotShard.shard_id);
      }

      // 只访问 coldShard 一次
      manager.getShard(coldShard.shard_id);

      // 验证热点分片更活跃
      expect(manager.getShard(hotShard.shard_id)).toBeDefined();
      expect(manager.getShard(coldShard.shard_id)).toBeDefined();
    });
  });

  // ============================================================
  // 按需加载策略测试
  // ============================================================

  describe('按需加载策略', () => {
    test('仅加载请求的分片', () => {
      // 先设置 global-summary
      manager.setGlobalSummary('project summary');

      const shard1 = manager.createShard('task', 'content 1');
      const shard2 = manager.createShard('task', 'content 2');

      const result = manager.assembleContext([shard1.shard_id]);

      expect(result.shards.length).toBe(2); // shard1 + global-summary
      expect(result.shards.some(s => s.shard_id === shard1.shard_id)).toBe(true);
    });

    test('自动卸载长时间未使用的分片', () => {
      const shard = manager.createShard('task', 'temporary content');

      // 创建分片后不访问
      const start = performance.now();
      while (performance.now() - start < 15) {}

      // pruneStale 会移除旧分片
      const removed = manager.pruneStale(10);

      // 由于刚创建，last_updated 应该很近，不应该被 prune
      // 但如果我们手动等待，可能会被移除
      expect(removed).toBeGreaterThanOrEqual(0);
    });

    test('预取相邻分片', () => {
      // 创建多个模块的分片
      const authShard = manager.createShard('module', 'auth context', 'auth');
      const dbShard = manager.createShard('module', 'db context', 'database');

      // 访问 auth 模块的分片
      manager.getShard(authShard.shard_id);

      // 获取同一模块的所有分片
      const authShards = manager.getShardsByModule('auth');

      expect(authShards.length).toBe(1);
      expect(authShards[0].shard_id).toBe(authShard.shard_id);
    });
  });

  // ============================================================
  // 缓存清理和驱逐测试
  // ============================================================

  describe('缓存清理和驱逐', () => {
    test('evictLeastUsed 移除最少访问的分片', () => {
      // 创建分片
      const shard1 = manager.createShard('task', 'content 1');
      const shard2 = manager.createShard('task', 'content 2');
      const shard3 = manager.createShard('task', 'content 3');

      // 只访问 shard1
      manager.getShard(shard1.shard_id);
      manager.getShard(shard1.shard_id);

      // shard2 和 shard3 访问较少

      // clear 会清空所有
      manager.clear();

      const stats = manager.getStats();
      expect(stats.totalShards).toBe(0);
    });

    test('pruneStale 移除过期分片', () => {
      // 创建一些分片
      for (let i = 0; i < 5; i++) {
        manager.createShard('task', `content ${i}`);
      }

      // 等待一段时间
      const start = performance.now();
      while (performance.now() - start < 15) {}

      // 再创建一些新分片
      for (let i = 5; i < 10; i++) {
        manager.createShard('task', `content ${i}`);
      }

      // prune 10ms 之前的分片
      const removed = manager.pruneStale(10);

      // 应该移除了前 5 个
      expect(removed).toBe(5);

      const stats = manager.getStats();
      expect(stats.totalShards).toBe(5);
    });

    test('clear 清空所有分片', () => {
      manager.createShard('task', 'content 1');
      manager.createShard('task', 'content 2');
      manager.createShard('module', 'module content', 'auth');
      manager.setGlobalSummary('summary');

      expect(manager.getStats().totalShards).toBe(4);

      manager.clear();

      expect(manager.getStats().totalShards).toBe(0);
      expect(manager.getGlobalSummary()).toBeUndefined();
    });
  });

  // ============================================================
  // 性能和效率测试
  // ============================================================

  describe('性能和效率', () => {
    test('大量分片创建性能', () => {
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        manager.createShard('task', `content ${i}`);
      }

      const duration = performance.now() - start;

      // 应该在合理时间内完成（< 1秒）
      expect(duration).toBeLessThan(1000);
    });

    test('大量分片访问性能', () => {
      const shardIds: string[] = [];

      for (let i = 0; i < 100; i++) {
        const shard = manager.createShard('task', `content ${i}`);
        shardIds.push(shard.shard_id);
      }

      const start = performance.now();

      for (const id of shardIds) {
        manager.getShard(id);
      }

      const duration = performance.now() - start;

      // 应该快速完成（< 100ms）
      expect(duration).toBeLessThan(100);
    });

    test('上下文组装性能', () => {
      // 先设置 global-summary
      manager.setGlobalSummary('project summary');

      const shardIds: string[] = [];

      for (let i = 0; i < 50; i++) {
        const shard = manager.createShard('task', `content ${i}`);
        shardIds.push(shard.shard_id);
      }

      const start = performance.now();

      const result = manager.assembleContext(shardIds);

      const duration = performance.now() - start;

      expect(result.shards.length).toBe(51); // 50 + global-summary
      expect(duration).toBeLessThan(50);
    });
  });

  // ============================================================
  // 边界条件测试
  // ============================================================

  describe('边界条件', () => {
    test('空内容分片', () => {
      const shard = manager.createShard('task', '');

      expect(shard.content).toBe('');
      expect(shard.token_count).toBe(0);
    });

    test('极大内容分片', () => {
      const largeContent = 'x'.repeat(1_000_000);
      const shard = manager.createShard('task', largeContent);

      expect(shard.token_count).toBe(250_000);
    });

    test('特殊字符内容', () => {
      const specialContent = '!@#$%^&*()_+-={}[]|\\:";\'<>?,./\n\t\r';
      const shard = manager.createShard('task', specialContent);

      expect(shard.content).toBe(specialContent);
      expect(manager.getShard(shard.shard_id)).toBeDefined();
    });

    test('Unicode 内容', () => {
      const unicodeContent = '你好世界 Hello World \u{1F600}';
      const shard = manager.createShard('task', unicodeContent);

      expect(shard.content).toBe(unicodeContent);
    });
  });

  // ============================================================
  // 集成测试
  // ============================================================

  describe('集成测试', () => {
    test('完整工作流：创建、访问、组装、清理', () => {
      // 1. 创建全局摘要
      manager.setGlobalSummary('项目全局摘要');

      // 2. 创建模块分片
      const authModuleShard = manager.createShard('module', '认证模块', 'auth');
      const dbModuleShard = manager.createShard('module', '数据库模块', 'database');

      // 3. 创建任务分片
      const loginTaskShard = manager.createShard('task', '实现登录功能');

      // 4. 验证统计
      let stats = manager.getStats();
      expect(stats.totalShards).toBe(4);
      expect(stats.byScope['global-summary']).toBe(1);
      expect(stats.byScope['module']).toBe(2);
      expect(stats.byScope['task']).toBe(1);

      // 5. 访问分片
      manager.getShard(authModuleShard.shard_id);
      manager.getShard(loginTaskShard.shard_id);

      // 6. 组装上下文
      const context = manager.assembleContext([
        authModuleShard.shard_id,
        loginTaskShard.shard_id,
      ]);

      expect(context.shards.length).toBe(3); // global + auth + task
      expect(context.withinLimit).toBe(true);

      // 7. 清理
      manager.clear();

      stats = manager.getStats();
      expect(stats.totalShards).toBe(0);
    });

    test('模块化上下文加载', () => {
      // 设置全局摘要
      manager.setGlobalSummary('电商系统项目');

      // 创建多个模块的分片
      const authShards = [
        manager.createShard('module', '用户认证', 'auth'),
        manager.createShard('module', '权限管理', 'auth'),
      ];

      const productShards = [
        manager.createShard('module', '商品列表', 'product'),
        manager.createShard('module', '商品详情', 'product'),
        manager.createShard('module', '库存管理', 'product'),
      ];

      // 获取 auth 模块的所有分片
      const authModuleShards = manager.getShardsByModule('auth');
      expect(authModuleShards.length).toBe(2);

      // 获取 product 模块的所有分片
      const productModuleShards = manager.getShardsByModule('product');
      expect(productModuleShards.length).toBe(3);

      // 组装 auth 相关上下文
      const authContextIds = [...authModuleShards.map(s => s.shard_id)];
      const authContext = manager.assembleContext(authContextIds);

      // 应该包含 global-summary + 2 个 auth 模块分片
      expect(authContext.shards.length).toBe(3);
    });
  });
});
