/**
 * Edge Module Types - 边缘计算类型定义
 *
 * @author PAI
 */

/**
 * 边缘Agent类型 - 基于CAMPHOR论文
 */
export type EdgeAgentType =
  | 'reasoning'        // 高阶推理Agent
  | 'personal_context' // 个人上下文Agent
  | 'device_info'      // 设备信息Agent
  | 'user_perception'  // 用户感知Agent
  | 'external_knowledge' // 外部知识Agent
  | 'task_completion'; // 任务完成Agent

/**
 * 边缘Agent配置
 */
export interface EdgeAgentConfig {
  type: EdgeAgentType;
  name: string;
  description: string;
  tools: string[];  // 可用的函数调用
  maxRetries?: number;
  timeout?: number;
}

/**
 * 边缘任务
 */
export interface EdgeTask {
  id: string;
  type: 'query' | 'action' | 'retrieval';
  input: string;
  requiredAgents: EdgeAgentType[];
  priority?: 'low' | 'medium' | 'high';
  context?: Record<string, unknown>;
}

/**
 * 边缘任务结果
 */
export interface EdgeResult {
  taskId: string;
  success: boolean;
  output: unknown;
  agentUsed: EdgeAgentType;
  tokensSaved?: number;    // 通过压缩节省的token
  latency?: number;       // 执行延迟(ms)
  error?: string;
}

/**
 * 任务卸载策略
 */
export type OffloadStrategy =
  | 'cloud_only'      // 仅云端
  | 'edge_only'       // 仅边缘
  | 'cloud_first'     // 云端优先
  | 'edge_first'       // 边缘优先
  | 'dynamic';         // 动态决定

/**
 * 压缩配置
 */
export interface CompressionConfig {
  method: 'token' | 'summary' | 'hybrid';
  targetRatio?: number;  // 目标压缩比
  preserveKeys?: string[]; // 保留的键
}

/**
 * 云边端计算层级
 */
export type ComputeTier = 'cloud' | 'edge' | 'device';

/**
 * 任务卸载决策
 */
export interface OffloadDecision {
  targetTier: ComputeTier;
  reason: string;
  estimatedLatency: number;
  estimatedCost: number;
}
