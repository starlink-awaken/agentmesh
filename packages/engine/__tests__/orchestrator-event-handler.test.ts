/**
 * Orchestrator Event Handler Error Handling Tests
 *
 * Tests error handling in event emission, particularly:
 * - Synchronous event handler errors
 * - Asynchronous event handler errors (lines 974-977)
 * - Event handler registration/unregistration
 * - Multiple event handlers for the same event
 * - Event handler error logging
 *
 * TDD: Tests written to cover previously untested error paths.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HoneycombOrchestrator } from '../src/orchestrator.ts';
import { EngineEvent, Phase } from '../src/types.ts';

// ============================================================
// Test Setup
// ============================================================

let tempDir: string;

function setupTestEnvironment(): {
  dbPath: string;
  agentsDir: string;
  domainsDir: string;
  outputDir: string;
} {
  tempDir = mkdtempSync(join(tmpdir(), 'hc-event-test-'));
  const dbPath = join(tempDir, 'test.db');
  const agentsDir = join(tempDir, 'agents');
  const domainsDir = join(tempDir, 'domains');
  const outputDir = join(tempDir, 'output');

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(domainsDir, { recursive: true });

  // Create minimal agent structure
  const layers = [
    { dir: 'layer-1-research', name: 'researcher' },
    { dir: 'layer-2-decision', name: 'decider' },
    { dir: 'layer-3-execution', name: 'executor' },
    { dir: 'layer-4-feedback', name: 'reviewer' },
  ];

  for (const layer of layers) {
    const layerDir = join(agentsDir, layer.dir);
    mkdirSync(layerDir, { recursive: true });
    writeFileSync(
      join(layerDir, `${layer.name}.md`),
      `---
name: ${layer.name}
description: Test ${layer.name}
tools: ['read']
---

# ${layer.name}
`,
    );
  }

  return { dbPath, agentsDir, domainsDir, outputDir };
}

function cleanupTestEnvironment(): void {
  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================================
// Event Handler Error Tests
// ============================================================

describe('Orchestrator Event Handler Error Handling', () => {
  let orchestrator: HoneycombOrchestrator;
  let errorLogs: Array<{ level: string; code: string; message: string }> = [];

  // Mock logger to capture error logs
  function captureErrorLogs(): void {
    errorLogs = [];
    const originalError = orchestrator['logger'].error;
    orchestrator['logger'].error = function (code: string, message: string) {
      errorLogs.push({ level: 'error', code, message });
      originalError.call(this, code, message);
    };
  }

  beforeEach(() => {
    const env = setupTestEnvironment();
    orchestrator = new HoneycombOrchestrator({
      db_path: env.dbPath,
      agents_root: env.agentsDir,
      domains_root: env.domainsDir,
      output_dir: env.outputDir,
      log_level: 'error',
      auto_checkpoint: false,
    });

    // Create a project to enable project operations
    orchestrator.createProject({
      name: 'Event Test Project',
      description: 'Testing event handlers',
      archetype: 'custom',
      goals: ['test event handling'],
    });
  });

  afterEach(() => {
    try {
      orchestrator?.shutdown();
    } catch {
      // Ignore shutdown errors
    }
    cleanupTestEnvironment();
  });

  // ============================================================
  // Synchronous Error Handler Tests
  // ============================================================

  describe('synchronous event handler errors', () => {
    test('catches and logs synchronous handler errors', () => {
      captureErrorLogs();

      // Register a handler that throws synchronously
      orchestrator.on(EngineEvent.PROJECT_CREATED, () => {
        throw new Error('Sync handler error');
      });

      // Trigger the event by creating another project
      expect(() => {
        orchestrator.createProject({
          name: 'Another Project',
          description: 'Test',
          archetype: 'custom',
          goals: ['test'],
        });
      }).not.toThrow();

      // Verify error was logged
      expect(errorLogs.length).toBeGreaterThan(0);
      const syncError = errorLogs.find(
        (log) => log.code === 'event:handler-error' && log.message.includes('Sync event handler error')
      );
      expect(syncError).toBeDefined();
      expect(syncError!.message).toContain('project:created');
    });

    test('continues executing other handlers after synchronous error', () => {
      captureErrorLogs();
      const executionOrder: string[] = [];

      // Register multiple handlers - middle one will fail
      orchestrator.on(EngineEvent.PROJECT_CREATED, () => {
        executionOrder.push('handler1');
      });

      orchestrator.on(EngineEvent.PROJECT_CREATED, () => {
        executionOrder.push('handler2-error');
        throw new Error('Handler 2 failed');
      });

      orchestrator.on(EngineEvent.PROJECT_CREATED, () => {
        executionOrder.push('handler3');
      });

      // Trigger event by creating a project
      orchestrator.createProject({
        name: 'Handler Error Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      // All handlers should execute despite error in handler2
      expect(executionOrder).toEqual(['handler1', 'handler2-error', 'handler3']);
      expect(errorLogs.some((log) => log.message.includes('Sync event handler error'))).toBe(true);
    });

    test('handles multiple handlers with mixed sync/async behavior', async () => {
      captureErrorLogs();
      const results: string[] = [];

      // Mix of sync and async handlers
      orchestrator.on(EngineEvent.AGENT_STARTED, () => {
        results.push('sync1');
      });

      orchestrator.on(EngineEvent.AGENT_STARTED, async () => {
        results.push('async1');
        await Promise.resolve();
      });

      orchestrator.on(EngineEvent.AGENT_STARTED, () => {
        results.push('sync2');
        throw new Error('Sync error');
      });

      orchestrator.on(EngineEvent.AGENT_STARTED, async () => {
        results.push('async2');
        await Promise.resolve();
      });

      // Trigger event
      orchestrator.emit = orchestrator['emit'].bind(orchestrator);
      // Access private emit method via type assertion
      (orchestrator as any).emit(EngineEvent.AGENT_STARTED, { agent_name: 'test' });

      // Give async handlers time to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // All handlers should execute
      expect(results).toContain('sync1');
      expect(results).toContain('async1');
      expect(results).toContain('sync2');
      expect(results).toContain('async2');
    });
  });

  // ============================================================
  // Asynchronous Error Handler Tests (Lines 974-977)
  // ============================================================

  describe('asynchronous event handler errors (lines 974-977)', () => {
    test('catches and logs rejected promises from async handlers', async () => {
      captureErrorLogs();

      // Register an async handler that rejects
      orchestrator.on(EngineEvent.PROJECT_CREATED, async () => {
        throw new Error('Async handler rejection');
      });

      // Trigger event
      orchestrator.createProject({
        name: 'Async Error Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      // Wait for async error to be caught
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify error was logged
      const asyncError = errorLogs.find(
        (log) => log.code === 'event:handler-error' && log.message.includes('Async event handler error')
      );
      expect(asyncError).toBeDefined();
      expect(asyncError!.message).toContain('project:created');
      expect(asyncError!.message).toContain('Async handler rejection');
    });

    test('catches and logged explicitly rejected promises', async () => {
      captureErrorLogs();

      // Register an async handler that explicitly rejects
      orchestrator.on(EngineEvent.CHECKPOINT_CREATED, async () => {
        return Promise.reject(new Error('Explicit rejection'));
      });

      // Trigger event
      orchestrator.checkpoint('test checkpoint');

      // Wait for async error to be caught
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify error was logged
      const asyncError = errorLogs.find(
        (log) => log.code === 'event:handler-error' && log.message.includes('Async event handler error')
      );
      expect(asyncError).toBeDefined();
      expect(asyncError!.message).toContain('Explicit rejection');
      expect(asyncError!.message).toContain('checkpoint:created');
    });

    test('handles async handlers that throw after await', async () => {
      captureErrorLogs();

      orchestrator.on(EngineEvent.AGENT_COMPLETED, async () => {
        await Promise.resolve();
        throw new Error('Post-await error');
      });

      // Trigger event
      (orchestrator as any).emit(EngineEvent.AGENT_COMPLETED, { agent_name: 'test' });

      // Wait for async error to be caught
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify error was logged
      const asyncError = errorLogs.find(
        (log) => log.code === 'event:handler-error' && log.message.includes('Async event handler error')
      );
      expect(asyncError).toBeDefined();
      expect(asyncError!.message).toContain('Post-await error');
      expect(asyncError!.message).toContain('agent:completed');
    });

    test('continues after async handler rejection', async () => {
      captureErrorLogs();
      const executionOrder: string[] = [];

      // Register multiple async handlers - middle one rejects
      orchestrator.on(EngineEvent.PROJECT_STARTED, async () => {
        executionOrder.push('async1');
      });

      orchestrator.on(EngineEvent.PROJECT_STARTED, async () => {
        executionOrder.push('async2-error');
        throw new Error('Async handler 2 error');
      });

      orchestrator.on(EngineEvent.PROJECT_STARTED, async () => {
        executionOrder.push('async3');
      });

      // Trigger event
      await orchestrator.startProject(orchestrator.getProjectState()!.project_id);

      // Wait for all async handlers
      await new Promise((resolve) => setTimeout(resolve, 50));

      // All handlers should execute
      expect(executionOrder).toContain('async1');
      expect(executionOrder).toContain('async2-error');
      expect(executionOrder).toContain('async3');
    });

    test('handles mixed sync and async handlers with errors', async () => {
      captureErrorLogs();
      const syncErrors: string[] = [];
      const asyncErrors: string[] = [];

      // Sync handler that throws
      orchestrator.on(EngineEvent.PROJECT_COMPLETED, () => {
        syncErrors.push('sync-error');
        throw new Error('Sync error');
      });

      // Async handler that rejects
      orchestrator.on(EngineEvent.PROJECT_COMPLETED, async () => {
        asyncErrors.push('async-error');
        throw new Error('Async error');
      });

      // Trigger event
      (orchestrator as any).emit(EngineEvent.PROJECT_COMPLETED, {});

      // Wait for async errors
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Both errors should be logged
      expect(syncErrors).toEqual(['sync-error']);
      expect(asyncErrors).toEqual(['async-error']);

      // Check error logs contain both sync and async error messages
      const hasSyncError = errorLogs.some(
        (log) => log.message.includes('Sync event handler error')
      );
      const hasAsyncError = errorLogs.some(
        (log) => log.message.includes('Async event handler error')
      );
      expect(hasSyncError).toBe(true);
      expect(hasAsyncError).toBe(true);
    });
  });

  // ============================================================
  // Event Handler Registration Tests
  // ============================================================

  describe('event handler registration and lifecycle', () => {
    test('registers and executes single event handler', () => {
      let executed = false;
      orchestrator.on(EngineEvent.PROJECT_CREATED, () => {
        executed = true;
      });

      orchestrator.createProject({
        name: 'Handler Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      expect(executed).toBe(true);
    });

    test('registers multiple handlers for same event', () => {
      const executionOrder: string[] = [];

      orchestrator.on(EngineEvent.PROJECT_CREATED, () => {
        executionOrder.push('handler1');
      });

      orchestrator.on(EngineEvent.PROJECT_CREATED, () => {
        executionOrder.push('handler2');
      });

      orchestrator.on(EngineEvent.PROJECT_CREATED, () => {
        executionOrder.push('handler3');
      });

      orchestrator.createProject({
        name: 'Handler Order Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      expect(executionOrder).toEqual(['handler1', 'handler2', 'handler3']);
    });

    test('unregisters event handler using returned unsubscribe function', () => {
      let executionCount = 0;

      const handler = () => {
        executionCount++;
      };

      const unsubscribe = orchestrator.on(EngineEvent.PROJECT_CREATED, handler);
      orchestrator.createProject({
        name: 'Test 1',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });
      expect(executionCount).toBe(1);

      unsubscribe();
      orchestrator.createProject({
        name: 'Test 2',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });
      expect(executionCount).toBe(1); // Should not increment again
    });

    test('calling unsubscribe multiple times is safe', () => {
      const handler = () => {};
      const unsubscribe = orchestrator.on(EngineEvent.PROJECT_CREATED, handler);

      expect(() => {
        unsubscribe();
        unsubscribe(); // Second call should be safe
      }).not.toThrow();
    });

    test('handlers remain registered after registration', () => {
      let executed = false;
      orchestrator.on(EngineEvent.PROJECT_CREATED, () => {
        executed = true;
      });

      orchestrator.createProject({
        name: 'Handler Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      expect(executed).toBe(true);
    });
  });

  // ============================================================
  // Event Payload Tests
  // ============================================================

  describe('event payload structure', () => {
    test('includes correct event type in payload', () => {
      let capturedEvent: EngineEvent | null = null;

      orchestrator.on(EngineEvent.PHASE_ENTERED, (payload) => {
        capturedEvent = payload.event;
      });

      orchestrator.advancePhase('move');

      expect(capturedEvent).toBe(EngineEvent.PHASE_ENTERED);
    });

    test('includes timestamp in payload', () => {
      let capturedTimestamp: number | null = null;
      const beforeTime = Date.now();

      orchestrator.on(EngineEvent.PHASE_ENTERED, (payload) => {
        capturedTimestamp = payload.timestamp;
      });

      orchestrator.advancePhase('move');

      expect(capturedTimestamp).not.toBeNull();
      expect(capturedTimestamp!).toBeGreaterThanOrEqual(beforeTime);
      expect(capturedTimestamp!).toBeLessThanOrEqual(Date.now());
    });

    test('includes project_id in payload when project exists', () => {
      let capturedProjectId: string | null = null;

      orchestrator.on(EngineEvent.PHASE_ENTERED, (payload) => {
        capturedProjectId = payload.project_id;
      });

      orchestrator.advancePhase('move');

      expect(capturedProjectId).not.toBeNull();
      expect(capturedProjectId).toBe(orchestrator.getProjectState()!.project_id);
    });

    test('includes data in payload', () => {
      let capturedData: Record<string, unknown> | null = null;

      orchestrator.on(EngineEvent.PROJECT_CREATED, (payload) => {
        capturedData = payload.data;
      });

      orchestrator.createProject({
        name: 'Data Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      expect(capturedData).not.toBeNull();
      expect(capturedData!.project_id).toBeDefined();
      expect(typeof capturedData!.project_id).toBe('string');
    });
  });

  // ============================================================
  // Error Recovery Tests
  // ============================================================

  describe('error recovery and resilience', () => {
    test('orchestrator remains functional after handler errors', () => {
      captureErrorLogs();

      // Register error-prone handler
      orchestrator.on(EngineEvent.PROJECT_CREATED, () => {
        throw new Error('Handler error');
      });

      // Trigger error
      orchestrator.createProject({
        name: 'Recovery Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      // Orchestrator should still function
      expect(errorLogs.length).toBeGreaterThan(0);

      const state = orchestrator.getProjectState();
      expect(state).not.toBeNull();
      expect(state!.project_name).toBe('Recovery Test');
    });

    test('can register new handlers after errors', () => {
      captureErrorLogs();

      // Register failing handler
      orchestrator.on(EngineEvent.PROJECT_CREATED, () => {
        throw new Error('First error');
      });

      orchestrator.createProject({
        name: 'First Project',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      // Register new handler after error
      let newHandlerExecuted = false;
      orchestrator.on(EngineEvent.PROJECT_CREATED, () => {
        newHandlerExecuted = true;
      });

      orchestrator.createProject({
        name: 'Second Project',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      expect(newHandlerExecuted).toBe(true);
    });

    test('error in one event type does not affect other event types', () => {
      captureErrorLogs();

      orchestrator.on(EngineEvent.PROJECT_CREATED, () => {
        throw new Error('Project created error');
      });

      // Trigger error on one event
      orchestrator.createProject({
        name: 'Error Project',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      // Other events should still work
      let otherEventExecuted = false;
      orchestrator.on(EngineEvent.CHECKPOINT_CREATED, () => {
        otherEventExecuted = true;
      });

      orchestrator.checkpoint('test');

      expect(otherEventExecuted).toBe(true);
    });
  });
});
