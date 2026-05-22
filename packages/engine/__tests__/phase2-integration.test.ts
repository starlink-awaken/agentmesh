/**
 * Phase 2 Integration Tests
 *
 * Tests cross-module enhancements added in Phase 2:
 * 1. Logger trace ID management (setTraceId, getTraceId, trace_id in logs)
 * 2. AgentPool.register() dynamic agent registration
 * 3. Orchestrator Phase 2 integration (DomainLoader, MetricsCollector, trace_id generation)
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger, createLogger } from '../src/logger.ts';
import { AgentPool } from '../src/agent-runner.ts';
import { HoneycombOrchestrator, createOrchestrator } from '../src/orchestrator.ts';
import { MetricsCollector } from '../src/metrics.ts';
import { DomainLoader } from '../src/domain-loader.ts';
import { Phase, AgentStatus, RiskLevel, DecisionPath } from '../src/types.ts';
import type { AgentDefinition, ProjectState, AgentState, EngineConfig, ProjectConfig } from '../src/types.ts';

// ============================================================
// Test Helpers
// ============================================================

let tempDir: string;

function setupTempDir(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'hc-phase2-'));
  return tempDir;
}

function cleanupTempDir(): void {
  if (tempDir && existsSync(tempDir)) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

function createTestAgentDefinition(name: string): AgentDefinition {
  return {
    name,
    type: 'worker',
    layer: 'L3',
    description: `Test agent: ${name}`,
    prompt_path: `/fake/path/${name}.md`,
    tools: ['read', 'write'],
    capabilities: ['read', 'write'],
    embedded_governance: {
      first_principles_check: false,
      red_team_threshold: RiskLevel.MEDIUM,
      quality_gate_enabled: false,
      max_retries: 3,
      token_budget: 10000,
    },
  };
}

function setupMinimalAgentsDir(dir: string): void {
  const layers = [
    { dir: 'layer-1-research', name: 'researcher', tools: "['read']" },
    { dir: 'layer-2-decision', name: 'decider', tools: "['read']" },
    { dir: 'layer-3-execution', name: 'executor', tools: "['read', 'write']" },
    { dir: 'layer-4-feedback', name: 'reviewer', tools: "['read']" },
  ];

  for (const layer of layers) {
    const layerDir = join(dir, layer.dir);
    mkdirSync(layerDir, { recursive: true });
    writeFileSync(
      join(layerDir, `${layer.name}.md`),
      `---
name: ${layer.name}
description: Test ${layer.name}
tools: ${layer.tools}
---

Test agent.
`,
    );
  }
}

// ============================================================
// Logger Trace ID Tests
// ============================================================

describe('Phase 2: Logger Trace ID', () => {
  let logger: Logger;
  let logFilePath: string;

  beforeEach(() => {
    tempDir = setupTempDir();
    logFilePath = join(tempDir, 'test.log');
    logger = createLogger({ level: 'info', file: logFilePath });
  });

  afterEach(() => {
    cleanupTempDir();
  });

  test('setTraceId sets trace ID', () => {
    logger.setTraceId('trace-123');
    expect(logger.getTraceId()).toBe('trace-123');
  });

  test('getTraceId returns null when no trace ID is set', () => {
    expect(logger.getTraceId()).toBeNull();
  });

  test('setTraceId(null) clears trace ID', () => {
    logger.setTraceId('trace-456');
    expect(logger.getTraceId()).toBe('trace-456');

    logger.setTraceId(null);
    expect(logger.getTraceId()).toBeNull();
  });

  test('trace ID appears in file log entries when set', () => {
    logger.setTraceId('trace-789');
    logger.info('test:event', 'Test message with trace ID');

    const logContent = readFileSync(logFilePath, 'utf-8');
    const logLines = logContent.trim().split('\n');
    expect(logLines.length).toBe(1);

    const entry = JSON.parse(logLines[0]);
    expect(entry.trace_id).toBe('trace-789');
    expect(entry.event).toBe('test:event');
    expect(entry.message).toBe('Test message with trace ID');
  });

  test('trace ID does NOT appear in file logs when not set', () => {
    logger.info('test:event', 'Test message without trace ID');

    const logContent = readFileSync(logFilePath, 'utf-8');
    const logLines = logContent.trim().split('\n');
    expect(logLines.length).toBe(1);

    const entry = JSON.parse(logLines[0]);
    expect(entry.trace_id).toBeUndefined();
    expect(entry.event).toBe('test:event');
  });

  test('trace ID persists across multiple log calls', () => {
    logger.setTraceId('persistent-trace');
    logger.info('event1', 'First message');
    logger.warn('event2', 'Second message');
    logger.error('event3', 'Third message');

    const logContent = readFileSync(logFilePath, 'utf-8');
    const logLines = logContent.trim().split('\n');
    expect(logLines.length).toBe(3);

    for (const line of logLines) {
      const entry = JSON.parse(line);
      expect(entry.trace_id).toBe('persistent-trace');
    }
  });

  test('changing trace ID affects subsequent logs', () => {
    logger.setTraceId('trace-first');
    logger.info('event1', 'Message 1');

    logger.setTraceId('trace-second');
    logger.info('event2', 'Message 2');

    const logContent = readFileSync(logFilePath, 'utf-8');
    const logLines = logContent.trim().split('\n');
    expect(logLines.length).toBe(2);

    const entry1 = JSON.parse(logLines[0]);
    expect(entry1.trace_id).toBe('trace-first');

    const entry2 = JSON.parse(logLines[1]);
    expect(entry2.trace_id).toBe('trace-second');
  });
});

// ============================================================
// AgentPool.register() Tests
// ============================================================

describe('Phase 2: AgentPool.register()', () => {
  let agentPool: AgentPool;
  let agentsDir: string;

  beforeEach(() => {
    tempDir = setupTempDir();
    agentsDir = join(tempDir, 'agents');
    setupMinimalAgentsDir(agentsDir);
    agentPool = new AgentPool(agentsDir);
  });

  afterEach(() => {
    cleanupTempDir();
  });

  test('register adds a new agent definition', () => {
    const newAgent = createTestAgentDefinition('custom-agent');
    agentPool.register(newAgent);

    const retrieved = agentPool.getAgent('custom-agent');
    expect(retrieved).not.toBeUndefined();
    expect(retrieved?.name).toBe('custom-agent');
  });

  test('registered agent is retrievable by name', () => {
    const agent = createTestAgentDefinition('test-retriever');
    agentPool.register(agent);

    const result = agentPool.getAgent('test-retriever');
    expect(result).toEqual(agent);
  });

  test('multiple registrations work', () => {
    const agent1 = createTestAgentDefinition('agent-1');
    const agent2 = createTestAgentDefinition('agent-2');
    const agent3 = createTestAgentDefinition('agent-3');

    agentPool.register(agent1);
    agentPool.register(agent2);
    agentPool.register(agent3);

    expect(agentPool.getAgent('agent-1')).not.toBeUndefined();
    expect(agentPool.getAgent('agent-2')).not.toBeUndefined();
    expect(agentPool.getAgent('agent-3')).not.toBeUndefined();
  });

  test('overwriting existing agent with register', () => {
    const originalAgent = createTestAgentDefinition('replaceable');
    agentPool.register(originalAgent);

    const updatedAgent = createTestAgentDefinition('replaceable');
    updatedAgent.description = 'Updated description';
    agentPool.register(updatedAgent);

    const retrieved = agentPool.getAgent('replaceable');
    expect(retrieved?.description).toBe('Updated description');
  });

  test('registered agent appears in listAll()', () => {
    const initialCount = agentPool.listAll().length;

    const newAgent = createTestAgentDefinition('new-agent');
    agentPool.register(newAgent);

    const allAgents = agentPool.listAll();
    expect(allAgents.length).toBe(initialCount + 1);
    expect(allAgents.some(a => a.name === 'new-agent')).toBe(true);
  });

  test('registered agent is included in complexity-based queries', () => {
    const l3Agent = createTestAgentDefinition('custom-executor');
    l3Agent.layer = 'L3';
    agentPool.register(l3Agent);

    const simpleAgents = agentPool.getActiveAgents('simple');
    expect(simpleAgents.some(a => a.name === 'custom-executor')).toBe(true);
  });
});

// ============================================================
// Orchestrator Phase 2 Integration Tests
// ============================================================

describe('Phase 2: Orchestrator Integration', () => {
  let orchestrator: HoneycombOrchestrator;
  let tempDir: string;

  function setupOrchestratorEnv(): { dbPath: string; agentsDir: string; domainsDir: string; outputDir: string } {
    tempDir = setupTempDir();
    const dbPath = join(tempDir, 'test.db');
    const agentsDir = join(tempDir, 'agents');
    const domainsDir = join(tempDir, 'domains');
    const outputDir = join(tempDir, 'output');

    mkdirSync(outputDir, { recursive: true });
    mkdirSync(domainsDir, { recursive: true });
    setupMinimalAgentsDir(agentsDir);

    return { dbPath, agentsDir, domainsDir, outputDir };
  }

  afterEach(() => {
    try {
      orchestrator?.shutdown();
    } catch {
      // ignore
    }
    cleanupTempDir();
  });

  test('constructor initializes without errors', () => {
    const { dbPath, agentsDir, domainsDir, outputDir } = setupOrchestratorEnv();

    expect(() => {
      orchestrator = new HoneycombOrchestrator({
        db_path: dbPath,
        agents_root: agentsDir,
        domains_root: domainsDir,
        output_dir: outputDir,
        log_level: 'error',
        max_concurrent_agents: 2,
        auto_checkpoint: false,
        default_token_budget: 100000,
        risk_thresholds: {
          file_count: { low: 10, medium: 50, high: 100 },
          security_keywords_enabled: true,
          custom_rules: [],
        },
      });
    }).not.toThrow();
  });

  test('getMetrics returns MetricsCollector instance', () => {
    const { dbPath, agentsDir, domainsDir, outputDir } = setupOrchestratorEnv();
    orchestrator = new HoneycombOrchestrator({
      db_path: dbPath,
      agents_root: agentsDir,
      domains_root: domainsDir,
      output_dir: outputDir,
      log_level: 'error',
    });

    const metrics = orchestrator.getMetrics();
    expect(metrics).toBeInstanceOf(MetricsCollector);
  });

  test('createProject generates trace_id in format hc-{timestamp}-{hex}', () => {
    const { dbPath, agentsDir, domainsDir, outputDir } = setupOrchestratorEnv();
    orchestrator = new HoneycombOrchestrator({
      db_path: dbPath,
      agents_root: agentsDir,
      domains_root: domainsDir,
      output_dir: outputDir,
      log_level: 'error',
    });

    const projectConfig: ProjectConfig = {
      name: 'Test Project',
      description: 'Test project for trace ID validation',
      archetype: 'custom',
      goals: ['test trace ID'],
    };

    const state = orchestrator.createProject(projectConfig);

    expect(state.trace_id).toBeTruthy();
    // Format: hc-{timestamp}-{hex4}
    const traceIdPattern = /^hc-\d+-[0-9a-f]{4}$/;
    expect(traceIdPattern.test(state.trace_id!)).toBe(true);
  });

  test('trace_id is set on project state', () => {
    const { dbPath, agentsDir, domainsDir, outputDir } = setupOrchestratorEnv();
    orchestrator = new HoneycombOrchestrator({
      db_path: dbPath,
      agents_root: agentsDir,
      domains_root: domainsDir,
      output_dir: outputDir,
      log_level: 'error',
    });

    const projectConfig: ProjectConfig = {
      name: 'Trace ID Test',
      description: 'Test',
      archetype: 'custom',
      goals: ['test'],
    };

    const state = orchestrator.createProject(projectConfig);

    expect(state.trace_id).toBeDefined();
    expect(typeof state.trace_id).toBe('string');
    expect(state.trace_id!.length).toBeGreaterThan(0);
  });

  test('each project gets a unique trace_id', () => {
    const { dbPath, agentsDir, domainsDir, outputDir } = setupOrchestratorEnv();
    orchestrator = new HoneycombOrchestrator({
      db_path: dbPath,
      agents_root: agentsDir,
      domains_root: domainsDir,
      output_dir: outputDir,
      log_level: 'error',
    });

    const config1: ProjectConfig = {
      name: 'Project 1',
      description: 'First',
      archetype: 'custom',
      goals: ['test'],
    };

    const config2: ProjectConfig = {
      name: 'Project 2',
      description: 'Second',
      archetype: 'custom',
      goals: ['test'],
    };

    const state1 = orchestrator.createProject(config1);
    const state2 = orchestrator.createProject(config2);

    expect(state1.trace_id).not.toBe(state2.trace_id);
  });

  test('domain loading during project creation with valid domain', () => {
    const { dbPath, agentsDir, domainsDir, outputDir } = setupOrchestratorEnv();

    // Create a minimal domain configuration
    const softwareDir = join(domainsDir, 'software');
    mkdirSync(softwareDir, { recursive: true });
    writeFileSync(
      join(softwareDir, 'domain.json'),
      JSON.stringify({
        name: 'Software Development',
        description: 'Domain for software projects',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {},
        defaults: {
          complexity: 'standard',
          token_budget: 200000,
        },
        templates: {},
        quality_gates: [],
      }),
    );

    orchestrator = new HoneycombOrchestrator({
      db_path: dbPath,
      agents_root: agentsDir,
      domains_root: domainsDir,
      output_dir: outputDir,
      log_level: 'error',
    });

    const projectConfig: ProjectConfig = {
      name: 'Software Project',
      description: 'Test software project',
      archetype: 'software-dev',
      goals: ['build software'],
    };

    const state = orchestrator.createProject(projectConfig);

    // Domain defaults should be applied
    expect(state.complexity).toBe('standard');
    expect(state.token_budget).toBe(200000);
  });

  test('project creation works without domain for custom archetype', () => {
    const { dbPath, agentsDir, domainsDir, outputDir } = setupOrchestratorEnv();
    orchestrator = new HoneycombOrchestrator({
      db_path: dbPath,
      agents_root: agentsDir,
      domains_root: domainsDir,
      output_dir: outputDir,
      log_level: 'error',
    });

    const projectConfig: ProjectConfig = {
      name: 'Custom Project',
      description: 'Custom archetype project',
      archetype: 'custom',
      goals: ['custom work'],
    };

    expect(() => {
      orchestrator.createProject(projectConfig);
    }).not.toThrow();

    const state = orchestrator.getProjectState();
    expect(state).not.toBeNull();
    expect(state!.archetype).toBe('custom');
  });

  test('project creation continues when domain directory does not exist', () => {
    const { dbPath, agentsDir, domainsDir, outputDir } = setupOrchestratorEnv();
    orchestrator = new HoneycombOrchestrator({
      db_path: dbPath,
      agents_root: agentsDir,
      domains_root: domainsDir,
      output_dir: outputDir,
      log_level: 'error',
    });

    const projectConfig: ProjectConfig = {
      name: 'Project Without Domain',
      description: 'Test project',
      archetype: 'software-dev', // Domain dir not created
      goals: ['test'],
    };

    expect(() => {
      orchestrator.createProject(projectConfig);
    }).not.toThrow();

    const state = orchestrator.getProjectState();
    expect(state).not.toBeNull();
  });

  test('domain-specific agents are loaded and registered', () => {
    const { dbPath, agentsDir, domainsDir, outputDir } = setupOrchestratorEnv();

    // Create domain with custom agent
    const softwareDir = join(domainsDir, 'software');
    const domainAgentsDir = join(softwareDir, 'agents');
    mkdirSync(domainAgentsDir, { recursive: true });

    writeFileSync(
      join(softwareDir, 'domain.json'),
      JSON.stringify({
        name: 'Software Development',
        description: 'Software domain',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {},
        defaults: {},
        templates: {},
        quality_gates: [],
      }),
    );

    writeFileSync(
      join(domainAgentsDir, 'domain-specialist.md'),
      `---
name: domain-specialist
description: Domain-specific specialist agent
tools: ['read', 'analyze']
---

Domain specialist agent.
`,
    );

    orchestrator = new HoneycombOrchestrator({
      db_path: dbPath,
      agents_root: agentsDir,
      domains_root: domainsDir,
      output_dir: outputDir,
      log_level: 'error',
    });

    const projectConfig: ProjectConfig = {
      name: 'Software Project',
      description: 'Test',
      archetype: 'software-dev',
      goals: ['test'],
    };

    orchestrator.createProject(projectConfig);

    // Verify domain agent was registered
    const stats = orchestrator.getStats();
    expect(stats.agents_loaded).toBeGreaterThan(4); // 4 base + domain agent(s)
  });

  test('metrics are collected during project lifecycle', async () => {
    const { dbPath, agentsDir, domainsDir, outputDir } = setupOrchestratorEnv();
    orchestrator = new HoneycombOrchestrator({
      db_path: dbPath,
      agents_root: agentsDir,
      domains_root: domainsDir,
      output_dir: outputDir,
      log_level: 'error',
      auto_checkpoint: false,
    });

    const projectConfig: ProjectConfig = {
      name: 'Metrics Test',
      description: 'Test metrics collection',
      archetype: 'custom',
      goals: ['test'],
      complexity: 'simple', // Use simple to reduce execution time
    };

    const state = orchestrator.createProject(projectConfig);
    await orchestrator.startProject(state.project_id);

    const metrics = orchestrator.getMetrics();
    const snapshot = metrics.snapshot();

    // Should have some metrics collected
    expect(Object.keys(snapshot.counters).length).toBeGreaterThan(0);
  });

  test('trace_id persists through project lifecycle', async () => {
    const { dbPath, agentsDir, domainsDir, outputDir } = setupOrchestratorEnv();
    const logFilePath = join(tempDir, 'test.log');

    orchestrator = new HoneycombOrchestrator({
      db_path: dbPath,
      agents_root: agentsDir,
      domains_root: domainsDir,
      output_dir: outputDir,
      log_level: 'info',
      log_file: logFilePath,
      auto_checkpoint: false,
    });

    const projectConfig: ProjectConfig = {
      name: 'Trace Persistence Test',
      description: 'Test trace ID persistence',
      archetype: 'custom',
      goals: ['test'],
      complexity: 'simple',
    };

    const state = orchestrator.createProject(projectConfig);
    const originalTraceId = state.trace_id;

    await orchestrator.startProject(state.project_id);

    const finalState = orchestrator.getProjectState();
    expect(finalState?.trace_id).toBe(originalTraceId);

    // Verify trace ID appears in logs
    if (existsSync(logFilePath)) {
      const logContent = readFileSync(logFilePath, 'utf-8');
      const logLines = logContent.trim().split('\n').filter(line => line.length > 0);

      // At least some log entries should have the trace_id
      let foundTraceId = false;
      for (const line of logLines) {
        try {
          const entry = JSON.parse(line);
          if (entry.trace_id === originalTraceId) {
            foundTraceId = true;
            break;
          }
        } catch {
          // Skip non-JSON lines
        }
      }
      expect(foundTraceId).toBe(true);
    }
  });

  test('DomainLoader is initialized in orchestrator', () => {
    const { dbPath, agentsDir, domainsDir, outputDir } = setupOrchestratorEnv();

    orchestrator = new HoneycombOrchestrator({
      db_path: dbPath,
      agents_root: agentsDir,
      domains_root: domainsDir,
      output_dir: outputDir,
      log_level: 'error',
    });

    // DomainLoader should be initialized (verified by successful domain loading)
    // Create a domain to test
    const testDomainDir = join(domainsDir, 'creative-writing');
    mkdirSync(testDomainDir, { recursive: true });
    writeFileSync(
      join(testDomainDir, 'domain.json'),
      JSON.stringify({
        name: 'Creative Writing',
        description: 'Writing domain',
        archetype: 'creative-writing',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {},
        defaults: { complexity: 'advanced' },
        templates: {},
        quality_gates: [],
      }),
    );

    const projectConfig: ProjectConfig = {
      name: 'Writing Project',
      description: 'Test',
      archetype: 'creative-writing',
      goals: ['write'],
    };

    const state = orchestrator.createProject(projectConfig);
    expect(state.complexity).toBe('advanced'); // Domain default applied
  });

  test('MetricsCollector integration with orchestrator events', async () => {
    const { dbPath, agentsDir, domainsDir, outputDir } = setupOrchestratorEnv();
    orchestrator = new HoneycombOrchestrator({
      db_path: dbPath,
      agents_root: agentsDir,
      domains_root: domainsDir,
      output_dir: outputDir,
      log_level: 'error',
      auto_checkpoint: false,
    });

    const projectConfig: ProjectConfig = {
      name: 'Metrics Events Test',
      description: 'Test',
      archetype: 'custom',
      goals: ['test'],
      complexity: 'simple',
    };

    const state = orchestrator.createProject(projectConfig);
    const metrics = orchestrator.getMetrics();

    // Reset metrics to start fresh
    metrics.reset();

    await orchestrator.startProject(state.project_id);

    const snapshot = metrics.snapshot();

    // Check that metrics were collected
    expect(snapshot.timestamp).toBeGreaterThan(0);

    // Should have some counters for phases, agents, messages
    const counterKeys = Object.keys(snapshot.counters);
    expect(counterKeys.length).toBeGreaterThan(0);
  });
});
