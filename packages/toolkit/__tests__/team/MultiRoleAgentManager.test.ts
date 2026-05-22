/**
 * MultiRoleAgentManager Tests - 多角色 Agent 管理器单元测试
 *
 * @author PAI
 * @version 1.0.0
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { MultiRoleAgentManager } from '../../src/team/MultiRoleAgentManager.js';
import type { AgentRole, WorkflowPhase, IterationTask } from '../../src/team/types.js';

describe('MultiRoleAgentManager', () => {
  let manager: MultiRoleAgentManager;

  beforeEach(() => {
    manager = new MultiRoleAgentManager({ name: 'Test Team' });
  });

  describe('constructor', () => {
    test('should initialize with default config', () => {
      const mgr = new MultiRoleAgentManager();
      const info = mgr.getInfo();

      expect(info.name).toBe('Multi-Role Agent Team');
    });

    test('should initialize with custom config', () => {
      const mgr = new MultiRoleAgentManager({ name: 'Custom Team', model: 'opus' });
      const info = mgr.getInfo();

      expect(info.name).toBe('Custom Team');
    });

    test('should initialize all 10 agent roles', () => {
      const roles = manager.getAvailableRoles();

      expect(roles).toHaveLength(10);
      expect(roles).toContain('product_owner');
      expect(roles).toContain('developer');
      expect(roles).toContain('reviewer');
    });
  });

  describe('getAgentConfigs', () => {
    test('should return all agent configs', () => {
      const configs = manager.getAgentConfigs();

      expect(configs).toHaveLength(10);
      configs.forEach(config => {
        expect(config.role).toBeDefined();
        expect(config.name).toBeDefined();
        expect(config.description).toBeDefined();
        expect(config.systemPrompt).toBeDefined();
        expect(config.capabilities).toBeDefined();
      });
    });
  });

  describe('getAgentConfig', () => {
    test('should return config for specific role', () => {
      const config = manager.getAgentConfig('developer');

      expect(config).toBeDefined();
      expect(config?.role).toBe('developer');
      expect(config?.model).toBe('sonnet');
    });

    test('should return undefined for non-existent role', () => {
      const config = manager.getAgentConfig('non_existent_role' as AgentRole);
      expect(config).toBeUndefined();
    });
  });

  describe('getAvailableRoles', () => {
    test('should return all 10 roles', () => {
      const roles = manager.getAvailableRoles();

      expect(roles).toEqual(expect.arrayContaining([
        'product_owner',
        'spec_writer',
        'architect',
        'tech_lead',
        'developer',
        'code_monkey',
        'reviewer',
        'debugger',
        'troubleshooter',
        'tech_writer',
      ]));
    });
  });

  describe('getTeammatesByRole', () => {
    test('should return teammates for specific role', () => {
      const teammates = manager.getTeammatesByRole('developer');

      expect(teammates).toHaveLength(1);
      expect(teammates[0].role).toBe('developer');
    });
  });

  describe('phase management', () => {
    test('should get current phase', () => {
      const phase = manager.getCurrentPhase();
      expect(phase).toBe('requirements');
    });

    test('should set current phase', () => {
      manager.setCurrentPhase('implementation');
      expect(manager.getCurrentPhase()).toBe('implementation');
    });

    test('should get default role for phase', () => {
      expect(manager.getDefaultRoleForPhase('requirements')).toBe('product_owner');
      expect(manager.getDefaultRoleForPhase('architecture')).toBe('architect');
      expect(manager.getDefaultRoleForPhase('implementation')).toBe('developer');
      expect(manager.getDefaultRoleForPhase('review')).toBe('reviewer');
      expect(manager.getDefaultRoleForPhase('debugging')).toBe('debugger');
      expect(manager.getDefaultRoleForPhase('documentation')).toBe('tech_writer');
    });
  });

  describe('iteration task management', () => {
    test('should create iteration task', () => {
      const task = manager.createIterationTask(
        'implementation',
        'Implement feature X',
        'developer',
        3,
        true
      );

      expect(task).toBeDefined();
      expect(task.id).toMatch(/^iter_task_/);
      expect(task.phase).toBe('implementation');
      expect(task.description).toBe('Implement feature X');
      expect(task.agentRole).toBe('developer');
      expect(task.status).toBe('pending');
      expect(task.iterations).toBe(0);
      expect(task.maxIterations).toBe(3);
      expect(task.humanApprovalRequired).toBe(true);
    });

    test('should get all iteration tasks', () => {
      manager.createIterationTask('requirements', 'Task 1', 'product_owner');
      manager.createIterationTask('implementation', 'Task 2', 'developer');

      const tasks = manager.getIterationTasks();
      expect(tasks).toHaveLength(2);
    });

    test('should get tasks by phase', () => {
      manager.createIterationTask('requirements', 'Req Task', 'product_owner');
      manager.createIterationTask('implementation', 'Impl Task', 'developer');
      manager.createIterationTask('requirements', 'Req Task 2', 'spec_writer');

      const reqTasks = manager.getTasksByPhase('requirements');
      expect(reqTasks).toHaveLength(2);
    });

    test('should start task', () => {
      const task = manager.createIterationTask('implementation', 'Task', 'developer');
      const result = manager.startTask(task.id);

      expect(result).toBe(true);
      expect(task.status).toBe('in_progress');
      expect(task.iterations).toBe(1);
    });

    test('should not start task that is not pending', () => {
      const task = manager.createIterationTask('implementation', 'Task', 'developer');
      manager.startTask(task.id);

      const result = manager.startTask(task.id);
      expect(result).toBe(false);
    });

    test('should complete task', () => {
      const task = manager.createIterationTask('implementation', 'Task', 'developer');
      manager.startTask(task.id);

      const result = manager.completeTask(task.id, { success: true }, 'Great work');

      expect(result).toBe(true);
      expect(task.status).toBe('completed');
      expect(task.result).toEqual({ success: true });
      expect(task.feedback).toBe('Great work');
    });

    test('should mark task as reviewing', () => {
      const task = manager.createIterationTask('implementation', 'Task', 'developer');
      manager.startTask(task.id);

      const result = manager.markTaskAsReviewing(task.id);

      expect(result).toBe(true);
      expect(task.status).toBe('reviewing');
    });

    test('should approve task', () => {
      const task = manager.createIterationTask('implementation', 'Task', 'developer');
      manager.startTask(task.id);
      manager.markTaskAsReviewing(task.id);

      const result = manager.approveTask(task.id, true, 'Approved');

      expect(result).toBe(true);
      expect(task.status).toBe('completed');
      expect(task.approved).toBe(true);
    });

    test('should reject task and retry if iterations not exhausted', () => {
      const task = manager.createIterationTask('implementation', 'Task', 'developer', 3);
      manager.startTask(task.id);
      manager.markTaskAsReviewing(task.id);

      const result = manager.approveTask(task.id, false);

      expect(result).toBe(true);
      expect(task.status).toBe('pending');
      expect(task.approved).toBe(false);
    });

    test('should fail task if max iterations reached', () => {
      const task = manager.createIterationTask('implementation', 'Task', 'developer', 2);
      manager.startTask(task.id); // Iteration 1
      manager.markTaskAsReviewing(task.id);
      manager.approveTask(task.id, false); // Rejected, back to pending

      manager.startTask(task.id); // Iteration 2
      manager.markTaskAsReviewing(task.id);
      manager.approveTask(task.id, false); // Rejected, iteration = 2 = maxIterations

      expect(task.iterations).toBe(2);
      expect(task.status).toBe('failed');
    });

    test('should fail task', () => {
      const task = manager.createIterationTask('implementation', 'Task', 'developer');

      const result = manager.failTask(task.id, 'Task failed');

      expect(result).toBe(true);
      expect(task.status).toBe('failed');
      expect(task.feedback).toBe('Task failed');
    });

    test('should check if task requires human intervention', () => {
      const taskWithApproval = manager.createIterationTask(
        'implementation',
        'Task',
        'developer',
        3,
        true
      );
      const taskWithoutApproval = manager.createIterationTask(
        'implementation',
        'Task',
        'developer',
        3,
        false
      );

      expect(manager.requiresHumanIntervention(taskWithApproval.id)).toBe(true);

      manager.startTask(taskWithoutApproval.id);
      manager.markTaskAsReviewing(taskWithoutApproval.id);
      expect(manager.requiresHumanIntervention(taskWithoutApproval.id)).toBe(true);
    });

    test('should check max iterations', () => {
      const task = manager.createIterationTask('implementation', 'Task', 'developer', 1);

      expect(manager.hasReachedMaxIterations(task.id)).toBe(false);

      manager.startTask(task.id); // iterations = 1, status = in_progress
      expect(manager.hasReachedMaxIterations(task.id)).toBe(true); // 1 >= 1
    });
  });

  describe('human intervention', () => {
    test('should request human intervention', () => {
      const task = manager.createIterationTask('implementation', 'Task', 'developer');
      const request = manager.requestHumanIntervention(task.id, 'approval', 'Please approve', ['Yes', 'No']);

      expect(request).toBeDefined();
      expect(request.id).toMatch(/^intervention_/);
      expect(request.taskId).toBe(task.id);
      expect(request.type).toBe('approval');
      expect(request.message).toBe('Please approve');
      expect(request.options).toEqual(['Yes', 'No']);
      expect(request.resolved).toBe(false);
    });

    test('should respond to intervention', () => {
      const task = manager.createIterationTask('implementation', 'Task', 'developer');
      const request = manager.requestHumanIntervention(task.id, 'approval', 'Please approve');

      const result = manager.respondToIntervention(request.id, 'Yes');

      expect(result).toBe(true);
      expect(request.response).toBe('Yes');
      expect(request.resolved).toBe(true);
    });

    test('should update task status on approval response', () => {
      const task = manager.createIterationTask('implementation', 'Task', 'developer');
      manager.requestHumanIntervention(task.id, 'approval', 'Approve?');

      const interventions = manager.getPendingInterventions();
      const intervention = interventions[0];

      manager.respondToIntervention(intervention.id, 'approved');

      const updatedTask = manager.getIterationTasks()[0];
      expect(updatedTask.status).toBe('completed');
    });

    test('should get pending interventions', () => {
      const task1 = manager.createIterationTask('implementation', 'Task 1', 'developer');
      const task2 = manager.createIterationTask('implementation', 'Task 2', 'developer');

      manager.requestHumanIntervention(task1.id, 'approval', 'Approve 1');
      manager.requestHumanIntervention(task2.id, 'feedback', 'Feedback?');

      const pending = manager.getPendingInterventions();
      expect(pending).toHaveLength(2);
    });

    test('should get interventions for specific task', () => {
      const task = manager.createIterationTask('implementation', 'Task', 'developer');
      manager.requestHumanIntervention(task.id, 'approval', 'Approve');
      manager.requestHumanIntervention(task.id, 'feedback', 'Feedback');

      const interventions = manager.getInterventionsForTask(task.id);
      expect(interventions).toHaveLength(2);
    });
  });

  describe('progress tracking', () => {
    test('should get workflow progress', () => {
      manager.setCurrentPhase('implementation');
      const task1 = manager.createIterationTask('implementation', 'Task 1', 'developer');
      const task2 = manager.createIterationTask('implementation', 'Task 2', 'developer');

      manager.startTask(task1.id);
      manager.completeTask(task1.id);

      const progress = manager.getWorkflowProgress();
      expect(progress.phase).toBe('implementation');
      expect(progress.completed).toBe(1);
      expect(progress.total).toBe(2);
      expect(progress.percentage).toBe(50);
    });

    test('should get overall progress', () => {
      manager.createIterationTask('requirements', 'Req Task', 'product_owner');
      manager.createIterationTask('implementation', 'Impl Task', 'developer');

      const progress = manager.getOverallProgress();
      expect(progress.requirements.completed).toBe(0);
      expect(progress.requirements.total).toBe(1);
      expect(progress.implementation.completed).toBe(0);
      expect(progress.implementation.total).toBe(1);
    });

    test('should get task stats', () => {
      const task1 = manager.createIterationTask('requirements', 'Task 1', 'product_owner');
      manager.startTask(task1.id);

      const task2 = manager.createIterationTask('implementation', 'Task 2', 'developer');
      manager.startTask(task2.id);
      manager.completeTask(task2.id);

      const stats = manager.getTaskStats();
      // task1 is in_progress, task2 is completed
      expect(stats.pending).toBe(0);
      expect(stats.in_progress).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(0);
    });
  });

  describe('getTeamManager', () => {
    test('should return underlying TeamManager', () => {
      const teamManager = manager.getTeamManager();

      expect(teamManager).toBeDefined();
      expect(teamManager.getTeammates()).toHaveLength(10);
    });
  });

  describe('exportState', () => {
    test('should export complete state', () => {
      manager.createIterationTask('implementation', 'Task', 'developer');
      manager.requestHumanIntervention('iter_task_1', 'approval', 'Approve?');

      const state = manager.exportState();

      expect(state.agentConfigs).toHaveLength(10);
      expect(state.iterationTasks).toHaveLength(1);
      expect(state.humanInterventionRequests).toHaveLength(1);
      expect(state.currentPhase).toBe('requirements');
    });
  });

  describe('getInfo', () => {
    test('should return complete info', () => {
      const info = manager.getInfo();

      expect(info.name).toBe('Test Team');
      expect(info.currentPhase).toBe('requirements');
      expect(info.agentCount).toBe(10);
      expect(info.taskStats).toBeDefined();
      expect(info.pendingInterventions).toBe(0);
    });
  });
});
