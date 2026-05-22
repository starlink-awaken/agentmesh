/**
 * Tests for DomainLoader - domain configuration loading, validation, and utilities.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DomainLoader, createDomainLoader } from '../src/domain-loader.ts';
import type { DomainConfig, ProjectConfig, ProjectArchetype } from '../src/types.ts';

describe('DomainLoader', () => {
  let tempDir: string;
  let loader: DomainLoader;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'hc-domain-test-'));
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
  // Construction & Factory Functions
  // ============================================================

  describe('construction', () => {
    test('creates DomainLoader with domainsRoot path', () => {
      const loader = new DomainLoader('/test/path');
      expect(loader).toBeInstanceOf(DomainLoader);
    });

    test('resolves relative domainsRoot to absolute path', () => {
      const loader = new DomainLoader('./relative');
      expect(loader).toBeInstanceOf(DomainLoader);
    });

    test('createDomainLoader factory returns DomainLoader instance', () => {
      const loader = createDomainLoader('/test/path');
      expect(loader).toBeInstanceOf(DomainLoader);
    });
  });

  // ============================================================
  // loadDomain - Valid Domain Loading
  // ============================================================

  describe('loadDomain - valid domains', () => {
    test('loads valid domain configuration from JSON file', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Software Development',
        description: 'Software development domain',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {},
        defaults: {},
        templates: {},
        quality_gates: [],
      };

      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      const loaded = loader.loadDomain('software-dev');
      expect(loaded.name).toBe('Software Development');
      expect(loaded.archetype).toBe('software-dev');
    });

    test('loads domain with phase_prompts', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Test Domain',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {
          research: 'Research phase prompt',
          execution: 'Execution phase prompt',
        },
        agent_overrides: {},
        defaults: {},
        templates: {},
        quality_gates: [],
      };

      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      const loaded = loader.loadDomain('software-dev');
      expect(loaded.phase_prompts.research).toBe('Research phase prompt');
      expect(loaded.phase_prompts.execution).toBe('Execution phase prompt');
    });

    test('loads domain with agent_overrides', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Test Domain',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {
          architect: {
            enabled: true,
            priority: 10,
            custom_prompt: 'Custom prompt',
            tools_override: ['tool1', 'tool2'],
            token_budget_override: 5000,
          },
        },
        defaults: {},
        templates: {},
        quality_gates: [],
      };

      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      const loaded = loader.loadDomain('software-dev');
      expect(loaded.agent_overrides.architect.enabled).toBe(true);
      expect(loaded.agent_overrides.architect.priority).toBe(10);
      expect(loaded.agent_overrides.architect.custom_prompt).toBe('Custom prompt');
      expect(loaded.agent_overrides.architect.tools_override).toEqual(['tool1', 'tool2']);
      expect(loaded.agent_overrides.architect.token_budget_override).toBe(5000);
    });

    test('loads domain with defaults', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Test Domain',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {},
        defaults: {
          complexity: 'standard',
          token_budget: 10000,
          max_concurrent_agents: 5,
        },
        templates: {},
        quality_gates: [],
      };

      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      const loaded = loader.loadDomain('software-dev');
      expect(loaded.defaults.complexity).toBe('standard');
      expect(loaded.defaults.token_budget).toBe(10000);
      expect(loaded.defaults.max_concurrent_agents).toBe(5);
    });

    test('loads domain with templates', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Test Domain',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {},
        defaults: {},
        templates: {
          readme: 'README template',
          spec: 'Specification template',
        },
        quality_gates: [],
      };

      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      const loaded = loader.loadDomain('software-dev');
      expect(loaded.templates.readme).toBe('README template');
      expect(loaded.templates.spec).toBe('Specification template');
    });

    test('loads domain with quality_gates', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Test Domain',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {},
        defaults: {},
        templates: {},
        quality_gates: [
          {
            name: 'Code Review',
            phase: 'execution',
            criteria: ['All tests pass', 'No linting errors'],
            mandatory: true,
          },
        ],
      };

      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      const loaded = loader.loadDomain('software-dev');
      expect(loaded.quality_gates.length).toBe(1);
      expect(loaded.quality_gates[0].name).toBe('Code Review');
      expect(loaded.quality_gates[0].phase).toBe('execution');

      // 验证自动迁移后的对象格式（ISC 表达式支持）
      const criteria = loaded.quality_gates[0].criteria;
      expect(criteria).toHaveLength(2);
      expect(criteria[0]).toMatchObject({
        id: 'criterion-0-0',
        name: 'All tests pass',
        expression: 'All tests pass',
        pass_condition: 'All tests pass',
      });
      expect(criteria[1]).toMatchObject({
        id: 'criterion-0-1',
        name: 'No linting errors',
        expression: 'No linting errors',
        pass_condition: 'No linting errors',
      });

      expect(loaded.quality_gates[0].mandatory).toBe(true);
    });

    test('loads creative-writing archetype', () => {
      const domainDir = join(tempDir, 'creative-writing');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Creative Writing',
        description: 'Creative writing domain',
        archetype: 'creative-writing',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {},
        defaults: {},
        templates: {},
        quality_gates: [],
      };

      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      const loaded = loader.loadDomain('creative-writing');
      expect(loaded.name).toBe('Creative Writing');
      expect(loaded.archetype).toBe('creative-writing');
    });

    test('returns default config for custom archetype', () => {
      const loaded = loader.loadDomain('custom');
      expect(loaded.name).toBe('Default custom');
      expect(loaded.archetype).toBe('custom');
      expect(loaded.version).toBe('1.0.0');
    });
  });

  // ============================================================
  // loadDomain - Error Handling
  // ============================================================

  describe('loadDomain - error handling', () => {
    test('throws error when domain directory does not exist', () => {
      expect(() => {
        loader.loadDomain('software-dev');
      }).toThrow('Domain directory not found');
    });

    test('throws error when domain.json does not exist', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      expect(() => {
        loader.loadDomain('software-dev');
      }).toThrow('Domain configuration file not found');
    });

    test('throws error for invalid JSON', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      writeFileSync(join(domainDir, 'domain.json'), 'invalid json {{{');

      expect(() => {
        loader.loadDomain('software-dev');
      }).toThrow('Invalid JSON in domain config');
    });

    test('throws error for missing name field', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
      };

      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      expect(() => {
        loader.loadDomain('software-dev');
      }).toThrow('Domain config missing required field: name');
    });

    test('throws error for empty name field', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: '   ',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
      };

      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      expect(() => {
        loader.loadDomain('software-dev');
      }).toThrow('Domain config missing required field: name');
    });

    test('throws error for missing description field', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Test',
        archetype: 'software-dev',
        version: '1.0.0',
      };

      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      expect(() => {
        loader.loadDomain('software-dev');
      }).toThrow('Domain config missing required field: description');
    });

    test('throws error for empty description field', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Test',
        description: '',
        archetype: 'software-dev',
        version: '1.0.0',
      };

      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      expect(() => {
        loader.loadDomain('software-dev');
      }).toThrow('Domain config missing required field: description');
    });

    test('throws error for missing archetype field', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Test',
        description: 'Test description',
        version: '1.0.0',
      };

      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      expect(() => {
        loader.loadDomain('software-dev');
      }).toThrow('Domain config missing required field: archetype');
    });

    test('throws error for missing version field', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Test',
        description: 'Test description',
        archetype: 'software-dev',
      };

      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      expect(() => {
        loader.loadDomain('software-dev');
      }).toThrow('Domain config missing required field: version');
    });
  });

  // ============================================================
  // listDomains
  // ============================================================

  describe('listDomains', () => {
    test('returns empty array when domains root does not exist', () => {
      const nonExistentLoader = new DomainLoader('/nonexistent/path');
      const domains = nonExistentLoader.listDomains();
      expect(domains).toEqual([]);
    });

    test('returns empty array when domains root is empty', () => {
      const domains = loader.listDomains();
      expect(domains).toEqual([]);
    });

    test('lists available domain directories', () => {
      mkdirSync(join(tempDir, 'software'), { recursive: true });
      mkdirSync(join(tempDir, 'creative-writing'), { recursive: true });

      const domains = loader.listDomains();
      expect(domains).toContain('software');
      expect(domains).toContain('creative-writing');
      expect(domains.length).toBe(2);
    });

    test('ignores files in domains root', () => {
      mkdirSync(join(tempDir, 'software'), { recursive: true });
      writeFileSync(join(tempDir, 'readme.txt'), 'test');

      const domains = loader.listDomains();
      expect(domains).toEqual(['software']);
    });

    test('returns sorted list of domains', () => {
      mkdirSync(join(tempDir, 'zebra'), { recursive: true });
      mkdirSync(join(tempDir, 'apple'), { recursive: true });
      mkdirSync(join(tempDir, 'banana'), { recursive: true });

      const domains = loader.listDomains();
      expect(domains).toEqual(['apple', 'banana', 'zebra']);
    });
  });

  // ============================================================
  // validateDomainConfig
  // ============================================================

  describe('validateDomainConfig - valid configs', () => {
    test('validates minimal valid config', () => {
      const config = {
        name: 'Test',
        description: 'Test domain',
        archetype: 'software-dev',
        version: '1.0.0',
      };

      const validated = loader.validateDomainConfig(config);
      expect(validated.name).toBe('Test');
      expect(validated.description).toBe('Test domain');
      expect(validated.archetype).toBe('software-dev');
      expect(validated.version).toBe('1.0.0');
      expect(validated.phase_prompts).toEqual({});
      expect(validated.agent_overrides).toEqual({});
      expect(validated.defaults).toEqual({});
      expect(validated.templates).toEqual({});
      expect(validated.quality_gates).toEqual([]);
    });

    test('validates config with all fields', () => {
      const config = {
        name: 'Full Config',
        description: 'Full configuration',
        archetype: 'software-dev',
        version: '2.0.0',
        phase_prompts: { execution: 'Execute now' },
        agent_overrides: {
          test: { enabled: true },
        },
        defaults: { complexity: 'advanced' },
        templates: { spec: 'Spec template' },
        quality_gates: [
          {
            name: 'Gate',
            phase: 'execution',
            criteria: ['test'],
            mandatory: false,
          },
        ],
      };

      const validated = loader.validateDomainConfig(config);
      expect(validated.name).toBe('Full Config');
      expect(validated.phase_prompts.execution).toBe('Execute now');
      expect(validated.agent_overrides.test.enabled).toBe(true);
      expect(validated.defaults.complexity).toBe('advanced');
      expect(validated.templates.spec).toBe('Spec template');
      expect(validated.quality_gates.length).toBe(1);
    });
  });

  describe('validateDomainConfig - invalid configs', () => {
    test('throws error for null config', () => {
      expect(() => {
        loader.validateDomainConfig(null);
      }).toThrow('Domain config must be an object');
    });

    test('throws error for non-object config', () => {
      expect(() => {
        loader.validateDomainConfig('string');
      }).toThrow('Domain config must be an object');
    });

    test('throws error for array config', () => {
      expect(() => {
        loader.validateDomainConfig([]);
      }).toThrow(/Domain config must be an object, not an array/);
    });

    test('throws error for invalid phase_prompts (array)', () => {
      const config = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: [],
      };

      expect(() => {
        loader.validateDomainConfig(config);
      }).toThrow(/phase_prompts.*Expected object/);
    });

    test('throws error for invalid agent_overrides (array)', () => {
      const config = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        agent_overrides: [],
      };

      expect(() => {
        loader.validateDomainConfig(config);
      }).toThrow(/agent_overrides.*Expected object/);
    });

    test('throws error for agent override without enabled field', () => {
      const config = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        agent_overrides: {
          test: { priority: 5 },
        },
      };

      expect(() => {
        loader.validateDomainConfig(config);
      }).toThrow('missing required field: enabled');
    });

    test('throws error for invalid defaults (array)', () => {
      const config = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        defaults: [],
      };

      expect(() => {
        loader.validateDomainConfig(config);
      }).toThrow(/defaults.*Expected object/);
    });

    test('throws error for invalid templates (array)', () => {
      const config = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        templates: [],
      };

      expect(() => {
        loader.validateDomainConfig(config);
      }).toThrow(/templates.*Expected object/);
    });

    test('throws error for invalid quality_gates (object)', () => {
      const config = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        quality_gates: {},
      };

      expect(() => {
        loader.validateDomainConfig(config);
      }).toThrow(/quality_gates.*Expected array/);
    });

    test('throws error for quality gate without name', () => {
      const config = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        quality_gates: [
          {
            phase: 'execution',
            criteria: ['test'],
            mandatory: true,
          },
        ],
      };

      expect(() => {
        loader.validateDomainConfig(config);
      }).toThrow(/quality_gates\[0\].name/);
    });

    test('throws error for quality gate without phase', () => {
      const config = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        quality_gates: [
          {
            name: 'Gate',
            criteria: ['test'],
            mandatory: true,
          },
        ],
      };

      expect(() => {
        loader.validateDomainConfig(config);
      }).toThrow(/quality_gates\[0\].phase/);
    });

    test('throws error for quality gate without criteria', () => {
      const config = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        quality_gates: [
          {
            name: 'Gate',
            phase: 'execution',
            mandatory: true,
          },
        ],
      };

      expect(() => {
        loader.validateDomainConfig(config);
      }).toThrow(/quality_gates\[0\].criteria/);
    });

    test('throws error for quality gate without mandatory', () => {
      const config = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        quality_gates: [
          {
            name: 'Gate',
            phase: 'execution',
            criteria: ['test'],
          },
        ],
      };

      expect(() => {
        loader.validateDomainConfig(config);
      }).toThrow(/quality_gates\[0\].mandatory/);
    });
  });

  // ============================================================
  // getDefaultDomainConfig
  // ============================================================

  describe('getDefaultDomainConfig', () => {
    test('generates default config for software-dev', () => {
      const config = loader.getDefaultDomainConfig('software-dev');
      expect(config.name).toBe('Default software-dev');
      expect(config.archetype).toBe('software-dev');
      expect(config.version).toBe('1.0.0');
      expect(config.phase_prompts).toEqual({});
      expect(config.agent_overrides).toEqual({});
      expect(config.defaults).toEqual({});
      expect(config.templates).toEqual({});
      expect(config.quality_gates).toEqual([]);
    });

    test('generates default config for creative-writing', () => {
      const config = loader.getDefaultDomainConfig('creative-writing');
      expect(config.name).toBe('Default creative-writing');
      expect(config.archetype).toBe('creative-writing');
    });

    test('generates default config for visual-production', () => {
      const config = loader.getDefaultDomainConfig('visual-production');
      expect(config.name).toBe('Default visual-production');
      expect(config.archetype).toBe('visual-production');
    });

    test('generates default config for document-processing', () => {
      const config = loader.getDefaultDomainConfig('document-processing');
      expect(config.name).toBe('Default document-processing');
      expect(config.archetype).toBe('document-processing');
    });

    test('generates default config for custom', () => {
      const config = loader.getDefaultDomainConfig('custom');
      expect(config.name).toBe('Default custom');
      expect(config.archetype).toBe('custom');
    });
  });

  // ============================================================
  // mergeDomainWithProject
  // ============================================================

  describe('mergeDomainWithProject', () => {
    test('merges domain defaults into project config', () => {
      const domain: DomainConfig = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {},
        defaults: {
          complexity: 'standard',
          token_budget: 10000,
        },
        templates: {},
        quality_gates: [],
      };

      const project: ProjectConfig = {
        name: 'My Project',
        description: 'Project description',
        archetype: 'software-dev',
        goals: ['Build app'],
      };

      const merged = loader.mergeDomainWithProject(domain, project);
      expect(merged.complexity).toBe('standard');
      expect(merged.token_budget).toBe(10000);
      expect(merged.name).toBe('My Project');
      expect(merged.goals).toEqual(['Build app']);
    });

    test('project complexity overrides domain default', () => {
      const domain: DomainConfig = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {},
        defaults: {
          complexity: 'standard',
        },
        templates: {},
        quality_gates: [],
      };

      const project: ProjectConfig = {
        name: 'My Project',
        description: 'Project description',
        archetype: 'software-dev',
        complexity: 'advanced',
        goals: ['Build app'],
      };

      const merged = loader.mergeDomainWithProject(domain, project);
      expect(merged.complexity).toBe('advanced');
    });

    test('project token_budget overrides domain default', () => {
      const domain: DomainConfig = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {},
        defaults: {
          token_budget: 10000,
        },
        templates: {},
        quality_gates: [],
      };

      const project: ProjectConfig = {
        name: 'My Project',
        description: 'Project description',
        archetype: 'software-dev',
        token_budget: 20000,
        goals: ['Build app'],
      };

      const merged = loader.mergeDomainWithProject(domain, project);
      expect(merged.token_budget).toBe(20000);
    });

    test('merges quality gates from domain and project', () => {
      const domain: DomainConfig = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {},
        defaults: {},
        templates: {},
        quality_gates: [
          {
            name: 'Domain Gate',
            phase: 'execution' as any,
            criteria: ['Domain criterion'],
            mandatory: true,
          },
        ],
      };

      const project: ProjectConfig = {
        name: 'My Project',
        description: 'Project description',
        archetype: 'software-dev',
        goals: ['Build app'],
        quality_gates: [
          {
            name: 'Project Gate',
            phase: 'feedback' as any,
            criteria: ['Project criterion'],
            mandatory: false,
          },
        ],
      };

      const merged = loader.mergeDomainWithProject(domain, project);
      expect(merged.quality_gates?.length).toBe(2);
      expect(merged.quality_gates?.[0].name).toBe('Domain Gate');
      expect(merged.quality_gates?.[1].name).toBe('Project Gate');
    });

    test('uses empty quality_gates array when project has none', () => {
      const domain: DomainConfig = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {},
        agent_overrides: {},
        defaults: {},
        templates: {},
        quality_gates: [
          {
            name: 'Domain Gate',
            phase: 'execution' as any,
            criteria: ['test'],
            mandatory: true,
          },
        ],
      };

      const project: ProjectConfig = {
        name: 'My Project',
        description: 'Project description',
        archetype: 'software-dev',
        goals: ['Build app'],
      };

      const merged = loader.mergeDomainWithProject(domain, project);
      expect(merged.quality_gates?.length).toBe(1);
      expect(merged.quality_gates?.[0].name).toBe('Domain Gate');
    });
  });

  // ============================================================
  // loadDomainAgents
  // ============================================================

  describe('loadDomainAgents', () => {
    test('returns empty array when agents directory does not exist', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const agents = loader.loadDomainAgents('software-dev');
      expect(agents).toEqual([]);
    });

    test('returns empty array for custom archetype', () => {
      const agents = loader.loadDomainAgents('custom');
      expect(agents).toEqual([]);
    });

    test('loads agent definitions from markdown files', () => {
      const domainDir = join(tempDir, 'software');
      const agentsDir = join(domainDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      const agentMd = `---
name: test-agent
type: worker
layer: L3
description: A test agent
tools: [code-review]
capabilities: [testing]
---
# Test Agent
This is a test agent.`;

      writeFileSync(join(agentsDir, 'test-agent.md'), agentMd);

      const agents = loader.loadDomainAgents('software-dev');
      expect(agents.length).toBeGreaterThan(0);
      const agent = agents.find((a) => a.name === 'test-agent');
      expect(agent).toBeDefined();
      expect(agent?.type).toBe('worker');
      expect(agent?.layer).toBe('L3');
    });

    test('recursively finds markdown files in subdirectories', () => {
      const domainDir = join(tempDir, 'software');
      const agentsDir = join(domainDir, 'agents');
      const subDir = join(agentsDir, 'specialized');
      mkdirSync(subDir, { recursive: true });

      const agentMd = `---
name: specialized-agent
type: worker
layer: L3
description: A specialized agent
tools: []
capabilities: []
---
# Specialized Agent`;

      writeFileSync(join(subDir, 'specialized.md'), agentMd);

      const agents = loader.loadDomainAgents('software-dev');
      const agent = agents.find((a) => a.name === 'specialized-agent');
      expect(agent).toBeDefined();
    });

    test('skips files that are not valid agent markdown', () => {
      const domainDir = join(tempDir, 'software');
      const agentsDir = join(domainDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(join(agentsDir, 'invalid.md'), '# Not an agent');
      writeFileSync(join(agentsDir, 'readme.txt'), 'Readme file');

      const agents = loader.loadDomainAgents('software-dev');
      // Should not throw, just skip invalid files
      expect(Array.isArray(agents)).toBe(true);
    });

    test('returns empty array when agents directory is empty', () => {
      const domainDir = join(tempDir, 'software');
      const agentsDir = join(domainDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      const agents = loader.loadDomainAgents('software-dev');
      expect(agents).toEqual([]);
    });
  });

  // ============================================================
  // loadTemplate
  // ============================================================

  describe('loadTemplate', () => {
    test('loads template content from templates directory', () => {
      const domainDir = join(tempDir, 'software');
      const templatesDir = join(domainDir, 'templates');
      mkdirSync(templatesDir, { recursive: true });

      const templateContent = '# Template\nThis is a template.';
      writeFileSync(join(templatesDir, 'spec.md'), templateContent);

      const content = loader.loadTemplate('software-dev', 'spec');
      expect(content).toBe(templateContent);
    });

    test('returns null when template does not exist', () => {
      const domainDir = join(tempDir, 'software');
      const templatesDir = join(domainDir, 'templates');
      mkdirSync(templatesDir, { recursive: true });

      const content = loader.loadTemplate('software-dev', 'nonexistent');
      expect(content).toBeNull();
    });

    test('returns null for custom archetype', () => {
      const content = loader.loadTemplate('custom', 'spec');
      expect(content).toBeNull();
    });

    test('returns null when templates directory does not exist', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const content = loader.loadTemplate('software-dev', 'spec');
      expect(content).toBeNull();
    });

    test('loads multiple different templates', () => {
      const domainDir = join(tempDir, 'software');
      const templatesDir = join(domainDir, 'templates');
      mkdirSync(templatesDir, { recursive: true });

      writeFileSync(join(templatesDir, 'readme.md'), 'README content');
      writeFileSync(join(templatesDir, 'spec.md'), 'Spec content');

      const readme = loader.loadTemplate('software-dev', 'readme');
      const spec = loader.loadTemplate('software-dev', 'spec');

      expect(readme).toBe('README content');
      expect(spec).toBe('Spec content');
    });

    test('handles template with special characters', () => {
      const domainDir = join(tempDir, 'software');
      const templatesDir = join(domainDir, 'templates');
      mkdirSync(templatesDir, { recursive: true });

      const specialContent = '# Template\n\n**Bold** _italic_ `code`\n\n- List item';
      writeFileSync(join(templatesDir, 'special.md'), specialContent);

      const content = loader.loadTemplate('software-dev', 'special');
      expect(content).toBe(specialContent);
    });
  });

  // ============================================================
  // Archetype-to-Directory Mapping
  // ============================================================

  describe('archetype-to-directory mapping', () => {
    test('maps software-dev to software directory', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Software',
        description: 'Software domain',
        archetype: 'software-dev',
        version: '1.0.0',
      };
      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      const loaded = loader.loadDomain('software-dev');
      expect(loaded.name).toBe('Software');
    });

    test('maps creative-writing to creative-writing directory', () => {
      const domainDir = join(tempDir, 'creative-writing');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Creative',
        description: 'Creative domain',
        archetype: 'creative-writing',
        version: '1.0.0',
      };
      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      const loaded = loader.loadDomain('creative-writing');
      expect(loaded.name).toBe('Creative');
    });

    test('maps visual-production to visual-production directory', () => {
      const domainDir = join(tempDir, 'visual-production');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Visual',
        description: 'Visual domain',
        archetype: 'visual-production',
        version: '1.0.0',
      };
      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      const loaded = loader.loadDomain('visual-production');
      expect(loaded.name).toBe('Visual');
    });

    test('maps document-processing to document-processing directory', () => {
      const domainDir = join(tempDir, 'document-processing');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Document',
        description: 'Document domain',
        archetype: 'document-processing',
        version: '1.0.0',
      };
      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      const loaded = loader.loadDomain('document-processing');
      expect(loaded.name).toBe('Document');
    });

    test('custom archetype returns default config without directory', () => {
      const loaded = loader.loadDomain('custom');
      expect(loaded.name).toBe('Default custom');
      expect(loaded.archetype).toBe('custom');
    });
  });

  // ============================================================
  // Edge Cases
  // ============================================================

  describe('edge cases', () => {
    test('handles domain directory with no agents subdirectory', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const agents = loader.loadDomainAgents('software-dev');
      expect(agents).toEqual([]);
    });

    test('handles domain directory with no templates subdirectory', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const content = loader.loadTemplate('software-dev', 'spec');
      expect(content).toBeNull();
    });

    test('handles empty domain.json with only required fields', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Minimal',
        description: 'Minimal domain',
        archetype: 'software-dev',
        version: '0.0.1',
      };
      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      const loaded = loader.loadDomain('software-dev');
      expect(loaded.name).toBe('Minimal');
      expect(loaded.phase_prompts).toEqual({});
      expect(loaded.agent_overrides).toEqual({});
      expect(loaded.defaults).toEqual({});
      expect(loaded.templates).toEqual({});
      expect(loaded.quality_gates).toEqual([]);
    });

    test('handles domain.json with null optional fields', () => {
      const domainDir = join(tempDir, 'software');
      mkdirSync(domainDir, { recursive: true });

      const config = {
        name: 'Null Fields',
        description: 'Domain with null fields',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: null,
        agent_overrides: null,
        defaults: null,
        templates: null,
        quality_gates: null,
      };
      writeFileSync(join(domainDir, 'domain.json'), JSON.stringify(config));

      const loaded = loader.loadDomain('software-dev');
      expect(loaded.phase_prompts).toEqual({});
      expect(loaded.agent_overrides).toEqual({});
      expect(loaded.defaults).toEqual({});
      expect(loaded.templates).toEqual({});
      expect(loaded.quality_gates).toEqual([]);
    });

    test('handles phase_prompts with non-string values', () => {
      const config = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        phase_prompts: {
          execution: 'valid string',
          research: 123, // Invalid: number
          decision: true, // Invalid: boolean
        },
      };

      const validated = loader.validateDomainConfig(config);
      // Should filter out non-string values
      expect(validated.phase_prompts.execution).toBe('valid string');
      expect(validated.phase_prompts.research).toBeUndefined();
      expect(validated.phase_prompts.decision).toBeUndefined();
    });

    test('handles templates with non-string values', () => {
      const config = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        templates: {
          readme: 'valid template',
          spec: 456, // Invalid: number
        },
      };

      const validated = loader.validateDomainConfig(config);
      expect(validated.templates.readme).toBe('valid template');
      expect(validated.templates.spec).toBeUndefined();
    });

    test('validates multiple quality gates', () => {
      const config = {
        name: 'Test',
        description: 'Test domain for software development',
        archetype: 'software-dev',
        version: '1.0.0',
        quality_gates: [
          {
            name: 'Gate 1',
            phase: 'execution',
            criteria: ['criterion 1'],
            mandatory: true,
          },
          {
            name: 'Gate 2',
            phase: 'feedback',
            criteria: ['criterion 2', 'criterion 3'],
            mandatory: false,
          },
        ],
      };

      const validated = loader.validateDomainConfig(config);
      expect(validated.quality_gates.length).toBe(2);
      expect(validated.quality_gates[0].name).toBe('Gate 1');
      expect(validated.quality_gates[1].name).toBe('Gate 2');
    });
  });
});
