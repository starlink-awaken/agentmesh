/**
 * Agent Toolkit 错误模块统一导出
 *
 * 提供统一的错误类型和工具函数导出
 *
 * @author PAI
 * @version 1.0.0
 */

// 导入基础错误类型
import {
  AgentToolkitError,
  LLMError,
  ValidationError,
  ConfigurationError,
  NetworkError,
  TimeoutError,
  AuthenticationError,
  RateLimitError,
  SessionError,
  ToolError,
  SkillError,
  TeamError,
  MemoryError,
  KnowledgeGraphError,
  PatternError,
  ArchitectureError,
  IntegrationError,
  RetryError,
} from './types.js';

// 导入错误工具函数
import {
  isRetryable,
  getErrorMessage,
  compressError,
  wrapError,
  extractErrorStack,
  createErrorFactory,
  isErrorType,
  mergeErrorDetails,
  calculateRetryDelay,
} from './errorUtils.js';

// 重新导出基础错误类型
export {
  AgentToolkitError,
  LLMError,
  ValidationError,
  ConfigurationError,
  NetworkError,
  TimeoutError,
  AuthenticationError,
  RateLimitError,
  SessionError,
  ToolError,
  SkillError,
  TeamError,
  MemoryError,
  KnowledgeGraphError,
  PatternError,
  ArchitectureError,
  IntegrationError,
  RetryError,
};

// 重新导出错误工具函数
export {
  isRetryable,
  getErrorMessage,
  compressError,
  wrapError,
  extractErrorStack,
  createErrorFactory,
  isErrorType,
  mergeErrorDetails,
  calculateRetryDelay,
};

// 导出类型
export type {
  AgentToolkitError as AgentToolkitErrorType,
};

/**
 * 错误代码常量
 */
export const ERROR_CODES = {
  // 基础错误
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',

  // LLM相关
  LLM_ERROR: 'LLM_ERROR',

  // 验证相关
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // 配置相关
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',

  // 网络相关
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',

  // 安全相关
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',

  // 会话相关
  SESSION_ERROR: 'SESSION_ERROR',

  // 模块相关
  TOOL_ERROR: 'TOOL_ERROR',
  SKILL_ERROR: 'SKILL_ERROR',
  TEAM_ERROR: 'TEAM_ERROR',
  MEMORY_ERROR: 'MEMORY_ERROR',
  KNOWLEDGE_GRAPH_ERROR: 'KNOWLEDGE_GRAPH_ERROR',
  PATTERN_ERROR: 'PATTERN_ERROR',
  ARCHITECTURE_ERROR: 'ARCHITECTURE_ERROR',
  INTEGRATION_ERROR: 'INTEGRATION_ERROR',
  RETRY_ERROR: 'RETRY_ERROR',
} as const;

/**
 * 错误工厂函数
 *
 * 提供便捷的错误创建函数
 */
export const Errors = {
  /**
   * 创建AgentToolkitError
   */
  toolkit: (message: string, code: string = ERROR_CODES.UNKNOWN_ERROR, options?: any) =>
    new AgentToolkitError(message, code, options),

  /**
   * 创建LLMError
   */
  llm: (message: string, options?: any) =>
    new LLMError(message, options),

  /**
   * 创建ValidationError
   */
  validation: (message: string, options?: any) =>
    new ValidationError(message, options),

  /**
   * 创建ConfigurationError
   */
  config: (message: string, options?: any) =>
    new ConfigurationError(message, options),

  /**
   * 创建NetworkError
   */
  network: (message: string, options?: any) =>
    new NetworkError(message, options),

  /**
   * 创建TimeoutError
   */
  timeout: (message: string, options?: any) =>
    new TimeoutError(message, options),

  /**
   * 创建AuthenticationError
   */
  auth: (message: string, options?: any) =>
    new AuthenticationError(message, options),

  /**
   * 创建RateLimitError
   */
  rateLimit: (message: string, options?: any) =>
    new RateLimitError(message, options),

  /**
   * 创建SessionError
   */
  session: (message: string, options?: any) =>
    new SessionError(message, options),
} as const;