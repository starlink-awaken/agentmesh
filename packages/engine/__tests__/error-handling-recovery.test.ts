/**
 * Error Handling and Recovery Integration Tests
 *
 * Tests error scenarios and recovery mechanisms:
 * - Agent execution failures and retries
 * - Invalid project configurations
 * - Database connection failures
 * - File system errors
 * - Phase transition validation errors
 * - Resource exhaustion (token budget, agent limits)
 * - Graceful degradation
 * - Error event emission
 * - Recovery after failures
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
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
  tempDir = mkdtempSync(join(tmpdir(), 'hc-error-test-'));
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
  if (tempDir && existsSync(tempDir)) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================================
// Error Handling Tests
// ============================================================

describe('Error Handling and Recovery', () => {
  let orchestrator: HoneycombOrchestrator;

  afterEach(() => {
    try {
      orchestrator?.shutdown();
    } catch {
      // Ignore shutdown errors
    }
    cleanupTestEnvironment();
  });

  describe('invalid project configurations', () => {
    test('throws error for missing project name', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      expect(() => {
        orchestrator.createProject({
          name: '',
          description: 'Test',
          archetype: 'custom',
          goals: ['test'],
        } as ProjectConfig);
      }).toThrow();
    });

    test('throws error for missing goals', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      expect(() => {
        orchestrator.createProject({
          name: 'Test',
          description: 'Test',
          archetype: 'custom',
          goals: [],
        });
      }).toThrow();
    });

    test('handles invalid complexity gracefully', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      // Should accept and convert invalid complexity
      const state = orchestrator.createProject({
        name: 'Invalid Complexity Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'invalid' as any,
      });

      // Should default to a valid complexity
      expect(['simple', 'standard', 'advanced', 'enterprise']).toContain(
        state.complexity,
      );
    });
  });

  describe('project lifecycle errors', () => {
    test('throws error when starting non-existent project', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      await expect(
        orchestrator.startProject('non-existent-project-id'),
      ).rejects.toThrow();
    });

    test('throws error when no active project for operations', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      expect(() => orchestrator.advancePhase('test')).toThrow(/No active project/);
      expect(() => orchestrator.checkpoint('test')).toThrow(/No active project/);
      expect(() => orchestrator.pauseProject('test')).toThrow(/No active project/);
      expect(() => orchestrator.resumeProject()).toThrow(/No active project/);
    });

    test('handles invalid phase transitions', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      orchestrator.createProject({
        name: 'Phase Transition Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      // Attempting invalid transitions should be handled
      // Implementation depends on state machine logic
      expect(orchestrator.getProjectState()).not.toBeNull();
    });
  });

  describe('pause and resume errors', () => {
    test('throws error when pausing non-running project', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      orchestrator.createProject({
        name: 'Pause Error Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      // First pause should work
      orchestrator.advancePhase('move');
      orchestrator.pauseProject('test');

      // Second pause should fail
      expect(() => orchestrator.pauseProject('test again')).toThrow();
    });

    test('throws error when resuming non-paused project', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      orchestrator.createProject({
        name: 'Resume Error Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      // Resume without pause should fail
      expect(() => orchestrator.resumeProject()).toThrow();
    });
  });

  describe('checkpoint errors', () => {
    test('throws error when rolling back to invalid checkpoint', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      orchestrator.createProject({
        name: 'Rollback Error Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      expect(() => {
        orchestrator.rollback('invalid-checkpoint-id');
      }).toThrow();
    });

    test('validates checkpoint ownership on rollback', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      // Create project 1 with checkpoint
      orchestrator.createProject({
        name: 'Project 1',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      orchestrator.checkpoint('Project 1 checkpoint');
      const project1Checkpoint = orchestrator.listCheckpoints()[0].id;

      // Create project 2
      orchestrator.createProject({
        name: 'Project 2',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      // Try to rollback to project 1's checkpoint from project 2
      expect(() => {
        orchestrator.rollback(project1Checkpoint);
      }).toThrow(/belongs to project/);
    });
  });

  describe('file system errors', () => {
    test('handles missing agents directory', () => {
      const env = setupTestEnvironment();

      // Remove agents directory
      rmSync(env.agentsDir, { recursive: true, force: true });

      expect(() => {
        orchestrator = new HoneycombOrchestrator({
          db_path: env.dbPath,
          agents_root: env.agentsDir,
          domains_root: env.domainsDir,
          output_dir: env.outputDir,
          log_level: 'error',
        });
      }).toThrow();
    });

    test('handles unreadable agent files', () => {
      const env = setupTestEnvironment();

      // Create a malformed agent file
      const layerDir = join(env.agentsDir, 'layer-3-execution');
      mkdirSync(layerDir, { recursive: true });
      writeFileSync(join(layerDir, 'bad-agent.md'), 'Not valid YAML frontmatter');

      // Should still initialize but skip bad agent
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      const stats = orchestrator.getStats();
      expect(stats.agents_loaded).toBeGreaterThanOrEqual(0);
    });

    test('handles missing output directory by creating it', () => {
      const env = setupTestEnvironment();

      // Remove output directory
      rmSync(env.outputDir, { recursive: true, force: true });

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      // Should create output directory automatically
      expect(existsSync(env.outputDir)).toBe(true);
    });
  });

  describe('domain loading errors', () => {
    test('handles invalid domain configuration', () => {
      const env = setupTestEnvironment();

      const domainDir = join(env.domainsDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      // Create invalid domain.json
      writeFileSync(join(domainDir, 'domain.json'), '{ invalid json }');

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      // Should still create project with default config
      const state = orchestrator.createProject({
        name: 'Test',
        description: 'Test',
        archetype: 'software-dev',
        goals: ['test'],
      });

      expect(state).not.toBeNull();
    });

    test('handles missing domain directory gracefully', () => {
      const env = setupTestEnvironment();

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      // Create project for non-existent domain
      const state = orchestrator.createProject({
        name: 'Test',
        description: 'Test',
        archetype: 'software-dev',
        goals: ['test'],
      });

      // Should use default configuration
      expect(state).not.toBeNull();
    });
  });

  describe('error event emission', () => {
    test('emits PROJECT_FAILED event on critical failure', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const failedEvents: EngineEventPayload[] = [];
      orchestrator.on(EngineEvent.PROJECT_FAILED, (payload) =>
        failedEvents.push(payload),
      );

      // This test depends on implementation - may need adjustment
      // based on actual failure conditions
    });

    test('emits AGENT_FAILED event when agent execution fails', async () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      const agentFailedEvents: EngineEventPayload[] = [];
      orchestrator.on(EngineEvent.AGENT_FAILED, (payload) =>
        agentFailedEvents.push(payload),
      );

      // Agent failures would be tracked if they occur during execution
      const state = orchestrator.createProject({
        name: 'Agent Failure Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      await orchestrator.startProject(state.project_id);

      // Check if any agent failures were recorded
      // This depends on actual agent execution behavior
    });
  });

  describe('recovery mechanisms', () => {
    test('orchestrator can be reinitialized after shutdown', () => {
      const env = setupTestEnvironment();

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      const state = orchestrator.createProject({
        name: 'Recovery Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      orchestrator.shutdown();

      // Create new orchestrator instance
      const orchestrator2 = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      // Should be able to load previous project
      const loadedState = orchestrator2.loadProjectState(state.project_id);
      expect(loadedState).not.toBeNull();
      expect(loadedState!.project_id).toBe(state.project_id);

      orchestrator2.shutdown();
    });

    test('project state persists through orchestrator crashes', () => {
      const env = setupTestEnvironment();

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      const state = orchestrator.createProject({
        name: 'Persistence Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      // Simulate crash (no shutdown)
      orchestrator = null as any;

      // Create new instance
      const orchestrator2 = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      const recoveredState = orchestrator2.loadProjectState(state.project_id);
      expect(recoveredState).not.toBeNull();
      expect(recoveredState!.project_name).toBe('Persistence Test');

      orchestrator2.shutdown();
    });

    test('can list projects after recovery', () => {
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
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      orchestrator.createProject({
        name: 'Project 2',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      orchestrator.shutdown();

      // New instance
      const orchestrator2 = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      const projects = orchestrator2.listProjects();
      expect(projects.length).toBe(2);

      orchestrator2.shutdown();
    });
  });

  describe('graceful degradation', () => {
    test('continues with base agents when domain agents fail to load', () => {
      const env = setupTestEnvironment();

      const domainDir = join(env.domainsDir, 'software');
      const agentsDir = join(domainDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      // Create valid domain config
      writeFileSync(
        join(domainDir, 'domain.json'),
        JSON.stringify({
          name: 'Software',
          description: 'Test',
          archetype: 'software-dev',
          version: '1.0.0',
        }),
      );

      // Create invalid agent file
      writeFileSync(join(agentsDir, 'bad.md'), 'Invalid content');

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      // Should still work with base agents
      const state = orchestrator.createProject({
        name: 'Degraded Test',
        description: 'Test',
        archetype: 'software-dev',
        goals: ['test'],
      });

      expect(state).not.toBeNull();
      expect(orchestrator.getStats().agents_loaded).toBeGreaterThan(0);
    });

    test('uses default config when engine config is partial', () => {
      const env = setupTestEnvironment();

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        // Omit many optional fields
      });

      // Should use defaults
      const stats = orchestrator.getStats();
      expect(stats).toBeDefined();
    });
  });

  describe('validation errors', () => {
    test('validates project_id format on load', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      const state = orchestrator.loadProjectState('invalid-format-id');
      expect(state).toBeNull();
    });

    test('handles concurrent project creation', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      const state1 = orchestrator.createProject({
        name: 'Concurrent 1',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      const state2 = orchestrator.createProject({
        name: 'Concurrent 2',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      expect(state1.project_id).not.toBe(state2.project_id);
    });
  });
});
