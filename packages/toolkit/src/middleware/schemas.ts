/**
 * Validation Schemas - 验证模式定义
 *
 * 提供常用验证模式的类型定义和工厂函数
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * 验证错误详情
 */
export interface ValidationErrorDetail {
  /** 字段路径 */
  field: string;
  /** 错误消息 */
  message: string;
  /** 错误码 */
  code?: string;
  /** 期望值 */
  expected?: any;
  /** 实际值 */
  actual?: any;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否验证通过 */
  valid: boolean;
  /** 错误列表 */
  errors: ValidationErrorDetail[];
  /** 验证后的数据（可能被转换） */
  data?: any;
}

/**
 * 验证模式接口
 */
export interface ValidationSchema {
  /** 验证模式名称 */
  name: string;
  /** 验证函数 */
  validate(value: any, field?: string): ValidationResult;
  /** 是否必填 */
  required?: boolean;
  /** 默认值 */
  defaultValue?: any;
}

/**
 * 字符串验证选项
 */
export interface StringValidationOptions {
  /** 最小长度 */
  minLength?: number;
  /** 最大长度 */
  maxLength?: number;
  /** 正则表达式模式 */
  pattern?: RegExp;
  /** 是否必填 */
  required?: boolean;
  /** 是否修剪空格 */
  trim?: boolean;
  /** 允许的值列表 */
  enum?: string[];
  /** 自定义验证函数 */
  validate?: (value: string) => boolean | string;
}

/**
 * 数字验证选项
 */
export interface NumberValidationOptions {
  /** 最小值 */
  min?: number;
  /** 最大值 */
  max?: number;
  /** 是否必须是整数 */
  integer?: boolean;
  /** 是否必填 */
  required?: boolean;
  /** 允许的值列表 */
  enum?: number[];
  /** 自定义验证函数 */
  validate?: (value: number) => boolean | string;
}

/**
 * 布尔验证选项
 */
export interface BooleanValidationOptions {
  /** 是否必填 */
  required?: boolean;
}

/**
 * 邮箱验证选项
 */
export interface EmailValidationOptions {
  /** 是否必填 */
  required?: boolean;
  /** 允许的域名列表 */
  allowedDomains?: string[];
  /** 禁止的域名列表 */
  blockedDomains?: string[];
}

/**
 * URL验证选项
 */
export interface UrlValidationOptions {
  /** 是否必填 */
  required?: boolean;
  /** 允许的协议列表 */
  allowedProtocols?: string[];
  /** 是否要求HTTPS */
  requireHttps?: boolean;
}

/**
 * 对象验证选项
 */
export interface ObjectValidationOptions {
  /** 是否必填 */
  required?: boolean;
  /** 严格模式（不允许额外字段） */
  strict?: boolean;
  /** 允许的字段列表（严格模式下） */
  allowedFields?: string[];
}

/**
 * 数组验证选项
 */
export interface ArrayValidationOptions {
  /** 最小长度 */
  minLength?: number;
  /** 最大长度 */
  maxLength?: number;
  /** 是否必填 */
  required?: boolean;
  /** 是否允许空数组 */
  allowEmpty?: boolean;
}

/**
 * 创建字符串验证模式
 */
export function createStringSchema(options: StringValidationOptions = {}): ValidationSchema {
  const {
    minLength,
    maxLength,
    pattern,
    required = false,
    trim = true,
    enum: enumValues,
    validate: customValidate,
  } = options;

  return {
    name: 'string',
    required,
    validate(value: any, field = ''): ValidationResult {
      const errors: ValidationErrorDetail[] = [];

      // 处理未定义的值
      if (value === undefined || value === null) {
        if (required) {
          errors.push({ field, message: 'String is required' });
        }
        return { valid: errors.length === 0, errors };
      }

      // 确保是字符串
      if (typeof value !== 'string') {
        value = String(value);
      }

      // 修剪空格
      let processedValue = value;
      if (trim) {
        processedValue = value.trim();
      }

      // 检查空字符串
      if (required && processedValue === '') {
        errors.push({ field, message: 'String cannot be empty' });
      }

      // 检查最小长度
      if (minLength !== undefined && processedValue.length < minLength) {
        errors.push({
          field,
          message: `String must be at least ${minLength} characters long`,
          expected: `minLength: ${minLength}`,
          actual: processedValue.length,
        });
      }

      // 检查最大长度
      if (maxLength !== undefined && processedValue.length > maxLength) {
        errors.push({
          field,
          message: `String must be at most ${maxLength} characters long`,
          expected: `maxLength: ${maxLength}`,
          actual: processedValue.length,
        });
      }

      // 检查正则表达式模式
      if (pattern && !pattern.test(processedValue)) {
        errors.push({
          field,
          message: `String must match pattern ${pattern}`,
          expected: `pattern: ${pattern}`,
          actual: processedValue,
        });
      }

      // 检查枚举值
      if (enumValues && !enumValues.includes(processedValue)) {
        errors.push({
          field,
          message: `String must be one of: ${enumValues.join(', ')}`,
          expected: enumValues,
          actual: processedValue,
        });
      }

      // 自定义验证
      if (customValidate) {
        const customResult = customValidate(processedValue);
        if (customResult !== true) {
          errors.push({
            field,
            message: typeof customResult === 'string' ? customResult : 'Custom validation failed',
          });
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        data: processedValue,
      };
    },
  };
}

/**
 * 创建数字验证模式
 */
export function createNumberSchema(options: NumberValidationOptions = {}): ValidationSchema {
  const {
    min,
    max,
    integer = false,
    required = false,
    enum: enumValues,
    validate: customValidate,
  } = options;

  return {
    name: 'number',
    required,
    validate(value: any, field = ''): ValidationResult {
      const errors: ValidationErrorDetail[] = [];

      // 处理未定义的值
      if (value === undefined || value === null) {
        if (required) {
          errors.push({ field, message: 'Number is required' });
        }
        return { valid: errors.length === 0, errors };
      }

      // 转换为数字
      const num = Number(value);
      if (isNaN(num)) {
        errors.push({ field, message: 'Value must be a valid number' });
        return { valid: false, errors };
      }

      // 检查整数
      if (integer && !Number.isInteger(num)) {
        errors.push({ field, message: 'Number must be an integer' });
      }

      // 检查最小值
      if (min !== undefined && num < min) {
        errors.push({
          field,
          message: `Number must be at least ${min}`,
          expected: `min: ${min}`,
          actual: num,
        });
      }

      // 检查最大值
      if (max !== undefined && num > max) {
        errors.push({
          field,
          message: `Number must be at most ${max}`,
          expected: `max: ${max}`,
          actual: num,
        });
      }

      // 检查枚举值
      if (enumValues && !enumValues.includes(num)) {
        errors.push({
          field,
          message: `Number must be one of: ${enumValues.join(', ')}`,
          expected: enumValues,
          actual: num,
        });
      }

      // 自定义验证
      if (customValidate) {
        const customResult = customValidate(num);
        if (customResult !== true) {
          errors.push({
            field,
            message: typeof customResult === 'string' ? customResult : 'Custom validation failed',
          });
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        data: num,
      };
    },
  };
}

/**
 * 创建布尔验证模式
 */
export function createBooleanSchema(options: BooleanValidationOptions = {}): ValidationSchema {
  const { required = false } = options;

  return {
    name: 'boolean',
    required,
    validate(value: any, field = ''): ValidationResult {
      const errors: ValidationErrorDetail[] = [];

      // 处理未定义的值
      if (value === undefined || value === null) {
        if (required) {
          errors.push({ field, message: 'Boolean is required' });
        }
        return { valid: errors.length === 0, errors };
      }

      // 转换为布尔值
      let boolValue: boolean;
      if (typeof value === 'boolean') {
        boolValue = value;
      } else if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'true' || lower === '1' || lower === 'yes') {
          boolValue = true;
        } else if (lower === 'false' || lower === '0' || lower === 'no') {
          boolValue = false;
        } else {
          errors.push({ field, message: 'Value must be a valid boolean' });
          return { valid: false, errors };
        }
      } else if (typeof value === 'number') {
        boolValue = value !== 0;
      } else {
        errors.push({ field, message: 'Value must be a boolean' });
        return { valid: false, errors };
      }

      return {
        valid: errors.length === 0,
        errors,
        data: boolValue,
      };
    },
  };
}

/**
 * 创建邮箱验证模式
 */
export function createEmailSchema(options: EmailValidationOptions = {}): ValidationSchema {
  const { required = false, allowedDomains, blockedDomains } = options;

  // 邮箱正则表达式
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  return {
    name: 'email',
    required,
    validate(value: any, field = ''): ValidationResult {
      const errors: ValidationErrorDetail[] = [];

      // 处理未定义的值
      if (value === undefined || value === null) {
        if (required) {
          errors.push({ field, message: 'Email is required' });
        }
        return { valid: errors.length === 0, errors };
      }

      // 确保是字符串
      if (typeof value !== 'string') {
        value = String(value);
      }

      const email = value.trim().toLowerCase();

      // 检查邮箱格式
      if (!emailRegex.test(email)) {
        errors.push({ field, message: 'Invalid email format' });
        return { valid: false, errors, data: email };
      }

      // 提取域名
      const domain = email.split('@')[1];

      // 检查允许的域名
      if (allowedDomains && !allowedDomains.includes(domain)) {
        errors.push({
          field,
          message: `Email domain must be one of: ${allowedDomains.join(', ')}`,
          expected: allowedDomains,
          actual: domain,
        });
      }

      // 检查禁止的域名
      if (blockedDomains && blockedDomains.includes(domain)) {
        errors.push({
          field,
          message: `Email domain ${domain} is not allowed`,
          expected: `not ${domain}`,
          actual: domain,
        });
      }

      return {
        valid: errors.length === 0,
        errors,
        data: email,
      };
    },
  };
}

/**
 * 创建URL验证模式
 */
export function createUrlSchema(options: UrlValidationOptions = {}): ValidationSchema {
  const { required = false, allowedProtocols, requireHttps = false } = options;

  // URL正则表达式
  const urlRegex = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;

  return {
    name: 'url',
    required,
    validate(value: any, field = ''): ValidationResult {
      const errors: ValidationErrorDetail[] = [];

      // 处理未定义的值
      if (value === undefined || value === null) {
        if (required) {
          errors.push({ field, message: 'URL is required' });
        }
        return { valid: errors.length === 0, errors };
      }

      // 确保是字符串
      if (typeof value !== 'string') {
        value = String(value);
      }

      const url = value.trim();

      // 检查URL格式
      if (!urlRegex.test(url)) {
        errors.push({ field, message: 'Invalid URL format' });
        return { valid: false, errors, data: url };
      }

      // 解析URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        errors.push({ field, message: 'Invalid URL format' });
        return { valid: false, errors, data: url };
      }

      // 检查协议
      const protocol = parsedUrl.protocol.slice(0, -1); // 移除末尾的冒号

      if (requireHttps && protocol !== 'https') {
        errors.push({
          field,
          message: 'URL must use HTTPS protocol',
          expected: 'https',
          actual: protocol,
        });
      }

      if (allowedProtocols && !allowedProtocols.includes(protocol)) {
        errors.push({
          field,
          message: `URL protocol must be one of: ${allowedProtocols.join(', ')}`,
          expected: allowedProtocols,
          actual: protocol,
        });
      }

      return {
        valid: errors.length === 0,
        errors,
        data: url,
      };
    },
  };
}

/**
 * 创建对象验证模式
 */
export function createObjectSchema(
  properties: Record<string, ValidationSchema>,
  options: ObjectValidationOptions = {}
): ValidationSchema {
  const { required = false, strict = false, allowedFields } = options;

  return {
    name: 'object',
    required,
    validate(value: any, field = ''): ValidationResult {
      const errors: ValidationErrorDetail[] = [];

      // 处理未定义的值
      if (value === undefined || value === null) {
        if (required) {
          errors.push({ field, message: 'Object is required' });
        }
        return { valid: errors.length === 0, errors };
      }

      // 确保是对象
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push({ field, message: 'Value must be an object' });
        return { valid: false, errors };
      }

      const result: Record<string, any> = {};
      const inputKeys = Object.keys(value);
      const propertyKeys = Object.keys(properties);

      // 严格模式检查
      if (strict) {
        const allowedKeys = allowedFields || propertyKeys;
        const extraKeys = inputKeys.filter(key => !allowedKeys.includes(key));
        if (extraKeys.length > 0) {
          errors.push({
            field,
            message: `Object contains extra fields: ${extraKeys.join(', ')}`,
            expected: `allowed fields: ${allowedKeys.join(', ')}`,
            actual: inputKeys.join(', '),
          });
        }
      }

      // 验证每个属性
      for (const [key, schema] of Object.entries(properties)) {
        const propValue = value[key];
        const propField = field ? `${field}.${key}` : key;
        const propResult = schema.validate(propValue, propField);

        if (!propResult.valid) {
          errors.push(...propResult.errors);
        }

        // 使用验证后的数据或默认值
        if (propResult.data !== undefined) {
          result[key] = propResult.data;
        } else if (propValue !== undefined) {
          result[key] = propValue;
        } else if (schema.defaultValue !== undefined) {
          result[key] = schema.defaultValue;
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        data: result,
      };
    },
  };
}

/**
 * 创建数组验证模式
 */
export function createArraySchema(
  itemSchema: ValidationSchema,
  options: ArrayValidationOptions = {}
): ValidationSchema {
  const {
    minLength,
    maxLength,
    required = false,
    allowEmpty = true,
  } = options;

  return {
    name: 'array',
    required,
    validate(value: any, field = ''): ValidationResult {
      const errors: ValidationErrorDetail[] = [];

      // 处理未定义的值
      if (value === undefined || value === null) {
        if (required) {
          errors.push({ field, message: 'Array is required' });
        }
        return { valid: errors.length === 0, errors };
      }

      // 确保是数组
      if (!Array.isArray(value)) {
        errors.push({ field, message: 'Value must be an array' });
        return { valid: false, errors };
      }

      // 检查空数组
      if (!allowEmpty && value.length === 0) {
        errors.push({ field, message: 'Array cannot be empty' });
      }

      // 检查最小长度
      if (minLength !== undefined && value.length < minLength) {
        errors.push({
          field,
          message: `Array must have at least ${minLength} items`,
          expected: `minLength: ${minLength}`,
          actual: value.length,
        });
      }

      // 检查最大长度
      if (maxLength !== undefined && value.length > maxLength) {
        errors.push({
          field,
          message: `Array must have at most ${maxLength} items`,
          expected: `maxLength: ${maxLength}`,
          actual: value.length,
        });
      }

      const result: any[] = [];

      // 验证每个元素
      for (let i = 0; i < value.length; i++) {
        const itemValue = value[i];
        const itemField = field ? `${field}[${i}]` : `[${i}]`;
        const itemResult = itemSchema.validate(itemValue, itemField);

        if (!itemResult.valid) {
          errors.push(...itemResult.errors);
        }

        // 使用验证后的数据
        if (itemResult.data !== undefined) {
          result.push(itemResult.data);
        } else {
          result.push(itemValue);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        data: result,
      };
    },
  };
}

/**
 * 创建日期验证模式
 */
export function createDateSchema(options: { required?: boolean } = {}): ValidationSchema {
  const { required = false } = options;

  return {
    name: 'date',
    required,
    validate(value: any, field = ''): ValidationResult {
      const errors: ValidationErrorDetail[] = [];

      // 处理未定义的值
      if (value === undefined || value === null) {
        if (required) {
          errors.push({ field, message: 'Date is required' });
        }
        return { valid: errors.length === 0, errors };
      }

      let date: Date;

      if (value instanceof Date) {
        date = value;
      } else if (typeof value === 'string' || typeof value === 'number') {
        date = new Date(value);
      } else {
        errors.push({ field, message: 'Value must be a valid date' });
        return { valid: false, errors };
      }

      // 检查日期是否有效
      if (isNaN(date.getTime())) {
        errors.push({ field, message: 'Invalid date' });
        return { valid: false, errors };
      }

      return {
        valid: errors.length === 0,
        errors,
        data: date,
      };
    },
  };
}

/**
 * 创建自定义验证模式
 */
export function createCustomSchema(
  name: string,
  validate: (value: any, field?: string) => ValidationResult,
  options: { required?: boolean } = {}
): ValidationSchema {
  const { required = false } = options;

  return {
    name,
    required,
    validate,
  };
}