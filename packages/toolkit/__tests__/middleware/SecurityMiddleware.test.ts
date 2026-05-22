/**
 * SecurityMiddleware Tests - 安全中间件测试
 * @author PAI
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'bun:test';
import { MiddlewareChain, createContext } from '../../src/middleware/MiddlewareChain';
import type { MiddlewareContext } from '../../src/middleware/types';

// 导入即将实现的模块
import {
  SecurityMiddleware,
  createSecurityMiddleware,
  createXSSProtectionMiddleware,
  createSQLInjectionProtectionMiddleware,
  createRequestSizeLimiter,
  createDangerousCharacterFilter,
  SecurityError,
  SecurityOptions,
} from '../../src/middleware/SecurityMiddleware';

describe('SecurityMiddleware', () => {
  let chain: MiddlewareChain;
  let context: MiddlewareContext;

  beforeEach(() => {
    chain = new MiddlewareChain();
    context = createContext({
      method: 'POST',
      path: '/api/users',
      headers: { 'content-type': 'application/json' },
      body: { name: 'John Doe', email: 'john@example.com' },
    });
  });

  afterEach(() => {
    chain.clear();
  });

  describe('createSecurityMiddleware', () => {
    test('should create comprehensive security middleware', async () => {
      const middleware = createSecurityMiddleware({
        xssProtection: true,
        sqlInjectionProtection: true,
        maxRequestSize: 1024 * 1024, // 1MB
        filterDangerousChars: true,
      });

      chain.use(middleware);
      const result = await chain.execute(context);

      expect(result.error).toBeUndefined();
      expect(result.metadata?.security?.passed).toBe(true);
    });

    test('should reject requests with XSS payloads', async () => {
      const middleware = createSecurityMiddleware({
        xssProtection: true,
      });

      const xssContext = createContext({
        method: 'POST',
        path: '/api/users',
        body: { name: '<script>alert("xss")</script>' },
      });

      chain.use(middleware);
      const result = await chain.execute(xssContext);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('SECURITY_ERROR');
      expect(result.error?.message).toContain('XSS');
    });

    test('should reject requests with SQL injection payloads', async () => {
      const middleware = createSecurityMiddleware({
        sqlInjectionProtection: true,
      });

      const sqlContext = createContext({
        method: 'POST',
        path: '/api/users',
        body: { query: "SELECT * FROM users WHERE id = '1' OR '1'='1'" },
      });

      chain.use(middleware);
      const result = await chain.execute(sqlContext);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('SECURITY_ERROR');
      expect(result.error?.message).toContain('SQL_INJECTION');
    });

    test('should reject oversized requests', async () => {
      const middleware = createSecurityMiddleware({
        maxRequestSize: 100, // 100 bytes
      });

      const largeContext = createContext({
        method: 'POST',
        path: '/api/users',
        body: { data: 'x'.repeat(200) }, // 200 bytes
      });

      chain.use(middleware);
      const result = await chain.execute(largeContext);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('SECURITY_ERROR');
      expect(result.error?.message).toContain('REQUEST_SIZE');
    });

    test('should filter dangerous characters', async () => {
      const middleware = createSecurityMiddleware({
        filterDangerousChars: true,
      });

      const dangerousContext = createContext({
        method: 'POST',
        path: '/api/users',
        body: { name: 'test; rm -rf /' },
      });

      chain.use(middleware);
      const result = await chain.execute(dangerousContext);

      expect(result.error).toBeUndefined();
    });
  });

  describe('createXSSProtectionMiddleware', () => {
    test('should block XSS attacks', async () => {
      const middleware = createXSSProtectionMiddleware();

      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
      ];

      for (const payload of xssPayloads) {
        const xssContext = createContext({
          method: 'POST',
          path: '/api/test',
          body: { input: payload },
        });

        chain.clear();
        chain.use(middleware);
        const result = await chain.execute(xssContext);

        expect(result.error).toBeDefined();
        expect(result.error?.code).toBe('SECURITY_ERROR');
        expect(result.error?.message).toContain('XSS');
      }
    });

    test('should allow safe content', async () => {
      const middleware = createXSSProtectionMiddleware();

      const safeInputs = [
        'Hello World',
        'Test <strong>bold</strong> text',
        'https://example.com',
        'user@example.com',
      ];

      for (const input of safeInputs) {
        const safeContext = createContext({
          method: 'POST',
          path: '/api/test',
          body: { input },
        });

        chain.clear();
        chain.use(middleware);
        const result = await chain.execute(safeContext);

        expect(result.error).toBeUndefined();
      }
    });
  });

  describe('createSQLInjectionProtectionMiddleware', () => {
    test('should block SQL injection attempts', async () => {
      const middleware = createSQLInjectionProtectionMiddleware();

      const sqlPayloads = [
        "SELECT * FROM users WHERE id = '1' OR '1'='1'",
        "DROP TABLE users",
        "'; DELETE FROM users; --",
        "UNION SELECT username, password FROM users",
        "' OR 1=1 --",
      ];

      for (const payload of sqlPayloads) {
        const sqlContext = createContext({
          method: 'POST',
          path: '/api/test',
          body: { query: payload },
        });

        chain.clear();
        chain.use(middleware);
        const result = await chain.execute(sqlContext);

        expect(result.error).toBeDefined();
        expect(result.error?.code).toBe('SECURITY_ERROR');
        expect(result.error?.message).toContain('SQL_INJECTION');
      }
    });

    test('should allow safe SQL queries', async () => {
      const middleware = createSQLInjectionProtectionMiddleware();

      const safeQueries = [
        "SELECT name FROM users WHERE id = 1",
        "INSERT INTO users (name, email) VALUES ('John', 'john@example.com')",
        "UPDATE users SET name = 'Jane' WHERE id = 1",
        "normal text without sql",
      ];

      for (const query of safeQueries) {
        const safeContext = createContext({
          method: 'POST',
          path: '/api/test',
          body: { query },
        });

        chain.clear();
        chain.use(middleware);
        const result = await chain.execute(safeContext);

        expect(result.error).toBeUndefined();
      }
    });
  });

  describe('createRequestSizeLimiter', () => {
    test('should reject oversized requests', async () => {
      const middleware = createRequestSizeLimiter(100); // 100 bytes

      const largeContext = createContext({
        method: 'POST',
        path: '/api/users',
        body: { data: 'x'.repeat(200) },
      });

      chain.use(middleware);
      const result = await chain.execute(largeContext);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('SECURITY_ERROR');
      expect(result.error?.message).toContain('REQUEST_SIZE');
    });

    test('should allow requests within limit', async () => {
      const middleware = createRequestSizeLimiter(1024); // 1KB

      const smallContext = createContext({
        method: 'POST',
        path: '/api/users',
        body: { data: 'x'.repeat(100) },
      });

      chain.use(middleware);
      const result = await chain.execute(smallContext);

      expect(result.error).toBeUndefined();
    });
  });

  describe('createDangerousCharacterFilter', () => {
    test('should filter dangerous characters', async () => {
      const middleware = createDangerousCharacterFilter();

      const dangerousContext = createContext({
        method: 'POST',
        path: '/api/users',
        body: {
          name: 'test; command',
          path: '../../etc/passwd',
          script: '<script>',
          sql: "' OR 1=1",
        },
      });

      chain.use(middleware);
      const result = await chain.execute(dangerousContext);

      expect(result.error).toBeUndefined();
    });

    test('should preserve safe characters', async () => {
      const middleware = createDangerousCharacterFilter();

      const safeContext = createContext({
        method: 'POST',
        path: '/api/users',
        body: {
          name: 'John Doe',
          email: 'john@example.com',
          age: 30,
          url: 'https://example.com/path',
        },
      });

      chain.use(middleware);
      const result = await chain.execute(safeContext);

      expect(result.error).toBeUndefined();
    });
  });

  describe('SecurityError', () => {
    test('should create security error with details', () => {
      const error = new SecurityError('Security violation detected', {
        type: 'XSS',
        payload: '<script>alert(1)</script>',
        field: 'body.input',
      });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('SecurityError');
      expect(error.code).toBe('SECURITY_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.details).toBeDefined();
      expect(error.details.type).toBe('XSS');
      expect(error.details.payload).toBe('<script>alert(1)</script>');
    });
  });
});