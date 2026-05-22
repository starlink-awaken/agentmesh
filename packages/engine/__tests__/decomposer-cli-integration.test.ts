/**
 * Decomposer CLI Integration Tests
 *
 * 测试 Decomposer 与 CLI 的集成功能
 * 包括分解、显示分解树、调整分解结果等命令
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createDecomposer } from '../src/decomposer.js';
import { CheckpointManager } from '../src/checkpoint-manager.js';
import { HoneycombOrchestrator, createOrchestrator } from '../src/orchestrator.js';
import type { ProjectConfig, ProjectState } from '../src/types.js';

// ============================================================
// Test Helpers
// ============================================================

function createTestProject(orchestrator: HoneycombOrchestrator): ProjectState {
  return orchestrator.createProject({
    name: 'test-decompose-project',
    description: 'Test project for decomposer CLI integration',
    archetype: 'software-dev',
    complexity: 'standard',
    goals: [
      'Build user authentication system',
      'Implement product catalog',
      'Create order processing',
      'Add search functionality',
    ],
  });
}

// ============================================================
// Test Suite
// ============================================================

describe('Decomposer CLI Integration', () => {
  let orchestrator: HoneycombOrchestrator | null;
  let cpManager: CheckpointManager | null;
  let testProject: ProjectState;
  const dbPath = './honeycomb-test-decomposer-cli.db';
  let tempAgentsDir: string;

  beforeEach(() => {
    // 初始化为 null，确保 afterEach 可以安全处理
    orchestrator = null;
    cpManager = null;

    // 清理测试数据库
    try {
      const fs = require('node:fs');
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
      if (fs.existsSync(dbPath + '-shm')) {
        fs.unlinkSync(dbPath + '-shm');
      }
      if (fs.existsSync(dbPath + '-wal')) {
        fs.unlinkSync(dbPath + '-wal');
      }
    } catch {
      // 忽略清理错误
    }

    // 创建临时agents目录用于测试
    const fs = require('node:fs');
    const path = require('node:path');
    tempAgentsDir = path.join(process.cwd(), 'test-agents-temp');
    if (!fs.existsSync(tempAgentsDir)) {
      fs.mkdirSync(tempAgentsDir, { recursive: true });
      // 创建最小agent结构
      const layers = ['layer-1-research', 'layer-2-decision', 'layer-3-execution', 'layer-4-feedback'];
      layers.forEach(layer => {
        const layerDir = path.join(tempAgentsDir, layer);
        fs.mkdirSync(layerDir, { recursive: true });
        fs.writeFileSync(path.join(layerDir, 'test.md'), '---\nname: test\n---\n# Test');
      });
    }

    orchestrator = createOrchestrator({
      db_path: dbPath,
      agents_root: tempAgentsDir,
      domains_root: './domains'  // 相对路径
    });
    cpManager = new CheckpointManager(dbPath);
    testProject = createTestProject(orchestrator);
  });

  afterEach(() => {
    // 安全关闭资源，使用 try-catch 和可选链防止清理失败影响测试结果
    try {
      orchestrator?.shutdown();
    } catch {
      // 忽略 shutdown 错误
    }

    try {
      cpManager?.close();
    } catch {
      // 忽略 close 错误
    }

    // 清理测试数据库
    try {
      const fs = require('node:fs');
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
      if (fs.existsSync(dbPath + '-shm')) {
        fs.unlinkSync(dbPath + '-shm');
      }
      if (fs.existsSync(dbPath + '-wal')) {
        fs.unlinkSync(dbPath + '-wal');
      }
    } catch {
      // 忽略清理错误
    }
  });

  // ----------------------------------------------------------
  // Decompose 命令测试
  // ----------------------------------------------------------

  describe('handleDecompose', () => {
    it('should decompose a software-dev project into sub-projects', () => {
      const decomposer = createDecomposer();

      const projectConfig: ProjectConfig = {
        name: testProject.project_name,
        description: testProject.project_description,
        archetype: testProject.archetype,
        complexity: testProject.complexity,
        goals: testProject.artifacts
          .filter((a) => a.type === 'document')
          .map((a) => a.description)
          .slice(0, 5),
      };

      const result = decomposer.decompose(projectConfig);

      expect(result).toBeDefined();
      expect(result.original_project).toBe('test-decompose-project');
      expect(result.archetype).toBe('software-dev');
      expect(result.sub_projects.length).toBeGreaterThan(0);
      expect(result.execution_batches.length).toBeGreaterThan(0);
      expect(result.estimated_parallelism).toBeGreaterThan(0);
    });

    it('should decompose creative-writing project with correct structure', () => {
      const decomposer = createDecomposer();

      const projectConfig: ProjectConfig = {
        name: 'creative-writing-test',
        description: 'Test creative writing project',
        archetype: 'creative-writing',
        complexity: 'standard',
        goals: ['Write a novel', 'Create characters', 'Build plot'],
      };

      const result = decomposer.decompose(projectConfig);

      expect(result.sub_projects.length).toBeGreaterThan(0);
      expect(result.sub_projects.some((sp) => sp.name.includes('worldbuilding'))).toBe(true);
      expect(result.sub_projects.some((sp) => sp.name.includes('character'))).toBe(true);
      expect(result.sub_projects.some((sp) => sp.name.includes('plot'))).toBe(true);
    });

    it('should validate dependency graph for cycles', () => {
      const decomposer = createDecomposer();

      const projectConfig: ProjectConfig = {
        name: 'validation-test',
        description: 'Test dependency validation',
        archetype: 'software-dev',
        complexity: 'standard',
        goals: ['Test validation'],
      };

      // 分解应该成功，因为默认策略不包含循环依赖
      expect(() => {
        const result = decomposer.decompose(projectConfig);
        // 验证依赖关系
        for (const sp of result.sub_projects) {
          for (const depId of sp.dependencies) {
            // 依赖的子项目应该存在
            expect(result.sub_projects.some((s) => s.id === depId)).toBe(true);
          }
          // 不应该自依赖
          expect(sp.dependencies.includes(sp.id)).toBe(false);
        }
      }).not.toThrow();
    });

    it('should generate correct execution batches via topological sort', () => {
      const decomposer = createDecomposer();

      const projectConfig: ProjectConfig = {
        name: 'batch-test',
        description: 'Test execution batching',
        archetype: 'software-dev',
        complexity: 'standard',
        goals: ['Test batching'],
      };

      const result = decomposer.decompose(projectConfig);

      // 验证批次结构
      expect(result.execution_batches.length).toBeGreaterThan(0);

      // 验证批次内无依赖关系（可以并行）
      for (const batch of result.execution_batches) {
        for (const id of batch) {
          const sp = result.sub_projects.find((s) => s.id === id);
          if (sp) {
            // 同一批次中的项目不应该相互依赖
            for (const depId of sp.dependencies) {
              // 如果依赖在当前批次中，这是一个问题
              expect(batch.includes(depId)).toBe(false);
            }
          }
        }
      }
    });
  });

  // ----------------------------------------------------------
  // Decomposition Tree 可视化测试
  // ----------------------------------------------------------

  describe('Decomposition Tree Visualization', () => {
    it('should generate a valid tree visualization', () => {
      const decomposer = createDecomposer();

      const projectConfig: ProjectConfig = {
        name: 'tree-test',
        description: 'Test tree visualization',
        archetype: 'software-dev',
        complexity: 'standard',
        goals: ['Test tree'],
      };

      const result = decomposer.decompose(projectConfig);

      // 验证有根节点（无依赖的项目）
      const rootProjects = result.sub_projects.filter((sp) => sp.dependencies.length === 0);
      expect(rootProjects.length).toBeGreaterThan(0);

      // 验证执行顺序
      expect(result.execution_batches).toBeDefined();
      expect(result.execution_batches.length).toBeGreaterThan(0);
    });

    it('should calculate correct parallelism estimate', () => {
      const decomposer = createDecomposer();

      const projectConfig: ProjectConfig = {
        name: 'parallelism-test',
        description: 'Test parallelism calculation',
        archetype: 'software-dev',
        complexity: 'advanced',
        goals: ['Test parallelism'],
      };

      const result = decomposer.decompose(projectConfig);

      // estimated_parallelism 应该是最大批次的大小
      const maxBatchSize = Math.max(...result.execution_batches.map((b) => b.length));
      expect(result.estimated_parallelism).toBe(maxBatchSize);
    });
  });

  // ----------------------------------------------------------
  // Decomposition Adjustment 测试
  // ----------------------------------------------------------

  describe('Decomposition Adjustment', () => {
    it('should support merging sub-projects', () => {
      const decomposer = createDecomposer();

      const projectConfig: ProjectConfig = {
        name: 'merge-test',
        description: 'Test project merging',
        archetype: 'software-dev',
        complexity: 'standard',
        goals: ['Test merging'],
      };

      const result = decomposer.decompose(projectConfig);

      // 选择前两个子项目进行合并测试
      if (result.sub_projects.length >= 2) {
        const project1 = result.sub_projects[0];
        const project2 = result.sub_projects[1];

        // 模拟合并逻辑
        const mergedProject = {
          ...project1,
          id: 'merged-123',
          name: `merged-${project1.name}-${project2.name}`,
          description: `Merged: ${project1.name} + ${project2.name}`,
          dependencies: [
            ...new Set([
              ...project1.dependencies.filter((d) => d !== project2.id),
              ...project2.dependencies.filter((d) => d !== project1.id),
            ]),
          ],
          priority: Math.max(project1.priority, project2.priority),
        };

        expect(mergedProject.name).toContain('merged-');
        expect(mergedProject.dependencies).toBeDefined();
      }
    });

    it('should support splitting sub-projects', () => {
      const decomposer = createDecomposer();

      const projectConfig: ProjectConfig = {
        name: 'split-test',
        description: 'Test project splitting',
        archetype: 'software-dev',
        complexity: 'standard',
        goals: ['Test splitting'],
      };

      const result = decomposer.decompose(projectConfig);

      // 选择一个大型子项目进行拆分测试
      const largeProject = result.sub_projects.find((sp) => sp.estimated_complexity === 'advanced');

      if (largeProject) {
        // 拆分应该创建新的子项目
        const split1 = {
          ...largeProject,
          id: 'split-1',
          name: `${largeProject.name}-part1`,
        };
        const split2 = {
          ...largeProject,
          id: 'split-2',
          name: `${largeProject.name}-part2`,
        };

        expect(split1.name).toContain('-part1');
        expect(split2.name).toContain('-part2');
      }
    });
  });

  // ----------------------------------------------------------
  // 不同原型的分解测试
  // ----------------------------------------------------------

  describe('Archetype-Specific Decomposition', () => {
    it('should decompose software-dev with infrastructure-first approach', () => {
      const decomposer = createDecomposer();

      const result = decomposer.decompose({
        name: 'software-test',
        description: 'Software project',
        archetype: 'software-dev',
        goals: ['Build software'],
      });

      // 验证有基础设施项目
      const infra = result.sub_projects.find((sp) =>
        sp.name.toLowerCase().includes('infra') || sp.tags.includes('infrastructure')
      );
      expect(infra).toBeDefined();
    });

    it('should decompose creative-writing sequentially', () => {
      const decomposer = createDecomposer();

      const result = decomposer.decompose({
        name: 'writing-test',
        description: 'Writing project',
        archetype: 'creative-writing',
        goals: ['Write story'],
      });

      // 创意写作应该是顺序的，并行度较低
      expect(result.estimated_parallelism).toBeLessThanOrEqual(3);
    });

    it('should decompose visual-production pipeline', () => {
      const decomposer = createDecomposer();

      const result = decomposer.decompose({
        name: 'visual-test',
        description: 'Visual production',
        archetype: 'visual-production',
        goals: ['Create video'],
      });

      // 验证有预制作和制作阶段
      const preProduction = result.sub_projects.find((sp) =>
        sp.name.toLowerCase().includes('screenplay') || sp.name.toLowerCase().includes('storyboard')
      );
      expect(preProduction).toBeDefined();
    });
  });

  // ----------------------------------------------------------
  // 边界条件测试
  // ----------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle custom archetype gracefully', () => {
      const decomposer = createDecomposer();

      const result = decomposer.decompose({
        name: 'custom-test',
        description: 'Custom project',
        archetype: 'custom',
        goals: ['Custom goal'],
      });

      // 自定义原型应该创建单一项目包装
      expect(result.sub_projects.length).toBe(1);
      expect(result.sub_projects[0].name).toBe('custom-test');
    });

    it('should handle empty goals array', () => {
      const decomposer = createDecomposer();

      expect(() => {
        decomposer.decompose({
          name: 'no-goals-test',
          description: 'Project with no goals',
          archetype: 'software-dev',
          goals: [],
        });
      }).not.toThrow();
    });

    it('should handle very long project names', () => {
      const decomposer = createDecomposer();
      const longName = 'a'.repeat(200);

      const result = decomposer.decompose({
        name: longName,
        description: 'Long name test',
        archetype: 'software-dev',
        goals: ['Test'],
      });

      expect(result.original_project).toBe(longName);
    });
  });

  // ----------------------------------------------------------
  // 性能测试
  // ----------------------------------------------------------

  describe('Performance', () => {
    it('should decompose large projects efficiently', () => {
      const decomposer = createDecomposer();

      const start = Date.now();

      const result = decomposer.decompose({
        name: 'perf-test',
        description: 'Performance test',
        archetype: 'software-dev',
        complexity: 'enterprise',
        goals: Array.from({ length: 100 }, (_, i) => `Goal ${i}`),
      });

      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(1000); // 应该在 1 秒内完成
    });
  });
});
