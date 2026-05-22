/**
 * Honeycomb v2 - 终端仪表板
 *
 * 用于可视化项目状态和指标的纯 ANSI 终端仪表板。
 * 零外部依赖 — 仅使用 Node.js 内置 API。
 *
 * @since v2.0.0
 */

import type { ProjectState, AgentState } from './types.js';
import { Phase, AgentStatus } from './types.js';
import type { MetricsCollector, MetricsSnapshot } from './metrics.js';

// ============================================================
// ANSI Utilities
// ============================================================

const ANSI = {
  // Colors
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Text colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',

  // Cursor control
  clearScreen: '\x1b[2J\x1b[H',
  clearLine: '\x1b[2K',
  home: '\x1b[H',

  // Box drawing characters (Unicode)
  box: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
    leftT: '├',
    rightT: '┤',
    topT: '┬',
    bottomT: '┴',
    cross: '┼',
  },
} as const;

// ============================================================
// ANSI Helper Functions
// ============================================================

/**
 * Apply bold style to text.
 */
function bold(text: string): string {
  return `${ANSI.bold}${text}${ANSI.reset}`;
}

/**
 * Apply dim style to text.
 */
function dim(text: string): string {
  return `${ANSI.dim}${text}${ANSI.reset}`;
}

/**
 * Apply color to text.
 */
function color(text: string, colorCode: string): string {
  return `${colorCode}${text}${ANSI.reset}`;
}

/**
 * Render a progress bar using block characters.
 * @param current Current value
 * @param total Total value
 * @param width Width in characters
 * @returns String representation of progress bar
 */
function progressBar(current: number, total: number, width: number = 20): string {
  if (total === 0) return '░'.repeat(width);

  const percentage = Math.max(0, Math.min(1, current / total));
  const filled = Math.floor(percentage * width);
  const empty = width - filled;

  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Render a box with title and content.
 * @param content Content lines (without borders)
 * @param title Optional title for the box
 * @param width Total width including borders
 * @returns Array of lines representing the box
 */
function box(content: string[], title?: string, width: number = 80): string[] {
  const innerWidth = width - 2; // Account for left and right borders
  const lines: string[] = [];

  // Top border with optional title
  if (title) {
    const titleText = ` ${title} `;
    const remainingWidth = innerWidth - titleText.length;
    const leftPad = Math.floor(remainingWidth / 2);
    const rightPad = remainingWidth - leftPad;

    lines.push(
      ANSI.box.topLeft +
      ANSI.box.horizontal.repeat(leftPad) +
      titleText +
      ANSI.box.horizontal.repeat(rightPad) +
      ANSI.box.topRight
    );
  } else {
    lines.push(
      ANSI.box.topLeft +
      ANSI.box.horizontal.repeat(innerWidth) +
      ANSI.box.topRight
    );
  }

  // Content lines
  for (const line of content) {
    const stripped = stripAnsi(line);
    const padding = Math.max(0, innerWidth - stripped.length);
    lines.push(ANSI.box.vertical + line + ' '.repeat(padding) + ANSI.box.vertical);
  }

  // Bottom border
  lines.push(
    ANSI.box.bottomLeft +
    ANSI.box.horizontal.repeat(innerWidth) +
    ANSI.box.bottomRight
  );

  return lines;
}

/**
 * Render a horizontal separator line.
 * @param title Optional title for the separator
 * @param width Total width including borders
 * @returns Separator line string
 */
function separator(title?: string, width: number = 80): string {
  const innerWidth = width - 2;

  if (title) {
    const titleText = ` ${title} `;
    const remainingWidth = innerWidth - titleText.length;
    const leftPad = Math.floor(remainingWidth / 2);
    const rightPad = remainingWidth - leftPad;

    return (
      ANSI.box.leftT +
      ANSI.box.horizontal.repeat(leftPad) +
      titleText +
      ANSI.box.horizontal.repeat(rightPad) +
      ANSI.box.rightT
    );
  }

  return (
    ANSI.box.leftT +
    ANSI.box.horizontal.repeat(innerWidth) +
    ANSI.box.rightT
  );
}

/**
 * Strip ANSI escape codes from a string for length calculation.
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Pad or truncate text to exact width.
 */
function padText(text: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
  const stripped = stripAnsi(text);
  const ansiCodes = text.replace(stripped, '');

  if (stripped.length > width) {
    return text.substring(0, width);
  }

  const padding = width - stripped.length;

  if (align === 'right') {
    return ' '.repeat(padding) + text;
  } else if (align === 'center') {
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
  } else {
    return text + ' '.repeat(padding);
  }
}

/**
 * Format a timestamp as HH:MM:SS.
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Format duration in milliseconds as human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Format large numbers with K/M suffixes.
 */
function formatNumber(num: number): string {
  if (num < 1000) return String(num);
  if (num < 1000000) return `${(num / 1000).toFixed(1)}K`;
  return `${(num / 1000000).toFixed(1)}M`;
}

// ============================================================
// Dashboard Configuration
// ============================================================

export interface DashboardOptions {
  /** Refresh interval in milliseconds (default: 1000) */
  refreshInterval?: number;

  /** Terminal width in characters (default: auto-detect or 80) */
  width?: number;

  /** Maximum number of events to keep in log (default: 50) */
  maxEvents?: number;

  /** Compact mode for narrow terminals (default: false) */
  compact?: boolean;

  /** Show checkpoint information (default: true) */
  showCheckpoints?: boolean;

  /** Show token budget bar (default: true) */
  showTokenBudget?: boolean;
}

// ============================================================
// Event Log Entry
// ============================================================

interface DashboardEvent {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

// ============================================================
// Dashboard Class
// ============================================================

export class Dashboard {
  private readonly width: number;
  private readonly maxEvents: number;
  private readonly compact: boolean;
  private readonly refreshInterval: number;
  private readonly showCheckpoints: boolean;
  private readonly showTokenBudget: boolean;

  private projectState: ProjectState | null = null;
  private metricsCollector: MetricsCollector | null = null;
  private checkpoints: Array<{ id: string; phase: Phase; timestamp: number; description: string }> = [];
  private events: DashboardEvent[] = [];
  private intervalHandle: NodeJS.Timeout | null = null;
  private lastRender: number = 0;
  private isRunning: boolean = false;

  constructor(options?: DashboardOptions) {
    this.width = options?.width ?? process.stdout.columns ?? 80;
    this.maxEvents = options?.maxEvents ?? 50;
    this.compact = options?.compact ?? false;
    this.refreshInterval = options?.refreshInterval ?? 1000;
    this.showCheckpoints = options?.showCheckpoints ?? true;
    this.showTokenBudget = options?.showTokenBudget ?? true;
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------

  /**
   * Start the dashboard with automatic periodic refresh.
   */
  start(): void {
    if (this.isRunning) {
      return; // Already running
    }

    this.isRunning = true;

    // Initial render
    this.renderAndDisplay();

    // Set up periodic refresh
    this.intervalHandle = setInterval(() => {
      if (this.isRunning) {
        this.renderAndDisplay();
      }
    }, this.refreshInterval);
  }

  /**
   * Stop the dashboard and restore terminal.
   */
  stop(): void {
    this.isRunning = false;

    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    // Clear screen and show cursor
    process.stdout.write(ANSI.clearScreen);
    process.stdout.write('\x1b[?25h'); // Show cursor
  }

  /**
   * Render the dashboard to a string (single frame).
   */
  render(): string {
    const lines: string[] = [];

    // Header
    lines.push(...this.renderHeader());

    // Phase progress
    if (this.projectState) {
      lines.push(separator('Phase Progress', this.width));
      lines.push(...this.renderPhaseProgress());

      // Token budget bar
      if (this.showTokenBudget) {
        lines.push(separator('Token Budget', this.width));
        lines.push(...this.renderTokenBudget());
      }
    }

    // Agent status
    if (this.projectState) {
      const agentStateCount = Object.keys(this.projectState.agent_states).length;
      const activeCount = this.projectState.active_agents.length;
      const title = activeCount > 0
        ? `Active Agents (${activeCount} running, ${agentStateCount} total)`
        : agentStateCount > 0
          ? `Agents (${agentStateCount} total)`
          : 'Agents';

      lines.push(separator(title, this.width));
      lines.push(...this.renderAgentStatus());
    }

    // Checkpoints
    if (this.showCheckpoints && this.checkpoints.length > 0) {
      lines.push(separator(`Checkpoints (${this.checkpoints.length})`, this.width));
      lines.push(...this.renderCheckpoints());
    }

    // Metrics
    if (this.metricsCollector) {
      lines.push(separator('System Metrics', this.width));
      lines.push(...this.renderMetrics());
    }

    // Event log
    if (this.events.length > 0) {
      lines.push(separator(`Recent Events (${this.events.length})`, this.width));
      lines.push(...this.renderEventLog());
    }

    // Footer with refresh info
    lines.push(separator(undefined, this.width));
    lines.push(...this.renderFooter());

    // Bottom border
    lines.push(
      ANSI.box.bottomLeft +
      ANSI.box.horizontal.repeat(this.width - 2) +
      ANSI.box.bottomRight
    );

    return lines.join('\n');
  }

  /**
   * Set the project state for the dashboard.
   */
  setProjectState(state: ProjectState): void {
    this.projectState = state;
  }

  /**
   * Set the metrics collector for the dashboard.
   */
  setMetrics(collector: MetricsCollector): void {
    this.metricsCollector = collector;
  }

  /**
   * Add an event to the dashboard log.
   */
  addEvent(message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info'): void {
    this.events.push({
      timestamp: Date.now(),
      level,
      message,
    });

    // Maintain max size (FIFO)
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  /**
   * Set checkpoint information for display.
   */
  setCheckpoints(checkpoints: Array<{ id: string; phase: Phase; timestamp: number; description: string }>): void {
    this.checkpoints = checkpoints;
  }

  // ----------------------------------------------------------
  // Private Rendering Methods
  // ----------------------------------------------------------

  /**
   * Render and display the dashboard (clears screen first).
   */
  private renderAndDisplay(): void {
    // Hide cursor
    process.stdout.write('\x1b[?25l');

    // Clear and render
    process.stdout.write(ANSI.clearScreen);
    process.stdout.write(this.render());

    this.lastRender = Date.now();
  }

  /**
   * Render the header section with project info.
   */
  private renderHeader(): string[] {
    const lines: string[] = [];
    const innerWidth = this.width - 2;

    if (!this.projectState) {
      // No project loaded
      const title = bold('Honeycomb v2 - Real-Time Dashboard');
      const titleLine = padText(title, innerWidth);
      const statusLine = padText(dim('No project loaded. Waiting for project data...'), innerWidth);
      const hintLine = padText(dim('Run: honeycomb start <project-id>'), innerWidth);

      return [
        ANSI.box.topLeft + ANSI.box.horizontal.repeat(innerWidth) + ANSI.box.topRight,
        ANSI.box.vertical + titleLine + ANSI.box.vertical,
        ANSI.box.vertical + statusLine + ANSI.box.vertical,
        ANSI.box.vertical + hintLine + ANSI.box.vertical,
      ];
    }

    // Project loaded - show detailed info
    const title = `${bold('Honeycomb v2')} ${dim('│')} ${this.projectState.project_name}`;
    const phase = color(this.projectState.current_phase.toUpperCase(), this.getPhaseColor(this.projectState.current_phase));
    const risk = color(this.projectState.risk_level.toUpperCase(), this.getRiskColor(this.projectState.risk_level));

    const line1 = `Project: ${bold(this.projectState.project_name)}    ID: ${dim(this.projectState.project_id.slice(0, 8))}`;
    const line2 = `Phase: ${phase}    Risk: ${risk}    Path: ${this.projectState.decision_path.toUpperCase()}    Complexity: ${this.projectState.complexity.toUpperCase()}`;

    // Add uptime if project has started
    let line3 = `Tokens: ${formatNumber(this.projectState.total_token_usage)} / ${formatNumber(this.projectState.token_budget)}`;
    if (this.projectState.started_at) {
      const uptime = Date.now() - this.projectState.started_at;
      line3 += `    Uptime: ${formatDuration(uptime)}`;
    }

    return [
      ANSI.box.topLeft +
        ANSI.box.horizontal.repeat(Math.floor((innerWidth - 13) / 2)) +
        ' Honeycomb v2 ' +
        ANSI.box.horizontal.repeat(Math.ceil((innerWidth - 13) / 2)) +
        ANSI.box.topRight,
      ANSI.box.vertical + ' ' + padText(line1, innerWidth - 1) + ANSI.box.vertical,
      ANSI.box.vertical + ' ' + padText(line2, innerWidth - 1) + ANSI.box.vertical,
      ANSI.box.vertical + ' ' + padText(line3, innerWidth - 1) + ANSI.box.vertical,
    ];
  }

  /**
   * Render phase progress visualization.
   */
  private renderPhaseProgress(): string[] {
    if (!this.projectState) return [];

    const lines: string[] = [];
    const innerWidth = this.width - 4; // Account for borders and padding

    // Phase sequence
    const phases: Phase[] = [
      Phase.INIT,
      Phase.RESEARCH,
      Phase.DECISION,
      Phase.EXECUTION,
      Phase.FEEDBACK,
      Phase.DELIVERY,
      Phase.COMPLETED,
    ];

    const currentIndex = phases.indexOf(this.projectState.current_phase);
    let phaseChain = '';

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const isComplete = i < currentIndex;
      const isCurrent = i === currentIndex;

      if (i > 0) phaseChain += ' → ';

      if (isComplete) {
        phaseChain += color(phase.toUpperCase() + ' ✓', ANSI.green);
      } else if (isCurrent) {
        phaseChain += color(`[${phase.toUpperCase()}]`, ANSI.yellow);
      } else {
        phaseChain += dim(phase.toUpperCase());
      }
    }

    lines.push(' ' + phaseChain);

    // Progress bar
    const progress = currentIndex / (phases.length - 1);
    const barWidth = Math.min(40, innerWidth - 10);
    const bar = progressBar(progress * 100, 100, barWidth);
    const percentage = `${Math.floor(progress * 100)}%`;

    lines.push(' ' + bar + '  ' + percentage);

    return lines;
  }

  /**
   * Render agent status table.
   */
  private renderAgentStatus(): string[] {
    if (!this.projectState) return [' ' + dim('No agents active')];

    const lines: string[] = [];

    // Get all agent states sorted by status (running first) then by name
    const agentEntries = Object.entries(this.projectState.agent_states);

    if (agentEntries.length === 0) {
      return [' ' + dim('No agents have been executed yet')];
    }

    // Sort: running > retrying > completed > failed > idle
    const statusPriority: Record<AgentStatus, number> = {
      [AgentStatus.RUNNING]: 0,
      [AgentStatus.RETRYING]: 1,
      [AgentStatus.COMPLETED]: 2,
      [AgentStatus.FAILED]: 3,
      [AgentStatus.IDLE]: 4,
    };

    agentEntries.sort((a, b) => {
      const priorityDiff = statusPriority[a[1].status] - statusPriority[b[1].status];
      if (priorityDiff !== 0) return priorityDiff;
      return a[0].localeCompare(b[0]);
    });

    // Limit display based on mode
    const displayLimit = this.compact ? 5 : 12;
    const agentsToShow = agentEntries.slice(0, displayLimit);

    for (const [agentName, agent] of agentsToShow) {
      // Agent name (truncated if needed)
      const maxNameLen = this.compact ? 15 : 25;
      const truncatedName = agentName.length > maxNameLen
        ? agentName.substring(0, maxNameLen - 3) + '...'
        : agentName;
      const name = padText(truncatedName, maxNameLen);

      // Status with color and icon
      const statusIcon = this.getStatusIcon(agent.status);
      const statusText = agent.status.toUpperCase();
      const statusColor = this.getAgentStatusColor(agent.status);
      const status = color(`${statusIcon} ${padText(statusText, 10)}`, statusColor);

      // Duration or retry info
      let durationInfo = '';
      if (agent.status === AgentStatus.RUNNING && agent.started_at) {
        const elapsed = Date.now() - agent.started_at;
        durationInfo = dim(`⏱ ${formatDuration(elapsed)}`);
      } else if (agent.status === AgentStatus.RETRYING) {
        durationInfo = color(`↻ retry ${agent.retry_count}`, ANSI.yellow);
      } else if (agent.completed_at && agent.started_at) {
        const duration = agent.completed_at - agent.started_at;
        durationInfo = dim(`✓ ${formatDuration(duration)}`);
      }

      // Token usage
      const tokens = dim(`${formatNumber(agent.token_usage)} tok`);

      // Compose line
      if (this.compact) {
        lines.push(` ${name} ${status} ${tokens}`);
      } else {
        lines.push(` ${name} ${status}  ${padText(durationInfo, 15)}  ${tokens}`);
      }
    }

    // Show count if more agents exist
    if (agentEntries.length > displayLimit) {
      const remaining = agentEntries.length - displayLimit;
      lines.push(' ' + dim(`... and ${remaining} more agent${remaining !== 1 ? 's' : ''}`));
    }

    // Show summary stats
    const stats = this.getAgentStats();
    const statsLine = ` ${color('●', ANSI.green)} ${stats.completed} completed  ${color('●', ANSI.red)} ${stats.failed} failed  ${color('●', ANSI.yellow)} ${stats.running} running`;
    lines.push('');
    lines.push(statsLine);

    return lines;
  }

  /**
   * Render metrics summary.
   */
  private renderMetrics(): string[] {
    if (!this.metricsCollector) return [];

    const lines: string[] = [];
    const snapshot: MetricsSnapshot = this.metricsCollector.snapshot();

    // Extract key metrics
    const phasesCompleted = Object.keys(snapshot.counters).filter(k => k.includes('phase_completed')).length;
    const agentsSpawned = snapshot.counters['agents_spawned'] ?? 0;
    const messagesSent = snapshot.counters['messages_sent'] ?? 0;
    const checkpoints = snapshot.counters['checkpoints_created'] ?? 0;

    // Build metrics lines
    const line1 = `Phases completed: ${phasesCompleted}    Agents spawned: ${agentsSpawned}`;
    const line2 = `Messages sent: ${messagesSent}    Checkpoints: ${checkpoints}`;

    // Add timer stats if available
    const avgPhaseTime = snapshot.timers['phase_duration']?.avg_ms;
    if (avgPhaseTime !== undefined) {
      const line3 = `Avg phase time: ${formatDuration(avgPhaseTime)}`;
      lines.push(` ${line1}`);
      lines.push(` ${line2}`);
      lines.push(` ${line3}`);
    } else {
      lines.push(` ${line1}`);
      lines.push(` ${line2}`);
    }

    return lines;
  }

  /**
   * Render token budget progress bar.
   */
  private renderTokenBudget(): string[] {
    if (!this.projectState) return [];

    const lines: string[] = [];
    const innerWidth = this.width - 4;

    const used = this.projectState.total_token_usage;
    const budget = this.projectState.token_budget;
    const percentage = budget > 0 ? (used / budget) * 100 : 0;

    // Progress bar
    const barWidth = Math.min(50, innerWidth - 20);
    const bar = progressBar(used, budget, barWidth);

    // Color the bar based on usage
    let barColor: string = ANSI.green;
    if (percentage > 90) {
      barColor = ANSI.red;
    } else if (percentage > 75) {
      barColor = ANSI.yellow;
    }

    const coloredBar = color(bar, barColor);
    const percentText = `${percentage.toFixed(1)}%`;
    const usageText = `${formatNumber(used)} / ${formatNumber(budget)} tokens`;

    lines.push(` ${coloredBar}  ${bold(percentText)}`);
    lines.push(` ${usageText}`);

    // Warning if approaching limit
    if (percentage > 90) {
      lines.push(' ' + color('⚠ Warning: Approaching token budget limit', ANSI.red));
    }

    return lines;
  }

  /**
   * Render checkpoints list.
   */
  private renderCheckpoints(): string[] {
    if (this.checkpoints.length === 0) {
      return [' ' + dim('No checkpoints created yet')];
    }

    const lines: string[] = [];
    const displayLimit = this.compact ? 3 : 5;
    const checkpointsToShow = this.checkpoints.slice(-displayLimit).reverse();

    for (const cp of checkpointsToShow) {
      const id = cp.id.slice(0, 8);
      const time = formatTime(cp.timestamp);
      const phaseColor = this.getPhaseColor(cp.phase);
      const phase = color(cp.phase.toUpperCase(), phaseColor);
      const desc = cp.description.length > 40
        ? cp.description.substring(0, 37) + '...'
        : cp.description;

      lines.push(` ${dim(id)}  ${phase}  ${dim(time)}  ${desc}`);
    }

    if (this.checkpoints.length > displayLimit) {
      const remaining = this.checkpoints.length - displayLimit;
      lines.push(' ' + dim(`... and ${remaining} earlier checkpoint${remaining !== 1 ? 's' : ''}`));
    }

    return lines;
  }

  /**
   * Render recent events log.
   */
  private renderEventLog(): string[] {
    const lines: string[] = [];
    const innerWidth = this.width - 4;

    // Show most recent events (up to 5 in compact mode, 15 otherwise)
    const displayCount = this.compact ? 5 : 15;
    const recentEvents = this.events.slice(-displayCount);

    for (const event of recentEvents) {
      const time = color(`[${formatTime(event.timestamp)}]`, ANSI.gray);

      // Level indicator with color
      const levelIcon = this.getLevelIcon(event.level);
      const levelColor = this.getLevelColor(event.level);
      const levelIndicator = color(levelIcon, levelColor);

      const message = event.message;

      // Truncate message if too long
      const maxMessageLen = innerWidth - 15;
      const truncated = message.length > maxMessageLen
        ? message.substring(0, maxMessageLen - 3) + '...'
        : message;

      lines.push(` ${time} ${levelIndicator} ${truncated}`);
    }

    if (this.events.length === 0) {
      lines.push(' ' + dim('No events yet'));
    }

    return lines;
  }

  /**
   * Render footer with refresh info.
   */
  private renderFooter(): string[] {
    const innerWidth = this.width - 2;
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    const refreshInfo = `Last updated: ${timeStr} | Refresh: ${this.refreshInterval}ms | Press Ctrl+C to exit`;

    const footerLine = padText(dim(refreshInfo), innerWidth);
    return [ANSI.box.vertical + footerLine + ANSI.box.vertical];
  }

  // ----------------------------------------------------------
  // Color Helpers
  // ----------------------------------------------------------

  /**
   * Get ANSI color for a phase.
   */
  private getPhaseColor(phase: Phase): string {
    switch (phase) {
      case Phase.INIT:
        return ANSI.cyan;
      case Phase.RESEARCH:
        return ANSI.blue;
      case Phase.DECISION:
        return ANSI.magenta;
      case Phase.EXECUTION:
        return ANSI.yellow;
      case Phase.FEEDBACK:
        return ANSI.cyan;
      case Phase.DELIVERY:
        return ANSI.green;
      case Phase.COMPLETED:
        return ANSI.green;
      case Phase.FAILED:
        return ANSI.red;
      case Phase.PAUSED:
        return ANSI.gray;
      default:
        return ANSI.white;
    }
  }

  /**
   * Get ANSI color for a risk level.
   */
  private getRiskColor(risk: string): string {
    if (risk.includes('very_low') || risk.includes('low')) return ANSI.green;
    if (risk.includes('medium')) return ANSI.yellow;
    if (risk.includes('high')) return ANSI.red;
    if (risk.includes('critical')) return ANSI.red + ANSI.bold;
    return ANSI.white;
  }

  /**
   * Get ANSI color for an agent status.
   */
  private getAgentStatusColor(status: AgentStatus): string {
    switch (status) {
      case AgentStatus.IDLE:
        return ANSI.gray;
      case AgentStatus.RUNNING:
        return ANSI.green;
      case AgentStatus.COMPLETED:
        return ANSI.blue;
      case AgentStatus.FAILED:
        return ANSI.red;
      case AgentStatus.RETRYING:
        return ANSI.yellow;
      default:
        return ANSI.white;
    }
  }

  /**
   * Get status icon for an agent status.
   */
  private getStatusIcon(status: AgentStatus): string {
    switch (status) {
      case AgentStatus.IDLE:
        return '○';
      case AgentStatus.RUNNING:
        return '●';
      case AgentStatus.COMPLETED:
        return '✓';
      case AgentStatus.FAILED:
        return '✗';
      case AgentStatus.RETRYING:
        return '↻';
      default:
        return '?';
    }
  }

  /**
   * Get level icon for event level.
   */
  private getLevelIcon(level: 'info' | 'warn' | 'error' | 'success'): string {
    switch (level) {
      case 'info':
        return 'ℹ';
      case 'warn':
        return '⚠';
      case 'error':
        return '✗';
      case 'success':
        return '✓';
      default:
        return '•';
    }
  }

  /**
   * Get color for event level.
   */
  private getLevelColor(level: 'info' | 'warn' | 'error' | 'success'): string {
    switch (level) {
      case 'info':
        return ANSI.cyan;
      case 'warn':
        return ANSI.yellow;
      case 'error':
        return ANSI.red;
      case 'success':
        return ANSI.green;
      default:
        return ANSI.white;
    }
  }

  /**
   * Get agent statistics summary.
   */
  private getAgentStats(): { completed: number; failed: number; running: number; total: number } {
    if (!this.projectState) {
      return { completed: 0, failed: 0, running: 0, total: 0 };
    }

    const agents = Object.values(this.projectState.agent_states);
    return {
      completed: agents.filter(a => a.status === AgentStatus.COMPLETED).length,
      failed: agents.filter(a => a.status === AgentStatus.FAILED).length,
      running: agents.filter(a => a.status === AgentStatus.RUNNING || a.status === AgentStatus.RETRYING).length,
      total: agents.length,
    };
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create a new Dashboard instance.
 */
export function createDashboard(options?: DashboardOptions): Dashboard {
  return new Dashboard(options);
}
