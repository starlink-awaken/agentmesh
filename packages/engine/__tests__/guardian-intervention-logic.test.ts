/**
 * Tests for Guardian 干预决策和执行逻辑
 *
 * 测试 P0 任务的核心干预功能：
 * - intervene() 决策逻辑
 * - executeIntervention() 执行逻辑
 * - 人工确认机制
 * - 干预历史记录
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  Guardian,
  createGuardian,
  AlertSeverity,
  AlertCategory,
  type GuardianAlert,
} from '../src/guardian.js';
import {
  InterventionAction,
  type AnomalyPattern,
  type InterventionResult,
  type InterventionRecord,
  type ConfirmationCallback,
} from '../src/types.js';
import { EngineEvent, type EngineEventPayload } from '../src/types.js';

describe('Guardian 干预决策逻辑', () => {
  let guardian: Guardian;

  beforeEach(() => {
    guardian = createGuardian({
      enabled: true,
      check_interval_ms: 100,
      max_alerts_history: 100,
    });
  });

  afterEach(() => {
    guardian.stop();
  });

  // ============================================================
  // intervene() 决策逻辑测试
  // ============================================================

  describe('intervene() 决策逻辑', () => {
    test('critical 严重程度返回 PAUSE', () => {
      const anomaly: AnomalyPattern = {
        type: 'performance',
        severity: 'critical',
        projectId: 'test-project',
        message: '严重错误',
        details: {},
      };

      const action = guardian.intervene(anomaly);
      expect(action).toBe(InterventionAction.PAUSE);
    });

    test('high 性能异常返回 SCALE', () => {
      const anomaly: AnomalyPattern = {
        type: 'performance',
        severity: 'high',
        projectId: 'test-project',
        message: '性能问题',
        details: {},
      };

      const action = guardian.intervene(anomaly);
      expect(action).toBe(InterventionAction.SCALE);
    });

    test('high 预算异常返回 PAUSE', () => {
      const anomaly: AnomalyPattern = {
        type: 'budget',
        severity: 'high',
        projectId: 'test-project',
        message: '预算超限',
        details: {},
      };

      const action = guardian.intervene(anomaly);
      expect(action).toBe(InterventionAction.PAUSE);
    });

    test('high 失败异常返回 ROLLBACK', () => {
      const anomaly: AnomalyPattern = {
        type: 'failure',
        severity: 'high',
        projectId: 'test-project',
        message: '连续失败',
        details: {},
      };

      const action = guardian.intervene(anomaly);
      expect(action).toBe(InterventionAction.ROLLBACK);
    });

    test('medium 严重程度返回 ALERT', () => {
      const anomaly: AnomalyPattern = {
        type: 'performance',
        severity: 'medium',
        projectId: 'test-project',
        message: '中等警告',
        details: {},
      };

      const action = guardian.intervene(anomaly);
      expect(action).toBe(InterventionAction.ALERT);
    });

    test('low 严重程度返回 ALERT', () => {
      const anomaly: AnomalyPattern = {
        type: 'governance',
        severity: 'low',
        projectId: 'test-project',
        message: '轻微警告',
        details: {},
      };

      const action = guardian.intervene(anomaly);
      expect(action).toBe(InterventionAction.ALERT);
    });

    test('未知类型默认返回 ALERT', () => {
      const anomaly: AnomalyPattern = {
        type: 'performance',
        severity: 'medium',
        projectId: 'test-project',
        message: '未知情况',
        details: {},
      };

      const action = guardian.intervene(anomaly);
      expect(action).toBe(InterventionAction.ALERT);
    });
  });

  // ============================================================
  // executeIntervention() 执行逻辑测试
  // ============================================================

  describe('executeIntervention() 执行逻辑', () => {
    test('ALERT 动作总是成功', async () => {
      const anomaly: AnomalyPattern = {
        type: 'performance',
        severity: 'medium',
        projectId: 'test-project',
        message: '测试告警',
        details: {},
      };

      const result = await guardian.executeIntervention(InterventionAction.ALERT, anomaly);

      expect(result.action).toBe(InterventionAction.ALERT);
      expect(result.executed).toBe(true);
      expect(result.message).toBe('已发出告警');
    });

    test('IGNORE 动作总是成功', async () => {
      const anomaly: AnomalyPattern = {
        type: 'performance',
        severity: 'low',
        projectId: 'test-project',
        message: '可忽略',
        details: {},
      };

      const result = await guardian.executeIntervention(InterventionAction.IGNORE, anomaly);

      expect(result.action).toBe(InterventionAction.IGNORE);
      expect(result.executed).toBe(true);
      expect(result.message).toBe('异常已忽略');
    });

    test('PAUSE 无回调时记录告警', async () => {
      const anomaly: AnomalyPattern = {
        type: 'performance',
        severity: 'critical',
        projectId: 'test-project',
        message: '需要暂停',
        details: {},
      };

      const result = await guardian.executeIntervention(InterventionAction.PAUSE, anomaly);

      expect(result.action).toBe(InterventionAction.PAUSE);
      expect(result.executed).toBe(false);
      expect(result.message).toBe('暂停项目失败');
    });

    test('ROLLBACK 无回调时记录告警', async () => {
      const anomaly: AnomalyPattern = {
        type: 'failure',
        severity: 'high',
        projectId: 'test-project',
        message: '需要回滚',
        details: {},
      };

      const result = await guardian.executeIntervention(InterventionAction.ROLLBACK, anomaly);

      expect(result.action).toBe(InterventionAction.ROLLBACK);
      expect(result.executed).toBe(false);
      expect(result.message).toBe('回滚失败');
    });

    test('SCALE 无回调时记录告警', async () => {
      const anomaly: AnomalyPattern = {
        type: 'performance',
        severity: 'high',
        projectId: 'test-project',
        message: '需要缩减',
        details: {},
      };

      const result = await guardian.executeIntervention(InterventionAction.SCALE, anomaly);

      expect(result.action).toBe(InterventionAction.SCALE);
      expect(result.executed).toBe(false);
      expect(result.message).toBe('缩减资源失败');
    });
  });

  // ============================================================
  // 人工确认机制测试
  // ============================================================

  describe('人工确认机制', () => {
    test('设置确认回调后调用', async () => {
      let callbackCalled = false;
      const mockCallback: ConfirmationCallback = async () => {
        callbackCalled = true;
        return true;
      };

      guardian.setConfirmationCallback(mockCallback);

      // 更新配置启用自动干预但需要确认
      guardian.updateInterventionConfig({
        auto_intervention_enabled: true,
        confirmation_required: true,
      });

      const anomaly: AnomalyPattern = {
        type: 'performance',
        severity: 'critical',
        projectId: 'test-project',
        message: '需要确认',
        details: {},
      };

      await guardian.executeIntervention(InterventionAction.PAUSE, anomaly);

      expect(callbackCalled).toBe(true);
    });

    test('确认拒绝时干预不执行', async () => {
      const mockCallback: ConfirmationCallback = async () => false;

      guardian.setConfirmationCallback(mockCallback);
      guardian.updateInterventionConfig({
        auto_intervention_enabled: true,
        confirmation_required: true,
      });

      const anomaly: AnomalyPattern = {
        type: 'performance',
        severity: 'critical',
        projectId: 'test-project',
        message: '测试拒绝',
        details: {},
      };

      const result = await guardian.executeIntervention(InterventionAction.PAUSE, anomaly);

      expect(result.executed).toBe(false);
      expect(result.confirmed).toBe(false);
      expect(result.message).toBe('干预被人工拒绝');
    });

    test('确认同意时干预执行', async () => {
      const mockCallback: ConfirmationCallback = async () => true;

      guardian.setConfirmationCallback(mockCallback);
      guardian.updateInterventionConfig({
        auto_intervention_enabled: true,
        confirmation_required: true,
      });

      const anomaly: AnomalyPattern = {
        type: 'performance',
        severity: 'medium',
        projectId: 'test-project',
        message: '测试同意',
        details: {},
      };

      const result = await guardian.executeIntervention(InterventionAction.ALERT, anomaly);

      expect(result.executed).toBe(true);
      expect(result.confirmed).toBe(true);
    });
  });

  // ============================================================
  // 干预历史记录测试
  // ============================================================

  describe('干预历史记录', () => {
    test('getInterventionHistory 返回历史记录', async () => {
      const anomaly: AnomalyPattern = {
        type: 'performance',
        severity: 'medium',
        projectId: 'test-project',
        message: '测试历史',
        details: {},
      };

      await guardian.executeIntervention(InterventionAction.ALERT, anomaly);

      const history = guardian.getInterventionHistory();

      expect(history.length).toBe(1);
      expect(history[0].projectId).toBe('test-project');
      expect(history[0].result.action).toBe(InterventionAction.ALERT);
    });

    test('getInterventionHistory 支持项目过滤', async () => {
      // 项目 1
      const anomaly1: AnomalyPattern = {
        type: 'performance',
        severity: 'medium',
        projectId: 'project-1',
        message: '测试',
        details: {},
      };

      // 项目 2
      const anomaly2: AnomalyPattern = {
        type: 'budget',
        severity: 'high',
        projectId: 'project-2',
        message: '测试',
        details: {},
      };

      await guardian.executeIntervention(InterventionAction.ALERT, anomaly1);
      await guardian.executeIntervention(InterventionAction.ALERT, anomaly2);

      const project1History = guardian.getInterventionHistory('project-1');
      const project2History = guardian.getInterventionHistory('project-2');

      expect(project1History.length).toBe(1);
      expect(project1History[0].projectId).toBe('project-1');

      expect(project2History.length).toBe(1);
      expect(project2History[0].projectId).toBe('project-2');
    });

    test('getInterventionHistory 支持数量限制', async () => {
      for (let i = 0; i < 10; i++) {
        const anomaly: AnomalyPattern = {
          type: 'performance',
          severity: 'medium',
          projectId: `project-${i}`,
          message: `测试 ${i}`,
          details: {},
        };

        await guardian.executeIntervention(InterventionAction.ALERT, anomaly);
      }

      const limitedHistory = guardian.getInterventionHistory(undefined, 5);

      expect(limitedHistory.length).toBe(5);
    });

    test('历史记录按时间倒序排列', async () => {
      const anomaly1: AnomalyPattern = {
        type: 'performance',
        severity: 'medium',
        projectId: 'test-project',
        message: '第一次',
        details: {},
      };

      await guardian.executeIntervention(InterventionAction.ALERT, anomaly1);

      // 等待确保时间戳不同
      await new Promise((resolve) => setTimeout(resolve, 10));

      const anomaly2: AnomalyPattern = {
        type: 'budget',
        severity: 'high',
        projectId: 'test-project',
        message: '第二次',
        details: {},
      };

      await guardian.executeIntervention(InterventionAction.ALERT, anomaly2);

      const history = guardian.getInterventionHistory();

      // 第二次应该在前面
      expect(history[0].result.message).toBe('已发出告警'); // 第二次
      expect(history[1].result.message).toBe('已发出告警'); // 第一次
    });
  });

  // ============================================================
  // getStats 干预统计测试
  // ============================================================

  describe('getStats 干预统计', () => {
    test('getStats 包含干预统计', async () => {
      const statsBefore = guardian.getStats();
      expect(statsBefore.total_interventions).toBe(0);

      const anomaly: AnomalyPattern = {
        type: 'performance',
        severity: 'medium',
        projectId: 'test-project',
        message: '测试统计',
        details: {},
      };

      await guardian.executeIntervention(InterventionAction.ALERT, anomaly);

      const statsAfter = guardian.getStats();
      expect(statsAfter.total_interventions).toBe(1);
      expect(statsAfter.interventions_by_action[InterventionAction.ALERT]).toBe(1);
    });

    test('interventions_by_action 正确分组', async () => {
      // ALERT
      await guardian.executeIntervention(InterventionAction.ALERT, {
        type: 'performance',
        severity: 'medium',
        projectId: 'test',
        message: 'a',
        details: {},
      });

      // IGNORE
      await guardian.executeIntervention(InterventionAction.IGNORE, {
        type: 'performance',
        severity: 'low',
        projectId: 'test',
        message: 'b',
        details: {},
      });

      const stats = guardian.getStats();

      expect(stats.total_interventions).toBe(2);
      expect(stats.interventions_by_action[InterventionAction.ALERT]).toBe(1);
      expect(stats.interventions_by_action[InterventionAction.IGNORE]).toBe(1);
    });
  });

  // ============================================================
  // alertToAnomaly 转换测试
  // ============================================================

  describe('alertToAnomaly 转换', () => {
    test('GuardianAlert 正确转换为 AnomalyPattern', () => {
      const alert: GuardianAlert = {
        id: 'test-id',
        severity: AlertSeverity.CRITICAL,
        category: AlertCategory.PERFORMANCE,
        message: '性能问题',
        details: {
          project_id: 'test-project',
          phase: 'execution',
        },
        timestamp: Date.now(),
        acknowledged: false,
      };

      const anomaly = guardian.alertToAnomaly(alert);

      expect(anomaly.severity).toBe('critical');
      expect(anomaly.type).toBe('performance');
      expect(anomaly.projectId).toBe('test-project');
      expect(anomaly.message).toBe('性能问题');
    });

    test('INFO 告警映射为 low 严重程度', () => {
      const alert: GuardianAlert = {
        id: 'test-id',
        severity: AlertSeverity.INFO,
        category: AlertCategory.PERFORMANCE,
        message: '信息',
        details: { project_id: 'test' },
        timestamp: Date.now(),
        acknowledged: false,
      };

      const anomaly = guardian.alertToAnomaly(alert);
      expect(anomaly.severity).toBe('low');
    });

    test('WARNING 告警映射为 medium 严重程度', () => {
      const alert: GuardianAlert = {
        id: 'test-id',
        severity: AlertSeverity.WARNING,
        category: AlertCategory.BUDGET,
        message: '警告',
        details: { project_id: 'test' },
        timestamp: Date.now(),
        acknowledged: false,
      };

      const anomaly = guardian.alertToAnomaly(alert);
      expect(anomaly.severity).toBe('medium');
      expect(anomaly.type).toBe('budget');
    });
  });

  // ============================================================
  // handleAlertWithIntervention 测试
  // ============================================================

  describe('handleAlertWithIntervention 自动处理', () => {
    test('CRITICAL 告警触发 PAUSE 干预', async () => {
      const alert: GuardianAlert = {
        id: 'test-id',
        severity: AlertSeverity.CRITICAL,
        category: AlertCategory.PERFORMANCE,
        message: '严重问题',
        details: { project_id: 'test-project' },
        timestamp: Date.now(),
        acknowledged: false,
      };

      const result = await guardian.handleAlertWithIntervention(alert);

      expect(result).not.toBeNull();
      expect(result?.action).toBe(InterventionAction.PAUSE);
    });

    test('INFO 告警触发 ALERT 干预', async () => {
      const alert: GuardianAlert = {
        id: 'test-id',
        severity: AlertSeverity.INFO,
        category: AlertCategory.PERFORMANCE,
        message: '信息',
        details: { project_id: 'test-project' },
        timestamp: Date.now(),
        acknowledged: false,
      };

      const result = await guardian.handleAlertWithIntervention(alert);

      expect(result).not.toBeNull();
      expect(result?.action).toBe(InterventionAction.ALERT);
    });

    test('处理结果记录到干预历史', async () => {
      const alert: GuardianAlert = {
        id: 'test-id',
        severity: AlertSeverity.WARNING,
        category: AlertCategory.BUDGET,
        message: '预算警告',
        details: { project_id: 'test-project' },
        timestamp: Date.now(),
        acknowledged: false,
      };

      await guardian.handleAlertWithIntervention(alert);

      const history = guardian.getInterventionHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].projectId).toBe('test-project');
    });
  });

  // ============================================================
  // 干预配置测试
  // ============================================================

  describe('干预配置', () => {
    test('getInterventionConfig 返回配置', () => {
      const config = guardian.getInterventionConfig();

      expect(config).toBeDefined();
      expect(config.auto_intervention_enabled).toBeDefined();
      expect(config.confirmation_required).toBeDefined();
    });

    test('updateInterventionConfig 更新配置', () => {
      guardian.updateInterventionConfig({
        auto_intervention_enabled: false,
        confirmation_required: false,
      });

      const config = guardian.getInterventionConfig();

      expect(config.auto_intervention_enabled).toBe(false);
      expect(config.confirmation_required).toBe(false);
    });

    test('部分更新保留其他配置', () => {
      const originalConfig = guardian.getInterventionConfig();

      guardian.updateInterventionConfig({
        auto_intervention_enabled: false,
      });

      const newConfig = guardian.getInterventionConfig();

      expect(newConfig.auto_intervention_enabled).toBe(false);
      expect(newConfig.confirmation_required).toBe(originalConfig.confirmation_required);
    });
  });

  // ============================================================
  // 项目回调测试
  // ============================================================

  describe('项目回调', () => {
    test('setProjectCallbacks 设置回调', async () => {
      let pauseCalled = false;
      const mockPause = async () => {
        pauseCalled = true;
        return true;
      };

      guardian.setProjectCallbacks(mockPause);

      const anomaly: AnomalyPattern = {
        type: 'performance',
        severity: 'critical',
        projectId: 'test-project',
        message: '测试回调',
        details: {},
      };

      // 禁用确认要求以便直接执行
      guardian.updateInterventionConfig({
        confirmation_required: false,
        auto_intervention_enabled: true,
      });

      await guardian.executeIntervention(InterventionAction.PAUSE, anomaly);

      expect(pauseCalled).toBe(true);
    });

    test('多个回调都正确设置', async () => {
      let pauseCalled = false;
      let rollbackCalled = false;
      let scaleCalled = false;

      guardian.setProjectCallbacks(
        async () => { pauseCalled = true; return true; },
        async () => { rollbackCalled = true; return true; },
        async () => { scaleCalled = true; return true; },
      );

      guardian.updateInterventionConfig({
        confirmation_required: false,
        auto_intervention_enabled: true,
      });

      // 测试 PAUSE
      await guardian.executeIntervention(InterventionAction.PAUSE, {
        type: 'performance',
        severity: 'critical',
        projectId: 'test',
        message: 'test',
        details: {},
      });
      expect(pauseCalled).toBe(true);

      // 测试 ROLLBACK
      await guardian.executeIntervention(InterventionAction.ROLLBACK, {
        type: 'failure',
        severity: 'high',
        projectId: 'test',
        message: 'test',
        details: {},
      });
      expect(rollbackCalled).toBe(true);

      // 测试 SCALE
      await guardian.executeIntervention(InterventionAction.SCALE, {
        type: 'performance',
        severity: 'high',
        projectId: 'test',
        message: 'test',
        details: {},
      });
      expect(scaleCalled).toBe(true);
    });
  });
});
