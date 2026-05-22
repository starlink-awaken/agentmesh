/**
 * Team Types - 多角色协作系统类型定义
 *
 * @author PAI
 * @version 1.0.0
 */

export type AgentRole =
  | 'product_owner'
  | 'spec_writer'
  | 'architect'
  | 'tech_lead'
  | 'developer'
  | 'code_monkey'
  | 'reviewer'
  | 'debugger'
  | 'troubleshooter'
  | 'tech_writer';

export interface AgentConfig {
  role: AgentRole;
  name: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
  tools?: string[];
  model?: 'haiku' | 'sonnet' | 'opus';
}

export type WorkflowPhase =
  | 'requirements'
  | 'architecture'
  | 'implementation'
  | 'review'
  | 'debugging'
  | 'documentation';

export interface IterationTask {
  id: string;
  phase: WorkflowPhase;
  description: string;
  agentRole: AgentRole;
  status: 'pending' | 'in_progress' | 'reviewing' | 'completed' | 'failed';
  iterations: number;
  maxIterations: number;
  result?: unknown;
  feedback?: string;
  humanApprovalRequired: boolean;
  approved?: boolean;
}

export interface HumanInterventionRequest {
  id: string;
  taskId: string;
  type: 'approval' | 'feedback' | 'confirmation' | 'intervention';
  message: string;
  options?: string[];
  response?: string;
  timestamp: Date;
  resolved: boolean;
}
