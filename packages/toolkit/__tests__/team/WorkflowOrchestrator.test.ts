/**
 * WorkflowOrchestrator Tests - 工作流编排器单元测试
 *
 * @author PAI
 * @version 1.0.0
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { WorkflowOrchestrator } from '../../src/team/WorkflowOrchestrator.js';
import { MultiRoleAgentManager } from '../../src/team/MultiRoleAgentManager.js';
import type { WorkflowPhase, HumanInterventionRequest } from '../../src/team/types.js';

describe('WorkflowOrchestrator', () => {
  let manager: MultiRoleAgentManager;
  let orchestrator: WorkflowOrchestrator;

  beforeEach(() => {
    manager = new MultiRoleAgentManager({ name: 'Test Team' });
    orchestrator = new WorkflowOrchestrator(manager);
  });

  describe('constructor', () => {
    test('should initialize with default phase sequence', () => {
      expect(orchestrator.getPhaseSequence()).toEqual([
        'requirements',
        'architecture',
        'implementation',
        'review',
        'debugging',
        'documentation',
      ]);
    });

    test('should start at first phase', () => {
      expect(orchestrator.getCurrentPhase()).toBe('requirements');
    });

    test('should accept custom phase sequence', () => {
      const customPhases: WorkflowPhase[] = ['requirements', 'implementation', 'review'];
      const customOrchestrator = new WorkflowOrchestrator(manager, {
        phaseSequence: customPhases,
      });

      expect(customOrchestrator.getPhaseSequence()).toEqual(customPhases);
    });

    test('should initialize manager current phase', () => {
      expect(manager.getCurrentPhase()).toBe('requirements');
    });
  });

  describe('getCurrentPhase', () => {
    test('should return current phase', () => {
      expect(orchestrator.getCurrentPhase()).toBe('requirements');
    });
  });

  describe('getCurrentPhaseIndex', () => {
    test('should return 0 at start', () => {
      expect(orchestrator.getCurrentPhaseIndex()).toBe(0);
    });
  });

  describe('getPhaseSequence', () => {
    test('should return copy of phase sequence', () => {
      const sequence = orchestrator.getPhaseSequence();
      sequence.push('new_phase');

      expect(orchestrator.getPhaseSequence()).not.toContain('new_phase');
    });
  });

  describe('canAdvance', () => {
    test('should return false when no tasks exist', () => {
      expect(orchestrator.canAdvance()).toBe(false);
    });

    test('should return true when all current phase tasks completed', () => {
      const task = manager.createIterationTask('requirements', 'Req Task', 'product_owner');
      manager.startTask(task.id);
      manager.completeTask(task.id);

      expect(orchestrator.canAdvance()).toBe(true);
    });

    test('should return false when not all tasks completed', () => {
      manager.createIterationTask('requirements', 'Task 1', 'product_owner');
      manager.createIterationTask('requirements', 'Task 2', 'spec_writer');
      const task1 = manager.getIterationTasks()[0];
      manager.startTask(task1.id);
      manager.completeTask(task1.id);

      expect(orchestrator.canAdvance()).toBe(false);
    });

    test('should return false at final phase', () => {
      // Jump to final phase
      orchestrator.jumpToPhase('documentation');

      expect(orchestrator.canAdvance()).toBe(false);
    });
  });

  describe('advance', () => {
    test('should advance when conditions met and no approval required', () => {
      // implementation -> review has humanApprovalRequired: false
      orchestrator.jumpToPhase('implementation');

      const task = manager.createIterationTask('implementation', 'Task', 'developer');
      manager.startTask(task.id);
      manager.completeTask(task.id);

      const result = orchestrator.advance();

      expect(result.success).toBe(true);
      expect(result.newPhase).toBe('review');
    });

    test('should require approval when rule demands it', () => {
      const task = manager.createIterationTask('requirements', 'Task', 'product_owner');
      manager.startTask(task.id);
      manager.completeTask(task.id);

      const result = orchestrator.advance();

      expect(result.success).toBe(false);
      expect(result.requiresApproval).toBe(true);
      expect(result.reason).toBe('Human approval required');
    });

    test('should fail at final phase', () => {
      orchestrator.jumpToPhase('documentation');

      const result = orchestrator.advance();

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Already at final phase');
    });

    test('should fail when transition rule not defined', () => {
      // Create orchestrator with limited phases
      const limitedOrchestrator = new WorkflowOrchestrator(manager, {
        phaseSequence: ['requirements', 'implementation'],
      });

      const result = limitedOrchestrator.advance();
      expect(result.success).toBe(false);
    });

    test('should fail when conditions not met', () => {
      manager.createIterationTask('requirements', 'Task', 'product_owner');

      const result = orchestrator.advance();

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Transition conditions not met');
    });
  });

  describe('approveAdvance', () => {
    test('should advance after approval', () => {
      const task = manager.createIterationTask('requirements', 'Task', 'product_owner');
      manager.startTask(task.id);
      manager.completeTask(task.id);

      // First try advance (should require approval)
      orchestrator.advance();

      // Then approve
      const result = orchestrator.approveAdvance();

      expect(result.success).toBe(true);
      expect(result.newPhase).toBe('architecture');
    });

    test('should fail at final phase', () => {
      orchestrator.jumpToPhase('documentation');

      const result = orchestrator.approveAdvance();
      expect(result.success).toBe(false);
    });
  });

  describe('jumpToPhase', () => {
    test('should jump to valid phase', () => {
      const result = orchestrator.jumpToPhase('implementation');

      expect(result).toBe(true);
      expect(orchestrator.getCurrentPhase()).toBe('implementation');
    });

    test('should return false for invalid phase', () => {
      const result = orchestrator.jumpToPhase('invalid_phase' as WorkflowPhase);

      expect(result).toBe(false);
    });

    test('should trigger phase change callback', () => {
      let callbackFired = false;
      let fromPhase: WorkflowPhase | undefined;
      let toPhase: WorkflowPhase | undefined;

      const orch = new WorkflowOrchestrator(manager, {
        onPhaseChange: (from, to) => {
          callbackFired = true;
          fromPhase = from;
          toPhase = to;
        },
      });

      orch.jumpToPhase('implementation');

      expect(callbackFired).toBe(true);
      expect(fromPhase).toBe('requirements');
      expect(toPhase).toBe('implementation');
    });
  });

  describe('getCurrentPhaseTasks', () => {
    test('should return tasks for current phase', () => {
      manager.createIterationTask('requirements', 'Task 1', 'product_owner');
      manager.createIterationTask('implementation', 'Task 2', 'developer');

      const tasks = orchestrator.getCurrentPhaseTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].phase).toBe('requirements');
    });
  });

  describe('getPhaseProgress', () => {
    test('should return progress for current phase', () => {
      manager.createIterationTask('requirements', 'Task 1', 'product_owner');
      manager.createIterationTask('requirements', 'Task 2', 'spec_writer');

      const task1 = manager.getIterationTasks()[0];
      manager.startTask(task1.id);
      manager.completeTask(task1.id);

      const progress = orchestrator.getPhaseProgress();

      expect(progress.completed).toBe(1);
      expect(progress.total).toBe(2);
      expect(progress.percentage).toBe(50);
    });

    test('should handle empty phase with 0%', () => {
      orchestrator.jumpToPhase('documentation');

      const progress = orchestrator.getPhaseProgress();

      expect(progress.percentage).toBe(0);
    });
  });

  describe('getWorkflowProgress', () => {
    test('should return overall workflow progress', () => {
      const reqTask = manager.createIterationTask('requirements', 'Task', 'product_owner');
      manager.startTask(reqTask.id);
      manager.completeTask(reqTask.id);

      const progress = orchestrator.getWorkflowProgress();

      expect(progress.phase).toBe('requirements');
      expect(progress.progress).toBe(100);
      expect(progress.overall).toBe(100); // 1 completed task out of 1 total task
    });
  });

  describe('isWorkflowComplete', () => {
    test('should return false at start', () => {
      expect(orchestrator.isWorkflowComplete()).toBe(false);
    });

    test('should return true when at final phase and cannot advance', () => {
      orchestrator.jumpToPhase('documentation');

      expect(orchestrator.isWorkflowComplete()).toBe(true);
    });
  });

  describe('getNextPhase', () => {
    test('should return next phase', () => {
      expect(orchestrator.getNextPhase()).toBe('architecture');
    });

    test('should return null at final phase', () => {
      orchestrator.jumpToPhase('documentation');

      expect(orchestrator.getNextPhase()).toBeNull();
    });
  });

  describe('getDefaultRolesForPhase', () => {
    test('should return roles for each phase', () => {
      expect(orchestrator.getDefaultRolesForPhase('requirements')).toEqual(['product_owner', 'spec_writer']);
      expect(orchestrator.getDefaultRolesForPhase('architecture')).toEqual(['architect', 'tech_lead']);
      expect(orchestrator.getDefaultRolesForPhase('implementation')).toEqual(['developer', 'code_monkey']);
      expect(orchestrator.getDefaultRolesForPhase('review')).toEqual(['reviewer']);
      expect(orchestrator.getDefaultRolesForPhase('debugging')).toEqual(['debugger', 'troubleshooter']);
      expect(orchestrator.getDefaultRolesForPhase('documentation')).toEqual(['tech_writer']);
    });

    test('should return empty array for unknown phase', () => {
      expect(orchestrator.getDefaultRolesForPhase('unknown' as WorkflowPhase)).toEqual([]);
    });
  });

  describe('setAutoAdvance', () => {
    test('should set auto advance flag', () => {
      orchestrator.setAutoAdvance(true);

      // Just verify it doesn't throw
      orchestrator.setAutoAdvance(false);
    });
  });

  describe('checkHumanInterventionRequired', () => {
    test('should require intervention for max iterations', () => {
      const task = manager.createIterationTask('implementation', 'Task', 'developer', 1);
      manager.startTask(task.id);
      manager.startTask(task.id); // Exceeds max

      const result = orchestrator.checkHumanInterventionRequired(task);

      expect(result).toBe(true);
    });

    test('should require intervention for failed task in review', () => {
      const task = manager.createIterationTask('review', 'Task', 'reviewer');
      manager.startTask(task.id);
      manager.failTask(task.id);

      const result = orchestrator.checkHumanInterventionRequired(task);

      expect(result).toBe(true);
    });

    test('should not require intervention for normal completed task in implementation', () => {
      const task = manager.createIterationTask('implementation', 'Task', 'developer');
      manager.startTask(task.id);
      manager.completeTask(task.id);

      const result = orchestrator.checkHumanInterventionRequired(task);

      expect(result).toBe(false);
    });

    test('should require intervention for manual trigger', () => {
      const task = manager.createIterationTask('documentation', 'Task', 'tech_writer', 3, true);
      manager.startTask(task.id);
      manager.completeTask(task.id);

      const result = orchestrator.checkHumanInterventionRequired(task);

      expect(result).toBe(true);
    });
  });

  describe('requestHumanIntervention', () => {
    test('should create intervention request', () => {
      const task = manager.createIterationTask('implementation', 'Task', 'developer');
      const request = orchestrator.requestHumanIntervention(task.id, 'approval', 'Please approve', ['Yes', 'No']);

      expect(request).toBeDefined();
      expect(request.taskId).toBe(task.id);
      expect(request.type).toBe('approval');
      expect(request.message).toBe('Please approve');
    });

    test('should trigger callback', () => {
      let callbackFired = false;

      const orch = new WorkflowOrchestrator(manager, {
        onHumanIntervention: (request) => {
          callbackFired = true;
        },
      });

      const task = manager.createIterationTask('implementation', 'Task', 'developer');
      orch.requestHumanIntervention(task.id, 'approval', 'Please approve');

      expect(callbackFired).toBe(true);
    });
  });

  describe('getInfo', () => {
    test('should return complete workflow info', () => {
      const info = orchestrator.getInfo();

      expect(info.currentPhase).toBe('requirements');
      expect(info.currentPhaseIndex).toBe(0);
      expect(info.totalPhases).toBe(6);
      expect(info.progress).toBeDefined();
      expect(info.isComplete).toBe(false);
    });
  });

  describe('custom transition rules', () => {
    test('should use custom transition rules', () => {
      const customRules = [
        {
          from: 'requirements' as WorkflowPhase,
          to: 'implementation' as WorkflowPhase,
          condition: () => true,
          humanApprovalRequired: false,
        },
      ];

      const customOrch = new WorkflowOrchestrator(manager, {
        phaseSequence: ['requirements', 'implementation', 'review'],
        transitionRules: customRules,
      });

      // Should be able to advance directly to implementation
      const task = manager.createIterationTask('requirements', 'Task', 'product_owner');
      manager.startTask(task.id);
      manager.completeTask(task.id);

      const result = customOrch.advance();
      expect(result.success).toBe(true);
      expect(result.newPhase).toBe('implementation');
    });
  });

  describe('debugging phase with failed tasks', () => {
    test('should allow transition to debugging when tasks failed', () => {
      orchestrator.jumpToPhase('review');

      // Create and fail a task in implementation
      const implTask = manager.createIterationTask('implementation', 'Task', 'developer');
      manager.startTask(implTask.id);
      manager.failTask(implTask.id);

      // review -> debugging should be allowed when there are failed tasks
      const task = manager.createIterationTask('review', 'Review Task', 'reviewer');
      manager.startTask(task.id);
      manager.completeTask(task.id);

      // review -> debugging requires human approval
      const result = orchestrator.advance();
      expect(result.success).toBe(false);
      expect(result.requiresApproval).toBe(true);
    });
  });
});
