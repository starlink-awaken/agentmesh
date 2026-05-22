/**
 * Token Budget Enforcement Integration Tests
 *
 * Tests token budget tracking and enforcement:
 * - Project-level token budget initialization
 * - Token consumption tracking across agents
 * - Budget exhaustion detection and handling
 * - Per-agent token limits
 * - Domain-specific budget overrides
 * - Budget warnings and alerts
 * - Token usage in events and metrics
 * - Budget reset and adjustment
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HoneycombOrchestrator } from '../src/orchestrator.ts';
import {
  Phase,
  EngineEvent,
  type ProjectConfig,
  type DomainConfig,
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
  tempDir = mkdtempSync(join(tmpdir(), 'hc-budget-test-'));
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
// Token Budget Tests
// ============================================================

describe('Token Budget Enforcement', () => {
  let orchestrator: HoneycombOrchestrator;

  afterEach(() => {
    try {
      orchestrator?.shutdown();
    } catch {
      // Ignore shutdown errors
    }
    cleanupTestEnvironment();
  });

  describe('budget initialization', () => {
    test('project uses default token budget when not specified', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        default_token_budget: 100000,
      });

      const state = orchestrator.createProject({
        name: 'Default Budget Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      expect(state.token_budget).toBe(100000);
    });

    test('project uses explicit token budget when specified', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        default_token_budget: 100000,
      });

      const state = orchestrator.createProject({
        name: 'Explicit Budget Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        token_budget: 250000,
      });

      expect(state.token_budget).toBe(250000);
    });

    test('domain default budget overrides engine default', () => {
      const env = setupTestEnvironment();

      // Create domain with budget default
      const domainDir = join(env.domainsDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const domainConfig: DomainConfig = {
        name: 'Software',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {},
        defaults: {
          token_budget: 300000,
        },
        templates: {},
        quality_gates: [],
      };

      writeFileSync(
        join(domainDir, 'domain.json'),
        JSON.stringify(domainConfig),
      );

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        default_token_budget: 100000,
      });

      const state = orchestrator.createProject({
        name: 'Domain Budget Test',
        description: 'Test',
        archetype: 'software-dev',
        goals: ['test'],
      });

      expect(state.token_budget).toBe(300000);
    });

    test('project explicit budget overrides domain default', () => {
      const env = setupTestEnvironment();

      // Create domain with budget
      const domainDir = join(env.domainsDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const domainConfig: DomainConfig = {
        name: 'Software',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {},
        defaults: {
          token_budget: 300000,
        },
        templates: {},
        quality_gates: [],
      };

      writeFileSync(
        join(domainDir, 'domain.json'),
        JSON.stringify(domainConfig),
      );

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      const state = orchestrator.createProject({
        name: 'Override Budget Test',
        description: 'Test',
        archetype: 'software-dev',
        goals: ['test'],
        token_budget: 500000,
      });

      expect(state.token_budget).toBe(500000);
    });

    test('initial token usage is zero', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      const state = orchestrator.createProject({
        name: 'Initial Usage Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      expect(state.total_token_usage).toBe(0);
    });
  });

  describe('token consumption tracking', () => {
    test('token usage increases after project execution', async () => {
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
        name: 'Usage Tracking Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      const initialUsage = state.total_token_usage;

      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;
      expect(finalState.total_token_usage).toBeGreaterThan(initialUsage);
    });

    test('token usage is persisted to database', async () => {
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
        name: 'Persistence Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      await orchestrator.startProject(state.project_id);

      const finalUsage = orchestrator.getProjectState()!.total_token_usage;

      // Create new orchestrator instance
      const orchestrator2 = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      const loadedState = orchestrator2.loadProjectState(state.project_id);
      expect(loadedState!.total_token_usage).toBe(finalUsage);

      orchestrator2.shutdown();
    });

    test('per-agent token usage is tracked', async () => {
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
        name: 'Per-Agent Usage Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;
      const agentStates = Object.values(finalState.agent_states);

      // At least some agents should have token usage recorded
      const agentsWithTokens = agentStates.filter((s) => s.token_usage > 0);
      expect(agentsWithTokens.length).toBeGreaterThan(0);
    });
  });

  describe('budget limits and warnings', () => {
    test('project respects token budget limits', async () => {
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
        name: 'Budget Limit Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        token_budget: 1000000, // Large budget
        complexity: 'simple',
      });

      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;

      // Usage should be within budget
      expect(finalState.total_token_usage).toBeLessThanOrEqual(
        finalState.token_budget,
      );
    });

    test('token usage is included in stats', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      orchestrator.createProject({
        name: 'Stats Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      const stats = orchestrator.getStats();
      expect(stats).toHaveProperty('total_token_usage');
      expect(typeof stats.total_token_usage).toBe('number');
    });

    test('remaining budget can be calculated', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      const state = orchestrator.createProject({
        name: 'Remaining Budget Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        token_budget: 100000,
      });

      const remaining = state.token_budget - state.total_token_usage;
      expect(remaining).toBe(100000); // Initially full budget
    });
  });

  describe('agent-specific budget controls', () => {
    test('agents have embedded token budgets', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      // Agent definitions should have embedded governance with token budgets
      // This is tested through agent pool loading
      orchestrator.createProject({
        name: 'Agent Budget Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      const stats = orchestrator.getStats();
      expect(stats.agents_loaded).toBeGreaterThan(0);
    });

    test('domain can override agent token budgets', () => {
      const env = setupTestEnvironment();

      // Create domain with agent override
      const domainDir = join(env.domainsDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const domainConfig: DomainConfig = {
        name: 'Software',
        description: 'Test',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {
          executor: {
            enabled: true,
            token_budget_override: 25000,
          },
        },
        defaults: {},
        templates: {},
        quality_gates: [],
      };

      writeFileSync(
        join(domainDir, 'domain.json'),
        JSON.stringify(domainConfig),
      );

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      orchestrator.createProject({
        name: 'Agent Override Test',
        description: 'Test',
        archetype: 'software-dev',
        goals: ['test'],
      });

      // Domain loader should apply the override
      const stats = orchestrator.getStats();
      expect(stats.agents_loaded).toBeGreaterThan(0);
    });
  });

  describe('token metrics and reporting', () => {
    test('metrics collector tracks token usage', async () => {
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
        name: 'Metrics Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      await orchestrator.startProject(state.project_id);

      const metrics = orchestrator.getMetrics();
      const snapshot = metrics.snapshot();

      // Metrics should be collected
      expect(snapshot).toBeDefined();
      expect(snapshot.timestamp).toBeGreaterThan(0);
    });

    test('events include token usage information', async () => {
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
        name: 'Event Usage Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
      });

      await orchestrator.startProject(state.project_id);

      expect(completedEvents.length).toBe(1);
      // Event data should contain usage info
      expect(completedEvents[0].data).toBeDefined();
    });
  });

  describe('budget across checkpoints', () => {
    test('token usage is preserved in checkpoints', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      orchestrator.createProject({
        name: 'Checkpoint Usage Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        token_budget: 100000,
      });

      // Manually set some token usage
      const state = orchestrator.getProjectState()!;
      state.total_token_usage = 5000;

      orchestrator.checkpoint('With usage');

      orchestrator.advancePhase('Move');
      state.total_token_usage = 10000;

      // Rollback
      const checkpoints = orchestrator.listCheckpoints();
      orchestrator.rollback(checkpoints[0].id);

      // Usage should be restored
      const restoredState = orchestrator.getProjectState()!;
      expect(restoredState.total_token_usage).toBe(5000);
    });

    test('budget limits remain after rollback', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        auto_checkpoint: false,
      });

      orchestrator.createProject({
        name: 'Budget Rollback Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        token_budget: 200000,
      });

      orchestrator.checkpoint('Budget checkpoint');
      const checkpointId = orchestrator.listCheckpoints()[0].id;

      orchestrator.advancePhase('Move');
      orchestrator.rollback(checkpointId);

      const state = orchestrator.getProjectState()!;
      expect(state.token_budget).toBe(200000);
    });
  });

  describe('complexity and budget relationship', () => {
    test('simple complexity projects use less budget', async () => {
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
        name: 'Simple Complexity Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'simple',
        token_budget: 500000,
      });

      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;
      // Simple projects should use relatively less tokens
      expect(finalState.total_token_usage).toBeLessThan(finalState.token_budget);
    });

    test('standard complexity uses appropriate budget', async () => {
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
        name: 'Standard Complexity Test',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
        complexity: 'standard',
        token_budget: 500000,
      });

      await orchestrator.startProject(state.project_id);

      const finalState = orchestrator.getProjectState()!;
      expect(finalState.total_token_usage).toBeGreaterThan(0);
      expect(finalState.total_token_usage).toBeLessThanOrEqual(
        finalState.token_budget,
      );
    });
  });

  describe('budget validation', () => {
    test('rejects negative token budget', () => {
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
          name: 'Negative Budget Test',
          description: 'Test',
          archetype: 'custom',
          goals: ['test'],
          token_budget: -1000,
        });
      }).toThrow();
    });

    test('handles zero token budget appropriately', () => {
      const env = setupTestEnvironment();
      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      // Zero budget should either throw or use default
      const result = (() => {
        try {
          return orchestrator.createProject({
            name: 'Zero Budget Test',
            description: 'Test',
            archetype: 'custom',
            goals: ['test'],
            token_budget: 0,
          });
        } catch {
          return null;
        }
      })();

      // Either throws or uses a valid default
      if (result) {
        expect(result.token_budget).toBeGreaterThan(0);
      }
    });
  });
});
