/**
 * Honeycomb v2 - Decomposer Unit Tests
 *
 * Tests for the project decomposer including:
 * - All archetype strategies (software-dev, creative-writing, visual-production, document-processing, custom)
 * - Dependency validation
 * - Topological sorting
 * - Strategy registration
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  Decomposer,
  createDecomposer,
  type DecompositionResult,
  type SubProject,
  type DecompositionStrategy,
  type ValidationResult,
} from '../src/decomposer.js';
import type { ProjectConfig } from '../src/types.js';

// ============================================================
// Test Helpers
// ============================================================

function createBasicConfig(archetype: ProjectConfig['archetype'] = 'software-dev'): ProjectConfig {
  return {
    name: 'test-project',
    description: 'Test project description',
    archetype,
    complexity: 'standard',
    goals: [
      'Build user authentication',
      'Create product catalog',
      'Implement search',
    ],
    constraints: [],
  };
}

// ============================================================
// Test Suite
// ============================================================

describe('Decomposer', () => {
  let decomposer: Decomposer;

  beforeEach(() => {
    decomposer = createDecomposer();
  });

  // ============================================================
  // Software Dev Archetype
  // ============================================================

  describe('Software Development Archetype', () => {
    it('should decompose into standard sub-projects', () => {
      const config = createBasicConfig('software-dev');
      const result = decomposer.decompose(config);

      expect(result.sub_projects.length).toBeGreaterThan(0);
      expect(result.sub_projects.some(sp => sp.name === 'infrastructure')).toBe(true);
      expect(result.sub_projects.some(sp => sp.name === 'user-system')).toBe(true);
      expect(result.sub_projects.some(sp => sp.name === 'product-system')).toBe(true);
      expect(result.sub_projects.some(sp => sp.name === 'order-system')).toBe(true);
      expect(result.sub_projects.some(sp => sp.name === 'search-system')).toBe(true);
      expect(result.sub_projects.some(sp => sp.name === 'admin-system')).toBe(true);
    });

    it('should create proper dependencies between sub-projects', () => {
      const config = createBasicConfig('software-dev');
      const result = decomposer.decompose(config);

      const infrastructure = result.sub_projects.find(sp => sp.name === 'infrastructure');
      const userSystem = result.sub_projects.find(sp => sp.name === 'user-system');
      const orderSystem = result.sub_projects.find(sp => sp.name === 'order-system');

      expect(infrastructure?.dependencies.length).toBe(0);
      expect(userSystem?.dependencies).toContain(infrastructure?.id);
      expect(orderSystem?.dependencies.length).toBeGreaterThan(0);
    });

    it('should generate execution batches respecting dependencies', () => {
      const config = createBasicConfig('software-dev');
      const result = decomposer.decompose(config);

      expect(result.execution_batches.length).toBeGreaterThan(0);

      // First batch should contain infrastructure (no dependencies)
      const firstBatch = result.execution_batches[0];
      expect(firstBatch.length).toBeGreaterThan(0);
    });

    it('should estimate parallelism correctly', () => {
      const config = createBasicConfig('software-dev');
      const result = decomposer.decompose(config);

      expect(result.estimated_parallelism).toBeGreaterThan(0);
      expect(result.estimated_parallelism).toBeLessThanOrEqual(result.sub_projects.length);
    });
  });

  // ============================================================
  // Creative Writing Archetype
  // ============================================================

  describe('Creative Writing Archetype', () => {
    it('should decompose into creative phases', () => {
      const config: ProjectConfig = {
        ...createBasicConfig('creative-writing'),
        goals: ['Write novel', 'Create characters', 'Build plot'],
      };

      const result = decomposer.decompose(config);

      expect(result.sub_projects.some(sp => sp.name === 'worldbuilding')).toBe(true);
      expect(result.sub_projects.some(sp => sp.name === 'character-design')).toBe(true);
      expect(result.sub_projects.some(sp => sp.name === 'plot-architecture')).toBe(true);
      expect(result.sub_projects.some(sp => sp.name === 'chapter-writing')).toBe(true);
      expect(result.sub_projects.some(sp => sp.name === 'quality-review')).toBe(true);
    });

    it('should create linear dependencies for creative phases', () => {
      const config: ProjectConfig = {
        ...createBasicConfig('creative-writing'),
        goals: ['Write story'],
      };

      const result = decomposer.decompose(config);

      // Each phase should depend on previous phases
      const worldbuilding = result.sub_projects.find(sp => sp.name === 'worldbuilding');
      const characterDesign = result.sub_projects.find(sp => sp.name === 'character-design');
      const plotArchitecture = result.sub_projects.find(sp => sp.name === 'plot-architecture');
      const chapterWriting = result.sub_projects.find(sp => sp.name === 'chapter-writing');
      const qualityReview = result.sub_projects.find(sp => sp.name === 'quality-review');

      expect(worldbuilding?.dependencies.length).toBe(0);
      expect(characterDesign?.dependencies).toContain(worldbuilding?.id);
      expect(plotArchitecture?.dependencies).toContain(worldbuilding?.id);
      expect(chapterWriting?.dependencies).toContain(plotArchitecture?.id);
      expect(qualityReview?.dependencies).toContain(chapterWriting?.id);
    });
  });

  // ============================================================
  // Visual Production Archetype
  // ============================================================

  describe('Visual Production Archetype', () => {
    it('should decompose into production pipeline phases', () => {
      const config: ProjectConfig = {
        ...createBasicConfig('visual-production'),
        goals: ['Create animation', 'Design visual style'],
      };

      const result = decomposer.decompose(config);

      expect(result.sub_projects.some(sp => sp.name === 'screenplay')).toBe(true);
      expect(result.sub_projects.some(sp => sp.name === 'visual-design')).toBe(true);
      expect(result.sub_projects.some(sp => sp.name === 'storyboard')).toBe(true);
      expect(result.sub_projects.some(sp => sp.name === 'production')).toBe(true);
      expect(result.sub_projects.some(sp => sp.name === 'quality-review')).toBe(true);
    });

    it('should respect production pipeline dependencies', () => {
      const config: ProjectConfig = {
        ...createBasicConfig('visual-production'),
        goals: ['Produce video'],
      };

      const result = decomposer.decompose(config);

      const screenplay = result.sub_projects.find(sp => sp.name === 'screenplay');
      const visualDesign = result.sub_projects.find(sp => sp.name === 'visual-design');
      const storyboard = result.sub_projects.find(sp => sp.name === 'storyboard');
      const production = result.sub_projects.find(sp => sp.name === 'production');

      expect(screenplay?.dependencies.length).toBe(0);
      expect(visualDesign?.dependencies).toContain(screenplay?.id);
      expect(storyboard?.dependencies).toContain(screenplay?.id);
      expect(storyboard?.dependencies).toContain(visualDesign?.id);
      expect(production?.dependencies).toContain(storyboard?.id);
    });
  });

  // ============================================================
  // Document Processing Archetype (NEW TESTS)
  // ============================================================

  describe('Document Processing Archetype', () => {
    it('should decompose into linear pipeline phases', () => {
      const config: ProjectConfig = {
        ...createBasicConfig('document-processing'),
        goals: ['Process documents', 'Validate output'],
      };

      const result = decomposer.decompose(config);

      expect(result.sub_projects.some(sp => sp.name === 'analysis')).toBe(true);
      expect(result.sub_projects.some(sp => sp.name === 'processing')).toBe(true);
      expect(result.sub_projects.some(sp => sp.name === 'formatting')).toBe(true);
      expect(result.sub_projects.some(sp => sp.name === 'validation')).toBe(true);
    });

    it('should create sequential pipeline dependencies', () => {
      const config: ProjectConfig = {
        ...createBasicConfig('document-processing'),
        goals: ['Analyze and format docs'],
      };

      const result = decomposer.decompose(config);

      const analysis = result.sub_projects.find(sp => sp.name === 'analysis');
      const processing = result.sub_projects.find(sp => sp.name === 'processing');
      const formatting = result.sub_projects.find(sp => sp.name === 'formatting');
      const validation = result.sub_projects.find(sp => sp.name === 'validation');

      expect(analysis?.dependencies.length).toBe(0);
      expect(processing?.dependencies).toContain(analysis?.id);
      expect(formatting?.dependencies).toContain(processing?.id);
      expect(validation?.dependencies).toContain(formatting?.id);
    });

    it('should assign correct complexities to document phases', () => {
      const config: ProjectConfig = {
        ...createBasicConfig('document-processing'),
        goals: ['Process docs'],
      };

      const result = decomposer.decompose(config);

      const analysis = result.sub_projects.find(sp => sp.name === 'analysis');
      const processing = result.sub_projects.find(sp => sp.name === 'processing');
      const formatting = result.sub_projects.find(sp => sp.name === 'formatting');
      const validation = result.sub_projects.find(sp => sp.name === 'validation');

      expect(analysis?.estimated_complexity).toBe('standard');
      expect(processing?.estimated_complexity).toBe('standard');
      expect(formatting?.estimated_complexity).toBe('simple');
      expect(validation?.estimated_complexity).toBe('simple');
    });

    it('should filter goals by keywords for document processing', () => {
      const config: ProjectConfig = {
        ...createBasicConfig('document-processing'),
        goals: [
          'Analyze document structure',
          'Extract metadata from content',
          'Format output as PDF',
          'Validate schema compliance',
        ],
      };

      const result = decomposer.decompose(config);

      // Check that goals were distributed appropriately
      const allGoals = result.sub_projects.flatMap(sp => sp.goals);
      expect(allGoals.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Custom Archetype (NEW TESTS)
  // ============================================================

  describe('Custom Archetype', () => {
    it('should wrap project as single monolithic sub-project', () => {
      const config: ProjectConfig = {
        ...createBasicConfig('custom'),
        goals: ['Custom goal 1', 'Custom goal 2'],
        constraints: ['Must use specific framework'],
      };

      const result = decomposer.decompose(config);

      expect(result.sub_projects.length).toBe(1);
      expect(result.sub_projects[0].name).toBe('test-project');
      expect(result.sub_projects[0].description).toBe('Test project description');
      expect(result.sub_projects[0].archetype).toBe('custom');
      expect(result.sub_projects[0].dependencies).toEqual([]);
      expect(result.sub_projects[0].tags).toContain('custom');
      expect(result.sub_projects[0].tags).toContain('monolithic');
    });

    it('should preserve original constraints in metadata', () => {
      const config: ProjectConfig = {
        ...createBasicConfig('custom'),
        constraints: ['Constraint 1', 'Constraint 2'],
      };

      const result = decomposer.decompose(config);

      expect(result.sub_projects[0].metadata).toEqual({
        original_constraints: ['Constraint 1', 'Constraint 2'],
      });
    });

    it('should handle empty constraints gracefully', () => {
      const config: ProjectConfig = {
        ...createBasicConfig('custom'),
        constraints: [],
      };

      const result = decomposer.decompose(config);

      expect(result.sub_projects[0].metadata).toEqual({
        original_constraints: [],
      });
    });

    it('should use provided complexity or default to standard', () => {
      const config1: ProjectConfig = {
        ...createBasicConfig('custom'),
        complexity: 'advanced',
      };

      const result1 = decomposer.decompose(config1);
      expect(result1.sub_projects[0].estimated_complexity).toBe('advanced');

      const config2: ProjectConfig = {
        name: 'test-2',
        description: 'test',
        archetype: 'custom',
        complexity: undefined,
        goals: [],
        constraints: [],
      };

      const result2 = decomposer.decompose(config2);
      expect(result2.sub_projects[0].estimated_complexity).toBe('standard');
    });
  });

  // ============================================================
  // Dependency Validation
  // ============================================================

  describe('Dependency Validation', () => {
    it('should detect missing dependency references', () => {
      const customStrategy: DecompositionStrategy = {
        name: 'test-invalid-deps',
        archetype: 'software-dev',
        decompose(): SubProject[] {
          return [
            {
              id: 'sp-1',
              name: 'Sub 1',
              description: 'Test',
              archetype: 'software-dev',
              goals: [],
              dependencies: ['non-existent-id'],
              estimated_complexity: 'standard',
              priority: 5,
              tags: [],
              metadata: {},
            },
          ];
        },
      };

      decomposer.registerStrategy(customStrategy);
      const config = createBasicConfig('software-dev');

      expect(() => decomposer.decompose(config)).toThrow();
    });

    it('should detect self-dependencies', () => {
      const customStrategy: DecompositionStrategy = {
        name: 'test-self-deps',
        archetype: 'software-dev',
        decompose(): SubProject[] {
          const id = 'sp-1';
          return [
            {
              id,
              name: 'Sub 1',
              description: 'Test',
              archetype: 'software-dev',
              goals: [],
              dependencies: [id], // Self dependency
              estimated_complexity: 'standard',
              priority: 5,
              tags: [],
              metadata: {},
            },
          ];
        },
      };

      decomposer.registerStrategy(customStrategy);
      const config = createBasicConfig('software-dev');

      expect(() => decomposer.decompose(config)).toThrow();
    });

    it('should detect circular dependencies', () => {
      const customStrategy: DecompositionStrategy = {
        name: 'test-cycle',
        archetype: 'software-dev',
        decompose(): SubProject[] {
          const id1 = 'sp-1';
          const id2 = 'sp-2';
          return [
            {
              id: id1,
              name: 'Sub 1',
              description: 'Test',
              archetype: 'software-dev',
              goals: [],
              dependencies: [id2], // Depends on 2
              estimated_complexity: 'standard',
              priority: 5,
              tags: [],
              metadata: {},
            },
            {
              id: id2,
              name: 'Sub 2',
              description: 'Test',
              archetype: 'software-dev',
              goals: [],
              dependencies: [id1], // Depends on 1 - cycle!
              estimated_complexity: 'standard',
              priority: 5,
              tags: [],
              metadata: {},
            },
          ];
        },
      };

      decomposer.registerStrategy(customStrategy);
      const config = createBasicConfig('software-dev');

      expect(() => decomposer.decompose(config)).toThrow();
    });
  });

  // ============================================================
  // Strategy Management
  // ============================================================

  describe('Strategy Management', () => {
    it('should register custom strategy', () => {
      const customStrategy: DecompositionStrategy = {
        name: 'my-custom-strategy',
        archetype: 'software-dev',
        decompose(): SubProject[] {
          return [
            {
              id: 'custom-sp',
              name: 'Custom SP',
              description: 'Custom',
              archetype: 'software-dev',
              goals: [],
              dependencies: [],
              estimated_complexity: 'simple',
              priority: 5,
              tags: ['custom'],
              metadata: {},
            },
          ];
        },
      };

      decomposer.registerStrategy(customStrategy);

      const retrieved = decomposer.getStrategy('software-dev');
      expect(retrieved?.name).toBe('my-custom-strategy');
    });

    it('should allow replacing existing strategy', () => {
      const newStrategy: DecompositionStrategy = {
        name: 'replacement',
        archetype: 'software-dev',
        decompose(): SubProject[] {
          return [
            {
              id: 'replacement-sp',
              name: 'Replacement',
              description: 'Replaced',
              archetype: 'software-dev',
              goals: [],
              dependencies: [],
              estimated_complexity: 'simple',
              priority: 1,
              tags: [],
              metadata: {},
            },
          ];
        },
      };

      decomposer.registerStrategy(newStrategy);

      const config = createBasicConfig('software-dev');
      const result = decomposer.decompose(config);

      expect(result.sub_projects[0].name).toBe('Replacement');
      expect(result.sub_projects[0].priority).toBe(1);
    });

    it('should return undefined for non-existent strategy', () => {
      const result = decomposer.getStrategy('non-existent' as any);
      expect(result).toBeUndefined();
    });
  });

  // ============================================================
  // Topological Sort
  // ============================================================

  describe('Topological Sort', () => {
    it('should handle complex dependency graphs', () => {
      const config = createBasicConfig('software-dev');
      const result = decomposer.decompose(config);

      // Verify all sub-projects are in execution batches
      const allIdsInBatches = new Set(result.execution_batches.flat());
      for (const sp of result.sub_projects) {
        expect(allIdsInBatches.has(sp.id)).toBe(true);
      }
    });

    it('should sort batch by priority (highest first)', () => {
      const config = createBasicConfig('software-dev');
      const result = decomposer.decompose(config);

      // First batch should have infrastructure
      const firstBatch = result.execution_batches[0];
      const infrastructure = result.sub_projects.find(sp => sp.name === 'infrastructure');

      expect(firstBatch).toContain(infrastructure?.id);
    });
  });

  // ============================================================
  // Decomposition Result Structure
  // ============================================================

  describe('Decomposition Result', () => {
    it('should include all required fields', () => {
      const config = createBasicConfig();
      const result = decomposer.decompose(config);

      expect(result.original_project).toBe('test-project');
      expect(result.archetype).toBe('software-dev');
      expect(result.sub_projects).toBeInstanceOf(Array);
      expect(result.dependency_graph).toBeInstanceOf(Array);
      expect(result.execution_batches).toBeInstanceOf(Array);
      expect(result.estimated_parallelism).toBeGreaterThanOrEqual(0);
      expect(result.decomposition_strategy).toBeTruthy();
      expect(result.created_at).toBeLessThanOrEqual(Date.now());
    });

    it('should build correct dependency graph', () => {
      const config = createBasicConfig();
      const result = decomposer.decompose(config);

      for (const edge of result.dependency_graph) {
        expect(edge.from).toBeTruthy();
        expect(edge.to).toBeTruthy();
        expect(['hard', 'soft']).toContain(edge.type);

        // Verify the edge references exist
        expect(result.sub_projects.some(sp => sp.id === edge.from)).toBe(true);
        expect(result.sub_projects.some(sp => sp.id === edge.to)).toBe(true);
      }
    });
  });

  // ============================================================
  // Edge Cases
  // ============================================================

  describe('Edge Cases', () => {
    it('should handle empty goals array', () => {
      const config: ProjectConfig = {
        name: 'test',
        description: 'test',
        archetype: 'software-dev',
        complexity: 'simple',
        goals: [],
        constraints: [],
      };

      const result = decomposer.decompose(config);

      expect(result.sub_projects.length).toBeGreaterThan(0);
    });

    it('should throw on unregistered archetype', () => {
      // Create a fresh decomposer without default strategies
      const emptyDecomposer = new Decomposer();

      const config: ProjectConfig = {
        name: 'test',
        description: 'test',
        archetype: 'unknown-type' as any,
        complexity: 'simple',
        goals: [],
        constraints: [],
      };

      expect(() => emptyDecomposer.decompose(config)).toThrow();
    });

    it('should handle projects with no dependencies', () => {
      const config = createBasicConfig('custom');
      const result = decomposer.decompose(config);

      expect(result.execution_batches[0].length).toBe(1);
      expect(result.execution_batches.length).toBe(1);
    });
  });

  // ============================================================
  // Factory and Singleton
  // ============================================================

  describe('Factory and Singleton', () => {
    it('createDecomposer should create new instance', () => {
      const d = createDecomposer();
      expect(d).toBeInstanceOf(Decomposer);
    });

    it('singleton decomposer should be available', () => {
      const { decomposer: singleton } = require('../src/decomposer.js');
      expect(singleton).toBeInstanceOf(Decomposer);
    });
  });
});
