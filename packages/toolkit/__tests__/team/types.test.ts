/**
 * Types Tests - 类型定义单元测试
 *
 * @author PAI
 * @version 1.0.0
 */

import { describe, test, expect } from 'bun:test';
import type {
  AgentRole,
  AgentConfig,
  WorkflowPhase,
  IterationTask,
  HumanInterventionRequest,
} from '../../src/team/types.js';

describe('Team Types', () => {
  describe('AgentRole', () => {
    test('should accept valid agent roles', () => {
      const validRoles: AgentRole[] = [
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
      ];

      validRoles.forEach(role => {
        const config: AgentConfig = {
          role,
          name: 'Test',
          description: 'Test',
          systemPrompt: 'Test',
          capabilities: [],
        };
        expect(config.role).toBe(role);
      });
    });

    test('should have exactly 10 roles', () => {
      const roles: AgentRole[] = [
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
      ];

      expect(roles).toHaveLength(10);
    });
  });

  describe('AgentConfig', () => {
    test('should create valid agent config', () => {
      const config: AgentConfig = {
        role: 'developer',
        name: 'Developer',
        description: 'Development agent',
        systemPrompt: 'You are a developer',
        capabilities: ['coding', 'testing'],
        tools: ['editor', 'terminal'],
        model: 'sonnet',
      };

      expect(config.role).toBe('developer');
      expect(config.name).toBe('Developer');
      expect(config.capabilities).toEqual(['coding', 'testing']);
      expect(config.tools).toEqual(['editor', 'terminal']);
      expect(config.model).toBe('sonnet');
    });

    test('should allow optional fields', () => {
      const config: AgentConfig = {
        role: 'developer',
        name: 'Developer',
        description: 'Development agent',
        systemPrompt: 'You are a developer',
        capabilities: [],
      };

      expect(config.tools).toBeUndefined();
      expect(config.model).toBeUndefined();
    });

    test('should accept valid model values', () => {
      const models: ('haiku' | 'sonnet' | 'opus')[] = ['haiku', 'sonnet', 'opus'];

      models.forEach(model => {
        const config: AgentConfig = {
          role: 'developer',
          name: 'Test',
          description: 'Test',
          systemPrompt: 'Test',
          capabilities: [],
          model,
        };
        expect(config.model).toBe(model);
      });
    });
  });

  describe('WorkflowPhase', () => {
    test('should accept valid workflow phases', () => {
      const validPhases: WorkflowPhase[] = [
        'requirements',
        'architecture',
        'implementation',
        'review',
        'debugging',
        'documentation',
      ];

      validPhases.forEach(phase => {
        const task: IterationTask = {
          id: 'task_1',
          phase,
          description: 'Test',
          agentRole: 'developer',
          status: 'pending',
          iterations: 0,
          maxIterations: 3,
          humanApprovalRequired: false,
        };
        expect(task.phase).toBe(phase);
      });
    });

    test('should have exactly 6 phases', () => {
      const phases: WorkflowPhase[] = [
        'requirements',
        'architecture',
        'implementation',
        'review',
        'debugging',
        'documentation',
      ];

      expect(phases).toHaveLength(6);
    });
  });

  describe('IterationTask', () => {
    test('should create valid iteration task', () => {
      const task: IterationTask = {
        id: 'iter_task_1',
        phase: 'implementation',
        description: 'Implement feature X',
        agentRole: 'developer',
        status: 'pending',
        iterations: 0,
        maxIterations: 3,
        humanApprovalRequired: true,
      };

      expect(task.id).toBe('iter_task_1');
      expect(task.status).toBe('pending');
      expect(task.result).toBeUndefined();
      expect(task.feedback).toBeUndefined();
    });

    test('should accept all valid statuses', () => {
      const statuses: IterationTask['status'][] = [
        'pending',
        'in_progress',
        'reviewing',
        'completed',
        'failed',
      ];

      statuses.forEach(status => {
        const task: IterationTask = {
          id: 'task_1',
          phase: 'implementation',
          description: 'Test',
          agentRole: 'developer',
          status,
          iterations: 0,
          maxIterations: 3,
          humanApprovalRequired: false,
        };
        expect(task.status).toBe(status);
      });
    });

    test('should allow result and feedback', () => {
      const task: IterationTask = {
        id: 'task_1',
        phase: 'implementation',
        description: 'Test',
        agentRole: 'developer',
        status: 'completed',
        iterations: 1,
        maxIterations: 3,
        humanApprovalRequired: false,
        result: { success: true, output: 'Test output' },
        feedback: 'Good work',
        approved: true,
      };

      expect(task.result).toEqual({ success: true, output: 'Test output' });
      expect(task.feedback).toBe('Good work');
      expect(task.approved).toBe(true);
    });
  });

  describe('HumanInterventionRequest', () => {
    test('should create valid intervention request', () => {
      const request: HumanInterventionRequest = {
        id: 'intervention_1',
        taskId: 'task_1',
        type: 'approval',
        message: 'Please approve this task',
        options: ['Approve', 'Reject', 'Request changes'],
        timestamp: new Date(),
        resolved: false,
      };

      expect(request.id).toBe('intervention_1');
      expect(request.type).toBe('approval');
      expect(request.response).toBeUndefined();
    });

    test('should accept all valid types', () => {
      const types: HumanInterventionRequest['type'][] = [
        'approval',
        'feedback',
        'confirmation',
        'intervention',
      ];

      types.forEach(type => {
        const request: HumanInterventionRequest = {
          id: 'req_1',
          taskId: 'task_1',
          type,
          message: 'Test',
          timestamp: new Date(),
          resolved: false,
        };
        expect(request.type).toBe(type);
      });
    });

    test('should allow response when resolved', () => {
      const request: HumanInterventionRequest = {
        id: 'req_1',
        taskId: 'task_1',
        type: 'approval',
        message: 'Please approve',
        timestamp: new Date(),
        resolved: true,
        response: 'Approved',
      };

      expect(request.resolved).toBe(true);
      expect(request.response).toBe('Approved');
    });

    test('should allow optional options', () => {
      const requestWithoutOptions: HumanInterventionRequest = {
        id: 'req_1',
        taskId: 'task_1',
        type: 'feedback',
        message: 'Please provide feedback',
        timestamp: new Date(),
        resolved: false,
      };

      expect(requestWithoutOptions.options).toBeUndefined();
    });
  });

  describe('Type relationships', () => {
    test('should allow AgentRole in AgentConfig', () => {
      const role: AgentRole = 'developer';
      const config: AgentConfig = {
        role,
        name: 'Developer',
        description: 'Dev',
        systemPrompt: 'You are a developer',
        capabilities: [],
      };

      expect(config.role).toBe(role);
    });

    test('should allow AgentRole in IterationTask', () => {
      const role: AgentRole = 'reviewer';
      const task: IterationTask = {
        id: 'task_1',
        phase: 'review',
        description: 'Review code',
        agentRole: role,
        status: 'pending',
        iterations: 0,
        maxIterations: 2,
        humanApprovalRequired: false,
      };

      expect(task.agentRole).toBe(role);
    });

    test('should allow WorkflowPhase in IterationTask', () => {
      const phase: WorkflowPhase = 'debugging';
      const task: IterationTask = {
        id: 'task_1',
        phase,
        description: 'Debug issue',
        agentRole: 'debugger',
        status: 'pending',
        iterations: 0,
        maxIterations: 3,
        humanApprovalRequired: false,
      };

      expect(task.phase).toBe(phase);
    });

    test('should allow taskId reference in HumanInterventionRequest', () => {
      const taskId = 'iter_task_42';
      const request: HumanInterventionRequest = {
        id: 'req_1',
        taskId,
        type: 'intervention',
        message: 'Need help',
        timestamp: new Date(),
        resolved: false,
      };

      expect(request.taskId).toBe(taskId);
    });
  });
});
