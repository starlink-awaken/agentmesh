import { describe, it, expect } from 'bun:test';
import { PhaseLockManager, PhaseLockError } from '../index';

describe('PhaseLockManager', () => {
  const manager = new PhaseLockManager();

  it('lock acquires a phase', () => {
    const lock = manager.lock('phase-1', 'agent-alpha', 5000);
    expect(lock.phaseId).toBe('phase-1');
    expect(lock.agentId).toBe('agent-alpha');
    expect(lock.status).toBe('LOCKED');
  });

  it('isLocked returns true for locked phase', () => {
    expect(manager.isLocked('phase-1')).toBe(true);
  });

  it('double lock throws error', () => {
    expect(() => manager.lock('phase-1', 'agent-beta', 5000)).toThrow(PhaseLockError);
  });

  it('unlock releases a phase', () => {
    const m = new PhaseLockManager();
    m.lock('phase-u', 'agent-alpha', 5000);
    m.unlock('phase-u', 'agent-alpha');
    expect(m.isLocked('phase-u')).toBe(false);
  });

  it('unlock by wrong agent throws', () => {
    const m = new PhaseLockManager();
    m.lock('phase-w', 'agent-alpha', 5000);
    expect(() => m.unlock('phase-w', 'agent-beta')).toThrow(PhaseLockError);
  });

  it('expiry auto-releases after timeout', async () => {
    const m = new PhaseLockManager();
    m.lock('phase-e', 'agent-alpha', 10);
    await new Promise(r => setTimeout(r, 50));
    expect(m.isLocked('phase-e')).toBe(false);
  });

  it('getCurrentPhase returns locked phase for agent', () => {
    const m = new PhaseLockManager();
    m.lock('phase-g', 'agent-alpha', 5000);
    expect(m.getCurrentPhase('agent-alpha')).toBe('phase-g');
    expect(m.getCurrentPhase('unknown-agent')).toBeUndefined();
  });

  it('clear releases all locks', () => {
    const m = new PhaseLockManager();
    m.lock('phase-c1', 'agent-a', 5000);
    m.lock('phase-c2', 'agent-b', 5000);
    m.clear();
    expect(m.isLocked('phase-c1')).toBe(false);
    expect(m.getAllLocks()).toHaveLength(0);
  });
});
