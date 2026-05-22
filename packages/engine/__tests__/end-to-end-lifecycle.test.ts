/**
 * End-to-End Project Lifecycle Integration Tests
 *
 * Tests complete project workflows from creation through delivery:
 * - Full phase progression (INIT → RESEARCH → DECISION → EXECUTION → FEEDBACK → DELIVERY → COMPLETED)
 * - Agent activation and state tracking
 * - Artifact generation and persistence
 * - Decision tracking and history
 * - Token budget consumption
 * - Event emission throughout lifecycle
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
  DecisionPath,
  RiskLevel,
  type ProjectConfig,
  type EngineEventPayload,
} from '../src/types.ts';

// ============================================================
// Test Setup Helpers
// ============================================================

let tempDir: string;

function setupTestEnvironment(): {
  dbPath: string;
  agentsDir: string;
  domainsDir: string;
  outputDir: string;
} {
  tempDir = mkdtempSync(join(tmpdir(), 'hc-e2e-test-'));
  const dbPath = join(tempDir, 'test.db');
  const agentsDir = join(tempDir, 'agents');
  const domainsDir = join(tempDir, 'domains');
  const outputDir = join(tempDir, 'output');

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(domainsDir, { recursive: true });

  // Create minimal agent structure for all layers
  const layers = [
    { dir: 'layer-1-research', agents: ['researcher', 'analyzer'] },
    { dir: 'layer-2-decision', agents: ['decider', 'supervisor'] },
    { dir: 'layer-3-execution', agents: ['executor', 'implementer', 'builder'] },
    { dir: 'layer-4-feedback', agents: ['reviewer', 'tester'] },
    { dir: 'governance', agents: ['guardian', 'red-team'] },
  ];

  for (const layer of layers) {
    const layerDir = join(agentsDir, layer.dir);
    mkdirSync(layerDir, { recursive: true });

    for (const agentName of layer.agents) {
      writeFileSync(
        join(layerDir, `${agentName}.md`),
        `---
name: ${agentName}
description: Test ${agentName} agent for ${layer.dir}
tools: ['read', 'write', 'execute']
---

# ${agentName}

Test agent for integration testing.
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
// End-to-End Lifecycle Tests
// ============================================================

describe('End-to-End Project Lifecycle', () => {
  let orchestrator: HoneycombOrchestrator;

  afterEach(() => {
    try {
      orchestrator?.shutdown();
    } catch {
      // Ignore shutdown errors
    }
    cleanupTestEnvironment();
  });

  describe('complete lifecycle execution', () => {
    test('project progresses through all phases to completion', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const projectConfig: ProjectConfig = {
        name: 'E2E Test Project',
        description: 'Full lifecycle test',
        archetype: 'custom',
        goals: ['Complete all phases', 'Test full workflow'],
        complexity: 'simple', // Use simple for faster test execution
      };

      const initialState = orchestrator.createProject(projectConfig);
      expect(initialState.current_phase).toBe(Phase.INIT);

      await orchestrator.startProject(initialState.project_id);

      const finalState = orchestrator.getProjectState();
      expect(finalState).not.toBeNull();
      expect(finalState!.current_phase).toBe(Phase.COMPLETED);
      expect(finalState!.completed_at).toBeGreaterThan(0);
    });

    test('phase history is recorded correctly', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const projectConfig: ProjectConfig = {
        name: 'Phase History Test',
        description: 'Test phase history tracking',
        archetype: 'custom',
        // Use multiple goals to ensure STANDARD path (which includes RESEARCH)
        goals: ['Track phase transitions', 'Verify all phases execute', 'Document phase flow'],
        complexity: 'standard',
      };

      const state = orchestrator.createProject(projectConfig);
      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;
      expect(finalState.phase_history.length).toBeGreaterThan(0);

      // Verify phase transitions are logged
      const phases = finalState.phase_history.map((h) => h.to);
      expect(phases).toContain(Phase.EXECUTION);
    });

    test('token usage is tracked and accumulates', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const projectConfig: ProjectConfig = {
        name: 'Token Usage Test',
        description: 'Test token tracking',
        archetype: 'custom',
        goals: ['Track token usage'],
        complexity: 'simple',
      };

      const state = orchestrator.createProject(projectConfig);
      const initialTokens = state.total_token_usage;

      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;
      expect(finalState.total_token_usage).toBeGreaterThan(initialTokens);
    });

    test('agents are activated and complete their tasks', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const projectConfig: ProjectConfig = {
        name: 'Agent Activation Test',
        description: 'Test agent lifecycle',
        archetype: 'custom',
        goals: ['Test agents'],
        complexity: 'simple',
      };

      const state = orchestrator.createProject(projectConfig);
      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;
      const agentNames = Object.keys(finalState.agent_states);

      // Should have some agents activated
      expect(agentNames.length).toBeGreaterThan(0);

      // Check at least one agent completed successfully
      const completedAgents = Object.values(finalState.agent_states).filter(
        (s) => s.status === AgentStatus.COMPLETED,
      );
      expect(completedAgents.length).toBeGreaterThan(0);
    });
  });

  describe('event emission during lifecycle', () => {
    test('PROJECT_CREATED event is emitted on creation', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      const events: EngineEventPayload[] = [];
      orchestrator.on(EngineEvent.PROJECT_CREATED, (payload) =>
        events.push(payload),
      );

      orchestrator.createProject({
        name: 'Event Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      expect(events.length).toBe(1);
      expect(events[0].event).toBe(EngineEvent.PROJECT_CREATED);
      expect(events[0].data.project_id).toBeTruthy();
    });

    test('PHASE_ENTERED events are emitted during execution', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const phaseEvents: EngineEventPayload[] = [];
      orchestrator.on(EngineEvent.PHASE_ENTERED, (payload) =>
        phaseEvents.push(payload),
      );

      const state = orchestrator.createProject({
        name: 'Phase Events Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      await orchestrator.startProject(state.project_id);

      expect(phaseEvents.length).toBeGreaterThan(0);

      // Verify events contain phase information
      phaseEvents.forEach((event) => {
        expect(event.data.phase).toBeTruthy();
        expect(event.data.project_id).toBe(state.project_id);
      });
    });

    test('PROJECT_COMPLETED event is emitted on completion', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const completedEvents: EngineEventPayload[] = [];
      orchestrator.on(EngineEvent.PROJECT_COMPLETED, (payload) =>
        completedEvents.push(payload),
      );

      const state = orchestrator.createProject({
        name: 'Completion Event Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      await orchestrator.startProject(state.project_id);

      expect(completedEvents.length).toBe(1);
      expect(completedEvents[0].event).toBe(EngineEvent.PROJECT_COMPLETED);
    });

    test('AGENT_STARTED and AGENT_COMPLETED events are emitted', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const agentStartedEvents: EngineEventPayload[] = [];
      const agentCompletedEvents: EngineEventPayload[] = [];

      orchestrator.on(EngineEvent.AGENT_STARTED, (payload) =>
        agentStartedEvents.push(payload),
      );
      orchestrator.on(EngineEvent.AGENT_COMPLETED, (payload) =>
        agentCompletedEvents.push(payload),
      );

      const state = orchestrator.createProject({
        name: 'Agent Events Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      await orchestrator.startProject(state.project_id);

      expect(agentStartedEvents.length).toBeGreaterThan(0);
      expect(agentCompletedEvents.length).toBeGreaterThan(0);
    });
  });

  describe('state persistence during lifecycle', () => {
    test('project state is persisted to database', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const projectConfig: ProjectConfig = {
        name: 'Persistence Test',
        description: 'Test state persistence',
        archetype: 'custom',
        goals: ['test persistence'],
        complexity: 'simple',
      };

      const state = orchestrator.createProject(projectConfig);
      await orchestrator.startProject(state.project_id);

      // Create new orchestrator instance to verify persistence
      const orchestrator2 = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      const loadedState = orchestrator2.loadProjectState(state.project_id);
      expect(loadedState).not.toBeNull();
      expect(loadedState!.project_id).toBe(state.project_id);
      expect(loadedState!.current_phase).toBe(Phase.COMPLETED);

      orchestrator2.shutdown();
    });

    test('project can be listed after creation', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      orchestrator.createProject({
        name: 'Project 1',
        description: 'First project',
        archetype: 'custom',
        goals: ['test'],
      });

      orchestrator.createProject({
        name: 'Project 2',
        description: 'Second project',
        archetype: 'custom',
        goals: ['test'],
      });

      const projects = orchestrator.listProjects();
      expect(projects.length).toBe(2);
      expect(projects.map((p) => p.project_name)).toContain('Project 1');
      expect(projects.map((p) => p.project_name)).toContain('Project 2');
    });
  });

  describe('complexity-based execution paths', () => {
    test('simple complexity skips L1/L2 phases', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const state = orchestrator.createProject({
        name: 'Simple Path Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;

      // Simple projects should use EXPRESS or QUICK path
      expect([DecisionPath.EXPRESS, DecisionPath.QUICK]).toContain(
        finalState.decision_path,
      );
    });

    test('standard complexity uses full pipeline', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const state = orchestrator.createProject({
        name: 'Standard Path Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'standard',
      });

      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;
      expect(finalState.decision_path).toBe(DecisionPath.STANDARD);
    });
  });

  describe('trace ID propagation', () => {
    test('trace_id is generated and persists throughout lifecycle', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const state = orchestrator.createProject({
        name: 'Trace ID Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      const initialTraceId = state.trace_id;
      expect(initialTraceId).toBeTruthy();
      expect(initialTraceId).toMatch(/^hc-\d+-[0-9a-f]{4}$/);

      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;
      expect(finalState.trace_id).toBe(initialTraceId);
    });
  });
});
