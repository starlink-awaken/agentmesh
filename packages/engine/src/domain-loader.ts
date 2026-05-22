/**
 * Honeycomb v2 - 域加载器
 *
 * 从 JSON 文件加载域特定配置，验证它们，
 * 并提供将域默认值与项目配置合并的工具。
 *
 * 域目录结构：
 *   {domainsRoot}/
 *     software/
 *       domain.json
 *       agents/
 *       templates/
 *     creative-writing/
 *       domain.json
 *       agents/
 *       templates/
 *
 * @since v2.0.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  DomainConfig,
  ProjectArchetype,
  ProjectConfig,
  AgentDefinition,
  ComplexityLevel,
  Phase,
  QualityGate,
} from './types.js';
import { AgentRunner } from './agent-runner.js';
import { validateDomainConfig, type ValidationResult } from './domain-schema.js';

// ============================================================
// Constants
// ============================================================

/** Map archetype to domain directory name */
const ARCHETYPE_TO_DIR: Record<ProjectArchetype, string | null> = {
  'software-dev': 'software',
  'creative-writing': 'creative-writing',
  'visual-production': 'visual-production',
  'document-processing': 'document-processing',
  'data-science': 'data-science',
  'custom': null, // No domain directory for custom archetype
};

// ============================================================
// DomainLoader Class
// ============================================================

export class DomainLoader {
  private domainsRoot: string;

  /**
   * Create a new DomainLoader instance.
   * @param domainsRoot - Absolute path to the domains root directory
   */
  constructor(domainsRoot: string) {
    this.domainsRoot = path.resolve(domainsRoot);
  }

  /**
   * Load domain configuration from domain.json file.
   * Validates required fields and merges with defaults.
   *
   * @param archetype - The project archetype to load domain config for
   * @returns Validated domain configuration
   * @throws Error if domain directory or domain.json not found, or validation fails
   */
  loadDomain(archetype: ProjectArchetype): DomainConfig {
    const domainDir = this.getDomainDirectory(archetype);

    if (!domainDir) {
      // For 'custom' archetype, return default config
      return this.getDefaultDomainConfig(archetype);
    }

    const domainPath = path.join(this.domainsRoot, domainDir);
    const configPath = path.join(domainPath, 'domain.json');

    if (!fs.existsSync(domainPath)) {
      throw new Error(`Domain directory not found: ${domainPath}`);
    }

    if (!fs.existsSync(configPath)) {
      throw new Error(`Domain configuration file not found: ${configPath}`);
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return this.validateDomainConfig(parsed);
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(`Invalid JSON in domain config: ${configPath} - ${err.message}`);
      }
      throw err;
    }
  }

  /**
   * List available domain directories.
   * Returns directory names that exist under the domains root.
   *
   * @returns Array of domain directory names
   */
  listDomains(): string[] {
    if (!fs.existsSync(this.domainsRoot)) {
      return [];
    }

    try {
      const entries = fs.readdirSync(this.domainsRoot, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Validate and type-narrow a raw JSON object to DomainConfig.
   *
   * @param config - Unknown object from JSON.parse
   * @returns Validated DomainConfig
   * @throws Error if validation fails
   */
  validateDomainConfig(config: unknown): DomainConfig {
    // Check for null/undefined config first
    if (config === null || typeof config !== 'object') {
      throw new Error('Domain config must be an object');
    }

    // Check for array config (common mistake)
    if (Array.isArray(config)) {
      throw new Error('Domain config must be an object, not an array');
    }

    const obj = config as Record<string, unknown>;

    // Check for missing or empty required fields before schema validation
    // to match old error message format
    const requiredFields = ['name', 'description', 'archetype', 'version'] as const;
    for (const field of requiredFields) {
      const value = obj[field];
      if (value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '')) {
        throw new Error(`Domain config missing required field: ${field}`);
      }
    }

    // Use schema-based validation for comprehensive checking
    const schemaResult: ValidationResult = validateDomainConfig(config);

    if (!schemaResult.valid) {
      // Format error messages to match expected format
      // For missing required fields, use old-style error messages for backward compatibility
      for (const err of schemaResult.errors) {
        if (err.message === 'Required field is missing') {
          const fieldName = err.path.replace('$.', '');
          throw new Error(`Domain config missing required field: ${fieldName}`);
        }
      }

      // For other errors, use detailed format
      const errorMessages = schemaResult.errors.map(err => {
        return `  ${err.path}: ${err.message}${err.expected ? ` (expected: ${err.expected})` : ''}`;
      }).join('\n');
      throw new Error(
        `Domain configuration validation failed:\n${errorMessages}` +
        (schemaResult.errors.length > 0 ? '\nPlease check your domain.json file.' : '')
      );
    }

    // Schema validation passed, now type-narrow and return

    // Validate optional fields with defaults
    const phase_prompts = this.validatePhasePrompts(obj.phase_prompts);
    const agent_overrides = this.validateAgentOverrides(obj.agent_overrides);
    const defaults = this.validateDomainDefaults(obj.defaults);
    const templates = this.validateTemplates(obj.templates);
    const quality_gates = this.validateQualityGates(obj.quality_gates);

    return {
      name: obj.name as string,
      description: obj.description as string,
      archetype: obj.archetype as ProjectArchetype,
      version: obj.version as string,
      phase_prompts,
      agent_overrides,
      defaults,
      templates,
      quality_gates,
    };
  }

  /**
   * Validate domain configuration without throwing.
   * Returns validation result with errors and warnings.
   *
   * @param config - Configuration to validate
   * @returns Validation result
   */
  validateDomainConfigSafe(config: unknown): ValidationResult {
    return validateDomainConfig(config);
  }

  /**
   * Get sensible default domain configuration for any archetype.
   *
   * @param archetype - The project archetype
   * @returns Default domain configuration
   */
  getDefaultDomainConfig(archetype: ProjectArchetype): DomainConfig {
    return {
      name: `Default ${archetype}`,
      description: `Default configuration for ${archetype} archetype`,
      archetype,
      version: '1.0.0',
      phase_prompts: {},
      agent_overrides: {},
      defaults: {},
      templates: {},
      quality_gates: [],
    };
  }

  /**
   * Merge domain defaults into project configuration.
   * Project settings always override domain defaults.
   *
   * @param domain - Domain configuration
   * @param project - Project configuration
   * @returns Merged project configuration
   */
  mergeDomainWithProject(domain: DomainConfig, project: ProjectConfig): ProjectConfig {
    return {
      ...project,
      // Project-specific overrides take precedence
      complexity: project.complexity ?? domain.defaults.complexity,
      token_budget: project.token_budget ?? domain.defaults.token_budget,
      // Merge quality gates: domain gates + project gates
      quality_gates: [
        ...domain.quality_gates,
        ...(project.quality_gates ?? []),
      ],
    };
  }

  /**
   * Load additional agent definitions from domain's agents/ directory.
   * Uses AgentRunner's parser to parse agent markdown files.
   *
   * @param archetype - The project archetype
   * @returns Array of agent definitions, or empty array if no agents directory
   */
  loadDomainAgents(archetype: ProjectArchetype): AgentDefinition[] {
    const domainDir = this.getDomainDirectory(archetype);

    if (!domainDir) {
      return [];
    }

    const agentsPath = path.join(this.domainsRoot, domainDir, 'agents');

    if (!fs.existsSync(agentsPath)) {
      return [];
    }

    try {
      const runner = new AgentRunner();
      const mdFiles = this.findMarkdownFiles(agentsPath);
      const definitions: AgentDefinition[] = [];

      for (const filePath of mdFiles) {
        try {
          const definition = runner.parseAgentDefinition(filePath);
          definitions.push(definition);
        } catch {
          // Skip files that don't conform to agent Markdown format
        }
      }

      return definitions;
    } catch {
      return [];
    }
  }

  /**
   * Load a named template from domain's templates/ directory.
   *
   * @param archetype - The project archetype
   * @param templateName - Template file name (without extension)
   * @returns Template content as string, or null if not found
   */
  loadTemplate(archetype: ProjectArchetype, templateName: string): string | null {
    const domainDir = this.getDomainDirectory(archetype);

    if (!domainDir) {
      return null;
    }

    const templatesPath = path.join(this.domainsRoot, domainDir, 'templates');
    const templatePath = path.join(templatesPath, `${templateName}.md`);

    if (!fs.existsSync(templatePath)) {
      return null;
    }

    try {
      return fs.readFileSync(templatePath, 'utf-8');
    } catch {
      return null;
    }
  }

  // ----------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------

  /**
   * Get domain directory name for an archetype.
   * Returns null for 'custom' archetype.
   */
  private getDomainDirectory(archetype: ProjectArchetype): string | null {
    return ARCHETYPE_TO_DIR[archetype];
  }

  /**
   * Recursively find all markdown files in a directory.
   */
  private findMarkdownFiles(dir: string): string[] {
    const results: string[] = [];

    if (!fs.existsSync(dir)) {
      return results;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.findMarkdownFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }

    return results;
  }

  /**
   * Validate phase_prompts field.
   */
  private validatePhasePrompts(value: unknown): Partial<Record<Phase, string>> {
    if (value === undefined || value === null) {
      return {};
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Domain config field "phase_prompts" must be an object');
    }

    const obj = value as Record<string, unknown>;
    const result: Partial<Record<Phase, string>> = {};

    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string') {
        result[key as Phase] = val;
      }
    }

    return result;
  }

  /**
   * Validate agent_overrides field.
   */
  private validateAgentOverrides(value: unknown): Record<string, {
    enabled: boolean;
    priority?: number;
    custom_prompt?: string;
    tools_override?: string[];
    token_budget_override?: number;
  }> {
    if (value === undefined || value === null) {
      return {};
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Domain config field "agent_overrides" must be an object');
    }

    const obj = value as Record<string, unknown>;
    const result: Record<string, {
      enabled: boolean;
      priority?: number;
      custom_prompt?: string;
      tools_override?: string[];
      token_budget_override?: number;
    }> = {};

    for (const [agentName, override] of Object.entries(obj)) {
      if (typeof override !== 'object' || override === null || Array.isArray(override)) {
        throw new Error(`Agent override for "${agentName}" must be an object`);
      }

      const overrideObj = override as Record<string, unknown>;

      if (typeof overrideObj.enabled !== 'boolean') {
        throw new Error(`Agent override for "${agentName}" missing required field: enabled (must be boolean)`);
      }

      result[agentName] = {
        enabled: overrideObj.enabled,
        priority: typeof overrideObj.priority === 'number' ? overrideObj.priority : undefined,
        custom_prompt: typeof overrideObj.custom_prompt === 'string' ? overrideObj.custom_prompt : undefined,
        tools_override: Array.isArray(overrideObj.tools_override) ? overrideObj.tools_override as string[] : undefined,
        token_budget_override: typeof overrideObj.token_budget_override === 'number' ? overrideObj.token_budget_override : undefined,
      };
    }

    return result;
  }

  /**
   * Validate defaults field.
   */
  private validateDomainDefaults(value: unknown): {
    complexity?: ComplexityLevel;
    token_budget?: number;
    max_concurrent_agents?: number;
    risk_thresholds_override?: Partial<{
      file_count: { low: number; medium: number; high: number };
      security_keywords_enabled: boolean;
    }>;
  } {
    if (value === undefined || value === null) {
      return {};
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Domain config field "defaults" must be an object');
    }

    const obj = value as Record<string, unknown>;

    return {
      complexity: typeof obj.complexity === 'string' ? obj.complexity as ComplexityLevel : undefined,
      token_budget: typeof obj.token_budget === 'number' ? obj.token_budget : undefined,
      max_concurrent_agents: typeof obj.max_concurrent_agents === 'number' ? obj.max_concurrent_agents : undefined,
      risk_thresholds_override: typeof obj.risk_thresholds_override === 'object' ? obj.risk_thresholds_override as any : undefined,
    };
  }

  /**
   * Validate templates field.
   */
  private validateTemplates(value: unknown): Record<string, string> {
    if (value === undefined || value === null) {
      return {};
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Domain config field "templates" must be an object');
    }

    const obj = value as Record<string, unknown>;
    const result: Record<string, string> = {};

    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string') {
        result[key] = val;
      }
    }

    return result;
  }

  /**
   * Validate quality_gates field with automatic migration.
   * 旧格式（pass_condition）自动转换为新格式（expression）
   */
  private validateQualityGates(value: unknown): QualityGate[] {
    if (value === undefined || value === null) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new Error('Domain config field "quality_gates" must be an array');
    }

    return value.map((gate, index) => {
      if (typeof gate !== 'object' || gate === null) {
        throw new Error(`Quality gate at index ${index} must be an object`);
      }

      const gateObj = gate as Record<string, unknown>;

      if (typeof gateObj.name !== 'string') {
        throw new Error(`Quality gate at index ${index} missing required field: name`);
      }

      if (typeof gateObj.phase !== 'string') {
        throw new Error(`Quality gate at index ${index} missing required field: phase`);
      }

      if (!Array.isArray(gateObj.criteria)) {
        throw new Error(`Quality gate at index ${index} missing required field: criteria (must be array)`);
      }

      if (typeof gateObj.mandatory !== 'boolean') {
        throw new Error(`Quality gate at index ${index} missing required field: mandatory (must be boolean)`);
      }

      // 自动迁移 criteria 数组：转换 pass_condition → expression
      const criteria = this.migrateCriteria(gateObj.criteria, index);

      return {
        name: gateObj.name,
        phase: gateObj.phase as Phase,
        criteria,
        mandatory: gateObj.mandatory,
        description: typeof gateObj.description === 'string' ? gateObj.description : undefined,
        config_file: typeof gateObj.config_file === 'string' ? gateObj.config_file : undefined,
        failure_action: typeof gateObj.failure_action === 'string' ? gateObj.failure_action as 'block' | 'warn' : undefined,
      };
    });
  }

  /**
   * 迁移质量门禁标准到 ISC 表达式格式
   * 支持三种格式：
   * 1. 字符串数组（简化描述） - 自动转换为对象
   * 2. 旧格式对象（有 pass_condition 但没有 expression）- 执行迁移
   * 3. 新格式对象（有 expression）- 直接使用
   */
  private migrateCriteria(criteria: unknown, gateIndex: number): import('./types.js').QualityGateCriterion[] {
    if (!Array.isArray(criteria)) {
      throw new Error(`Quality gate at index ${gateIndex} criteria must be an array`);
    }

    return criteria.map((criterion, critIndex) => {
      // === 格式1：字符串数组（domain.json 中的简化描述） ===
      if (typeof criterion === 'string') {
        console.log(
          `[Migration] Converting string criterion to object: ` +
          `gate[${gateIndex}].criteria[${critIndex}]="${criterion}"`
        );

        // 自动生成对象格式
        return {
          id: `criterion-${gateIndex}-${critIndex}`,
          name: criterion,
          description: criterion,
          expression: criterion,  // ← 字符串直接作为 expression
          pass_condition: criterion,  // ← 保留旧字段（兼容）
          expected_variables: this.extractVariables(criterion),
        };
      }

      // === 格式2和3：对象格式（完整配置） ===
      if (typeof criterion !== 'object' || criterion === null) {
        throw new Error(
          `Criterion at index ${critIndex} must be an object or string`
        );
      }

      const critObj = criterion as Record<string, unknown>;

      // === 格式2：旧格式对象（有 pass_condition 但没有 expression） ===
      if (critObj.pass_condition && !critObj.expression) {
        console.log(
          `[Migration] Auto-converting pass_condition to expression: ` +
          `gate[${gateIndex}].criteria[${critIndex}].id=${critObj.id}`
        );

        // 自动转换：pass_condition → expression
        return {
          id: critObj.id as string,
          name: critObj.name as string,
          description: typeof critObj.description === 'string' ? critObj.description : undefined,
          expression: critObj.pass_condition as string,  // ← 迁移到新字段
          pass_condition: critObj.pass_condition as string,  // ← 保留旧字段（兼容）
          expected_variables: this.extractVariables(critObj.pass_condition as string),
          threshold: typeof critObj.threshold === 'number' ? critObj.threshold : undefined,
          unit: typeof critObj.unit === 'string' ? critObj.unit : undefined,
          mandatory: typeof critObj.mandatory === 'boolean' ? critObj.mandatory : undefined,
          failure_action: typeof critObj.failure_action === 'string' ? critObj.failure_action as 'block' | 'warn' : undefined,
          help_url: typeof critObj.help_url === 'string' ? critObj.help_url : undefined,
        };
      }

      // === 格式3：新格式或混合格式（有 expression） ===
      // 已经是新格式或混合格式，直接返回
      return {
        id: critObj.id as string,
        name: critObj.name as string,
        description: typeof critObj.description === 'string' ? critObj.description : undefined,
        expression: typeof critObj.expression === 'string' ? critObj.expression : undefined,
        pass_condition: typeof critObj.pass_condition === 'string' ? critObj.pass_condition : undefined,
        expected_variables: Array.isArray(critObj.expected_variables) ? critObj.expected_variables as string[] : undefined,
        threshold: typeof critObj.threshold === 'number' ? critObj.threshold : undefined,
        unit: typeof critObj.unit === 'string' ? critObj.unit : undefined,
        mandatory: typeof critObj.mandatory === 'boolean' ? critObj.mandatory : undefined,
        failure_action: typeof critObj.failure_action === 'string' ? critObj.failure_action as 'block' | 'warn' : undefined,
        help_url: typeof critObj.help_url === 'string' ? critObj.help_url : undefined,
      };
    });
  }

  /**
   * 从表达式中提取变量名
   * 简单实现：识别标识符（支持点号访问）
   */
  private extractVariables(expression: string): string[] {
    const identifiers = expression.match(/([a-zA-Z_][a-zA-Z0-9_.]*)/g) || [];
    // 过滤掉操作符和关键字
    const keywords = ['true', 'false', 'AND', 'OR', 'NOT', 'and', 'or', 'not'];
    return [...new Set(identifiers)].filter(id => !keywords.includes(id));
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create a new DomainLoader instance.
 *
 * @param domainsRoot - Absolute path to the domains root directory
 * @returns New DomainLoader instance
 */
export function createDomainLoader(domainsRoot: string): DomainLoader {
  return new DomainLoader(domainsRoot);
}
