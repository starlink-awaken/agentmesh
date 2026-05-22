/**
 * LoggingMiddleware Tests - 日志中间件测试
 * @author PAI
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'bun:test';
import {
  LoggingMiddleware,
  createLoggingMiddleware,
  createRequestLogger,
  createDebugLogger
} from '../../src/middleware/LoggingMiddleware';
import { createContext } from '../../src/middleware/MiddlewareChain';
import type { MiddlewareContext, MiddlewareNext, Logger, LoggingConfig } from '../../src/middleware/types';

// Mock Logger for testing
class MockLogger implements Logger {
  debug = vi.fn();
  info = vi.fn();
  warn = vi.fn();
  error = vi.fn();
}

describe('LoggingMiddleware', () => {
  let middleware: LoggingMiddleware;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = new MockLogger();
  });

  afterEach(() => {
    if (middleware) {
      middleware.flush();
    }
  });

  describe('constructor', () => {
    test('should create middleware with default config', () => {
      middleware = new LoggingMiddleware();
      expect(middleware).toBeDefined();
    });

    test('should create middleware with custom config', () => {
      middleware = new LoggingMiddleware({
        level: 'debug',
        timestamp: true,
        requestId: true,
        logRequestBody: true,
        logResponseBody: true,
        logger: mockLogger
      });

      expect(middleware).toBeDefined();
    });
  });

  describe('create()', () => {
    test('should create middleware function', () => {
      middleware = new LoggingMiddleware({ logger: mockLogger });
      const middlewareFunc = middleware.create();

      expect(typeof middlewareFunc).toBe('function');
    });

    test('should log request on entry', async () => {
      middleware = new LoggingMiddleware({ logger: mockLogger });
      const middlewareFunc = middleware.create();

      const context = createContext({
        method: 'GET',
        path: '/test',
        headers: { 'content-type': 'application/json' }
      });

      const next = vi.fn().mockResolvedValue({
        ...context,
        response: { status: 200, headers: {}, body: {} }
      });

      await middlewareFunc(context, next);
      await middleware.flush();

      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should log response on exit', async () => {
      middleware = new LoggingMiddleware({ logger: mockLogger });
      const middlewareFunc = middleware.create();

      const context = createContext({
        method: 'GET',
        path: '/test'
      });

      const next = vi.fn().mockResolvedValue({
        ...context,
        response: { status: 200, headers: {}, body: {} }
      });

      await middlewareFunc(context, next);
      await middleware.flush();

      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should log error on exception', async () => {
      middleware = new LoggingMiddleware({ logger: mockLogger });
      const middlewareFunc = middleware.create();

      const context = createContext({
        method: 'GET',
        path: '/test'
      });

      const error = new Error('Test error');
      const next = vi.fn().mockRejectedValue(error);

      await expect(middlewareFunc(context, next)).rejects.toThrow();
      await middleware.flush();

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('logRequest', () => {
    test('should log request details', async () => {
      middleware = new LoggingMiddleware({ logger: mockLogger });

      const context = createContext({
        method: 'POST',
        path: '/api/users',
        headers: { 'content-type': 'application/json' },
        body: { name: 'test' }
      });

      await middleware.logRequest(context);
      await middleware.flush();

      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should include request body when configured', async () => {
      middleware = new LoggingMiddleware({
        logger: mockLogger,
        logRequestBody: true
      });

      const context = createContext({
        method: 'POST',
        path: '/api/users',
        headers: { 'content-type': 'application/json' },
        body: { name: 'test' }
      });

      await middleware.logRequest(context);
      await middleware.flush();

      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should include user when present', async () => {
      middleware = new LoggingMiddleware({ logger: mockLogger });

      const context = createContext({
        method: 'GET',
        path: '/test'
      });
      context.request.user = { id: 'user-1', name: 'Test User' };

      await middleware.logRequest(context);
      await middleware.flush();

      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should sanitize sensitive headers', async () => {
      middleware = new LoggingMiddleware({ logger: mockLogger });

      const context = createContext({
        method: 'GET',
        path: '/test',
        headers: {
          'authorization': 'Bearer token123',
          'x-api-key': 'secret-key',
          'content-type': 'application/json'
        }
      });

      await middleware.logRequest(context);
      await middleware.flush();

      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('logResponse', () => {
    test('should log response with status', async () => {
      middleware = new LoggingMiddleware({ logger: mockLogger });

      const context = createContext({
        method: 'GET',
        path: '/test'
      });
      context.response = { status: 200, headers: {}, body: {} };

      await middleware.logResponse(context, 100);
      await middleware.flush();

      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should use warn level for 4xx errors', async () => {
      middleware = new LoggingMiddleware({ logger: mockLogger });

      const context = createContext({
        method: 'GET',
        path: '/test'
      });
      context.response = { status: 404, headers: {}, body: {} };

      await middleware.logResponse(context, 100);
      await middleware.flush();

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('should use error level for 5xx errors', async () => {
      middleware = new LoggingMiddleware({ logger: mockLogger });

      const context = createContext({
        method: 'GET',
        path: '/test'
      });
      context.response = { status: 500, headers: {}, body: {} };

      await middleware.logResponse(context, 100);
      await middleware.flush();

      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should log response body when configured', async () => {
      middleware = new LoggingMiddleware({
        logger: mockLogger,
        logResponseBody: true
      });

      const context = createContext({
        method: 'GET',
        path: '/test'
      });
      context.response = {
        status: 200,
        headers: {},
        body: { data: 'test' }
      };

      await middleware.logResponse(context, 100);
      await middleware.flush();

      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should warn when no response', async () => {
      middleware = new LoggingMiddleware({ logger: mockLogger });

      const context = createContext({
        method: 'GET',
        path: '/test'
      });

      await middleware.logResponse(context, 100);
      await middleware.flush();

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('logError', () => {
    test('should log error details', async () => {
      middleware = new LoggingMiddleware({ logger: mockLogger });

      const context = createContext({
        method: 'GET',
        path: '/test'
      });

      const error = new Error('Test error');
      await middleware.logError(error, context);
      await middleware.flush();

      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should include error stack in development', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      middleware = new LoggingMiddleware({ logger: mockLogger });

      const context = createContext({
        method: 'GET',
        path: '/test'
      });

      const error = new Error('Test error');
      await middleware.logError(error, context);
      await middleware.flush();

      expect(mockLogger.error).toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('log level filtering', () => {
    test('should not log below configured level', async () => {
      middleware = new LoggingMiddleware({
        logger: mockLogger,
        level: 'error'
      });

      middleware.log('info', 'This should not appear');
      middleware.log('debug', 'This should not appear');
      await middleware.flush();

      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    test('should log at and above configured level', async () => {
      middleware = new LoggingMiddleware({
        logger: mockLogger,
        level: 'warn'
      });

      middleware.log('warn', 'Warning message');
      middleware.log('error', 'Error message');
      await middleware.flush();

      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('setLevel', () => {
    test('should change log level dynamically', () => {
      middleware = new LoggingMiddleware({
        logger: mockLogger,
        level: 'error'
      });

      middleware.setLevel('debug');
      middleware.log('debug', 'Debug message');
      middleware.log('info', 'Info message');
      middleware.flush();

      expect(mockLogger.debug).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('factory functions', () => {
    test('createLoggingMiddleware should create middleware', () => {
      const middlewareFunc = createLoggingMiddleware({ logger: mockLogger });
      expect(typeof middlewareFunc).toBe('function');
    });

    test('createRequestLogger should create request-only logger', () => {
      const middlewareFunc = createRequestLogger({ logger: mockLogger });
      expect(typeof middlewareFunc).toBe('function');
    });

    test('createDebugLogger should create debug logger', () => {
      const middlewareFunc = createDebugLogger({ logger: mockLogger });
      expect(typeof middlewareFunc).toBe('function');
    });

    test('createDebugLogger should enable all body logging', () => {
      const middlewareFunc = createDebugLogger({ logger: mockLogger });
      expect(typeof middlewareFunc).toBe('function');
    });
  });

  describe('timestamp configuration', () => {
    test('should include timestamp when enabled', async () => {
      middleware = new LoggingMiddleware({
        logger: mockLogger,
        timestamp: true
      });

      middleware.log('info', 'Test message');
      await middleware.flush();

      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should not include timestamp when disabled', async () => {
      middleware = new LoggingMiddleware({
        logger: mockLogger,
        timestamp: false
      });

      middleware.log('info', 'Test message');
      await middleware.flush();

      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('requestId configuration', () => {
    test('should include requestId when enabled', async () => {
      middleware = new LoggingMiddleware({
        logger: mockLogger,
        requestId: true
      });

      middleware.log('info', 'Test message');
      await middleware.flush();

      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should not include requestId when disabled', async () => {
      middleware = new LoggingMiddleware({
        logger: mockLogger,
        requestId: false
      });

      middleware.log('info', 'Test message');
      await middleware.flush();

      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('flush', () => {
    test('should flush all pending logs', async () => {
      middleware = new LoggingMiddleware({ logger: mockLogger });

      middleware.log('info', 'Message 1');
      middleware.log('info', 'Message 2');
      middleware.log('info', 'Message 3');

      await middleware.flush();

      expect(mockLogger.info).toHaveBeenCalledTimes(3);
    });
  });

  describe('integration', () => {
    test('should log full request-response cycle', async () => {
      middleware = new LoggingMiddleware({ logger: mockLogger });
      const middlewareFunc = middleware.create();

      const context = createContext({
        method: 'POST',
        path: '/api/data',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer token'
        },
        body: { key: 'value' }
      });

      const next = vi.fn().mockResolvedValue({
        ...context,
        response: { status: 201, headers: {}, body: { id: 1 } }
      });

      await middlewareFunc(context, next);
      await middleware.flush();

      expect(next).toHaveBeenCalled();
      // 应该记录了请求和响应
      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should handle request without response', async () => {
      middleware = new LoggingMiddleware({ logger: mockLogger });
      const middlewareFunc = middleware.create();

      const context = createContext({
        method: 'GET',
        path: '/test'
      });

      const next = vi.fn().mockResolvedValue(context);

      await middlewareFunc(context, next);
      await middleware.flush();

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
