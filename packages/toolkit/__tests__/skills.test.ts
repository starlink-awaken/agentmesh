/**
 * Skills Module Tests
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SkillLoader } from '../src/skills/SkillLoader.js';
import { SkillRouter } from '../src/skills/SkillRouter.js';
import { SkillDiscovery, createSkillDiscovery } from '../src/skills/SkillDiscovery.js';

const testDir = path.join(import.meta.dir, 'test-skills-temp');

describe('SkillLoader', () => {
  let loader: SkillLoader;

  beforeEach(() => {
    loader = new SkillLoader();
  });

  it('should create SkillLoader instance', () => {
    expect(loader).toBeDefined();
    expect(loader.getAll()).toEqual([]);
  });

  it('should register a skill', () => {
    const skill = {
      id: 'test-skill',
      name: 'Test Skill',
      description: 'A test skill',
      triggers: ['test', 'demo'],
      role: 'specialist' as const,
      scope: 'implementation' as const,
      outputFormat: 'code' as const,
      category: 'testing',
      references: [],
    };

    loader.register(skill);
    expect(loader.get('test-skill')).toEqual(skill);
    expect(loader.getAll()).toHaveLength(1);
  });

  it('should register multiple skills', () => {
    const skills = [
      {
        id: 'skill-1',
        name: 'Skill 1',
        description: 'First skill',
        triggers: ['test1'],
        role: 'specialist' as const,
        scope: 'implementation' as const,
        outputFormat: 'code' as const,
        category: 'test',
        references: [],
      },
      {
        id: 'skill-2',
        name: 'Skill 2',
        description: 'Second skill',
        triggers: ['test2'],
        role: 'generalist' as const,
        scope: 'analysis' as const,
        outputFormat: 'text' as const,
        category: 'test',
        references: [],
      },
    ];

    loader.registerMany(skills);
    expect(loader.getAll()).toHaveLength(2);
  });

  it('should search skills by query', () => {
    const skills = [
      {
        id: 'code-review',
        name: 'Code Review',
        description: 'Review code for bugs',
        triggers: ['review', 'check'],
        role: 'reviewer' as const,
        scope: 'review' as const,
        outputFormat: 'text' as const,
        category: 'quality',
        references: [],
      },
      {
        id: 'api-design',
        name: 'API Design',
        description: 'Design REST APIs',
        triggers: ['api', 'design'],
        role: 'architect' as const,
        scope: 'design' as const,
        outputFormat: 'code' as const,
        category: 'architecture',
        references: [],
      },
    ];

    loader.registerMany(skills);

    const results = loader.search('review code');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('code-review');
  });

  it('should load skill with references', async () => {
    const skill = {
      id: 'test-ref',
      name: 'Test With Ref',
      description: 'Skill with references',
      triggers: ['ref'],
      role: 'specialist' as const,
      scope: 'implementation' as const,
      outputFormat: 'mixed' as const,
      category: 'test',
      references: [
        { topic: 'guide', file: 'guide.md', loadWhen: 'always' },
      ],
    };

    loader.register(skill);

    const instance = await loader.load('test-ref', {
      loadReferences: true,
    });

    expect(instance).toBeDefined();
    expect(instance?.definition.id).toBe('test-ref');
    expect(instance?.loadedReferences.size).toBeGreaterThanOrEqual(0);
  });
});

describe('SkillRouter', () => {
  let loader: SkillLoader;
  let router: SkillRouter;

  beforeEach(() => {
    loader = new SkillLoader();
    router = new SkillRouter(loader);
  });

  it('should create SkillRouter instance', () => {
    expect(router).toBeDefined();
  });

  it('should match skills by triggers', () => {
    loader.register({
      id: 'code-gen',
      name: 'Code Generation',
      description: 'Generate code',
      triggers: ['generate', 'create'],
      role: 'specialist' as const,
      scope: 'implementation' as const,
      outputFormat: 'code' as const,
      category: 'development',
      references: [],
    });

    const results = router.match('Please generate a function');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].skill.id).toBe('code-gen');
    expect(results[0].confidence).toBeGreaterThan(0);
  });

  it('should get best match', () => {
    loader.register({
      id: 'api-doc',
      name: 'API Documentation',
      description: 'Generate API docs',
      triggers: ['document', 'doc'],
      role: 'specialist' as const,
      scope: 'implementation' as const,
      outputFormat: 'text' as const,
      category: 'documentation',
      references: [],
    });

    const result = router.getBestMatch('Write documentation for API');
    expect(result).toBeDefined();
    expect(result?.skill.id).toBe('api-doc');
  });

  it('should get recommendations', () => {
    const skills = [
      {
        id: 'frontend',
        name: 'Frontend Dev',
        description: 'Frontend development',
        triggers: ['ui', 'react', 'vue'],
        role: 'specialist' as const,
        scope: 'implementation' as const,
        outputFormat: 'code' as const,
        category: 'development',
        references: [],
      },
      {
        id: 'backend',
        name: 'Backend Dev',
        description: 'Backend development',
        triggers: ['api', 'database', 'server'],
        role: 'specialist' as const,
        scope: 'implementation' as const,
        outputFormat: 'code' as const,
        category: 'development',
        references: [],
      },
    ];

    loader.registerMany(skills);

    const recommendations = router.getRecommendations('build a web app', 2);
    expect(recommendations).toHaveLength(2);
  });
});

describe('SkillDiscovery', () => {
  let discovery: SkillDiscovery;

  beforeEach(async () => {
    // Create temp directory for testing
    try {
      await fs.mkdir(testDir, { recursive: true });
    } catch {
      // Directory may already exist
    }

    discovery = createSkillDiscovery({
      basePath: testDir,
      recursive: true,
    });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    await discovery.stopWatching();
  });

  it('should create SkillDiscovery instance', () => {
    expect(discovery).toBeDefined();
  });

  it('should discover skills from directory', async () => {
    // Create test skill files
    const skillDir = path.join(testDir, 'test-skill');
    await fs.mkdir(skillDir, { recursive: true });

    await fs.writeFile(
      path.join(skillDir, 'skill.yaml'),
      `
id: test-skill
name: Test Skill
version: "1.0.0"
description: A test skill
triggers:
  - test
  - demo
role: specialist
scope: implementation
outputFormat: code
category: testing
references: []
`
    );

    const manifests = await discovery.discover();
    expect(manifests.length).toBeGreaterThanOrEqual(1);

    const skill = manifests.find(m => m.id === 'test-skill');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('Test Skill');
    expect(skill?.version).toBe('1.0.0');
  });

  it('should discover skills from JSON files', async () => {
    const skillDir = path.join(testDir, 'json-skill');
    await fs.mkdir(skillDir, { recursive: true });

    await fs.writeFile(
      path.join(skillDir, 'skill.json'),
      JSON.stringify({
        id: 'json-skill',
        name: 'JSON Skill',
        version: '2.0.0',
        description: 'A JSON skill',
        triggers: ['json'],
        role: 'specialist',
        scope: 'implementation',
        outputFormat: 'mixed',
        category: 'data',
        references: [],
      })
    );

    const manifests = await discovery.discover();
    const skill = manifests.find(m => m.id === 'json-skill');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('JSON Skill');
  });

  it('should load skill instance', async () => {
    const skillDir = path.join(testDir, 'load-test');
    await fs.mkdir(skillDir, { recursive: true });

    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      `---
id: load-test
name: Load Test Skill
version: "1.0.0"
description: Skill for testing load
triggers:
  - load
role: specialist
scope: implementation
outputFormat: code
category: test
references: []
---
`
    );

    await discovery.discover();

    const instance = await discovery.load('load-test');
    expect(instance).toBeDefined();
    expect(instance?.definition.id).toBe('load-test');
  });

  it('should get discovered skills', async () => {
    const skillDir = path.join(testDir, 'list-skill');
    await fs.mkdir(skillDir, { recursive: true });

    await fs.writeFile(
      path.join(skillDir, 'skill.json'),
      JSON.stringify({
        id: 'list-skill',
        name: 'List Skill',
        version: '1.0.0',
        description: 'List test',
        triggers: ['list'],
        role: 'specialist',
        scope: 'implementation',
        outputFormat: 'code',
        category: 'test',
        references: [],
      })
    );

    await discovery.discover();

    const skills = discovery.getDiscoveredSkills();
    expect(skills.length).toBeGreaterThan(0);
  });
});

describe('SkillLoader loadFile', () => {
  let loader: SkillLoader;
  let testFilePath: string;

  beforeEach(async () => {
    loader = new SkillLoader();
    // Create temp test directory and file
    await fs.mkdir(testDir, { recursive: true });
    testFilePath = path.join(testDir, 'test-file.txt');
    await fs.writeFile(testFilePath, 'Hello World');
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup
    }
  });

  it('should load file content', async () => {
    const content = await loader.loadFile(testFilePath);
    expect(content).toBe('Hello World');
  });

  it('should load file with relative path', async () => {
    const content = await loader.loadFile('test-file.txt', testDir);
    expect(content).toBe('Hello World');
  });
});
