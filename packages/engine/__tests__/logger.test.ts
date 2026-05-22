/**
 * Tests for Logger - log levels, formatting, file logging.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger, createLogger } from '../src/logger.ts';

describe('Logger', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'hc-logger-test-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // ============================================================
  // Construction
  // ============================================================

  describe('construction', () => {
    test('creates logger with info level', () => {
      const logger = createLogger({ level: 'info' });
      expect(logger).toBeInstanceOf(Logger);
    });

    test('creates logger with debug level', () => {
      const logger = createLogger({ level: 'debug' });
      expect(logger).toBeInstanceOf(Logger);
    });

    test('creates logger with file path', () => {
      const logFile = join(tempDir, 'test.log');
      const logger = createLogger({ level: 'info', file: logFile });
      expect(logger).toBeInstanceOf(Logger);
    });
  });

  // ============================================================
  // Log Level Filtering
  // ============================================================

  describe('log level filtering', () => {
    test('info level logger writes info to file', () => {
      const logFile = join(tempDir, 'level.log');
      const logger = createLogger({ level: 'info', file: logFile });

      logger.info('test', 'info message');

      const content = readFileSync(logFile, 'utf-8');
      expect(content).toContain('info message');
    });

    test('info level logger writes warn to file', () => {
      const logFile = join(tempDir, 'level.log');
      const logger = createLogger({ level: 'info', file: logFile });

      logger.warn('test', 'warn message');

      const content = readFileSync(logFile, 'utf-8');
      expect(content).toContain('warn message');
    });

    test('info level logger writes error to file', () => {
      const logFile = join(tempDir, 'level.log');
      const logger = createLogger({ level: 'info', file: logFile });

      logger.error('test', 'error message');

      const content = readFileSync(logFile, 'utf-8');
      expect(content).toContain('error message');
    });

    test('info level logger does NOT write debug to file', () => {
      const logFile = join(tempDir, 'level.log');
      const logger = createLogger({ level: 'info', file: logFile });

      logger.debug('test', 'debug message');

      const exists = existsSync(logFile);
      if (exists) {
        const content = readFileSync(logFile, 'utf-8');
        expect(content).not.toContain('debug message');
      }
      // If file doesn't exist, that's also fine - debug was filtered
    });

    test('error level logger only writes error to file', () => {
      const logFile = join(tempDir, 'level.log');
      const logger = createLogger({ level: 'error', file: logFile });

      logger.debug('test', 'debug msg');
      logger.info('test', 'info msg');
      logger.warn('test', 'warn msg');
      logger.error('test', 'error msg');

      const content = readFileSync(logFile, 'utf-8');
      expect(content).toContain('error msg');
      expect(content).not.toContain('info msg');
      expect(content).not.toContain('warn msg');
      expect(content).not.toContain('debug msg');
    });

    test('debug level logger writes all levels to file', () => {
      const logFile = join(tempDir, 'level.log');
      const logger = createLogger({ level: 'debug', file: logFile });

      logger.debug('test', 'debug msg');
      logger.info('test', 'info msg');
      logger.warn('test', 'warn msg');
      logger.error('test', 'error msg');

      const content = readFileSync(logFile, 'utf-8');
      expect(content).toContain('debug msg');
      expect(content).toContain('info msg');
      expect(content).toContain('warn msg');
      expect(content).toContain('error msg');
    });
  });

  // ============================================================
  // File Logging Format (JSON Lines)
  // ============================================================

  describe('file logging format', () => {
    test('writes JSON Lines format', () => {
      const logFile = join(tempDir, 'format.log');
      const logger = createLogger({ level: 'info', file: logFile });

      logger.info('startup', 'Engine started');

      const content = readFileSync(logFile, 'utf-8').trim();
      const entry = JSON.parse(content);
      expect(entry.level).toBe('info');
      expect(entry.event).toBe('startup');
      expect(entry.message).toBe('Engine started');
      expect(entry.timestamp).toBeTruthy();
    });

    test('includes data when provided', () => {
      const logFile = join(tempDir, 'data.log');
      const logger = createLogger({ level: 'info', file: logFile });

      logger.info('metric', 'Token usage', { tokens: 1500, agent: 'architect' });

      const content = readFileSync(logFile, 'utf-8').trim();
      const entry = JSON.parse(content);
      expect(entry.data).toEqual({ tokens: 1500, agent: 'architect' });
    });

    test('does not include data when not provided', () => {
      const logFile = join(tempDir, 'nodata.log');
      const logger = createLogger({ level: 'info', file: logFile });

      logger.info('simple', 'No data');

      const content = readFileSync(logFile, 'utf-8').trim();
      const entry = JSON.parse(content);
      expect(entry.data).toBeUndefined();
    });

    test('does not include data when empty object', () => {
      const logFile = join(tempDir, 'empty.log');
      const logger = createLogger({ level: 'info', file: logFile });

      logger.info('simple', 'Empty data', {});

      const content = readFileSync(logFile, 'utf-8').trim();
      const entry = JSON.parse(content);
      expect(entry.data).toBeUndefined();
    });

    test('multiple log entries create multiple lines', () => {
      const logFile = join(tempDir, 'multi.log');
      const logger = createLogger({ level: 'info', file: logFile });

      logger.info('e1', 'First');
      logger.info('e2', 'Second');
      logger.info('e3', 'Third');

      const lines = readFileSync(logFile, 'utf-8')
        .trim()
        .split('\n');
      expect(lines.length).toBe(3);

      // Each line should be valid JSON
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });
  });

  // ============================================================
  // Scoped Loggers
  // ============================================================

  describe('scoped loggers', () => {
    test('agent() includes agent scope in file output', () => {
      const logFile = join(tempDir, 'agent.log');
      const logger = createLogger({ level: 'info', file: logFile });

      logger.agent('architect', 'start', 'Agent starting');

      const content = readFileSync(logFile, 'utf-8').trim();
      const entry = JSON.parse(content);
      expect(entry.agent).toBe('architect');
    });

    test('phase() includes phase scope in file output', () => {
      const logFile = join(tempDir, 'phase.log');
      const logger = createLogger({ level: 'info', file: logFile });

      logger.phase('execution', 'enter', 'Entering execution');

      const content = readFileSync(logFile, 'utf-8').trim();
      const entry = JSON.parse(content);
      expect(entry.phase).toBe('execution');
    });
  });

  // ============================================================
  // No file path (terminal only)
  // ============================================================

  describe('terminal-only logging', () => {
    test('does not throw when no file path is set', () => {
      const logger = createLogger({ level: 'info' });
      expect(() => {
        logger.info('test', 'terminal only');
        logger.warn('test', 'warning');
        logger.error('test', 'error');
        logger.debug('test', 'debug');
      }).not.toThrow();
    });
  });

  // ============================================================
  // createLogger factory
  // ============================================================

  describe('createLogger', () => {
    test('returns a Logger instance', () => {
      const logger = createLogger({ level: 'warn' });
      expect(logger).toBeInstanceOf(Logger);
    });
  });
});
