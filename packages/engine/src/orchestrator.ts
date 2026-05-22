/**
 * Honeycomb v2 - 编排器（Orchestrator）
 *
 * 引擎的大脑。连接所有核心模块（状态机、检查点管理器、消息总线、
 * Agent 池、日志记录器、配置加载器），并管理从创建到交付的完整
 * 项目生命周期。
 *
 * 设计为可独立使用（无 CLI 依赖），并在每次重大状态变化时发出事件，
 * 以支持外部可观测性。
 *
 * @since v2.0.0
 */

import crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

// 桥接：@agentmesh/toolkit — 共享能力层
import { ToolRegistry } from '@agentmesh/toolkit';

import {
  Phase,
  AgentStatus,
  EngineEvent,
  DecisionPath,
  type EngineConfig,
  type ProjectConfig,
  type ProjectState,
  type AgentLayer,
  type AgentDefinition,
  type AgentState,
  type Checkpoint,
  type EngineEventPayload,
  type EventHandler,
  type ComplexityLevel,
} from './types.js';
import { PhaseStateMachine } from './state-machine.js';
import { CheckpointManager } from './checkpoint-manager.js';
import { MessageBus } from './message-bus.js';
import { AgentPool } from './agent-runner.js';
import { Logger } from './logger.js';
import { ConfigLoader } from './config-loader.js';
import { DomainLoader } from './domain-loader.js';
import { MetricsCollector } from './metrics.js';
import { LLMClient } from './llm/index.js';

// ============================================================
// HoneycombOrchestrator
// ============================================================

export class HoneycombOrchestrator {
  private config: EngineConfig;
  private configLoader: ConfigLoader;
  private domainLoader: DomainLoader;
  private metricsCollector: MetricsCollector;
  private checkpointManager: CheckpointManager;
  private messageBus: MessageBus;
  private agentPool: AgentPool;
  private logger: Logger;
  private stateMachine: PhaseStateMachine;
  private projectState: ProjectState | null;
  private eventHandlers: Map<EngineEvent, Set<EventHandler>>;
  /** LLM 客户端（可选，默认为 null 使用模拟模式） */
  private llmClient: LLMClient | null;
  /** 桥接：@agentmesh/toolkit 共享工具注册表 */
  private toolRegistry: ToolRegistry;

  constructor(config?: Partial<EngineConfig>) {
    // Load and merge configuration
    this.configLoader = new ConfigLoader();
    const baseConfig = this.configLoader.getDefaultConfig();

    this.config = {
      ...baseConfig,
      ...config,
      risk_thresholds: {
        ...baseConfig.risk_thresholds,
        ...(config?.risk_thresholds ?? {}),
        file_count: {
          ...baseConfig.risk_thresholds.file_count,
          ...(config?.risk_thresholds?.file_count ?? {}),
        },
        custom_rules:
          config?.risk_thresholds?.custom_rules ??
          baseConfig.risk_thresholds.custom_rules,
      },
    };

    // Preserve optional log_file if provided
    if (config?.log_file !== undefined) {
      this.config.log_file = config.log_file;
    }

    // Initialize logger
    this.logger = new Logger({
      level: this.config.log_level,
      file: this.config.log_file,
    });

    // Initialize domain loader
    const domainsRoot = this.config.domains_root ?? './domains';
    this.domainLoader = new DomainLoader(domainsRoot);

    // Validate and create directories
    this.validateAndCreateDirectories();

    // Initialize metrics collector
    this.metricsCollector = new MetricsCollector();

    // Initialize core modules
    this.checkpointManager = new CheckpointManager(this.config.db_path);
    this.messageBus = new MessageBus();

    // Validate agents_root exists before initializing AgentPool
    const agentsRootPath = path.resolve(this.config.agents_root);
    if (!fs.existsSync(agentsRootPath)) {
      throw new Error(`Agents directory does not exist: ${agentsRootPath}`);
    }

    this.agentPool = new AgentPool(this.config.agents_root);
    this.stateMachine = new PhaseStateMachine(Phase.INIT);

    // State
    this.projectState = null;
    this.eventHandlers = new Map();

    // 桥接：初始化 @agentmesh/toolkit ToolRegistry
    this.toolRegistry = new ToolRegistry();
    this.logger.info('orchestrator:bridge', 'ToolRegistry initialized via @agentmesh/toolkit');

    // 可选的 LLM 集成（保持向后兼容）
    this.llmClient = this.initializeLLMClient();

    this.logger.info('orchestrator:init', 'Honeycomb orchestrator initialized', {
      db_path: this.config.db_path,
      agents_root: this.config.agents_root,
      max_concurrent_agents: this.config.max_concurrent_agents,
      auto_checkpoint: this.config.auto_checkpoint,
      llm_enabled: this.llmClient !== null,
      llm_provider: this.config.llm?.provider ?? 'simulation',
    });
  }

  /**
   * 初始化 LLM 客户端（可选）
   * 如果配置中启用了 LLM，则创建 LLMClient；否则返回 null 使用模拟模式
   */
  private initializeLLMClient(): LLMClient | null {
    const llmConfig = this.config.llm;

    // 未配置或明确禁用
    if (!llmConfig || llmConfig.enabled === false) {
      this.logger.info('orchestrator:llm', '使用模拟模式（未启用 LLM API）');
      return null;
    }

    try {
      // 构建 LLMConfig（从 llm/index.ts 导入的 LLMConfig 类型）
      const config: any = {
        provider: llmConfig.provider ?? 'simulation',
      };

      // Claude 配置
      if (llmConfig.claude) {
        config.claude = {
          apiKey: llmConfig.claude.apiKey,
          baseUrl: llmConfig.claude.baseUrl,
          model: llmConfig.claude.model,
        };
      }

      // OpenAI 配置
      if (llmConfig.openai) {
        config.openai = {
          apiKey: llmConfig.openai.apiKey,
          baseUrl: llmConfig.openai.baseUrl,
          model: llmConfig.openai.model,
        };
      }

      // 批处理配置
      if (llmConfig.batch) {
        config.batch = {
          enabled: llmConfig.batch.enabled ?? false,
          maxBatchSize: llmConfig.batch.maxBatchSize ?? 10,
          maxWaitTime: llmConfig.batch.maxWaitTime ?? 100,
        };
      }

      // 缓存配置
      if (llmConfig.cache) {
        config.cache = {
          enabled: llmConfig.cache.enabled ?? false,
          maxSize: llmConfig.cache.maxSize ?? 1000,
          ttl: llmConfig.cache.ttl ?? 3600000,
        };
      }

      const client = new LLMClient(config, this.logger);
      this.logger.info('orchestrator:llm', `LLM 集成已启用: ${llmConfig.provider ?? 'simulation'}`);
      return client;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn('orchestrator:llm', `LLM 初始化失败，回退到模拟模式: ${errorMsg}`);
      return null;
    }
  }

  // ============================================================
  // Project Lifecycle
  // ============================================================

  /**
   * Initialize a new project from a project configuration.
   *
   * Steps:
   *   1. Assess complexity (if not explicitly provided)
   *   2. Assess risk and select the DF-CEA decision path
   *   3. Build the initial ProjectState
   *   4. Persist to the database
   *   5. Emit PROJECT_CREATED event
   */
  createProject(projectConfig: ProjectConfig): ProjectState {
    // Validate project configuration before proceeding
    this.validateProjectConfig(projectConfig);

    this.logger.info('project:create', `Creating project: ${projectConfig.name}`);

    // 1. Load domain configuration and merge with project config
    let mergedConfig = projectConfig;
    try {
      const domainConfig = this.domainLoader.loadDomain(projectConfig.archetype);
      mergedConfig = this.domainLoader.mergeDomainWithProject(domainConfig, projectConfig);
      this.logger.info('project:domain', `Loaded domain: ${domainConfig.name}`, {
        archetype: projectConfig.archetype,
        domain_version: domainConfig.version,
      });

      // Load domain-specific agents into agent pool
      const domainAgents = this.domainLoader.loadDomainAgents(projectConfig.archetype);
      if (domainAgents.length > 0) {
        for (const agent of domainAgents) {
          this.agentPool.register(agent);
        }
        this.logger.info('project:agents', `Loaded ${domainAgents.length} domain agents`, {
          agents: domainAgents.map(a => a.name),
        });
      }
    } catch (err) {
      // Domain loading is optional - log warning and continue
      this.logger.warn('project:domain', `Could not load domain for archetype ${projectConfig.archetype}: ${err}`, {
        archetype: projectConfig.archetype,
      });
    }

    // 2. Assess complexity
    // Normalize invalid complexity values to 'standard'
    const validComplexities: ComplexityLevel[] = ['simple', 'standard', 'advanced', 'enterprise'];
    const normalizedComplexity: ComplexityLevel =
      (mergedConfig.complexity && validComplexities.includes(mergedConfig.complexity as ComplexityLevel))
        ? (mergedConfig.complexity as ComplexityLevel)
        : this.configLoader.assessComplexity(mergedConfig);

    // 3. Assess risk and select decision path via state machine
    let { riskLevel, decisionPath } =
      this.stateMachine.evaluateAndSelectPath({
        description: mergedConfig.description,
        goals: mergedConfig.goals,
        complexity: normalizedComplexity,
        constraints: mergedConfig.constraints,
      });

    // If complexity was explicitly set and valid, override the decision path to match
    // This ensures explicit 'standard' complexity uses STANDARD path, etc.
    if (normalizedComplexity && normalizedComplexity !== mergedConfig.complexity) {
      // Complexity was normalized to a valid value
      switch (normalizedComplexity) {
        case 'simple':
          decisionPath = DecisionPath.EXPRESS;
          break;
        case 'standard':
          decisionPath = DecisionPath.STANDARD;
          break;
        case 'advanced':
          decisionPath = DecisionPath.DEEP;
          break;
        case 'enterprise':
          decisionPath = DecisionPath.FULL;
          break;
      }
    } else if (mergedConfig.complexity && validComplexities.includes(mergedConfig.complexity as ComplexityLevel)) {
      // Original complexity was valid
      switch (mergedConfig.complexity as ComplexityLevel) {
        case 'simple':
          decisionPath = DecisionPath.EXPRESS;
          break;
        case 'standard':
          decisionPath = DecisionPath.STANDARD;
          break;
        case 'advanced':
          decisionPath = DecisionPath.DEEP;
          break;
        case 'enterprise':
          decisionPath = DecisionPath.FULL;
          break;
      }
    }

    this.logger.info('project:risk', `Risk: ${riskLevel}, path: ${decisionPath}`, {
      complexity: normalizedComplexity,
      riskLevel,
      decisionPath,
    });

    // 4. Build initial project state
    const now = Date.now();
    const projectId = crypto.randomUUID();
    const traceId = this.generateTraceId();

    // Set trace ID in logger for all subsequent logs
    this.logger.setTraceId(traceId);

    const state: ProjectState = {
      project_id: projectId,
      project_name: mergedConfig.name,
      project_description: mergedConfig.description,
      archetype: mergedConfig.archetype,
      complexity: normalizedComplexity,
      decision_path: decisionPath,
      risk_level: riskLevel,
      trace_id: traceId,

      current_phase: Phase.INIT,
      phase_history: [],

      active_agents: [],
      agent_states: {},

      artifacts: [],
      decisions: [],

      total_token_usage: 0,
      token_budget:
        (mergedConfig.token_budget && mergedConfig.token_budget > 0)
          ? mergedConfig.token_budget
          : this.config.default_token_budget,

      created_at: now,
      updated_at: now,
    };

    // 4. Persist to database
    this.checkpointManager.saveProjectState(state);
    this.projectState = state;

    // 5. Emit event
    this.emit(EngineEvent.PROJECT_CREATED, {
      project_id: projectId,
      project_name: projectConfig.name,
      complexity: normalizedComplexity,
      decision_path: decisionPath,
      risk_level: riskLevel,
    });

    this.logger.info('project:created', `Project created: ${projectId}`, {
      project_id: projectId,
      complexity: normalizedComplexity,
      decision_path: decisionPath,
    });

    return state;
  }

  /**
   * Begin phase execution for a project.
   *
   * Steps:
   *   1. Load state from database (or use in-memory state)
   *   2. Transition to the first effective phase (skipping INIT)
   *   3. Run agents for that phase
   *   4. Emit PROJECT_STARTED
   */
  async startProject(projectId: string): Promise<void> {
    this.logger.info('project:start', `Starting project: ${projectId}`);

    // 1. Load state
    if (!this.projectState || this.projectState.project_id !== projectId) {
      const loaded = this.checkpointManager.loadProjectState(projectId);
      if (!loaded) {
        throw new Error(`Project not found: ${projectId}`);
      }
      this.projectState = loaded;
    }

    // Re-sync the state machine with the project's current state
    this.stateMachine = new PhaseStateMachine(this.projectState.current_phase);
    this.stateMachine.selectDecisionPath(this.projectState.risk_level);

    // Set trace ID in logger
    if (this.projectState.trace_id) {
      this.logger.setTraceId(this.projectState.trace_id);
    }

    // Mark project started
    this.projectState.started_at = Date.now();
    this.projectState.updated_at = Date.now();

    // 传递 LLMClient 给 AgentPool（如果已启用）
    if (this.llmClient) {
      this.agentPool.setLLMClient(this.llmClient);
    }

    // 2. Transition to first effective phase after INIT
    const effectiveSequence = this.stateMachine.getEffectivePhaseSequence();
    const initIndex = effectiveSequence.indexOf(Phase.INIT);
    const firstEffectivePhase =
      initIndex >= 0 && initIndex < effectiveSequence.length - 1
        ? effectiveSequence[initIndex + 1]
        : null;

    if (!firstEffectivePhase) {
      throw new Error('No effective phases available after INIT');
    }

    this.transitionPhase(
      firstEffectivePhase,
      'Project started - entering first effective phase',
    );

    // 3. Emit PROJECT_STARTED
    this.emit(EngineEvent.PROJECT_STARTED, {
      project_id: projectId,
      phase: firstEffectivePhase,
    });

    // 4. Run agents for the current phase (and auto-advance through the pipeline)
    await this.runCurrentPhase();
  }

  /**
   * Execute the current phase.
   *
   * Steps:
   *   1. Determine the agent layer for the current phase
   *   2. Select active agents for that layer
   *   3. Run them concurrently (respecting max_concurrent_agents)
   *   4. Collect results and check for failures
   *   5. Auto-advance to next phase on success
   */
  async runCurrentPhase(): Promise<void> {
    if (!this.projectState) {
      throw new Error('No active project. Call createProject() first.');
    }

    const currentPhase = this.projectState.current_phase;
    this.logger.phase(currentPhase, 'phase:run', `Running phase: ${currentPhase}`);

    // Start phase timer
    const phaseTimer = this.metricsCollector.startTimer('phase.duration', { phase: currentPhase });

    this.emit(EngineEvent.PHASE_ENTERED, {
      project_id: this.projectState.project_id,
      phase: currentPhase,
    });

    try {
      // Determine if this phase requires agent execution
      const layer = this.getLayerForPhase(currentPhase);

      if (layer) {
        await this.runAgentsForPhase(currentPhase);
      } else if (currentPhase === Phase.DELIVERY) {
        // DELIVERY is handled by the orchestrator itself
        this.logger.info(
          'phase:delivery',
          'Delivery phase - packaging artifacts',
        );
        this.projectState.updated_at = Date.now();
      }
      // INIT has no agents; setup-only, handled by createProject

      // Phase completed successfully
      const phaseDuration = phaseTimer.stop();
      this.metricsCollector.increment('phases.completed', { phase: currentPhase });

      this.emit(EngineEvent.PHASE_COMPLETED, {
        project_id: this.projectState.project_id,
        phase: currentPhase,
        duration_ms: phaseDuration,
      });

      // Auto-checkpoint if configured
      if (this.config.auto_checkpoint) {
        this.checkpoint(`Auto-checkpoint after phase: ${currentPhase}`);
        this.metricsCollector.increment('checkpoints.created', { phase: currentPhase });
      }

      // Auto-advance to the next phase
      const nextPhase = this.stateMachine.getNextPhase();

      if (nextPhase && nextPhase !== Phase.COMPLETED) {
        this.advancePhase(`Phase ${currentPhase} completed successfully`);
        await this.runCurrentPhase();
      } else if (nextPhase === Phase.COMPLETED) {
        this.advancePhase('All phases completed');
        this.projectState.completed_at = Date.now();
        this.projectState.updated_at = Date.now();
        this.checkpointManager.saveProjectState(this.projectState);

        this.emit(EngineEvent.PROJECT_COMPLETED, {
          project_id: this.projectState.project_id,
          total_token_usage: this.projectState.total_token_usage,
        });

        this.logger.info(
          'project:completed',
          `Project completed: ${this.projectState.project_id}`,
          {
            total_token_usage: this.projectState.total_token_usage,
            duration_ms:
              (this.projectState.completed_at ?? Date.now()) -
              (this.projectState.started_at ?? this.projectState.created_at),
          },
        );
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'phase:failed',
        `Phase ${currentPhase} failed: ${errorMsg}`,
      );

      this.emit(EngineEvent.PHASE_FAILED, {
        project_id: this.projectState.project_id,
        phase: currentPhase,
        error: errorMsg,
      });

      // Attempt to transition to FAILED state
      try {
        this.stateMachine.fail(`Phase ${currentPhase} failed: ${errorMsg}`);
        this.projectState.current_phase = Phase.FAILED;
        this.projectState.updated_at = Date.now();
        this.checkpointManager.saveProjectState(this.projectState);

        this.emit(EngineEvent.PROJECT_FAILED, {
          project_id: this.projectState.project_id,
          phase: currentPhase,
          error: errorMsg,
        });
      } catch {
        // Already in a terminal state; log and move on
        this.logger.error(
          'phase:failed',
          'Could not transition to FAILED state',
        );
      }
    }
  }

  /**
   * Advance to the next phase in the effective sequence.
   * Creates a checkpoint (via auto-checkpoint logic in runCurrentPhase)
   * and emits phase events.
   */
  advancePhase(reason?: string): void {
    if (!this.projectState) {
      throw new Error('No active project. Call createProject() first.');
    }

    const advanceReason = reason ?? 'Phase advanced';
    const record = this.stateMachine.advance(advanceReason);

    // Update project state
    this.projectState.current_phase = record.to;
    this.projectState.phase_history.push(record);
    this.projectState.updated_at = Date.now();

    // Persist
    this.checkpointManager.saveProjectState(this.projectState);

    this.logger.phase(
      record.to,
      'phase:advance',
      `Phase advanced: ${record.from} -> ${record.to}`,
      { reason: advanceReason },
    );

    this.emit(EngineEvent.PHASE_ENTERED, {
      project_id: this.projectState.project_id,
      phase: record.to,
      from: record.from,
      reason: advanceReason,
    });
  }

  /**
   * Pause project execution. Saves state and emits event.
   */
  pauseProject(reason: string): void {
    if (!this.projectState) {
      throw new Error('No active project. Call createProject() first.');
    }

    const record = this.stateMachine.pause(reason);

    this.projectState.current_phase = Phase.PAUSED;
    this.projectState.phase_history.push(record);
    this.projectState.updated_at = Date.now();
    this.checkpointManager.saveProjectState(this.projectState);

    this.logger.warn('project:paused', `Project paused: ${reason}`, {
      project_id: this.projectState.project_id,
      paused_from: record.from,
    });

    this.emit(EngineEvent.PROJECT_PAUSED, {
      project_id: this.projectState.project_id,
      reason,
      paused_from: record.from,
    });
  }

  /**
   * Resume project execution from the paused state.
   */
  resumeProject(): void {
    if (!this.projectState) {
      throw new Error('No active project. Call createProject() first.');
    }

    const record = this.stateMachine.resume(undefined, 'Resumed by operator');

    this.projectState.current_phase = record.to;
    this.projectState.phase_history.push(record);
    this.projectState.updated_at = Date.now();
    this.checkpointManager.saveProjectState(this.projectState);

    this.logger.info(
      'project:resumed',
      `Project resumed to phase: ${record.to}`,
      { project_id: this.projectState.project_id },
    );

    this.emit(EngineEvent.PROJECT_RESUMED, {
      project_id: this.projectState.project_id,
      resumed_to: record.to,
    });
  }

  /**
   * Return the current project state, or null if no project is active.
   */
  getProjectState(): ProjectState | null {
    return this.projectState;
  }

  // ============================================================
  // Convenience: Database Read Operations (for CLI / external use)
  // ============================================================

  /**
   * Load a project state from the database by its ID.
   * Does NOT make it the active in-memory project; use startProject() for that.
   */
  loadProjectState(projectId: string): ProjectState | null {
    return this.checkpointManager.loadProjectState(projectId);
  }

  /**
   * List all projects with summary metadata.
   * Delegates to the checkpoint manager.
   */
  listProjects(): Array<{ project_id: string; project_name: string; updated_at: number }> {
    return this.checkpointManager.listProjects();
  }

  /**
   * Create a checkpoint for any project (by loading its state from DB).
   * This variant accepts a project ID for CLI convenience.
   * Returns the checkpoint ID.
   */
  createCheckpointForProject(projectId: string, description?: string): string {
    const state = this.checkpointManager.loadProjectState(projectId);
    if (!state) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const desc = description ?? `Manual checkpoint at phase ${state.current_phase}`;
    const cp = this.checkpointManager.createCheckpoint(state, desc);

    this.logger.info('checkpoint:created', `Checkpoint created: ${cp.id}`, {
      checkpoint_id: cp.id,
      project_id: projectId,
      phase: state.current_phase,
    });

    return cp.id;
  }

  /**
   * Rollback a specific project to a checkpoint, validating ownership.
   * Returns the restored ProjectState.
   */
  rollbackProject(projectId: string, checkpointId: string): ProjectState {
    const restoredState = this.checkpointManager.restoreCheckpoint(checkpointId);

    if (restoredState.project_id !== projectId) {
      throw new Error(
        `Checkpoint ${checkpointId} belongs to project ${restoredState.project_id}, not ${projectId}`,
      );
    }

    restoredState.updated_at = Date.now();
    this.checkpointManager.saveProjectState(restoredState);

    // Also update in-memory state if this is the active project
    if (this.projectState?.project_id === projectId) {
      this.projectState = restoredState;
      this.stateMachine = new PhaseStateMachine(restoredState.current_phase);
      this.stateMachine.selectDecisionPath(restoredState.risk_level);
    }

    this.logger.info(
      'checkpoint:restored',
      `Project rolled back to checkpoint ${checkpointId}`,
      {
        project_id: projectId,
        checkpoint_id: checkpointId,
        phase: restoredState.current_phase,
      },
    );

    return restoredState;
  }

  // ============================================================
  // Phase-to-Layer Mapping (private)
  // ============================================================

  /**
   * Maps lifecycle phases to agent architectural layers.
   * Returns null for phases that do not require agent execution.
   */
  private getLayerForPhase(phase: Phase): AgentLayer | null {
    switch (phase) {
      case Phase.INIT:
        return null;
      case Phase.RESEARCH:
        return 'L1';
      case Phase.DECISION:
        return 'L2';
      case Phase.EXECUTION:
        return 'L3';
      case Phase.FEEDBACK:
        return 'L4';
      case Phase.DELIVERY:
        return null;
      default:
        return null;
    }
  }

  // ============================================================
  // Agent Execution (private)
  // ============================================================

  /**
   * Run all agents for the given phase's layer.
   * Respects max_concurrent_agents via batched Promise.all.
   */
  private async runAgentsForPhase(phase: Phase): Promise<void> {
    if (!this.projectState) {
      throw new Error('No active project');
    }

    const layer = this.getLayerForPhase(phase);
    if (!layer) {
      this.logger.debug('agents:skip', `No agent layer for phase: ${phase}`);
      return;
    }

    // Get agents for this layer that are active for the project's complexity
    const activeAgents = this.agentPool.getActiveAgents(
      this.projectState.complexity,
    );
    const layerAgents = activeAgents.filter((a) => a.layer === layer);

    if (layerAgents.length === 0) {
      this.logger.info(
        'agents:none',
        `No agents found for layer ${layer} in phase ${phase}`,
      );
      return;
    }

    this.logger.info(
      'agents:run',
      `Running ${layerAgents.length} agent(s) for layer ${layer}`,
      {
        agents: layerAgents.map((a) => a.name),
        phase,
        layer,
      },
    );

    // Update project state with active agent names
    this.projectState.active_agents = layerAgents.map((a) => a.name);

    // Update metrics: active agents gauge
    this.metricsCollector.gauge('agents.active', layerAgents.length, { phase, layer });

    // Build the task description from project context
    const task = this.buildTaskForPhase(phase);

    // Run agents concurrently in batches respecting max_concurrent_agents
    const maxConcurrent = this.config.max_concurrent_agents;
    const results: AgentState[] = [];

    for (let i = 0; i < layerAgents.length; i += maxConcurrent) {
      const batch = layerAgents.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map((agent) => this.runAgent(agent, task)),
      );
      results.push(...batchResults);
    }

    // Update project state with results
    for (const result of results) {
      this.projectState.agent_states[result.agent_name] = result;
      this.projectState.total_token_usage += result.token_usage;
    }

    // Update metrics: token usage gauge
    this.metricsCollector.gauge('tokens.used', this.projectState.total_token_usage, {
      project_id: this.projectState.project_id
    });

    // Clear active agents list
    this.projectState.active_agents = [];
    this.metricsCollector.gauge('agents.active', 0, { phase, layer });
    this.projectState.updated_at = Date.now();
    this.checkpointManager.saveProjectState(this.projectState);

    // Check for failures
    const failures = results.filter(
      (r) => r.status === AgentStatus.FAILED,
    );
    if (failures.length > 0) {
      const failedNames = failures.map((f) => f.agent_name).join(', ');
      this.logger.warn(
        'agents:failures',
        `${failures.length} agent(s) failed: ${failedNames}`,
        { failed_agents: failedNames },
      );

      // If ALL agents failed, throw to trigger phase failure
      if (failures.length === results.length) {
        throw new Error(
          `All agents failed in phase ${phase}: ${failedNames}`,
        );
      }
    }

    this.logger.info(
      'agents:complete',
      `All agents finished for phase ${phase}`,
      {
        total: results.length,
        succeeded: results.filter(
          (r) => r.status === AgentStatus.COMPLETED,
        ).length,
        failed: failures.length,
        total_tokens: results.reduce((sum, r) => sum + r.token_usage, 0),
      },
    );
  }

  /**
   * Run a single agent: execute via AgentRunner, send messages via bus, log results.
   */
  private async runAgent(
    definition: AgentDefinition,
    task: string,
  ): Promise<AgentState> {
    const projectId = this.projectState?.project_id ?? 'unknown';

    this.logger.agent(
      definition.name,
      'agent:start',
      `Starting agent: ${definition.name}`,
      { layer: definition.layer, task_length: task.length },
    );

    // Increment agent spawned metric
    this.metricsCollector.increment('agents.spawned', { agent: definition.name, layer: definition.layer });

    this.emit(EngineEvent.AGENT_STARTED, {
      project_id: projectId,
      agent_name: definition.name,
      layer: definition.layer,
    });

    // Notify via message bus (with trace_id)
    const traceId = this.projectState?.trace_id ?? 'unknown';
    const startMsg = this.messageBus.createMessage(
      'orchestrator',
      definition.name,
      'event',
      { action: 'start', task },
      traceId,
    );
    this.messageBus.send(startMsg);
    this.metricsCollector.increment('messages.sent', { from: 'orchestrator', to: definition.name });

    try {
      const runner = this.agentPool.getRunner();
      const result = await runner.runAgent(definition, task);

      if (result.status === AgentStatus.COMPLETED) {
        this.logger.agent(
          definition.name,
          'agent:completed',
          `Agent completed: ${definition.name}`,
          {
            token_usage: result.token_usage,
            duration_ms:
              (result.completed_at ?? Date.now()) -
              (result.started_at ?? Date.now()),
          },
        );

        this.emit(EngineEvent.AGENT_COMPLETED, {
          project_id: projectId,
          agent_name: definition.name,
          token_usage: result.token_usage,
        });

        // Send completion message via bus (with trace_id)
        const traceId = this.projectState?.trace_id ?? 'unknown';
        const doneMsg = this.messageBus.createMessage(
          definition.name,
          'orchestrator',
          'response',
          {
            status: 'completed',
            output_length: result.output?.length ?? 0,
          },
          traceId,
        );
        this.messageBus.send(doneMsg);
        this.metricsCollector.increment('messages.sent', { from: definition.name, to: 'orchestrator' });
      } else if (result.status === AgentStatus.FAILED) {
        this.logger.error(
          'agent:failed',
          `Agent failed: ${definition.name}: ${result.last_error}`,
          {
            agent_name: definition.name,
            retry_count: result.retry_count,
          },
        );

        this.emit(EngineEvent.AGENT_FAILED, {
          project_id: projectId,
          agent_name: definition.name,
          error: result.last_error,
          retry_count: result.retry_count,
        });
      }

      return result;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        'agent:error',
        `Unexpected error running agent ${definition.name}: ${errorMsg}`,
      );

      this.emit(EngineEvent.AGENT_FAILED, {
        project_id: projectId,
        agent_name: definition.name,
        error: errorMsg,
      });

      // Return a failed agent state so the batch can continue
      return {
        agent_name: definition.name,
        status: AgentStatus.FAILED,
        current_task: task,
        started_at: Date.now(),
        completed_at: Date.now(),
        retry_count: 0,
        last_error: errorMsg,
        token_usage: 0,
      };
    }
  }

  /**
   * Build a task description for the current phase from project context.
   */
  private buildTaskForPhase(phase: Phase): string {
    if (!this.projectState) {
      return `Execute phase: ${phase}`;
    }

    const parts: string[] = [
      `Project: ${this.projectState.project_name}`,
      `Description: ${this.projectState.project_description}`,
      `Phase: ${phase}`,
      `Archetype: ${this.projectState.archetype}`,
      `Complexity: ${this.projectState.complexity}`,
      `Decision Path: ${this.projectState.decision_path}`,
    ];

    return parts.join('\n');
  }

  // ============================================================
  // Event System
  // ============================================================

  /**
   * Register an event handler for a specific engine event.
   * Returns an unsubscribe function.
   */
  on(event: EngineEvent, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    const handlers = this.eventHandlers.get(event)!;
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    };
  }

  /**
   * Emit an event to all registered handlers.
   * Also broadcasts on the message bus for cross-module observability.
   */
  private emit(event: EngineEvent, data: Record<string, unknown>): void {
    const payload: EngineEventPayload = {
      event,
      timestamp: Date.now(),
      project_id: this.projectState?.project_id ?? '',
      data,
    };

    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          const result = handler(payload);
          if (result instanceof Promise) {
            result.catch((err) => {
              this.logger.error(
                'event:handler-error',
                `Async event handler error for ${event}: ${err}`,
              );
            });
          }
        } catch (err) {
          this.logger.error(
            'event:handler-error',
            `Sync event handler error for ${event}: ${err}`,
          );
        }
      }
    }

    // Broadcast on the message bus for cross-module observability (with trace_id)
    const traceId = this.projectState?.trace_id ?? 'unknown';
    const busMsg = this.messageBus.createMessage(
      'orchestrator',
      '*',
      'event',
      { engine_event: event, ...data },
      traceId,
    );
    this.messageBus.broadcast(busMsg);
    this.metricsCollector.increment('messages.sent', { from: 'orchestrator', to: '*', type: 'event' });
  }

  // ============================================================
  // Checkpoint Integration
  // ============================================================

  /**
   * Create a checkpoint of the current project state.
   */
  checkpoint(description?: string): void {
    if (!this.projectState) {
      throw new Error('No active project. Call createProject() first.');
    }

    const desc =
      description ??
      `Manual checkpoint at phase: ${this.projectState.current_phase}`;
    const cp = this.checkpointManager.createCheckpoint(
      this.projectState,
      desc,
    );

    this.metricsCollector.increment('checkpoints.created', { phase: this.projectState.current_phase });

    this.logger.info('checkpoint:created', `Checkpoint created: ${cp.id}`, {
      checkpoint_id: cp.id,
      phase: this.projectState.current_phase,
      description: desc,
    });

    this.emit(EngineEvent.CHECKPOINT_CREATED, {
      project_id: this.projectState.project_id,
      checkpoint_id: cp.id,
      phase: this.projectState.current_phase,
      description: desc,
    });
  }

  /**
   * Rollback to a previous checkpoint.
   * Restores project state and re-syncs the state machine.
   * Validates that the checkpoint belongs to the current project.
   */
  rollback(checkpointId: string): void {
    if (!this.projectState) {
      throw new Error('No active project. Cannot rollback without an active project.');
    }

    this.logger.info(
      'checkpoint:rollback',
      `Rolling back to checkpoint: ${checkpointId}`,
    );

    const restoredState =
      this.checkpointManager.restoreCheckpoint(checkpointId);

    // Validate checkpoint belongs to the current project
    if (restoredState.project_id !== this.projectState.project_id) {
      throw new Error(
        `Checkpoint ${checkpointId} belongs to project ${restoredState.project_id}, ` +
        `not the current project ${this.projectState.project_id}`
      );
    }

    this.projectState = restoredState;

    // Re-sync the state machine with restored state
    this.stateMachine = new PhaseStateMachine(restoredState.current_phase);
    this.stateMachine.selectDecisionPath(restoredState.risk_level);

    // Persist the restored state as the current state
    this.checkpointManager.saveProjectState(restoredState);

    this.logger.info(
      'checkpoint:restored',
      `Restored to phase: ${restoredState.current_phase}`,
      {
        checkpoint_id: checkpointId,
        project_id: restoredState.project_id,
        phase: restoredState.current_phase,
      },
    );

    this.emit(EngineEvent.CHECKPOINT_RESTORED, {
      project_id: restoredState.project_id,
      checkpoint_id: checkpointId,
      restored_phase: restoredState.current_phase,
    });
  }

  /**
   * List all checkpoints for the current project.
   */
  listCheckpoints(): Checkpoint[] {
    if (!this.projectState) {
      return [];
    }
    return this.checkpointManager.listCheckpoints(
      this.projectState.project_id,
    );
  }

  // ============================================================
  // Utility
  // ============================================================

  /**
   * Return engine statistics: phase, agents, tokens, messages, checkpoints.
   */
  getStats(): Record<string, unknown> {
    const busStats = this.messageBus.getStats();
    const agentCount = this.agentPool.listAll().length;
    const checkpointCount = this.projectState
      ? this.checkpointManager.listCheckpoints(
          this.projectState.project_id,
        ).length
      : 0;

    return {
      project_id: this.projectState?.project_id ?? null,
      current_phase: this.projectState?.current_phase ?? null,
      decision_path: this.projectState?.decision_path ?? null,
      complexity: this.projectState?.complexity ?? null,
      risk_level: this.projectState?.risk_level ?? null,
      total_token_usage: this.projectState?.total_token_usage ?? 0,
      token_budget:
        this.projectState?.token_budget ?? this.config.default_token_budget,
      agents_loaded: agentCount,
      active_agents: this.projectState?.active_agents.length ?? 0,
      phase_history_length:
        this.projectState?.phase_history.length ?? 0,
      artifacts_count: this.projectState?.artifacts.length ?? 0,
      decisions_count: this.projectState?.decisions.length ?? 0,
      checkpoints: checkpointCount,
      messages: busStats,
      event_handlers: this.eventHandlers.size,
    };
  }

  /**
   * Gracefully shut down the orchestrator.
   * Closes the database, clears the message bus, and logs shutdown.
   */
  shutdown(): void {
    this.logger.info('orchestrator:shutdown', 'Shutting down orchestrator');

    try {
      this.checkpointManager.close();
    } catch (err) {
      this.logger.error(
        'orchestrator:shutdown',
        `Error closing database: ${err}`,
      );
    }

    this.messageBus.clear();
    this.eventHandlers.clear();
    this.projectState = null;

    this.logger.info(
      'orchestrator:shutdown',
      'Orchestrator shutdown complete',
    );
  }

  // ============================================================
  // Metrics Access
  // ============================================================

  /**
   * Get the metrics collector instance for external observation.
   */
  getMetrics(): MetricsCollector {
    return this.metricsCollector;
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Validate required directories exist and create output directory if needed.
   */
  private validateAndCreateDirectories(): void {
    // Ensure output directory exists, create if not
    const outputPath = path.resolve(this.config.output_dir);
    if (!fs.existsSync(outputPath)) {
      try {
        fs.mkdirSync(outputPath, { recursive: true });
        this.logger.info('filesystem:mkdir', `Created output directory: ${outputPath}`);
      } catch (err) {
        throw new Error(`Failed to create output directory ${outputPath}: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Generate a trace ID for distributed tracing.
   * Format: hc-{timestamp}-{random4hex}
   */
  private generateTraceId(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 0xFFFF).toString(16).padStart(4, '0');
    return `hc-${timestamp}-${random}`;
  }

  /**
   * Validate project configuration before creating a project.
   * Throws Error if validation fails.
   */
  private validateProjectConfig(config: ProjectConfig): void {
    // Validate required fields
    if (!config.name || typeof config.name !== 'string' || config.name.trim() === '') {
      throw new Error('Project config missing required field: name (must be a non-empty string)');
    }
    if (!config.description || typeof config.description !== 'string' || config.description.trim() === '') {
      throw new Error('Project config missing required field: description (must be a non-empty string)');
    }
    if (!config.archetype || typeof config.archetype !== 'string') {
      throw new Error('Project config missing required field: archetype');
    }
    if (!Array.isArray(config.goals) || config.goals.length === 0) {
      throw new Error('Project config missing required field: goals (must be a non-empty array)');
    }

    // Validate goals are non-empty strings
    for (let i = 0; i < config.goals.length; i++) {
      const goal = config.goals[i];
      if (typeof goal !== 'string' || goal.trim() === '') {
        throw new Error(`Project config goal at index ${i} must be a non-empty string`);
      }
    }

    // Validate token_budget if provided
    if (config.token_budget !== undefined) {
      if (typeof config.token_budget !== 'number') {
        throw new Error('Project config token_budget must be a number');
      }
      if (config.token_budget < 0) {
        throw new Error('Project config token_budget must be greater than or equal to 0');
      }
    }

    // Validate complexity if provided - invalid values will be defaulted later
    // (we don't throw here to allow graceful handling of legacy configs)
  }

  /**
   * Transition to a specific phase, updating both the state machine
   * and the project state atomically.
   */
  private transitionPhase(target: Phase, reason: string): void {
    if (!this.projectState) {
      throw new Error('No active project');
    }

    const record = this.stateMachine.transitionTo(target, reason);
    this.projectState.current_phase = target;
    this.projectState.phase_history.push(record);
    this.projectState.updated_at = Date.now();
    this.checkpointManager.saveProjectState(this.projectState);
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create a new HoneycombOrchestrator instance with optional config overrides.
 */
export function createOrchestrator(
  config?: Partial<EngineConfig>,
): HoneycombOrchestrator {
  return new HoneycombOrchestrator(config);
}
