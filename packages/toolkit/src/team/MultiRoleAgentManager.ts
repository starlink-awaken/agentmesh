/**
 * MultiRoleAgentManager - 多角色 Agent 管理器
 *
 * 支持 10 种 Agent 角色的配置、迭代任务执行、人类介入机制
 *
 * @author PAI
 * @version 1.0.0
 */

import { TeamManager, type Teammate, type TeamTask } from './TeamManager.js';
import type {
  AgentRole,
  AgentConfig,
  WorkflowPhase,
  IterationTask,
  HumanInterventionRequest,
} from './types.js';

/**
 * Agent 角色配置预设
 */
const AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
  product_owner: {
    role: 'product_owner',
    name: 'Product Owner',
    description: '负责产品愿景、需求优先级和业务价值决策',
    systemPrompt: '你是一个产品所有者，负责定义产品愿景、优先级排序和业务价值评估。你需要与利益相关者合作，收集需求，并确保开发团队理解产品目标。',
    capabilities: ['需求分析', '优先级排序', '利益相关者管理', '产品愿景定义'],
    model: 'sonnet',
  },
  spec_writer: {
    role: 'spec_writer',
    name: 'Spec Writer',
    description: '负责编写详细的功能规范和技术规格',
    systemPrompt: '你是一个技术文档专家，负责编写清晰、完整、可测试的功能规范。你的文档应该详细描述用户故事、功能需求、验收标准和边界条件。',
    capabilities: ['规范编写', '需求细化', '验收标准定义', '技术写作'],
    model: 'sonnet',
  },
  architect: {
    role: 'architect',
    name: 'Architect',
    description: '负责系统架构设计和技术决策',
    systemPrompt: '你是一个系统架构师，负责设计可扩展、可维护的系统架构。你需要考虑技术选型、模块划分、数据流设计和性能优化。',
    capabilities: ['架构设计', '技术选型', '性能优化', '系统分析'],
    model: 'opus',
  },
  tech_lead: {
    role: 'tech_lead',
    name: 'Tech Lead',
    description: '负责技术指导、代码审查和开发协调',
    systemPrompt: '你是一个技术负责人，负责提供技术指导、代码审查和开发协调。你需要确保代码质量、解决技术难题并指导开发团队。',
    capabilities: ['技术指导', '代码审查', '问题解决', '团队协调'],
    model: 'sonnet',
  },
  developer: {
    role: 'developer',
    name: 'Developer',
    description: '负责功能开发和实现',
    systemPrompt: '你是一个开发者，负责根据规范实现功能代码。你需要遵循最佳实践，编写可测试、可维护的代码。',
    capabilities: ['功能开发', '单元测试', '代码实现', '调试'],
    model: 'sonnet',
  },
  code_monkey: {
    role: 'code_monkey',
    name: 'Code Monkey',
    description: '负责重复性编码任务和脚手架生成',
    systemPrompt: '你是一个高效的代码生成者，负责快速生成样板代码、脚本和重复性编码任务。你需要准确遵循给定模板并高效完成任务。',
    capabilities: ['代码生成', '脚本编写', '样板代码', '批量修改'],
    model: 'haiku',
  },
  reviewer: {
    role: 'reviewer',
    name: 'Reviewer',
    description: '负责代码审查和质量评估',
    systemPrompt: '你是一个代码审查员，负责审查代码质量、找出潜在问题并提供改进建议。你需要关注代码风格、安全性、性能和可维护性。',
    capabilities: ['代码审查', '质量评估', '问题发现', '改进建议'],
    model: 'sonnet',
  },
  debugger: {
    role: 'debugger',
    name: 'Debugger',
    description: '负责问题定位和故障排除',
    systemPrompt: '你是一个调试专家，负责定位和解决复杂的技术问题。你需要分析错误日志、重现问题并提供解决方案。',
    capabilities: ['问题定位', '日志分析', '故障排除', '性能诊断'],
    model: 'sonnet',
  },
  troubleshooter: {
    role: 'troubleshooter',
    name: 'Troubleshooter',
    description: '负责系统性问题和复杂故障的诊断',
    systemPrompt: '你是一个故障诊断专家，负责处理复杂的系统性问题。你需要从宏观角度分析问题根源，协调多个团队解决跨领域问题。',
    capabilities: ['系统诊断', '根因分析', '跨团队协调', '问题预防'],
    model: 'opus',
  },
  tech_writer: {
    role: 'tech_writer',
    name: 'Tech Writer',
    description: '负责技术文档编写和维护',
    systemPrompt: '你是一个技术文档专家，负责编写和维护技术文档。你的文档应该清晰、准确、易于理解。',
    capabilities: ['文档编写', 'API文档', '教程编写', '文档维护'],
    model: 'sonnet',
  },
};

/**
 * 多角色 Agent 管理器
 */
export class MultiRoleAgentManager {
  private teamManager: TeamManager;
  private agentConfigs: Map<AgentRole, AgentConfig> = new Map();
  private iterationTasks: Map<string, IterationTask> = new Map();
  private humanInterventionRequests: Map<string, HumanInterventionRequest> = new Map();
  private currentPhase: WorkflowPhase = 'requirements';
  private taskIdCounter = 0;
  private interventionIdCounter = 0;

  constructor(config?: { name?: string; description?: string; model?: 'haiku' | 'sonnet' | 'opus' }) {
    this.teamManager = new TeamManager({
      name: config?.name ?? 'Multi-Role Agent Team',
      description: config?.description ?? 'GPT-Pilot 多角色协作系统',
      model: config?.model ?? 'sonnet',
    });

    // 初始化所有 Agent 配置
    this.initializeAgentConfigs();
  }

  /**
   * 初始化 Agent 配置
   */
  private initializeAgentConfigs(): void {
    for (const [role, config] of Object.entries(AGENT_CONFIGS)) {
      this.agentConfigs.set(role as AgentRole, config);
      // 同时在 TeamManager 中创建对应的 teammate
      this.teamManager.addTeammate(config.name, role, {
        description: config.description,
        capabilities: config.capabilities,
        model: config.model,
      });
    }
  }

  /**
   * 获取所有 Agent 配置
   */
  getAgentConfigs(): AgentConfig[] {
    return Array.from(this.agentConfigs.values());
  }

  /**
   * 获取指定角色的 Agent 配置
   */
  getAgentConfig(role: AgentRole): AgentConfig | undefined {
    return this.agentConfigs.get(role);
  }

  /**
   * 获取所有可用的 Agent 角色
   */
  getAvailableRoles(): AgentRole[] {
    return Array.from(this.agentConfigs.keys());
  }

  /**
   * 根据角色获取团队成员
   */
  getTeammatesByRole(role: AgentRole): Teammate[] {
    return this.teamManager.getTeammatesByRole(role);
  }

  /**
   * 获取当前工作流阶段
   */
  getCurrentPhase(): WorkflowPhase {
    return this.currentPhase;
  }

  /**
   * 设置工作流阶段
   */
  setCurrentPhase(phase: WorkflowPhase): void {
    this.currentPhase = phase;
  }

  /**
   * 获取阶段对应的默认角色
   */
  getDefaultRoleForPhase(phase: WorkflowPhase): AgentRole {
    const phaseRoleMap: Record<WorkflowPhase, AgentRole> = {
      requirements: 'product_owner',
      architecture: 'architect',
      implementation: 'developer',
      review: 'reviewer',
      debugging: 'debugger',
      documentation: 'tech_writer',
    };
    return phaseRoleMap[phase];
  }

  // ==================== 迭代任务管理 ====================

  /**
   * 创建迭代任务
   */
  createIterationTask(
    phase: WorkflowPhase,
    description: string,
    agentRole: AgentRole,
    maxIterations: number = 3,
    humanApprovalRequired: boolean = false
  ): IterationTask {
    const id = `iter_task_${++this.taskIdCounter}`;
    const task: IterationTask = {
      id,
      phase,
      description,
      agentRole,
      status: 'pending',
      iterations: 0,
      maxIterations,
      humanApprovalRequired,
    };
    this.iterationTasks.set(id, task);
    return task;
  }

  /**
   * 获取所有迭代任务
   */
  getIterationTasks(): IterationTask[] {
    return Array.from(this.iterationTasks.values());
  }

  /**
   * 获取指定阶段的任务
   */
  getTasksByPhase(phase: WorkflowPhase): IterationTask[] {
    return Array.from(this.iterationTasks.values()).filter(t => t.phase === phase);
  }

  /**
   * 开始执行任务
   */
  startTask(taskId: string): boolean {
    const task = this.iterationTasks.get(taskId);
    if (!task || task.status !== 'pending') return false;

    task.status = 'in_progress';
    task.iterations += 1;
    return true;
  }

  /**
   * 完成任务
   */
  completeTask(taskId: string, result?: unknown, feedback?: string): boolean {
    const task = this.iterationTasks.get(taskId);
    if (!task || task.status !== 'in_progress') return false;

    task.result = result;
    task.feedback = feedback;
    task.status = 'completed';
    return true;
  }

  /**
   * 标记任务为审查中
   */
  markTaskAsReviewing(taskId: string): boolean {
    const task = this.iterationTasks.get(taskId);
    if (!task || task.status !== 'in_progress') return false;

    task.status = 'reviewing';
    return true;
  }

  /**
   * 批准任务
   */
  approveTask(taskId: string, approved: boolean, feedback?: string): boolean {
    const task = this.iterationTasks.get(taskId);
    if (!task || task.status !== 'reviewing') return false;

    task.approved = approved;
    task.feedback = feedback;

    if (approved) {
      task.status = 'completed';
    } else if (task.iterations < task.maxIterations) {
      task.status = 'pending';
    } else {
      task.status = 'failed';
    }

    return true;
  }

  /**
   * 标记任务失败
   */
  failTask(taskId: string, feedback?: string): boolean {
    const task = this.iterationTasks.get(taskId);
    if (!task) return false;

    task.status = 'failed';
    task.feedback = feedback;
    return true;
  }

  /**
   * 检查任务是否需要人类介入
   */
  requiresHumanIntervention(taskId: string): boolean {
    const task = this.iterationTasks.get(taskId);
    if (!task) return false;

    return task.humanApprovalRequired || task.status === 'reviewing';
  }

  /**
   * 检查任务是否达到最大迭代次数
   */
  hasReachedMaxIterations(taskId: string): boolean {
    const task = this.iterationTasks.get(taskId);
    if (!task) return false;

    return task.iterations >= task.maxIterations;
  }

  // ==================== 人类介入机制 ====================

  /**
   * 请求人类介入
   */
  requestHumanIntervention(
    taskId: string,
    type: HumanInterventionRequest['type'],
    message: string,
    options?: string[]
  ): HumanInterventionRequest {
    const id = `intervention_${++this.interventionIdCounter}`;
    const request: HumanInterventionRequest = {
      id,
      taskId,
      type,
      message,
      options,
      timestamp: new Date(),
      resolved: false,
    };
    this.humanInterventionRequests.set(id, request);
    return request;
  }

  /**
   * 响应人类介入请求
   */
  respondToIntervention(interventionId: string, response: string): boolean {
    const request = this.humanInterventionRequests.get(interventionId);
    if (!request || request.resolved) return false;

    request.response = response;
    request.resolved = true;

    // 如果是审批类型的介入，相应地更新任务状态
    if (request.type === 'approval' || request.type === 'confirmation') {
      const task = this.iterationTasks.get(request.taskId);
      if (task) {
        task.approved = response.toLowerCase() === 'yes' || response.toLowerCase() === 'approved';
        if (task.approved) {
          task.status = 'completed';
        } else if (task.iterations < task.maxIterations) {
          task.status = 'pending';
        } else {
          task.status = 'failed';
        }
      }
    }

    return true;
  }

  /**
   * 获取未解决的介入请求
   */
  getPendingInterventions(): HumanInterventionRequest[] {
    return Array.from(this.humanInterventionRequests.values()).filter(r => !r.resolved);
  }

  /**
   * 获取指定任务的介入请求
   */
  getInterventionsForTask(taskId: string): HumanInterventionRequest[] {
    return Array.from(this.humanInterventionRequests.values()).filter(r => r.taskId === taskId);
  }

  // ==================== 工作流状态管理 ====================

  /**
   * 获取工作流进度
   */
  getWorkflowProgress(): { phase: WorkflowPhase; completed: number; total: number; percentage: number } {
    const phaseTasks = this.getTasksByPhase(this.currentPhase);
    const completed = phaseTasks.filter(t => t.status === 'completed').length;
    const total = phaseTasks.length || 1;

    return {
      phase: this.currentPhase,
      completed,
      total,
      percentage: Math.round((completed / total) * 100),
    };
  }

  /**
   * 获取整体进度
   */
  getOverallProgress(): Record<WorkflowPhase, { completed: number; total: number }> {
    const phases: WorkflowPhase[] = ['requirements', 'architecture', 'implementation', 'review', 'debugging', 'documentation'];
    const progress: Record<string, { completed: number; total: number }> = {};

    for (const phase of phases) {
      const tasks = this.getTasksByPhase(phase);
      progress[phase] = {
        completed: tasks.filter(t => t.status === 'completed').length,
        total: tasks.length,
      };
    }

    return progress as Record<WorkflowPhase, { completed: number; total: number }>;
  }

  /**
   * 获取任务统计
   */
  getTaskStats(): Record<IterationTask['status'], number> {
    const tasks = Array.from(this.iterationTasks.values());
    return {
      pending: tasks.filter(t => t.status === 'pending').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      reviewing: tasks.filter(t => t.status === 'reviewing').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
    };
  }

  // ==================== 集成 TeamManager ====================

  /**
   * 获取底层 TeamManager 实例
   */
  getTeamManager(): TeamManager {
    return this.teamManager;
  }

  /**
   * 导出管理器状态
   */
  exportState(): {
    agentConfigs: AgentConfig[];
    iterationTasks: IterationTask[];
    humanInterventionRequests: HumanInterventionRequest[];
    currentPhase: WorkflowPhase;
  } {
    return {
      agentConfigs: this.getAgentConfigs(),
      iterationTasks: this.getIterationTasks(),
      humanInterventionRequests: Array.from(this.humanInterventionRequests.values()),
      currentPhase: this.currentPhase,
    };
  }

  /**
   * 获取团队信息
   */
  getInfo(): {
    name: string;
    currentPhase: WorkflowPhase;
    agentCount: number;
    taskStats: Record<import('./types.js').IterationTask['status'], number>;
    pendingInterventions: number;
  } {
    const teamInfo = this.teamManager.getInfo();
    return {
      name: teamInfo.config.name,
      currentPhase: this.currentPhase,
      agentCount: teamInfo.memberCount,
      taskStats: this.getTaskStats(),
      pendingInterventions: this.getPendingInterventions().length,
    };
  }
}

export default MultiRoleAgentManager;
