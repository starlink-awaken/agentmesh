/**
 * Honeycomb v2 - Domain Configuration Schema
 *
 * JSON Schema definitions for validating domain configuration files.
 * Provides structured validation with helpful error messages.
 *
 * This schema-based approach:
 * - Ensures domain configurations are valid
 * - Provides clear error messages for invalid configs
 * - Makes validation logic maintainable
 * - Supports schema evolution
 */

// ============================================================
// Schema Interfaces
// ============================================================

/**
 * Schema validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Array of error messages (empty if valid) */
  errors: ValidationError[];
  /** Array of warning messages (non-critical issues) */
  warnings: string[];
}

/**
 * Validation error with location
 */
export interface ValidationError {
  /** Error message */
  message: string;
  /** Path to the invalid property (dot notation) */
  path: string;
  /** Invalid value that caused the error */
  value?: unknown;
  /** Expected value/type */
  expected?: string;
}

/**
 * Schema definition for validation
 */
export interface Schema {
  /** Type of the value */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  /** Whether the property is required */
  required?: boolean;
  /** Default value if not present */
  default?: unknown;
  /** Allowed values (for enums) */
  enum?: unknown[];
  /** Minimum value (for numbers) */
  min?: number;
  /** Maximum value (for numbers) */
  max?: number;
  /** Minimum length (for strings/arrays) */
  minLength?: number;
  /** Maximum length (for strings/arrays) */
  maxLength?: number;
  /** Pattern to match (for strings) */
  pattern?: RegExp;
  /** Property definitions (for objects) */
  properties?: Record<string, Schema>;
  /** Array item schema (for arrays) */
  items?: Schema;
  /** Whether additional properties are allowed (for objects) */
  additionalProperties?: boolean | Schema;
  /** Custom validation function */
  validate?: (value: unknown, path: string) => string | null;
}

// ============================================================
// Domain Configuration Schema
// ============================================================

/**
 * JSON Schema for domain.json validation
 */
export const DOMAIN_CONFIG_SCHEMA: Schema = {
  type: 'object',
  required: true,
  properties: {
    // Required fields
    name: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 100,
      // Note: name is human-readable, so allow spaces and special characters
      // archetype is the technical identifier with stricter validation
    },
    description: {
      type: 'string',
      required: true,
      minLength: 10,
      maxLength: 500
    },
    archetype: {
      type: 'string',
      required: true,
      enum: ['software-dev', 'creative-writing', 'visual-production', 'document-processing', 'data-science', 'custom']
    },
    version: {
      type: 'string',
      required: true,
      pattern: /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/ // Semantic versioning
    },

    // Optional fields
    phase_prompts: {
      type: 'object',
      required: false,
      additionalProperties: true // Allow any type, domain-loader will filter non-strings
    },
    agent_overrides: {
      type: 'object',
      required: false,
      properties: {}, // Any agent name is allowed
      additionalProperties: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', required: true },
          priority: { type: 'number', required: false, min: 1, max: 10 },
          custom_prompt: { type: 'string', required: false },
          tools_override: { type: 'array', required: false, items: { type: 'string' } },
          token_budget_override: { type: 'number', required: false, min: 1000 }
        },
        additionalProperties: false
      }
    },
    defaults: {
      type: 'object',
      required: false,
      properties: {
        complexity: {
          type: 'string',
          required: false,
          enum: ['simple', 'standard', 'advanced', 'enterprise']
        },
        token_budget: {
          type: 'number',
          required: false,
          min: 10000,
          max: 10000000
        },
        max_concurrent_agents: {
          type: 'number',
          required: false,
          min: 1,
          max: 100
        },
        risk_thresholds_override: {
          type: 'object',
          required: false
        }
      },
      additionalProperties: false
    },
    templates: {
      type: 'object',
      required: false,
      properties: {},
      additionalProperties: { type: 'string' }
    },
    quality_gates: {
      type: 'array',
      required: false,
      items: {
        type: 'object',
        required: true,
        properties: {
          name: {
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 100
          },
          phase: {
            type: 'string',
            required: true,
            enum: ['init', 'research', 'decision', 'execution', 'feedback', 'delivery']
          },
          criteria: {
            type: 'array',
            required: true,
            minLength: 1,
            // 注意：criteria 数组中的项可以是字符串（简化格式）或对象（完整格式）
            // 类型验证由 DomainLoader.validateQualityGates() 处理
            items: {
              type: 'object', // 这里设置为 'object' 但实际运行时允许字符串
              required: false, // 允许字符串通过（在自定义验证中处理）
              validate: (value: unknown, path: string) => {
                // 允许字符串或对象
                if (typeof value !== 'string' && (typeof value !== 'object' || value === null)) {
                  return `Criterion must be a string or object, got ${typeof value}`;
                }
                return null; // 验证通过
              },
            },
          },
          mandatory: {
            type: 'boolean',
            required: true
          },
          config_file: {
            type: 'string',
            required: false
          }
        },
        additionalProperties: true // Allow domain-specific quality gate extensions
      }
    },

    // Extended fields (optional)
    capabilities: {
      type: 'object',
      required: false,
      additionalProperties: {
        type: 'object',
        properties: {
          agents: { type: 'array', required: false, items: { type: 'string' } },
          description: { type: 'string', required: false }
        }
      }
    },
    metrics: {
      type: 'object',
      required: false,
      additionalProperties: true
    },
    integrations: {
      type: 'object',
      required: false,
      additionalProperties: true
    },
    best_practices: {
      type: 'object',
      required: false,
      additionalProperties: true
    },
    documentation_templates: {
      type: 'object',
      required: false,
      additionalProperties: true
    }
  },
  additionalProperties: false
};

// ============================================================
// Schema Validator
// ============================================================

/**
 * Validates a value against a schema
 */
export class SchemaValidator {
  /**
   * Validate a value against a schema
   * @param value - Value to validate
   * @param schema - Schema to validate against
   * @param path - Current path (for error reporting)
   * @returns Validation result
   */
  validate(value: unknown, schema: Schema, path = '$'): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    this.validateValue(value, schema, path, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Internal validation method
   */
  private validateValue(
    value: unknown,
    schema: Schema,
    path: string,
    errors: ValidationError[],
    warnings: string[]
  ): void {
    // Check required
    if (schema.required && (value === null || value === undefined)) {
      errors.push({
        message: 'Required field is missing',
        path,
        expected: schema.type
      });
      return;
    }

    // Use default if present and value is undefined
    if (value === undefined && schema.default !== undefined) {
      value = schema.default;
    }

    // Skip further validation if null/undefined and not required
    if (value === null || value === undefined) {
      return;
    }

    // Custom validation (before type check to support union types)
    if (schema.validate) {
      const customError = schema.validate(value, path);
      if (customError) {
        errors.push({
          message: customError,
          path,
          value
        });
        return; // Custom validation failed, skip further checks
      }
    }

    // Type validation (skip if custom validation exists and supports multiple types)
    if (!schema.validate && !this.validateType(value, schema.type)) {
      errors.push({
        message: `Expected ${schema.type}, got ${typeof value}`,
        path,
        value,
        expected: schema.type
      });
      return;
    }

    // String validations
    if (schema.type === 'string' && typeof value === 'string') {
      this.validateString(value, schema, path, errors);
    }

    // Number validations
    if (schema.type === 'number' && typeof value === 'number') {
      this.validateNumber(value, schema, path, errors);
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push({
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        path,
        value,
        expected: schema.enum.join(' | ')
      });
    }

    // Custom validation
    if (schema.validate) {
      const customError = schema.validate(value, path);
      if (customError) {
        errors.push({
          message: customError,
          path,
          value
        });
      }
    }

    // Object validation
    if (schema.type === 'object' && typeof value === 'object' && !Array.isArray(value)) {
      this.validateObject(value as Record<string, unknown>, schema, path, errors, warnings);
    }

    // Array validation
    if (schema.type === 'array' && Array.isArray(value)) {
      this.validateArray(value, schema, path, errors, warnings);
    }
  }

  /**
   * Validate type
   */
  private validateType(value: unknown, type: Schema['type']): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      case 'null':
        return value === null;
      default:
        return true;
    }
  }

  /**
   * Validate string-specific constraints
   */
  private validateString(
    value: string,
    schema: Schema,
    path: string,
    errors: ValidationError[]
  ): void {
    if (schema.minLength && value.length < schema.minLength) {
      errors.push({
        message: `Minimum length is ${schema.minLength}, got ${value.length}`,
        path,
        value,
        expected: `length >= ${schema.minLength}`
      });
    }

    if (schema.maxLength && value.length > schema.maxLength) {
      errors.push({
        message: `Maximum length is ${schema.maxLength}, got ${value.length}`,
        path,
        value,
        expected: `length <= ${schema.maxLength}`
      });
    }

    if (schema.pattern && !schema.pattern.test(value)) {
      errors.push({
        message: `Value does not match required pattern`,
        path,
        value,
        expected: schema.pattern.toString()
      });
    }
  }

  /**
   * Validate number-specific constraints
   */
  private validateNumber(
    value: number,
    schema: Schema,
    path: string,
    errors: ValidationError[]
  ): void {
    if (schema.min !== undefined && value < schema.min) {
      errors.push({
        message: `Minimum value is ${schema.min}, got ${value}`,
        path,
        value,
        expected: `>= ${schema.min}`
      });
    }

    if (schema.max !== undefined && value > schema.max) {
      errors.push({
        message: `Maximum value is ${schema.max}, got ${value}`,
        path,
        value,
        expected: `<= ${schema.max}`
      });
    }
  }

  /**
   * Validate object-specific constraints
   */
  private validateObject(
    value: Record<string, unknown>,
    schema: Schema,
    path: string,
    errors: ValidationError[],
    warnings: string[]
  ): void {
    if (!schema.properties) {
      return;
    }

    // Validate each property
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const propPath = path === '$' ? `$.${propName}` : `${path}.${propName}`;
      const propValue = value[propName];

      this.validateValue(propValue, propSchema, propPath, errors, warnings);
    }

    // Check for additional properties
    if (schema.additionalProperties === false) {
      for (const propName of Object.keys(value)) {
        if (!schema.properties![propName]) {
          errors.push({
            message: `Unexpected property '${propName}'`,
            path: `${path}.${propName}`,
            value: value[propName]
          });
        }
      }
    }
  }

  /**
   * Validate array-specific constraints
   */
  private validateArray(
    value: unknown[],
    schema: Schema,
    path: string,
    errors: ValidationError[],
    warnings: string[]
  ): void {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        message: `Minimum length is ${schema.minLength}, got ${value.length}`,
        path,
        value,
        expected: `length >= ${schema.minLength}`
      });
    }

    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        message: `Maximum length is ${schema.maxLength}, got ${value.length}`,
        path,
        value,
        expected: `length <= ${schema.maxLength}`
      });
    }

    // Validate array items
    if (schema.items) {
      value.forEach((item, index) => {
        this.validateValue(item, schema.items!, `${path}[${index}]`, errors, warnings);
      });
    }
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create a new schema validator
 */
export function createSchemaValidator(): SchemaValidator {
  return new SchemaValidator();
}

/**
 * Validate a domain configuration object
 * @param config - Configuration to validate
 * @returns Validation result
 */
export function validateDomainConfig(config: unknown): ValidationResult {
  const validator = createSchemaValidator();
  return validator.validate(config, DOMAIN_CONFIG_SCHEMA);
}
