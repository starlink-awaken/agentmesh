/**
 * KnowledgeGraph - 知识图谱模块
 *
 * Substrate 知识基础设施的核心组件
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * 节点类型
 */
export type NodeType =
  | 'entity'      // 实体
  | 'concept'     // 概念
  | 'event'       // 事件
  | 'document'    // 文档
  | 'person'      // 人物
  | 'organization' // 组织
  | 'location'    // 地点
  | 'custom';     // 自定义

/**
 * 关系类型
 */
export type RelationType =
  | 'belongs_to'
  | 'part_of'
  | 'related_to'
  | 'caused_by'
  | 'depends_on'
  | 'similar_to'
  | 'custom';

/**
 * 知识节点
 */
export interface KnowledgeNode {
  id: string;
  type: NodeType;
  label: string;
  properties: Record<string, any>;
  embeddings?: number[];  // 向量表示（预留）
  createdAt: number;
  updatedAt: number;
}

/**
 * 知识关系
 */
export interface KnowledgeRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
  properties: Record<string, any>;
  weight?: number;
  createdAt: number;
}

/**
 * 查询结果
 */
export interface QueryResult {
  nodes: KnowledgeNode[];
  relations: KnowledgeRelation[];
  score?: number;
}

/**
 * KnowledgeGraph 类
 *
 * 提供知识图谱的构建和查询能力
 */
export class KnowledgeGraph {
  private nodes: Map<string, KnowledgeNode>;
  private relations: Map<string, KnowledgeRelation>;
  private index: Map<string, Set<string>>;  // 用于快速查找

  constructor() {
    this.nodes = new Map();
    this.relations = new Map();
    this.index = new Map();
  }

  /**
   * 添加节点
   */
  addNode(node: Omit<KnowledgeNode, 'createdAt' | 'updatedAt'>): KnowledgeNode {
    const now = Date.now();
    const fullNode: KnowledgeNode = {
      ...node,
      createdAt: now,
      updatedAt: now,
    };

    this.nodes.set(fullNode.id, fullNode);

    // 更新索引
    this.updateIndex(fullNode);

    return fullNode;
  }

  /**
   * 添加关系
   */
  addRelation(relation: Omit<KnowledgeRelation, 'createdAt'>): KnowledgeRelation {
    const fullRelation: KnowledgeRelation = {
      ...relation,
      createdAt: Date.now(),
    };

    // 验证节点存在
    if (!this.nodes.has(relation.sourceId) || !this.nodes.has(relation.targetId)) {
      throw new Error('关系的两端节点必须存在');
    }

    this.relations.set(fullRelation.id, fullRelation);
    return fullRelation;
  }

  /**
   * 获取节点
   */
  getNode(id: string): KnowledgeNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * 获取关系
   */
  getRelation(id: string): KnowledgeRelation | undefined {
    return this.relations.get(id);
  }

  /**
   * 根据类型获取节点
   */
  getNodesByType(type: NodeType): KnowledgeNode[] {
    return Array.from(this.nodes.values()).filter(n => n.type === type);
  }

  /**
   * 获取节点的所有关系
   */
  getNodeRelations(nodeId: string): KnowledgeRelation[] {
    return Array.from(this.relations.values()).filter(
      r => r.sourceId === nodeId || r.targetId === nodeId
    );
  }

  /**
   * 查找相邻节点
   */
  getNeighbors(nodeId: string): KnowledgeNode[] {
    const neighborIds = new Set<string>();

    for (const rel of this.getNodeRelations(nodeId)) {
      if (rel.sourceId === nodeId) {
        neighborIds.add(rel.targetId);
      } else {
        neighborIds.add(rel.sourceId);
      }
    }

    return Array.from(neighborIds).map(id => this.nodes.get(id)).filter(Boolean) as KnowledgeNode[];
  }

  /**
   * 搜索节点
   */
  search(query: string): KnowledgeNode[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.nodes.values()).filter(
      node =>
        node.label.toLowerCase().includes(lowerQuery) ||
        JSON.stringify(node.properties).toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * 删除节点（同时删除相关关系）
   */
  deleteNode(id: string): boolean {
    if (!this.nodes.has(id)) {
      return false;
    }

    // 删除相关关系
    const relationsToDelete = Array.from(this.relations.values())
      .filter(r => r.sourceId === id || r.targetId === id)
      .map(r => r.id);

    for (const relId of relationsToDelete) {
      this.relations.delete(relId);
    }

    // 删除节点
    return this.nodes.delete(id);
  }

  /**
   * 删除关系
   */
  deleteRelation(id: string): boolean {
    return this.relations.delete(id);
  }

  /**
   * 更新节点
   */
  updateNode(id: string, updates: Partial<KnowledgeNode>): KnowledgeNode | undefined {
    const node = this.nodes.get(id);
    if (!node) return undefined;

    const updated: KnowledgeNode = {
      ...node,
      ...updates,
      id: node.id,  // 保持 ID 不变
      type: node.type,  // 保持类型不变
      createdAt: node.createdAt,
      updatedAt: Date.now(),
    };

    this.nodes.set(id, updated);
    return updated;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    nodeCount: number;
    relationCount: number;
    nodeTypes: Record<NodeType, number>;
    relationTypes: Record<RelationType, number>;
  } {
    const nodeTypes: Record<string, number> = {};
    const relationTypes: Record<string, number> = {};

    for (const node of this.nodes.values()) {
      nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
    }

    for (const rel of this.relations.values()) {
      relationTypes[rel.type] = (relationTypes[rel.type] || 0) + 1;
    }

    return {
      nodeCount: this.nodes.size,
      relationCount: this.relations.size,
      nodeTypes: nodeTypes as any,
      relationTypes: relationTypes as any,
    };
  }

  /**
   * 导出为 JSON
   */
  toJSON(): any {
    return {
      nodes: Array.from(this.nodes.values()),
      relations: Array.from(this.relations.values()),
    };
  }

  /**
   * 从 JSON 导入
   */
  static fromJSON(json: any): KnowledgeGraph {
    const graph = new KnowledgeGraph();

    for (const node of json.nodes || []) {
      graph.addNode(node);
    }

    for (const rel of json.relations || []) {
      graph.addRelation(rel);
    }

    return graph;
  }

  /**
   * 更新索引
   */
  private updateIndex(node: KnowledgeNode): void {
    // 按类型索引
    const typeKey = `type:${node.type}`;
    if (!this.index.has(typeKey)) {
      this.index.set(typeKey, new Set());
    }
    this.index.get(typeKey)!.add(node.id);

    // 按标签词索引
    const words = node.label.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (!this.index.has(word)) {
        this.index.set(word, new Set());
      }
      this.index.get(word)!.add(node.id);
    }
  }
}

export default KnowledgeGraph;
