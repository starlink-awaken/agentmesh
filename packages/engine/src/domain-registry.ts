/**
 * Honeycomb v2 - Domain Registry
 *
 * Provides sensible default values for domain configurations,
 * reducing boilerplate in per-domain JSON files. The DomainLoader
 * uses this registry to fill in missing config fields.
 *
 * Design: Option A from ISA — DomainRegistry provides defaults,
 * works with existing JSON config loading, doesn't change DomainLoader API.
 *
 * What gets defaulted:
 *  - version: "1.0.0" (shared by all domains)
 *  - defaults.complexity: "standard" (shared by all domains)
 *  - defaults.token_budget: 100000 (sensible fallback)
 *  - defaults.max_concurrent_agents: 3 (sensible fallback)
 *
 * What stays domain-specific (not defaulted):
 *  - phase_prompts, agent_overrides, templates, quality_gates
 *  - name, description, archetype (must be provided)
 *
 * @since v2.0.0
 */

import type {
  DomainConfig,
  DomainDefaults,
  Phase,
  ProjectArchetype,
  QualityGate,
  AgentOverride,
} from './types.js';

// ============================================================
// DomainRegistry Configuration
// ============================================================

/**
 * Configuration for DomainRegistry base values.
 * All fields are optional — defaults will be used for unspecified values.
 */
export interface DomainRegistryConfig {
  /** Base phase prompts (domain-specific prompts override these) */
  basePrompts?: Partial<Record<Phase, string>>;
  /** Base agent overrides (domain-specific overrides merge into these) */
  baseAgentOverrides?: Record<string, AgentOverride>;
  /** Base domain defaults (domain-specific values take precedence) */
  baseDefaults?: DomainDefaults;
  /** Base templates (domain-specific templates merge into these) */
  baseTemplates?: Record<string, string>;
  /** Base quality gates (domain-specific gates append to these) */
  baseQualityGates?: QualityGate[];
}

// ============================================================
// Default Values
// ============================================================

/** Default version for domain configurations */
const DEFAULT_VERSION = '1.0.0';

/** Default settings shared across all domains */
const DEFAULT_BASE_DEFAULTS: DomainDefaults = {
  complexity: 'standard',
  token_budget: 100000,
  max_concurrent_agents: 3,
};

// ============================================================
// DomainRegistry Class
// ============================================================

export class DomainRegistry {
  private basePrompts: Partial<Record<Phase, string>>;
  private baseDefaults: DomainDefaults;

  /**
   * Create a DomainRegistry with optional custom base config.
   *
   * @param config - Optional base configuration overrides
   */
  constructor(config?: DomainRegistryConfig) {
    this.basePrompts = config?.basePrompts ?? {};
    this.baseDefaults = config?.baseDefaults ?? { ...DEFAULT_BASE_DEFAULTS };
  }

  /**
   * Merge a partial domain configuration with registry defaults.
   *
   * User-provided values take precedence over registry defaults.
   * Required fields (name, description, archetype) are NOT filled in
   * by defaults — the caller must provide them, and validation will
   * catch any missing required fields.
   *
   * Domain-specific fields (phase_prompts, agent_overrides, templates,
   * quality_gates) are passed through as-is — the registry only
   * supplies defaults for truly shared boilerplate: version, complexity,
   * token_budget, and max_concurrent_agents.
   *
   * @param partial - Partial domain config from JSON file
   * @returns Complete DomainConfig with defaults filled in
   */
  getEffectiveConfig(
    partial: Partial<DomainConfig> & {
      name: string;
      description: string;
      archetype: ProjectArchetype;
    },
  ): DomainConfig {
    return {
      name: partial.name,
      description: partial.description,
      archetype: partial.archetype,
      version: partial.version ?? DEFAULT_VERSION,

      // Domain-specific fields: pass through user values, NO defaults
      phase_prompts: partial.phase_prompts ?? ({} as Partial<Record<Phase, string>>),
      agent_overrides: partial.agent_overrides ?? ({} as Record<string, AgentOverride>),
      templates: partial.templates ?? ({} as Record<string, string>),
      quality_gates: partial.quality_gates ?? [],

      // Shared boilerplate: registry defaults, user values override
      defaults: {
        ...this.baseDefaults,
        ...(partial.defaults ?? {}),
      },
    };
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create a new DomainRegistry with optional base config overrides.
 *
 * @param config - Optional base configuration overrides
 * @returns New DomainRegistry instance
 */
export function createDomainRegistry(config?: DomainRegistryConfig): DomainRegistry {
  return new DomainRegistry(config);
}
