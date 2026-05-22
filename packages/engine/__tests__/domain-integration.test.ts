/**
 * Domain Loading and Agent Selection Integration Tests
 *
 * Tests domain-specific functionality:
 * - Domain configuration loading for software and creative-writing
 * - Domain-specific agent registration and selection
 * - Domain defaults application to projects
 * - Quality gate enforcement from domains
 * - Template loading from domains
 * - Agent override configuration
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HoneycombOrchestrator } from '../src/orchestrator.ts';
import { DomainLoader } from '../src/domain-loader.ts';
import {
  Phase,
  type ProjectConfig,
  type DomainConfig,
} from '../src/types.ts';

// ============================================================
// Test Setup
// ============================================================

let tempDir: string;

function setupDomainEnvironment(): {
  dbPath: string;
  agentsDir: string;
  domainsDir: string;
  outputDir: string;
} {
  tempDir = mkdtempSync(join(tmpdir(), 'hc-domain-test-'));
  const dbPath = join(tempDir, 'test.db');
  const agentsDir = join(tempDir, 'agents');
  const domainsDir = join(tempDir, 'domains');
  const outputDir = join(tempDir, 'output');

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(domainsDir, { recursive: true });

  // Create base agent structure
  const layers = [
    { dir: 'layer-1-research', name: 'researcher' },
    { dir: 'layer-2-decision', name: 'decider' },
    { dir: 'layer-3-execution', name: 'executor' },
    { dir: 'layer-4-feedback', name: 'reviewer' },
  ];

  for (const layer of layers) {
    const layerDir = join(agentsDir, layer.dir);
    mkdirSync(layerDir, { recursive: true });
    writeFileSync(
      join(layerDir, `${layer.name}.md`),
      `---
name: ${layer.name}
description: Base ${layer.name} agent
tools: ['read']
---

# ${layer.name}
Base agent.
`,
    );
  }

  return { dbPath, agentsDir, domainsDir, outputDir };
}

function createSoftwareDomain(domainsDir: string): void {
  const softwareDir = join(domainsDir, 'software');
  const agentsDir = join(softwareDir, 'agents');
  const templatesDir = join(softwareDir, 'templates');

  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(templatesDir, { recursive: true });

  // Domain configuration
  const domainConfig: DomainConfig = {
    name: 'Software Development',
    description: 'Software development domain with specialized agents',
    archetype: 'software-dev',
    version: '1.0.0',
    phase_prompts: {
      execution: 'Focus on code quality, testing, and documentation.',
      feedback: 'Review code for bugs, security, and best practices.',
    },
    agent_overrides: {
      'code-reviewer': {
        enabled: true,
        priority: 10,
        custom_prompt: 'Review code with focus on security and performance.',
        tools_override: ['read', 'analyze', 'lint'],
        token_budget_override: 15000,
      },
    },
    defaults: {
      complexity: 'standard',
      token_budget: 200000,
      max_concurrent_agents: 4,
    },
    templates: {
      readme: 'README.md template path',
      spec: 'specification template path',
    },
    quality_gates: [
      {
        name: 'Code Review',
        phase: Phase.EXECUTION,
        criteria: ['All tests pass', 'Code coverage > 80%', 'No critical bugs'],
        mandatory: true,
      },
      {
        name: 'Security Scan',
        phase: Phase.FEEDBACK,
        criteria: ['No high-severity vulnerabilities', 'Dependencies up to date'],
        mandatory: true,
      },
    ],
  };

  writeFileSync(
    join(softwareDir, 'domain.json'),
    JSON.stringify(domainConfig, null, 2),
  );

  // Domain-specific agents
  writeFileSync(
    join(agentsDir, 'code-reviewer.md'),
    `---
name: code-reviewer
description: Reviews code for quality and security
tools: ['read', 'analyze', 'lint']
---

# Code Reviewer
Specialized code review agent.
`,
  );

  writeFileSync(
    join(agentsDir, 'devops-engineer.md'),
    `---
name: devops-engineer
description: Handles CI/CD and infrastructure
tools: ['read', 'deploy', 'monitor']
---

# DevOps Engineer
Infrastructure and deployment specialist.
`,
  );

  // Templates
  writeFileSync(
    join(templatesDir, 'readme.md'),
    '# Project Name\n\nProject description and usage instructions.',
  );

  writeFileSync(
    join(templatesDir, 'spec.md'),
    '# Technical Specification\n\nDetailed technical specification.',
  );
}

function createCreativeWritingDomain(domainsDir: string): void {
  const creativeDir = join(domainsDir, 'creative-writing');
  const agentsDir = join(creativeDir, 'agents');
  const templatesDir = join(creativeDir, 'templates');

  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(templatesDir, { recursive: true });

  // Domain configuration
  const domainConfig: DomainConfig = {
    name: 'Creative Writing',
    description: 'Creative writing domain with specialized storytelling agents',
    archetype: 'creative-writing',
    version: '1.0.0',
    phase_prompts: {
      research: 'Develop characters, plot, and world-building.',
      execution: 'Write engaging narrative with consistent style.',
    },
    agent_overrides: {
      'character-developer': {
        enabled: true,
        priority: 8,
        token_budget_override: 20000,
      },
    },
    defaults: {
      complexity: 'advanced',
      token_budget: 300000,
    },
    templates: {
      outline: 'story outline template',
      character: 'character profile template',
    },
    quality_gates: [
      {
        name: 'Narrative Consistency',
        phase: Phase.FEEDBACK,
        criteria: ['Plot coherence', 'Character development', 'Style consistency'],
        mandatory: true,
      },
    ],
  };

  writeFileSync(
    join(creativeDir, 'domain.json'),
    JSON.stringify(domainConfig, null, 2),
  );

  // Domain-specific agents
  writeFileSync(
    join(agentsDir, 'character-developer.md'),
    `---
name: character-developer
description: Develops rich character profiles and arcs
tools: ['read', 'write', 'analyze']
---

# Character Developer
Creates compelling characters.
`,
  );

  writeFileSync(
    join(agentsDir, 'plot-architect.md'),
    `---
name: plot-architect
description: Designs plot structure and narrative flow
tools: ['read', 'write', 'plan']
---

# Plot Architect
Crafts engaging storylines.
`,
  );

  // Templates
  writeFileSync(
    join(templatesDir, 'outline.md'),
    '# Story Outline\n\nAct structure and key plot points.',
  );

  writeFileSync(
    join(templatesDir, 'character.md'),
    '# Character Profile\n\nName, background, motivations, arc.',
  );
}

function cleanupTestEnvironment(): void {
  if (tempDir && existsSync(tempDir)) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================================
// Domain Loading Tests
// ============================================================

describe('Domain Loading and Agent Selection', () => {
  let orchestrator: HoneycombOrchestrator;

  afterEach(() => {
    try {
      orchestrator?.shutdown();
    } catch {
      // Ignore shutdown errors
    }
    cleanupTestEnvironment();
  });

  describe('software domain', () => {
    test('loads software domain configuration correctly', () => {
      const env = setupDomainEnvironment();
      createSoftwareDomain(env.domainsDir);

      const domainLoader = new DomainLoader(env.domainsDir);
      const domain = domainLoader.loadDomain('software-dev');

      expect(domain.name).toBe('Software Development');
      expect(domain.archetype).toBe('software-dev');
      expect(domain.version).toBe('1.0.0');
      expect(domain.defaults.complexity).toBe('standard');
      expect(domain.defaults.token_budget).toBe(200000);
    });

    test('software domain defaults are applied to projects', () => {
      const env = setupDomainEnvironment();
      createSoftwareDomain(env.domainsDir);

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      const projectConfig: ProjectConfig = {
        name: 'Software Project',
        description: 'Test software project',
        archetype: 'software-dev',
        goals: ['Build web application', 'Deploy to production'],
      };

      const state = orchestrator.createProject(projectConfig);

      // Domain defaults should be applied
      expect(state.complexity).toBe('standard');
      expect(state.token_budget).toBe(200000);
    });

    test('software domain-specific agents are loaded', () => {
      const env = setupDomainEnvironment();
      createSoftwareDomain(env.domainsDir);

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      orchestrator.createProject({
        name: 'Software Project',
        description: 'Test',
        archetype: 'software-dev',
        goals: ['test'],
      });

      const stats = orchestrator.getStats();
      // Should have base agents + domain agents
      expect(stats.agents_loaded).toBeGreaterThan(4);
    });

    test('software domain quality gates are loaded', () => {
      const env = setupDomainEnvironment();
      createSoftwareDomain(env.domainsDir);

      const domainLoader = new DomainLoader(env.domainsDir);
      const domain = domainLoader.loadDomain('software-dev');

      expect(domain.quality_gates.length).toBe(2);
      expect(domain.quality_gates[0].name).toBe('Code Review');
      expect(domain.quality_gates[0].mandatory).toBe(true);
      expect(domain.quality_gates[1].name).toBe('Security Scan');
    });

    test('software domain templates are accessible', () => {
      const env = setupDomainEnvironment();
      createSoftwareDomain(env.domainsDir);

      const domainLoader = new DomainLoader(env.domainsDir);
      const readmeTemplate = domainLoader.loadTemplate('software-dev', 'readme');
      const specTemplate = domainLoader.loadTemplate('software-dev', 'spec');

      expect(readmeTemplate).toContain('Project Name');
      expect(specTemplate).toContain('Technical Specification');
    });

    test('software domain phase prompts are loaded', () => {
      const env = setupDomainEnvironment();
      createSoftwareDomain(env.domainsDir);

      const domainLoader = new DomainLoader(env.domainsDir);
      const domain = domainLoader.loadDomain('software-dev');

      expect(domain.phase_prompts.execution).toContain('code quality');
      expect(domain.phase_prompts.feedback).toContain('security');
    });

    test('project settings override domain defaults', () => {
      const env = setupDomainEnvironment();
      createSoftwareDomain(env.domainsDir);

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      const projectConfig: ProjectConfig = {
        name: 'Custom Software Project',
        description: 'Override domain defaults',
        archetype: 'software-dev',
        goals: ['test'],
        complexity: 'advanced', // Override domain default
        token_budget: 500000, // Override domain default
      };

      const state = orchestrator.createProject(projectConfig);

      expect(state.complexity).toBe('advanced');
      expect(state.token_budget).toBe(500000);
    });
  });

  describe('creative-writing domain', () => {
    test('loads creative-writing domain configuration correctly', () => {
      const env = setupDomainEnvironment();
      createCreativeWritingDomain(env.domainsDir);

      const domainLoader = new DomainLoader(env.domainsDir);
      const domain = domainLoader.loadDomain('creative-writing');

      expect(domain.name).toBe('Creative Writing');
      expect(domain.archetype).toBe('creative-writing');
      expect(domain.defaults.complexity).toBe('advanced');
      expect(domain.defaults.token_budget).toBe(300000);
    });

    test('creative-writing domain defaults are applied', () => {
      const env = setupDomainEnvironment();
      createCreativeWritingDomain(env.domainsDir);

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      const state = orchestrator.createProject({
        name: 'Novel Project',
        description: 'Write a novel',
        archetype: 'creative-writing',
        goals: ['Write compelling story'],
      });

      expect(state.complexity).toBe('advanced');
      expect(state.token_budget).toBe(300000);
    });

    test('creative-writing domain-specific agents are loaded', () => {
      const env = setupDomainEnvironment();
      createCreativeWritingDomain(env.domainsDir);

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      orchestrator.createProject({
        name: 'Story Project',
        description: 'Test',
        archetype: 'creative-writing',
        goals: ['test'],
      });

      const stats = orchestrator.getStats();
      expect(stats.agents_loaded).toBeGreaterThan(4);
    });

    test('creative-writing domain templates are accessible', () => {
      const env = setupDomainEnvironment();
      createCreativeWritingDomain(env.domainsDir);

      const domainLoader = new DomainLoader(env.domainsDir);
      const outlineTemplate = domainLoader.loadTemplate('creative-writing', 'outline');
      const characterTemplate = domainLoader.loadTemplate('creative-writing', 'character');

      expect(outlineTemplate).toContain('Story Outline');
      expect(characterTemplate).toContain('Character Profile');
    });
  });

  describe('multiple domains', () => {
    test('can switch between different domain types', () => {
      const env = setupDomainEnvironment();
      createSoftwareDomain(env.domainsDir);
      createCreativeWritingDomain(env.domainsDir);

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      // Create software project
      const softwareState = orchestrator.createProject({
        name: 'Software Project',
        description: 'Software development',
        archetype: 'software-dev',
        goals: ['build app'],
      });

      expect(softwareState.token_budget).toBe(200000);
      expect(softwareState.complexity).toBe('standard');

      // Create creative writing project
      const writingState = orchestrator.createProject({
        name: 'Writing Project',
        description: 'Creative writing',
        archetype: 'creative-writing',
        goals: ['write story'],
      });

      expect(writingState.token_budget).toBe(300000);
      expect(writingState.complexity).toBe('advanced');
    });

    test('domain-specific agents do not interfere', () => {
      const env = setupDomainEnvironment();
      createSoftwareDomain(env.domainsDir);
      createCreativeWritingDomain(env.domainsDir);

      const domainLoader = new DomainLoader(env.domainsDir);

      const softwareAgents = domainLoader.loadDomainAgents('software-dev');
      const writingAgents = domainLoader.loadDomainAgents('creative-writing');

      const softwareAgentNames = softwareAgents.map((a) => a.name);
      const writingAgentNames = writingAgents.map((a) => a.name);

      expect(softwareAgentNames).toContain('code-reviewer');
      expect(softwareAgentNames).toContain('devops-engineer');
      expect(softwareAgentNames).not.toContain('character-developer');
      expect(softwareAgentNames).not.toContain('plot-architect');

      expect(writingAgentNames).toContain('character-developer');
      expect(writingAgentNames).toContain('plot-architect');
      expect(writingAgentNames).not.toContain('code-reviewer');
      expect(writingAgentNames).not.toContain('devops-engineer');
    });
  });

  describe('custom archetype (no domain)', () => {
    test('custom archetype works without domain directory', () => {
      const env = setupDomainEnvironment();

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
      });

      expect(() => {
        orchestrator.createProject({
          name: 'Custom Project',
          description: 'Custom archetype',
          archetype: 'custom',
          goals: ['custom work'],
        });
      }).not.toThrow();
    });

    test('custom archetype uses engine defaults', () => {
      const env = setupDomainEnvironment();

      orchestrator = new HoneycombOrchestrator({
        db_path: env.dbPath,
        agents_root: env.agentsDir,
        domains_root: env.domainsDir,
        output_dir: env.outputDir,
        log_level: 'error',
        default_token_budget: 100000,
      });

      const state = orchestrator.createProject({
        name: 'Custom Project',
        description: 'Test',
        archetype: 'custom',
        goals: ['test'],
      });

      expect(state.token_budget).toBe(100000);
    });
  });

  describe('domain agent overrides', () => {
    test('agent overrides are applied from domain config', () => {
      const env = setupDomainEnvironment();
      createSoftwareDomain(env.domainsDir);

      const domainLoader = new DomainLoader(env.domainsDir);
      const domain = domainLoader.loadDomain('software-dev');

      expect(domain.agent_overrides['code-reviewer']).toBeDefined();
      expect(domain.agent_overrides['code-reviewer'].enabled).toBe(true);
      expect(domain.agent_overrides['code-reviewer'].priority).toBe(10);
      expect(domain.agent_overrides['code-reviewer'].token_budget_override).toBe(15000);
    });
  });
});
