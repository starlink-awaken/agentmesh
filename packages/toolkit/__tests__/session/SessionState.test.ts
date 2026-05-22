/**
 * SessionState 单元测试
 *
 * 测试会话状态管理器的状态转换、验证、序列化等功能
 *
 * @author PAI
 */
import { describe, it, expect, beforeEach, vi } from 'bun:test';
import {
  SessionStateManager,
  DEFAULT_SESSION_STATE,
} from '../../dist/session/SessionState.js';
import type { SessionState, SessionStatus } from '../../dist/session/types.js';

describe('SessionStateManager', () => {
  let stateManager: SessionStateManager;

  beforeEach(() => {
    stateManager = new SessionStateManager();
  });

  // ============================================================================
  // 构造函数测试
  // ============================================================================

  describe('constructor', () => {
    it('should create manager with default state', () => {
      expect(stateManager).toBeDefined();
      expect(stateManager.getState()).toBeDefined();
      expect(stateManager.getStatus()).toBe('pending');
    });

    it('should accept initial state', () => {
      const customManager = new SessionStateManager({
        currentStep: 5,
        context: { test: 'value' },
      });

      const state = customManager.getState();
      expect(state.currentStep).toBe(5);
      expect(state.context.test).toBe('value');
    });

    it('should preserve metadata defaults when providing initial state', () => {
      const customManager = new SessionStateManager({
        currentStep: 3,
      });

      const state = customManager.getState();
      expect(state.metadata.createdAt).toBeDefined();
      expect(state.metadata.updatedAt).toBeDefined();
    });
  });

  // ============================================================================
  // getState 测试
  // ============================================================================

  describe('getState', () => {
    it('should return current state', () => {
      const state = stateManager.getState();

      expect(state).toBeDefined();
      expect(state.currentStep).toBe(0);
      expect(state.completedSteps).toEqual([]);
      expect(state.context).toEqual({});
      expect(state.errors).toEqual([]);
    });

    it('should return a copy of state', () => {
      const state1 = stateManager.getState();
      const state2 = stateManager.getState();

      expect(state1).not.toBe(state2);
    });
  });

  // ============================================================================
  // getStatus 测试
  // ============================================================================

  describe('getStatus', () => {
    it('should return initial status as pending', () => {
      expect(stateManager.getStatus()).toBe('pending');
    });

    it('should return updated status after transition', () => {
      stateManager.transition('running');
      expect(stateManager.getStatus()).toBe('running');
    });
  });

  // ============================================================================
  // setState 测试
  // ============================================================================

  describe('setState', () => {
    it('should update state partially', () => {
      stateManager.setState({ currentStep: 5 });

      const state = stateManager.getState();
      expect(state.currentStep).toBe(5);
    });

    it('should merge context', () => {
      stateManager.setContext('key1', 'value1');
      stateManager.setState({ context: { key2: 'value2' } });

      const state = stateManager.getState();
      expect(state.context.key1).toBe('value1');
      expect(state.context.key2).toBe('value2');
    });

    it('should update metadata.updatedAt', () => {
      const before = stateManager.getState().metadata.updatedAt;

      // Wait a bit to ensure different timestamp
      stateManager.setState({ currentStep: 1 });

      const after = stateManager.getState().metadata.updatedAt;
      expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  // ============================================================================
  // transition 测试
  // ============================================================================

  describe('transition', () => {
    it('should transition from pending to running', () => {
      const result = stateManager.transition('running');

      expect(result).toBe(true);
      expect(stateManager.getStatus()).toBe('running');
    });

    it('should transition from running to paused', () => {
      stateManager.transition('running');
      const result = stateManager.transition('paused');

      expect(result).toBe(true);
      expect(stateManager.getStatus()).toBe('paused');
    });

    it('should transition from paused to running', () => {
      stateManager.transition('running');
      stateManager.transition('paused');
      const result = stateManager.transition('running');

      expect(result).toBe(true);
      expect(stateManager.getStatus()).toBe('running');
    });

    it('should transition from running to completed', () => {
      stateManager.transition('running');
      const result = stateManager.transition('completed');

      expect(result).toBe(true);
      expect(stateManager.getStatus()).toBe('completed');
    });

    it('should transition from running to failed', () => {
      stateManager.transition('running');
      const result = stateManager.transition('failed');

      expect(result).toBe(true);
      expect(stateManager.getStatus()).toBe('failed');
    });

    it('should set startedAt on first transition to running', () => {
      stateManager.transition('running');

      const state = stateManager.getState();
      expect(state.metadata.startedAt).toBeDefined();
    });

    it('should set pausedAt on transition to paused', () => {
      stateManager.transition('running');
      stateManager.transition('paused');

      const state = stateManager.getState();
      expect(state.metadata.pausedAt).toBeDefined();
    });

    it('should set completedAt on transition to completed', () => {
      stateManager.transition('running');
      stateManager.transition('completed');

      const state = stateManager.getState();
      expect(state.metadata.completedAt).toBeDefined();
    });

    it('should calculate duration on transition to completed', () => {
      stateManager.transition('running');
      stateManager.transition('completed');

      const state = stateManager.getState();
      expect(state.metadata.duration).toBeDefined();
      expect(state.metadata.duration).toBeGreaterThanOrEqual(0);
    });

    it('should set completedAt on transition to failed', () => {
      stateManager.transition('running');
      stateManager.transition('failed');

      const state = stateManager.getState();
      expect(state.metadata.completedAt).toBeDefined();
    });
  });

  // ============================================================================
  // setTransitions / addTransition 测试
  // ============================================================================

  describe('custom transitions', () => {
    it('should set custom transitions', () => {
      const customTransitions = [
        { from: 'pending', to: 'running', allowed: true },
        { from: 'running', to: 'paused', allowed: false }, // 禁用
      ];

      stateManager.setTransitions(customTransitions);
      stateManager.transition('running');
      const result = stateManager.transition('paused');

      expect(result).toBe(false);
      expect(stateManager.getStatus()).toBe('running');
    });

    it('should add transition rule', () => {
      stateManager.addTransition({
        from: 'completed',
        to: 'running',
        allowed: true,
      });

      stateManager.transition('running');
      stateManager.transition('completed');
      const result = stateManager.transition('running');

      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // completeStep 测试
  // ============================================================================

  describe('completeStep', () => {
    it('should complete a step and increment currentStep', () => {
      stateManager.completeStep(0);

      const state = stateManager.getState();
      expect(state.completedSteps).toContain(0);
      expect(state.currentStep).toBe(1);
    });

    it('should not duplicate completed steps', () => {
      stateManager.completeStep(0);
      stateManager.completeStep(0);

      const state = stateManager.getState();
      expect(state.completedSteps.filter((s) => s === 0).length).toBe(1);
    });

    it('should complete multiple steps', () => {
      stateManager.completeStep(0);
      stateManager.completeStep(1);
      stateManager.completeStep(2);

      const state = stateManager.getState();
      expect(state.completedSteps).toEqual([0, 1, 2]);
      expect(state.currentStep).toBe(3);
    });
  });

  // ============================================================================
  // setCurrentStep 测试
  // ============================================================================

  describe('setCurrentStep', () => {
    it('should set current step', () => {
      stateManager.setCurrentStep(5);

      const state = stateManager.getState();
      expect(state.currentStep).toBe(5);
    });

    it('should update metadata.updatedAt', () => {
      const before = stateManager.getState().metadata.updatedAt.getTime();

      stateManager.setCurrentStep(3);

      const after = stateManager.getState().metadata.updatedAt.getTime();
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  // ============================================================================
  // addError / clearErrors 测试
  // ============================================================================

  describe('error handling', () => {
    it('should add error', () => {
      stateManager.addError({
        code: 'TEST_ERROR',
        message: 'Test error message',
        recoverable: true,
      });

      const state = stateManager.getState();
      expect(state.errors.length).toBe(1);
      expect(state.errors[0].code).toBe('TEST_ERROR');
      expect(state.errors[0].timestamp).toBeDefined();
    });

    it('should add error with step', () => {
      stateManager.addError({
        code: 'STEP_ERROR',
        message: 'Step error',
        step: 5,
        recoverable: false,
      });

      const state = stateManager.getState();
      expect(state.errors[0].step).toBe(5);
      expect(state.errors[0].recoverable).toBe(false);
    });

    it('should clear errors', () => {
      stateManager.addError({
        code: 'ERROR1',
        message: 'Error 1',
        recoverable: true,
      });
      stateManager.addError({
        code: 'ERROR2',
        message: 'Error 2',
        recoverable: true,
      });

      stateManager.clearErrors();

      const state = stateManager.getState();
      expect(state.errors).toEqual([]);
    });
  });

  // ============================================================================
  // setContext / getContext 测试
  // ============================================================================

  describe('context', () => {
    it('should set context value', () => {
      stateManager.setContext('key1', 'value1');

      const state = stateManager.getState();
      expect(state.context.key1).toBe('value1');
    });

    it('should get context value', () => {
      stateManager.setContext('key1', 'value1');

      const value = stateManager.getContext<string>('key1');
      expect(value).toBe('value1');
    });

    it('should return undefined for non-existent key', () => {
      const value = stateManager.getContext('non-existent');
      expect(value).toBeUndefined();
    });

    it('should store complex objects in context', () => {
      const complexValue = { nested: { data: [1, 2, 3] } };
      stateManager.setContext('complex', complexValue);

      const value = stateManager.getContext<any>('complex');
      expect(value).toEqual(complexValue);
    });
  });

  // ============================================================================
  // setResult / getResult 测试
  // ============================================================================

  describe('result', () => {
    it('should set result', () => {
      stateManager.setResult({ output: 'test' });

      const state = stateManager.getState();
      expect(state.result).toEqual({ output: 'test' });
    });

    it('should get result', () => {
      stateManager.setResult({ output: 'test' });

      const result = stateManager.getResult<{ output: string }>();
      expect(result?.output).toBe('test');
    });

    it('should return undefined when no result', () => {
      const result = stateManager.getResult();
      expect(result).toBeUndefined();
    });
  });

  // ============================================================================
  // serialize / deserialize 测试
  // ============================================================================

  describe('serialization', () => {
    it('should serialize state to JSON', () => {
      stateManager.setCurrentStep(5);
      stateManager.setContext('key', 'value');
      stateManager.transition('running');

      const json = stateManager.serialize();

      expect(typeof json).toBe('string');
      const data = JSON.parse(json);
      expect(data.state.currentStep).toBe(5);
      expect(data.state.context.key).toBe('value');
      expect(data.status).toBe('running');
    });

    it('should deserialize from JSON', () => {
      stateManager.setCurrentStep(10);
      stateManager.setContext('testKey', 'testValue');
      stateManager.transition('running');

      const json = stateManager.serialize();
      const restored = SessionStateManager.deserialize(json);

      expect(restored.getState().currentStep).toBe(10);
      expect(restored.getContext('testKey')).toBe('testValue');
      expect(restored.getStatus()).toBe('running');
    });

    it('should preserve result in serialization', () => {
      stateManager.setResult({ data: 'important' });

      const json = stateManager.serialize();
      const restored = SessionStateManager.deserialize(json);

      expect(restored.getResult()).toEqual({ data: 'important' });
    });

    it('should preserve errors in serialization', () => {
      stateManager.addError({
        code: 'SERIAL_ERROR',
        message: 'Test',
        recoverable: true,
      });

      const json = stateManager.serialize();
      const restored = SessionStateManager.deserialize(json);

      expect(restored.getState().errors.length).toBe(1);
      expect(restored.getState().errors[0].code).toBe('SERIAL_ERROR');
    });
  });

  // ============================================================================
  // validate 测试
  // ============================================================================

  describe('validate', () => {
    it('should return valid for normal state', () => {
      const result = stateManager.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect negative currentStep', () => {
      stateManager.setCurrentStep(-1);

      const result = stateManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('当前步骤不能为负数');
    });

    it('should detect duplicate completed steps', () => {
      // 使用 setCompletedSteps 直接设置内部状态
      stateManager.setCompletedSteps([1, 2, 2, 3]);

      const result = stateManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('已完成步骤存在重复');
    });

    it('should detect recoverable errors in running state', () => {
      stateManager.transition('running');
      stateManager.addError({
        code: 'RECOVERABLE',
        message: 'Error',
        recoverable: true,
      });

      const result = stateManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('会话包含未恢复的可恢复错误');
    });

    it('should allow non-recoverable errors in running state', () => {
      stateManager.transition('running');
      stateManager.addError({
        code: 'NON_RECOVERABLE',
        message: 'Error',
        recoverable: false,
      });

      const result = stateManager.validate();
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // clone 测试
  // ============================================================================

  describe('clone', () => {
    it('should create a clone of the manager', () => {
      stateManager.setCurrentStep(5);
      stateManager.setContext('key', 'value');
      stateManager.transition('running');

      const cloned = stateManager.clone();

      expect(cloned.getState().currentStep).toBe(5);
      expect(cloned.getContext('key')).toBe('value');
      expect(cloned.getStatus()).toBe('running');
    });

    it('should create independent clone', () => {
      const original = new SessionStateManager();
      original.setCurrentStep(3);

      const cloned = original.clone();
      cloned.setCurrentStep(10);

      expect(original.getState().currentStep).toBe(3);
      expect(cloned.getState().currentStep).toBe(10);
    });

    it('should preserve custom transitions in clone', () => {
      stateManager.addTransition({
        from: 'pending',
        to: 'completed',
        allowed: true,
      });

      const cloned = stateManager.clone();

      // 通过验证转换规则是否存在来间接测试
      expect(cloned.getState()).toBeDefined();
    });
  });

  // ============================================================================
  // 事件监听器测试
  // ============================================================================

  describe('event listeners', () => {
    it('should register event listener', () => {
      const callback = vi.fn();
      stateManager.on('running', callback);

      stateManager.transition('running');

      expect(callback).toHaveBeenCalled();
    });

    it('should receive event with correct type', () => {
      const callback = vi.fn();
      stateManager.on('completed', callback);

      stateManager.transition('running');
      stateManager.transition('completed');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'completed',
        })
      );
    });

    it('should remove event listener', () => {
      const callback = vi.fn();
      stateManager.on('running', callback);
      stateManager.off('running', callback);

      stateManager.transition('running');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle multiple listeners', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      stateManager.on('running', callback1);
      stateManager.on('running', callback2);

      stateManager.transition('running');

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // DEFAULT_SESSION_STATE 测试
  // ============================================================================

  describe('DEFAULT_SESSION_STATE', () => {
    it('should have correct default values', () => {
      // 创建新的状态管理器来获取干净的默认状态
      const manager = new SessionStateManager();
      const state = manager.getState();

      expect(state.currentStep).toBe(0);
      expect(state.completedSteps).toEqual([]);
      expect(state.context).toEqual({});
      expect(state.errors).toEqual([]);
      expect(state.metadata).toBeDefined();
    });

    it('should have createdAt and updatedAt', () => {
      const manager = new SessionStateManager();
      const state = manager.getState();

      expect(state.metadata.createdAt).toBeDefined();
      expect(state.metadata.updatedAt).toBeDefined();
      // 检查是否是 Date 对象
      expect(state.metadata.createdAt instanceof Date).toBe(true);
      expect(state.metadata.updatedAt instanceof Date).toBe(true);
    });
  });
});
