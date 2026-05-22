/**
 * Agent Toolkit 错误类型模块
 *
 * 统一的错误类型层次结构，用于整个Agent Toolkit的错误处理
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * 基础错误类
 *
 * 所有Agent Toolkit错误的基类，提供标准化的错误属性
 */
export class AgentToolkitError extends Error {
  code: string;
  statusCode?: number;
  details?: unknown;
  timestamp: Date;

  constructor(
    message: string,
    code: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'AgentToolkitError';
    this.code = code;
    this.statusCode = options?.statusCode;
    this.details = options?.details;
    this.timestamp = new Date();

    // 保持调用栈
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AgentToolkitError);
    }

    // 设置cause属性（如果支持）
    if (options?.cause && 'cause' in Error.prototype) {
      (this as any).cause = options.cause;
    }
  }

  /**
   * 转换为JSON格式
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  /**
   * 转换为字符串
   */
  toString() {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}

/**
 * LLM错误
 *
 * 与LLM交互相关的错误，如API调用失败、响应解析失败等
 */
export class LLMError extends AgentToolkitError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message, 'LLM_ERROR', options);
    this.name = 'LLMError';
  }
}

/**
 * 验证错误
 *
 * 数据验证失败相关的错误
 */
export class ValidationError extends AgentToolkitError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message, 'VALIDATION_ERROR', options);
    this.name = 'ValidationError';
  }
}

/**
 * 配置错误
 *
 * 配置加载、解析或验证失败相关的错误
 */
export class ConfigurationError extends AgentToolkitError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message, 'CONFIGURATION_ERROR', options);
    this.name = 'ConfigurationError';
  }
}

/**
 * 网络错误
 *
 * 网络请求失败相关的错误，如连接超时、DNS解析失败等
 */
export class NetworkError extends AgentToolkitError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message, 'NETWORK_ERROR', options);
    this.name = 'NetworkError';
  }
}

/**
 * 超时错误
 *
 * 操作超时相关的错误
 */
export class TimeoutError extends AgentToolkitError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message, 'TIMEOUT_ERROR', options);
    this.name = 'TimeoutError';
  }
}

/**
 * 认证错误
 *
 * 认证失败相关的错误，如无效的API密钥、权限不足等
 */
export class AuthenticationError extends AgentToolkitError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message, 'AUTHENTICATION_ERROR', options);
    this.name = 'AuthenticationError';
  }
}

/**
 * 速率限制错误
 *
 * API调用频率超过限制相关的错误
 */
export class RateLimitError extends AgentToolkitError {
  retryAfter?: number;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
      retryAfter?: number;
    }
  ) {
    super(message, 'RATE_LIMIT_ERROR', options);
    this.name = 'RateLimitError';
    this.retryAfter = options?.retryAfter;
  }

  toJSON() {
    const base = super.toJSON();
    return {
      ...base,
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * 会话错误
 *
 * 会话管理相关的错误，如会话过期、无效会话等
 */
export class SessionError extends AgentToolkitError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message, 'SESSION_ERROR', options);
    this.name = 'SessionError';
  }
}

/**
 * 工具错误
 *
 * 工具执行相关的错误
 */
export class ToolError extends AgentToolkitError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message, 'TOOL_ERROR', options);
    this.name = 'ToolError';
  }
}

/**
 * 技能错误
 *
 * 技能加载或执行相关的错误
 */
export class SkillError extends AgentToolkitError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message, 'SKILL_ERROR', options);
    this.name = 'SkillError';
  }
}

/**
 * 团队错误
 *
 * 团队管理相关的错误
 */
export class TeamError extends AgentToolkitError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message, 'TEAM_ERROR', options);
    this.name = 'TeamError';
  }
}

/**
 * 内存错误
 *
 * 内存管理相关的错误
 */
export class MemoryError extends AgentToolkitError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message, 'MEMORY_ERROR', options);
    this.name = 'MemoryError';
  }
}

/**
 * 知识图谱错误
 *
 * 知识图谱操作相关的错误
 */
export class KnowledgeGraphError extends AgentToolkitError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message, 'KNOWLEDGE_GRAPH_ERROR', options);
    this.name = 'KnowledgeGraphError';
  }
}

/**
 * 模式错误
 *
 * 模式加载或应用相关的错误
 */
export class PatternError extends AgentToolkitError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message, 'PATTERN_ERROR', options);
    this.name = 'PatternError';
  }
}

/**
 * 架构错误
 *
 * 架构工具相关的错误
 */
export class ArchitectureError extends AgentToolkitError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message, 'ARCHITECTURE_ERROR', options);
    this.name = 'ArchitectureError';
  }
}

/**
 * 集成错误
 *
 * 外部集成相关的错误
 */
export class IntegrationError extends AgentToolkitError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message, 'INTEGRATION_ERROR', options);
    this.name = 'IntegrationError';
  }
}

/**
 * 重试错误
 *
 * 重试机制相关的错误
 */
export class RetryError extends AgentToolkitError {
  attempts: number;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      details?: unknown;
      cause?: Error;
      attempts?: number;
    }
  ) {
    super(message, 'RETRY_ERROR', options);
    this.name = 'RetryError';
    this.attempts = options?.attempts || 1;
  }

  toJSON() {
    const base = super.toJSON();
    return {
      ...base,
      attempts: this.attempts,
    };
  }
}