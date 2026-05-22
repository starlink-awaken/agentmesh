/**
 * Honeycomb P2.4 - 依赖图与循环引用检测
 *
 * 提供通用的依赖图构建和环路检测功能，支持：
 * - Agent 调用依赖检测
 * - 变量引用依赖检测
 * - Step 间数据流依赖检测
 * - 深度优先搜索(DFS)环路检测
 * - Kahn 算法拓扑排序
 *
 * @module dsl/dependency-graph
 */

// ============================================================
// 循环依赖错误
// ============================================================

/**
 * 循环依赖错误
 *
 * 表示在依赖图中检测到环路。
 */
export class CircularDependencyError extends Error {
  /** 错误名称 */
  public readonly name = 'CircularDependencyError';

  /** 环路路径（有序的节点列表，形成闭环） */
  public readonly cycle: string[];

  /** 错误代码 */
  public readonly code = 'SEM303';

  /**
   * 创建循环依赖错误
   *
   * @param cycle - 环路路径
   * @param message - 错误消息（可选，默认生成）
   */
  constructor(cycle: string[], message?: string) {
    super(
      message ||
      `Circular dependency detected: ${cycle.join(' -> ')}`
    );
    this.cycle = cycle;
    Object.setPrototypeOf(this, CircularDependencyError.prototype);
  }

  /**
   * 获取格式化的环路路径字符串
   */
  get cyclePath(): string {
    return this.cycle.join(' -> ');
  }

  /**
   * 获取环路长度
   */
  get cycleLength(): number {
    return this.cycle.length;
  }

  /**
   * 转换为字符串
   */
  toString(): string {
    return `[${this.code}] ${this.message}`;
  }

  /**
   * 转换为 JSON
   */
  toJSON(): { code: string; cycle: string[]; message: string } {
    return {
      code: this.code,
      cycle: this.cycle,
      message: this.message,
    };
  }
}

// ============================================================
// 依赖图节点类型
// ============================================================

/**
 * 依赖节点类型
 */
export type DependencyNodeType = 'agent' | 'variable' | 'step' | 'output';

/**
 * 依赖节点
 */
export interface DependencyNode {
  /** 节点名称 */
  name: string;
  /** 节点类型 */
  type: DependencyNodeType;
  /** 源码位置（可选） */
  location?: { file: string; line: number; column: number };
}

/**
 * 依赖边
 */
export interface DependencyEdge {
  /** 源节点 */
  from: string;
  /** 目标节点 */
  to: string;
  /** 边类型（调用、引用、数据流等） */
  edgeType: 'call' | 'reference' | 'dataflow' | 'output';
}

// ============================================================
// 依赖图类
// ============================================================

/**
 * 依赖图
 *
 * 使用邻接表表示的有向图，用于检测循环依赖。
 */
export class DependencyGraph {
  /** 邻接表：节点 -> 其依赖的节点集合 */
  private adjacencyList: Map<string, Set<string>> = new Map();

  /** 反向邻接表：节点 -> 依赖它的节点集合 */
  private reverseAdjacencyList: Map<string, Set<string>> = new Map();

  /** 节点元数据映射 */
  private nodeMetadata: Map<string, DependencyNode> = new Map();

  /** 边列表 */
  private edges: DependencyEdge[] = [];

  /**
   * 添加节点
   *
   * 如果节点已存在，则更新其元数据。
   *
   * @param name - 节点名称
   * @param type - 节点类型
   * @param location - 源码位置（可选）
   */
  addNode(name: string, type: DependencyNodeType = 'agent', location?: { file: string; line: number; column: number }): void {
    if (!this.adjacencyList.has(name)) {
      this.adjacencyList.set(name, new Set());
      this.reverseAdjacencyList.set(name, new Set());
    }
    this.nodeMetadata.set(name, { name, type, location });
  }

  /**
   * 添加边
   *
   * 表示 from 节点依赖于 to 节点。
   *
   * @param from - 源节点
   * @param to - 目标节点
   * @param edgeType - 边类型
   */
  addEdge(from: string, to: string, edgeType: DependencyEdge['edgeType'] = 'reference'): void {
    // 确保节点存在
    this.addNode(from);
    this.addNode(to);

    // 添加边到邻接表
    this.adjacencyList.get(from)!.add(to);
    this.reverseAdjacencyList.get(to)!.add(from);

    // 记录边
    this.edges.push({ from, to, edgeType });
  }

  /**
   * 批量添加边
   *
   * @param edges - 边数组
   */
  addEdges(edges: Array<[string, string, DependencyEdge['edgeType']?]>): void {
    for (const [from, to, edgeType] of edges) {
      this.addEdge(from, to, edgeType);
    }
  }

  /**
   * 获取节点的所有依赖
   *
   * @param node - 节点名称
   * @returns 该节点依赖的所有节点
   */
  getDependencies(node: string): Set<string> | undefined {
    return this.adjacencyList.get(node);
  }

  /**
   * 获取依赖该节点的所有节点
   *
   * @param node - 节点名称
   * @returns 依赖该节点的所有节点
   */
  getDependents(node: string): Set<string> | undefined {
    return this.reverseAdjacencyList.get(node);
  }

  /**
   * 检查是否存在从 from 到 to 的路径
   *
   * 使用 DFS 搜索路径。
   *
   * @param from - 起始节点
   * @param to - 目标节点
   * @returns 是否存在路径
   */
  hasPath(from: string, to: string): boolean {
    if (from === to) {
      return true;
    }

    const visited = new Set<string>();
    const dfs = (node: string): boolean => {
      if (node === to) {
        return true;
      }
      if (visited.has(node)) {
        return false;
      }
      visited.add(node);

      const deps = this.adjacencyList.get(node);
      if (deps) {
        for (const dep of deps) {
          if (dfs(dep)) {
            return true;
          }
        }
      }
      return false;
    };

    return dfs(from);
  }

  /**
   * 检测环路（使用 DFS）
   *
   * 返回第一个检测到的环路路径，如果没有环路则返回 null。
   *
   * @returns 环路路径，或 null
   */
  detectCycle(): string[] | null {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): string[] | null => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = this.adjacencyList.get(node) ?? new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const cycle = dfs(neighbor);
          if (cycle) {
            return cycle;
          }
        } else if (recursionStack.has(neighbor)) {
          // 找到环路：从 neighbor 到当前节点形成环路
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart);
          cycle.push(neighbor); // 闭合环路
          return cycle;
        }
      }

      recursionStack.delete(node);
      path.pop();
      return null;
    };

    // 遍历所有未访问的节点
    for (const node of this.adjacencyList.keys()) {
      if (!visited.has(node)) {
        const cycle = dfs(node);
        if (cycle) {
          return cycle;
        }
      }
    }

    return null;
  }

  /**
   * 检测所有环路
   *
   * 返回所有检测到的环路路径。
   *
   * @returns 所有环路路径的数组
   */
  detectAllCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = this.adjacencyList.get(node) ?? new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recursionStack.has(neighbor)) {
          // 找到环路
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart);
          cycle.push(neighbor);
          cycles.push(cycle);
        }
      }

      recursionStack.delete(node);
      path.pop();
    };

    for (const node of this.adjacencyList.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  /**
   * 拓扑排序（使用 Kahn 算法）
   *
   * 如果图中存在环路，返回 null。
   *
   * @returns 拓扑排序后的节点列表，或 null（存在环路时）
   */
  topologicalSort(): string[] | null {
    // 计算入度
    const inDegree = new Map<string, number>();
    for (const node of this.adjacencyList.keys()) {
      inDegree.set(node, 0);
    }
    for (const [from, deps] of this.adjacencyList) {
      for (const dep of deps) {
        inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
      }
    }

    // 找到所有入度为 0 的节点
    const queue: string[] = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0) {
        queue.push(node);
      }
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);

      const deps = this.adjacencyList.get(node) ?? new Set();
      for (const dep of deps) {
        const newDegree = (inDegree.get(dep) ?? 0) - 1;
        inDegree.set(dep, newDegree);
        if (newDegree === 0) {
          queue.push(dep);
        }
      }
    }

    // 如果结果包含所有节点，则不存在环路
    if (result.length === this.adjacencyList.size) {
      return result;
    }

    return null; // 存在环路
  }

  /**
   * 获取节点元数据
   *
   * @param name - 节点名称
   * @returns 节点元数据，如果不存在则返回 undefined
   */
  getNodeMetadata(name: string): DependencyNode | undefined {
    return this.nodeMetadata.get(name);
  }

  /**
   * 获取所有节点
   *
   * @returns 所有节点名称的数组
   */
  getNodes(): string[] {
    return Array.from(this.adjacencyList.keys());
  }

  /**
   * 获取所有边
   *
   * @returns 所有边的数组
   */
  getEdges(): DependencyEdge[] {
    return [...this.edges];
  }

  /**
   * 获取节点数量
   */
  get nodeCount(): number {
    return this.adjacencyList.size;
  }

  /**
   * 获取边数量
   */
  get edgeCount(): number {
    return this.edges.length;
  }

  /**
   * 清空图
   */
  clear(): void {
    this.adjacencyList.clear();
    this.reverseAdjacencyList.clear();
    this.nodeMetadata.clear();
    this.edges = [];
  }

  /**
   * 转换为 DOT 格式（Graphviz）
   *
   * @returns DOT 格式的字符串
   */
  toDOT(): string {
    const lines: string[] = ['digraph dependencies {'];
    lines.push('  rankdir=TB;');

    // 添加节点
    for (const [name, meta] of this.nodeMetadata) {
      const label = meta.location
        ? `${name} (${meta.location.file}:${meta.location.line})`
        : name;
      lines.push(`  "${name}" [label="${label}"];`);
    }

    // 添加边
    for (const edge of this.edges) {
      const { from, to, edgeType } = edge;
      const style = edgeType === 'call' ? '[style=bold]' : '';
      lines.push(`  "${from}" -> "${to}" ${style};`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * 转换为 JSON
   */
  toJSON(): { nodes: DependencyNode[]; edges: DependencyEdge[] } {
    return {
      nodes: Array.from(this.nodeMetadata.values()),
      edges: [...this.edges],
    };
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建依赖图
 *
 * @param initialNodes - 初始节点（可选）
 * @param initialEdges - 初始边（可选）
 * @returns 新的依赖图实例
 */
export function createDependencyGraph(
  initialNodes?: Array<{ name: string; type?: DependencyNodeType; location?: { file: string; line: number; column: number } }>,
  initialEdges?: Array<[string, string, DependencyEdge['edgeType']?]>
): DependencyGraph {
  const graph = new DependencyGraph();

  if (initialNodes) {
    for (const node of initialNodes) {
      graph.addNode(node.name, node.type, node.location);
    }
  }

  if (initialEdges) {
    graph.addEdges(initialEdges);
  }

  return graph;
}

// ============================================================
// DSL AST 分析器
// ============================================================

/**
 * 从 DSL AST 构建依赖图
 *
 * 分析 Agent DSL 的 AST，提取：
 * 1. Agent 调用依赖
 * 2. 变量引用依赖
 * 3. Step 输出依赖
 *
 * @param ast - Agent DSL AST
 * @returns 构建的依赖图
 */
export function buildDependencyGraphFromAST(ast: {
  name: string;
  body?: Array<{ type: string; call?: { type: string; name?: string }; inputs?: Record<string, unknown> }>;
}): DependencyGraph {
  const graph = new DependencyGraph();

  // 添加当前 Agent 节点
  graph.addNode(ast.name, 'agent');

  // 遍历 body 中的语句
  if (ast.body) {
    for (const stmt of ast.body) {
      if (stmt.type === 'step') {
        const stepName = (stmt as any).name || `step_${stmt.call?.name || 'anonymous'}`;

        // 添加 Step 节点
        graph.addNode(stepName, 'step');

        // 分析 Agent 调用依赖
        if (stmt.call?.type === 'agent' && stmt.call.name) {
          graph.addEdge(ast.name, stmt.call.name, 'call');
        }

        // 分析 Skill 调用依赖
        if (stmt.call?.type === 'skill' && (stmt.call as any).skill_id) {
          graph.addEdge(stepName, (stmt.call as any).skill_id, 'call');
        }

        // 分析输入中的变量引用
        if (stmt.inputs) {
          for (const [key, expr] of Object.entries(stmt.inputs)) {
            // 提取变量引用
            const refs = extractVariableReferences(expr);
            for (const ref of refs) {
              graph.addEdge(stepName, ref, 'reference');
            }
          }
        }
      }
    }
  }

  return graph;
}

/**
 * 从表达式中提取变量引用
 *
 * @param expr - DSL 表达式
 * @returns 变量名称数组
 */
export function extractVariableReferences(expr: unknown): string[] {
  const refs = new Set<string>();

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return;
    }

    if ((node as any).type === 'variable') {
      refs.add((node as any).name);
    } else if ((node as any).type === 'property_access') {
      visit((node as any).object);
    } else if ((node as any).type === 'binary_op') {
      visit((node as any).left);
      visit((node as any).right);
    } else if ((node as any).type === 'unary_op') {
      visit((node as any).operand);
    } else if ((node as any).type === 'function_call') {
      for (const arg of (node as any).arguments || []) {
        visit(arg);
      }
    } else if ((node as any).type === 'array_literal') {
      for (const elem of (node as any).elements || []) {
        visit(elem);
      }
    } else if ((node as any).type === 'conditional_expression') {
      visit((node as any).test);
      visit((node as any).consequent);
      visit((node as any).alternate);
    }
    // 递归访问对象的所有属性
    for (const value of Object.values(node)) {
      if (typeof value === 'object' && value !== null) {
        visit(value);
      }
    }
  };

  visit(expr);
  return Array.from(refs);
}
