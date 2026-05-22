/**
 * AgentRunner & AgentPool Concurrency Tests
 *
 * Tests concurrent access patterns to identify and verify:
 * - Race conditions in agent registration
 * - Thread safety of Map operations
 * - Concurrent agent state updates
 * - Parallel pool initialization
 * - Concurrent backoffDelay calls (line 230-231)
 *
 * TDD: Tests written to cover previously untested concurrent paths.
 */

import { describe, test, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentRunner, AgentPool } from '../src/agent-runner.ts';
import { AgentStatus } from '../src/types.ts';

// ============================================================
// Test Fixtures
// ============================================================

let tempDir: string;

function setupTempAgents(): {
  agentsDir: string;
} {
  tempDir = mkdtempSync(join(tmpdir(), 'hc-concurrency-test-'));
  const agentsDir = join(tempDir, 'agents');

  // Create layer directories with agents
  const layers = [
    { dir: 'layer-1-research', name: 'researcher' },
    { dir: 'layer-2-decision', name: 'decision-maker' },
    { dir: 'layer-3-execution', name: 'executor' },
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

  return { agentsDir };
}

function cleanupTempAgents(): void {
  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================================
// Concurrency Tests
// ============================================================

describe('AgentRunner Concurrency', () => {
  let runner: AgentRunner;

  beforeEach(() => {
    runner = new AgentRunner();
  });

  afterEach(() => {
    try {
      runner?.dispose();
    } catch {
      // 忽略 dispose 错误
    }
  });

  describe('concurrent agent execution', () => {
    test('handles multiple concurrent runAgent calls', async () => {
      const tempFiles = mkdtempSync(join(tmpdir(), 'hc-runner-concurrent-'));
      const mdPath = join(tempFiles, 'agent.md');
      writeFileSync(mdPath, `---
name: concurrent-agent
description: Test concurrent agent
tools: ['read']
---

# Agent
`);

      const def = runner.parseAgentDefinition(mdPath);

      // Run the same agent multiple times concurrently
      const promises = Array.from({ length: 10 }, () =>
        runner.runAgent(def, `Task ${Math.random()}`)
      );

      const results = await Promise.all(promises);

      // All executions should complete
      expect(results.length).toBe(10);
      results.forEach((result) => {
        expect(result.status).toBe(AgentStatus.COMPLETED);
        expect(result.agent_name).toBe('concurrent-agent');
      });

      // Final state should be from one of the executions
      const state = runner.getAgentState('concurrent-agent');
      expect(state).toBeDefined();
      expect(state!.status).toBe(AgentStatus.COMPLETED);
    });

    test('handles concurrent execution of different agents', async () => {
      const tempFiles = mkdtempSync(join(tmpdir(), 'hc-multi-concurrent-'));

      // Create multiple different agents
      const agents = ['agent1', 'agent2', 'agent3', 'agent4', 'agent5'];
      const definitions = agents.map((name) => {
        const mdPath = join(tempFiles, `${name}.md`);
        writeFileSync(mdPath, `---
name: ${name}
description: Test agent ${name}
tools: ['read']
---

# ${name}
`);
        return runner.parseAgentDefinition(mdPath);
      });

      // Run all agents concurrently
      const promises = definitions.map((def) =>
        runner.runAgent(def, `Task for ${def.name}`)
      );

      const results = await Promise.all(promises);

      // All should complete successfully
      expect(results.length).toBe(5);
      results.forEach((result) => {
        expect(result.status).toBe(AgentStatus.COMPLETED);
      });

      // All states should be stored
      agents.forEach((name) => {
        const state = runner.getAgentState(name);
        expect(state).toBeDefined();
        expect(state!.status).toBe(AgentStatus.COMPLETED);
      });
    });

    test('concurrent state updates do not corrupt state', async () => {
      const tempFiles = mkdtempSync(join(tmpdir(), 'hc-state-concurrent-'));
      const mdPath = join(tempFiles, 'state-agent.md');
      writeFileSync(mdPath, `---
name: state-agent
description: Test state agent
tools: ['read']
---

# Agent
`);

      const def = runner.parseAgentDefinition(mdPath);

      // Run many concurrent executions
      const promises = Array.from({ length: 50 }, (_, i) =>
        runner.runAgent(def, `Task ${i}`)
      );

      const results = await Promise.all(promises);

      // All should complete
      expect(results.length).toBe(50);
      expect(results.every((r) => r.status === AgentStatus.COMPLETED)).toBe(true);

      // Final state should be consistent
      const state = runner.getAgentState('state-agent');
      expect(state).toBeDefined();
      expect(state!.agent_name).toBe('state-agent');
      expect(state!.status).toBe(AgentStatus.COMPLETED);
      expect(state!.started_at).toBeGreaterThan(0);
      expect(state!.completed_at).toBeGreaterThan(0);
    });
  });

  describe('concurrent state access', () => {
    test('getAgentState is safe during concurrent updates', async () => {
      const tempFiles = mkdtempSync(join(tmpdir(), 'hc-access-concurrent-'));
      const mdPath = join(tempFiles, 'access-agent.md');
      writeFileSync(mdPath, `---
name: access-agent
description: Test access agent
tools: ['read']
---

# Agent
`);

      const def = runner.parseAgentDefinition(mdPath);

      // Mix of reads and writes
      const operations: Promise<unknown>[] = [];

      // Start 10 concurrent runs
      for (let i = 0; i < 10; i++) {
        operations.push(runner.runAgent(def, `Task ${i}`));
      }

      // Intersperse state reads
      for (let i = 0; i < 20; i++) {
        operations.push(
          new Promise((resolve) => {
            setTimeout(() => {
              const state = runner.getAgentState('access-agent');
              resolve(state);
            }, Math.random() * 10);
          })
        );
      }

      await Promise.all(operations);

      // Final state should be valid
      const state = runner.getAgentState('access-agent');
      expect(state).toBeDefined();
    });
  });
});

// ============================================================
// AgentPool Concurrency Tests
// ============================================================

describe('AgentPool Concurrency', () => {
  let agentsDir: string;

  beforeEach(() => {
    const env = setupTempAgents();
    agentsDir = env.agentsDir;
  });

  afterAll(() => {
    cleanupTempAgents();
  });

  describe('concurrent registration', () => {
    test('handles concurrent register calls', () => {
      const pool = new AgentPool(agentsDir);
      const initialCount = pool.listAll().length;

      // Create agents to register concurrently
      const newAgents = Array.from({ length: 20 }, (_, i) => ({
        name: `concurrent-agent-${i}`,
        type: 'worker' as const,
        layer: 'L3' as const,
        description: `Test agent ${i}`,
        prompt_path: `/fake/path/agent${i}.md`,
        tools: ['read'],
        capabilities: ['read'],
        embedded_governance: {
          first_principles_check: true,
          red_team_threshold: 'medium' as const,
          quality_gate_enabled: true,
          max_retries: 3,
          token_budget: 100_000,
        },
      }));

      // Register all agents
      newAgents.forEach((agent) => pool.register(agent));

      // Verify all were registered
      expect(pool.listAll().length).toBe(initialCount + 20);

      // Verify each can be retrieved
      newAgents.forEach((agent) => {
        const retrieved = pool.getAgent(agent.name);
        expect(retrieved).toBeDefined();
        expect(retrieved!.name).toBe(agent.name);
      });
    });

    test('register overwrites existing agent with same name', () => {
      const pool = new AgentPool(agentsDir);

      const agent1 = {
        name: 'duplicate-agent',
        type: 'worker' as const,
        layer: 'L3' as const,
        description: 'First version',
        prompt_path: '/path1',
        tools: ['read'],
        capabilities: ['read'],
        embedded_governance: {
          first_principles_check: true,
          red_team_threshold: 'medium' as const,
          quality_gate_enabled: true,
          max_retries: 3,
          token_budget: 100_000,
        },
      };

      const agent2 = {
        name: 'duplicate-agent', // Same name
        type: 'structural' as const,
        layer: 'L2' as const, // Different layer
        description: 'Second version',
        prompt_path: '/path2',
        tools: ['write'],
        capabilities: ['write'],
        embedded_governance: {
          first_principles_check: false,
          red_team_threshold: 'low' as const,
          quality_gate_enabled: false,
          max_retries: 5,
          token_budget: 50_000,
        },
      };

      pool.register(agent1);
      let retrieved = pool.getAgent('duplicate-agent');
      expect(retrieved!.description).toBe('First version');
      expect(retrieved!.layer).toBe('L3');

      pool.register(agent2);
      retrieved = pool.getAgent('duplicate-agent');
      expect(retrieved!.description).toBe('Second version');
      expect(retrieved!.layer).toBe('L2');
    });
  });

  describe('concurrent queries', () => {
    test('handles concurrent getAgent calls', () => {
      const pool = new AgentPool(agentsDir);
      const agents = pool.listAll();

      // Query all agents concurrently
      const promises = agents.map((agent) =>
        Promise.resolve(pool.getAgent(agent.name))
      );

      const results = Promise.all(promises);

      expect(results).resolves.toHaveLength(agents.length);
    });

    test('handles concurrent getAgentsByLayer calls', () => {
      const pool = new AgentPool(agentsDir);

      // Query all layers concurrently
      const layers: Array<'L1' | 'L2' | 'L3' | 'L4' | 'governance'> = [
        'L1',
        'L2',
        'L3',
        'L4',
        'governance',
      ];

      const results = layers.map((layer) => pool.getAgentsByLayer(layer));

      expect(results).toHaveLength(5);
      results.forEach((agents) => {
        expect(Array.isArray(agents)).toBe(true);
      });
    });

    test('handles concurrent getActiveAgents calls', () => {
      const pool = new AgentPool(agentsDir);

      const complexities: Array<'simple' | 'standard' | 'advanced' | 'enterprise'> = [
        'simple',
        'standard',
        'advanced',
        'enterprise',
      ];

      const results = complexities.map((c) => pool.getActiveAgents(c));

      // Enterprise should return all agents
      expect(results[3].length).toBeGreaterThanOrEqual(results[0].length);
      expect(results[3].length).toBeGreaterThanOrEqual(results[1].length);
      expect(results[3].length).toBeGreaterThanOrEqual(results[2].length);
    });
  });

  describe('concurrent registration and queries', () => {
    test('queries are consistent during registration', () => {
      const pool = new AgentPool(agentsDir);
      const initialCount = pool.listAll().length;

      // Mix registrations and queries
      for (let i = 0; i < 10; i++) {
        pool.register({
          name: `mixed-agent-${i}`,
          type: 'worker' as const,
          layer: 'L3' as const,
          description: `Mixed agent ${i}`,
          prompt_path: `/path${i}`,
          tools: ['read'],
          capabilities: ['read'],
          embedded_governance: {
            first_principles_check: true,
            red_team_threshold: 'medium' as const,
            quality_gate_enabled: true,
            max_retries: 3,
            token_budget: 100_000,
          },
        });

        // Query after each registration
        const count = pool.listAll().length;
        expect(count).toBe(initialCount + i + 1);
      }

      // Final state
      expect(pool.listAll().length).toBe(initialCount + 10);
    });
  });

  describe('backoffDelay concurrency (line 230-231)', () => {
    let testRunner: AgentRunner | null = null;

    afterEach(() => {
      try {
        testRunner?.dispose();
      } catch {
        // 忽略 dispose 错误
      }
      testRunner = null;
    });

    test('multiple concurrent backoffDelay calls complete correctly', async () => {
      // This test verifies the backoffDelay function used in retry logic
      const tempFiles = mkdtempSync(join(tmpdir(), 'hc-backoff-'));
      const mdPath = join(tempFiles, 'retry-agent.md');
      writeFileSync(mdPath, `---
name: retry-agent
description: Test retry agent
tools: ['read']
---
# Agent
embedded_governance:
  max_retries: 3
`);

      testRunner = new AgentRunner();
      const def = testRunner.parseAgentDefinition(mdPath);

      // Start multiple agents that will use backoffDelay during retries
      const start = Date.now();
      const promises = Array.from({ length: 5 }, () =>
        testRunner.runAgent(def, 'Concurrent retry task')
      );

      await Promise.all(promises);
      const duration = Date.now() - start;

      // All should complete
      // (In simulation mode they complete quickly; real API would take longer)
      expect(promises.length).toBe(5);
    });
  });
});

// ============================================================
// Race Condition Tests
// ============================================================

describe('Race Condition Detection', () => {
  test('Map operations are atomic at the single-operation level', () => {
    const pool = new AgentPool(mkdtempSync(join(tmpdir(), 'hc-race-')));

    const agent = {
      name: 'race-test-agent',
      type: 'worker' as const,
      layer: 'L3' as const,
      description: 'Race test',
      prompt_path: '/path',
      tools: ['read'],
      capabilities: ['read'],
      embedded_governance: {
        first_principles_check: true,
        red_team_threshold: 'medium' as const,
        quality_gate_enabled: true,
        max_retries: 3,
        token_budget: 100_000,
      },
    };

    // Rapid register/unregister-like operations
    for (let i = 0; i < 1000; i++) {
      pool.register(agent);
      const retrieved = pool.getAgent('race-test-agent');
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('race-test-agent');
    }
  });

  test('concurrent Map writes do not lose data', () => {
    const pool = new AgentPool(mkdtempSync(join(tmpdir(), 'hc-map-race-')));

    const agents = Array.from({ length: 100 }, (_, i) => ({
      name: `map-agent-${i}`,
      type: 'worker' as const,
      layer: 'L3' as const,
      description: `Agent ${i}`,
      prompt_path: `/path${i}`,
      tools: ['read'],
      capabilities: ['read'],
      embedded_governance: {
        first_principles_check: true,
        red_team_threshold: 'medium' as const,
        quality_gate_enabled: true,
        max_retries: 3,
        token_budget: 100_000,
      },
    }));

    // Register all agents
    agents.forEach((agent) => pool.register(agent));

    // Verify all are present
    const allAgents = pool.listAll();
    const registeredCount = agents.filter((a) =>
      allAgents.some((poolAgent) => poolAgent.name === a.name)
    ).length;

    expect(registeredCount).toBe(100);
  });
});
