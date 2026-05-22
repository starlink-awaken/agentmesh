/**
 * SecurityMiddleware - 安全中间件
 *
 * 提供安全防护功能，包括XSS防护、SQL注入防护、请求大小限制等
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  MiddlewareContext,
  MiddlewareFunc,
  MiddlewareNext,
  MiddlewareError,
} from './types.js';

/**
 * 安全错误类
 */
export class SecurityError extends Error implements MiddlewareError {
  code = 'SECURITY_ERROR';
  statusCode = 400;
  source = 'SecurityMiddleware';
  details: {
    type: string;
    payload?: string;
    field?: string;
    [key: string]: any;
  };

  constructor(message: string, details: {
    type: string;
    payload?: string;
    field?: string;
    [key: string]: any;
  }) {
    super(message);
    this.name = 'SecurityError';
    this.details = details;
  }
}

/**
 * 安全选项
 */
export interface SecurityOptions {
  /** 是否启用XSS防护 */
  xssProtection?: boolean;
  /** 是否启用SQL注入防护 */
  sqlInjectionProtection?: boolean;
  /** 最大请求大小（字节） */
  maxRequestSize?: number;
  /** 是否过滤危险字符 */
  filterDangerousChars?: boolean;
  /** 自定义危险字符正则表达式 */
  dangerousCharPatterns?: RegExp[];
  /** 自定义XSS检测模式 */
  xssPatterns?: RegExp[];
  /** 自定义SQL注入检测模式 */
  sqlInjectionPatterns?: RegExp[];
  /** 安全失败时是否抛出错误 */
  throwOnError?: boolean;
  /** 是否记录安全事件 */
  logSecurityEvents?: boolean;
}

/**
 * XSS检测模式
 */
const DEFAULT_XSS_PATTERNS = [
  // 脚本标签
  /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
  // 事件处理器
  /\bon\w+\s*=\s*["'][^"']*["']/gi,
  // JavaScript协议
  /javascript:\s*[^"'\s]*/gi,
  // 数据协议
  /data:\s*[^"'\s]*/gi,
  // 表达式
  /expression\s*\([^)]*\)/gi,
  // 样式中的URL
  /url\s*\(\s*["']?[^"')]*["']?\s*\)/gi,
];

/**
 * SQL注入检测模式
 */
const DEFAULT_SQL_INJECTION_PATTERNS = [
  // SQL注释
  /--\s*[^\n]*/gi,
  // 分号（多个语句）
  /;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)/gi,
  // UNION查询
  /\bUNION\s+SELECT\b/gi,
  // 恒真条件
  /'\s*OR\s*['"]?\s*['"]?\s*=\s*['"]?\s*['"]?/gi,
  // 恒真条件（数字）
  /\bOR\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/gi,
  // DROP语句
  /\bDROP\s+(TABLE|DATABASE)\b/gi,
  // DELETE语句
  /\bDELETE\s+FROM\b/gi,
  // 信息模式查询
  /\b(SELECT|INSERT|UPDATE)\s+.*\bFROM\s+information_schema\b/gi,
];

/**
 * 危险字符模式
 */
const DEFAULT_DANGEROUS_CHAR_PATTERNS = [
  // 命令分隔符
  /;/g,
  // 管道符
  /\|/g,
  // 重定向
  /[<>]/g,
  // 反引号
  /`/g,
  // 美元符号（变量扩展）
  /\$/g,
  // 路径遍历
  /\.\.\//g,
  // 空字符
  /\0/g,
];

/**
 * 安全中间件类
 */
export class SecurityMiddleware {
  private options: SecurityOptions;

  constructor(options: SecurityOptions = {}) {
    this.options = {
      xssProtection: true,
      sqlInjectionProtection: true,
      maxRequestSize: 10 * 1024 * 1024, // 10MB
      filterDangerousChars: true,
      throwOnError: true,
      logSecurityEvents: true,
      ...options,
    };
  }

  /**
   * 创建中间件函数
   */
  create(): MiddlewareFunc {
    return async (context: MiddlewareContext, next: MiddlewareNext): Promise<MiddlewareContext> => {
      try {
        await this.applySecurityChecks(context);
        return next(context);
      } catch (error) {
        if (error instanceof SecurityError && !this.options.throwOnError) {
          // 不抛出错误，将错误信息存储到上下文
          context.error = error;
          context.metadata = {
            ...context.metadata,
            security: {
              passed: false,
              violation: error.details.type,
              payload: error.details.payload,
            },
          };
          return context;
        }
        throw error;
      }
    };
  }

  /**
   * 应用安全检查
   */
  private async applySecurityChecks(context: MiddlewareContext): Promise<void> {
    const securityResults: Array<{
      type: string;
      passed: boolean;
      details?: any;
    }> = [];

    // 检查请求大小
    if (this.options.maxRequestSize) {
      const sizeCheck = this.checkRequestSize(context);
      securityResults.push(sizeCheck);
      if (!sizeCheck.passed) {
        this.handleSecurityViolation('REQUEST_SIZE', sizeCheck.details, context);
      }
    }

    // 检查XSS
    if (this.options.xssProtection) {
      const xssCheck = this.checkForXSS(context);
      securityResults.push(xssCheck);
      if (!xssCheck.passed) {
        this.handleSecurityViolation('XSS', xssCheck.details, context);
      }
    }

    // 检查SQL注入
    if (this.options.sqlInjectionProtection) {
      const sqlCheck = this.checkForSQLInjection(context);
      securityResults.push(sqlCheck);
      if (!sqlCheck.passed) {
        this.handleSecurityViolation('SQL_INJECTION', sqlCheck.details, context);
      }
    }

    // 过滤危险字符
    if (this.options.filterDangerousChars) {
      const filterResult = this.filterDangerousCharacters(context);
      securityResults.push(filterResult);
      if (filterResult.details?.filtered) {
        context.metadata = {
          ...context.metadata,
          security: {
            ...context.metadata?.security,
            filtered: true,
            filteredCount: filterResult.details.filteredCount,
          },
        };
      }
    }

    // 更新安全状态
    const allPassed = securityResults.every(result => result.passed);
    context.metadata = {
      ...context.metadata,
      security: {
        ...context.metadata?.security,
        passed: allPassed,
        checks: securityResults.map(r => ({ type: r.type, passed: r.passed })),
      },
    };
  }

  /**
   * 检查请求大小
   */
  private checkRequestSize(context: MiddlewareContext): {
    type: string;
    passed: boolean;
    details?: any;
  } {
    const maxSize = this.options.maxRequestSize!;
    let totalSize = 0;

    // 计算请求头大小
    if (context.request.headers) {
      totalSize += JSON.stringify(context.request.headers).length;
    }

    // 计算请求体大小
    if (context.request.body) {
      totalSize += JSON.stringify(context.request.body).length;
    }

    // 计算查询参数大小
    if (context.request.query) {
      totalSize += JSON.stringify(context.request.query).length;
    }

    const passed = totalSize <= maxSize;

    return {
      type: 'REQUEST_SIZE',
      passed,
      details: passed ? undefined : {
        size: totalSize,
        maxSize,
        exceededBy: totalSize - maxSize,
      },
    };
  }

  /**
   * 检查XSS攻击
   */
  private checkForXSS(context: MiddlewareContext): {
    type: string;
    passed: boolean;
    details?: any;
  } {
    const patterns = this.options.xssPatterns || DEFAULT_XSS_PATTERNS;
    const violations: Array<{
      field: string;
      value: string;
      pattern: RegExp;
      match: string;
    }> = [];

    // 检查请求体
    if (context.request.body) {
      this.scanForPatterns(context.request.body, patterns, 'body', violations);
    }

    // 检查查询参数
    if (context.request.query) {
      this.scanForPatterns(context.request.query, patterns, 'query', violations);
    }

    // 检查请求头
    if (context.request.headers) {
      this.scanForPatterns(context.request.headers, patterns, 'headers', violations);
    }

    const passed = violations.length === 0;

    return {
      type: 'XSS',
      passed,
      details: passed ? undefined : { violations },
    };
  }

  /**
   * 检查SQL注入攻击
   */
  private checkForSQLInjection(context: MiddlewareContext): {
    type: string;
    passed: boolean;
    details?: any;
  } {
    const patterns = this.options.sqlInjectionPatterns || DEFAULT_SQL_INJECTION_PATTERNS;
    const violations: Array<{
      field: string;
      value: string;
      pattern: RegExp;
      match: string;
    }> = [];

    // 检查请求体
    if (context.request.body) {
      this.scanForPatterns(context.request.body, patterns, 'body', violations);
    }

    // 检查查询参数
    if (context.request.query) {
      this.scanForPatterns(context.request.query, patterns, 'query', violations);
    }

    const passed = violations.length === 0;

    return {
      type: 'SQL_INJECTION',
      passed,
      details: passed ? undefined : { violations },
    };
  }

  /**
   * 过滤危险字符
   */
  private filterDangerousCharacters(context: MiddlewareContext): {
    type: string;
    passed: boolean;
    details?: any;
  } {
    const patterns = this.options.dangerousCharPatterns || DEFAULT_DANGEROUS_CHAR_PATTERNS;
    let filteredCount = 0;

    // 过滤请求体
    if (context.request.body) {
      filteredCount += this.filterObject(context.request.body, patterns);
    }

    // 过滤查询参数
    if (context.request.query) {
      filteredCount += this.filterObject(context.request.query, patterns);
    }

    // 过滤请求头（某些头可能需要保留特殊字符）
    if (context.request.headers) {
      // 跳过某些需要特殊字符的头部
      const headersToSkip = ['authorization', 'cookie', 'user-agent'];
      const headersToFilter = Object.keys(context.request.headers).filter(
        key => !headersToSkip.includes(key.toLowerCase())
      );

      for (const key of headersToFilter) {
        const original = context.request.headers[key];
        if (typeof original === 'string') {
          const filtered = this.filterString(original, patterns);
          if (filtered !== original) {
            context.request.headers[key] = filtered;
            filteredCount++;
          }
        }
      }
    }

    return {
      type: 'CHARACTER_FILTER',
      passed: true, // 过滤总是"通过"，因为它不会阻止请求
      details: filteredCount > 0 ? { filtered: true, filteredCount } : undefined,
    };
  }

  /**
   * 扫描对象中的模式
   */
  private scanForPatterns(
    obj: any,
    patterns: RegExp[],
    fieldPrefix: string,
    violations: Array<{
      field: string;
      value: string;
      pattern: RegExp;
      match: string;
    }>
  ): void {
    if (obj === null || obj === undefined) {
      return;
    }

    if (typeof obj === 'string') {
      for (const pattern of patterns) {
        const matches = obj.match(pattern);
        if (matches) {
          violations.push({
            field: fieldPrefix,
            value: obj,
            pattern,
            match: matches[0],
          });
          break; // 找到第一个匹配就停止
        }
      }
    } else if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        const field = fieldPrefix ? `${fieldPrefix}.${key}` : key;
        this.scanForPatterns(value, patterns, field, violations);
      }
    }
  }

  /**
   * 过滤对象中的危险字符
   */
  private filterObject(obj: any, patterns: RegExp[]): number {
    let filteredCount = 0;

    if (obj === null || obj === undefined) {
      return 0;
    }

    if (typeof obj === 'string') {
      const filtered = this.filterString(obj, patterns);
      if (filtered !== obj) {
        // 注意：这里不能直接修改原始对象，因为字符串是不可变的
        // 调用者需要处理返回值
        filteredCount++;
      }
      return filteredCount;
    }

    if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          const filtered = this.filterString(value, patterns);
          if (filtered !== value) {
            obj[key] = filtered;
            filteredCount++;
          }
        } else if (typeof value === 'object' && value !== null) {
          filteredCount += this.filterObject(value, patterns);
        }
      }
    }

    return filteredCount;
  }

  /**
   * 过滤字符串中的危险字符
   */
  private filterString(str: string, patterns: RegExp[]): string {
    let result = str;
    for (const pattern of patterns) {
      result = result.replace(pattern, '');
    }
    return result;
  }

  /**
   * 处理安全违规
   */
  private handleSecurityViolation(
    type: string,
    details: any,
    context: MiddlewareContext
  ): void {
    const error = new SecurityError(`Security violation: ${type}`, {
      type,
      payload: details?.violations?.[0]?.value || details?.match,
      field: details?.violations?.[0]?.field,
      ...details,
    });

    if (this.options.throwOnError) {
      throw error;
    }

    // 记录安全事件
    if (this.options.logSecurityEvents) {
      console.warn(`Security event: ${type}`, {
        requestId: context.id,
        path: context.request.path,
        details,
      });
    }
  }

  /**
   * 创建安全中间件的工厂函数
   */
  static create(options: SecurityOptions = {}): MiddlewareFunc {
    const middleware = new SecurityMiddleware(options);
    return middleware.create();
  }
}

/**
 * 创建安全中间件
 */
export function createSecurityMiddleware(options: SecurityOptions = {}): MiddlewareFunc {
  return SecurityMiddleware.create(options);
}

/**
 * 创建XSS防护中间件
 */
export function createXSSProtectionMiddleware(
  customPatterns?: RegExp[]
): MiddlewareFunc {
  return createSecurityMiddleware({
    xssProtection: true,
    sqlInjectionProtection: false,
    filterDangerousChars: false,
    xssPatterns: customPatterns,
  });
}

/**
 * 创建SQL注入防护中间件
 */
export function createSQLInjectionProtectionMiddleware(
  customPatterns?: RegExp[]
): MiddlewareFunc {
  return createSecurityMiddleware({
    xssProtection: false,
    sqlInjectionProtection: true,
    filterDangerousChars: false,
    sqlInjectionPatterns: customPatterns,
  });
}

/**
 * 创建请求大小限制中间件
 */
export function createRequestSizeLimiter(maxSize: number): MiddlewareFunc {
  return createSecurityMiddleware({
    xssProtection: false,
    sqlInjectionProtection: false,
    filterDangerousChars: false,
    maxRequestSize: maxSize,
  });
}

/**
 * 创建危险字符过滤中间件
 */
export function createDangerousCharacterFilter(
  customPatterns?: RegExp[]
): MiddlewareFunc {
  return createSecurityMiddleware({
    xssProtection: false,
    sqlInjectionProtection: false,
    filterDangerousChars: true,
    dangerousCharPatterns: customPatterns,
    throwOnError: false, // 过滤不抛出错误
  });
}

/**
 * 创建综合安全中间件
 */
export function createComprehensiveSecurityMiddleware(
  options: {
    maxSize?: number;
    customXSSPatterns?: RegExp[];
    customSQLPatterns?: RegExp[];
    customCharPatterns?: RegExp[];
  } = {}
): MiddlewareFunc {
  return createSecurityMiddleware({
    xssProtection: true,
    sqlInjectionProtection: true,
    filterDangerousChars: true,
    maxRequestSize: options.maxSize || 10 * 1024 * 1024,
    xssPatterns: options.customXSSPatterns,
    sqlInjectionPatterns: options.customSQLPatterns,
    dangerousCharPatterns: options.customCharPatterns,
  });
}