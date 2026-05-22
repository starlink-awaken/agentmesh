/**
 * TeamManager Tests - 团队管理器单元测试
 *
 * @author PAI
 * @version 1.0.0
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { TeamManager, type Teammate, type TeamTask } from '../../src/team/TeamManager.js';

describe('TeamManager', () => {
  let manager: TeamManager;

  beforeEach(() => {
    manager = new TeamManager({
      name: 'Test Team',
      description: 'Test team description',
      model: 'sonnet',
    });
  });

  describe('addTeammate', () => {
    test('should add a new teammate', () => {
      const teammate = manager.addTeammate('Alice', 'developer');

      expect(teammate).toBeDefined();
      expect(teammate.id).toBe('teammate_1');
      expect(teammate.name).toBe('Alice');
      expect(teammate.role).toBe('developer');
      expect(teammate.status).toBe('idle');
    });

    test('should add multiple teammates with unique IDs', () => {
      const alice = manager.addTeammate('Alice', 'developer');
      const bob = manager.addTeammate('Bob', 'reviewer');

      expect(alice.id).not.toBe(bob.id);
      expect(manager.getTeammates()).toHaveLength(2);
    });

    test('should accept context for teammate', () => {
      const context = { skills: ['typescript', 'react'] };
      const teammate = manager.addTeammate('Alice', 'developer', context);

      expect(teammate.context).toEqual(context);
    });
  });

  describe('getTeammates', () => {
    test('should return empty array initially', () => {
      expect(manager.getTeammates()).toEqual([]);
    });

    test('should return all added teammates', () => {
      manager.addTeammate('Alice', 'developer');
      manager.addTeammate('Bob', 'reviewer');
      manager.addTeammate('Charlie', 'architect');

      const teammates = manager.getTeammates();
      expect(teammates).toHaveLength(3);
    });
  });

  describe('getTeammatesByRole', () => {
    test('should filter teammates by role', () => {
      manager.addTeammate('Alice', 'developer');
      manager.addTeammate('Bob', 'reviewer');
      manager.addTeammate('Charlie', 'developer');

      const developers = manager.getTeammatesByRole('developer');
      expect(developers).toHaveLength(2);
      expect(developers.every(t => t.role === 'developer')).toBe(true);
    });

    test('should return empty array for non-existent role', () => {
      manager.addTeammate('Alice', 'developer');
      const reviewers = manager.getTeammatesByRole('reviewer');
      expect(reviewers).toHaveLength(0);
    });
  });

  describe('updateTeammateStatus', () => {
    test('should update teammate status', () => {
      const teammate = manager.addTeammate('Alice', 'developer');
      manager.updateTeammateStatus(teammate.id, 'working', 'task_1');

      expect(teammate.status).toBe('working');
      expect(teammate.currentTask).toBe('task_1');
    });

    test('should do nothing for non-existent teammate', () => {
      manager.addTeammate('Alice', 'developer');
      expect(() => {
        manager.updateTeammateStatus('non_existent', 'working');
      }).not.toThrow();
    });
  });

  describe('removeTeammate', () => {
    test('should remove existing teammate', () => {
      const teammate = manager.addTeammate('Alice', 'developer');
      const result = manager.removeTeammate(teammate.id);

      expect(result).toBe(true);
      expect(manager.getTeammates()).toHaveLength(0);
    });

    test('should return false for non-existent teammate', () => {
      const result = manager.removeTeammate('non_existent');
      expect(result).toBe(false);
    });
  });

  describe('createTask', () => {
    test('should create a task with default values', () => {
      const task = manager.createTask('Test Task', 'Test description');

      expect(task).toBeDefined();
      expect(task.id).toBe('task_1');
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('Test description');
      expect(task.status).toBe('pending');
      expect(task.priority).toBe('medium');
      expect(task.dependencies).toEqual([]);
    });

    test('should create task with custom priority', () => {
      const task = manager.createTask('Test', '', 'high');
      expect(task.priority).toBe('high');
    });

    test('should create task with dependencies', () => {
      const depTask = manager.createTask('Dependency');
      const task = manager.createTask('Main Task', '', 'medium', [depTask.id]);

      expect(task.dependencies).toContain(depTask.id);
    });

    test('should create multiple tasks with unique IDs', () => {
      const task1 = manager.createTask('Task 1');
      const task2 = manager.createTask('Task 2');

      expect(task1.id).not.toBe(task2.id);
    });
  });

  describe('getTasks', () => {
    test('should return all tasks', () => {
      manager.createTask('Task 1');
      manager.createTask('Task 2');
      manager.createTask('Task 3');

      expect(manager.getTasks()).toHaveLength(3);
    });
  });

  describe('getAvailableTasks', () => {
    test('should return pending tasks with no dependencies', () => {
      manager.createTask('Task 1');
      manager.createTask('Task 2');

      const available = manager.getAvailableTasks();
      expect(available).toHaveLength(2);
    });

    test('should not return tasks with incomplete dependencies', () => {
      const depTask = manager.createTask('Dependency');
      manager.createTask('Dependent Task', '', 'medium', [depTask.id]);

      const available = manager.getAvailableTasks();
      expect(available).toHaveLength(1);
      expect(available[0].title).toBe('Dependency');
    });

    test('should return tasks when all dependencies are completed', () => {
      const depTask = manager.createTask('Dependency');
      const dependentTask = manager.createTask('Dependent Task', '', 'medium', [depTask.id]);

      manager.completeTask(depTask.id);

      const available = manager.getAvailableTasks();
      expect(available.map(t => t.id)).toContain(dependentTask.id);
    });
  });

  describe('assignTask', () => {
    test('should assign task to teammate', () => {
      const teammate = manager.addTeammate('Alice', 'developer');
      const task = manager.createTask('Test Task');

      const result = manager.assignTask(task.id, teammate.id);

      expect(result).toBe(true);
      expect(task.assignee).toBe(teammate.id);
      expect(task.status).toBe('in_progress');
      expect(teammate.status).toBe('working');
    });

    test('should fail if task does not exist', () => {
      const teammate = manager.addTeammate('Alice', 'developer');
      const result = manager.assignTask('non_existent', teammate.id);
      expect(result).toBe(false);
    });

    test('should fail if teammate does not exist', () => {
      const task = manager.createTask('Test Task');
      const result = manager.assignTask(task.id, 'non_existent');
      expect(result).toBe(false);
    });

    test('should block task if dependencies not met', () => {
      const depTask = manager.createTask('Dependency');
      const task = manager.createTask('Dependent Task', '', 'medium', [depTask.id]);
      const teammate = manager.addTeammate('Alice', 'developer');

      const result = manager.assignTask(task.id, teammate.id);

      expect(result).toBe(false);
      expect(task.status).toBe('blocked');
    });
  });

  describe('completeTask', () => {
    test('should mark task as completed', () => {
      const teammate = manager.addTeammate('Alice', 'developer');
      const task = manager.createTask('Test Task');
      manager.assignTask(task.id, teammate.id);

      const result = manager.completeTask(task.id, { success: true });

      expect(result).toBe(true);
      expect(task.status).toBe('completed');
      expect(task.result).toEqual({ success: true });
      expect(teammate.status).toBe('idle');
    });

    test('should return false for non-existent task', () => {
      const result = manager.completeTask('non_existent');
      expect(result).toBe(false);
    });

    test('should unblock dependent tasks', () => {
      const depTask = manager.createTask('Dependency');
      const dependentTask = manager.createTask('Dependent Task', '', 'medium', [depTask.id]);
      const teammate = manager.addTeammate('Alice', 'developer');

      // Assign dependent task first (should block)
      manager.assignTask(dependentTask.id, teammate.id);
      expect(dependentTask.status).toBe('blocked');

      // Complete dependency
      manager.completeTask(depTask.id);

      // Dependent task should be unblocked
      expect(dependentTask.status).toBe('pending');
    });
  });

  describe('addDependency', () => {
    test('should add dependency to task', () => {
      const task = manager.createTask('Task');
      const depTask = manager.createTask('Dependency');

      manager.addDependency(task.id, depTask.id);

      expect(task.dependencies).toContain(depTask.id);
    });

    test('should block task if new dependency is not completed', () => {
      const task = manager.createTask('Task');
      const depTask = manager.createTask('Dependency');

      manager.addDependency(task.id, depTask.id);

      expect(task.status).toBe('blocked');
    });

    test('should not add duplicate dependency', () => {
      const task = manager.createTask('Task');
      const depTask = manager.createTask('Dependency');

      manager.addDependency(task.id, depTask.id);
      manager.addDependency(task.id, depTask.id);

      expect(task.dependencies.filter(d => d === depTask.id)).toHaveLength(1);
    });
  });

  describe('getTaskStats', () => {
    test('should return correct statistics', () => {
      manager.createTask('Task 1', '', 'high'); // pending
      manager.createTask('Task 2', '', 'medium'); // pending

      const task1 = manager.createTask('Task 3');
      const teammate = manager.addTeammate('Alice', 'developer');
      manager.assignTask(task1.id, teammate.id); // in_progress

      manager.completeTask(task1.id); // completed

      const taskBlocked = manager.createTask('Task Blocked');
      const depTask = manager.createTask('Dep');
      manager.addDependency(taskBlocked.id, depTask.id); // blocked

      const stats = manager.getTaskStats();
      expect(stats.pending).toBe(3);
      expect(stats.inProgress).toBe(0);
      expect(stats.completed).toBe(1);
      expect(stats.blocked).toBe(1);
    });
  });

  describe('sendMessage', () => {
    test('should send direct message', () => {
      const message = manager.sendMessage('Alice', 'Bob', 'Hello');

      expect(message).toBeDefined();
      expect(message.from).toBe('Alice');
      expect(message.to).toBe('Bob');
      expect(message.content).toBe('Hello');
      expect(message.read).toBe(false);
    });

    test('should send broadcast message', () => {
      const message = manager.sendMessage('Alice', 'broadcast', 'Hello everyone');

      expect(message.to).toBe('broadcast');
    });
  });

  describe('getMessages', () => {
    test('should return all messages without filter', () => {
      manager.sendMessage('Alice', 'Bob', 'Hello');
      manager.sendMessage('Bob', 'Alice', 'Hi');

      const messages = manager.getMessages();
      expect(messages).toHaveLength(2);
    });

    test('should filter messages for specific teammate', () => {
      manager.sendMessage('Alice', 'Bob', 'Hello');
      manager.sendMessage('Bob', 'Alice', 'Hi');
      manager.sendMessage('Charlie', 'Alice', 'From Charlie');

      const aliceMessages = manager.getMessages('Alice');
      expect(aliceMessages).toHaveLength(3);
    });
  });

  describe('markAsRead', () => {
    test('should mark message as read', () => {
      const message = manager.sendMessage('Alice', 'Bob', 'Hello');

      const result = manager.markAsRead(message.id);

      expect(result).toBe(true);
      expect(message.read).toBe(true);
    });

    test('should return false for non-existent message', () => {
      const result = manager.markAsRead('non_existent');
      expect(result).toBe(false);
    });
  });

  describe('getInfo', () => {
    test('should return team information', () => {
      manager.addTeammate('Alice', 'developer');
      manager.createTask('Task 1');

      const info = manager.getInfo();
      expect(info.config.name).toBe('Test Team');
      expect(info.memberCount).toBe(1);
      expect(info.taskStats.pending).toBe(1);
    });
  });

  describe('exportState and fromState', () => {
    test('should export and restore state', () => {
      manager.addTeammate('Alice', 'developer');
      const task = manager.createTask('Test Task');
      manager.sendMessage('Alice', 'Bob', 'Hello');

      const state = manager.exportState();
      const restored = TeamManager.fromState(state);

      expect(restored.getTeammates()).toHaveLength(1);
      expect(restored.getTasks()).toHaveLength(1);
      expect(restored.getMessages()).toHaveLength(1);
    });
  });
});
