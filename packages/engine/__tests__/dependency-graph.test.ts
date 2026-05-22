/**
 * 依赖图与循环引用检测测试
 *
 * 测试 DependencyGraph 类和 CircularDependencyError 的功能。
 * 遵循 TDD 原则：测试先行，红-绿-重构。
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  DependencyGraph,
  CircularDependencyError,
  createDependencyGraph,
  buildDependencyGraphFromAST,
  extractVariableReferences,
  type DependencyEdge,
} from '../src/dsl/dependency-graph.js';

// ============================================================
// CircularDependencyError 测试
// ============================================================

describe('CircularDependencyError', () => {
  test('应该创建包含环路路径的错误', () => {
    const cycle = ['A', 'B', 'C', 'A'];
    const error = new CircularDependencyError(cycle);

    expect(error.name).toBe('CircularDependencyError');
    expect(error.code).toBe('SEM303');
    expect(error.cycle).toEqual(cycle);
    expect(error.cyclePath).toBe('A -> B -> C -> A');
    expect(error.cycleLength).toBe(4);
  });

  test('应该支持自定义错误消息', () => {
    const cycle = ['A', 'A'];
    const customMessage = '自定义环路消息';
    const error = new CircularDependencyError(cycle, customMessage);

    expect(error.message).toBe(customMessage);
  });

  test('应该正确序列化为 JSON', () => {
    const cycle = ['X', 'Y', 'X'];
    const error = new CircularDependencyError(cycle);
    const json = error.toJSON();

    expect(json).toEqual({
      code: 'SEM303',
      cycle: ['X', 'Y', 'X'],
      message: 'Circular dependency detected: X -> Y -> X',
    });
  });

  test('toString 应该返回格式化的错误信息', () => {
    const cycle = ['Agent1', 'Agent2', 'Agent1'];
    const error = new CircularDependencyError(cycle);

    expect(error.toString()).toContain('[SEM303]');
    expect(error.toString()).toContain('Agent1 -> Agent2 -> Agent1');
  });
});

// ============================================================
// DependencyGraph 基础操作测试
// ============================================================

describe('DependencyGraph - 基础操作', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph();
  });

  test('应该正确添加节点', () => {
    graph.addNode('A', 'agent', { file: 'test.dsl', line: 1, column: 1 });
    graph.addNode('B', 'variable');

    expect(graph.nodeCount).toBe(2);
    expect(graph.getNodes()).toContain('A');
    expect(graph.getNodes()).toContain('B');
  });

  test('应该正确添加边', () => {
    graph.addEdge('A', 'B', 'call');

    expect(graph.edgeCount).toBe(1);
    expect(graph.getDependencies('A')).toContain('B');
    expect(graph.getDependents('B')).toContain('A');
  });

  test('应该支持批量添加边', () => {
    graph.addEdges([
      ['A', 'B', 'call'],
      ['B', 'C', 'reference'],
      ['C', 'D', 'dataflow'],
    ]);

    expect(graph.edgeCount).toBe(3);
  });

  test('获取不存在的节点依赖应返回 undefined', () => {
    expect(graph.getDependencies('nonexistent')).toBeUndefined();
    expect(graph.getDependents('nonexistent')).toBeUndefined();
  });

  test('应该正确获取节点元数据', () => {
    const location = { file: 'test.dsl', line: 10, column: 5 };
    graph.addNode('MyAgent', 'agent', location);

    const meta = graph.getNodeMetadata('MyAgent');
    expect(meta).toBeDefined();
    expect(meta?.name).toBe('MyAgent');
    expect(meta?.type).toBe('agent');
    expect(meta?.location).toEqual(location);
  });

  test('clear 应该清空所有数据', () => {
    graph.addNode('A');
    graph.addEdge('A', 'B');
    graph.clear();

    expect(graph.nodeCount).toBe(0);
    expect(graph.edgeCount).toBe(0);
  });
});

// ============================================================
// hasPath 路径检测测试
// ============================================================

describe('DependencyGraph - hasPath', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph();
    // 构建图: A -> B -> C -> D
    graph.addEdge('A', 'B');
    graph.addEdge('B', 'C');
    graph.addEdge('C', 'D');
  });

  test('应该检测存在的路径', () => {
    expect(graph.hasPath('A', 'D')).toBe(true);
    expect(graph.hasPath('A', 'B')).toBe(true);
    expect(graph.hasPath('B', 'D')).toBe(true);
  });

  test('应该检测不存在的路径', () => {
    expect(graph.hasPath('D', 'A')).toBe(false);
    expect(graph.hasPath('C', 'A')).toBe(false);
  });

  test('节点到自身应该返回 true', () => {
    expect(graph.hasPath('A', 'A')).toBe(true);
    expect(graph.hasPath('B', 'B')).toBe(true);
  });
});

// ============================================================
// detectCycle 环路检测测试
// ============================================================

describe('DependencyGraph - detectCycle', () => {
  test('应该检测直接环路（自环）', () => {
    const graph = new DependencyGraph();
    graph.addEdge('A', 'A');

    const cycle = graph.detectCycle();
    expect(cycle).not.toBeNull();
    expect(cycle).toEqual(['A', 'A']);
  });

  test('应该检测两节点环路', () => {
    const graph = new DependencyGraph();
    graph.addEdge('AgentA', 'AgentB');
    graph.addEdge('AgentB', 'AgentA');

    const cycle = graph.detectCycle();
    expect(cycle).not.toBeNull();
    expect(cycle).toContain('AgentA');
    expect(cycle).toContain('AgentB');
    // 验证环路是闭合的
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
  });

  test('应该检测间接环路（3节点）', () => {
    const graph = new DependencyGraph();
    // A -> B -> C -> A
    graph.addEdge('AgentA', 'AgentB');
    graph.addEdge('AgentB', 'AgentC');
    graph.addEdge('AgentC', 'AgentA');

    const cycle = graph.detectCycle();
    expect(cycle).not.toBeNull();
    expect(cycle!.length).toBe(4); // A -> B -> C -> A
  });

  test('应该检测复杂环路（4节点）', () => {
    const graph = new DependencyGraph();
    // A -> B -> C -> D -> A
    graph.addEdge('A', 'B');
    graph.addEdge('B', 'C');
    graph.addEdge('C', 'D');
    graph.addEdge('D', 'A');

    const cycle = graph.detectCycle();
    expect(cycle).not.toBeNull();
    expect(cycle!.length).toBe(5);
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
  });

  test('应该检测非主节点的环路', () => {
    const graph = new DependencyGraph();
    // 主链: A -> B -> C
    // 环路: D -> E -> D
    graph.addEdge('A', 'B');
    graph.addEdge('B', 'C');
    graph.addEdge('D', 'E');
    graph.addEdge('E', 'D');

    const cycle = graph.detectCycle();
    expect(cycle).not.toBeNull();
    expect(cycle).toContain('D');
    expect(cycle).toContain('E');
  });

  test('应该返回 null 对于无环图', () => {
    const graph = new DependencyGraph();
    // A -> B -> C -> D
    graph.addEdge('A', 'B');
    graph.addEdge('B', 'C');
    graph.addEdge('C', 'D');

    const cycle = graph.detectCycle();
    expect(cycle).toBeNull();
  });

  test('应该返回 null 对于空图', () => {
    const graph = new DependencyGraph();
    expect(graph.detectCycle()).toBeNull();
  });

  test('应该返回 null 对于单节点图（无边）', () => {
    const graph = new DependencyGraph();
    graph.addNode('A');
    expect(graph.detectCycle()).toBeNull();
  });
});

// ============================================================
// detectAllCycles 所有环路检测测试
// ============================================================

describe('DependencyGraph - detectAllCycles', () => {
  test('应该检测所有独立环路', () => {
    const graph = new DependencyGraph();
    // A -> B -> A (环路1)
    // C -> D -> C (环路2)
    graph.addEdge('A', 'B');
    graph.addEdge('B', 'A');
    graph.addEdge('C', 'D');
    graph.addEdge('D', 'C');

    const cycles = graph.detectAllCycles();
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    // 至少应该找到两个环路
    const hasABCycle = cycles.some(c => c.includes('A') && c.includes('B'));
    const hasCDCycle = cycles.some(c => c.includes('C') && c.includes('D'));
    expect(hasABCycle).toBe(true);
    expect(hasCDCycle).toBe(true);
  });

  test('空图应该返回空数组', () => {
    const graph = new DependencyGraph();
    expect(graph.detectAllCycles()).toEqual([]);
  });
});

// ============================================================
// topologicalSort 拓扑排序测试
// ============================================================

describe('DependencyGraph - topologicalSort', () => {
  test('应该正确对 DAG 拓扑排序', () => {
    const graph = new DependencyGraph();
    // A -> B -> C
    // A -> D
    graph.addEdge('A', 'B');
    graph.addEdge('B', 'C');
    graph.addEdge('A', 'D');

    const sorted = graph.topologicalSort();
    expect(sorted).not.toBeNull();

    // 验证排序约束：A 必须在 B 之前，B 必须在 C 之前
    const indexOfA = sorted!.indexOf('A');
    const indexOfB = sorted!.indexOf('B');
    const indexOfC = sorted!.indexOf('C');
    expect(indexOfA).toBeLessThan(indexOfB);
    expect(indexOfB).toBeLessThan(indexOfC);
  });

  test('应该对有环图返回 null', () => {
    const graph = new DependencyGraph();
    graph.addEdge('A', 'B');
    graph.addEdge('B', 'A');

    expect(graph.topologicalSort()).toBeNull();
  });

  test('单节点图应该返回单元素数组', () => {
    const graph = new DependencyGraph();
    graph.addNode('A');

    const sorted = graph.topologicalSort();
    expect(sorted).toEqual(['A']);
  });
});

// ============================================================
// createDependencyGraph 工厂函数测试
// ============================================================

describe('createDependencyGraph', () => {
  test('应该创建带有初始节点的图', () => {
    const graph = createDependencyGraph([
      { name: 'A', type: 'agent' },
      { name: 'B', type: 'variable' },
    ]);

    expect(graph.nodeCount).toBe(2);
  });

  test('应该创建带有初始边的图', () => {
    const graph = createDependencyGraph(
      [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      [['A', 'B', 'call'], ['B', 'C', 'reference']]
    );

    expect(graph.edgeCount).toBe(2);
  });
});

// ============================================================
// extractVariableReferences 测试
// ============================================================

describe('extractVariableReferences', () => {
  test('应该提取简单变量引用', () => {
    const expr = { type: 'variable', name: 'input' };
    const refs = extractVariableReferences(expr);

    expect(refs).toContain('input');
  });

  test('应该提取属性访问中的对象引用', () => {
    const expr = {
      type: 'property_access',
      object: { type: 'variable', name: 'data' },
      property: 'field',
    };
    const refs = extractVariableReferences(expr);

    expect(refs).toContain('data');
  });

  test('应该提取二元操作中的变量引用', () => {
    const expr = {
      type: 'binary_op',
      operator: '+',
      left: { type: 'variable', name: 'a' },
      right: { type: 'variable', name: 'b' },
    };
    const refs = extractVariableReferences(expr);

    expect(refs).toContain('a');
    expect(refs).toContain('b');
  });

  test('应该提取函数调用参数中的变量引用', () => {
    const expr = {
      type: 'function_call',
      function: 'process',
      arguments: [
        { type: 'variable', name: 'input' },
        { type: 'variable', name: 'config' },
      ],
    };
    const refs = extractVariableReferences(expr);

    expect(refs).toContain('input');
    expect(refs).toContain('config');
  });

  test('应该提取数组字面量中的变量引用', () => {
    const expr = {
      type: 'array_literal',
      elements: [
        { type: 'variable', name: 'x' },
        { type: 'variable', name: 'y' },
      ],
    };
    const refs = extractVariableReferences(expr);

    expect(refs).toContain('x');
    expect(refs).toContain('y');
  });

  test('应该提取条件表达式中的变量引用', () => {
    const expr = {
      type: 'conditional_expression',
      test: { type: 'variable', name: 'condition' },
      consequent: { type: 'variable', name: 'thenValue' },
      alternate: { type: 'variable', name: 'elseValue' },
    };
    const refs = extractVariableReferences(expr);

    expect(refs).toContain('condition');
    expect(refs).toContain('thenValue');
    expect(refs).toContain('elseValue');
  });

  test('应该去重变量引用', () => {
    const expr = {
      type: 'binary_op',
      operator: '+',
      left: { type: 'variable', name: 'x' },
      right: { type: 'variable', name: 'x' },
    };
    const refs = extractVariableReferences(expr);

    expect(refs).toEqual(['x']);
  });
});

// ============================================================
// buildDependencyGraphFromAST 测试
// ============================================================

describe('buildDependencyGraphFromAST', () => {
  test('应该从 AST 构建 Agent 调用依赖图', () => {
    const ast = {
      name: 'MainAgent',
      body: [
        {
          type: 'step',
          name: 'step1',
          call: { type: 'agent', name: 'HelperAgent' },
          inputs: {},
        },
      ],
    };

    const graph = buildDependencyGraphFromAST(ast);

    expect(graph.getNodes()).toContain('MainAgent');
    expect(graph.getDependencies('MainAgent')).toContain('HelperAgent');
  });

  test('应该从 AST 提取 Skill 调用依赖', () => {
    const ast = {
      name: 'TestAgent',
      body: [
        {
          type: 'step',
          name: 'skill_step',
          call: { type: 'skill', skill_id: 'my-skill' },
          inputs: {},
        },
      ],
    };

    const graph = buildDependencyGraphFromAST(ast);

    expect(graph.getDependencies('skill_step')).toContain('my-skill');
  });

  test('应该从 AST 提取变量引用依赖', () => {
    const ast = {
      name: 'TestAgent',
      body: [
        {
          type: 'step',
          name: 'process_step',
          call: { type: 'agent', name: 'Processor' },
          inputs: {
            data: { type: 'variable', name: 'input_data' },
            config: { type: 'variable', name: 'settings' },
          },
        },
      ],
    };

    const graph = buildDependencyGraphFromAST(ast);

    const deps = graph.getDependencies('process_step');
    expect(deps).toContain('input_data');
    expect(deps).toContain('settings');
  });
});

// ============================================================
// DOT 格式导出测试
// ============================================================

describe('DependencyGraph - toDOT', () => {
  test('应该生成有效的 DOT 格式', () => {
    const graph = new DependencyGraph();
    graph.addNode('A', 'agent', { file: 'test.dsl', line: 1, column: 1 });
    graph.addNode('B', 'variable');
    graph.addEdge('A', 'B', 'call');

    const dot = graph.toDOT();

    expect(dot).toContain('digraph dependencies');
    expect(dot).toContain('"A"');
    expect(dot).toContain('"B"');
    expect(dot).toContain('->');
  });

  test('应该包含位置信息在节点标签中', () => {
    const graph = new DependencyGraph();
    graph.addNode('AgentX', 'agent', { file: 'myfile.dsl', line: 42, column: 10 });

    const dot = graph.toDOT();

    expect(dot).toContain('myfile.dsl:42');
  });
});

// ============================================================
// JSON 导出测试
// ============================================================

describe('DependencyGraph - toJSON', () => {
  test('应该正确序列化为 JSON', () => {
    const graph = new DependencyGraph();
    graph.addNode('A', 'agent');
    graph.addEdge('A', 'B', 'call');

    const json = graph.toJSON();

    expect(json.nodes).toBeDefined();
    expect(json.edges).toBeDefined();
    expect(json.nodes.length).toBeGreaterThan(0);
    expect(json.edges.length).toBe(1);
  });
});

// ============================================================
// 集成测试：Agent 循环依赖场景
// ============================================================

describe('Agent 循环依赖集成测试', () => {
  test('应该检测 Agent A -> Agent B -> Agent A 的环路', () => {
    const graph = new DependencyGraph();

    // 模拟 Agent A 调用 Agent B
    graph.addNode('AgentA', 'agent');
    graph.addEdge('AgentA', 'AgentB', 'call');

    // 模拟 Agent B 调用 Agent A
    graph.addNode('AgentB', 'agent');
    graph.addEdge('AgentB', 'AgentA', 'call');

    const cycle = graph.detectCycle();
    expect(cycle).not.toBeNull();
  });

  test('应该检测复杂的跨 Agent 依赖链', () => {
    const graph = new DependencyGraph();

    // A -> B -> C -> D -> B (环路: B -> C -> D -> B)
    graph.addEdge('AgentA', 'AgentB');
    graph.addEdge('AgentB', 'AgentC');
    graph.addEdge('AgentC', 'AgentD');
    graph.addEdge('AgentD', 'AgentB');

    const cycle = graph.detectCycle();
    expect(cycle).not.toBeNull();
    expect(cycle).toContain('AgentB');
    expect(cycle).toContain('AgentC');
    expect(cycle).toContain('AgentD');
  });

  test('应该允许无环的复杂依赖结构', () => {
    const graph = new DependencyGraph();

    // 创建一个复杂的 DAG（有向无环图）
    // Main -> A -> B -> Result
    // Main -> C -> D -> Result
    graph.addEdge('Main', 'A');
    graph.addEdge('Main', 'C');
    graph.addEdge('A', 'B');
    graph.addEdge('C', 'D');
    graph.addEdge('B', 'Result');
    graph.addEdge('D', 'Result');

    const cycle = graph.detectCycle();
    expect(cycle).toBeNull();

    // 验证拓扑排序成功
    const sorted = graph.topologicalSort();
    expect(sorted).not.toBeNull();
  });
});
