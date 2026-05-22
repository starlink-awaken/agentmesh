/**
 * BeadsAdapter 单元测试
 *
 * 测试 Beads 记忆系统适配器的所有功能
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BeadsAdapter, type BeadsConfig, type BeadsTask, type BeadsMetadata } from '../src/memory/adapters/index.js';

describe('BeadsAdapter', () => {
  let adapter: BeadsAdapter;
  let testConfig: BeadsConfig;

  beforeEach(() => {
    testConfig = {
      storagePath: '/tmp/test-beads',
      stealthMode: false,
      contributorMode: false,
      autoSync: false,
      syncOnClose: false,
      defaultPriority: 3,
      defaultType: 'task',
      maxContextTokens: 4000,
      includeRelated: true,
    };
    adapter = new BeadsAdapter(testConfig);
  });

  afterEach(async () => {
    // 清理测试数据
    await adapter.clear();
  });

  // ============================================================================
  // 构造函数测试
  // ============================================================================

  describe('constructor', () => {
    it('should create adapter with default config', () => {
      const defaultAdapter = new BeadsAdapter();
      expect(defaultAdapter).toBeDefined();
    });

    it('should create adapter with custom config', () => {
      expect(adapter).toBeDefined();
      expect(adapter.getConfig()).toEqual(testConfig);
    });

    it('should initialize with default values', () => {
      expect(adapter).toBeDefined();
    });
  });

  // ============================================================================
  // Hash ID 生成测试
  // ============================================================================

  describe('generateHashId', () => {
    it('should generate bd- prefix id', async () => {
      const task = await adapter.createTask({
        content: 'Test task content',
        type: 'task',
      });

      expect(task.id).toMatch(/^bd-[a-z0-9]+$/);
    });

    it('should generate unique ids for different content', async () => {
      const task1 = await adapter.createTask({ content: 'Task 1', type: 'task' });
      const task2 = await adapter.createTask({ content: 'Task 2', type: 'task' });

      expect(task1.id).not.toBe(task2.id);
    });
  });

  // ============================================================================
  // 任务创建测试
  // ============================================================================

  describe('createTask', () => {
    it('should create a task with required fields', async () => {
      const task = await adapter.createTask({
        content: 'Test task',
        type: 'task',
      });

      expect(task).toBeDefined();
      expect(task.id).toMatch(/^bd-/);
      expect(task.content).toBe('Test task');
      expect(task.type).toBe('task');
      expect(task.status).toBe('open');
      expect(task.priority).toBe(testConfig.defaultPriority);
    });

    it('should create task with custom priority', async () => {
      const task = await adapter.createTask({
        content: 'High priority task',
        type: 'task',
        priority: 1,
      });

      expect(task.priority).toBe(1);
    });

    it('should create task with parent id', async () => {
      const parent = await adapter.createTask({
        content: 'Parent task',
        type: 'epic',
      });

      const child = await adapter.createTask({
        content: 'Child task',
        type: 'subtask',
        parentId: parent.id,
      });

      expect(child.parentId).toBe(parent.id);
    });

    it('should create task with assignee', async () => {
      const task = await adapter.createTask({
        content: 'Assigned task',
        type: 'task',
        assignee: 'user@example.com',
      });

      expect(task.assignee).toBe('user@example.com');
    });

    it('should create different types of tasks', async () => {
      const epic = await adapter.createTask({ content: 'Epic', type: 'epic' });
      const task = await adapter.createTask({ content: 'Task', type: 'task' });
      const subtask = await adapter.createTask({ content: 'Subtask', type: 'subtask' });
      const message = await adapter.createTask({ content: 'Message', type: 'message' });

      expect(epic.type).toBe('epic');
      expect(task.type).toBe('task');
      expect(subtask.type).toBe('subtask');
      expect(message.type).toBe('message');
    });
  });

  // ============================================================================
  // 任务检索测试
  // ============================================================================

  describe('getTask', () => {
    it('should retrieve existing task by id', async () => {
      const created = await adapter.createTask({
        content: 'Test task',
        type: 'task',
      });

      const retrieved = await adapter.getTask(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.content).toBe('Test task');
    });

    it('should return undefined for non-existing id', async () => {
      const result = await adapter.getTask('bd-nonexistent');

      expect(result).toBeUndefined();
    });
  });

  // ============================================================================
  // 任务更新测试
  // ============================================================================

  describe('updateTask', () => {
    it('should update task content', async () => {
      const task = await adapter.createTask({
        content: 'Original content',
        type: 'task',
      });

      const updated = await adapter.updateTask(task.id, {
        content: 'Updated content',
      });

      expect(updated?.content).toBe('Updated content');
    });

    it('should update task status', async () => {
      const task = await adapter.createTask({
        content: 'Test task',
        type: 'task',
      });

      const updated = await adapter.updateTask(task.id, {
        status: 'in_progress',
      });

      expect(updated?.status).toBe('in_progress');
    });

    it('should update task priority', async () => {
      const task = await adapter.createTask({
        content: 'Test task',
        type: 'task',
        priority: 5,
      });

      const updated = await adapter.updateTask(task.id, {
        priority: 1,
      });

      expect(updated?.priority).toBe(1);
    });

    it('should close a task', async () => {
      const task = await adapter.createTask({
        content: 'Test task',
        type: 'task',
      });

      const closed = await adapter.closeTask(task.id);

      expect(closed?.status).toBe('closed');
      expect(closed?.closedAt).toBeDefined();
    });

    it('should return undefined for non-existing task update', async () => {
      const result = await adapter.updateTask('bd-nonexistent', {
        content: 'New content',
      });

      expect(result).toBeUndefined();
    });
  });

  // ============================================================================
  // 依赖图谱测试
  // ============================================================================

  describe('dependency graph', () => {
    it('should add block relationship', async () => {
      const blocker = await adapter.createTask({
        content: 'Blocker task',
        type: 'task',
      });
      const blocked = await adapter.createTask({
        content: 'Blocked task',
        type: 'task',
      });

      await adapter.addBlock(blocker.id, blocked.id);

      const canProceed = await adapter.canProceed(blocked.id);
      expect(canProceed).toBe(false);
    });

    it('should remove block relationship', async () => {
      const blocker = await adapter.createTask({
        content: 'Blocker task',
        type: 'task',
      });
      const blocked = await adapter.createTask({
        content: 'Blocked task',
        type: 'task',
      });

      await adapter.addBlock(blocker.id, blocked.id);
      await adapter.removeBlock(blocker.id, blocked.id);

      const canProceed = await adapter.canProceed(blocked.id);
      expect(canProceed).toBe(true);
    });

    it('should get all blocking tasks', async () => {
      const blocker1 = await adapter.createTask({ content: 'Blocker 1', type: 'task' });
      const blocker2 = await adapter.createTask({ content: 'Blocker 2', type: 'task' });
      const blocked = await adapter.createTask({ content: 'Blocked', type: 'task' });

      await adapter.addBlock(blocker1.id, blocked.id);
      await adapter.addBlock(blocker2.id, blocked.id);

      const blockers = await adapter.getBlockingTasks(blocked.id);
      expect(blockers.length).toBe(2);
    });

    it('should add relates_to relationship', async () => {
      const task1 = await adapter.createTask({ content: 'Task 1', type: 'task' });
      const task2 = await adapter.createTask({ content: 'Task 2', type: 'task' });

      await adapter.addRelation(task1.id, task2.id, 'relates_to');

      const related = await adapter.getRelatedTasks(task1.id);
      expect(related.some(t => t.id === task2.id)).toBe(true);
    });

    it('should add parent_child relationship', async () => {
      const parent = await adapter.createTask({ content: 'Parent', type: 'epic' });
      const child = await adapter.createTask({ content: 'Child', type: 'subtask' });

      await adapter.addRelation(parent.id, child.id, 'parent_child');

      const children = await adapter.getChildTasks(parent.id);
      expect(children.some(t => t.id === child.id)).toBe(true);
    });

    it('should add supersedes relationship', async () => {
      const oldTask = await adapter.createTask({ content: 'Old task', type: 'task' });
      const newTask = await adapter.createTask({ content: 'New task', type: 'task' });

      await adapter.addRelation(newTask.id, oldTask.id, 'supersedes');

      const superseded = await adapter.getSupersededTasks(newTask.id);
      expect(superseded.some(t => t.id === oldTask.id)).toBe(true);
    });
  });

  // ============================================================================
  // getReadyTasks 测试
  // ============================================================================

  describe('getReadyTasks', () => {
    it('should return tasks with no blockers', async () => {
      const task1 = await adapter.createTask({ content: 'Task 1', type: 'task' });
      const task2 = await adapter.createTask({ content: 'Task 2', type: 'task' });

      const ready = await adapter.getReadyTasks();

      expect(ready.length).toBeGreaterThanOrEqual(2);
      expect(ready.some(t => t.id === task1.id)).toBe(true);
      expect(ready.some(t => t.id === task2.id)).toBe(true);
    });

    it('should not return blocked tasks', async () => {
      const blocker = await adapter.createTask({ content: 'Blocker', type: 'task' });
      const blocked = await adapter.createTask({ content: 'Blocked', type: 'task' });

      await adapter.addBlock(blocker.id, blocked.id);

      const ready = await adapter.getReadyTasks();

      expect(ready.some(t => t.id === blocked.id)).toBe(false);
    });

    it('should not return completed tasks', async () => {
      const completed = await adapter.createTask({ content: 'Completed', type: 'task' });
      await adapter.closeTask(completed.id);

      const ready = await adapter.getReadyTasks();

      expect(ready.some(t => t.id === completed.id)).toBe(false);
    });
  });

  // ============================================================================
  // 上下文检索测试
  // ============================================================================

  describe('retrieveContext', () => {
    it('should retrieve task with related tasks', async () => {
      const task1 = await adapter.createTask({ content: 'Task 1', type: 'task' });
      const task2 = await adapter.createTask({ content: 'Task 2', type: 'task' });

      await adapter.addRelation(task1.id, task2.id, 'relates_to');

      const context = await adapter.retrieveContext(task1.id);

      expect(context.task).toBeDefined();
      expect(context.related.length).toBeGreaterThan(0);
    });

    it('should respect maxContextTokens', async () => {
      const task = await adapter.createTask({ content: 'Task', type: 'task' });

      const context = await adapter.retrieveContext(task.id, { maxTokens: 1000 });

      expect(context).toBeDefined();
    });

    it('should include parent task when available', async () => {
      const parent = await adapter.createTask({ content: 'Parent', type: 'epic' });
      const child = await adapter.createTask({ content: 'Child', type: 'subtask', parentId: parent.id });

      const context = await adapter.retrieveContext(child.id);

      expect(context.parent).toBeDefined();
      expect(context.parent?.id).toBe(parent.id);
    });
  });

  // ============================================================================
  // 列出任务测试
  // ============================================================================

  describe('listTasks', () => {
    it('should list all tasks', async () => {
      await adapter.createTask({ content: 'Task 1', type: 'task' });
      await adapter.createTask({ content: 'Task 2', type: 'task' });

      const tasks = await adapter.listTasks();

      expect(tasks.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by status', async () => {
      const task1 = await adapter.createTask({ content: 'Task 1', type: 'task' });
      await adapter.createTask({ content: 'Task 2', type: 'task' });
      await adapter.closeTask(task1.id);

      const openTasks = await adapter.listTasks({ status: 'open' });
      const closedTasks = await adapter.listTasks({ status: 'closed' });

      expect(openTasks.every(t => t.status === 'open')).toBe(true);
      expect(closedTasks.every(t => t.status === 'closed')).toBe(true);
    });

    it('should filter by type', async () => {
      await adapter.createTask({ content: 'Epic', type: 'epic' });
      await adapter.createTask({ content: 'Task', type: 'task' });

      const epics = await adapter.listTasks({ type: 'epic' });
      const tasks = await adapter.listTasks({ type: 'task' });

      expect(epics.every(t => t.type === 'epic')).toBe(true);
      expect(tasks.every(t => t.type === 'task')).toBe(true);
    });

    it('should filter by assignee', async () => {
      await adapter.createTask({ content: 'Assigned task', type: 'task', assignee: 'user1@example.com' });
      await adapter.createTask({ content: 'Other task', type: 'task' });

      const assignedTasks = await adapter.listTasks({ assignee: 'user1@example.com' });

      expect(assignedTasks.every(t => t.assignee === 'user1@example.com')).toBe(true);
    });
  });

  // ============================================================================
  // 删除任务测试
  // ============================================================================

  describe('deleteTask', () => {
    it('should delete existing task', async () => {
      const task = await adapter.createTask({ content: 'To delete', type: 'task' });

      const deleted = await adapter.deleteTask(task.id);

      expect(deleted).toBe(true);

      const retrieved = await adapter.getTask(task.id);
      expect(retrieved).toBeUndefined();
    });

    it('should return false for non-existing task', async () => {
      const result = await adapter.deleteTask('bd-nonexistent');

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // 持久化测试
  // ============================================================================

  describe('persistence', () => {
    it('should persist tasks to storage', async () => {
      await adapter.createTask({ content: 'Persisted task', type: 'task' });

      // 重新创建 adapter，应该能读取到之前的数据
      const newAdapter = new BeadsAdapter(testConfig);
      const tasks = await newAdapter.listTasks();

      expect(tasks.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // 边界情况测试
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty content', async () => {
      const task = await adapter.createTask({ content: '', type: 'task' });

      expect(task).toBeDefined();
      expect(task.content).toBe('');
    });

    it('should handle very long content', async () => {
      const longContent = 'a'.repeat(10000);
      const task = await adapter.createTask({ content: longContent, type: 'task' });

      expect(task.content.length).toBe(10000);
    });

    it('should handle circular dependencies', async () => {
      const task1 = await adapter.createTask({ content: 'Task 1', type: 'task' });
      const task2 = await adapter.createTask({ content: 'Task 2', type: 'task' });

      await adapter.addBlock(task1.id, task2.id);
      await adapter.addBlock(task2.id, task1.id);

      // 不应该崩溃，应该能够处理
      const ready = await adapter.getReadyTasks();
      expect(ready).toBeDefined();
    });

    it('should handle multiple relationships between same tasks', async () => {
      const task1 = await adapter.createTask({ content: 'Task 1', type: 'task' });
      const task2 = await adapter.createTask({ content: 'Task 2', type: 'task' });

      await adapter.addRelation(task1.id, task2.id, 'relates_to');
      await adapter.addRelation(task1.id, task2.id, 'parent_child');

      const related = await adapter.getRelatedTasks(task1.id);
      expect(related.length).toBeGreaterThan(0);
    });
  });
});
