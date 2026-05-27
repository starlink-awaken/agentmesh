import { GovernanceCoordinator } from '../governance-coordinator';

export type PhaseStatus = 'INIT' | 'LOCKED' | 'ACTIVE' | 'RELEASED' | 'EXPIRED';

export interface PhaseLock {
  phaseId: string;
  agentId: string;
  status: PhaseStatus;
  lockedAt: number;
  expiresAt: number;
}

export class PhaseLockError extends Error {
  constructor(
    public code: 'PHASE_ALREADY_LOCKED' | 'PHASE_NOT_FOUND' | 'PHASE_EXPIRED',
    message: string,
  ) {
    super(message);
    this.name = 'PhaseLockError';
  }
}

export class PhaseLockManager {
  private locks = new Map<string, PhaseLock>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  lock(phaseId: string, agentId: string, durationMs: number): PhaseLock {
    const existing = this.locks.get(phaseId);
    if (existing && existing.status === 'LOCKED') {
      throw new PhaseLockError('PHASE_ALREADY_LOCKED', `Phase ${phaseId} already locked by ${existing.agentId}`);
    }
    const now = Date.now();
    const lock: PhaseLock = {
      phaseId,
      agentId,
      status: 'LOCKED',
      lockedAt: now,
      expiresAt: now + durationMs,
    };
    this.locks.set(phaseId, lock);
    this.timers.get(phaseId) && clearTimeout(this.timers.get(phaseId)!);
    this.timers.set(phaseId, setTimeout(() => {
      const l = this.locks.get(phaseId);
      if (l && l.status === 'LOCKED') {
        l.status = 'EXPIRED';
        this.locks.set(phaseId, l);
      }
    }, durationMs));
    return lock;
  }

  unlock(phaseId: string, agentId: string): void {
    const lock = this.locks.get(phaseId);
    if (!lock) {
      throw new PhaseLockError('PHASE_NOT_FOUND', `Phase ${phaseId} not found`);
    }
    if (lock.agentId !== agentId) {
      throw new PhaseLockError('PHASE_ALREADY_LOCKED', `Phase ${phaseId} is locked by ${lock.agentId}, not ${agentId}`);
    }
    lock.status = 'RELEASED';
    this.timers.get(phaseId) && clearTimeout(this.timers.get(phaseId)!);
  }

  isLocked(phaseId: string): boolean {
    const lock = this.locks.get(phaseId);
    if (!lock) return false;
    if (lock.status === 'EXPIRED' || (Date.now() > lock.expiresAt && lock.status === 'LOCKED')) {
      lock.status = 'EXPIRED';
      return false;
    }
    return lock.status === 'LOCKED';
  }

  getCurrentPhase(agentId: string): string | undefined {
    for (const [, lock] of this.locks) {
      if (lock.agentId === agentId && (lock.status === 'LOCKED' || lock.status === 'ACTIVE')) {
        return lock.phaseId;
      }
    }
    return undefined;
  }

  getAllLocks(): PhaseLock[] {
    return Array.from(this.locks.values());
  }

  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.locks.clear();
    this.timers.clear();
  }
}
