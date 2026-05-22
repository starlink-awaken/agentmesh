/**
 * Honeycomb v2 - 配置加载器
 *
 * 从 JSON 文件加载引擎和项目配置。
 * 提供复杂度评估和合理的默认值。
 *
 * @since v2.0.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  EngineConfig,
  ProjectConfig,
  ComplexityLevel,
  RiskThresholds,
} from './types.js';

// ============================================================
// Default Configuration
// ============================================================

const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  file_count: { low: 3, medium: 10, high: 20 },
  security_keywords_enabled: true,
  custom_rules: [],
};

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  db_path: './honeycomb.db',
  agents_root: '../agents',
  domains_root: '../domains',
  output_dir: './docs/honeycomb',
  log_level: 'info',
  default_token_budget: 100000,
  max_concurrent_agents: 5,
  auto_checkpoint: true,
  risk_thresholds: { ...DEFAULT_RISK_THRESHOLDS },
};

// ============================================================
// ConfigLoader Class
// ============================================================

export class ConfigLoader {
  /**
   * Load engine configuration from a JSON file.
   * If the file does not exist, returns the default configuration.
   */
  loadEngineConfig(configPath?: string): EngineConfig {
    if (!configPath) {
      return this.getDefaultConfig();
    }

    const resolved = path.resolve(configPath);

    if (!fs.existsSync(resolved)) {
      return this.getDefaultConfig();
    }

    try {
      const raw = fs.readFileSync(resolved, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<EngineConfig>;
      return this.mergeWithDefaults(parsed);
    } catch {
      return this.getDefaultConfig();
    }
  }

  /**
   * Load a project configuration from a JSON file.
   * Throws if the file does not exist or cannot be parsed.
   */
  loadProjectConfig(configPath: string): ProjectConfig {
    const resolved = path.resolve(configPath);

    if (!fs.existsSync(resolved)) {
      throw new Error(`Project config not found: ${resolved}`);
    }

    const raw = fs.readFileSync(resolved, 'utf-8');
    const parsed = JSON.parse(raw) as ProjectConfig;

    // Validate required fields
    if (!parsed.name || typeof parsed.name !== 'string') {
      throw new Error('Project config missing required field: name');
    }
    if (!parsed.description || typeof parsed.description !== 'string') {
      throw new Error('Project config missing required field: description');
    }
    if (!parsed.archetype || typeof parsed.archetype !== 'string') {
      throw new Error('Project config missing required field: archetype');
    }
    if (!Array.isArray(parsed.goals)) {
      throw new Error('Project config missing required field: goals (must be an array)');
    }

    return parsed;
  }

  /**
   * Assess project complexity based on goals count and other factors.
   *
   * Rules:
   *   goals <= 3            -> simple
   *   goals <= 7            -> standard
   *   goals <= 15           -> advanced
   *   goals > 15            -> enterprise
   *
   * Modifiers:
   *   - constraints count > 5 bumps up one level
   *   - archetype 'custom' bumps up one level
   */
  assessComplexity(config: ProjectConfig): ComplexityLevel {
    const goalsCount = config.goals.length;
    const constraintsCount = config.constraints?.length ?? 0;

    // Base level from goals count
    let level: ComplexityLevel;
    if (goalsCount <= 3) {
      level = 'simple';
    } else if (goalsCount <= 7) {
      level = 'standard';
    } else if (goalsCount <= 15) {
      level = 'advanced';
    } else {
      level = 'enterprise';
    }

    // Modifiers: bump up one level if complexity signals are high
    const shouldBump = constraintsCount > 5 || config.archetype === 'custom';

    if (shouldBump) {
      level = this.bumpComplexity(level);
    }

    return level;
  }

  /**
   * Return a fresh copy of the default engine configuration.
   */
  getDefaultConfig(): EngineConfig {
    return {
      ...DEFAULT_ENGINE_CONFIG,
      risk_thresholds: {
        ...DEFAULT_ENGINE_CONFIG.risk_thresholds,
        file_count: { ...DEFAULT_ENGINE_CONFIG.risk_thresholds.file_count },
        custom_rules: [...DEFAULT_ENGINE_CONFIG.risk_thresholds.custom_rules],
      },
    };
  }

  // ----------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------

  /**
   * Deep-merge user-provided partial config with defaults.
   */
  private mergeWithDefaults(partial: Partial<EngineConfig>): EngineConfig {
    const defaults = this.getDefaultConfig();

    const merged: EngineConfig = {
      db_path: partial.db_path ?? defaults.db_path,
      agents_root: partial.agents_root ?? defaults.agents_root,
      domains_root: partial.domains_root ?? defaults.domains_root,
      output_dir: partial.output_dir ?? defaults.output_dir,
      log_level: partial.log_level ?? defaults.log_level,
      default_token_budget: partial.default_token_budget ?? defaults.default_token_budget,
      max_concurrent_agents: partial.max_concurrent_agents ?? defaults.max_concurrent_agents,
      auto_checkpoint: partial.auto_checkpoint ?? defaults.auto_checkpoint,
      risk_thresholds: this.mergeRiskThresholds(
        partial.risk_thresholds,
        defaults.risk_thresholds,
      ),
    };

    // Preserve optional log_file if provided
    if (partial.log_file !== undefined) {
      merged.log_file = partial.log_file;
    }

    return merged;
  }

  /**
   * Merge risk thresholds with defaults.
   */
  private mergeRiskThresholds(
    partial: Partial<RiskThresholds> | undefined,
    defaults: RiskThresholds,
  ): RiskThresholds {
    if (!partial) return { ...defaults, file_count: { ...defaults.file_count }, custom_rules: [...defaults.custom_rules] };

    return {
      file_count: partial.file_count
        ? { ...defaults.file_count, ...partial.file_count }
        : { ...defaults.file_count },
      security_keywords_enabled: partial.security_keywords_enabled ?? defaults.security_keywords_enabled,
      custom_rules: partial.custom_rules ?? [...defaults.custom_rules],
    };
  }

  /**
   * Bump complexity one level up. Enterprise is the ceiling.
   */
  private bumpComplexity(level: ComplexityLevel): ComplexityLevel {
    switch (level) {
      case 'simple':
        return 'standard';
      case 'standard':
        return 'advanced';
      case 'advanced':
        return 'enterprise';
      case 'enterprise':
        return 'enterprise';
    }
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create a new ConfigLoader instance.
 */
export function createConfigLoader(): ConfigLoader {
  return new ConfigLoader();
}
