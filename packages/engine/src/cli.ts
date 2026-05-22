#!/usr/bin/env node

/**
 * Honeycomb v2 - CLI 入口点
 *
 * 一个仅使用内置 Node.js API 的最小但功能完整的 CLI。
 * 手动解析 process.argv，委托给 HoneycombOrchestrator。
 *
 * @since v2.0.0
 */

import crypto from 'node:crypto';
import { createOrchestrator } from './orchestrator.js';
import { createConfigLoader } from './config-loader.js';
import { CheckpointManager } from './checkpoint-manager.js';
import { RollbackHistory } from './rollback-history.js';
import { HealthChecker } from './observability.js';
import { MessageBus } from './message-bus.js';
import { AgentPool } from './agent-runner.js';
import { createDecomposer } from './decomposer.js';
import type {
  EngineConfig,
  ProjectArchetype,
  ComplexityLevel,
  ProjectState,
  RollbackOptions,
  DecompositionStrategy,
  DecompositionGranularity,
  TaskPriority,
} from './types.js';

// ============================================================
// CLI Constants
// ============================================================

const VERSION = '2.0.0-alpha.1';

const HELP_TEXT = `
Honeycomb v2 - Multi-Agent Collaboration Engine (${VERSION})

Usage: honeycomb <command> [options]

Commands:
  init <name>          Create a new project
  start <project-id>   Start/resume a project
  pause <project-id>   Pause project execution
  resume <project-id>  Resume paused project
  status [project-id]  Show project status
  list                 List all projects
  checkpoint <id>      Create a checkpoint
  rollback <id> <cp>   Rollback to a checkpoint
  decompose <id>       Decompose project into sub-projects
  decomp-tree <id>     Show decomposition tree
  adjust-decomp <id>   Adjust decomposition result
  health               Show system health status
  help                 Show this help message

Options:
  --config <path>      Engine config file path
  --archetype <type>   Project archetype (software-dev, creative-writing,
                       visual-production, document-processing, custom)
  --complexity <level> Override complexity level (simple, standard, advanced, enterprise)
  --description <text> Project description (used with init)
  --detailed           Show detailed status (used with status command)
  --json               Output in JSON format (used with health command)
  --version            Show version number

Decompose Options (used with decompose command):
  --strategy <type>    Decomposition strategy (functional, layered, dependency, domain, hybrid)
  --granularity <level> Granularity (fine, medium, coarse)
  --max-depth <n>      Maximum decomposition depth (default: 4)
  --output <path>      Save decomposition result to file

Rollback Options (used with rollback command):
  --preview            Show rollback preview without executing
  --scope <type>       Rollback scope: full, state, artifacts, decisions
  --backup             Create backup before rollback
  --force              Skip preview confirmation
  --preserve-artifacts <ids> Comma-separated artifact IDs to preserve
  --preserve-decisions <indices> Comma-separated decision indices to preserve
  --preserve-tokens    Preserve cumulative token usage

Examples:
  honeycomb init my-project --archetype software-dev
  honeycomb start abc-123-def
  honeycomb pause abc-123-def
  honeycomb resume abc-123-def
  honeycomb status
  honeycomb status abc-123-def --detailed
  honeycomb list
  honeycomb checkpoint abc-123-def
  honeycomb rollback abc-123-def checkpoint-456
  honeycomb rollback abc-123-def checkpoint-456 --preview
  honeycomb rollback abc-123-def checkpoint-456 --backup --force
  honeycomb rollback abc-123-def cp-123 --scope artifacts --preserve-artifacts art-1,art-2
  honeycomb decompose abc-123-def --strategy hybrid --granularity medium
  honeycomb decomp-tree abc-123-def
  honeycomb health
  honeycomb health --json
`.trim();

const VALID_ARCHETYPES: ProjectArchetype[] = [
  'software-dev',
  'creative-writing',
  'visual-production',
  'document-processing',
  'custom',
];

const VALID_COMPLEXITIES: ComplexityLevel[] = [
  'simple',
  'standard',
  'advanced',
  'enterprise',
];

const VALID_STRATEGIES: DecompositionStrategy[] = [
  'functional',
  'layered',
  'dependency',
  'domain',
  'hybrid',
];

const VALID_GRANULARITIES: DecompositionGranularity[] = [
  'fine',
  'medium',
  'coarse',
];

// ============================================================
// Argument Parsing
// ============================================================

interface ParsedArgs {
  command: string;
  positional: string[];
  options: Record<string, string>;
}

/**
 * Parse process.argv into a structured command + positional args + named options.
 *
 * Named options are expected in `--key value` pairs.
 * Flags without values (like --version) are stored with value 'true'.
 */
function parseArgs(argv: string[]): ParsedArgs {
  // Skip node/bun binary and script path
  const args = argv.slice(2);

  const positional: string[] = [];
  const options: Record<string, string> = {};
  let command = 'help';

  // First pass: extract all --flags and positional args
  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      // If next arg exists and is not another flag, treat it as the value
      if (nextArg && !nextArg.startsWith('--')) {
        options[key] = nextArg;
        i += 2;
      } else {
        // Boolean flag
        options[key] = 'true';
        i += 1;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }

  // The first positional argument is the command
  if (positional.length > 0) {
    command = positional.shift()!;
  }

  return { command, positional, options };
}

// ============================================================
// Output Helpers
// ============================================================

function printError(message: string): void {
  process.stderr.write(`Error: ${message}\n`);
}

function printInfo(message: string): void {
  process.stdout.write(`${message}\n`);
}

function printTable(rows: Array<Record<string, string>>, columns: string[]): void {
  if (rows.length === 0) {
    printInfo('(no results)');
    return;
  }

  // Calculate column widths
  const widths: Record<string, number> = {};
  for (const col of columns) {
    widths[col] = col.length;
    for (const row of rows) {
      widths[col] = Math.max(widths[col], (row[col] ?? '').length);
    }
  }

  // Print header
  const header = columns.map((col) => col.padEnd(widths[col])).join('  ');
  printInfo(header);
  printInfo(columns.map((col) => '-'.repeat(widths[col])).join('  '));

  // Print rows
  for (const row of rows) {
    const line = columns.map((col) => (row[col] ?? '').padEnd(widths[col])).join('  ');
    printInfo(line);
  }
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function calculateProgress(state: ProjectState): number {
  // Calculate progress based on phase
  const phaseWeights: Record<string, number> = {
    'init': 0,
    'research': 20,
    'decision': 40,
    'execution': 60,
    'feedback': 80,
    'delivery': 95,
    'completed': 100,
    'failed': 0,
    'paused': 0,
  };

  const baseProgress = phaseWeights[state.current_phase] ?? 0;

  // If in a running phase, add progress based on active agents
  if (state.active_agents.length > 0) {
    // Add up to 10% for active agents within the current phase
    const agentProgress = Math.min(10, (state.active_agents.length / 5) * 10);
    return Math.min(100, baseProgress + agentProgress);
  }

  return baseProgress;
}

function createProgressBar(percent: number, width: number = 20): string {
  const filled = Math.floor((percent / 100) * width);
  const empty = width - filled;
  return `[${'='.repeat(filled)}${' '.repeat(empty)}]`;
}

// ============================================================
// Decomposition Visualization Helpers
// ============================================================

/**
 * 可视化分解树为文本格式
 */
function visualizeDecompositionTree(
  subProjects: Array<{ id: string; name: string; description: string; dependencies: string[]; priority: number }>,
  executionBatches: string[][],
  maxDepth: number = 4,
): string {
  const lines: string[] = [];
  lines.push('分解结构:');
  lines.push('='.repeat(60));

  // 构建子项目映射
  const spMap = new Map(subProjects.map((sp) => [sp.id, sp]));

  // 构建依赖树
  const rootIds = subProjects.filter((sp) => sp.dependencies.length === 0).map((sp) => sp.id);

  if (rootIds.length === 0 && subProjects.length > 0) {
    // 如果没有根节点（循环依赖），取第一个
    rootIds.push(subProjects[0].id);
  }

  const visited = new Set<string>();

  function printNode(id: string, prefix: string, isLast: boolean, depth: number): void {
    if (depth > maxDepth || visited.has(id)) {
      return;
    }
    visited.add(id);

    const sp = spMap.get(id);
    if (!sp) {
      return;
    }

    const connector = isLast ? '└── ' : '├── ';
    const priorityIcon = sp.priority >= 8 ? '🔴' : sp.priority >= 5 ? '🟡' : '🟢';
    lines.push(`${prefix}${connector}${priorityIcon} ${sp.name} (优先级: ${sp.priority})`);
    lines.push(`${prefix}${isLast ? '    ' : '│   '}    ${sp.description.substring(0, 50)}${sp.description.length > 50 ? '...' : ''}`);

    // 找到依赖此节点的子项目
    const dependents = subProjects.filter((s) => s.dependencies.includes(id));
    if (dependents.length > 0) {
      for (let i = 0; i < dependents.length; i++) {
        const isLastChild = i === dependents.length - 1;
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        printNode(dependents[i].id, childPrefix, isLastChild, depth + 1);
      }
    }
  }

  // 打印根节点
  for (let i = 0; i < rootIds.length; i++) {
    const isLast = i === rootIds.length - 1;
    printNode(rootIds[i], '', isLast, 0);
  }

  // 打印执行批次
  lines.push('');
  lines.push('执行顺序 (可并行执行的批次):');
  lines.push('-'.repeat(60));
  for (let i = 0; i < executionBatches.length; i++) {
    const batch = executionBatches[i];
    const batchNames = batch
      .map((id) => spMap.get(id)?.name ?? id)
      .join(', ');
    lines.push(`批次 ${i + 1} (${batch.length} 个任务): ${batchNames}`);
  }

  return lines.join('\n');
}

/**
 * 格式化子项目列表为表格
 */
function formatSubProjectsTable(
  subProjects: Array<{
    id: string;
    name: string;
    description: string;
    dependencies: string[];
    priority: number;
    estimated_complexity: string;
  }>,
): string {
  const lines: string[] = [];
  lines.push('子项目列表:');
  lines.push('='.repeat(100));

  const rows = subProjects.map((sp) => ({
    ID: sp.id.slice(0, 8),
    NAME: sp.name.padEnd(25),
    PRIORITY: sp.priority.toString(),
    COMPLEXITY: sp.estimated_complexity,
    DEPS: sp.dependencies.length.toString(),
  }));

  // 计算列宽
  const idWidth = 10;
  const nameWidth = 25;
  const priorityWidth = 8;
  const complexityWidth = 10;
  const depsWidth = 6;

  // 表头
  const header = 'ID'.padEnd(idWidth) +
    '  ' + 'NAME'.padEnd(nameWidth) +
    '  ' + 'PRIORITY'.padEnd(priorityWidth) +
    '  ' + 'COMPLEXITY'.padEnd(complexityWidth) +
    '  ' + 'DEPS'.padEnd(depsWidth);
  lines.push(header);

  const separator = '-'.repeat(idWidth) +
    '  ' + '-'.repeat(nameWidth) +
    '  ' + '-'.repeat(priorityWidth) +
    '  ' + '-'.repeat(complexityWidth) +
    '  ' + '-'.repeat(depsWidth);
  lines.push(separator);

  // 数据行
  for (const row of rows) {
    const line = row.ID.padEnd(idWidth) +
      '  ' + row.NAME +
      '  ' + row.PRIORITY.padEnd(priorityWidth) +
      '  ' + row.COMPLEXITY.padEnd(complexityWidth) +
      '  ' + row.DEPS.padEnd(depsWidth);
    lines.push(line);
  }

  return lines.join('\n');
}

// ============================================================
// Input Validation Helpers
// ============================================================

/**
 * Validate project ID format (basic UUID validation)
 */
function isValidProjectId(projectId: string): boolean {
  if (!projectId || projectId.trim().length === 0) {
    return false;
  }
  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(projectId);
}

/**
 * Validate project name format
 */
function isValidProjectName(name: string): boolean {
  if (!name || name.trim().length === 0) {
    return false;
  }
  // Name should be 1-100 characters, alphanumeric plus dash and underscore
  const namePattern = /^[a-zA-Z0-9_-]{1,100}$/;
  return namePattern.test(name);
}

/**
 * Validate checkpoint ID format
 */
function isValidCheckpointId(checkpointId: string): boolean {
  if (!checkpointId || checkpointId.trim().length === 0) {
    return false;
  }
  // Checkpoint IDs start with 'cp-' followed by timestamp and random hex
  return checkpointId.startsWith('cp-') || isValidProjectId(checkpointId);
}

// ============================================================
// Command Handlers
// ============================================================

async function handleInit(
  parsed: ParsedArgs,
  config: EngineConfig,
): Promise<number> {
  const name = parsed.positional[0];
  if (!name) {
    printError('Missing project name. Usage: honeycomb init <name>');
    return 1;
  }

  if (!isValidProjectName(name)) {
    printError(`Invalid project name: "${name}". Use only alphanumeric characters, dashes, and underscores (1-100 chars).`);
    return 1;
  }

  const archetype = (parsed.options['archetype'] ?? 'software-dev') as ProjectArchetype;
  if (!VALID_ARCHETYPES.includes(archetype)) {
    printError(
      `Invalid archetype "${archetype}". Valid options: ${VALID_ARCHETYPES.join(', ')}`,
    );
    return 1;
  }

  const complexity = parsed.options['complexity'] as ComplexityLevel | undefined;
  if (complexity && !VALID_COMPLEXITIES.includes(complexity)) {
    printError(
      `Invalid complexity "${complexity}". Valid options: ${VALID_COMPLEXITIES.join(', ')}`,
    );
    return 1;
  }

  const description = parsed.options['description'] ?? `Project: ${name}`;

  const orchestrator = createOrchestrator(config);

  try {
    const state = orchestrator.createProject({
      name,
      description,
      archetype,
      complexity,
      goals: [`Initialize ${name} project`],
    });

    printInfo(`Project created successfully.`);
    printInfo(`  ID:         ${state.project_id}`);
    printInfo(`  Name:       ${state.project_name}`);
    printInfo(`  Archetype:  ${state.archetype}`);
    printInfo(`  Complexity: ${state.complexity}`);
    printInfo(`  Phase:      ${state.current_phase}`);

    return 0;
  } catch (err) {
    printError(`Failed to create project: ${(err as Error).message}`);
    return 1;
  } finally {
    orchestrator.shutdown();
  }
}

async function handleStart(
  parsed: ParsedArgs,
  config: EngineConfig,
): Promise<number> {
  const projectId = parsed.positional[0];
  if (!projectId) {
    printError('Missing project ID. Usage: honeycomb start <project-id>');
    return 1;
  }

  if (!isValidProjectId(projectId)) {
    printError(`Invalid project ID format: "${projectId}". Expected UUID format.`);
    return 1;
  }

  const orchestrator = createOrchestrator(config);

  try {
    await orchestrator.startProject(projectId);
    const state = orchestrator.getProjectState();

    printInfo(`Project started.`);
    printInfo(`  ID:    ${state?.project_id ?? projectId}`);
    printInfo(`  Name:  ${state?.project_name ?? 'unknown'}`);
    printInfo(`  Phase: ${state?.current_phase ?? 'unknown'}`);

    return 0;
  } catch (err) {
    printError(`Failed to start project: ${(err as Error).message}`);
    return 1;
  } finally {
    orchestrator.shutdown();
  }
}

async function handleStatus(
  parsed: ParsedArgs,
  config: EngineConfig,
): Promise<number> {
  const cpManager = new CheckpointManager(config.db_path);

  try {
    const projectId = parsed.positional[0];
    const detailed = parsed.options['detailed'] === 'true';

    if (projectId) {
      // Show detailed status for a specific project
      const state = cpManager.loadProjectState(projectId);
      if (!state) {
        printError(`Project not found: ${projectId}`);
        return 1;
      }

      printInfo(`Project Status: ${state.project_name}`);
      printInfo(`${'='.repeat(50)}`);
      printInfo(`  ID:            ${state.project_id}`);
      printInfo(`  Archetype:     ${state.archetype}`);
      printInfo(`  Complexity:    ${state.complexity}`);
      printInfo(`  Phase:         ${state.current_phase}`);
      printInfo(`  Decision Path: ${state.decision_path}`);
      printInfo(`  Risk Level:    ${state.risk_level}`);

      // Show progress indicator for running projects
      if (state.current_phase !== 'completed' && state.current_phase !== 'failed') {
        const progress = calculateProgress(state);
        const progressBar = createProgressBar(progress);
        printInfo(`  Progress:      ${progressBar} ${progress.toFixed(0)}%`);
      }

      printInfo(`  Active Agents: ${state.active_agents.length}`);

      if (state.active_agents.length > 0) {
        printInfo(`    Currently: ${state.active_agents.join(', ')}`);
      }

      printInfo(`  Artifacts:     ${state.artifacts.length}`);
      printInfo(`  Decisions:     ${state.decisions.length}`);

      // Token usage with percentage
      const tokenUsagePercent = (state.total_token_usage / state.token_budget * 100).toFixed(1);
      printInfo(`  Token Usage:   ${state.total_token_usage} / ${state.token_budget} (${tokenUsagePercent}%)`);

      printInfo(`  Created:       ${formatTimestamp(state.created_at)}`);
      printInfo(`  Updated:       ${formatTimestamp(state.updated_at)}`);

      if (state.started_at) {
        printInfo(`  Started:       ${formatTimestamp(state.started_at)}`);
      }

      if (state.completed_at) {
        printInfo(`  Completed:     ${formatTimestamp(state.completed_at)}`);
        const duration = state.completed_at - (state.started_at ?? state.created_at);
        printInfo(`  Duration:      ${formatDuration(duration)}`);
      }

      // Show detailed information if requested
      if (detailed) {
        // Phase History
        if (state.phase_history.length > 0) {
          printInfo(`\nPhase History (${state.phase_history.length} transitions):`);
          const recentHistory = state.phase_history.slice(-10);
          for (const record of recentHistory) {
            printInfo(
              `  ${record.from.padEnd(12)} -> ${record.to.padEnd(12)} ${formatTimestamp(record.timestamp)} - ${record.reason}`,
            );
          }
          if (state.phase_history.length > 10) {
            printInfo(`  ... and ${state.phase_history.length - 10} more`);
          }
        }

        // Agent States
        const agentStates = Object.values(state.agent_states);
        if (agentStates.length > 0) {
          printInfo(`\nAgent States (${agentStates.length} agents):`);
          for (const agent of agentStates) {
            const status = agent.status.toUpperCase();
            const tokens = agent.token_usage;
            const duration = agent.completed_at && agent.started_at
              ? formatDuration(agent.completed_at - agent.started_at)
              : 'N/A';
            printInfo(
              `  ${agent.agent_name.padEnd(20)} ${status.padEnd(10)} tokens=${tokens.toString().padStart(6)} duration=${duration}`,
            );
            if (agent.last_error) {
              printInfo(`    Error: ${agent.last_error}`);
            }
          }
        }

        // Decisions
        if (state.decisions.length > 0) {
          printInfo(`\nDecisions (${state.decisions.length} total, showing last 5):`);
          const recentDecisions = state.decisions.slice(-5);
          for (const decision of recentDecisions) {
            printInfo(
              `  ${decision.type.padEnd(15)} phase=${decision.phase.padEnd(10)} risk=${decision.risk_level.padEnd(10)} confidence=${(decision.confidence * 100).toFixed(0)}%`,
            );
            printInfo(`    By: ${decision.made_by}`);
            printInfo(`    Reason: ${decision.reasoning.substring(0, 80)}${decision.reasoning.length > 80 ? '...' : ''}`);
          }
        }

        // Artifacts
        if (state.artifacts.length > 0) {
          printInfo(`\nArtifacts (${state.artifacts.length} total, showing last 5):`);
          const recentArtifacts = state.artifacts.slice(-5);
          for (const artifact of recentArtifacts) {
            printInfo(
              `  ${artifact.name.padEnd(25)} type=${artifact.type.padEnd(10)} phase=${artifact.phase} agent=${artifact.agent}`,
            );
            printInfo(`    Path: ${artifact.path}`);
          }
        }
      }

      // Show checkpoints
      const checkpoints = cpManager.listCheckpoints(projectId);
      if (checkpoints.length > 0) {
        printInfo(`\nCheckpoints (${checkpoints.length} total${detailed ? '' : ', showing last 5'}):`);
        const displayCheckpoints = detailed ? checkpoints : checkpoints.slice(-5);
        for (const cp of displayCheckpoints) {
          printInfo(
            `  ${cp.id.slice(0, 16).padEnd(16)}  phase=${cp.phase.padEnd(10)} ${formatTimestamp(cp.timestamp)}  ${cp.description}`,
          );
        }
        if (!detailed && checkpoints.length > 5) {
          printInfo(`  ... and ${checkpoints.length - 5} more (use --detailed to see all)`);
        }
      }

      if (!detailed) {
        printInfo(`\nUse --detailed flag for more information about agent states, phase history, decisions, and artifacts.`);
      }
    } else {
      // Show summary of all projects
      const projects = cpManager.listProjects();
      if (projects.length === 0) {
        printInfo('No projects found. Use "honeycomb init <name>" to create one.');
        return 0;
      }

      const rows = projects.map((p) => ({
        ID: p.project_id.slice(0, 8) + '...',
        NAME: p.project_name,
        UPDATED: formatTimestamp(p.updated_at),
      }));

      printTable(rows, ['ID', 'NAME', 'UPDATED']);
    }

    return 0;
  } catch (err) {
    printError(`Failed to get status: ${(err as Error).message}`);
    return 1;
  } finally {
    cpManager.close();
  }
}

async function handleList(
  _parsed: ParsedArgs,
  config: EngineConfig,
): Promise<number> {
  const cpManager = new CheckpointManager(config.db_path);

  try {
    const projects = cpManager.listProjects();

    if (projects.length === 0) {
      printInfo('No projects found. Use "honeycomb init <name>" to create one.');
      return 0;
    }

    printInfo(`Found ${projects.length} project(s):\n`);

    const rows = projects.map((p) => ({
      ID: p.project_id,
      NAME: p.project_name,
      UPDATED: formatTimestamp(p.updated_at),
    }));

    printTable(rows, ['ID', 'NAME', 'UPDATED']);

    return 0;
  } catch (err) {
    printError(`Failed to list projects: ${(err as Error).message}`);
    return 1;
  } finally {
    cpManager.close();
  }
}

async function handleCheckpoint(
  parsed: ParsedArgs,
  config: EngineConfig,
): Promise<number> {
  const projectId = parsed.positional[0];
  if (!projectId) {
    printError('Missing project ID. Usage: honeycomb checkpoint <project-id>');
    return 1;
  }

  if (!isValidProjectId(projectId)) {
    printError(`Invalid project ID format: "${projectId}". Expected UUID format.`);
    return 1;
  }

  const description = parsed.options['description'];
  const cpManager = new CheckpointManager(config.db_path);

  try {
    const state = cpManager.loadProjectState(projectId);
    if (!state) {
      printError(`Project not found: ${projectId}`);
      return 1;
    }

    const checkpoint = cpManager.createCheckpoint(
      state,
      description ?? `Manual checkpoint at phase ${state.current_phase}`,
    );

    printInfo(`Checkpoint created.`);
    printInfo(`  Checkpoint ID: ${checkpoint.id}`);
    printInfo(`  Project ID:    ${projectId}`);
    printInfo(`  Phase:         ${state.current_phase}`);

    return 0;
  } catch (err) {
    printError(`Failed to create checkpoint: ${(err as Error).message}`);
    return 1;
  } finally {
    cpManager.close();
  }
}

async function handleRollback(
  parsed: ParsedArgs,
  config: EngineConfig,
): Promise<number> {
  const projectId = parsed.positional[0];
  const checkpointId = parsed.positional[1];

  if (!projectId || !checkpointId) {
    printError('Missing arguments. Usage: honeycomb rollback <project-id> <checkpoint-id>');
    return 1;
  }

  if (!isValidProjectId(projectId)) {
    printError(`Invalid project ID format: "${projectId}". Expected UUID format.`);
    return 1;
  }

  if (!isValidCheckpointId(checkpointId)) {
    printError(`Invalid checkpoint ID format: "${checkpointId}".`);
    return 1;
  }

  const cpManager = new CheckpointManager(config.db_path);
  const rollbackHistory = new RollbackHistory(config.db_path);

  // 解析回滚选项
  const preserveOption: NonNullable<RollbackOptions['preserve']> = {};

  // 解析 preserve 选项
  if (parsed.options['preserve-artifacts']) {
    preserveOption.artifacts = parsed.options['preserve-artifacts'].split(',');
  }
  if (parsed.options['preserve-decisions']) {
    preserveOption.decisions = parsed.options['preserve-decisions']
      .split(',')
      .map((s) => parseInt(s, 10));
  }
  if (parsed.options['preserve-tokens'] === 'true') {
    preserveOption.tokenUsage = true;
  }

  const options: RollbackOptions = {
    scope: (parsed.options['scope'] as 'full' | 'state' | 'artifacts' | 'decisions') ?? 'full',
    createBackup: parsed.options['backup'] === 'true',
    force: parsed.options['force'] === 'true',
    preserve: preserveOption,
  };

  const previewOnly = parsed.options['preview'] === 'true';

  try {
    // 验证项目存在
    const currentState = cpManager.loadProjectState(projectId);
    if (!currentState) {
      printError(`Project not found: ${projectId}`);
      return 1;
    }

    // 预览模式：只显示差异，不执行回滚
    if (previewOnly) {
      const preview = cpManager.previewRollback(projectId, checkpointId);

      printInfo(`回滚预览 (项目: ${currentState.project_name})`);
      printInfo(`${'='.repeat(50)}`);
      printInfo(`  目标检查点: ${preview.targetCheckpoint.id.slice(0, 16)}...`);
      printInfo(`  目标阶段:   ${preview.targetCheckpoint.phase}`);
      printInfo(`  检查点时间: ${formatTimestamp(preview.targetCheckpoint.timestamp)}`);
      printInfo('');

      // 显示变更
      printInfo(`变更详情:`);
      printInfo(`  阶段变化:   ${preview.changes.phaseWillChange.from} → ${preview.changes.phaseWillChange.to}`);
      printInfo(`  决策丢失:   ${preview.changes.decisionsWillBeLost} 个`);
      printInfo(
        `  Token 差异: ${preview.changes.tokenUsageDifference > 0 ? '+' : ''}${
          preview.changes.tokenUsageDifference
        }`,
      );

      if (preview.changes.willBeRemoved.length > 0) {
        printInfo(`  将移除:     ${preview.changes.willBeRemoved.length} 个 artifacts`);
        for (const art of preview.changes.willBeRemoved.slice(0, 3)) {
          printInfo(`    - ${art.name}`);
        }
        if (preview.changes.willBeRemoved.length > 3) {
          printInfo(`    ... 还有 ${preview.changes.willBeRemoved.length - 3} 个`);
        }
      }

      if (preview.changes.willBeAdded.length > 0) {
        printInfo(`  将添加:     ${preview.changes.willBeAdded.length} 个 artifacts`);
        for (const art of preview.changes.willBeAdded.slice(0, 3)) {
          printInfo(`    + ${art.name}`);
        }
        if (preview.changes.willBeAdded.length > 3) {
          printInfo(`    ... 还有 ${preview.changes.willBeAdded.length - 3} 个`);
        }
      }

      // 显示风险
      if (preview.risks.length > 0) {
        printInfo('');
        printInfo(`风险提示:`);
        for (const risk of preview.risks) {
          printInfo(`  ⚠️  ${risk}`);
        }
      }

      printInfo('');
      printInfo(`使用 --force 选项执行回滚（跳过预览确认）`);
      return 0;
    }

    // 执行回滚
    const restoredState = await cpManager.rollbackWithPreview(
      projectId,
      checkpointId,
      options,
    );

    // 记录回滚历史
    const preview = cpManager.previewRollback(projectId, checkpointId);
    rollbackHistory.record({
      rollbackId: crypto.randomUUID(),
      timestamp: Date.now(),
      fromCheckpoint: currentState.project_id, // 简化记录，实际应使用备份检查点 ID
      toCheckpoint: checkpointId,
      projectId,
      options,
      preview,
      success: true,
    });

    // 显示回滚结果
    printInfo(`回滚成功.`);
    printInfo(`  项目:       ${restoredState.project_name}`);
    printInfo(`  阶段:       ${restoredState.current_phase}`);
    printInfo(`  检查点:     ${checkpointId.slice(0, 16)}...`);

    if (options.createBackup) {
      printInfo(`  已创建备份: 是`);
    }

    if (preview.changes.decisionsWillBeLost > 0) {
      printInfo(`  丢失决策:   ${preview.changes.decisionsWillBeLost} 个`);
    }

    return 0;
  } catch (err) {
    printError(`Failed to rollback: ${(err as Error).message}`);

    // 记录失败的回滚
    try {
      const preview = cpManager.previewRollback(projectId, checkpointId);
      rollbackHistory.record({
        rollbackId: crypto.randomUUID(),
        timestamp: Date.now(),
        fromCheckpoint: projectId,
        toCheckpoint: checkpointId,
        projectId,
        options,
        preview,
        success: false,
        error: (err as Error).message,
      });
    } catch {
      // 忽略记录错误
    }

    return 1;
  } finally {
    cpManager.close();
  }
}

async function handlePause(
  parsed: ParsedArgs,
  config: EngineConfig,
): Promise<number> {
  const projectId = parsed.positional[0];
  if (!projectId) {
    printError('Missing project ID. Usage: honeycomb pause <project-id>');
    return 1;
  }

  if (!isValidProjectId(projectId)) {
    printError(`Invalid project ID format: "${projectId}". Expected UUID format.`);
    return 1;
  }

  const reason = parsed.options['reason'] ?? 'Paused by user';
  const orchestrator = createOrchestrator(config);

  try {
    // Load the project state
    const state = orchestrator.loadProjectState(projectId);
    if (!state) {
      printError(`Project not found: ${projectId}`);
      return 1;
    }

    // Check if project is already in a terminal or paused state
    if (state.current_phase === 'paused') {
      printError('Project is already paused.');
      return 1;
    }

    if (state.current_phase === 'completed' || state.current_phase === 'failed') {
      printError(`Cannot pause project in ${state.current_phase} state.`);
      return 1;
    }

    // Load the project into the orchestrator and pause it
    await orchestrator.startProject(projectId);
    orchestrator.pauseProject(reason);

    printInfo(`Project paused successfully.`);
    printInfo(`  Project: ${state.project_name}`);
    printInfo(`  ID:      ${projectId}`);
    printInfo(`  Reason:  ${reason}`);

    return 0;
  } catch (err) {
    printError(`Failed to pause project: ${(err as Error).message}`);
    return 1;
  } finally {
    orchestrator.shutdown();
  }
}

async function handleResume(
  parsed: ParsedArgs,
  config: EngineConfig,
): Promise<number> {
  const projectId = parsed.positional[0];
  if (!projectId) {
    printError('Missing project ID. Usage: honeycomb resume <project-id>');
    return 1;
  }

  if (!isValidProjectId(projectId)) {
    printError(`Invalid project ID format: "${projectId}". Expected UUID format.`);
    return 1;
  }

  const orchestrator = createOrchestrator(config);

  try {
    // Load the project state
    const state = orchestrator.loadProjectState(projectId);
    if (!state) {
      printError(`Project not found: ${projectId}`);
      return 1;
    }

    // Check if project is paused
    if (state.current_phase !== 'paused') {
      printError(`Project is not paused (current phase: ${state.current_phase}).`);
      return 1;
    }

    // Load the project into the orchestrator and resume it
    await orchestrator.startProject(projectId);
    orchestrator.resumeProject();

    const resumedState = orchestrator.getProjectState();

    printInfo(`Project resumed successfully.`);
    printInfo(`  Project: ${state.project_name}`);
    printInfo(`  ID:      ${projectId}`);
    printInfo(`  Phase:   ${resumedState?.current_phase ?? 'unknown'}`);

    return 0;
  } catch (err) {
    printError(`Failed to resume project: ${(err as Error).message}`);
    return 1;
  } finally {
    orchestrator.shutdown();
  }
}

async function handleHealth(
  parsed: ParsedArgs,
  config: EngineConfig,
): Promise<number> {
  const healthChecker = new HealthChecker();
  const messageBus = new MessageBus();
  const agentPool = new AgentPool(config.agents_root);

  try {
    // 注册所有健康检查
    HealthChecker.registerSystemChecks(healthChecker);
    HealthChecker.registerDatabaseCheck(healthChecker, config.db_path);

    // MessageBus 健康检查 - 使用适配器
    healthChecker.registerCheck('messagebus:status', () => {
      const stats = messageBus.getStats();
      const totalMessages = stats.total;
      const subscriptions = messageBus['agentSubscribers'].size + messageBus['typeSubscribers'].size;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (subscriptions === 0) {
        status = 'degraded';
      }

      return {
        name: 'messagebus:status',
        status,
        message: `MessageBus OK (${totalMessages} messages, ${subscriptions} subscriptions)`,
        last_check: Date.now(),
        details: {
          total_messages: totalMessages,
          total_subscriptions: subscriptions,
        },
      };
    });

    // AgentPool 健康检查 - 使用适配器
    healthChecker.registerCheck('agentpool:status', () => {
      const agents = agentPool.listAll();
      const totalAgents = agents.length;
      const loadedAgents = agents.length;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (totalAgents === 0) {
        status = 'unhealthy';
      } else if (loadedAgents < totalAgents * 0.5) {
        status = 'degraded';
      }

      return {
        name: 'agentpool:status',
        status,
        message: `AgentPool OK (${loadedAgents}/${totalAgents} loaded)`,
        last_check: Date.now(),
        details: {
          total_agents: totalAgents,
          loaded_agents: loadedAgents,
          load_percent: totalAgents > 0 ? ((loadedAgents / totalAgents) * 100).toFixed(1) : 'N/A',
        },
      };
    });

    // 运行检查
    const health = healthChecker.runChecks();

    // 输出格式
    if (parsed.options['json'] === 'true') {
      printInfo(HealthChecker.exportJSON(health));
    } else {
      printInfo(HealthChecker.formatHealthReport(health));

      // 显示建议
      const recommendations = HealthChecker.getRecommendations(health);
      if (recommendations.length > 0) {
        printInfo('');
        printInfo('Recommendations:');
        for (const rec of recommendations) {
          printInfo(`  - ${rec}`);
        }
      }
    }

    // 返回码基于健康状态
    return health.overall === 'healthy' ? 0 : health.overall === 'degraded' ? 1 : 2;
  } catch (err) {
    printError(`Failed to check health: ${(err as Error).message}`);
    return 2;
  } finally {
    messageBus.clear();
  }
}

// ============================================================
// Decompose Command Handlers
// ============================================================

/**
 * 处理项目分解命令
 * 用法: honeycomb decompose <project-id> [--strategy <type>] [--granularity <level>]
 */
async function handleDecompose(
  parsed: ParsedArgs,
  config: EngineConfig,
): Promise<number> {
  const projectId = parsed.positional[0];
  if (!projectId) {
    printError('Missing project ID. Usage: honeycomb decompose <project-id>');
    return 1;
  }

  if (!isValidProjectId(projectId)) {
    printError(`Invalid project ID format: "${projectId}". Expected UUID format.`);
    return 1;
  }

  // 解析策略选项
  const strategyOption = parsed.options['strategy'];
  if (strategyOption && !VALID_STRATEGIES.includes(strategyOption as DecompositionStrategy)) {
    printError(
      `Invalid strategy "${strategyOption}". Valid options: ${VALID_STRATEGIES.join(', ')}`,
    );
    return 1;
  }

  // 解析粒度选项
  const granularityOption = parsed.options['granularity'];
  if (granularityOption && !VALID_GRANULARITIES.includes(granularityOption as DecompositionGranularity)) {
    printError(
      `Invalid granularity "${granularityOption}". Valid options: ${VALID_GRANULARITIES.join(', ')}`,
    );
    return 1;
  }

  // 解析最大深度
  const maxDepthOption = parsed.options['max-depth'];
  const maxDepth = maxDepthOption ? parseInt(maxDepthOption, 10) : 4;
  if (isNaN(maxDepth) || maxDepth < 1 || maxDepth > 10) {
    printError('Invalid max-depth. Must be between 1 and 10.');
    return 1;
  }

  const cpManager = new CheckpointManager(config.db_path);
  const decomposer = createDecomposer();

  try {
    // 加载项目状态
    const state = cpManager.loadProjectState(projectId);
    if (!state) {
      printError(`Project not found: ${projectId}`);
      return 1;
    }

    // 创建项目配置用于分解
    const projectConfig = {
      name: state.project_name,
      description: state.project_description,
      archetype: state.archetype,
      complexity: state.complexity,
      goals: state.artifacts
        .filter((a) => a.type === 'document')
        .map((a) => a.description)
        .slice(0, 5),
    };

    // 执行分解
    const result = decomposer.decompose(projectConfig);

    // 输出分解结果
    printInfo(`项目分解成功: ${state.project_name}`);
    printInfo(`${'='.repeat(60)}`);
    printInfo(`  项目 ID:      ${projectId}`);
    printInfo(`  原型:         ${state.archetype}`);
    printInfo(`  复杂度:       ${state.complexity}`);
    printInfo(`  分解策略:     ${result.decomposition_strategy}`);
    printInfo(`  子项目数量:   ${result.sub_projects.length}`);
    printInfo(`  最大并行度:   ${result.estimated_parallelism}`);
    printInfo(`  执行批次数:   ${result.execution_batches.length}`);
    printInfo(`  创建时间:     ${formatTimestamp(result.created_at)}`);
    printInfo('');

    // 显示分解树
    printInfo(visualizeDecompositionTree(
      result.sub_projects.map((sp) => ({
        id: sp.id,
        name: sp.name,
        description: sp.description,
        dependencies: sp.dependencies,
        priority: sp.priority,
        estimated_complexity: sp.estimated_complexity,
      })),
      result.execution_batches,
      maxDepth,
    ));

    printInfo('');
    printInfo(formatSubProjectsTable(
      result.sub_projects.map((sp) => ({
        id: sp.id,
        name: sp.name,
        description: sp.description,
        dependencies: sp.dependencies,
        priority: sp.priority,
        estimated_complexity: sp.estimated_complexity,
      })),
    ));

    // 可选：保存到文件
    const outputPath = parsed.options['output'];
    if (outputPath) {
      const fs = await import('node:fs');
      const decompositionData = {
        decomposition_id: crypto.randomUUID(),
        root_project_id: projectId,
        root_project_name: state.project_name,
        archetype: state.archetype,
        sub_projects: result.sub_projects,
        execution_batches: result.execution_batches,
        estimated_parallelism: result.estimated_parallelism,
        decomposition_strategy: result.decomposition_strategy,
        created_at: result.created_at,
      };
      fs.writeFileSync(outputPath, JSON.stringify(decompositionData, null, 2));
      printInfo('');
      printInfo(`分解结果已保存到: ${outputPath}`);
    }

    return 0;
  } catch (err) {
    printError(`Failed to decompose project: ${(err as Error).message}`);
    return 1;
  } finally {
    cpManager.close();
  }
}

/**
 * 处理显示分解树命令
 * 用法: honeycomb decomp-tree <project-id> [--format <text|json>]
 */
async function handleDecompositionTree(
  parsed: ParsedArgs,
  config: EngineConfig,
): Promise<number> {
  const projectId = parsed.positional[0];
  if (!projectId) {
    printError('Missing project ID. Usage: honeycomb decomp-tree <project-id>');
    return 1;
  }

  if (!isValidProjectId(projectId)) {
    printError(`Invalid project ID format: "${projectId}". Expected UUID format.`);
    return 1;
  }

  const outputFormat = parsed.options['format'] ?? 'text';
  if (outputFormat !== 'text' && outputFormat !== 'json') {
    printError('Invalid format. Must be "text" or "json".');
    return 1;
  }

  const cpManager = new CheckpointManager(config.db_path);
  const decomposer = createDecomposer();

  try {
    // 加载项目状态
    const state = cpManager.loadProjectState(projectId);
    if (!state) {
      printError(`Project not found: ${projectId}`);
      return 1;
    }

    // 创建项目配置用于分解
    const projectConfig = {
      name: state.project_name,
      description: state.project_description,
      archetype: state.archetype,
      complexity: state.complexity,
      goals: ['Display decomposition tree'],
    };

    // 执行分解
    const result = decomposer.decompose(projectConfig);

    if (outputFormat === 'json') {
      // JSON 格式输出
      const treeData = {
        project_id: projectId,
        project_name: state.project_name,
        archetype: state.archetype,
        sub_projects: result.sub_projects,
        execution_batches: result.execution_batches,
        dependency_graph: result.dependency_graph,
        estimated_parallelism: result.estimated_parallelism,
      };
      printInfo(JSON.stringify(treeData, null, 2));
    } else {
      // 文本格式输出
      printInfo(`分解树: ${state.project_name}`);
      printInfo(`${'='.repeat(60)}`);
      printInfo('');
      printInfo(visualizeDecompositionTree(
        result.sub_projects.map((sp) => ({
          id: sp.id,
          name: sp.name,
          description: sp.description,
          dependencies: sp.dependencies,
          priority: sp.priority,
          estimated_complexity: sp.estimated_complexity,
        })),
        result.execution_batches,
      ));
    }

    return 0;
  } catch (err) {
    printError(`Failed to display decomposition tree: ${(err as Error).message}`);
    return 1;
  } finally {
    cpManager.close();
  }
}

/**
 * 处理调整分解结果命令
 * 用法: honeycomb adjust-decomp <project-id> [--merge <ids>] [--split <ids>]
 */
async function handleAdjustDecomposition(
  parsed: ParsedArgs,
  config: EngineConfig,
): Promise<number> {
  const projectId = parsed.positional[0];
  if (!projectId) {
    printError('Missing project ID. Usage: honeycomb adjust-decomp <project-id>');
    return 1;
  }

  if (!isValidProjectId(projectId)) {
    printError(`Invalid project ID format: "${projectId}". Expected UUID format.`);
    return 1;
  }

  // 解析调整选项
  const mergeIds = parsed.options['merge']?.split(',') ?? [];
  const splitIds = parsed.options['split']?.split(',') ?? [];

  const cpManager = new CheckpointManager(config.db_path);
  const decomposer = createDecomposer();

  try {
    // 加载项目状态
    const state = cpManager.loadProjectState(projectId);
    if (!state) {
      printError(`Project not found: ${projectId}`);
      return 1;
    }

    // 创建项目配置
    const projectConfig = {
      name: state.project_name,
      description: state.project_description,
      archetype: state.archetype,
      complexity: state.complexity,
      goals: ['Adjust decomposition'],
    };

    // 执行分解
    const result = decomposer.decompose(projectConfig);

    // 应用调整
    let adjustedSubProjects = [...result.sub_projects];

    // 合并子项目
    if (mergeIds.length > 1) {
      const projectsToMerge = adjustedSubProjects.filter((sp) =>
        mergeIds.includes(sp.id)
      );

      if (projectsToMerge.length > 0) {
        const mergedProject = {
          ...projectsToMerge[0],
          id: crypto.randomUUID(),
          name: `merged-${projectsToMerge.map((p) => p.name).join('-')}`,
          description: `Merged project: ${projectsToMerge.map((p) => p.name).join(', ')}`,
          dependencies: [
            ...new Set(
              projectsToMerge.flatMap((p) => p.dependencies).filter((d) => !mergeIds.includes(d))
            ),
          ],
          priority: Math.max(...projectsToMerge.map((p) => p.priority)),
        };

        // 移除被合并的项目，添加合并后的项目
        adjustedSubProjects = adjustedSubProjects.filter(
          (sp) => !mergeIds.includes(sp.id)
        );
        adjustedSubProjects.push(mergedProject);

        printInfo(`已合并子项目: ${projectsToMerge.map((p) => p.name).join(', ')}`);
      }
    }

    // 拆分子项目（简化处理：标记为待拆分）
    if (splitIds.length > 0) {
      for (const splitId of splitIds) {
        const toSplit = adjustedSubProjects.find((sp) => sp.id === splitId);
        if (toSplit) {
          printInfo(`  标记待拆分: ${toSplit.name} (需要手动配置拆分逻辑)`);
        }
      }
    }

    // 重新计算执行批次
    const spMap = new Map(adjustedSubProjects.map((sp) => [sp.id, sp]));
    const edges: Array<{ from: string; to: string; type: 'hard' | 'soft' }> = [];

    for (const sp of adjustedSubProjects) {
      for (const depId of sp.dependencies) {
        if (spMap.has(depId)) {
          edges.push({ from: sp.id, to: depId, type: 'hard' });
        }
      }
    }

    // 简单的拓扑排序（使用 decomposer 的方法需要完整的 SubProject 类型）
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const sp of adjustedSubProjects) {
      inDegree.set(sp.id, 0);
      dependents.set(sp.id, []);
    }

    for (const edge of edges) {
      inDegree.set(edge.from, (inDegree.get(edge.from) ?? 0) + 1);
      const deps = dependents.get(edge.to) ?? [];
      deps.push(edge.from);
      dependents.set(edge.to, deps);
    }

    const batches: string[][] = [];
    let currentBatch = adjustedSubProjects
      .filter((sp) => (inDegree.get(sp.id) ?? 0) === 0)
      .map((sp) => sp.id);

    while (currentBatch.length > 0) {
      batches.push([...currentBatch]);

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

    // 显示调整后的结果
    printInfo(`调整后的分解结果: ${state.project_name}`);
    printInfo(`${'='.repeat(60)}`);
    printInfo(`  子项目数量:   ${adjustedSubProjects.length}`);
    printInfo(`  执行批次数:   ${batches.length}`);
    printInfo('');

    printInfo(visualizeDecompositionTree(
      adjustedSubProjects.map((sp) => ({
        id: sp.id,
        name: sp.name,
        description: sp.description,
        dependencies: sp.dependencies,
        priority: sp.priority,
        estimated_complexity: sp.estimated_complexity,
      })),
      batches,
    ));

    printInfo('');
    printInfo('提示: 使用 --output 选项保存调整后的分解结果');

    return 0;
  } catch (err) {
    printError(`Failed to adjust decomposition: ${(err as Error).message}`);
    return 1;
  } finally {
    cpManager.close();
  }
}

// ============================================================
// Main Entry Point
// ============================================================

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv);

  // Handle --version flag anywhere
  if (parsed.options['version']) {
    printInfo(VERSION);
    return 0;
  }

  // Handle help command or --help flag
  if (parsed.command === 'help' || parsed.options['help']) {
    printInfo(HELP_TEXT);
    return 0;
  }

  // Load engine configuration
  const configPath = parsed.options['config'];
  const configLoader = createConfigLoader();
  const engineConfig = configLoader.loadEngineConfig(configPath);

  // Route to command handler
  switch (parsed.command) {
    case 'init':
      return handleInit(parsed, engineConfig);

    case 'start':
      return handleStart(parsed, engineConfig);

    case 'pause':
      return handlePause(parsed, engineConfig);

    case 'resume':
      return handleResume(parsed, engineConfig);

    case 'status':
      return handleStatus(parsed, engineConfig);

    case 'list':
      return handleList(parsed, engineConfig);

    case 'checkpoint':
      return handleCheckpoint(parsed, engineConfig);

    case 'rollback':
      return handleRollback(parsed, engineConfig);

    case 'decompose':
      return handleDecompose(parsed, engineConfig);

    case 'decomp-tree':
      return handleDecompositionTree(parsed, engineConfig);

    case 'adjust-decomp':
      return handleAdjustDecomposition(parsed, engineConfig);

    case 'health':
      return handleHealth(parsed, engineConfig);

    default:
      printError(`Unknown command: "${parsed.command}"`);
      printInfo('Run "honeycomb help" for usage information.');
      return 1;
  }
}

// Execute
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    printError(`Unexpected error: ${(err as Error).message}`);
    process.exitCode = 1;
  });
