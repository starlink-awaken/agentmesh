/**
 * Tests for new domain templates (visual-production, document-processing, data-science)
 * Tests domain loading, configuration validation, and integration with the engine.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DomainLoader, createDomainLoader } from '../src/domain-loader.ts';
import { validateDomainConfig, type ValidationResult } from '../src/domain-schema.js';
import type { DomainConfig, ProjectArchetype } from '../src/types.ts';

// Test domain configurations for new domains
const VISUAL_PRODUCTION_CONFIG = {
  name: 'visual-production',
  description: 'Visual production domain - comics, animation, video production, storyboard design, visual effects, and post-production across all media formats',
  archetype: 'visual-production' as ProjectArchetype,
  version: '1.0.0',
  phase_prompts: {
    research: 'Research visual style references, target audience demographics, platform specifications.',
    decision: 'Define visual style guide, choose art direction, establish color palette.',
    execution: 'Create visual assets following the storyboard and style guide.',
    feedback: 'Visual quality assessment with diverse perspectives, consistency check.',
    delivery: 'Final render including color grading, format for distribution platform.',
  },
  agent_overrides: {
    'visual-director': { enabled: true, priority: 10 },
    'storyboard-artist': { enabled: true, priority: 10 },
    'animator': { enabled: true, priority: 10 },
  },
  defaults: {
    complexity: 'standard' as const,
    token_budget: 350000,
    max_concurrent_agents: 8,
  },
  templates: {
    storyboard: 'templates/storyboard.md',
    'character-sheet': 'templates/character-sheet.md',
  },
  quality_gates: [
    {
      name: 'Visual Consistency',
      phase: 'execution' as const,
      criteria: ['Art style consistent across all frames'],
      mandatory: true,
    },
  ],
};

const DOCUMENT_PROCESSING_CONFIG = {
  name: 'document-processing',
  description: 'Document processing domain - technical documentation, compliance documents, API documentation, user guides, multi-format conversion.',
  archetype: 'document-processing' as ProjectArchetype,
  version: '1.0.0',
  phase_prompts: {
    research: 'Research document requirements, target audience, compliance standards.',
    decision: 'Define documentation structure, choose format and delivery method.',
    execution: 'Create documents following established templates and standards.',
    feedback: 'Technical accuracy review, clarity and readability assessment.',
    delivery: 'Final formatting for target platforms, generate multiple format versions.',
  },
  agent_overrides: {
    'technical-writer': { enabled: true, priority: 10 },
    'compliance-specialist': { enabled: true, priority: 9 },
  },
  defaults: {
    complexity: 'standard' as const,
    token_budget: 250000,
    max_concurrent_agents: 5,
  },
  templates: {
    'technical-guide': 'templates/technical-guide.md',
    'api-documentation': 'templates/api-documentation.md',
  },
  quality_gates: [
    {
      name: 'Technical Accuracy',
      phase: 'feedback' as const,
      criteria: ['All technical claims verified'],
      mandatory: true,
    },
  ],
};

const DATA_SCIENCE_CONFIG = {
  name: 'data-science',
  description: 'Data science domain - data analysis, machine learning, statistical modeling, data visualization, predictive analytics.',
  archetype: 'data-science' as ProjectArchetype,
  version: '1.0.0',
  phase_prompts: {
    research: 'Research data sources, quality issues, statistical requirements.',
    decision: 'Define analytical approach, select models and methods.',
    execution: 'Collect and clean data, implement models, run analyses.',
    feedback: 'Statistical validation review, methodology assessment.',
    delivery: 'Final analysis report, interactive dashboards, model documentation.',
  },
  agent_overrides: {
    'data-analyst': { enabled: true, priority: 10 },
    'ml-engineer': { enabled: true, priority: 10 },
  },
  defaults: {
    complexity: 'standard' as const,
    token_budget: 400000,
    max_concurrent_agents: 6,
  },
  templates: {
    'analysis-report': 'templates/analysis-report.md',
    'model-card': 'templates/model-card.md',
  },
  quality_gates: [
    {
      name: 'Data Quality',
      phase: 'execution' as const,
      criteria: ['Missing data within acceptable thresholds'],
      mandatory: true,
    },
  ],
};

describe('New Domain Integration Tests', () => {
  let tempDir: string;
  let loader: DomainLoader;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'hc-new-domains-test-'));
    loader = new DomainLoader(tempDir);
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // ============================================================
  // Visual Production Domain
  // ============================================================

  describe('visual-production domain', () => {
    test('validates configuration using schema validation', () => {
      const result: ValidationResult = validateDomainConfig(VISUAL_PRODUCTION_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('loads domain from JSON file', () => {
      const domainDir = join(tempDir, 'visual-production');
      mkdirSync(domainDir, { recursive: true });
      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(VISUAL_PRODUCTION_CONFIG, null, 2));

      const loaded = loader.loadDomain('visual-production');
      expect(loaded.name).toBe('visual-production');
      expect(loaded.archetype).toBe('visual-production');
      expect(loaded.version).toBe('1.0.0');
    });

    test('has correct agent overrides', () => {
      const result: ValidationResult = validateDomainConfig(VISUAL_PRODUCTION_CONFIG);
      expect(result.valid).toBe(true);

      const config = VISUAL_PRODUCTION_CONFIG as DomainConfig;
      expect(config.agent_overrides['visual-director'].enabled).toBe(true);
      expect(config.agent_overrides['storyboard-artist'].priority).toBe(10);
    });

    test('has valid quality gates', () => {
      const result: ValidationResult = validateDomainConfig(VISUAL_PRODUCTION_CONFIG);
      expect(result.valid).toBe(true);

      const config = VISUAL_PRODUCTION_CONFIG as DomainConfig;
      expect(config.quality_gates).toHaveLength(1);
      expect(config.quality_gates[0].name).toBe('Visual Consistency');
      expect(config.quality_gates[0].mandatory).toBe(true);
    });

    test('has correct default settings', () => {
      const result: ValidationResult = validateDomainConfig(VISUAL_PRODUCTION_CONFIG);
      expect(result.valid).toBe(true);

      const config = VISUAL_PRODUCTION_CONFIG as DomainConfig;
      expect(config.defaults.token_budget).toBe(350000);
      expect(config.defaults.max_concurrent_agents).toBe(8);
    });
  });

  // ============================================================
  // Document Processing Domain
  // ============================================================

  describe('document-processing domain', () => {
    test('validates configuration using schema validation', () => {
      const result: ValidationResult = validateDomainConfig(DOCUMENT_PROCESSING_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('loads domain from JSON file', () => {
      const domainDir = join(tempDir, 'document-processing');
      mkdirSync(domainDir, { recursive: true });
      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(DOCUMENT_PROCESSING_CONFIG, null, 2));

      const loaded = loader.loadDomain('document-processing');
      expect(loaded.name).toBe('document-processing');
      expect(loaded.archetype).toBe('document-processing');
      expect(loaded.version).toBe('1.0.0');
    });

    test('has correct agent overrides', () => {
      const result: ValidationResult = validateDomainConfig(DOCUMENT_PROCESSING_CONFIG);
      expect(result.valid).toBe(true);

      const config = DOCUMENT_PROCESSING_CONFIG as DomainConfig;
      expect(config.agent_overrides['technical-writer'].enabled).toBe(true);
      expect(config.agent_overrides['compliance-specialist'].priority).toBe(9);
    });

    test('has valid quality gates', () => {
      const result: ValidationResult = validateDomainConfig(DOCUMENT_PROCESSING_CONFIG);
      expect(result.valid).toBe(true);

      const config = DOCUMENT_PROCESSING_CONFIG as DomainConfig;
      expect(config.quality_gates).toHaveLength(1);
      expect(config.quality_gates[0].name).toBe('Technical Accuracy');
      expect(config.quality_gates[0].phase).toBe('feedback');
    });
  });

  // ============================================================
  // Data Science Domain
  // ============================================================

  describe('data-science domain', () => {
    test('validates configuration using schema validation', () => {
      const result: ValidationResult = validateDomainConfig(DATA_SCIENCE_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('loads domain from JSON file', () => {
      const domainDir = join(tempDir, 'data-science');
      mkdirSync(domainDir, { recursive: true });
      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(DATA_SCIENCE_CONFIG, null, 2));

      const loaded = loader.loadDomain('data-science');
      expect(loaded.name).toBe('data-science');
      expect(loaded.archetype).toBe('data-science');
      expect(loaded.version).toBe('1.0.0');
    });

    test('has correct agent overrides', () => {
      const result: ValidationResult = validateDomainConfig(DATA_SCIENCE_CONFIG);
      expect(result.valid).toBe(true);

      const config = DATA_SCIENCE_CONFIG as DomainConfig;
      expect(config.agent_overrides['data-analyst'].enabled).toBe(true);
      expect(config.agent_overrides['ml-engineer'].priority).toBe(10);
    });

    test('has valid quality gates', () => {
      const result: ValidationResult = validateDomainConfig(DATA_SCIENCE_CONFIG);
      expect(result.valid).toBe(true);

      const config = DATA_SCIENCE_CONFIG as DomainConfig;
      expect(config.quality_gates).toHaveLength(1);
      expect(config.quality_gates[0].name).toBe('Data Quality');
      expect(config.quality_gates[0].phase).toBe('execution');
    });

    test('has higher token budget for ML workloads', () => {
      const result: ValidationResult = validateDomainConfig(DATA_SCIENCE_CONFIG);
      expect(result.valid).toBe(true);

      const config = DATA_SCIENCE_CONFIG as DomainConfig;
      expect(config.defaults.token_budget).toBe(400000);
    });
  });

  // ============================================================
  // Schema Validation Tests
  // ============================================================

  describe('schema validation', () => {
    test('rejects invalid archetype', () => {
      const invalidConfig = { ...VISUAL_PRODUCTION_CONFIG, archetype: 'invalid-archetype' };
      const result: ValidationResult = validateDomainConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].path).toBe('$.archetype');
    });

    test('rejects invalid version format', () => {
      const invalidConfig = { ...VISUAL_PRODUCTION_CONFIG, version: '1.0' };
      const result: ValidationResult = validateDomainConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors[0].path).toBe('$.version');
    });

    test('rejects invalid complexity level', () => {
      const invalidConfig = {
        ...VISUAL_PRODUCTION_CONFIG,
        defaults: { ...VISUAL_PRODUCTION_CONFIG.defaults, complexity: 'invalid' }
      };
      const result: ValidationResult = validateDomainConfig(invalidConfig);
      expect(result.valid).toBe(false);
    });

    test('rejects negative token budget', () => {
      const invalidConfig = {
        ...VISUAL_PRODUCTION_CONFIG,
        defaults: { ...VISUAL_PRODUCTION_CONFIG.defaults, token_budget: -1000 }
      };
      const result: ValidationResult = validateDomainConfig(invalidConfig);
      expect(result.valid).toBe(false);
    });

    test('requires mandatory quality gate fields', () => {
      const invalidConfig = {
        ...VISUAL_PRODUCTION_CONFIG,
        quality_gates: [{ name: 'Test' }] // missing phase, criteria, mandatory
      };
      const result: ValidationResult = validateDomainConfig(invalidConfig);
      expect(result.valid).toBe(false);
    });

    test('validates quality gate phase enum', () => {
      const invalidConfig = {
        ...VISUAL_PRODUCTION_CONFIG,
        quality_gates: [{
          name: 'Test',
          phase: 'invalid-phase' as any,
          criteria: ['test'],
          mandatory: true,
        }]
      };
      const result: ValidationResult = validateDomainConfig(invalidConfig);
      expect(result.valid).toBe(false);
    });
  });

  // ============================================================
  // Domain Discovery Tests
  // ============================================================

  describe('domain discovery', () => {
    test('lists all new domains when directories exist', () => {
      // Create all three domain directories
      ['visual-production', 'document-processing', 'data-science'].forEach(domainName => {
        const domainDir = join(tempDir, domainName);
        mkdirSync(domainDir, { recursive: true });
        writeFileSync(join(domainDir, 'domain.json'), '{}');
      });

      const domains = loader.listDomains();
      expect(domains).toContain('visual-production');
      expect(domains).toContain('document-processing');
      expect(domains).toContain('data-science');
      expect(domains.length).toBeGreaterThanOrEqual(3);
    });

    test('returns empty array when no domains directory exists', () => {
      const loader2 = new DomainLoader(join(tempDir, 'nonexistent'));
      const domains = loader2.listDomains();
      expect(domains).toEqual([]);
    });
  });

  // ============================================================
  // Cross-Domain Consistency Tests
  // ============================================================

  describe('cross-domain consistency', () => {
    test('all new domains have valid version format', () => {
      const domains = [VISUAL_PRODUCTION_CONFIG, DOCUMENT_PROCESSING_CONFIG, DATA_SCIENCE_CONFIG];

      domains.forEach(domainConfig => {
        const result: ValidationResult = validateDomainConfig(domainConfig);
        expect(result.valid).toBe(true);
        expect(domainConfig.version).toMatch(/^\d+\.\d+\.\d+$/);
      });
    });

    test('all new domains have phase_prompts for all phases', () => {
      const phases = ['research', 'decision', 'execution', 'feedback', 'delivery'];
      const domains = [VISUAL_PRODUCTION_CONFIG, DOCUMENT_PROCESSING_CONFIG, DATA_SCIENCE_CONFIG];

      domains.forEach(domainConfig => {
        phases.forEach(phase => {
          expect(domainConfig.phase_prompts[phase]).toBeDefined();
        });
      });
    });

    test('all new domains have at least one quality gate', () => {
      const domains = [VISUAL_PRODUCTION_CONFIG, DOCUMENT_PROCESSING_CONFIG, DATA_SCIENCE_CONFIG];

      domains.forEach(domainConfig => {
        const result: ValidationResult = validateDomainConfig(domainConfig);
        expect(result.valid).toBe(true);
        expect(domainConfig.quality_gates.length).toBeGreaterThan(0);
      });
    });

    test('all new domains have default token budget set', () => {
      const domains = [VISUAL_PRODUCTION_CONFIG, DOCUMENT_PROCESSING_CONFIG, DATA_SCIENCE_CONFIG];

      domains.forEach(domainConfig => {
        const result: ValidationResult = validateDomainConfig(domainConfig);
        expect(result.valid).toBe(true);
        expect(domainConfig.defaults.token_budget).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================
  // Integration with DomainLoader
  // ============================================================

  describe('DomainLoader integration', () => {
    test('validateDomainConfigSafe returns warnings for valid config', () => {
      const result = loader.validateDomainConfigSafe(VISUAL_PRODUCTION_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validateDomainConfigSafe returns errors for invalid config', () => {
      const invalidConfig = { ...VISUAL_PRODUCTION_CONFIG, name: 123 as any };
      const result = loader.validateDomainConfigSafe(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================
// Real Domain File Tests
// ============================================================

describe('Real domain file integration', () => {
  const domainsRoot = '/Volumes/Model/Workspace/Agent/honeycomb/domains';

  describe('visual-production domain files', () => {
    test('domain.json exists and is valid', () => {
      const loader = createDomainLoader(domainsRoot);
      const domain = loader.loadDomain('visual-production');

      expect(domain.name).toBe('visual-production');
      expect(domain.archetype).toBe('visual-production');
      expect(domain.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test('has agent files in agents directory', () => {
      const agentsDir = join(domainsRoot, 'visual-production', 'agents');
      const files = readdirSync(agentsDir);

      expect(files.length).toBeGreaterThan(0);
      expect(files.some(f => f.endsWith('.md'))).toBe(true);
    });

    test('has template files in templates directory', () => {
      const templatesDir = join(domainsRoot, 'visual-production', 'templates');
      const files = readdirSync(templatesDir);

      expect(files.length).toBeGreaterThan(0);
    });

    test('has quality gate files in quality-gates directory', () => {
      const qgDir = join(domainsRoot, 'visual-production', 'quality-gates');
      const files = readdirSync(qgDir);

      expect(files.length).toBeGreaterThan(0);
      expect(files.some(f => f.endsWith('.json'))).toBe(true);
    });
  });

  describe('document-processing domain files', () => {
    test('domain.json exists and is valid', () => {
      const loader = createDomainLoader(domainsRoot);
      const domain = loader.loadDomain('document-processing');

      expect(domain.name).toBe('document-processing');
      expect(domain.archetype).toBe('document-processing');
      expect(domain.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('data-science domain files', () => {
    test('domain.json exists and is valid', () => {
      const loader = createDomainLoader(domainsRoot);
      const domain = loader.loadDomain('data-science');

      expect(domain.name).toBe('data-science');
      expect(domain.archetype).toBe('data-science');
      expect(domain.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
