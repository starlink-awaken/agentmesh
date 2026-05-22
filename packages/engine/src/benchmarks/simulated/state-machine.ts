/**
 * Honeycomb v2 - 状态机性能基准测试
 *
 * 测试 PhaseStateMachine 的状态转换、路径选择和风险评估性能
 */

import { PhaseStateMachine, createStateMachine } from '../../state-machine.js';
import { Phase, DecisionPath, RiskLevel } from '../../types.js';
import { calculateStats, collectSamples } from '../utils.js';
import type { StateMachineResult } from '../types.js';

// ============================================================
// 基准测试：状态转换延迟
// ============================================================

/**
 * 基准测试：单次状态转换延迟
 */
export async function benchStateTransition(
  fromPhase: Phase = Phase.INIT,
  toPhase: Phase = Phase.RESEARCH,
  samples: number = 10000,
): Promise<StateMachineResult> {
  const durationsMs: number[] = [];

  for (let i = 0; i < samples; i++) {
    const sm = new PhaseStateMachine(fromPhase);

    const start = performance.now();
    sm.transitionTo(toPhase, `Benchmark transition ${i}`);
    durationsMs.push(performance.now() - start);
  }

  const stats = calculateStats(durationsMs);

  return {
    type: 'state-machine',
    name: 'State Transition',
    description: `从 ${fromPhase} 到 ${toPhase} 的状态转换 (${samples} 个样本)`,
    stats,
    transitionCount: samples,
    fromPhase,
    toPhase,
    passed: stats.avg < 0.1, // 目标：< 0.1ms
    threshold: 0.1,
  };
}

// ============================================================
// 基准测试：完整阶段序列转换
// ============================================================

/**
 * 基准测试：完整线性阶段序列转换
 */
export async function benchFullPhaseSequence(samples: number = 1000): Promise<StateMachineResult> {
  const linearSequence: Phase[] = [
    Phase.INIT,
    Phase.RESEARCH,
    Phase.DECISION,
    Phase.EXECUTION,
    Phase.FEEDBACK,
    Phase.DELIVERY,
    Phase.COMPLETED,
  ];

  const durationsMs: number[] = [];

  for (let i = 0; i < samples; i++) {
    const sm = new PhaseStateMachine();
    const start = performance.now();

    // 执行完整序列
    for (let j = 1; j < linearSequence.length; j++) {
      sm.transitionTo(linearSequence[j], `Phase ${j}`);
    }

    durationsMs.push(performance.now() - start);
  }

  const stats = calculateStats(durationsMs);
  const transitionsPerSequence = linearSequence.length - 1;

  return {
    type: 'state-machine',
    name: 'Full Phase Sequence',
    description: `完整线性阶段序列转换 (${linearSequence.length} 个阶段)`,
    stats: {
      ...stats,
      avg: stats.avg / transitionsPerSequence,
      min: stats.min / transitionsPerSequence,
      max: stats.max / transitionsPerSequence,
      median: stats.median / transitionsPerSequence,
      p95: stats.p95 / transitionsPerSequence,
      p99: stats.p99 / transitionsPerSequence,
    },
    transitionCount: samples * transitionsPerSequence,
    fromPhase: 'INIT',
    toPhase: 'COMPLETED',
    passed: stats.avg / transitionsPerSequence < 0.1,
    threshold: 0.1,
  };
}

// ============================================================
// 基准测试：决策路径选择
// ============================================================

/**
 * 基准测试：决策路径选择性能
 */
export async function benchDecisionPathSelection(): Promise<StateMachineResult> {
  const samples = 1000;
  const durationsMs: number[] = [];

  const riskLevels: RiskLevel[] = [
    RiskLevel.VERY_LOW,
    RiskLevel.LOW,
    RiskLevel.MEDIUM,
    RiskLevel.HIGH,
    RiskLevel.CRITICAL,
  ];

  for (let i = 0; i < samples; i++) {
    const sm = new PhaseStateMachine();
    const riskLevel = riskLevels[i % riskLevels.length];

    const start = performance.now();
    sm.selectDecisionPath(riskLevel);
    durationsMs.push(performance.now() - start);
  }

  const stats = calculateStats(durationsMs);

  return {
    type: 'state-machine',
    name: 'Decision Path Selection',
    description: `选择决策路径的性能 (${samples} 个样本)`,
    stats,
    transitionCount: samples,
    fromPhase: 'INIT',
    toPhase: 'INIT',
    passed: stats.avg < 0.01, // 目标：< 0.01ms
    threshold: 0.01,
  };
}

// ============================================================
// 基准测试：风险评估性能
// ============================================================

/**
 * 基准测试：风险评估性能
 */
export async function benchRiskAssessment(): Promise<StateMachineResult> {
  const samples = 1000;
  const durationsMs: number[] = [];

  const testContexts = [
    {
      description: 'A simple project with basic requirements',
      goals: ['Implement basic feature'],
      complexity: 'simple' as const,
    },
    {
      description: 'A standard software development project with security requirements',
      goals: ['Implement user authentication', 'Build API endpoints', 'Add security'],
      complexity: 'standard' as const,
      has_security_scope: true,
    },
    {
      description: 'An advanced project with infrastructure changes and security',
      goals: ['Migrate database', 'Update security', 'Scale infrastructure'],
      complexity: 'advanced' as const,
      has_security_scope: true,
      has_infrastructure_scope: true,
      file_count: 150,
    },
    {
      description: 'A critical enterprise project with payment processing and compliance',
      goals: ['Implement payment system', 'Ensure PCI compliance', 'Add encryption'],
      complexity: 'enterprise' as const,
      has_security_scope: true,
      has_infrastructure_scope: true,
      file_count: 500,
      constraints: ['GDPR compliance required', 'PCI DSS certification'],
    },
  ];

  for (let i = 0; i < samples; i++) {
    const sm = new PhaseStateMachine();
    const context = testContexts[i % testContexts.length];

    const start = performance.now();
    sm.assessRisk(context);
    durationsMs.push(performance.now() - start);
  }

  const stats = calculateStats(durationsMs);

  return {
    type: 'state-machine',
    name: 'Risk Assessment',
    description: `风险评估性能 (${samples} 个样本，4 种复杂度级别)`,
    stats,
    transitionCount: samples,
    fromPhase: 'INIT',
    toPhase: 'INIT',
    passed: stats.avg < 1, // 目标：< 1ms
    threshold: 1,
  };
}

// ============================================================
// 基准测试：组合评估与路径选择
// ============================================================

/**
 * 基准测试：风险评估 + 路径选择组合
 */
export async function benchEvaluateAndSelectPath(): Promise<StateMachineResult> {
  const samples = 1000;
  const durationsMs: number[] = [];

  const testContexts = [
    {
      description: 'Simple project',
      goals: ['Build feature'],
      complexity: 'simple' as const,
    },
    {
      description: 'Standard project',
      goals: ['Build app'],
      complexity: 'standard' as const,
    },
    {
      description: 'Complex project',
      goals: ['Build system', 'Add security'],
      complexity: 'advanced' as const,
      has_security_scope: true,
    },
    {
      description: 'Enterprise project',
      goals: ['Build platform', 'Payment processing'],
      complexity: 'enterprise' as const,
      has_security_scope: true,
      file_count: 300,
    },
  ];

  for (let i = 0; i < samples; i++) {
    const sm = new PhaseStateMachine();
    const context = testContexts[i % testContexts.length];

    const start = performance.now();
    sm.evaluateAndSelectPath(context);
    durationsMs.push(performance.now() - start);
  }

  const stats = calculateStats(durationsMs);

  return {
    type: 'state-machine',
    name: 'Evaluate & Select Path',
    description: `风险评估 + 路径选择组合性能 (${samples} 个样本)`,
    stats,
    transitionCount: samples,
    fromPhase: 'INIT',
    toPhase: 'INIT',
    passed: stats.avg < 1, // 目标：< 1ms
    threshold: 1,
  };
}

// ============================================================
// 基准测试：获取有效阶段序列
// ============================================================

/**
 * 基准测试：获取有效阶段序列性能
 */
export async function benchGetEffectivePhaseSequence(): Promise<StateMachineResult> {
  const samples = 10000;
  const durationsMs: number[] = [];

  const decisionPaths: DecisionPath[] = [
    DecisionPath.EXPRESS,
    DecisionPath.QUICK,
    DecisionPath.STANDARD,
    DecisionPath.DEEP,
    DecisionPath.FULL,
  ];

  const riskLevels: RiskLevel[] = [
    RiskLevel.VERY_LOW,
    RiskLevel.LOW,
    RiskLevel.MEDIUM,
    RiskLevel.HIGH,
    RiskLevel.CRITICAL,
  ];

  for (let i = 0; i < samples; i++) {
    const sm = new PhaseStateMachine();
    const path = decisionPaths[i % decisionPaths.length];
    const riskLevel = riskLevels[i % riskLevels.length];
    sm.selectDecisionPath(riskLevel);

    const start = performance.now();
    sm.getEffectivePhaseSequence();
    durationsMs.push(performance.now() - start);
  }

  const stats = calculateStats(durationsMs);

  return {
    type: 'state-machine',
    name: 'Get Effective Phase Sequence',
    description: `获取有效阶段序列性能 (${samples} 个样本)`,
    stats,
    transitionCount: samples,
    fromPhase: 'INIT',
    toPhase: 'COMPLETED',
    passed: stats.avg < 0.01, // 目标：< 0.01ms
    threshold: 0.01,
  };
}

// ============================================================
// 基准测试：状态机序列化/反序列化
// ============================================================

/**
 * 基准测试：状态机序列化
 */
export async function benchStateMachineSerialization(): Promise<StateMachineResult> {
  const samples = 1000;
  const durationsMs: number[] = [];

  for (let i = 0; i < samples; i++) {
    const sm = new PhaseStateMachine();
    sm.selectDecisionPath(RiskLevel.MEDIUM);
    sm.transitionTo(Phase.RESEARCH, 'Test');
    sm.transitionTo(Phase.DECISION, 'Test');
    sm.transitionTo(Phase.EXECUTION, 'Test');

    const start = performance.now();
    sm.toJSON();
    durationsMs.push(performance.now() - start);
  }

  const stats = calculateStats(durationsMs);

  return {
    type: 'state-machine',
    name: 'State Machine Serialization',
    description: `状态机序列化为 JSON (${samples} 个样本)`,
    stats,
    transitionCount: samples,
    fromPhase: 'INIT',
    toPhase: 'EXECUTION',
    passed: stats.avg < 0.1, // 目标：< 0.1ms
    threshold: 0.1,
  };
}

/**
 * 基准测试：状态机反序列化
 */
export async function benchStateMachineDeserialization(): Promise<StateMachineResult> {
  const samples = 1000;
  const durationsMs: number[] = [];

  // 预先创建序列化数据
  const serializedData = {
    currentPhase: Phase.EXECUTION,
    phaseHistory: [
      { from: Phase.INIT, to: Phase.RESEARCH, timestamp: Date.now() - 3000, reason: 'Start', decision_path: DecisionPath.STANDARD },
      { from: Phase.RESEARCH, to: Phase.DECISION, timestamp: Date.now() - 2000, reason: 'Research done', decision_path: DecisionPath.STANDARD },
      { from: Phase.DECISION, to: Phase.EXECUTION, timestamp: Date.now() - 1000, reason: 'Approved', decision_path: DecisionPath.STANDARD },
    ],
    decisionPath: DecisionPath.STANDARD,
    riskLevel: RiskLevel.MEDIUM,
    phaseBeforePause: null,
  };

  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    PhaseStateMachine.fromJSON(serializedData);
    durationsMs.push(performance.now() - start);
  }

  const stats = calculateStats(durationsMs);

  return {
    type: 'state-machine',
    name: 'State Machine Deserialization',
    description: `从 JSON 反序列化状态机 (${samples} 个样本)`,
    stats,
    transitionCount: samples,
    fromPhase: 'INIT',
    toPhase: 'EXECUTION',
    passed: stats.avg < 0.1, // 目标：< 0.1ms
    threshold: 0.1,
  };
}

// ============================================================
// 基准测试：阶段可用转换查询
// ============================================================

/**
 * 基准测试：查询可用转换
 */
export async function benchGetAvailableTransitions(): Promise<StateMachineResult> {
  const samples = 10000;
  const durationsMs: number[] = [];

  const phases: Phase[] = [
    Phase.INIT,
    Phase.RESEARCH,
    Phase.DECISION,
    Phase.EXECUTION,
    Phase.FEEDBACK,
    Phase.DELIVERY,
  ];

  for (let i = 0; i < samples; i++) {
    const sm = new PhaseStateMachine(phases[i % phases.length]);

    const start = performance.now();
    sm.getAvailableTransitions();
    durationsMs.push(performance.now() - start);
  }

  const stats = calculateStats(durationsMs);

  return {
    type: 'state-machine',
    name: 'Get Available Transitions',
    description: `查询可用状态转换 (${samples} 个样本)`,
    stats,
    transitionCount: samples,
    fromPhase: 'INIT',
    toPhase: 'N/A',
    passed: stats.avg < 0.01, // 目标：< 0.01ms
    threshold: 0.01,
  };
}

// ============================================================
// 导出所有状态机基准测试
// ============================================================

/**
 * 运行所有状态机基准测试
 */
export async function runAllStateMachineBenchmarks(): Promise<StateMachineResult[]> {
  const results: StateMachineResult[] = [];

  console.log('运行状态机基准测试...');

  results.push(await benchStateTransition());
  console.log(`  ✓ 状态转换延迟: 平均 ${results[0].stats.avg.toFixed(4)} ms`);

  results.push(await benchFullPhaseSequence());
  console.log(`  ✓ 完整阶段序列: 平均 ${results[1].stats.avg.toFixed(4)} ms/transition`);

  results.push(await benchDecisionPathSelection());
  console.log(`  ✓ 决策路径选择: 平均 ${results[2].stats.avg.toFixed(4)} ms`);

  results.push(await benchRiskAssessment());
  console.log(`  ✓ 风险评估: 平均 ${results[3].stats.avg.toFixed(4)} ms`);

  results.push(await benchEvaluateAndSelectPath());
  console.log(`  ✓ 评估与选择: 平均 ${results[4].stats.avg.toFixed(4)} ms`);

  results.push(await benchGetEffectivePhaseSequence());
  console.log(`  ✓ 有效阶段序列: 平均 ${results[5].stats.avg.toFixed(4)} ms`);

  results.push(await benchStateMachineSerialization());
  console.log(`  ✓ 状态机序列化: 平均 ${results[6].stats.avg.toFixed(4)} ms`);

  results.push(await benchStateMachineDeserialization());
  console.log(`  ✓ 状态机反序列化: 平均 ${results[7].stats.avg.toFixed(4)} ms`);

  results.push(await benchGetAvailableTransitions());
  console.log(`  ✓ 可用转换查询: 平均 ${results[8].stats.avg.toFixed(4)} ms`);

  return results;
}
