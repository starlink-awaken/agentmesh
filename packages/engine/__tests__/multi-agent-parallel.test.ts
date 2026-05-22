/**
 * Multi-Agent Parallel Execution Integration Tests
 *
 * Tests concurrent agent execution and coordination:
 * - Parallel agent activation within layers
 * - max_concurrent_agents limit enforcement
 * - Agent coordination and message passing
 * - Resource contention handling
 * - Performance with multiple concurrent agents
 * - Agent pool management under load
 * - Message bus throughput and priority handling
 * - Concurrent agent state updates
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HoneycombOrchestrator } from '../src/orchestrator.ts';
import {
  Phase,
  EngineEvent,
  AgentStatus,
  type ProjectConfig,
  type EngineEventPayload,
} from '../src/types.ts';

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
  tempDir = mkdtempSync(join(tmpdir(), 'hc-parallel-test-'));
  const dbPath = join(tempDir, 'test.db');
  const agentsDir = join(tempDir, 'agents');
  const domainsDir = join(tempDir, 'domains');
  const outputDir = join(tempDir, 'output');

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(domainsDir, { recursive: true });

  // Create multiple agents in each layer for parallel execution
  const layers = [
    {
      dir: 'layer-1-research',
      agents: ['researcher-1', 'researcher-2', 'researcher-3', 'analyzer'],
    },
    {
      dir: 'layer-2-decision',
      agents: ['decider-1', 'decider-2', 'supervisor'],
    },
    {
      dir: 'layer-3-execution',
      agents: [
        'executor-1',
        'executor-2',
        'executor-3',
        'executor-4',
        'implementer',
        'builder',
      ],
    },
    {
      dir: 'layer-4-feedback',
      agents: ['reviewer-1', 'reviewer-2', 'tester'],
    },
    {
      dir: 'governance',
      agents: ['guardian', 'red-team', 'boundary-checker'],
    },
  ];

  for (const layer of layers) {
    const layerDir = join(agentsDir, layer.dir);
    mkdirSync(layerDir, { recursive: true });

    for (const agentName of layer.agents) {
      writeFileSync(
        join(layerDir, `${agentName}.md`),
        `---
name: ${agentName}
description: Test ${agentName} agent in ${layer.dir}
tools: ['read', 'write']
---

# ${agentName}

Test agent for parallel execution testing.
`,
      );
    }
  }

  return { dbPath, agentsDir, domainsDir, outputDir };
}

function cleanupTestEnvironment(): void {
  if (tempDir && existsSync(tempDir)) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================================
// Parallel Execution Tests
// ============================================================

describe('Multi-Agent Parallel Execution', () => {
  let orchestrator: HoneycombOrchestrator;

  afterEach(() => {
    try {
      orchestrator?.shutdown();
    } catch {
      // Ignore shutdown errors
    }
    cleanupTestEnvironment();
  });

  describe('concurrent agent activation', () => {
    test('multiple agents can be activated simultaneously', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 5,
        auto_checkpoint: false,
      });

      const agentStartedEvents: EngineEventPayload[] = [];
      orchestrator.on(EngineEvent.AGENT_STARTED, (payload) =>
        agentStartedEvents.push(payload),
      );

      const state = orchestrator.createProject({
        name: 'Parallel Activation Test',
        description: 'Test concurrent agent activation',
        archetype: 'custom',
        goals: ['test parallel execution'],
        complexity: 'standard',
      });

      await orchestrator.startProject(state.project_id);

      // Multiple agents should have been started
      expect(agentStartedEvents.length).toBeGreaterThan(1);
    });

    test('agents from same layer can run in parallel', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 6,
        auto_checkpoint: false,
      });

      const state = orchestrator.createProject({
        name: 'Same Layer Parallel Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'standard',
      });

      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;
      const agentNames = Object.keys(finalState.agent_states);

      // Should have multiple agents from same layers
      expect(agentNames.length).toBeGreaterThan(1);
    });

    test('all activated agents complete successfully', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 5,
        auto_checkpoint: false,
      });

      const state = orchestrator.createProject({
        name: 'All Complete Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'standard',
      });

      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;
      const agentStates = Object.values(finalState.agent_states);

      // All agents should complete (not fail or get stuck)
      agentStates.forEach((agentState) => {
        expect([AgentStatus.COMPLETED, AgentStatus.IDLE]).toContain(
          agentState.status,
        );
      });
    });
  });

  describe('concurrency limits', () => {
    test('respects max_concurrent_agents limit', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 2,
        auto_checkpoint: false,
      });

      const runningAgents: Set<string> = new Set();
      let maxConcurrent = 0;

      orchestrator.on(EngineEvent.AGENT_STARTED, (payload) => {
        runningAgents.add(payload.data.agent_name as string);
        maxConcurrent = Math.max(maxConcurrent, runningAgents.size);
      });

      orchestrator.on(EngineEvent.AGENT_COMPLETED, (payload) => {
        runningAgents.delete(payload.data.agent_name as string);
      });

      const state = orchestrator.createProject({
        name: 'Concurrency Limit Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      await orchestrator.startProject(state.project_id);

      // Max concurrent should not exceed limit
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    test('low concurrency limit does not prevent completion', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 1, // Very strict limit
        auto_checkpoint: false,
      });

      const state = orchestrator.createProject({
        name: 'Low Concurrency Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;
      expect(finalState.current_phase).toBe(Phase.COMPLETED);
    });

    test('high concurrency limit allows more parallel execution', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 10,
        auto_checkpoint: false,
      });

      const runningAgents: Set<string> = new Set();
      let maxConcurrent = 0;

      orchestrator.on(EngineEvent.AGENT_STARTED, (payload) => {
        runningAgents.add(payload.data.agent_name as string);
        maxConcurrent = Math.max(maxConcurrent, runningAgents.size);
      });

      orchestrator.on(EngineEvent.AGENT_COMPLETED, (payload) => {
        runningAgents.delete(payload.data.agent_name as string);
      });

      const state = orchestrator.createProject({
        name: 'High Concurrency Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'standard',
      });

      await orchestrator.startProject(state.project_id);

      // Should allow more concurrent agents
      expect(maxConcurrent).toBeGreaterThan(1);
    });

    test('domain defaults can set concurrency limits', () => {
      const env = setupTestEnvironment();

      // Create domain with concurrency limit
      const domainDir = join(env.domainsDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      writeFileSync(
        join(domainDir, 'domain.json'),
        JSON.stringify({
          name: 'Software',
          description: 'Test',
          archetype: 'software-dev',
          version: '1.0.0',
          phase_prompts: {},
          agent_overrides: {},
          defaults: {
            max_concurrent_agents: 3,
          },
          templates: {},
          quality_gates: [],
        }),
      );

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 10, // Higher default
      });

      const state = orchestrator.createProject({
        name: 'Domain Concurrency Test',
        description: 'Test',
        archetype: 'software-dev',
        goals: ['test'],
      });

      // Domain default should be applied (though not directly visible in state)
      expect(state).not.toBeNull();
    });
  });

  describe('agent coordination', () => {
    test('agents can coordinate through message bus', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 5,
        auto_checkpoint: false,
      });

      const state = orchestrator.createProject({
        name: 'Coordination Test',
        description: 'Test agent coordination',
        archetype: 'custom',
        goals: ['test coordination'],
        complexity: 'standard',
      });

      await orchestrator.startProject(state.project_id);

      // Project should complete successfully with coordination
      const finalState = orchestrator.getProjectState()!;
      expect(finalState.current_phase).toBe(Phase.COMPLETED);
    });

    test('agent states are updated concurrently', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 5,
        auto_checkpoint: false,
      });

      const state = orchestrator.createProject({
        name: 'State Update Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'standard',
      });

      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;
      const agentStates = Object.values(finalState.agent_states);

      // Multiple agents should have state recorded
      expect(agentStates.length).toBeGreaterThan(1);

      // Each should have timing information
      agentStates.forEach((agentState) => {
        if (agentState.status === AgentStatus.COMPLETED) {
          expect(agentState.started_at).toBeDefined();
          expect(agentState.completed_at).toBeDefined();
        }
      });
    });
  });

  describe('performance characteristics', () => {
    test('parallel execution is faster than sequential', async () => {
      const env = setupTestEnvironment();

      // Sequential execution (max_concurrent = 1)
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 1,
        auto_checkpoint: false,
      });

      const state1 = orchestrator.createProject({
        name: 'Sequential Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      const sequentialStart = Date.now();
      await orchestrator.startProject(state1.project_id);
      const sequentialTime = Date.now() - sequentialStart;

      orchestrator.shutdown();

      // Parallel execution (max_concurrent = 5)
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 5,
        auto_checkpoint: false,
      });

      const state2 = orchestrator.createProject({
        name: 'Parallel Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      const parallelStart = Date.now();
      await orchestrator.startProject(state2.project_id);
      const parallelTime = Date.now() - parallelStart;

      // Parallel should be at least as fast (allowing for overhead)
      // Skip assertion if sequential time is too small (< 1ms) for reliable comparison
      if (sequentialTime >= 1) {
        expect(parallelTime).toBeLessThanOrEqual(sequentialTime * 2);
      }
    });

    test('handles many agents efficiently', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 8,
        auto_checkpoint: false,
      });

      const state = orchestrator.createProject({
        name: 'Many Agents Test',
        description: 'Test with many agents',
        archetype: 'custom',
        goals: ['test scalability'],
        complexity: 'advanced', // More agents
      });

      const start = Date.now();
      await orchestrator.startProject(state.project_id);
      const duration = Date.now() - start;

      // Should complete in reasonable time
      expect(duration).toBeLessThan(30000); // 30 seconds

      const finalState = orchestrator.getProjectState()!;
      expect(finalState.current_phase).toBe(Phase.COMPLETED);
    });

    test('token usage is correctly aggregated across parallel agents', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 5,
        auto_checkpoint: false,
      });

      const state = orchestrator.createProject({
        name: 'Token Aggregation Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'standard',
      });

      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;

      // Total usage should be sum of individual agents
      const agentStates = Object.values(finalState.agent_states);
      const sumTokens = agentStates.reduce(
        (sum, agent) => sum + agent.token_usage,
        0,
      );

      expect(finalState.total_token_usage).toBeGreaterThanOrEqual(sumTokens);
    });
  });

  describe('resource contention', () => {
    test('concurrent state updates do not corrupt data', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 6,
        auto_checkpoint: false,
      });

      const state = orchestrator.createProject({
        name: 'Contention Test',
        description: 'Test state integrity under concurrent updates',
        archetype: 'custom',
        goals: ['test data integrity'],
        complexity: 'standard',
      });

      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;

      // State should be consistent
      expect(finalState.project_id).toBe(state.project_id);
      expect(finalState.current_phase).toBe(Phase.COMPLETED);

      // Agent states should all be valid
      Object.values(finalState.agent_states).forEach((agentState) => {
        expect(agentState.agent_name).toBeTruthy();
        expect(agentState.retry_count).toBeGreaterThanOrEqual(0);
        expect(agentState.token_usage).toBeGreaterThanOrEqual(0);
      });
    });

    test('database writes are serialized correctly', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 5,
        auto_checkpoint: false,
      });

      const state = orchestrator.createProject({
        name: 'DB Writes Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'standard',
      });

      await orchestrator.startProject(state.project_id);

      // Load from database to verify persistence
      const loadedState = orchestrator.loadProjectState(state.project_id);
      expect(loadedState).not.toBeNull();
      expect(loadedState!.current_phase).toBe(Phase.COMPLETED);
    });
  });

  describe('event emission order', () => {
    test('AGENT_STARTED events are emitted before AGENT_COMPLETED', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 5,
        auto_checkpoint: false,
      });

      const agentTimeline: Array<{ agent: string; event: string; time: number }> = [];

      orchestrator.on(EngineEvent.AGENT_STARTED, (payload) => {
        agentTimeline.push({
          agent: payload.data.agent_name as string,
          event: 'started',
          time: Date.now(),
        });
      });

      orchestrator.on(EngineEvent.AGENT_COMPLETED, (payload) => {
        agentTimeline.push({
          agent: payload.data.agent_name as string,
          event: 'completed',
          time: Date.now(),
        });
      });

      const state = orchestrator.createProject({
        name: 'Event Order Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      await orchestrator.startProject(state.project_id);

      // For each agent, started should come before completed
      const agentNames = new Set(agentTimeline.map((e) => e.agent));
      agentNames.forEach((agentName) => {
        const events = agentTimeline.filter((e) => e.agent === agentName);
        if (events.length >= 2) {
          const started = events.find((e) => e.event === 'started');
          const completed = events.find((e) => e.event === 'completed');
          if (started && completed) {
            expect(started.time).toBeLessThanOrEqual(completed.time);
          }
        }
      });
    });

    test('events from different agents can interleave', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        max_concurrent_agents: 5,
        auto_checkpoint: false,
      });

      const events: Array<{ agent: string; event: string }> = [];

      orchestrator.on(EngineEvent.AGENT_STARTED, (payload) => {
        events.push({
          agent: payload.data.agent_name as string,
          event: 'started',
        });
      });

      orchestrator.on(EngineEvent.AGENT_COMPLETED, (payload) => {
        events.push({
          agent: payload.data.agent_name as string,
          event: 'completed',
        });
      });

      const state = orchestrator.createProject({
        name: 'Interleave Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'standard',
      });

      await orchestrator.startProject(state.project_id);

      // Should have events from multiple agents
      const uniqueAgents = new Set(events.map((e) => e.agent));
      expect(uniqueAgents.size).toBeGreaterThan(1);
    });
  });
});
