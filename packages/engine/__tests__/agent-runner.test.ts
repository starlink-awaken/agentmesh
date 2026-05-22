/**
 * Tests for AgentRunner - markdown parsing, agent running, pool management.
 */
import { describe, test, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentRunner, AgentPool } from '../src/agent-runner.ts';
import { AgentStatus } from '../src/types.ts';

// ============================================================
// Test Fixtures: Agent markdown files
// ============================================================

const VALID_AGENT_MD = `---
name: test-architect
description: |
  A test architect agent.
  Handles system architecture.
argument-hint: "project requirements"
tools: ['read', 'edit', 'execute']
---

# Test Architect

You are a test architect agent.
`;

const MINIMAL_AGENT_MD = `---
name: minimal-agent
description: A minimal agent
tools: ['read']
---

# Minimal

Body content here.
`;

const NO_NAME_MD = `---
description: Missing name field
tools: ['read']
---

# No Name

Body content.
`;

const NO_FRONTMATTER_MD = `# Just a regular markdown file

No frontmatter delimiters here.
`;

const EMPTY_TOOLS_MD = `---
name: no-tools-agent
description: Agent with no tools
tools: []
---

# No Tools

Body content.
`;

// ============================================================
// Temp directory setup
// ============================================================

let tempDir: string;
let agentsDir: string;

function setupTempAgents(): void {
  tempDir = mkdtempSync(join(tmpdir(), 'hc-agent-test-'));
  agentsDir = join(tempDir, 'agents');
  mkdirSync(agentsDir, { recursive: true });

  // Create layer directories with agents
  const l1Dir = join(agentsDir, 'layer-1-research');
  mkdirSync(l1Dir, { recursive: true });
  writeFileSync(join(l1Dir, 'researcher.md'), `---
name: researcher
description: Research agent
tools: ['read', 'search']
---

# Researcher
Research agent body.
`);

  const l2Dir = join(agentsDir, 'layer-2-decision');
  mkdirSync(l2Dir, { recursive: true });
  writeFileSync(join(l2Dir, 'decision-maker.md'), `---
name: decision-maker
description: Decision maker
tools: ['read']
---

# Decision Maker
Decision agent body.
`);

  const l3Dir = join(agentsDir, 'layer-3-execution');
  mkdirSync(l3Dir, { recursive: true });
  writeFileSync(join(l3Dir, 'executor.md'), VALID_AGENT_MD);
  writeFileSync(join(l3Dir, 'planner.md'), `---
name: planner
description: Project planner
tools: ['read', 'edit']
---

# Planner
Plan things.
`);

  const l4Dir = join(agentsDir, 'layer-4-feedback');
  mkdirSync(l4Dir, { recursive: true });
  writeFileSync(join(l4Dir, 'tester.md'), `---
name: tester
description: Testing agent
tools: ['execute']
---

# Tester
Test things.
`);

  const govDir = join(agentsDir, 'governance');
  mkdirSync(govDir, { recursive: true });
  writeFileSync(join(govDir, 'guardian.md'), `---
name: guardian
description: Governance guardian
tools: ['read']
---

# Guardian
Guard things.
`);
}

// ============================================================
// AgentRunner Tests
// ============================================================

describe('AgentRunner', () => {
  let runner: AgentRunner;
  let tempFiles: string;

  beforeEach(() => {
    runner = new AgentRunner();
    tempFiles = mkdtempSync(join(tmpdir(), 'hc-runner-'));
  });

  afterEach(() => {
    // 清理 AgentRunner 资源
    try {
      runner.dispose();
    } catch {
      // 忽略清理错误
    }
  });

  describe('parseAgentDefinition', () => {
    test('parses valid agent markdown with all fields', () => {
      const mdPath = join(tempFiles, 'layer-3-execution', 'agent.md');
      mkdirSync(join(tempFiles, 'layer-3-execution'), { recursive: true });
      writeFileSync(mdPath, VALID_AGENT_MD);

      const def = runner.parseAgentDefinition(mdPath);
      expect(def.name).toBe('test-architect');
      expect(def.description).toContain('A test architect agent');
      expect(def.argument_hint).toBe('project requirements');
      expect(def.tools).toEqual(['read', 'edit', 'execute']);
      expect(def.layer).toBe('L3');
      expect(def.type).toBe('worker');
    });

    test('parses minimal agent markdown', () => {
      const mdPath = join(tempFiles, 'agent.md');
      writeFileSync(mdPath, MINIMAL_AGENT_MD);

      const def = runner.parseAgentDefinition(mdPath);
      expect(def.name).toBe('minimal-agent');
      expect(def.description).toBe('A minimal agent');
      expect(def.tools).toEqual(['read']);
      expect(def.argument_hint).toBeUndefined();
    });

    test('throws on missing name', () => {
      const mdPath = join(tempFiles, 'no-name.md');
      writeFileSync(mdPath, NO_NAME_MD);

      expect(() => runner.parseAgentDefinition(mdPath)).toThrow(/missing "name"/);
    });

    test('throws on missing frontmatter', () => {
      const mdPath = join(tempFiles, 'no-fm.md');
      writeFileSync(mdPath, NO_FRONTMATTER_MD);

      expect(() => runner.parseAgentDefinition(mdPath)).toThrow(
        /missing frontmatter/,
      );
    });

    test('parses agent with empty tools array', () => {
      const mdPath = join(tempFiles, 'no-tools.md');
      writeFileSync(mdPath, EMPTY_TOOLS_MD);

      const def = runner.parseAgentDefinition(mdPath);
      expect(def.tools).toEqual([]);
    });

    test('infers L1 layer from path', () => {
      const mdPath = join(tempFiles, 'layer-1-research', 'agent.md');
      mkdirSync(join(tempFiles, 'layer-1-research'), { recursive: true });
      writeFileSync(mdPath, MINIMAL_AGENT_MD);

      const def = runner.parseAgentDefinition(mdPath);
      expect(def.layer).toBe('L1');
      expect(def.type).toBe('structural');
    });

    test('infers L2 layer from path', () => {
      const mdPath = join(tempFiles, 'layer-2-decision', 'agent.md');
      mkdirSync(join(tempFiles, 'layer-2-decision'), { recursive: true });
      writeFileSync(mdPath, MINIMAL_AGENT_MD);

      const def = runner.parseAgentDefinition(mdPath);
      expect(def.layer).toBe('L2');
      expect(def.type).toBe('structural');
    });

    test('infers governance layer from path', () => {
      const mdPath = join(tempFiles, 'governance', 'agent.md');
      mkdirSync(join(tempFiles, 'governance'), { recursive: true });
      writeFileSync(mdPath, MINIMAL_AGENT_MD);

      const def = runner.parseAgentDefinition(mdPath);
      expect(def.layer).toBe('governance');
      expect(def.type).toBe('structural');
      // Governance agents get stricter defaults
      expect(def.embedded_governance.first_principles_check).toBe(true);
      expect(def.embedded_governance.quality_gate_enabled).toBe(true);
    });

    test('defaults to L3 / worker for unknown path', () => {
      const mdPath = join(tempFiles, 'random-dir', 'agent.md');
      mkdirSync(join(tempFiles, 'random-dir'), { recursive: true });
      writeFileSync(mdPath, MINIMAL_AGENT_MD);

      const def = runner.parseAgentDefinition(mdPath);
      expect(def.layer).toBe('L3');
      expect(def.type).toBe('worker');
    });

    test('sets default governance config', () => {
      const mdPath = join(tempFiles, 'agent.md');
      writeFileSync(mdPath, MINIMAL_AGENT_MD);

      const def = runner.parseAgentDefinition(mdPath);
      expect(def.embedded_governance.max_retries).toBe(3);
      expect(def.embedded_governance.token_budget).toBe(100_000);
      expect(def.embedded_governance.quality_gate_enabled).toBe(true);
    });
  });

  // ============================================================
  // runAgent (simulation)
  // ============================================================

  describe('runAgent', () => {
    test('runs agent and returns COMPLETED state', async () => {
      const mdPath = join(tempFiles, 'agent.md');
      writeFileSync(mdPath, MINIMAL_AGENT_MD);
      const def = runner.parseAgentDefinition(mdPath);

      const result = await runner.runAgent(def, 'Do something');
      expect(result.status).toBe(AgentStatus.COMPLETED);
      expect(result.agent_name).toBe('minimal-agent');
      expect(result.output).toContain('[Simulated]');
      expect(result.token_usage).toBeGreaterThan(0);
      expect(result.started_at).toBeGreaterThan(0);
      expect(result.completed_at).toBeGreaterThan(0);
      expect(result.retry_count).toBe(0);
    });

    test('includes context info in output when context provided', async () => {
      const mdPath = join(tempFiles, 'agent.md');
      writeFileSync(mdPath, MINIMAL_AGENT_MD);
      const def = runner.parseAgentDefinition(mdPath);

      const result = await runner.runAgent(def, 'task', 'some context here');
      expect(result.output).toContain('Context provided: yes');
    });

    test('output includes no context note when none provided', async () => {
      const mdPath = join(tempFiles, 'agent.md');
      writeFileSync(mdPath, MINIMAL_AGENT_MD);
      const def = runner.parseAgentDefinition(mdPath);

      const result = await runner.runAgent(def, 'task');
      expect(result.output).toContain('Context provided: no');
    });

    test('stores agent state accessible via getAgentState', async () => {
      const mdPath = join(tempFiles, 'agent.md');
      writeFileSync(mdPath, MINIMAL_AGENT_MD);
      const def = runner.parseAgentDefinition(mdPath);

      await runner.runAgent(def, 'task');
      const state = runner.getAgentState('minimal-agent');
      expect(state).toBeDefined();
      expect(state!.status).toBe(AgentStatus.COMPLETED);
    });

    test('getAgentState returns undefined for unknown agent', () => {
      expect(runner.getAgentState('nonexistent')).toBeUndefined();
    });
  });
});

// ============================================================
// AgentPool Tests
// ============================================================

describe('AgentPool', () => {
  beforeEach(() => {
    setupTempAgents();
  });

  afterAll(() => {
    try {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  test('loads agents from directory', () => {
    const pool = new AgentPool(agentsDir);
    const all = pool.listAll();
    expect(all.length).toBeGreaterThanOrEqual(6);
  });

  test('getAgent returns a specific agent by name', () => {
    const pool = new AgentPool(agentsDir);
    const agent = pool.getAgent('researcher');
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('researcher');
    expect(agent!.layer).toBe('L1');
  });

  test('getAgent returns undefined for unknown name', () => {
    const pool = new AgentPool(agentsDir);
    expect(pool.getAgent('nonexistent')).toBeUndefined();
  });

  test('getAgentsByLayer filters correctly', () => {
    const pool = new AgentPool(agentsDir);

    const l1 = pool.getAgentsByLayer('L1');
    expect(l1.length).toBeGreaterThanOrEqual(1);
    expect(l1.every((a) => a.layer === 'L1')).toBe(true);

    const l3 = pool.getAgentsByLayer('L3');
    expect(l3.length).toBeGreaterThanOrEqual(2);
    expect(l3.every((a) => a.layer === 'L3')).toBe(true);
  });

  describe('getActiveAgents by complexity', () => {
    test('simple returns only L3 + L4 agents', () => {
      const pool = new AgentPool(agentsDir);
      const active = pool.getActiveAgents('simple');
      expect(active.every((a) => a.layer === 'L3' || a.layer === 'L4')).toBe(true);
      expect(active.length).toBeGreaterThanOrEqual(2);
    });

    test('standard returns L2 + L3 + L4 agents', () => {
      const pool = new AgentPool(agentsDir);
      const active = pool.getActiveAgents('standard');
      const layers = new Set(active.map((a) => a.layer));
      expect(layers.has('L2')).toBe(true);
      expect(layers.has('L3')).toBe(true);
      expect(layers.has('L4')).toBe(true);
      expect(layers.has('L1')).toBe(false);
    });

    test('advanced returns all agents including L1 and governance', () => {
      const pool = new AgentPool(agentsDir);
      const active = pool.getActiveAgents('advanced');
      const layers = new Set(active.map((a) => a.layer));
      expect(layers.has('L1')).toBe(true);
      expect(layers.has('L2')).toBe(true);
      expect(layers.has('L3')).toBe(true);
      expect(layers.has('L4')).toBe(true);
      expect(layers.has('governance')).toBe(true);
    });

    test('enterprise returns all agents', () => {
      const pool = new AgentPool(agentsDir);
      const enterprise = pool.getActiveAgents('enterprise');
      const all = pool.listAll();
      expect(enterprise.length).toBe(all.length);
    });
  });

  test('getRunner returns the underlying AgentRunner', () => {
    const pool = new AgentPool(agentsDir);
    const runner = pool.getRunner();
    expect(runner).toBeDefined();
    expect(typeof runner.runAgent).toBe('function');
  });

  test('handles non-existent directory gracefully', () => {
    const pool = new AgentPool('/tmp/nonexistent-agents-dir');
    expect(pool.listAll()).toEqual([]);
  });
});
