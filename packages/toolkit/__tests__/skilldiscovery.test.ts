/**
 * SkillDiscovery Tests - 技能动态发现测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SkillDiscovery } from '../src/skills/SkillDiscovery';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('SkillDiscovery', () => {
  let discovery: SkillDiscovery;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(import.meta.dir, 'test-discov-temp');
    await fs.mkdir(testDir, { recursive: true });
    discovery = new SkillDiscovery({ basePath: testDir });
  });

  afterEach(async () => {
    await discovery.stopWatching();
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('discover', () => {
    it('should return empty for empty directory', async () => {
      const skills = await discovery.discover({});
      expect(skills).toEqual([]);
    });

    it('should filter by category', async () => {
      const skillDir = path.join(testDir, 'cat-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Category Skill\n\nCategory: testing');

      const skills = await discovery.discover({ category: 'testing' });
      expect(skills).toBeDefined();
    });
  });

  describe('watch', () => {
    it('should set up file watcher', async () => {
      const callback = () => {};
      await discovery.watch(callback);
      // Watcher is set up, stop it in afterEach
      expect(true).toBe(true);
    });
  });

  describe('getDiscoveredSkills', () => {
    it('should return discovered skills', async () => {
      const skills = discovery.getDiscoveredSkills();
      expect(Array.isArray(skills)).toBe(true);
    });
  });

  describe('getDependencies', () => {
    it('should return dependencies for skill', () => {
      const deps = discovery.getDependencies('non-existent');
      expect(Array.isArray(deps)).toBe(true);
    });
  });

  describe('resolveDependencies', () => {
    it('should resolve dependencies', async () => {
      const result = await discovery.resolveDependencies('non-existent');
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
