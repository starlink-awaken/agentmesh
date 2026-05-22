/**
 * Honeycomb v2 - Capability Discovery
 *
 * 能力发现机制，负责：
 * - 从 AgentPool 发现和收集能力
 * - 按类型、标签、等级等维度过滤能力
 * - 缓存发现结果以提高性能
 * - 提供能力查询接口
 */

import type {
  CapabilityDefinition,
  CapabilityType,
  CapabilityLevel,
  AgentCapabilities,
} from './capability-schema.js';
import type { AgentDefinition } from './types.js';
import { validateAgentCapabilities } from './capability-validator.js';

// ============================================================
// 发现结果类型
// ============================================================

/**
 * 能力发现条目 - 带有来源 Agent 信息的能力定义
 */
export interface DiscoveredCapability {
  /** 能力定义 */
  capability: CapabilityDefinition;
  /** 来源 Agent 名称 */
  agentName: string;
  /** 来源 Agent 层级 */
  agentLayer: string;
  /** 来源 Agent 类型 */
  agentType: string;
  /** 发现时间戳 */
  discoveredAt: number;
}

/**
 * 能力索引 - 按不同维度索引的能力集合
 */
interface CapabilityIndex {
  /** 按 ID 索引 */
  byId: Map<string, DiscoveredCapability>;
  /** 按类型索引 */
  byType: Map<CapabilityType, DiscoveredCapability[]>;
  /** 按等级索引 */
  byLevel: Map<CapabilityLevel, DiscoveredCapability[]>;
  /** 按 Agent 索引 */
  byAgent: Map<string, DiscoveredCapability[]>;
  /** 按标签索引 */
  byTag: Map<string, DiscoveredCapability[]>;
}

/**
 * 发现配置
 */
export interface DiscoveryConfig {
  /** 是否启用缓存 */
  enableCache?: boolean;
  /** 缓存过期时间（毫秒） */
  cacheTtl?: number;
  /** 是否验证能力定义 */
  validate?: boolean;
}

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfig = {
  enableCache: true,
  cacheTtl: 60000, // 1 分钟
  validate: true,
};

// ============================================================
// CapabilityDiscovery 类
// ============================================================

export class CapabilityDiscovery {
  /** 发现配置 */
  private config: DiscoveryConfig;

  /** 能力索引 */
  private index: CapabilityIndex;

  /** 缓存时间戳 */
  private cacheTimestamp: number;

  /** 所有已发现的 Agent 能力 */
  private agentCapabilities: Map<string, AgentCapabilities>;

  constructor(config: DiscoveryConfig = {}) {
    this.config = { ...DEFAULT_DISCOVERY_CONFIG, ...config };
    this.index = this.createEmptyIndex();
    this.cacheTimestamp = 0;
    this.agentCapabilities = new Map();
  }

  // ----------------------------------------------------------
  // 索引管理
  // ----------------------------------------------------------

  private createEmptyIndex(): CapabilityIndex {
    return {
      byId: new Map(),
      byType: new Map(),
      byLevel: new Map(),
      byAgent: new Map(),
      byTag: new Map(),
    };
  }

  /**
   * 清空索引
   */
  private clearIndex(): void {
    this.index = this.createEmptyIndex();
  }

  /**
   * 向索引添加能力
   */
  private indexCapability(
    capability: CapabilityDefinition,
    agentName: string,
    agentLayer: string,
    agentType: string,
  ): void {
    const discovered: DiscoveredCapability = {
      capability,
      agentName,
      agentLayer,
      agentType,
      discoveredAt: Date.now(),
    };

    // 按 ID 索引
    this.index.byId.set(capability.id, discovered);

    // 按类型索引
    if (!this.index.byType.has(capability.type)) {
      this.index.byType.set(capability.type, []);
    }
    this.index.byType.get(capability.type)!.push(discovered);

    // 按等级索引
    if (!this.index.byLevel.has(capability.level)) {
      this.index.byLevel.set(capability.level, []);
    }
    this.index.byLevel.get(capability.level)!.push(discovered);

    // 按 Agent 索引
    if (!this.index.byAgent.has(agentName)) {
      this.index.byAgent.set(agentName, []);
    }
    this.index.byAgent.get(agentName)!.push(discovered);

    // 按标签索引
    if (capability.tags) {
      for (const tag of capability.tags) {
        if (!this.index.byTag.has(tag)) {
          this.index.byTag.set(tag, []);
        }
        this.index.byTag.get(tag)!.push(discovered);
      }
    }
  }

  // ----------------------------------------------------------
  // 发现方法
  // ----------------------------------------------------------

  /**
   * 从 AgentDefinition 列表发现能力
   */
  discoverFromAgents(agents: AgentDefinition[]): void {
    this.clearIndex();
    this.agentCapabilities.clear();

    for (const agent of agents) {
      this.discoverFromAgent(agent);
    }

    this.cacheTimestamp = Date.now();
  }

  /**
   * 从单个 AgentDefinition 发现能力
   */
  discoverFromAgent(agent: AgentDefinition): void {
    const agentCapabilities = this.extractCapabilitiesFromAgent(agent);

    if (this.config.validate) {
      const result = validateAgentCapabilities(agentCapabilities);
      if (!result.valid) {
        console.warn(
          `[CapabilityDiscovery] Agent "${agent.name}" has invalid capabilities:`,
          result.errors,
        );
      }
      if (result.warnings.length > 0) {
        console.warn(
          `[CapabilityDiscovery] Agent "${agent.name}" capability warnings:`,
          result.warnings,
        );
      }
    }

    this.agentCapabilities.set(agent.name, agentCapabilities);

    // 索引所有能力
    for (const capability of agentCapabilities.capabilities) {
      this.indexCapability(
        capability,
        agent.name,
        agent.layer,
        agent.type,
      );
    }
  }

  /**
   * 从 AgentDefinition 提取能力声明
   */
  private extractCapabilitiesFromAgent(agent: AgentDefinition): AgentCapabilities {
    // 基础能力：从 tools/capabilities 字段提取
    const baseCapabilities: CapabilityDefinition[] = [];

    // 如果 Agent 声明了 capabilities，使用它
    if (agent.capabilities && agent.capabilities.length > 0) {
      // 每个 capability 字符串转换为基础能力定义
      for (const capId of agent.capabilities) {
        baseCapabilities.push({
          id: `${agent.name}-${capId}`,
          type: this.inferCapabilityType(capId, agent.layer),
          name: capId,
          description: `Capability to ${capId} (${agent.name})`,
          level: 'intermediate',
          tags: [this.inferTagFromLayer(agent.layer)],
        });
      }
    }

    // 如果 Agent 有 tools，也为 tools 创建能力
    if (agent.tools && agent.tools.length > 0) {
      for (const tool of agent.tools) {
        // 避免重复
        if (!baseCapabilities.some((c) => c.id === `${agent.name}-${tool}`)) {
          baseCapabilities.push({
            id: `${agent.name}-${tool}`,
            type: this.inferCapabilityType(tool, agent.layer),
            name: tool,
            description: `Tool: ${tool} (${agent.name})`,
            level: 'basic',
            tags: ['tool', this.inferTagFromLayer(agent.layer)],
          });
        }
      }
    }

    return {
      agentName: agent.name,
      agentVersion: '1.0.0',
      defaultLevel: 'intermediate',
      capabilities: baseCapabilities,
    };
  }

  /**
   * 从工具名称和能力 ID 推断能力类型
   */
  private inferCapabilityType(name: string, layer: string): CapabilityType {
    const lowerName = name.toLowerCase();

    // 分析类关键词
    if (lowerName.includes('analysis') || lowerName.includes('analyze') || lowerName.includes('check')) {
      return 'analysis';
    }
    // 生成类关键词
    if (lowerName.includes('generate') || lowerName.includes('create') || lowerName.includes('write')) {
      return 'generation';
    }
    // 验证类关键词
    if (lowerName.includes('validate') || lowerName.includes('verify') || lowerName.includes('review')) {
      return 'validation';
    }
    // 转换类关键词
    if (lowerName.includes('transform') || lowerName.includes('convert') || lowerName.includes('translate')) {
      return 'transformation';
    }
    // 执行类关键词
    if (lowerName.includes('execute') || lowerName.includes('run') || lowerName.includes('call')) {
      return 'execution';
    }
    // 监控类关键词
    if (lowerName.includes('monitor') || lowerName.includes('track') || lowerName.includes('observe')) {
      return 'monitoring';
    }

    // 根据层级推断
    switch (layer) {
      case 'L1':
        return 'analysis';
      case 'L2':
        return 'coordination';
      case 'L3':
        return 'execution';
      case 'L4':
        return 'validation';
      case 'governance':
        return 'monitoring';
      default:
        return 'custom';
    }
  }

  /**
   * 从 Agent 层级推断标签
   */
  private inferTagFromLayer(layer: string): string {
    switch (layer) {
      case 'L1':
        return 'research';
      case 'L2':
        return 'decision';
      case 'L3':
        return 'execution';
      case 'L4':
        return 'feedback';
      case 'governance':
        return 'governance';
      default:
        return 'general';
    }
  }

  // ----------------------------------------------------------
  // 查询方法
  // ----------------------------------------------------------

  /**
   * 查找所有已发现的能力
   */
  findAll(): DiscoveredCapability[] {
    this.checkCacheFresh();
    return Array.from(this.index.byId.values());
  }

  /**
   * 按 ID 查找能力
   */
  findById(id: string): DiscoveredCapability | undefined {
    this.checkCacheFresh();
    return this.index.byId.get(id);
  }

  /**
   * 按类型查找能力
   */
  findByType(type: CapabilityType): DiscoveredCapability[] {
    this.checkCacheFresh();
    return this.index.byType.get(type) || [];
  }

  /**
   * 按等级查找能力
   */
  findByLevel(level: CapabilityLevel): DiscoveredCapability[] {
    this.checkCacheFresh();
    return this.index.byLevel.get(level) || [];
  }

  /**
   * 按 Agent 名称查找能力
   */
  findByAgent(agentName: string): DiscoveredCapability[] {
    this.checkCacheFresh();
    return this.index.byAgent.get(agentName) || [];
  }

  /**
   * 按标签查找能力
   */
  findByTag(tag: string): DiscoveredCapability[] {
    this.checkCacheFresh();
    return this.index.byTag.get(tag) || [];
  }

  /**
   * 按多个标签查找能力（匹配任一标签）
   */
  findByTags(tags: string[], matchAll = false): DiscoveredCapability[] {
    this.checkCacheFresh();

    if (matchAll) {
      // 匹配所有标签
      const results: DiscoveredCapability[] = [];
      for (const tag of tags) {
        const tagResults = this.index.byTag.get(tag) || [];
        for (const cap of tagResults) {
          const capTags = cap.capability.tags || [];
          if (tags.every((t) => capTags.includes(t)) && !results.includes(cap)) {
            results.push(cap);
          }
        }
      }
      return results;
    } else {
      // 匹配任一标签
      const results = new Map<string, DiscoveredCapability>();
      for (const tag of tags) {
        const tagResults = this.index.byTag.get(tag) || [];
        for (const cap of tagResults) {
          results.set(cap.capability.id, cap);
        }
      }
      return Array.from(results.values());
    }
  }

  /**
   * 获取所有已发现的 Agent 名称
   */
  getDiscoveredAgents(): string[] {
    this.checkCacheFresh();
    return Array.from(this.index.byAgent.keys());
  }

  /**
   * 获取 Agent 的能力声明
   */
  getAgentCapabilities(agentName: string): AgentCapabilities | undefined {
    return this.agentCapabilities.get(agentName);
  }

  // ----------------------------------------------------------
  // 缓存管理
  // ----------------------------------------------------------

  /**
   * 检查缓存是否新鲜，如果过期则清空
   */
  private checkCacheFresh(): void {
    if (!this.config.enableCache) {
      return;
    }

    const now = Date.now();
    const age = now - this.cacheTimestamp;

    if (age > (this.config.cacheTtl || 60000)) {
      // 缓存过期，但不清空数据，只更新时间戳
      // 实际应用中可能需要重新扫描 Agent
      this.cacheTimestamp = now;
    }
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.clearIndex();
    this.agentCapabilities.clear();
    this.cacheTimestamp = 0;
  }

  /**
   * 获取缓存状态
   */
  getCacheStatus(): {
    enabled: boolean;
    timestamp: number;
    age: number;
    capabilityCount: number;
    agentCount: number;
  } {
    const now = Date.now();
    return {
      enabled: this.config.enableCache ?? false,
      timestamp: this.cacheTimestamp,
      age: this.cacheTimestamp > 0 ? now - this.cacheTimestamp : 0,
      capabilityCount: this.index.byId.size,
      agentCount: this.index.byAgent.size,
    };
  }

  // ----------------------------------------------------------
  // 统计方法
  // ----------------------------------------------------------

  /**
   * 获取能力统计信息
   */
  getStatistics(): {
    totalCapabilities: number;
    capabilitiesByType: Record<string, number>;
    capabilitiesByLevel: Record<string, number>;
    capabilitiesByAgent: Record<string, number>;
    totalTags: number;
    topTags: Array<{ tag: string; count: number }>;
  } {
    const capabilities = this.findAll();

    const byType: Record<string, number> = {};
    const byLevel: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    const tagCounts = new Map<string, number>();

    for (const disc of capabilities) {
      // 按类型统计
      byType[disc.capability.type] = (byType[disc.capability.type] || 0) + 1;

      // 按等级统计
      byLevel[disc.capability.level] = (byLevel[disc.capability.level] || 0) + 1;

      // 按 Agent 统计
      byAgent[disc.agentName] = (byAgent[disc.agentName] || 0) + 1;

      // 按标签统计
      if (disc.capability.tags) {
        for (const tag of disc.capability.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }
    }

    // 获取 Top 标签
    const topTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalCapabilities: capabilities.length,
      capabilitiesByType: byType,
      capabilitiesByLevel: byLevel,
      capabilitiesByAgent: byAgent,
      totalTags: tagCounts.size,
      topTags,
    };
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建能力发现器
 */
export function createCapabilityDiscovery(
  config?: DiscoveryConfig,
): CapabilityDiscovery {
  return new CapabilityDiscovery(config);
}
