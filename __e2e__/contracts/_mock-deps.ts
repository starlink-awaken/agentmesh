/**
 * Shared mock dependencies for bridge contract tests.
 *
 * Provides a createMockDeps() factory to produce controlled MCPServerDeps
 * objects so contract tests verify response shapes without calling real services.
 */

import { mock } from 'bun:test';
import type { MCPServerDeps } from '../../apps/server/src/mcp/index.js';

/**
 * Create a mock MCPServerDeps object with default stub implementations.
 * Override any property via the overrides parameter.
 */
export function createMockDeps(overrides: Partial<MCPServerDeps> = {}): MCPServerDeps {
  return {
    discoverer: {
      discoverAll: () => Promise.resolve([]),
      anyAlive: () => Promise.resolve(false),
      refresh: () => {},
    } as any,
    registry: {
      chat: () => Promise.resolve({
        id: 'resp-1',
        model: 'mock-model',
        content: 'Hello from mock',
        finishReason: 'stop',
      }),
      chatStream: () => (async function* () {})(),
      get: (_id: string) => null,
      getAll: () => [],
      refresh: () => {},
    } as any,
    scheduler: {
      selectModel: () => Promise.resolve({
        model: { id: 'gpt-4', provider: 'openai', capabilities: ['chat'] } as any,
        providerName: 'openai',
        confidence: 0.95,
        reasoning: 'Best available model',
      }),
    } as any,
    taskManager: {
      createTask: () => Promise.resolve({ id: 'task-mock-001', status: 'pending' }),
      getTask: (taskId: string) =>
        taskId === 'task-existing'
          ? { id: 'task-existing', status: 'completed', createdAt: 1000 }
          : undefined,
      getAllTasks: () => [
        { id: 't1', status: 'completed', createdAt: 1000 },
        { id: 't2', status: 'running', createdAt: 2000 },
      ],
      cancelTask: () => true,
      processTask: () => Promise.resolve({ id: 'task-mock-001', status: 'pending' }),
    } as any,
    skillLoader: {
      getAll: () => [
        { id: 's1', name: 'Code Review', category: 'development' },
        { id: 's2', name: 'Data Analysis', category: 'data' },
      ],
      search: (_task: string) => [
        { id: 's1', name: 'Code Review', score: 0.9 },
      ],
    } as any,
    skillController: {
      execute: () => Promise.resolve({ success: true, output: 'Skill executed' }),
    } as any,
    metricsCollector: {
      snapshot: () => ({
        counters: { requests: 100 },
        gauges: { memory_mb: 512 },
        timers: {
          avg_latency: { count: 10, min: 50, max: 500, avg: 250, p50: 200, p95: 450, p99: 490 },
        },
        histograms: {},
        timestamp: 1234567890,
      }),
    } as any,
    ...overrides,
  };
}
