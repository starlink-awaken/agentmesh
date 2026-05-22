/**
 * Honeycomb v2 - Error Handler
 *
 * 系统级错误分类和恢复策略模块。
 * 提供统一的错误处理、重试逻辑和降级策略。
 */

// ============================================================
// Error Severity Levels
// ============================================================

/**
 * 错误严重程度分类
 */
export enum ErrorSeverity {
  /** 可恢复错误 - 可以通过重试或降级解决 */
  RECOVERABLE = 'recoverable',
  /** 不可恢复错误 - 需要人工干预或系统重启 */
  NON_RECOVERABLE = 'non-recoverable',
  /** 致命错误 - 系统无法继续运行 */
  FATAL = 'fatal',
}

// ============================================================
// Error Categories
// ============================================================

/**
 * 错误分类
 */
export enum ErrorCategory {
  /** 网络相关错误 */
  NETWORK = 'network',
  /** 文件系统错误 */
  FILESYSTEM = 'filesystem',
  /** 数据库错误 */
  DATABASE = 'database',
  /** 配置错误 */
  CONFIGURATION = 'configuration',
  /** 验证错误 */
  VALIDATION = 'validation',
  /** Agent 执行错误 */
  AGENT_EXECUTION = 'agent-execution',
  /** 资源耗尽 */
  RESOURCE_EXHAUSTED = 'resource-exhausted',
  /** 权限错误 */
  PERMISSION = 'permission',
  /** 超时错误 */
  TIMEOUT = 'timeout',
  /** 未知错误 */
  UNKNOWN = 'unknown',
}

// ============================================================
// Recovery Strategy
// ============================================================

/**
 * 恢复策略配置
 */
export interface RecoveryStrategy {
  /** 错误分类 */
  category: ErrorCategory;
  /** 严重程度 */
  severity: ErrorSeverity;
  /** 最大重试次数（0表示不重试） */
  maxRetries: number;
  /** 重试间隔基数（毫秒） */
  baseDelayMs: number;
  /** 最大延迟（毫秒） */
  maxDelayMs: number;
  /** 是否使用指数退避 */
  useExponentialBackoff: boolean;
  /** 抖动因子（0-1），用于避免雷群效应 */
  jitterFactor: number;
  /** 降级操作（当重试失败时） */
  fallbackAction?: () => void | Promise<void>;
  /** 是否应记录为警告 */
  logAsWarning: boolean;
}

// ============================================================
// Honeycomb Error
// ============================================================

/**
 * 标准 Honeycomb 错误类型
 */
export class HoneycombError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly retryable: boolean;
  public readonly context?: Record<string, unknown>;
  public readonly originalError?: Error;
  public readonly timestamp: number;

  constructor(
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    retryable: boolean = false,
    context?: Record<string, unknown>,
    originalError?: Error,
  ) {
    super(message);
    this.name = 'HoneycombError';
    this.category = category;
    this.severity = severity;
    this.retryable = retryable;
    this.context = context;
    this.originalError = originalError;
    this.timestamp = Date.now();

    // 保持原型链
    Object.setPrototypeOf(this, HoneycombError.prototype);
  }

  /**
   * 创建可恢复的网络错误
   */
  static network(message: string, context?: Record<string, unknown>, originalError?: Error): HoneycombError {
    return new HoneycombError(
      message,
      ErrorCategory.NETWORK,
      ErrorSeverity.RECOVERABLE,
      true,
      context,
      originalError,
    );
  }

  /**
   * 创建配置错误（不可恢复）
   */
  static configuration(message: string, context?: Record<string, unknown>): HoneycombError {
    return new HoneycombError(
      message,
      ErrorCategory.CONFIGURATION,
      ErrorSeverity.NON_RECOVERABLE,
      false,
      context,
    );
  }

  /**
   * 创建验证错误
   */
  static validation(message: string, context?: Record<string, unknown>): HoneycombError {
    return new HoneycombError(
      message,
      ErrorCategory.VALIDATION,
      ErrorSeverity.NON_RECOVERABLE,
      false,
      context,
    );
  }

  /**
   * 创建数据库错误
   */
  static database(message: string, retryable: boolean = false, context?: Record<string, unknown>, originalError?: Error): HoneycombError {
    const severity = retryable ? ErrorSeverity.RECOVERABLE : ErrorSeverity.NON_RECOVERABLE;
    return new HoneycombError(
      message,
      ErrorCategory.DATABASE,
      severity,
      retryable,
      context,
      originalError,
    );
  }

  /**
   * 创建致命错误
   */
  static fatal(message: string, context?: Record<string, unknown>, originalError?: Error): HoneycombError {
    return new HoneycombError(
      message,
      ErrorCategory.UNKNOWN,
      ErrorSeverity.FATAL,
      false,
      context,
      originalError,
    );
  }

  /**
   * 创建资源耗尽错误
   */
  static resourceExhausted(message: string, context?: Record<string, unknown>): HoneycombError {
    return new HoneycombError(
      message,
      ErrorCategory.RESOURCE_EXHAUSTED,
      ErrorSeverity.NON_RECOVERABLE,
      false,
      context,
    );
  }

  /**
   * 转换任意错误为 HoneycombError
   */
  static fromError(error: unknown, context?: Record<string, unknown>): HoneycombError {
    if (error instanceof HoneycombError) {
      return error;
    }

    if (error instanceof Error) {
      // 根据错误类型进行分类
      const message = error.message;

      if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT') || message.includes('ENOTFOUND')) {
        return HoneycombError.network(message, context, error);
      }

      if (message.includes('ENOENT') || message.includes('EACCES')) {
        return new HoneycombError(
          message,
          ErrorCategory.FILESYSTEM,
          ErrorSeverity.NON_RECOVERABLE,
          false,
          context,
          error,
        );
      }

      if (message.includes('SQLITE') || message.includes('database')) {
        return HoneycombError.database(message, false, context, error);
      }

      // 默认为未知错误
      return new HoneycombError(
        message,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.NON_RECOVERABLE,
        false,
        context,
        error,
      );
    }

    return new HoneycombError(
      String(error),
      ErrorCategory.UNKNOWN,
      ErrorSeverity.NON_RECOVERABLE,
      false,
      context,
    );
  }
}

// ============================================================
// Default Recovery Strategies
// ============================================================

/**
 * 默认恢复策略配置
 */
const DEFAULT_RECOVERY_STRATEGIES: Partial<Record<ErrorCategory, RecoveryStrategy>> = {
  [ErrorCategory.NETWORK]: {
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.RECOVERABLE,
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    useExponentialBackoff: true,
    jitterFactor: 0.1,
    logAsWarning: true,
  },
  [ErrorCategory.TIMEOUT]: {
    category: ErrorCategory.TIMEOUT,
    severity: ErrorSeverity.RECOVERABLE,
    maxRetries: 2,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    useExponentialBackoff: true,
    jitterFactor: 0.2,
    logAsWarning: true,
  },
  [ErrorCategory.DATABASE]: {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.NON_RECOVERABLE,
    maxRetries: 2,
    baseDelayMs: 500,
    maxDelayMs: 2000,
    useExponentialBackoff: true,
    jitterFactor: 0.1,
    logAsWarning: false,
  },
  [ErrorCategory.AGENT_EXECUTION]: {
    category: ErrorCategory.AGENT_EXECUTION,
    severity: ErrorSeverity.RECOVERABLE,
    maxRetries: 1,
    baseDelayMs: 1000,
    maxDelayMs: 3000,
    useExponentialBackoff: false,
    jitterFactor: 0.1,
    logAsWarning: true,
  },
  [ErrorCategory.CONFIGURATION]: {
    category: ErrorCategory.CONFIGURATION,
    severity: ErrorSeverity.NON_RECOVERABLE,
    maxRetries: 0,
    baseDelayMs: 0,
    maxDelayMs: 0,
    useExponentialBackoff: false,
    jitterFactor: 0,
    logAsWarning: false,
  },
  [ErrorCategory.VALIDATION]: {
    category: ErrorCategory.VALIDATION,
    severity: ErrorSeverity.NON_RECOVERABLE,
    maxRetries: 0,
    baseDelayMs: 0,
    maxDelayMs: 0,
    useExponentialBackoff: false,
    jitterFactor: 0,
    logAsWarning: false,
  },
  [ErrorCategory.RESOURCE_EXHAUSTED]: {
    category: ErrorCategory.RESOURCE_EXHAUSTED,
    severity: ErrorSeverity.NON_RECOVERABLE,
    maxRetries: 0,
    baseDelayMs: 0,
    maxDelayMs: 0,
    useExponentialBackoff: false,
    jitterFactor: 0,
    logAsWarning: false,
  },
};

// ============================================================
// ErrorHandler Class
// ============================================================

/**
 * 错误处理器 - 管理错误分类、重试和恢复
 */
export class ErrorHandler {
  private customStrategies: Map<ErrorCategory, RecoveryStrategy>;

  constructor() {
    this.customStrategies = new Map();
  }

  /**
   * 设置自定义恢复策略
   */
  setRecoveryStrategy(category: ErrorCategory, strategy: Partial<RecoveryStrategy>): void {
    const defaultStrategy = DEFAULT_RECOVERY_STRATEGIES[category] || {
      category,
      severity: ErrorSeverity.NON_RECOVERABLE,
      maxRetries: 0,
      baseDelayMs: 0,
      maxDelayMs: 0,
      useExponentialBackoff: false,
      jitterFactor: 0,
      logAsWarning: false,
    };
    this.customStrategies.set(category, { ...defaultStrategy, ...strategy });
  }

  /**
   * 获取错误分类的恢复策略
   */
  private getStrategy(category: ErrorCategory): RecoveryStrategy {
    return (
      this.customStrategies.get(category) ||
      DEFAULT_RECOVERY_STRATEGIES[category] || {
        category,
        severity: ErrorSeverity.NON_RECOVERABLE,
        maxRetries: 0,
        baseDelayMs: 0,
        maxDelayMs: 0,
        useExponentialBackoff: false,
        jitterFactor: 0,
        logAsWarning: false,
      }
    );
  }

  /**
   * 计算重试延迟
   */
  private calculateDelay(attempt: number, strategy: RecoveryStrategy): number {
    if (!strategy.useExponentialBackoff) {
      return strategy.baseDelayMs;
    }

    // 指数退避：baseDelay * 2^attempt
    const exponentialDelay = strategy.baseDelayMs * Math.pow(2, attempt);

    // 应用抖动避免雷群效应
    const jitter = exponentialDelay * strategy.jitterFactor * (Math.random() * 2 - 1);

    // 限制在最大延迟范围内
    return Math.min(Math.max(exponentialDelay + jitter, 0), strategy.maxDelayMs);
  }

  /**
   * 带重试的异步函数执行
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    category: ErrorCategory,
    context?: Record<string, unknown>,
  ): Promise<T> {
    const strategy = this.getStrategy(category);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= strategy.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 如果这是最后一次尝试，不再重试
        if (attempt >= strategy.maxRetries) {
          break;
        }

        // 检查错误是否可重试
        const honeycombError = HoneycombError.fromError(error, context);
        if (!honeycombError.retryable && strategy.maxRetries > 0) {
          // 不可重试的错误，直接抛出
          throw honeycombError;
        }

        // 等待后重试
        const delay = this.calculateDelay(attempt, strategy);
        await this.sleep(delay);
      }
    }

    // 所有重试都失败，尝试降级操作
    if (strategy.fallbackAction) {
      try {
        await strategy.fallbackAction();
      } catch {
        // 降级操作失败，忽略并继续抛出原始错误
      }
    }

    throw lastError;
  }

  /**
   * 处理错误并返回适当的响应
   */
  handleError(error: unknown, context?: Record<string, unknown>): HoneycombError {
    const honeycombError = HoneycombError.fromError(error, context);
    const strategy = this.getStrategy(honeycombError.category);

    // 根据严重程度决定日志级别
    if (honeycombError.severity === ErrorSeverity.FATAL) {
      // 致命错误应该触发系统关闭
      console.error('[FATAL]', honeycombError.message, honeycombError.context);
    } else if (strategy.logAsWarning) {
      console.warn('[RECOVERABLE]', honeycombError.message, honeycombError.context);
    } else {
      console.error('[ERROR]', honeycombError.message, honeycombError.context);
    }

    return honeycombError;
  }

  /**
   * 判断错误是否可恢复
   */
  isRecoverable(error: unknown): boolean {
    const honeycombError = HoneycombError.fromError(error);
    return honeycombError.severity === ErrorSeverity.RECOVERABLE || honeycombError.retryable;
  }

  /**
   * 判断错误是否致命
   */
  isFatal(error: unknown): boolean {
    const honeycombError = HoneycombError.fromError(error);
    return honeycombError.severity === ErrorSeverity.FATAL;
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * 创建新的错误处理器实例
 */
export function createErrorHandler(): ErrorHandler {
  return new ErrorHandler();
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * 执行带错误处理的异步函数
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  errorHandler: ErrorHandler,
  category: ErrorCategory,
  context?: Record<string, unknown>,
): Promise<T> {
  try {
    return await errorHandler.executeWithRetry(fn, category, context);
  } catch (error) {
    throw errorHandler.handleError(error, context);
  }
}

/**
 * 包装函数以自动处理错误
 */
export function withErrorHandler<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  errorHandler: ErrorHandler,
  category: ErrorCategory,
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return withErrorHandling(
      () => fn(...args) as Promise<ReturnType<T>>,
      errorHandler,
      category,
    ) as Promise<ReturnType<T>>;
  }) as T;
}
