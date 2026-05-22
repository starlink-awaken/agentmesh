/**
 * ReasoningBank - 推理记忆银行
 *
 * 从成功和失败经验中提炼可泛化的推理策略
 * 源自 ReasoningBank 论文：让AI智能体从成败经验中自我进化
 */
import type {
  ReasoningMemory,
  TaskResult,
  RetrievedContext,
} from './types.js';
import { SelfJudge } from './SelfJudge.js';
import type { StorageAdapter } from './adapters/FileStorageAdapter.js';

/**
 * Embedding Provider 接口
 */
export type EmbeddingProvider = (text: string) => Promise<number[]>;

/**
 * ReasoningBank 配置
 */
export interface ReasoningBankConfig {
  maxMemories?: number;
  embeddingEnabled?: boolean;
  embeddingProvider?: EmbeddingProvider;
  judgeConfig?: {
    judgeLLM?: string;
    enableRefinement?: boolean;
  };
  /**
   * 存储适配器（可选）
   * 如果提供，则支持持久化存储
   */
  storageAdapter?: StorageAdapter<ReasoningMemory>;
  /**
   * 是否在启动时自动恢复
   * @default false
   */
  autoRestore?: boolean;
  /**
   * 是否在每次变更后自动持久化
   * @default false
   */
  autoPersist?: boolean;
}

export class ReasoningBank {
  private memories: Map<string, ReasoningMemory> = new Map();
  private selfJudge: SelfJudge;
  private config: ReasoningBankConfig;
  private storageAdapter?: StorageAdapter<ReasoningMemory>;
  private autoPersist: boolean;

  constructor(config?: ReasoningBankConfig) {
    this.config = {
      maxMemories: config?.maxMemories || 10000,
      embeddingEnabled: config?.embeddingEnabled || false,
      embeddingProvider: config?.embeddingProvider,
      judgeConfig: config?.judgeConfig,
      storageAdapter: config?.storageAdapter,
      autoRestore: config?.autoRestore,
      autoPersist: config?.autoPersist,
    };

    this.selfJudge = new SelfJudge(config?.judgeConfig);
    this.storageAdapter = config?.storageAdapter;
    this.autoPersist = config?.autoPersist ?? false;

    // 如果配置了自动恢复，在构造时恢复数据
    if (config?.autoRestore && this.storageAdapter) {
      this.restore().catch(err => {
        console.warn('[ReasoningBank] Failed to auto-restore:', err);
      });
    }
  }

  /**
   * 检索记忆 - 闭环学习第一步
   * 使用嵌入相似性搜索找到最相关的历史经验
   */
  async retrieve(query: string, limit = 5): Promise<ReasoningMemory[]> {
    const allMemories = Array.from(this.memories.values());

    if (!this.config.embeddingEnabled || allMemories.length === 0) {
      // 简单文本匹配（无嵌入时）
      return this.simpleSearch(query, limit);
    }

    // 嵌入相似性搜索（需要embedding实现）
    return this.embeddingSearch(query, limit);
  }

  /**
   * 语义搜索 - 使用向量嵌入进行语义相似度检索
   *
   * 与 retrieve() 的区别：
   * - semanticSearch 专门使用向量嵌入进行语义匹配
   * - 如果没有 embedding provider，会抛出错误
   * - 返回相似度分数
   *
   * @param query - 查询文本
   * @param limit - 返回结果数量限制
   * @returns 包含相似度分数的记忆数组
   */
  async semanticSearch(
    query: string,
    limit = 10
  ): Promise<Array<{ memory: ReasoningMemory; similarity: number }>> {
    // 检查是否有 embedding provider
    if (!this.config.embeddingProvider) {
      throw new Error(
        'Semantic search requires an embedding provider. ' +
        'Please configure embeddingProvider in ReasoningBankConfig.'
      );
    }

    // 获取查询的嵌入向量
    const queryEmbedding = await this.config.embeddingProvider(query);

    if (!queryEmbedding) {
      throw new Error('Failed to generate embedding for query');
    }

    // 计算与所有记忆的相似度
    const results: Array<{ memory: ReasoningMemory; similarity: number }> = [];

    for (const memory of this.memories.values()) {
      // 获取记忆的嵌入向量（从扩展字段）
      const memoryWithEmbedding = memory as ReasoningMemory & { embedding?: number[] };
      const memoryEmbedding = memoryWithEmbedding.embedding;

      if (!memoryEmbedding) {
        // 如果记忆没有嵌入，跳过
        continue;
      }

      // 计算余弦相似度
      const similarity = this.cosineSimilarity(queryEmbedding, memoryEmbedding);
      results.push({ memory, similarity });
    }

    // 按相似度排序
    results.sort((a, b) => b.similarity - a.similarity);

    // 更新访问计数
    for (const result of results.slice(0, limit)) {
      result.memory.accessCount++;
    }

    return results.slice(0, limit);
  }

  /**
   * 为记忆添加嵌入向量
   *
   * 在调用 semanticSearch 之前，需要为记忆添加嵌入向量
   * 此方法会自动为记忆生成并存储嵌入向量
   *
   * @param memory - 要添加嵌入的记忆
   */
  async addEmbedding(memory: ReasoningMemory): Promise<void> {
    // 检查是否有 embedding provider
    if (!this.config.embeddingProvider) {
      throw new Error(
        'addEmbedding requires an embedding provider. ' +
        'Please configure embeddingProvider in ReasoningBankConfig.'
      );
    }

    // 组合记忆的文本内容用于生成嵌入
    const textToEmbed = [
      memory.title,
      memory.description,
      memory.content,
      ...memory.tags,
    ].join(' | ');

    // 生成嵌入向量
    const embedding = await this.config.embeddingProvider(textToEmbed);

    if (!embedding) {
      throw new Error('Failed to generate embedding for memory');
    }

    // 将嵌入向量添加到记忆对象
    const memoryWithEmbedding = memory as ReasoningMemory & { embedding: number[] };
    memoryWithEmbedding.embedding = embedding;
  }

  /**
   * 批量为记忆添加嵌入向量
   *
   * @param memories - 要添加嵌入的记忆数组
   */
  async addEmbeddings(memories: ReasoningMemory[]): Promise<void> {
    for (const memory of memories) {
      await this.addEmbedding(memory);
    }
  }

  /**
   * 简单文本搜索
   */
  private simpleSearch(query: string, limit: number): ReasoningMemory[] {
    const queryLower = query.toLowerCase();
    const scored: Array<{ memory: ReasoningMemory; score: number }> = [];

    for (const memory of this.memories.values()) {
      let score = 0;

      // 标题匹配
      if (memory.title.toLowerCase().includes(queryLower)) {
        score += 10;
      }

      // 描述匹配
      if (memory.description.toLowerCase().includes(queryLower)) {
        score += 5;
      }

      // 内容匹配
      if (memory.content.toLowerCase().includes(queryLower)) {
        score += 3;
      }

      // 标签匹配
      for (const tag of memory.tags) {
        if (tag.toLowerCase().includes(queryLower)) {
          score += 2;
        }
      }

      // 访问次数加权
      score += Math.log(memory.accessCount + 1);

      if (score > 0) {
        scored.push({ memory, score });
      }
    }

    // 按分数排序
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(s => {
      // 更新访问统计
      const mem = s.memory;
      mem.accessCount++;
      return mem;
    });
  }

  /**
   * 嵌入搜索 - 使用向量相似度查找相关记忆
   */
  private async embeddingSearch(query: string, limit: number): Promise<ReasoningMemory[]> {
    // 1. 获取查询的嵌入向量
    const queryEmbedding = await this.getEmbedding(query);

    // 2. 如果无法获取嵌入向量，回退到简单搜索
    if (!queryEmbedding) {
      return this.simpleSearch(query, limit);
    }

    // 3. 计算与所有记忆的相似度
    const scored: Array<{ memory: ReasoningMemory; score: number }> = [];

    for (const memory of this.memories.values()) {
      // 如果记忆没有嵌入，使用文本匹配作为后备
      const memoryEmbedding = (memory as ReasoningMemory & { embedding?: number[] }).embedding;

      if (!memoryEmbedding) {
        // 无嵌入时使用简单匹配
        const textScore = this.computeTextScore(memory, query);
        scored.push({ memory, score: textScore });
        continue;
      }

      // 计算余弦相似度
      const score = this.cosineSimilarity(queryEmbedding, memoryEmbedding);
      scored.push({ memory, score });
    }

    // 4. 按相似度排序
    scored.sort((a, b) => b.score - a.score);

    // 5. 返回 top N 结果并更新访问计数
    return scored.slice(0, limit).map(s => {
      s.memory.accessCount++;
      return s.memory;
    });
  }

  /**
   * 获取文本的嵌入向量
   */
  private async getEmbedding(text: string): Promise<number[] | null> {
    // 如果配置了 embedding provider，使用它
    if (this.config.embeddingProvider) {
      try {
        return await this.config.embeddingProvider(text);
      } catch (error) {
        console.warn('Embedding provider failed, falling back to text search:', error);
        return null;
      }
    }

    // 无 embedding provider 时返回 null
    return null;
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);

    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * 计算文本匹配分数（当无嵌入向量时使用）
   */
  private computeTextScore(memory: ReasoningMemory, query: string): number {
    const queryLower = query.toLowerCase();
    let score = 0;

    // 标题匹配
    if (memory.title.toLowerCase().includes(queryLower)) {
      score += 10;
    }

    // 描述匹配
    if (memory.description.toLowerCase().includes(queryLower)) {
      score += 5;
    }

    // 内容匹配
    if (memory.content.toLowerCase().includes(queryLower)) {
      score += 3;
    }

    // 标签匹配
    for (const tag of memory.tags) {
      if (tag.toLowerCase().includes(queryLower)) {
        score += 2;
      }
    }

    // 访问次数加权
    score += Math.log(memory.accessCount + 1);

    return score;
  }

  /**
   * 构建记忆 - 从任务结果提炼策略
   * 闭环学习第二步
   */
  async construct(result: TaskResult): Promise<ReasoningMemory> {
    // 1. 自我评判
    const outcome = await this.selfJudge.judge(result);

    // 2. 根据结果类型构建不同风格的记忆
    let memory: ReasoningMemory;

    if (outcome === 'success') {
      memory = await this.learnFromSuccess(result);
    } else {
      memory = await this.learnFromFailure(result);
    }

    // 3. 精炼（如启用）
    if (this.selfJudge && result.trajectory) {
      memory.content = await this.selfJudge.refine({
        content: memory.content,
        trajectory: result.trajectory,
      });
    }

    return memory;
  }

  /**
   * 从成功中学习 - 提炼有效策略
   */
  private async learnFromSuccess(result: TaskResult): Promise<ReasoningMemory> {
    const taskDescription = typeof result.input === 'string'
      ? result.input
      : JSON.stringify(result.input).substring(0, 200);

    return {
      id: `rb_success_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: this.extractStrategyTitle(result),
      description: `Successfully completed: ${taskDescription.substring(0, 50)}...`,
      content: this.extractStrategy(result),
      outcome: 'success',
      refinementLevel: 1,
      originalTask: taskDescription,
      trajectory: result.trajectory,
      tags: this.inferTags(result),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessCount: 0,
    };
  }

  /**
   * 从失败中学习 - 分析失败原因，形成防错指南
   */
  private async learnFromFailure(result: TaskResult): Promise<ReasoningMemory> {
    const taskDescription = typeof result.input === 'string'
      ? result.input
      : JSON.stringify(result.input).substring(0, 200);

    // 分析失败原因
    const failureAnalysis = await this.selfJudge.analyzeFailure(result);

    return {
      id: `rb_failure_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: this.extractFailureTitle(result),
      description: `Failed: ${taskDescription.substring(0, 50)}...`,
      content: this.buildFailureGuide(failureAnalysis, result),
      outcome: 'failure',
      refinementLevel: 1,
      originalTask: taskDescription,
      trajectory: result.trajectory,
      tags: [...this.inferTags(result), 'failure', 'lesson-learned'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessCount: 0,
    };
  }

  /**
   * 提取策略标题
   */
  private extractStrategyTitle(result: TaskResult): string {
    if (result.metadata?.strategy) {
      return result.metadata.strategy as string;
    }

    // 从轨迹中提取
    if (result.trajectory && result.trajectory.length > 0) {
      const lastStep = result.trajectory[result.trajectory.length - 1];
      return `Strategy: ${lastStep.substring(0, 50)}`;
    }

    return 'Successful task completion';
  }

  /**
   * 提取失败标题
   */
  private extractFailureTitle(result: TaskResult): string {
    if (result.error) {
      return `Failed due to: ${result.error.substring(0, 40)}`;
    }

    return 'Task failed - analysis required';
  }

  /**
   * 提炼策略内容
   */
  private extractStrategy(result: TaskResult): string {
    const steps: string[] = [];

    if (result.trajectory && result.trajectory.length > 0) {
      steps.push('Steps taken:');
      for (let i = 0; i < result.trajectory.length; i++) {
        steps.push(`${i + 1}. ${result.trajectory[i]}`);
      }
    }

    if (result.output) {
      steps.push(`\nResult: ${JSON.stringify(result.output).substring(0, 200)}`);
    }

    return steps.join('\n');
  }

  /**
   * 构建失败指南
   */
  private buildFailureGuide(analysis: string, result: TaskResult): string {
    const guide: string[] = [];

    guide.push('## Failure Analysis');
    guide.push(analysis);

    guide.push('\n## What went wrong');

    if (result.trajectory && result.trajectory.length > 0) {
      guide.push('Trajectory:');
      for (let i = 0; i < result.trajectory.length; i++) {
        guide.push(`${i + 1}. ${result.trajectory[i]}`);
      }
    }

    guide.push('\n## Recommendations');

    // 根据错误类型提供建议
    if (result.error) {
      const errorLower = result.error.toLowerCase();
      if (errorLower.includes('timeout')) {
        guide.push('- Consider increasing timeout duration');
        guide.push('- Check network connectivity');
      }
      if (errorLower.includes('permission')) {
        guide.push('- Verify access permissions');
        guide.push('- Check authentication credentials');
      }
      if (errorLower.includes('not found')) {
        guide.push('- Verify resource existence');
        guide.push('- Check identifiers/URLs');
      }
    }

    return guide.join('\n');
  }

  /**
   * 推断标签
   */
  private inferTags(result: TaskResult): string[] {
    const tags: string[] = [];

    // 从输入推断
    if (typeof result.input === 'string') {
      const inputLower = result.input.toLowerCase();
      if (inputLower.includes('search')) tags.push('search');
      if (inputLower.includes('code')) tags.push('coding');
      if (inputLower.includes('test')) tags.push('testing');
    }

    // 从元数据推断
    if (result.metadata?.category) {
      tags.push(result.metadata.category as string);
    }

    return tags.length > 0 ? tags : ['general'];
  }

  /**
   * 整合记忆 - 添加到记忆库
   * 闭环学习第三步
   */
  async consolidate(memory: ReasoningMemory): Promise<void> {
    // 检查容量，必要时驱逐
    const maxMemories = this.config.maxMemories ?? 10000;
    if (this.memories.size >= maxMemories) {
      this.evict();
    }

    this.memories.set(memory.id, memory);

    // 如果启用了自动持久化，立即保存
    if (this.autoPersist && this.storageAdapter) {
      await this.persist();
    }
  }

  /**
   * 持久化所有记忆到存储适配器
   */
  async persist(): Promise<number> {
    if (!this.storageAdapter) {
      console.warn('[ReasoningBank] No storage adapter configured, skipping persist');
      return 0;
    }

    const memories = Array.from(this.memories.values());
    await this.storageAdapter.save(memories);
    return memories.length;
  }

  /**
   * 从存储适配器恢复记忆
   */
  async restore(): Promise<number> {
    if (!this.storageAdapter) {
      console.warn('[ReasoningBank] No storage adapter configured, skipping restore');
      return 0;
    }

    const memories = await this.storageAdapter.load();

    // 清空现有数据并重新加载
    this.memories.clear();

    for (const memory of memories) {
      this.memories.set(memory.id, memory);
    }

    return memories.length;
  }

  /**
   * 检查是否配置了存储适配器
   */
  hasStorageAdapter(): boolean {
    return !!this.storageAdapter;
  }

  /**
   * 驱逐最少使用的记忆
   */
  private evict(): void {
    let minAccess = Infinity;
    let oldestId: string | null = null;

    for (const [id, memory] of this.memories.entries()) {
      if (memory.accessCount < minAccess) {
        minAccess = memory.accessCount;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.memories.delete(oldestId);
    }
  }

  /**
   * 完整闭环学习流程 (Closed Loop Learning)
   * 检索 -> 行动 -> 构建 -> 整合
   */
  async learn(result: TaskResult): Promise<ReasoningMemory | null> {
    // 1. 构建记忆
    const memory = await this.construct(result);

    // 2. 整合记忆
    await this.consolidate(memory);

    return memory;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    success: number;
    failure: number;
    avgRefinementLevel: number;
  } {
    const memories = Array.from(this.memories.values());
    const success = memories.filter(m => m.outcome === 'success').length;
    const failure = memories.filter(m => m.outcome === 'failure').length;
    const avgRefinement = memories.length > 0
      ? memories.reduce((sum, m) => sum + m.refinementLevel, 0) / memories.length
      : 0;

    return {
      total: memories.length,
      success,
      failure,
      avgRefinementLevel: avgRefinement,
    };
  }

  /**
   * 获取所有记忆
   */
  getAll(): ReasoningMemory[] {
    return Array.from(this.memories.values());
  }

  /**
   * 清除记忆
   */
  async clear(): Promise<void> {
    this.memories.clear();

    // 如果配置了存储适配器，清除存储
    if (this.storageAdapter) {
      await this.storageAdapter.clear();
    }
  }
}
