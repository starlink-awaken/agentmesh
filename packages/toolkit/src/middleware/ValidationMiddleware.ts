/**
 * ValidationMiddleware - 验证中间件
 *
 * 提供请求验证功能，支持Schema验证和自定义验证规则
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
import type {
  ValidationSchema,
  ValidationResult,
  ValidationErrorDetail,
} from './schemas.js';

/**
 * 验证错误类
 */
export class ValidationError extends Error implements MiddlewareError {
  code = 'VALIDATION_ERROR';
  statusCode = 400;
  source = 'ValidationMiddleware';
  details: {
    errors: ValidationErrorDetail[];
    validatedData?: any;
    field?: string;
  };

  constructor(message: string, details: {
    errors: ValidationErrorDetail[];
    validatedData?: any;
    field?: string;
  }) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

/**
 * 验证选项
 */
export interface ValidationOptions {
  /** 验证模式 */
  schema: ValidationSchema;
  /** 是否验证请求体 */
  validateBody?: boolean;
  /** 是否验证查询参数 */
  validateQuery?: boolean;
  /** 是否验证请求头 */
  validateHeaders?: boolean;
  /** 是否验证路径参数 */
  validateParams?: boolean;
  /** 验证失败时是否抛出错误 */
  throwOnError?: boolean;
  /** 是否将验证后的数据存储到上下文 */
  storeValidatedData?: boolean;
  /** 自定义错误消息 */
  errorMessage?: string;
}

/**
 * 请求验证选项
 */
export interface RequestValidationOptions {
  /** 请求体验证模式 */
  body?: ValidationSchema;
  /** 查询参数验证模式 */
  query?: ValidationSchema;
  /** 请求头验证模式 */
  headers?: ValidationSchema;
  /** 路径参数验证模式 */
  params?: ValidationSchema;
  /** 验证失败时是否抛出错误 */
  throwOnError?: boolean;
  /** 是否将验证后的数据存储到上下文 */
  storeValidatedData?: boolean;
}

/**
 * 验证中间件类
 */
export class ValidationMiddleware {
  private options: ValidationOptions;

  constructor(options: ValidationOptions) {
    this.options = {
      throwOnError: true,
      storeValidatedData: true,
      ...options,
    };
  }

  /**
   * 创建中间件函数
   */
  create(): MiddlewareFunc {
    return async (context: MiddlewareContext, next: MiddlewareNext): Promise<MiddlewareContext> => {
      try {
        await this.validateRequest(context);
        return next(context);
      } catch (error) {
        if (error instanceof ValidationError && !this.options.throwOnError) {
          // 不抛出错误，将错误信息存储到上下文
          context.error = error;
          context.metadata = {
            ...context.metadata,
            validation: {
              valid: false,
              errors: error.details.errors,
            },
          };
          return context;
        }
        throw error;
      }
    };
  }

  /**
   * 验证请求
   */
  private async validateRequest(context: MiddlewareContext): Promise<void> {
    const validationResults: Array<{
      type: string;
      result: ValidationResult;
    }> = [];

    const schema = this.options.schema;

    // 验证请求体
    if (this.options.validateBody && context.request.body !== undefined) {
      const result = schema.validate(context.request.body, 'body');
      validationResults.push({ type: 'body', result });

      if (result.valid && this.options.storeValidatedData) {
        context.request.body = result.data;
      }
    }

    // 验证查询参数
    if (this.options.validateQuery && context.request.query) {
      const result = schema.validate(context.request.query, 'query');
      validationResults.push({ type: 'query', result });

      if (result.valid && this.options.storeValidatedData) {
        context.request.query = result.data;
      }
    }

    // 验证请求头
    if (this.options.validateHeaders && context.request.headers) {
      const result = schema.validate(context.request.headers, 'headers');
      validationResults.push({ type: 'headers', result });

      if (result.valid && this.options.storeValidatedData) {
        context.request.headers = result.data;
      }
    }

    // 验证路径参数
    if (this.options.validateParams && context.params) {
      const result = schema.validate(context.params, 'params');
      validationResults.push({ type: 'params', result });

      if (result.valid && this.options.storeValidatedData) {
        context.params = result.data;
      }
    }

    // 收集所有错误
    const allErrors: ValidationErrorDetail[] = [];
    let allValid = true;

    for (const { type, result } of validationResults) {
      if (!result.valid) {
        allValid = false;
        // 为错误添加类型前缀
        const typedErrors = result.errors.map(error => ({
          ...error,
          field: error.field ? `${type}.${error.field}` : type,
        }));
        allErrors.push(...typedErrors);
      }
    }

    // 更新上下文元数据
    context.metadata = {
      ...context.metadata,
      validation: {
        valid: allValid,
        errors: allErrors,
        validated: validationResults.filter(r => r.result.valid).map(r => r.type),
      },
    };

    // 处理验证失败
    if (!allValid) {
      const errorMessage = this.options.errorMessage || 'Validation failed';
      const error = new ValidationError(errorMessage, {
        errors: allErrors,
      });

      if (this.options.throwOnError) {
        throw error;
      }
    }
  }

  /**
   * 创建验证中间件的工厂函数
   */
  static create(options: ValidationOptions): MiddlewareFunc {
    const middleware = new ValidationMiddleware(options);
    return middleware.create();
  }
}

/**
 * 创建验证中间件
 */
export function createValidationMiddleware(options: ValidationOptions): MiddlewareFunc {
  return ValidationMiddleware.create(options);
}

/**
 * 创建请求验证中间件
 */
export function validateRequest(options: RequestValidationOptions): MiddlewareFunc {
  return async (context: MiddlewareContext, next: MiddlewareNext): Promise<MiddlewareContext> => {
    const validationResults: Array<{
      type: string;
      result: ValidationResult;
    }> = [];

    const storeValidatedData = options.storeValidatedData ?? true;
    const throwOnError = options.throwOnError ?? true;

    // 验证请求体
    if (options.body && context.request.body !== undefined) {
      const result = options.body.validate(context.request.body, 'body');
      validationResults.push({ type: 'body', result });

      if (result.valid && storeValidatedData) {
        context.request.body = result.data;
      }
    }

    // 验证查询参数
    if (options.query && context.request.query) {
      const result = options.query.validate(context.request.query, 'query');
      validationResults.push({ type: 'query', result });

      if (result.valid && storeValidatedData) {
        context.request.query = result.data;
      }
    }

    // 验证请求头
    if (options.headers && context.request.headers) {
      const result = options.headers.validate(context.request.headers, 'headers');
      validationResults.push({ type: 'headers', result });

      if (result.valid && storeValidatedData) {
        context.request.headers = result.data;
      }
    }

    // 验证路径参数
    if (options.params && context.params) {
      const result = options.params.validate(context.params, 'params');
      validationResults.push({ type: 'params', result });

      if (result.valid && storeValidatedData) {
        context.params = result.data;
      }
    }

    // 收集所有错误
    const allErrors: ValidationErrorDetail[] = [];
    let allValid = true;

    for (const { type, result } of validationResults) {
      if (!result.valid) {
        allValid = false;
        // 为错误添加类型前缀
        const typedErrors = result.errors.map(error => ({
          ...error,
          field: error.field ? `${type}.${error.field}` : type,
        }));
        allErrors.push(...typedErrors);
      }
    }

    // 更新上下文元数据
    context.metadata = {
      ...context.metadata,
      validation: {
        valid: allValid,
        errors: allErrors,
        validated: validationResults.filter(r => r.result.valid).map(r => r.type),
      },
    };

    // 处理验证失败
    if (!allValid) {
      const error = new ValidationError('Request validation failed', {
        errors: allErrors,
      });

      if (throwOnError) {
        throw error;
      } else {
        context.error = error;
        return context;
      }
    }

    return next(context);
  };
}

/**
 * 创建模式验证器
 */
export function createSchemaValidator(schema: ValidationSchema) {
  return (data: any, field?: string): ValidationResult => {
    return schema.validate(data, field);
  };
}

/**
 * 创建字段验证器
 */
export function createFieldValidator(
  field: string,
  schema: ValidationSchema,
  options: { required?: boolean } = {}
): MiddlewareFunc {
  return async (context: MiddlewareContext, next: MiddlewareNext): Promise<MiddlewareContext> => {
    const value = getNestedValue(context.request.body, field);
    const result = schema.validate(value, field);

    if (!result.valid) {
      const error = new ValidationError(`Field validation failed: ${field}`, {
        errors: result.errors,
        field,
      });
      throw error;
    }

    // 更新验证后的值
    if (result.data !== undefined) {
      setNestedValue(context.request.body, field, result.data);
    }

    context.metadata = {
      ...context.metadata,
      validation: {
        valid: true,
        field,
        value: result.data,
      },
    };

    return next(context);
  };
}

/**
 * 获取嵌套对象的值
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * 设置嵌套对象的值
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  const target = keys.reduce((current, key) => {
    if (current[key] === undefined || current[key] === null) {
      current[key] = {};
    }
    return current[key];
  }, obj);
  target[lastKey] = value;
}