/**
 * ValidationMiddleware Tests - 验证中间件测试
 * @author PAI
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'bun:test';
import { MiddlewareChain, createContext } from '../../src/middleware/MiddlewareChain';
import type { MiddlewareContext } from '../../src/middleware/types';

// 导入即将实现的模块
import {
  ValidationMiddleware,
  createValidationMiddleware,
  validateRequest,
  createSchemaValidator,
  ValidationError,
  ValidationOptions,
} from '../../src/middleware/ValidationMiddleware';

import {
  createStringSchema,
  createNumberSchema,
  createEmailSchema,
  createUrlSchema,
  createObjectSchema,
  createArraySchema,
  ValidationSchema,
} from '../../src/middleware/schemas';

describe('ValidationMiddleware', () => {
  let chain: MiddlewareChain;
  let context: MiddlewareContext;

  beforeEach(() => {
    chain = new MiddlewareChain();
    context = createContext({
      method: 'POST',
      path: '/api/users',
      headers: { 'content-type': 'application/json' },
      body: { name: 'John Doe', email: 'john@example.com', age: 30 },
    });
  });

  afterEach(() => {
    chain.clear();
  });

  describe('createValidationMiddleware', () => {
    test('should create validation middleware with schema', async () => {
      const userSchema = createObjectSchema({
        name: createStringSchema({ minLength: 2, maxLength: 50 }),
        email: createEmailSchema(),
        age: createNumberSchema({ min: 0, max: 150 }),
      });

      const middleware = createValidationMiddleware({
        schema: userSchema,
        validateBody: true,
      });

      chain.use(middleware);
      const result = await chain.execute(context);

      expect(result.error).toBeUndefined();
      expect(result.metadata?.validation?.valid).toBe(true);
    });

    test('should reject invalid data', async () => {
      const userSchema = createObjectSchema({
        name: createStringSchema({ minLength: 2 }),
        email: createEmailSchema(),
      });

      const middleware = createValidationMiddleware({
        schema: userSchema,
        validateBody: true,
      });

      const invalidContext = createContext({
        method: 'POST',
        path: '/api/users',
        body: { name: 'J', email: 'invalid-email' },
      });

      chain.use(middleware);
      const result = await chain.execute(invalidContext);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.metadata?.validation?.valid).toBe(false);
      expect(result.metadata?.validation?.errors).toBeDefined();
    });

    test('should validate query parameters', async () => {
      const querySchema = createObjectSchema({
        page: createNumberSchema({ min: 1 }),
        limit: createNumberSchema({ min: 1, max: 100 }),
      });

      const middleware = createValidationMiddleware({
        schema: querySchema,
        validateQuery: true,
      });

      const queryContext = createContext({
        method: 'GET',
        path: '/api/users',
        query: { page: '1', limit: '20' },
      });

      chain.use(middleware);
      const result = await chain.execute(queryContext);

      expect(result.error).toBeUndefined();
      expect(result.metadata?.validation?.valid).toBe(true);
    });

    test('should validate headers', async () => {
      const headerSchema = createObjectSchema({
        'content-type': createStringSchema({ pattern: /^application\/json$/ }),
        'authorization': createStringSchema({ minLength: 10 }),
      });

      const middleware = createValidationMiddleware({
        schema: headerSchema,
        validateHeaders: true,
      });

      const headerContext = createContext({
        method: 'POST',
        path: '/api/users',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer token12345',
        },
      });

      chain.use(middleware);
      const result = await chain.execute(headerContext);

      expect(result.error).toBeUndefined();
      expect(result.metadata?.validation?.valid).toBe(true);
    });
  });

  describe('validateRequest helper', () => {
    test('should validate request body', async () => {
      const userSchema = createObjectSchema({
        name: createStringSchema({ minLength: 2 }),
        email: createEmailSchema(),
      });

      const middleware = validateRequest({
        body: userSchema,
      });

      chain.use(middleware);
      const result = await chain.execute(context);

      expect(result.error).toBeUndefined();
      expect(result.metadata?.validation?.valid).toBe(true);
    });

    test('should validate multiple parts', async () => {
      const bodySchema = createObjectSchema({
        name: createStringSchema({ minLength: 2 }),
      });

      const querySchema = createObjectSchema({
        page: createNumberSchema({ min: 1 }),
      });

      const middleware = validateRequest({
        body: bodySchema,
        query: querySchema,
      });

      const multiContext = createContext({
        method: 'POST',
        path: '/api/users',
        body: { name: 'John Doe' },
        query: { page: '1' },
      });

      chain.use(middleware);
      const result = await chain.execute(multiContext);

      expect(result.error).toBeUndefined();
      expect(result.metadata?.validation?.valid).toBe(true);
    });
  });

  describe('createSchemaValidator', () => {
    test('should create reusable validator', async () => {
      const userSchema = createObjectSchema({
        name: createStringSchema({ minLength: 2 }),
        email: createEmailSchema(),
      });

      const validator = createSchemaValidator(userSchema);

      const validData = { name: 'John Doe', email: 'john@example.com' };
      const invalidData = { name: 'J', email: 'invalid' };

      const validResult = validator(validData);
      const invalidResult = validator(invalidData);

      expect(validResult.valid).toBe(true);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toBeDefined();
    });
  });

  describe('ValidationError', () => {
    test('should create validation error with details', () => {
      const error = new ValidationError('Validation failed', {
        errors: [
          { field: 'email', message: 'Invalid email format' },
          { field: 'age', message: 'Age must be positive' },
        ],
      });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.details).toBeDefined();
      expect(error.details.errors).toHaveLength(2);
    });
  });
});

describe('schemas', () => {
  describe('createStringSchema', () => {
    test('should validate string with minLength', () => {
      const schema = createStringSchema({ minLength: 3 });

      expect(schema.validate('ab')).toEqual({
        valid: false,
        errors: [{
          field: '',
          message: 'String must be at least 3 characters long',
          expected: 'minLength: 3',
          actual: 2
        }],
        data: 'ab',
      });

      expect(schema.validate('abc')).toEqual({
        valid: true,
        errors: [],
        data: 'abc',
      });
    });

    test('should validate string with maxLength', () => {
      const schema = createStringSchema({ maxLength: 5 });

      expect(schema.validate('abcdef')).toEqual({
        valid: false,
        errors: [{
          field: '',
          message: 'String must be at most 5 characters long',
          expected: 'maxLength: 5',
          actual: 6
        }],
        data: 'abcdef',
      });

      expect(schema.validate('abcde')).toEqual({
        valid: true,
        errors: [],
        data: 'abcde',
      });
    });

    test('should validate string with pattern', () => {
      const schema = createStringSchema({ pattern: /^[a-z]+$/ });

      expect(schema.validate('abc123')).toEqual({
        valid: false,
        errors: [{
          field: '',
          message: 'String must match pattern /^[a-z]+$/',
          expected: 'pattern: /^[a-z]+$/',
          actual: 'abc123'
        }],
        data: 'abc123',
      });

      expect(schema.validate('abc')).toEqual({
        valid: true,
        errors: [],
        data: 'abc',
      });
    });

    test('should validate required string', () => {
      const schema = createStringSchema({ required: true });

      expect(schema.validate('')).toEqual({
        valid: false,
        errors: [{ field: '', message: 'String cannot be empty' }],
        data: '',
      });

      expect(schema.validate('test')).toEqual({
        valid: true,
        errors: [],
        data: 'test',
      });
    });
  });

  describe('createNumberSchema', () => {
    test('should validate number with min', () => {
      const schema = createNumberSchema({ min: 0 });

      expect(schema.validate(-1)).toEqual({
        valid: false,
        errors: [{
          field: '',
          message: 'Number must be at least 0',
          expected: 'min: 0',
          actual: -1
        }],
        data: -1,
      });

      expect(schema.validate(0)).toEqual({
        valid: true,
        errors: [],
        data: 0,
      });
    });

    test('should validate number with max', () => {
      const schema = createNumberSchema({ max: 100 });

      expect(schema.validate(101)).toEqual({
        valid: false,
        errors: [{
          field: '',
          message: 'Number must be at most 100',
          expected: 'max: 100',
          actual: 101
        }],
        data: 101,
      });

      expect(schema.validate(100)).toEqual({
        valid: true,
        errors: [],
        data: 100,
      });
    });

    test('should validate integer', () => {
      const schema = createNumberSchema({ integer: true });

      expect(schema.validate(1.5)).toEqual({
        valid: false,
        errors: [{ field: '', message: 'Number must be an integer' }],
        data: 1.5,
      });

      expect(schema.validate(1)).toEqual({
        valid: true,
        errors: [],
        data: 1,
      });
    });
  });

  describe('createEmailSchema', () => {
    test('should validate email format', () => {
      const schema = createEmailSchema();

      expect(schema.validate('invalid-email')).toEqual({
        valid: false,
        errors: [{ field: '', message: 'Invalid email format' }],
        data: 'invalid-email',
      });

      expect(schema.validate('test@example.com')).toEqual({
        valid: true,
        errors: [],
        data: 'test@example.com',
      });
    });
  });

  describe('createUrlSchema', () => {
    test('should validate URL format', () => {
      const schema = createUrlSchema();

      expect(schema.validate('invalid-url')).toEqual({
        valid: false,
        errors: [{ field: '', message: 'Invalid URL format' }],
        data: 'invalid-url',
      });

      expect(schema.validate('https://example.com')).toEqual({
        valid: true,
        errors: [],
        data: 'https://example.com',
      });
    });
  });

  describe('createObjectSchema', () => {
    test('should validate object with nested schemas', () => {
      const schema = createObjectSchema({
        name: createStringSchema({ minLength: 2 }),
        age: createNumberSchema({ min: 0 }),
      });

      expect(schema.validate({ name: 'J', age: -1 })).toEqual({
        valid: false,
        errors: [
          {
            field: 'name',
            message: 'String must be at least 2 characters long',
            expected: 'minLength: 2',
            actual: 1
          },
          {
            field: 'age',
            message: 'Number must be at least 0',
            expected: 'min: 0',
            actual: -1
          },
        ],
        data: { name: 'J', age: -1 },
      });

      expect(schema.validate({ name: 'John', age: 30 })).toEqual({
        valid: true,
        errors: [],
        data: { name: 'John', age: 30 },
      });
    });

    test('should validate optional fields', () => {
      const schema = createObjectSchema({
        name: createStringSchema({ required: true }),
        email: createStringSchema({ required: false }),
      });

      expect(schema.validate({ name: 'John' })).toEqual({
        valid: true,
        errors: [],
        data: { name: 'John' },
      });

      expect(schema.validate({})).toEqual({
        valid: false,
        errors: [{ field: 'name', message: 'String is required' }],
        data: {},
      });
    });
  });

  describe('createArraySchema', () => {
    test('should validate array with item schema', () => {
      const schema = createArraySchema(createStringSchema({ minLength: 2 }));

      expect(schema.validate(['a', 'ab'])).toEqual({
        valid: false,
        errors: [{
          field: '[0]',
          message: 'String must be at least 2 characters long',
          expected: 'minLength: 2',
          actual: 1
        }],
        data: ['a', 'ab'],
      });

      expect(schema.validate(['ab', 'cd'])).toEqual({
        valid: true,
        errors: [],
        data: ['ab', 'cd'],
      });
    });

    test('should validate array length', () => {
      const schema = createArraySchema(createStringSchema(), { minLength: 1, maxLength: 3 });

      expect(schema.validate([])).toEqual({
        valid: false,
        errors: [{
          field: '',
          message: 'Array must have at least 1 items',
          expected: 'minLength: 1',
          actual: 0
        }],
        data: [],
      });

      expect(schema.validate(['a', 'b', 'c', 'd'])).toEqual({
        valid: false,
        errors: [{
          field: '',
          message: 'Array must have at most 3 items',
          expected: 'maxLength: 3',
          actual: 4
        }],
        data: ['a', 'b', 'c', 'd'],
      });

      expect(schema.validate(['a', 'b'])).toEqual({
        valid: true,
        errors: [],
        data: ['a', 'b'],
      });
    });
  });
});