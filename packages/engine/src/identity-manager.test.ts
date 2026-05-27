import { describe, it, expect } from 'bun:test';
import { IdentityManager, type AgentIdentity, type SovereigntyLevel } from './identity-manager';
import { RiskLevel, type AgentDefinition } from './types';

describe('IdentityManager', () => {
  const manager = new IdentityManager();

  it('declare extracts identity from AgentDefinition', () => {
    const agent: AgentDefinition = {
      name: 'hermes-agent',
      description: 'multi-agent orchestration runtime',
      capabilities: ['agent-lifecycle', 'task-routing', 'state-persistence'],
      type: 'worker' as const,
      layer: 'L3' as const,
      domain: 'orchestration',
      prompt_path: '/tmp/prompt.md',
      tools: [],
      embedded_governance: {
        first_principles_check: true,
        red_team_threshold: RiskLevel.LOW,
        quality_gate_enabled: true,
        max_retries: 3,
        token_budget: 10000,
      },
    };
    const identity = manager.declare(agent);
    expect(identity).toBeDefined();
    expect(identity.id).toContain('hermes-agent');
    expect(identity.role).toBe('multi-agent orchestration runtime');
    expect(identity.capabilities).toHaveLength(3);
  });

  it('validate passes for valid identity', () => {
    const identity: AgentIdentity = {
      id: 'io.github.xiamingxing.hermes-agent',
      name: 'Hermes Orchestrator',
      role: 'multi-agent orchestration runtime',
      sovereigntyLevel: 'FULL',
      capabilities: [
        { id: 'agent-lifecycle', description: 'manage agent lifecycle' },
        { id: 'task-routing', description: 'route tasks to capable agents' },
      ],
    };
    const result = manager.validate(identity);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validate rejects missing id', () => {
    const identity: AgentIdentity = {
      id: '',
      name: 'Test Agent',
      role: 'testing',
      sovereigntyLevel: 'CONDITIONAL',
      capabilities: [{ id: 'test', description: 'testing' }],
    };
    const result = manager.validate(identity);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validate rejects invalid reverse-DNS id', () => {
    const identity: AgentIdentity = {
      id: 'bad-format',
      name: 'Test Agent',
      role: 'testing',
      sovereigntyLevel: 'CONDITIONAL',
      capabilities: [{ id: 'test', description: 'testing' }],
    };
    const result = manager.validate(identity);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('reverse-DNS'))).toBe(true);
  });

  it('validate rejects invalid sovereignty level', () => {
    const identity = {
      id: 'io.github.test',
      name: 'Test Agent',
      role: 'testing',
      sovereigntyLevel: 'ULTIMATE',
      capabilities: [{ id: 'test', description: 'testing' }],
    };
    const result = manager.validate(identity as unknown as AgentIdentity);
    expect(result.valid).toBe(false);
  });

  it('validate warns when capabilities missing description', () => {
    const identity: AgentIdentity = {
      id: 'io.github.test',
      name: 'Test Agent',
      role: 'testing',
      sovereigntyLevel: 'OBSERVE',
      capabilities: [{ id: 'test-only', description: '' }],
    };
    const result = manager.validate(identity);
    expect(result.valid).toBe(true); // errors should still be 0
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('register and get identity round-trip', () => {
    const identity: AgentIdentity = {
      id: 'io.github.roundtrip',
      name: 'Round Trip',
      role: 'test agent',
      sovereigntyLevel: 'CONDITIONAL',
      capabilities: [{ id: 'roundtrip', description: 'test roundtrip' }],
    };
    manager.registerAgent('test-agent', identity);
    const retrieved = manager.getIdentity('test-agent');
    expect(retrieved).toEqual(identity);
  });

  it('getAllIdentities returns all registered identities', () => {
    const all = manager.getAllIdentities();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });
});
