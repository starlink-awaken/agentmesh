/**
 * WorkflowOrchestrator - 工作流编排器
 *
 * 负责阶段序列定义、阶段转换规则、人类介入判断
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  AgentRole,
  WorkflowPhase,
  IterationTask,
  HumanInterventionRequest,
} from './types.js';
import { MultiRoleAgentManager } from './MultiRoleAgentManager.js';

/**
 * 阶段转换规则配置
 */
export interface PhaseTransitionRule {
  from: WorkflowPhase;
  to: WorkflowPhase;
  condition: (context: TransitionContext) => boolean;
  humanApprovalRequired: boolean;
  autoAdvance?: boolean;
}

/**
 * 阶段转换上下文
 */
export interface TransitionContext {
  currentPhase: WorkflowPhase;
  tasks: IterationTask[];
  completedTasks: IterationTask[];
  failedTasks: IterationTask[];
  pendingInterventions: HumanInterventionRequest[];
}

/**
 * 人类介入判断配置
 */
export interface HumanInterventionCondition {
  phase: WorkflowPhase;
  trigger: 'task_completed' | 'task_failed' | 'max_iterations' | 'manual' | 'custom';
  predicate?: (task: IterationTask, context: TransitionContext) => boolean;
}

/**
 * 默认阶段序列
 */
const DEFAULT_PHASE_SEQUENCE: WorkflowPhase[] = [
  'requirements',
  'architecture',
  'implementation',
  'review',
  'debugging',
  'documentation',
];

/**
 * 默认阶段转换规则
 */
const DEFAULT_TRANSITION_RULES: PhaseTransitionRule[] = [
  {
    from: 'requirements',
    to: 'architecture',
    condition: (ctx) => {
      const completed = ctx.completedTasks.filter(t => t.phase === 'requirements');
      const total = ctx.tasks.filter(t => t.phase === 'requirements');
      return total.length > 0 && completed.length === total.length;
    },
    humanApprovalRequired: true,
  },
  {
    from: 'architecture',
    to: 'implementation',
    condition: (ctx) => {
      const completed = ctx.completedTasks.filter(t => t.phase === 'architecture');
      const total = ctx.tasks.filter(t => t.phase === 'architecture');
      return total.length > 0 && completed.length === total.length;
    },
    humanApprovalRequired: true,
  },
  {
    from: 'implementation',
    to: 'review',
    condition: (ctx) => {
      const completed = ctx.completedTasks.filter(t => t.phase === 'implementation');
      const total = ctx.tasks.filter(t => t.phase === 'implementation');
      return total.length > 0 && completed.length === total.length;
    },
    humanApprovalRequired: false,
  },
  {
    from: 'review',
    to: 'debugging',
    condition: (ctx) => {
      const completed = ctx.completedTasks.filter(t => t.phase === 'review');
      const total = ctx.tasks.filter(t => t.phase === 'review');
      // 如果有失败的任务，需要进入调试阶段
      return (total.length > 0 && completed.length === total.length) || ctx.failedTasks.length > 0;
    },
    humanApprovalRequired: true,
  },
  {
    from: 'debugging',
    to: 'review',
    condition: (ctx) => {
      const completed = ctx.completedTasks.filter(t => t.phase === 'debugging');
      const total = ctx.tasks.filter(t => t.phase === 'debugging');
      return total.length > 0 && completed.length === total.length;
    },
    humanApprovalRequired: false,
    autoAdvance: true,
  },
  {
    from: 'review',
    to: 'documentation',
    condition: (ctx) => {
      const completed = ctx.completedTasks.filter(t => t.phase === 'review');
      const total = ctx.tasks.filter(t => t.phase === 'review');
      return total.length > 0 && completed.length === total.length && ctx.failedTasks.length === 0;
    },
    humanApprovalRequired: true,
  },
  {
    from: 'documentation',
    to: 'documentation',
    condition: () => false,
    humanApprovalRequired: false,
    autoAdvance: false,
  },
];

/**
 * 默认人类介入条件
 */
const DEFAULT_HUMAN_INTERVENTION_CONDITIONS: HumanInterventionCondition[] = [
  {
    phase: 'requirements',
    trigger: 'task_completed',
    predicate: () => true,
  },
  {
    phase: 'architecture',
    trigger: 'task_completed',
    predicate: () => true,
  },
  {
    phase: 'implementation',
    trigger: 'max_iterations',
  },
  {
    phase: 'review',
    trigger: 'task_failed',
  },
  {
    phase: 'debugging',
    trigger: 'task_completed',
  },
  {
    phase: 'documentation',
    trigger: 'task_completed',
  },
];

/**
 * 工作流编排器
 */
export class WorkflowOrchestrator {
  private manager: MultiRoleAgentManager;
  private phaseSequence: WorkflowPhase[];
  private transitionRules: PhaseTransitionRule[];
  private humanInterventionConditions: HumanInterventionCondition[];
  private currentPhaseIndex: number;
  private autoAdvance: boolean;
  private onPhaseChange?: (from: WorkflowPhase, to: WorkflowPhase) => void;
  private onHumanIntervention?: (request: HumanInterventionRequest) => void;

  constructor(
    manager: MultiRoleAgentManager,
    options?: {
      phaseSequence?: WorkflowPhase[];
      transitionRules?: PhaseTransitionRule[];
      humanInterventionConditions?: HumanInterventionCondition[];
      autoAdvance?: boolean;
      onPhaseChange?: (from: WorkflowPhase, to: WorkflowPhase) => void;
      onHumanIntervention?: (request: HumanInterventionRequest) => void;
    }
  ) {
    this.manager = manager;
    this.phaseSequence = options?.phaseSequence ?? DEFAULT_PHASE_SEQUENCE;
    this.transitionRules = options?.transitionRules ?? DEFAULT_TRANSITION_RULES;
    this.humanInterventionConditions = options?.humanInterventionConditions ?? DEFAULT_HUMAN_INTERVENTION_CONDITIONS;
    this.autoAdvance = options?.autoAdvance ?? false;
    this.onPhaseChange = options?.onPhaseChange;
    this.onHumanIntervention = options?.onHumanIntervention;
    this.currentPhaseIndex = 0;

    // 初始化当前阶段
    this.manager.setCurrentPhase(this.phaseSequence[0]);
  }

  /**
   * 获取当前阶段
   */
  getCurrentPhase(): WorkflowPhase {
    return this.phaseSequence[this.currentPhaseIndex];
  }

  /**
   * 获取当前阶段的索引
   */
  getCurrentPhaseIndex(): number {
    return this.currentPhaseIndex;
  }

  /**
   * 获取阶段序列
   */
  getPhaseSequence(): WorkflowPhase[] {
    return [...this.phaseSequence];
  }

  /**
   * 检查是否可以进入下一阶段
   */
  canAdvance(): boolean {
    const currentPhase = this.getCurrentPhase();
    const nextIndex = this.currentPhaseIndex + 1;

    if (nextIndex >= this.phaseSequence.length) {
      return false;
    }

    const nextPhase = this.phaseSequence[nextIndex];
    const rule = this.getTransitionRule(currentPhase, nextPhase);

    if (!rule) {
      return false;
    }

    return this.checkTransitionCondition(rule);
  }

  /**
   * 尝试进入下一阶段
   */
  advance(): { success: boolean; newPhase?: WorkflowPhase; requiresApproval?: boolean; reason?: string } {
    const currentPhase = this.getCurrentPhase();
    const nextIndex = this.currentPhaseIndex + 1;

    if (nextIndex >= this.phaseSequence.length) {
      return { success: false, reason: 'Already at final phase' };
    }

    const nextPhase = this.phaseSequence[nextIndex];
    const rule = this.getTransitionRule(currentPhase, nextPhase);

    if (!rule) {
      return { success: false, reason: 'No transition rule defined' };
    }

    if (!this.checkTransitionCondition(rule)) {
      return { success: false, reason: 'Transition conditions not met' };
    }

    // 检查是否需要人类审批
    if (rule.humanApprovalRequired) {
      return { success: false, requiresApproval: true, reason: 'Human approval required' };
    }

    // 执行阶段转换
    return this.performPhaseTransition(rule);
  }

  /**
   * 执行阶段转换
   */
  private performPhaseTransition(rule: PhaseTransitionRule): { success: boolean; newPhase?: WorkflowPhase } {
    const fromPhase = this.getCurrentPhase();
    const toPhase = rule.to;

    this.currentPhaseIndex++;
    this.manager.setCurrentPhase(toPhase);

    // 触发回调
    if (this.onPhaseChange) {
      this.onPhaseChange(fromPhase, toPhase);
    }

    return { success: true, newPhase: toPhase };
  }

  /**
   * 批准阶段转换
   */
  approveAdvance(): { success: boolean; newPhase?: WorkflowPhase } {
    const currentPhase = this.getCurrentPhase();
    const nextIndex = this.currentPhaseIndex + 1;

    if (nextIndex >= this.phaseSequence.length) {
      return { success: false };
    }

    const nextPhase = this.phaseSequence[nextIndex];
    const rule = this.getTransitionRule(currentPhase, nextPhase);

    if (!rule) {
      return { success: false };
    }

    return this.performPhaseTransition(rule);
  }

  /**
   * 跳转到指定阶段
   */
  jumpToPhase(phase: WorkflowPhase): boolean {
    const index = this.phaseSequence.indexOf(phase);
    if (index === -1) {
      return false;
    }

    const fromPhase = this.getCurrentPhase();
    this.currentPhaseIndex = index;
    this.manager.setCurrentPhase(phase);

    if (this.onPhaseChange) {
      this.onPhaseChange(fromPhase, phase);
    }

    return true;
  }

  /**
   * 获取阶段转换规则
   */
  private getTransitionRule(from: WorkflowPhase, to: WorkflowPhase): PhaseTransitionRule | undefined {
    return this.transitionRules.find(r => r.from === from && r.to === to);
  }

  /**
   * 检查转换条件
   */
  private checkTransitionCondition(rule: PhaseTransitionRule): boolean {
    const context = this.buildTransitionContext();
    return rule.condition(context);
  }

  /**
   * 构建转换上下文
   */
  private buildTransitionContext(): TransitionContext {
    const allTasks = this.manager.getIterationTasks();
    return {
      currentPhase: this.getCurrentPhase(),
      tasks: allTasks,
      completedTasks: allTasks.filter(t => t.status === 'completed'),
      failedTasks: allTasks.filter(t => t.status === 'failed'),
      pendingInterventions: this.manager.getPendingInterventions(),
    };
  }

  /**
   * 检查任务是否需要人类介入
   */
  checkHumanInterventionRequired(task: IterationTask): boolean {
    const conditions = this.humanInterventionConditions.filter(c => c.phase === task.phase);

    for (const condition of conditions) {
      if (condition.trigger === 'max_iterations' && task.iterations >= task.maxIterations) {
        return true;
      }

      if (condition.trigger === 'task_failed' && task.status === 'failed') {
        return true;
      }

      if (condition.trigger === 'task_completed' && task.status === 'completed') {
        if (condition.predicate) {
          const context = this.buildTransitionContext();
          return condition.predicate(task, context);
        }
        return true;
      }

      if (condition.trigger === 'manual' && task.humanApprovalRequired) {
        return true;
      }
    }

    return false;
  }

  /**
   * 请求人类介入
   */
  requestHumanIntervention(
    taskId: string,
    type: HumanInterventionRequest['type'],
    message: string,
    options?: string[]
  ): HumanInterventionRequest {
    const request = this.manager.requestHumanIntervention(taskId, type, message, options);

    if (this.onHumanIntervention) {
      this.onHumanIntervention(request);
    }

    return request;
  }

  /**
   * 获取当前阶段的所有可用任务
   */
  getCurrentPhaseTasks(): IterationTask[] {
    const currentPhase = this.getCurrentPhase();
    return this.manager.getTasksByPhase(currentPhase);
  }

  /**
   * 获取当前阶段的进度
   */
  getPhaseProgress(): { completed: number; total: number; percentage: number } {
    const tasks = this.getCurrentPhaseTasks();
    const completed = tasks.filter(t => t.status === 'completed').length;
    const total = tasks.length || 1;

    return {
      completed,
      total,
      percentage: Math.round((completed / total) * 100),
    };
  }

  /**
   * 获取整体工作流进度
   */
  getWorkflowProgress(): { phase: WorkflowPhase; progress: number; overall: number } {
    const overallProgress = this.manager.getOverallProgress();
    let totalCompleted = 0;
    let totalTasks = 0;

    for (const phase of this.phaseSequence) {
      const stats = overallProgress[phase];
      totalCompleted += stats.completed;
      totalTasks += stats.total;
    }

    return {
      phase: this.getCurrentPhase(),
      progress: this.getPhaseProgress().percentage,
      overall: totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0,
    };
  }

  /**
   * 检查工作流是否完成
   */
  isWorkflowComplete(): boolean {
    return this.currentPhaseIndex >= this.phaseSequence.length - 1 && this.canAdvance() === false;
  }

  /**
   * 获取下一阶段的名称
   */
  getNextPhase(): WorkflowPhase | null {
    const nextIndex = this.currentPhaseIndex + 1;
    if (nextIndex >= this.phaseSequence.length) {
      return null;
    }
    return this.phaseSequence[nextIndex];
  }

  /**
   * 获取指定阶段的默认 Agent 角色
   */
  getDefaultRolesForPhase(phase: WorkflowPhase): AgentRole[] {
    const phaseRoles: Record<WorkflowPhase, AgentRole[]> = {
      requirements: ['product_owner', 'spec_writer'],
      architecture: ['architect', 'tech_lead'],
      implementation: ['developer', 'code_monkey'],
      review: ['reviewer'],
      debugging: ['debugger', 'troubleshooter'],
      documentation: ['tech_writer'],
    };
    return phaseRoles[phase] ?? [];
  }

  /**
   * 设置自动推进
   */
  setAutoAdvance(enabled: boolean): void {
    this.autoAdvance = enabled;
  }

  /**
   * 获取工作流信息
   */
  getInfo(): {
    currentPhase: WorkflowPhase;
    currentPhaseIndex: number;
    totalPhases: number;
    progress: { phase: WorkflowPhase; progress: number; overall: number };
    isComplete: boolean;
  } {
    return {
      currentPhase: this.getCurrentPhase(),
      currentPhaseIndex: this.currentPhaseIndex,
      totalPhases: this.phaseSequence.length,
      progress: this.getWorkflowProgress(),
      isComplete: this.isWorkflowComplete(),
    };
  }
}

export default WorkflowOrchestrator;
