/**
 * ErrorMiddleware Tests - 错误中间件测试
 * @author PAI
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'bun:test';
import {
  ErrorMiddleware,
  createErrorMiddleware,
  createErrorResponder
} from '../../src/middleware/ErrorMiddleware';
import { createContext, createError } from '../../src/middleware/MiddlewareChain';
import type { MiddlewareContext, MiddlewareError, MiddlewareNext } from '../../src/middleware/types';

describe('ErrorMiddleware', () => {
  let middleware: ErrorMiddleware;

  beforeEach(() => {
    middleware = new ErrorMiddleware();
  });

  describe('create()', () => {
    test('should create error handling middleware', () => {
      const middlewareFunc = middleware.create();
      expect(typeof middlewareFunc).toBe('function');
    });

    test('should pass through when no error', async () => {
      const middlewareFunc = middleware.create();
      const context = createContext({
        method: 'GET',
        path: '/test'
      });

      const next = vi.fn().mockResolvedValue({
        ...context,
        response: { status: 200, headers: {}, body: {} }
      });

      const result = await middlewareFunc(context, next);
      expect(next).toHaveBeenCalled();
      expect(result.response?.status).toBe(200);
    });

    test('should catch errors from next middleware', async () => {
      const middlewareFunc = middleware.create();
      const context = createContext({
        method: 'GET',
        path: '/test'
      });

      const error = createError('TEST_ERROR', 'Test error', 500, 'test');
      const next = vi.fn().mockRejectedValue(error);

      const result = await middlewareFunc(context, next);

      expect(result.error).toBeDefined();
    }, 10000);
  });

  describe('handleError', () => {
    test('should compress error', async () => {
      const error = createError('ORIGINAL_ERROR', 'Original error message', 500, 'source');
      const context = createContext({ method: 'GET', path: '/test' });

      const result = await middleware.handleError(error, context);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('ORIGINAL_ERROR');
      expect(result.error?.originalError).toBeUndefined();
    }, 10000);

    test('should infer error code from status', async () => {
      const error = new Error('Server error') as MiddlewareError;
      error.statusCode = 500;

      const context = createContext({ method: 'GET', path: '/test' });
      const result = await middleware.handleError(error, context);

      expect(result.error?.code).toBe('SERVER_ERROR');
    }, 10000);
  });

  describe('error compression (Factor 9)', () => {
    test('should compress complex errors', () => {
      const originalError = new Error('Original error') as MiddlewareError;
      originalError.code = 'COMPLEX_ERROR';
      originalError.statusCode = 500;
      originalError.source = 'test-source';
      originalError.originalError = new Error('Nested error');

      const compressed = middleware.compressError(originalError);

      expect(compressed.message).toBe('Original error');
      expect(compressed.code).toBe('COMPLEX_ERROR');
      expect(compressed.statusCode).toBe(500);
      expect(compressed.source).toBe('test-source');
      expect(compressed.originalError).toBeUndefined();
    });

    test('should infer code when not present', () => {
      const error = new Error('timeout in request') as MiddlewareError;
      error.statusCode = 408;

      const compressed = middleware.compressError(error);

      expect(compressed.code).toBe('TIMEOUT');
    });
  });

  describe('createErrorResponse', () => {
    test('should create error response with status', async () => {
      const error = createError('TEST_ERROR', 'Test error', 404, 'test');
      const context = createContext({ method: 'GET', path: '/test' });

      const result = await middleware.handleError(error, context);

      expect(result.response?.status).toBe(404);
      expect(result.response?.body?.error?.message).toBe('Test error');
      expect(result.response?.body?.error?.code).toBe('TEST_ERROR');
      expect(result.response?.body?.requestId).toBeDefined();
    }, 10000);
  });

  describe('factory functions', () => {
    test('createErrorMiddleware should create middleware with options', () => {
      const middlewareFunc = createErrorMiddleware({
        maxRetries: 5,
        retryDelay: 1000
      });

      expect(typeof middlewareFunc).toBe('function');
    });

    test('createErrorResponder should create error responder', () => {
      const middlewareFunc = createErrorResponder();
      expect(typeof middlewareFunc).toBe('function');
    });
  });

  describe('createErrorResponder', () => {
    test('should respond with error when error exists', async () => {
      const middlewareFunc = createErrorResponder();
      const context = createContext({ method: 'GET', path: '/test' });

      const error = createError('TEST_ERROR', 'Test error', 500, 'test');
      const next = vi.fn().mockImplementation(async (ctx) => {
        ctx.error = error;
        return ctx;
      });

      const result = await middlewareFunc(context, next);

      expect(result.response?.status).toBe(500);
      expect(result.response?.body?.error?.message).toBe('Test error');
    });

    test('should pass through when no error', async () => {
      const middlewareFunc = createErrorResponder();
      const context = createContext({
        method: 'GET',
        path: '/test'
      });

      const next = vi.fn().mockResolvedValue({
        ...context,
        response: { status: 200, headers: {}, body: { success: true } }
      });

      const result = await middlewareFunc(context, next);

      expect(result.response?.status).toBe(200);
      expect(result.response?.body?.success).toBe(true);
    });

    test('should catch errors from next middleware', async () => {
      const middlewareFunc = createErrorResponder();
      const context = createContext({ method: 'GET', path: '/test' });

      const error = createError('TEST_ERROR', 'Test error', 500, 'test');
      const next = vi.fn().mockRejectedValue(error);

      const result = await middlewareFunc(context, next);

      expect(result.response?.status).toBe(500);
      expect(result.response?.body?.error?.message).toBe('Test error');
    });
  });

  describe('registerHandler', () => {
    test('should register error handler', () => {
      const handler = async (ctx: MiddlewareContext, next: MiddlewareNext) => ctx;
      middleware.registerHandler('RETRY', handler);
      middleware.registerHandler('CUSTOM', async (ctx, next) => {
        ctx.state.customHandlerCalled = true;
        return ctx;
      });
    });
  });

  describe('setRecoveryOptions', () => {
    test('should update recovery options', () => {
      middleware.setRecoveryOptions({
        maxRetries: 10,
        retryDelay: 500
      });

      middleware.setRecoveryOptions({ maxRetries: 5 });
    });
  });
});
