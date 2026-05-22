/**
 * Tests for ConfigLoader - config merge, complexity assessment.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ConfigLoader,
  createConfigLoader,
  DEFAULT_ENGINE_CONFIG,
} from '../src/config-loader.ts';
import type { ProjectConfig, EngineConfig } from '../src/types.ts';

describe('ConfigLoader', () => {
  let loader: ConfigLoader;
  let tempDir: string;

  beforeEach(() => {
    loader = new ConfigLoader();
    tempDir = mkdtempSync(join(tmpdir(), 'hc-config-test-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // ============================================================
  // getDefaultConfig
  // ============================================================

  describe('getDefaultConfig', () => {
    test('returns a fresh copy of defaults', () => {
      const c1 = loader.getDefaultConfig();
      const c2 = loader.getDefaultConfig();
      expect(c1).toEqual(c2);
      // Ensure they are not the same reference
      expect(c1).not.toBe(c2);
      expect(c1.risk_thresholds).not.toBe(c2.risk_thresholds);
    });

    test('default config has expected values', () => {
      const config = loader.getDefaultConfig();
      expect(config.db_path).toBe('./honeycomb.db');
      expect(config.agents_root).toBe('../agents');
      expect(config.log_level).toBe('info');
      expect(config.default_token_budget).toBe(100000);
      expect(config.max_concurrent_agents).toBe(5);
      expect(config.auto_checkpoint).toBe(true);
    });
  });

  // ============================================================
  // loadEngineConfig
  // ============================================================

  describe('loadEngineConfig', () => {
    test('returns defaults when no path provided', () => {
      const config = loader.loadEngineConfig();
      expect(config).toEqual(loader.getDefaultConfig());
    });

    test('returns defaults when file does not exist', () => {
      const config = loader.loadEngineConfig('/tmp/nonexistent-config.json');
      expect(config).toEqual(loader.getDefaultConfig());
    });

    test('merges partial config with defaults', () => {
      const configPath = join(tempDir, 'engine.json');
      writeFileSync(
        configPath,
        JSON.stringify({
          db_path: '/custom/path.db',
          log_level: 'debug',
          max_concurrent_agents: 10,
        }),
      );

      const config = loader.loadEngineConfig(configPath);
      expect(config.db_path).toBe('/custom/path.db');
      expect(config.log_level).toBe('debug');
      expect(config.max_concurrent_agents).toBe(10);
      // Non-overridden fields use defaults
      expect(config.agents_root).toBe('../agents');
      expect(config.auto_checkpoint).toBe(true);
    });

    test('preserves log_file when provided', () => {
      const configPath = join(tempDir, 'engine.json');
      writeFileSync(
        configPath,
        JSON.stringify({
          log_file: '/var/log/honeycomb.log',
        }),
      );

      const config = loader.loadEngineConfig(configPath);
      expect(config.log_file).toBe('/var/log/honeycomb.log');
    });

    test('merges risk_thresholds partially', () => {
      const configPath = join(tempDir, 'engine.json');
      writeFileSync(
        configPath,
        JSON.stringify({
          risk_thresholds: {
            file_count: { high: 50 },
            security_keywords_enabled: false,
          },
        }),
      );

      const config = loader.loadEngineConfig(configPath);
      expect(config.risk_thresholds.file_count.high).toBe(50);
      // Preserved from defaults
      expect(config.risk_thresholds.file_count.low).toBe(3);
      expect(config.risk_thresholds.file_count.medium).toBe(10);
      expect(config.risk_thresholds.security_keywords_enabled).toBe(false);
    });

    test('returns defaults for invalid JSON', () => {
      const configPath = join(tempDir, 'bad.json');
      writeFileSync(configPath, 'not valid json!!!');

      const config = loader.loadEngineConfig(configPath);
      expect(config).toEqual(loader.getDefaultConfig());
    });
  });

  // ============================================================
  // loadProjectConfig
  // ============================================================

  describe('loadProjectConfig', () => {
    test('loads valid project config', () => {
      const configPath = join(tempDir, 'project.json');
      writeFileSync(
        configPath,
        JSON.stringify({
          name: 'Test Project',
          description: 'A test project',
          archetype: 'software-dev',
          goals: ['build API', 'deploy'],
        }),
      );

      const config = loader.loadProjectConfig(configPath);
      expect(config.name).toBe('Test Project');
      expect(config.description).toBe('A test project');
      expect(config.archetype).toBe('software-dev');
      expect(config.goals).toEqual(['build API', 'deploy']);
    });

    test('throws for non-existent file', () => {
      expect(() =>
        loader.loadProjectConfig('/tmp/nonexistent-project.json'),
      ).toThrow(/not found/);
    });

    test('throws for missing name', () => {
      const configPath = join(tempDir, 'no-name.json');
      writeFileSync(
        configPath,
        JSON.stringify({
          description: 'desc',
          archetype: 'software-dev',
          goals: ['goal1'],
        }),
      );

      expect(() => loader.loadProjectConfig(configPath)).toThrow(/name/);
    });

    test('throws for missing description', () => {
      const configPath = join(tempDir, 'no-desc.json');
      writeFileSync(
        configPath,
        JSON.stringify({
          name: 'Test',
          archetype: 'software-dev',
          goals: ['goal1'],
        }),
      );

      expect(() => loader.loadProjectConfig(configPath)).toThrow(/description/);
    });

    test('throws for missing archetype', () => {
      const configPath = join(tempDir, 'no-arch.json');
      writeFileSync(
        configPath,
        JSON.stringify({
          name: 'Test',
          description: 'desc',
          goals: ['goal1'],
        }),
      );

      expect(() => loader.loadProjectConfig(configPath)).toThrow(/archetype/);
    });

    test('throws for missing goals', () => {
      const configPath = join(tempDir, 'no-goals.json');
      writeFileSync(
        configPath,
        JSON.stringify({
          name: 'Test',
          description: 'desc',
          archetype: 'software-dev',
        }),
      );

      expect(() => loader.loadProjectConfig(configPath)).toThrow(/goals/);
    });

    test('loads config with optional fields', () => {
      const configPath = join(tempDir, 'full.json');
      writeFileSync(
        configPath,
        JSON.stringify({
          name: 'Full Project',
          description: 'Full config',
          archetype: 'creative-writing',
          goals: ['write novel'],
          complexity: 'advanced',
          domain: 'fiction',
          constraints: ['under 100k words'],
          token_budget: 50000,
          custom_agents: ['critic'],
        }),
      );

      const config = loader.loadProjectConfig(configPath);
      expect(config.complexity).toBe('advanced');
      expect(config.domain).toBe('fiction');
      expect(config.constraints).toEqual(['under 100k words']);
      expect(config.token_budget).toBe(50000);
    });
  });

  // ============================================================
  // assessComplexity
  // ============================================================

  describe('assessComplexity', () => {
    function makeProjectConfig(
      overrides?: Partial<ProjectConfig>,
    ): ProjectConfig {
      return {
        name: 'Test',
        description: 'Testing',
        archetype: 'software-dev',
        goals: ['goal1'],
        ...overrides,
      };
    }

    test('1-3 goals -> simple', () => {
      const config = makeProjectConfig({ goals: ['g1', 'g2'] });
      expect(loader.assessComplexity(config)).toBe('simple');
    });

    test('4-7 goals -> standard', () => {
      const config = makeProjectConfig({
        goals: ['g1', 'g2', 'g3', 'g4', 'g5'],
      });
      expect(loader.assessComplexity(config)).toBe('standard');
    });

    test('8-15 goals -> advanced', () => {
      const goals = Array.from({ length: 10 }, (_, i) => `g${i}`);
      const config = makeProjectConfig({ goals });
      expect(loader.assessComplexity(config)).toBe('advanced');
    });

    test('16+ goals -> enterprise', () => {
      const goals = Array.from({ length: 20 }, (_, i) => `g${i}`);
      const config = makeProjectConfig({ goals });
      expect(loader.assessComplexity(config)).toBe('enterprise');
    });

    test('constraints > 5 bumps complexity one level', () => {
      const config = makeProjectConfig({
        goals: ['g1', 'g2'], // base: simple
        constraints: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'], // > 5 -> bump
      });
      expect(loader.assessComplexity(config)).toBe('standard');
    });

    test('custom archetype bumps complexity one level', () => {
      const config = makeProjectConfig({
        goals: ['g1', 'g2'], // base: simple
        archetype: 'custom',
      });
      expect(loader.assessComplexity(config)).toBe('standard');
    });

    test('enterprise does not bump beyond enterprise', () => {
      const goals = Array.from({ length: 20 }, (_, i) => `g${i}`);
      const config = makeProjectConfig({
        goals,
        archetype: 'custom', // already enterprise, bump should cap
      });
      expect(loader.assessComplexity(config)).toBe('enterprise');
    });

    test('both modifiers present still only bumps once', () => {
      const config = makeProjectConfig({
        goals: ['g1'], // base: simple
        constraints: Array.from({ length: 7 }, (_, i) => `c${i}`),
        archetype: 'custom',
      });
      // shouldBump is true (either condition), bumps once: simple -> standard
      expect(loader.assessComplexity(config)).toBe('standard');
    });
  });

  // ============================================================
  // createConfigLoader factory
  // ============================================================

  describe('createConfigLoader', () => {
    test('returns a ConfigLoader instance', () => {
      const cl = createConfigLoader();
      expect(cl).toBeInstanceOf(ConfigLoader);
    });
  });
});
