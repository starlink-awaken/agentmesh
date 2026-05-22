/**
 * Honeycomb v2 - Dashboard Monitor
 *
 * Standalone dashboard monitor that can attach to a running or paused project
 * and display real-time observability metrics.
 */

import { createDashboard } from './dashboard.js';
import { createOrchestrator } from './orchestrator.js';
import { EngineEvent } from './types.js';
import type { HoneycombOrchestrator } from './orchestrator.js';
import type { Dashboard } from './dashboard.js';
import type { EngineConfig } from './types.js';

// ============================================================
// Monitor Options
// ============================================================

export interface MonitorOptions {
  /** Project ID to monitor */
  projectId: string;

  /** Engine configuration */
  engineConfig: EngineConfig;

  /** Dashboard refresh interval in milliseconds (default: 1000) */
  refreshInterval?: number;

  /** Compact dashboard mode (default: false) */
  compact?: boolean;

  /** Show checkpoints (default: true) */
  showCheckpoints?: boolean;

  /** Show token budget (default: true) */
  showTokenBudget?: boolean;
}

// ============================================================
// Dashboard Monitor Class
// ============================================================

export class DashboardMonitor {
  private orchestrator: HoneycombOrchestrator;
  private dashboard: Dashboard;
  private projectId: string;
  private refreshInterval: number;
  private refreshHandle: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(options: MonitorOptions) {
    this.projectId = options.projectId;
    this.refreshInterval = options.refreshInterval ?? 1000;

    // Create orchestrator instance
    this.orchestrator = createOrchestrator(options.engineConfig);

    // Create dashboard instance
    this.dashboard = createDashboard({
      refreshInterval: this.refreshInterval,
      compact: options.compact ?? false,
      showCheckpoints: options.showCheckpoints ?? true,
      showTokenBudget: options.showTokenBudget ?? true,
    });
  }

  /**
   * Start monitoring the project.
   * Loads initial state, sets up event listeners, and starts the dashboard.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Monitor is already running');
    }

    // Load initial project state
    const state = this.orchestrator.loadProjectState(this.projectId);
    if (!state) {
      throw new Error(`Project not found: ${this.projectId}`);
    }

    // Set up dashboard with initial data
    this.dashboard.setProjectState(state);
    this.dashboard.setMetrics(this.orchestrator.getMetrics());

    // Load checkpoints
    const checkpoints = this.orchestrator.listCheckpoints();
    this.dashboard.setCheckpoints(checkpoints);

    this.dashboard.addEvent(`Monitoring project: ${state.project_name}`, 'info');

    // Register event handlers
    this.setupEventHandlers();

    // Set up periodic state refresh (in case state changes externally)
    this.refreshHandle = setInterval(() => {
      this.refreshState();
    }, this.refreshInterval);

    // Start the dashboard
    this.dashboard.start();
    this.isRunning = true;

    // Set up graceful shutdown handlers
    this.setupShutdownHandlers();
  }

  /**
   * Stop monitoring and clean up resources.
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop refresh timer
    if (this.refreshHandle !== null) {
      clearInterval(this.refreshHandle);
      this.refreshHandle = null;
    }

    // Stop dashboard
    this.dashboard.stop();

    // Shutdown orchestrator
    this.orchestrator.shutdown();
  }

  /**
   * Refresh state from database and update dashboard.
   */
  private refreshState(): void {
    try {
      const updatedState = this.orchestrator.loadProjectState(this.projectId);
      if (updatedState) {
        this.dashboard.setProjectState(updatedState);
        this.dashboard.setMetrics(this.orchestrator.getMetrics());

        const updatedCheckpoints = this.orchestrator.listCheckpoints();
        this.dashboard.setCheckpoints(updatedCheckpoints);
      }
    } catch (err) {
      this.dashboard.addEvent(
        `Error refreshing state: ${(err as Error).message}`,
        'error',
      );
    }
  }

  /**
   * Set up event handlers to update dashboard in real-time.
   */
  private setupEventHandlers(): void {
    // Phase events
    this.orchestrator.on(EngineEvent.PHASE_ENTERED, (payload) => {
      const updatedState = this.orchestrator.getProjectState();
      if (updatedState) {
        this.dashboard.setProjectState(updatedState);
        this.dashboard.addEvent(
          `Phase transition: ${payload.data.from ?? 'unknown'} → ${payload.data.phase}`,
          'success',
        );
      }
    });

    this.orchestrator.on(EngineEvent.PHASE_COMPLETED, (payload) => {
      const updatedState = this.orchestrator.getProjectState();
      if (updatedState) {
        this.dashboard.setProjectState(updatedState);
        this.dashboard.addEvent(
          `Phase completed: ${payload.data.phase} (${payload.data.duration_ms}ms)`,
          'success',
        );
      }
    });

    this.orchestrator.on(EngineEvent.PHASE_FAILED, (payload) => {
      const updatedState = this.orchestrator.getProjectState();
      if (updatedState) {
        this.dashboard.setProjectState(updatedState);
        this.dashboard.addEvent(
          `Phase failed: ${payload.data.phase} - ${payload.data.error}`,
          'error',
        );
      }
    });

    // Agent events
    this.orchestrator.on(EngineEvent.AGENT_STARTED, (payload) => {
      const updatedState = this.orchestrator.getProjectState();
      if (updatedState) {
        this.dashboard.setProjectState(updatedState);
        this.dashboard.addEvent(
          `Agent started: ${payload.data.agent_name} (layer: ${payload.data.layer})`,
          'info',
        );
      }
    });

    this.orchestrator.on(EngineEvent.AGENT_COMPLETED, (payload) => {
      const updatedState = this.orchestrator.getProjectState();
      if (updatedState) {
        this.dashboard.setProjectState(updatedState);
        this.dashboard.addEvent(
          `Agent completed: ${payload.data.agent_name} (${payload.data.token_usage} tokens)`,
          'success',
        );
      }
    });

    this.orchestrator.on(EngineEvent.AGENT_FAILED, (payload) => {
      const updatedState = this.orchestrator.getProjectState();
      if (updatedState) {
        this.dashboard.setProjectState(updatedState);
        this.dashboard.addEvent(
          `Agent failed: ${payload.data.agent_name} - ${payload.data.error}`,
          'error',
        );
      }
    });

    this.orchestrator.on(EngineEvent.AGENT_RETRYING, (payload) => {
      const updatedState = this.orchestrator.getProjectState();
      if (updatedState) {
        this.dashboard.setProjectState(updatedState);
        this.dashboard.addEvent(
          `Agent retrying: ${payload.data.agent_name} (attempt ${payload.data.retry_count})`,
          'warn',
        );
      }
    });

    // Checkpoint events
    this.orchestrator.on(EngineEvent.CHECKPOINT_CREATED, (payload) => {
      const updatedState = this.orchestrator.getProjectState();
      const updatedCheckpoints = this.orchestrator.listCheckpoints();
      if (updatedState) {
        this.dashboard.setProjectState(updatedState);
        this.dashboard.setCheckpoints(updatedCheckpoints);
        this.dashboard.addEvent(
          `Checkpoint created at phase: ${payload.data.phase}`,
          'success',
        );
      }
    });

    this.orchestrator.on(EngineEvent.CHECKPOINT_RESTORED, (payload) => {
      const updatedState = this.orchestrator.getProjectState();
      if (updatedState) {
        this.dashboard.setProjectState(updatedState);
        this.dashboard.addEvent(
          `Restored to phase: ${payload.data.restored_phase}`,
          'info',
        );
      }
    });

    // Project lifecycle events
    this.orchestrator.on(EngineEvent.PROJECT_STARTED, (payload) => {
      const updatedState = this.orchestrator.getProjectState();
      if (updatedState) {
        this.dashboard.setProjectState(updatedState);
        this.dashboard.addEvent(
          `Project started at phase: ${payload.data.phase}`,
          'success',
        );
      }
    });

    this.orchestrator.on(EngineEvent.PROJECT_PAUSED, (payload) => {
      const updatedState = this.orchestrator.getProjectState();
      if (updatedState) {
        this.dashboard.setProjectState(updatedState);
        this.dashboard.addEvent(
          `Project paused: ${payload.data.reason}`,
          'warn',
        );
      }
    });

    this.orchestrator.on(EngineEvent.PROJECT_RESUMED, (payload) => {
      const updatedState = this.orchestrator.getProjectState();
      if (updatedState) {
        this.dashboard.setProjectState(updatedState);
        this.dashboard.addEvent(
          `Project resumed to phase: ${payload.data.resumed_to}`,
          'success',
        );
      }
    });

    this.orchestrator.on(EngineEvent.PROJECT_COMPLETED, (payload) => {
      const updatedState = this.orchestrator.getProjectState();
      if (updatedState) {
        this.dashboard.setProjectState(updatedState);
        this.dashboard.addEvent(
          `Project completed! Total tokens: ${payload.data.total_token_usage}`,
          'success',
        );
      }
    });

    this.orchestrator.on(EngineEvent.PROJECT_FAILED, (payload) => {
      const updatedState = this.orchestrator.getProjectState();
      if (updatedState) {
        this.dashboard.setProjectState(updatedState);
        this.dashboard.addEvent(
          `Project failed: ${payload.data.error}`,
          'error',
        );
      }
    });
  }

  /**
   * Set up graceful shutdown handlers for SIGINT and SIGTERM.
   */
  private setupShutdownHandlers(): void {
    const cleanup = () => {
      this.stop();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create a new DashboardMonitor instance.
 */
export function createMonitor(options: MonitorOptions): DashboardMonitor {
  return new DashboardMonitor(options);
}

// ============================================================
// Standalone CLI Entry Point (optional)
// ============================================================

/**
 * Run the dashboard monitor as a standalone process.
 * This function can be called directly or used as a CLI command.
 */
export async function runMonitor(options: MonitorOptions): Promise<void> {
  const monitor = createMonitor(options);

  try {
    await monitor.start();

    // Keep the process alive
    await new Promise(() => {
      // This will run until interrupted by SIGINT/SIGTERM
    });
  } catch (err) {
    console.error(`Monitor error: ${(err as Error).message}`);
    monitor.stop();
    process.exit(1);
  }
}
