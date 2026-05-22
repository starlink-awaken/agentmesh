/**
 * Team 模块 - 统一导出
 *
 * @author PAI
 * @version 1.0.0
 */

export {
  TeamManager,
} from './TeamManager.js';

export {
  MultiRoleAgentManager,
} from './MultiRoleAgentManager.js';

export {
  WorkflowOrchestrator,
} from './WorkflowOrchestrator.js';

export type {
  Teammate,
  TeamTask,
  TeamMessage,
  TeamConfig,
} from './TeamManager.js';

export type {
  AgentRole,
  AgentConfig,
  WorkflowPhase,
  IterationTask,
  HumanInterventionRequest,
} from './types.js';
