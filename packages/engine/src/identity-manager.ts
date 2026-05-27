import { AgentDefinition } from './types';

// ============================================================
// A1: Agent 身份声明类型定义
// ============================================================

export type SovereigntyLevel = 'FULL' | 'CONDITIONAL' | 'OBSERVE';

export interface AgentCapability {
  id: string;
  description: string;
}

export interface AgentIdentity {
  id: string;
  name: string;
  role: string;
  sovereigntyLevel: SovereigntyLevel;
  capabilities: AgentCapability[];
}

export interface IdentityValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================
// IdentityManager
// ============================================================

export class IdentityManager {
  private identities = new Map<string, AgentIdentity>();

  /**
   * 从 AgentDefinition 提取 AgentIdentity。
   * 当 AgentDefinition 中包含 agentIdentity 字段时，直接使用；
   * 否则从 name/capabilities 推断。
   */
  declare(agent: AgentDefinition): AgentIdentity {
    const id = this.generateId(agent.name);
    const identity: AgentIdentity = {
      id: agent.name ? `agent://${agent.name.toLowerCase().replace(/\s+/g, '-')}` : id,
      name: agent.name || id,
      role: agent.description || 'generic agent',
      sovereigntyLevel: 'CONDITIONAL',
      capabilities: (agent.capabilities || []).map((cap: string) => ({
        id: cap,
        description: cap,
      })),
    };
    return identity;
  }

  /**
   * 校验 AgentIdentity 字段完整性与格式。
   */
  validate(identity: AgentIdentity): IdentityValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!identity.id || identity.id.length === 0) {
      errors.push('A1.2: identity.id is required');
    } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_\-]*)+$/.test(identity.id)) {
      errors.push(`A1.2: identity.id "${identity.id}" is not valid reverse-DNS format`);
    }

    if (!identity.name || identity.name.length === 0) {
      errors.push('A1.3: identity.name is required');
    }

    if (!identity.role || identity.role.length === 0) {
      errors.push('A1.4: identity.role is required');
    }

    const validLevels: SovereigntyLevel[] = ['FULL', 'CONDITIONAL', 'OBSERVE'];
    if (!identity.sovereigntyLevel || !validLevels.includes(identity.sovereigntyLevel)) {
      errors.push(`A1.5: sovereigntyLevel must be one of: ${validLevels.join(', ')}`);
    }

    if (!identity.capabilities || identity.capabilities.length === 0) {
      errors.push('A1.6: capabilities list cannot be empty');
    } else {
      for (let i = 0; i < identity.capabilities.length; i++) {
        const cap = identity.capabilities[i];
        if (!cap.id || cap.id.length === 0) {
          errors.push(`A1.6: capabilities[${i}] missing id`);
        }
        if (!cap.description || cap.description.length === 0) {
          warnings.push(`A1.6: capabilities[${i}] ("${cap.id || ''}") missing description`);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * 注册身份到管理器。
   */
  registerAgent(agentId: string, identity: AgentIdentity): void {
    this.identities.set(agentId, identity);
  }

  /**
   * 查询已注册的身份。
   */
  getIdentity(agentId: string): AgentIdentity | undefined {
    return this.identities.get(agentId);
  }

  /**
   * 列出所有已注册的身份。
   */
  getAllIdentities(): AgentIdentity[] {
    return Array.from(this.identities.values());
  }

  private generateId(name: string): string {
    return `urn:hermes:agent:${name.toLowerCase().replace(/\s+/g, '-')}`;
  }
}
