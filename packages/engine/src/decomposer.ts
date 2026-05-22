/**
 * Honeycomb v2 - Project Decomposer
 *
 * Automatically decomposes large projects into independently executable
 * sub-projects based on project archetype, complexity, and goals.
 * Manages dependency graphs, topological sorting for execution batching,
 * and parallel execution coordination.
 *
 * Each archetype has a default decomposition strategy that can be
 * overridden or extended via registerStrategy(). The decomposer
 * validates dependency graphs for cycles and missing references
 * before returning results.
 */

import crypto from 'node:crypto';

import type {
  ProjectArchetype,
  ComplexityLevel,
  ProjectConfig,
} from './types.js';

// ============================================================
// Type Definitions
// ============================================================

/** A sub-project produced by decomposition */
export interface SubProject {
  id: string;
  name: string;
  description: string;
  archetype: ProjectArchetype;
  goals: string[];
  dependencies: string[];  // SubProject IDs this depends on
  estimated_complexity: ComplexityLevel;
  priority: number;  // 1-10, higher = more important
  tags: string[];
  metadata: Record<string, unknown>;
}

/** The complete result of a decomposition operation */
export interface DecompositionResult {
  original_project: string;
  archetype: ProjectArchetype;
  sub_projects: SubProject[];
  dependency_graph: DependencyEdge[];
  execution_batches: string[][];  // Topologically sorted batches of IDs
  estimated_parallelism: number;  // Max simultaneous sub-projects
  decomposition_strategy: string;
  created_at: number;
}

/** A directed edge in the dependency graph */
export interface DependencyEdge {
  from: string;  // SubProject ID (the one that depends)
  to: string;    // SubProject ID (the one depended upon)
  type: 'hard' | 'soft';  // Hard = must complete first, Soft = preferred order
}

/** Strategy for decomposing a project of a given archetype */
export interface DecompositionStrategy {
  name: string;
  archetype: ProjectArchetype;
  decompose: (config: ProjectConfig) => SubProject[];
}

/** Result of dependency validation */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================
// Default Decomposition Strategies
// ============================================================

/**
 * Creates a sub-project with sensible defaults and a unique ID.
 * Internal helper used by all default strategies.
 */
function createSubProject(
  overrides: Partial<SubProject> & Pick<SubProject, 'name' | 'description' | 'archetype'>,
): SubProject {
  return {
    id: crypto.randomUUID(),
    goals: [],
    dependencies: [],
    estimated_complexity: 'standard',
    priority: 5,
    tags: [],
    metadata: {},
    ...overrides,
  };
}

/**
 * Software development archetype strategy.
 *
 * Decomposes into domain-driven sub-systems: user management,
 * product catalog, order processing, search, admin dashboard,
 * and shared infrastructure.
 */
const softwareDevStrategy: DecompositionStrategy = {
  name: 'software-dev-default',
  archetype: 'software-dev',
  decompose(config: ProjectConfig): SubProject[] {
    const baseGoals = config.goals;

    const infrastructure = createSubProject({
      name: 'infrastructure',
      description: 'Shared infrastructure: CI/CD, database schemas, networking, monitoring, and deployment configuration',
      archetype: 'software-dev',
      goals: filterGoalsByKeywords(baseGoals, ['infra', 'deploy', 'ci', 'cd', 'monitor', 'database', 'config']),
      dependencies: [],
      estimated_complexity: 'standard',
      priority: 10,
      tags: ['infrastructure', 'foundation'],
    });

    const userSystem = createSubProject({
      name: 'user-system',
      description: 'User authentication, authorization, profiles, and session management',
      archetype: 'software-dev',
      goals: filterGoalsByKeywords(baseGoals, ['user', 'auth', 'login', 'profile', 'account', 'permission']),
      dependencies: [infrastructure.id],
      estimated_complexity: 'standard',
      priority: 9,
      tags: ['core', 'auth', 'user'],
    });

    const productSystem = createSubProject({
      name: 'product-system',
      description: 'Product catalog, categories, inventory management, and content delivery',
      archetype: 'software-dev',
      goals: filterGoalsByKeywords(baseGoals, ['product', 'catalog', 'inventory', 'content', 'item']),
      dependencies: [infrastructure.id],
      estimated_complexity: 'standard',
      priority: 8,
      tags: ['core', 'product', 'catalog'],
    });

    const orderSystem = createSubProject({
      name: 'order-system',
      description: 'Order processing, payment integration, cart management, and fulfillment',
      archetype: 'software-dev',
      goals: filterGoalsByKeywords(baseGoals, ['order', 'payment', 'cart', 'checkout', 'fulfill']),
      dependencies: [infrastructure.id, userSystem.id, productSystem.id],
      estimated_complexity: 'advanced',
      priority: 7,
      tags: ['core', 'order', 'payment'],
    });

    const searchSystem = createSubProject({
      name: 'search-system',
      description: 'Search indexing, full-text search, filtering, sorting, and recommendation engine',
      archetype: 'software-dev',
      goals: filterGoalsByKeywords(baseGoals, ['search', 'filter', 'sort', 'recommend', 'index']),
      dependencies: [infrastructure.id, productSystem.id],
      estimated_complexity: 'standard',
      priority: 6,
      tags: ['feature', 'search'],
    });

    const adminSystem = createSubProject({
      name: 'admin-system',
      description: 'Administration dashboard, analytics, reporting, user management, and system configuration',
      archetype: 'software-dev',
      goals: filterGoalsByKeywords(baseGoals, ['admin', 'dashboard', 'analytics', 'report', 'manage']),
      dependencies: [infrastructure.id, userSystem.id, productSystem.id, orderSystem.id],
      estimated_complexity: 'standard',
      priority: 5,
      tags: ['feature', 'admin', 'dashboard'],
    });

    return [infrastructure, userSystem, productSystem, orderSystem, searchSystem, adminSystem];
  },
};

/**
 * Creative writing archetype strategy.
 *
 * Decomposes into sequential creative phases: worldbuilding,
 * character design, plot architecture, chapter writing, and
 * quality review.
 */
const creativeWritingStrategy: DecompositionStrategy = {
  name: 'creative-writing-default',
  archetype: 'creative-writing',
  decompose(config: ProjectConfig): SubProject[] {
    const baseGoals = config.goals;

    const worldbuilding = createSubProject({
      name: 'worldbuilding',
      description: 'World creation: setting, geography, history, culture, rules, and atmosphere',
      archetype: 'creative-writing',
      goals: filterGoalsByKeywords(baseGoals, ['world', 'setting', 'geography', 'culture', 'history', 'rules']),
      dependencies: [],
      estimated_complexity: 'standard',
      priority: 10,
      tags: ['foundation', 'world'],
    });

    const characterDesign = createSubProject({
      name: 'character-design',
      description: 'Character creation: profiles, backstories, motivations, relationships, and arcs',
      archetype: 'creative-writing',
      goals: filterGoalsByKeywords(baseGoals, ['character', 'protagonist', 'antagonist', 'motivation', 'relationship']),
      dependencies: [worldbuilding.id],
      estimated_complexity: 'standard',
      priority: 9,
      tags: ['foundation', 'character'],
    });

    const plotArchitecture = createSubProject({
      name: 'plot-architecture',
      description: 'Plot structure: story arcs, conflict, pacing, themes, and narrative architecture',
      archetype: 'creative-writing',
      goals: filterGoalsByKeywords(baseGoals, ['plot', 'story', 'arc', 'conflict', 'theme', 'structure']),
      dependencies: [worldbuilding.id, characterDesign.id],
      estimated_complexity: 'advanced',
      priority: 8,
      tags: ['structure', 'plot'],
    });

    const chapterWriting = createSubProject({
      name: 'chapter-writing',
      description: 'Chapter drafting: scene composition, dialogue, prose, transitions, and narrative voice',
      archetype: 'creative-writing',
      goals: filterGoalsByKeywords(baseGoals, ['chapter', 'scene', 'dialogue', 'write', 'draft', 'prose']),
      dependencies: [plotArchitecture.id],
      estimated_complexity: 'advanced',
      priority: 7,
      tags: ['production', 'writing'],
    });

    const qualityReview = createSubProject({
      name: 'quality-review',
      description: 'Editorial review: consistency checks, style editing, pacing review, and final polish',
      archetype: 'creative-writing',
      goals: filterGoalsByKeywords(baseGoals, ['review', 'edit', 'quality', 'consistency', 'polish']),
      dependencies: [chapterWriting.id],
      estimated_complexity: 'standard',
      priority: 6,
      tags: ['quality', 'review'],
    });

    return [worldbuilding, characterDesign, plotArchitecture, chapterWriting, qualityReview];
  },
};

/**
 * Visual production archetype strategy.
 *
 * Decomposes into production pipeline phases: screenplay,
 * visual design, storyboard, production, and quality review.
 */
const visualProductionStrategy: DecompositionStrategy = {
  name: 'visual-production-default',
  archetype: 'visual-production',
  decompose(config: ProjectConfig): SubProject[] {
    const baseGoals = config.goals;

    const screenplay = createSubProject({
      name: 'screenplay',
      description: 'Script writing: narrative structure, dialogue, scene directions, and shot descriptions',
      archetype: 'visual-production',
      goals: filterGoalsByKeywords(baseGoals, ['script', 'screenplay', 'dialogue', 'scene', 'narrative']),
      dependencies: [],
      estimated_complexity: 'standard',
      priority: 10,
      tags: ['pre-production', 'script'],
    });

    const visualDesign = createSubProject({
      name: 'visual-design',
      description: 'Visual language: art direction, color palettes, typography, mood boards, and style guides',
      archetype: 'visual-production',
      goals: filterGoalsByKeywords(baseGoals, ['visual', 'design', 'art', 'color', 'style', 'mood']),
      dependencies: [screenplay.id],
      estimated_complexity: 'standard',
      priority: 9,
      tags: ['pre-production', 'design'],
    });

    const storyboard = createSubProject({
      name: 'storyboard',
      description: 'Storyboarding: shot composition, camera angles, transitions, timing, and visual flow',
      archetype: 'visual-production',
      goals: filterGoalsByKeywords(baseGoals, ['storyboard', 'shot', 'camera', 'composition', 'flow']),
      dependencies: [screenplay.id, visualDesign.id],
      estimated_complexity: 'advanced',
      priority: 8,
      tags: ['pre-production', 'storyboard'],
    });

    const production = createSubProject({
      name: 'production',
      description: 'Asset creation: rendering, animation, compositing, sound design, and assembly',
      archetype: 'visual-production',
      goals: filterGoalsByKeywords(baseGoals, ['render', 'animate', 'composite', 'sound', 'asset', 'produce']),
      dependencies: [storyboard.id],
      estimated_complexity: 'advanced',
      priority: 7,
      tags: ['production', 'asset'],
    });

    const qualityReview = createSubProject({
      name: 'quality-review',
      description: 'Quality assurance: visual consistency, audio sync, color grading review, and final approval',
      archetype: 'visual-production',
      goals: filterGoalsByKeywords(baseGoals, ['review', 'quality', 'consistency', 'approval', 'final']),
      dependencies: [production.id],
      estimated_complexity: 'standard',
      priority: 6,
      tags: ['post-production', 'quality'],
    });

    return [screenplay, visualDesign, storyboard, production, qualityReview];
  },
};

/**
 * Document processing archetype strategy.
 *
 * Decomposes into a linear pipeline: analysis, processing,
 * formatting, and validation.
 */
const documentProcessingStrategy: DecompositionStrategy = {
  name: 'document-processing-default',
  archetype: 'document-processing',
  decompose(config: ProjectConfig): SubProject[] {
    const baseGoals = config.goals;

    const analysis = createSubProject({
      name: 'analysis',
      description: 'Document analysis: structure detection, content classification, metadata extraction, and schema inference',
      archetype: 'document-processing',
      goals: filterGoalsByKeywords(baseGoals, ['analyze', 'detect', 'classify', 'extract', 'schema']),
      dependencies: [],
      estimated_complexity: 'standard',
      priority: 10,
      tags: ['analysis', 'foundation'],
    });

    const processing = createSubProject({
      name: 'processing',
      description: 'Content processing: transformation, normalization, enrichment, and cross-referencing',
      archetype: 'document-processing',
      goals: filterGoalsByKeywords(baseGoals, ['process', 'transform', 'normalize', 'enrich', 'convert']),
      dependencies: [analysis.id],
      estimated_complexity: 'standard',
      priority: 8,
      tags: ['processing', 'transform'],
    });

    const formatting = createSubProject({
      name: 'formatting',
      description: 'Output formatting: template application, layout, styling, and multi-format export',
      archetype: 'document-processing',
      goals: filterGoalsByKeywords(baseGoals, ['format', 'template', 'layout', 'style', 'export']),
      dependencies: [processing.id],
      estimated_complexity: 'simple',
      priority: 6,
      tags: ['formatting', 'output'],
    });

    const validation = createSubProject({
      name: 'validation',
      description: 'Output validation: schema compliance, data integrity, cross-reference verification, and acceptance testing',
      archetype: 'document-processing',
      goals: filterGoalsByKeywords(baseGoals, ['validate', 'verify', 'test', 'compliance', 'integrity']),
      dependencies: [formatting.id],
      estimated_complexity: 'simple',
      priority: 5,
      tags: ['validation', 'quality'],
    });

    return [analysis, processing, formatting, validation];
  },
};

/**
 * Custom archetype strategy (fallback).
 *
 * Wraps the entire project as a single sub-project with no
 * internal decomposition. Used when no domain-specific strategy applies.
 */
const customStrategy: DecompositionStrategy = {
  name: 'custom-default',
  archetype: 'custom',
  decompose(config: ProjectConfig): SubProject[] {
    return [
      createSubProject({
        name: config.name,
        description: config.description,
        archetype: 'custom',
        goals: [...config.goals],
        dependencies: [],
        estimated_complexity: config.complexity ?? 'standard',
        priority: 10,
        tags: ['custom', 'monolithic'],
        metadata: {
          original_constraints: config.constraints ?? [],
        },
      }),
    ];
  },
};

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Filters project goals to only those containing at least one of
 * the given keywords (case-insensitive). If no goals match, returns
 * a generic fallback goal.
 */
function filterGoalsByKeywords(goals: string[], keywords: string[]): string[] {
  const matched = goals.filter((goal) => {
    const lower = goal.toLowerCase();
    return keywords.some((kw) => lower.includes(kw));
  });

  if (matched.length > 0) {
    return matched;
  }

  // Fallback: no specific match — return a context-derived placeholder
  return [`Complete tasks related to: ${keywords.join(', ')}`];
}

// ============================================================
// Decomposer
// ============================================================

export class Decomposer {
  /** Archetype -> strategy mapping */
  private strategies: Map<ProjectArchetype, DecompositionStrategy>;

  constructor() {
    this.strategies = new Map();

    // Register all default strategies
    this.registerStrategy(softwareDevStrategy);
    this.registerStrategy(creativeWritingStrategy);
    this.registerStrategy(visualProductionStrategy);
    this.registerStrategy(documentProcessingStrategy);
    this.registerStrategy(customStrategy);
  }

  // ----------------------------------------------------------
  // Core API
  // ----------------------------------------------------------

  /**
   * Decompose a project configuration into independently executable sub-projects.
   *
   * Steps:
   *   1. Select the decomposition strategy for the project's archetype
   *   2. Generate sub-projects via the strategy
   *   3. Build the dependency graph from sub-project declarations
   *   4. Validate the graph (cycles, missing refs)
   *   5. Compute topologically sorted execution batches
   *   6. Estimate maximum parallelism
   *
   * @param config - The project configuration to decompose.
   * @returns A complete DecompositionResult with sub-projects, graph, and batches.
   * @throws Error if dependency validation fails (cycles or missing references).
   */
  decompose(config: ProjectConfig): DecompositionResult {
    // 1. Select strategy
    const strategy = this.strategies.get(config.archetype);
    if (!strategy) {
      throw new Error(
        `No decomposition strategy registered for archetype: ${config.archetype}`,
      );
    }

    // 2. Generate sub-projects
    const subProjects = strategy.decompose(config);

    // 3. Build dependency graph
    const dependencyGraph = this.buildDependencyGraph(subProjects);

    // 4. Validate dependencies
    const validation = this.validateDependencies(subProjects);
    if (!validation.valid) {
      throw new Error(
        `Dependency validation failed:\n  - ${validation.errors.join('\n  - ')}`,
      );
    }

    // 5. Compute execution batches via topological sort
    const executionBatches = this.topologicalSort(subProjects, dependencyGraph);

    // 6. Estimate parallelism
    const estimatedParallelism = this.estimateParallelism(executionBatches);

    return {
      original_project: config.name,
      archetype: config.archetype,
      sub_projects: subProjects,
      dependency_graph: dependencyGraph,
      execution_batches: executionBatches,
      estimated_parallelism: estimatedParallelism,
      decomposition_strategy: strategy.name,
      created_at: Date.now(),
    };
  }

  // ----------------------------------------------------------
  // Strategy Management
  // ----------------------------------------------------------

  /**
   * Register a decomposition strategy for a specific archetype.
   * Replaces any previously registered strategy for that archetype.
   *
   * @param strategy - The strategy to register.
   */
  registerStrategy(strategy: DecompositionStrategy): void {
    this.strategies.set(strategy.archetype, strategy);
  }

  /**
   * Retrieve the registered strategy for an archetype.
   *
   * @param archetype - The project archetype to look up.
   * @returns The strategy, or undefined if none is registered.
   */
  getStrategy(archetype: ProjectArchetype): DecompositionStrategy | undefined {
    return this.strategies.get(archetype);
  }

  // ----------------------------------------------------------
  // Dependency Graph Construction
  // ----------------------------------------------------------

  /**
   * Build a list of dependency edges from the sub-projects' declared
   * dependencies. Each entry in a sub-project's `dependencies` array
   * produces a 'hard' edge from that sub-project to the depended-upon one.
   *
   * @param subProjects - The sub-projects to extract edges from.
   * @returns An array of DependencyEdge objects.
   */
  buildDependencyGraph(subProjects: SubProject[]): DependencyEdge[] {
    const edges: DependencyEdge[] = [];

    for (const sp of subProjects) {
      for (const depId of sp.dependencies) {
        edges.push({
          from: sp.id,
          to: depId,
          type: 'hard',
        });
      }
    }

    return edges;
  }

  // ----------------------------------------------------------
  // Topological Sort (Kahn's Algorithm)
  // ----------------------------------------------------------

  /**
   * Compute execution batches via topological sort using Kahn's algorithm.
   *
   * Each batch contains sub-project IDs that can execute in parallel
   * (all their dependencies are satisfied by previous batches). The
   * batches are returned in execution order.
   *
   * @param subProjects - The sub-projects to sort.
   * @param edges       - The dependency edges (from depends on to).
   * @returns An array of batches, each batch is an array of sub-project IDs.
   * @throws Error if a cycle is detected (should not happen if validateDependencies passed).
   */
  topologicalSort(subProjects: SubProject[], edges: DependencyEdge[]): string[][] {
    const ids = new Set(subProjects.map((sp) => sp.id));

    // Build adjacency list and in-degree count
    // "from" depends on "to", so the edge direction for topological sort
    // is: to -> from (to must come before from)
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>(); // to -> [from, from, ...]

    for (const id of ids) {
      inDegree.set(id, 0);
      dependents.set(id, []);
    }

    // Only consider hard dependencies for execution ordering
    const hardEdges = edges.filter((e) => e.type === 'hard');

    for (const edge of hardEdges) {
      // edge.from depends on edge.to
      // so edge.from's in-degree increases (it has a prerequisite)
      inDegree.set(edge.from, (inDegree.get(edge.from) ?? 0) + 1);
      // edge.to has edge.from as a dependent
      const deps = dependents.get(edge.to) ?? [];
      deps.push(edge.from);
      dependents.set(edge.to, deps);
    }

    // Kahn's algorithm: process in batches
    const batches: string[][] = [];
    let remaining = ids.size;

    // Seed: all nodes with in-degree 0
    let currentBatch = [...ids].filter((id) => (inDegree.get(id) ?? 0) === 0);

    while (currentBatch.length > 0) {
      // Sort batch by priority (highest first) for deterministic ordering
      const priorityMap = new Map(subProjects.map((sp) => [sp.id, sp.priority]));
      currentBatch.sort((a, b) => (priorityMap.get(b) ?? 0) - (priorityMap.get(a) ?? 0));

      batches.push([...currentBatch]);
      remaining -= currentBatch.length;

      // Compute next batch: reduce in-degrees for dependents
      const nextBatch: string[] = [];

      for (const id of currentBatch) {
        for (const dependent of (dependents.get(id) ?? [])) {
          const newDegree = (inDegree.get(dependent) ?? 1) - 1;
          inDegree.set(dependent, newDegree);
          if (newDegree === 0) {
            nextBatch.push(dependent);
          }
        }
      }

      currentBatch = nextBatch;
    }

    // If there are remaining nodes, there is a cycle
    if (remaining > 0) {
      const cycleNodes = [...ids].filter((id) => (inDegree.get(id) ?? 0) > 0);
      const cycleNames = subProjects
        .filter((sp) => cycleNodes.includes(sp.id))
        .map((sp) => sp.name);
      throw new Error(
        `Cycle detected in dependency graph involving: ${cycleNames.join(', ')}`,
      );
    }

    return batches;
  }

  // ----------------------------------------------------------
  // Dependency Validation
  // ----------------------------------------------------------

  /**
   * Validate the dependency declarations across all sub-projects.
   *
   * Checks:
   *   1. All referenced dependency IDs exist in the sub-project set
   *   2. No sub-project depends on itself
   *   3. No cycles exist in the dependency graph
   *
   * @param subProjects - The sub-projects to validate.
   * @returns A ValidationResult with validity flag and any error messages.
   */
  validateDependencies(subProjects: SubProject[]): ValidationResult {
    const errors: string[] = [];
    const idSet = new Set(subProjects.map((sp) => sp.id));
    const nameMap = new Map(subProjects.map((sp) => [sp.id, sp.name]));

    // Check 1: Missing references
    for (const sp of subProjects) {
      for (const depId of sp.dependencies) {
        if (!idSet.has(depId)) {
          errors.push(
            `Sub-project "${sp.name}" (${sp.id}) references unknown dependency: ${depId}`,
          );
        }
      }
    }

    // Check 2: Self-references
    for (const sp of subProjects) {
      if (sp.dependencies.includes(sp.id)) {
        errors.push(
          `Sub-project "${sp.name}" (${sp.id}) depends on itself`,
        );
      }
    }

    // Check 3: Cycle detection via DFS
    if (errors.length === 0) {
      const cycleError = this.detectCycles(subProjects);
      if (cycleError) {
        errors.push(cycleError);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ----------------------------------------------------------
  // Parallelism Estimation
  // ----------------------------------------------------------

  /**
   * Estimate the maximum degree of parallelism achievable during execution.
   * This is simply the size of the largest batch in the topological sort.
   *
   * @param batches - The execution batches from topological sort.
   * @returns The maximum number of sub-projects that can run simultaneously.
   */
  estimateParallelism(batches: string[][]): number {
    if (batches.length === 0) {
      return 0;
    }
    return Math.max(...batches.map((batch) => batch.length));
  }

  // ----------------------------------------------------------
  // Private Helpers
  // ----------------------------------------------------------

  /**
   * Detect cycles in the dependency graph using iterative DFS
   * with three-color marking (white/gray/black).
   *
   * @returns An error message describing the cycle, or null if acyclic.
   */
  private detectCycles(subProjects: SubProject[]): string | null {
    const nameMap = new Map(subProjects.map((sp) => [sp.id, sp.name]));

    // Build adjacency: id -> [dependency ids]
    const adjacency = new Map<string, string[]>();
    for (const sp of subProjects) {
      adjacency.set(sp.id, [...sp.dependencies]);
    }

    // Three-color marking: 0 = white (unvisited), 1 = gray (in-stack), 2 = black (done)
    const color = new Map<string, number>();
    for (const sp of subProjects) {
      color.set(sp.id, 0);
    }

    for (const sp of subProjects) {
      if (color.get(sp.id) !== 0) {
        continue;
      }

      // Iterative DFS using an explicit stack
      // Each stack entry: [nodeId, index into adjacency list]
      const stack: Array<[string, number]> = [[sp.id, 0]];
      color.set(sp.id, 1); // gray

      while (stack.length > 0) {
        const [nodeId, idx] = stack[stack.length - 1];
        const neighbors = adjacency.get(nodeId) ?? [];

        if (idx >= neighbors.length) {
          // All neighbors processed — mark black and pop
          color.set(nodeId, 2);
          stack.pop();
          continue;
        }

        // Advance the index for the current node
        stack[stack.length - 1] = [nodeId, idx + 1];

        const neighbor = neighbors[idx];
        const neighborColor = color.get(neighbor);

        if (neighborColor === 1) {
          // Back edge: cycle detected
          const cyclePath = stack
            .map(([id]) => nameMap.get(id) ?? id)
            .join(' -> ');
          return `Cycle detected: ${cyclePath} -> ${nameMap.get(neighbor) ?? neighbor}`;
        }

        if (neighborColor === 0) {
          // Unvisited: push and mark gray
          color.set(neighbor, 1);
          stack.push([neighbor, 0]);
        }
        // neighborColor === 2 means already fully processed, skip
      }
    }

    return null;
  }
}

// ============================================================
// Factory Function & Singleton
// ============================================================

/**
 * Create a new Decomposer instance with all default strategies registered.
 *
 * @returns A fresh Decomposer ready for use.
 */
export function createDecomposer(): Decomposer {
  return new Decomposer();
}

/**
 * Global decomposer singleton instance.
 * Can be replaced at engine startup with a configured instance.
 */
export const decomposer: Decomposer = createDecomposer();
