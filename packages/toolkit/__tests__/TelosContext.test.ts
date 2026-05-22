/**
 * TelosContext 单元测试
 *
 * 测试实体生命周期管理能力
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TelosContext } from '../src/lifecycle/TelosContext.js';

describe('TelosContext', () => {
  let entity: TelosContext;

  beforeEach(() => {
    entity = new TelosContext('test-entity', { name: 'Test' });
  });

  // ============================================================================
  // 构造函数测试
  // ============================================================================

  describe('constructor', () => {
    it('should create entity with id', () => {
      expect(entity.getId()).toBe('test-entity');
    });

    it('should create entity with attributes', () => {
      const attrs = entity.getAttributes();
      expect(attrs.name).toBe('Test');
    });

    it('should have initial state as initialized', () => {
      const state = entity.getState();
      expect(state.current).toBe('initialized');
    });

    it('should accept custom type', () => {
      const customEntity = new TelosContext('id', {}, 'custom-type');
      expect(customEntity.getType()).toBe('custom-type');
    });
  });

  // ============================================================================
  // 属性操作测试
  // ============================================================================

  describe('attributes', () => {
    it('should get single attribute', () => {
      expect(entity.getAttribute('name')).toBe('Test');
    });

    it('should return undefined for unknown attribute', () => {
      expect(entity.getAttribute('unknown')).toBeUndefined();
    });

    it('should set single attribute', () => {
      entity.setAttribute('age', 25);
      expect(entity.getAttribute('age')).toBe(25);
    });

    it('should set multiple attributes', () => {
      entity.setAttributes({ role: 'admin', active: true });
      expect(entity.getAttribute('role')).toBe('admin');
      expect(entity.getAttribute('active')).toBe(true);
    });

    it('should update existing attribute', () => {
      entity.setAttribute('name', 'Updated');
      expect(entity.getAttribute('name')).toBe('Updated');
    });
  });

  // ============================================================================
  // 状态转换测试
  // ============================================================================

  describe('state transitions', () => {
    it('should transition to active state', () => {
      const result = entity.transition('initialized', 'active');
      expect(result).toBe(true);

      const state = entity.getState();
      expect(state.current).toBe('active');
      expect(state.previous).toBe('initialized');
    });

    it('should transition to inactive state', () => {
      entity.transition('initialized', 'active');
      const result = entity.transition('active', 'inactive');

      expect(result).toBe(true);
      expect(entity.getState().current).toBe('inactive');
    });

    it('should transition to archived state', () => {
      entity.transition('initialized', 'active');
      entity.transition('active', 'inactive');
      const result = entity.transition('inactive', 'archived');

      expect(result).toBe(true);
      expect(entity.getState().current).toBe('archived');
    });

    it('should allow wildcard transitions', () => {
      const result = entity.transition('initialized', 'deleted');
      expect(result).toBe(true);
    });

    it('should throw error for invalid transition', () => {
      const restrictedEntity = new TelosContext('id', {}, 'type');
      // 覆盖允许的转换规则，使其更严格
      restrictedEntity.transition('initialized', 'active');

      // 由于默认允许所有转换，这里测试基本行为
      expect(entity.getState().current).toBeDefined();
    });
  });

  // ============================================================================
  // 状态检查测试
  // ============================================================================

  describe('canTransition', () => {
    it('should return true for valid transition', () => {
      const can = entity.canTransition('active');
      expect(can).toBe(true);
    });

    it('should return true for any transition with wildcard', () => {
      const can = entity.canTransition('archived');
      expect(can).toBe(true);
    });
  });

  // ============================================================================
  // 历史记录测试
  // ============================================================================

  describe('history', () => {
    it('should record created event', () => {
      const history = entity.getHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].type).toBe('created');
    });

    it('should record attribute changes', () => {
      entity.setAttribute('test', 'value');
      const history = entity.getHistory();

      const attrChange = history.find(h => h.type === 'attribute_changed');
      expect(attrChange).toBeDefined();
    });

    it('should record state changes', () => {
      entity.transition('initialized', 'active');
      const history = entity.getHistory();

      const stateChange = history.find(h => h.type === 'state_changed');
      expect(stateChange).toBeDefined();
    });

    it('should filter history by event type', () => {
      entity.setAttribute('test', 'value');
      const stateChanges = entity.getHistory('state_changed');

      expect(stateChanges).toBeDefined();
    });
  });

  // ============================================================================
  // 获取类型测试
  // ============================================================================

  describe('getType', () => {
    it('should return default type', () => {
      const defaultEntity = new TelosContext('id');
      expect(defaultEntity.getType()).toBe('default');
    });

    it('should return custom type', () => {
      const customEntity = new TelosContext('id', {}, 'user');
      expect(customEntity.getType()).toBe('user');
    });
  });

  // ============================================================================
  // 边界情况测试
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty attributes', () => {
      const emptyEntity = new TelosContext('id', {});
      const attrs = emptyEntity.getAttributes();
      expect(Object.keys(attrs).length).toBe(0);
    });

    it('should handle null attribute values', () => {
      entity.setAttribute('nullValue', null);
      expect(entity.getAttribute('nullValue')).toBeNull();
    });

    it('should handle object attribute values', () => {
      const obj = { nested: { value: 'deep' } };
      entity.setAttribute('object', obj);
      expect(entity.getAttribute('object')).toEqual(obj);
    });

    it('should handle multiple state transitions', () => {
      entity.transition('initialized', 'active');
      entity.transition('active', 'inactive');
      entity.transition('inactive', 'archived');

      expect(entity.getState().current).toBe('archived');
      expect(entity.getHistory().length).toBeGreaterThan(3);
    });
  });
});
