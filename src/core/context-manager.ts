import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { AgentMessage, ContextRef } from '../types/index.js';
import { vectorStore } from './vector-store.js';

interface ContextData {
  shared_space_id: string;
  messages: AgentMessage[];
  artifacts: Map<string, string>;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class ContextManager {
  private memoryCache: Map<string, ContextData> = new Map();
  private baseDir: string;

  constructor(baseDir: string = './data/tasks') {
    this.baseDir = baseDir;
  }

  /**
   * 创建共享空间
   */
  async createSharedSpace(metadata: Record<string, unknown> = {}): Promise<string> {
    const spaceId = uuidv4();
    const context: ContextData = {
      shared_space_id: spaceId,
      messages: [],
      artifacts: new Map(),
      metadata,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // L1: 内存缓存
    this.memoryCache.set(spaceId, context);

    // L2: 文件系统持久化
    await this.persistToFile(spaceId, context);

    return spaceId;
  }

  /**
   * 获取共享空间
   */
  async getSharedSpace(spaceId: string): Promise<ContextData | null> {
    // L1: 先从内存获取
    if (this.memoryCache.has(spaceId)) {
      return this.memoryCache.get(spaceId)!;
    }

    // L2: 从文件系统加载
    try {
      const context = await this.loadFromFile(spaceId);
      if (context) {
        this.memoryCache.set(spaceId, context);
        return context;
      }
    } catch (error) {
      console.error(`[ContextManager] Failed to load context: ${spaceId}`, error);
    }

    return null;
  }

  /**
   * 添加消息到共享空间
   */
  async addMessage(spaceId: string, message: AgentMessage): Promise<void> {
    const context = await this.getSharedSpace(spaceId);
    if (!context) {
      throw new Error(`Shared space not found: ${spaceId}`);
    }

    context.messages.push(message);
    context.updatedAt = Date.now();

    // 更新内存缓存
    this.memoryCache.set(spaceId, context);

    // 持久化到文件系统
    await this.persistToFile(spaceId, context);

    // L3: 添加到向量数据库（异步，不阻塞）
    if (vectorStore.isAvailable()) {
      vectorStore.addMessage(spaceId, message).catch(err => {
        console.error('[ContextManager] Vector store add failed:', err);
      });
    }
  }

  /**
   * 获取消息历史
   */
  async getMessages(spaceId: string, limit?: number): Promise<AgentMessage[]> {
    const context = await this.getSharedSpace(spaceId);
    if (!context) {
      return [];
    }

    const messages = context.messages;
    return limit ? messages.slice(-limit) : messages;
  }

  /**
   * 添加产物文件
   */
  async addArtifact(spaceId: string, filename: string, content: string): Promise<string> {
    const context = await this.getSharedSpace(spaceId);
    if (!context) {
      throw new Error(`Shared space not found: ${spaceId}`);
    }

    const artifactsDir = join(this.baseDir, spaceId, 'artifacts');
    await fs.mkdir(artifactsDir, { recursive: true });

    const filePath = join(artifactsDir, filename);
    await fs.writeFile(filePath, content, 'utf-8');

    context.artifacts.set(filename, filePath);
    context.updatedAt = Date.now();

    // 更新内存缓存
    this.memoryCache.set(spaceId, context);

    // 持久化
    await this.persistToFile(spaceId, context);

    return filePath;
  }

  /**
   * 获取产物文件
   */
  async getArtifact(spaceId: string, filename: string): Promise<string | null> {
    const context = await this.getSharedSpace(spaceId);
    if (!context) {
      return null;
    }

    const filePath = context.artifacts.get(filename);
    if (!filePath) {
      return null;
    }

    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * 持久化到文件系统
   */
  private async persistToFile(spaceId: string, context: ContextData): Promise<void> {
    const dir = join(this.baseDir, spaceId);
    await fs.mkdir(dir, { recursive: true });

    // 序列化 context（Map 需要转换）
    const serialized = {
      shared_space_id: context.shared_space_id,
      messages: context.messages,
      artifacts: Object.fromEntries(context.artifacts),
      metadata: context.metadata,
      createdAt: context.createdAt,
      updatedAt: context.updatedAt
    };

    await fs.writeFile(
      join(dir, 'context.json'),
      JSON.stringify(serialized, null, 2),
      'utf-8'
    );
  }

  /**
   * 从文件系统加载
   */
  private async loadFromFile(spaceId: string): Promise<ContextData | null> {
    const filePath = join(this.baseDir, spaceId, 'context.json');

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      return {
        ...parsed,
        artifacts: new Map(Object.entries(parsed.artifacts || {}))
      };
    } catch {
      return null;
    }
  }

  /**
   * 创建 ContextRef
   */
  async createContextRef(spaceId: string): Promise<ContextRef> {
    return {
      shared_space_id: spaceId
    };
  }
}

export const contextManager = new ContextManager();
