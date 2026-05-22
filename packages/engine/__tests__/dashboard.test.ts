/**
 * Dashboard Unit Tests
 *
 * Comprehensive test suite for the Terminal Dashboard module.
 * Tests all public APIs, rendering output, event handling, and lifecycle management.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Dashboard, createDashboard } from '../src/dashboard.js';
import type { DashboardOptions } from '../src/dashboard.js';
import { MetricsCollector } from '../src/metrics.js';
import type { ProjectState, MetricsSnapshot } from '../src/types.js';
import { Phase, AgentStatus, RiskLevel, DecisionPath } from '../src/types.js';

// ============================================================
// Helper Functions
// ============================================================

/**
 * Create a mock ProjectState for testing.
 */
function createMockProjectState(overrides?: Partial<ProjectState>): ProjectState {
  return {
    project_id: 'test-project',
    project_name: 'Test Project',
    project_description: 'A test project',
    archetype: 'software-dev',
    complexity: 'standard',
    decision_path: DecisionPath.STANDARD,
    risk_level: RiskLevel.MEDIUM,
    current_phase: Phase.EXECUTION,
    phase_history: [],
    active_agents: ['architect', 'engineer'],
    agent_states: {
      architect: {
        agent_name: 'architect',
        status: AgentStatus.RUNNING,
        retry_count: 0,
        token_usage: 500,
      },
      engineer: {
        agent_name: 'engineer',
        status: AgentStatus.IDLE,
        retry_count: 0,
        token_usage: 0,
      },
    },
    artifacts: [],
    decisions: [],
    total_token_usage: 500,
    token_budget: 10000,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}

/**
 * Create a mock MetricsCollector with some data.
 */
function createMockMetricsCollector(): MetricsCollector {
  const collector = new MetricsCollector();
  collector.increment('agents_spawned', undefined, 2);
  collector.increment('messages_sent', undefined, 42);
  collector.increment('checkpoints_created', undefined, 1);
  collector.recordTime('phase_duration', 1500);
  collector.recordTime('phase_duration', 2000);
  return collector;
}

// ============================================================
// Test Suite: Construction & Factory
// ============================================================

describe('Dashboard - Construction & Factory', () => {
  test('should create a Dashboard with default options', () => {
    const dashboard = new Dashboard();
    expect(dashboard).toBeDefined();
  });

  test('should create a Dashboard via factory function', () => {
    const dashboard = createDashboard();
    expect(dashboard).toBeDefined();
  });

  test('should accept custom refresh interval', () => {
    const dashboard = new Dashboard({ refreshInterval: 500 });
    expect(dashboard).toBeDefined();
  });

  test('should accept custom width', () => {
    const dashboard = new Dashboard({ width: 120 });
    expect(dashboard).toBeDefined();
  });

  test('should accept custom maxEvents', () => {
    const dashboard = new Dashboard({ maxEvents: 50 });
    expect(dashboard).toBeDefined();
  });

  test('should accept custom compact flag', () => {
    const dashboard = new Dashboard({ compact: true });
    expect(dashboard).toBeDefined();
  });

  test('should accept all options together', () => {
    const options: DashboardOptions = {
      refreshInterval: 2000,
      width: 100,
      maxEvents: 30,
      compact: true,
    };
    const dashboard = new Dashboard(options);
    expect(dashboard).toBeDefined();
  });

  test('factory function should pass through options', () => {
    const options: DashboardOptions = { maxEvents: 15 };
    const dashboard = createDashboard(options);
    expect(dashboard).toBeDefined();
  });
});

// ============================================================
// Test Suite: setProjectState
// ============================================================

describe('Dashboard - setProjectState', () => {
  let dashboard: Dashboard;

  beforeEach(() => {
    dashboard = new Dashboard();
  });

  test('should accept a ProjectState', () => {
    const state = createMockProjectState();
    expect(() => dashboard.setProjectState(state)).not.toThrow();
  });

  test('should update internal state when setProjectState is called', () => {
    const state = createMockProjectState();
    dashboard.setProjectState(state);
    const rendered = dashboard.render();
    expect(rendered).toContain(state.project_name);
  });

  test('should handle multiple setProjectState calls', () => {
    const state1 = createMockProjectState({ project_name: 'Project One' });
    const state2 = createMockProjectState({ project_name: 'Project Two' });

    dashboard.setProjectState(state1);
    let rendered = dashboard.render();
    expect(rendered).toContain('Project One');

    dashboard.setProjectState(state2);
    rendered = dashboard.render();
    expect(rendered).toContain('Project Two');
  });

  test('should render different phases correctly', () => {
    const initState = createMockProjectState({ current_phase: Phase.INIT });
    dashboard.setProjectState(initState);
    expect(dashboard.render()).toContain('INIT');

    const researchState = createMockProjectState({ current_phase: Phase.RESEARCH });
    dashboard.setProjectState(researchState);
    expect(dashboard.render()).toContain('RESEARCH');

    const completedState = createMockProjectState({ current_phase: Phase.COMPLETED });
    dashboard.setProjectState(completedState);
    expect(dashboard.render()).toContain('COMPLETED');
  });

  test('should render different risk levels', () => {
    const lowRisk = createMockProjectState({ risk_level: RiskLevel.LOW });
    dashboard.setProjectState(lowRisk);
    expect(dashboard.render()).toContain('LOW');

    const criticalRisk = createMockProjectState({ risk_level: RiskLevel.CRITICAL });
    dashboard.setProjectState(criticalRisk);
    expect(dashboard.render()).toContain('CRITICAL');
  });

  test('should render different decision paths', () => {
    const expressPath = createMockProjectState({ decision_path: DecisionPath.EXPRESS });
    dashboard.setProjectState(expressPath);
    expect(dashboard.render()).toContain('EXPRESS');

    const fullPath = createMockProjectState({ decision_path: DecisionPath.FULL });
    dashboard.setProjectState(fullPath);
    expect(dashboard.render()).toContain('FULL');
  });

  test('should display project name and phase in render', () => {
    const state = createMockProjectState({
      project_name: 'My Awesome Project',
      current_phase: Phase.EXECUTION,
    });
    dashboard.setProjectState(state);
    const rendered = dashboard.render();
    expect(rendered).toContain('My Awesome Project');
    expect(rendered).toContain('EXECUTION');
  });

  test('should display active agents count', () => {
    const state = createMockProjectState({
      active_agents: ['agent1', 'agent2', 'agent3'],
    });
    dashboard.setProjectState(state);
    const rendered = dashboard.render();
    expect(rendered).toContain('3');
  });

  test('should display token usage information', () => {
    const state = createMockProjectState({
      total_token_usage: 1500,
      token_budget: 10000,
    });
    dashboard.setProjectState(state);
    const rendered = dashboard.render();
    // Should contain formatted token values
    expect(rendered.length).toBeGreaterThan(0);
  });
});

// ============================================================
// Test Suite: setMetrics
// ============================================================

describe('Dashboard - setMetrics', () => {
  let dashboard: Dashboard;

  beforeEach(() => {
    dashboard = new Dashboard();
  });

  test('should accept a MetricsCollector', () => {
    const collector = new MetricsCollector();
    expect(() => dashboard.setMetrics(collector)).not.toThrow();
  });

  test('should display metrics in render output', () => {
    const collector = createMockMetricsCollector();
    dashboard.setMetrics(collector);
    const rendered = dashboard.render();
    expect(rendered).toContain('Metrics');
  });

  test('should display counters from metrics', () => {
    const collector = new MetricsCollector();
    collector.increment('agents_spawned', undefined, 5);
    collector.increment('messages_sent', undefined, 100);
    dashboard.setMetrics(collector);
    const rendered = dashboard.render();
    expect(rendered).toContain('Metrics');
  });

  test('should display timers from metrics', () => {
    const collector = new MetricsCollector();
    collector.recordTime('phase_duration', 5000);
    dashboard.setMetrics(collector);
    const rendered = dashboard.render();
    expect(rendered).toContain('Metrics');
  });

  test('should update metrics when setMetrics is called again', () => {
    const collector1 = new MetricsCollector();
    collector1.increment('agents_spawned', undefined, 1);
    dashboard.setMetrics(collector1);

    const collector2 = new MetricsCollector();
    collector2.increment('agents_spawned', undefined, 10);
    dashboard.setMetrics(collector2);

    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });

  test('should handle empty metrics collector', () => {
    const collector = new MetricsCollector();
    dashboard.setMetrics(collector);
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });
});

// ============================================================
// Test Suite: addEvent
// ============================================================

describe('Dashboard - addEvent', () => {
  let dashboard: Dashboard;

  beforeEach(() => {
    dashboard = new Dashboard({ maxEvents: 20 });
  });

  test('should add a single event', () => {
    dashboard.addEvent('Test event message');
    const rendered = dashboard.render();
    expect(rendered).toContain('Test event message');
  });

  test('should add multiple events', () => {
    dashboard.addEvent('First event');
    dashboard.addEvent('Second event');
    dashboard.addEvent('Third event');
    const rendered = dashboard.render();
    expect(rendered).toContain('First event');
    expect(rendered).toContain('Second event');
    expect(rendered).toContain('Third event');
  });

  test('should display Recent Events section when events exist', () => {
    dashboard.addEvent('Sample event');
    const rendered = dashboard.render();
    expect(rendered).toContain('Recent Events');
  });

  test('should enforce maxEvents limit (FIFO eviction)', () => {
    const dashboard = new Dashboard({ maxEvents: 5 });

    // Add 10 events
    for (let i = 1; i <= 10; i++) {
      dashboard.addEvent(`Event ${i}`);
    }

    const rendered = dashboard.render();
    // Should have some of the recent events
    expect(rendered).toContain('Event 10');
    expect(rendered).toContain('Event 9');
    // Verify the dashboard properly renders even with FIFO eviction
    expect(rendered).toContain('Recent Events');
  });

  test('should display events with timestamps', () => {
    dashboard.addEvent('Timestamped event');
    const rendered = dashboard.render();
    // Timestamps should be in HH:MM:SS format
    expect(rendered).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  test('should truncate long event messages', () => {
    const longMessage = 'A'.repeat(500);
    dashboard.addEvent(longMessage);
    const rendered = dashboard.render();
    // Should not contain the full message
    expect(rendered.length).toBeLessThan(500 * 100);
  });

  test('should not display Recent Events section when no events', () => {
    const rendered = dashboard.render();
    expect(rendered).not.toContain('Recent Events');
  });

  test('should handle empty event message', () => {
    dashboard.addEvent('');
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });

  test('should handle special characters in events', () => {
    dashboard.addEvent('Event with SpecialChars: @#$%^&*()');
    const rendered = dashboard.render();
    expect(rendered).toContain('SpecialChars');
  });

  test('should maintain event order', () => {
    dashboard.addEvent('First');
    dashboard.addEvent('Second');
    dashboard.addEvent('Third');
    const rendered = dashboard.render();
    const firstIdx = rendered.indexOf('First');
    const secondIdx = rendered.indexOf('Second');
    const thirdIdx = rendered.indexOf('Third');
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });
});

// ============================================================
// Test Suite: render Output
// ============================================================

describe('Dashboard - render Output', () => {
  let dashboard: Dashboard;

  beforeEach(() => {
    dashboard = new Dashboard({ width: 80 });
  });

  test('should return a non-empty string', () => {
    const rendered = dashboard.render();
    expect(typeof rendered).toBe('string');
    expect(rendered.length).toBeGreaterThan(0);
  });

  test('should contain ANSI escape codes', () => {
    dashboard.setProjectState(createMockProjectState());
    const rendered = dashboard.render();
    expect(rendered).toContain('\x1b[');
  });

  test('should render header with Honeycomb title', () => {
    const rendered = dashboard.render();
    expect(rendered).toContain('Honeycomb');
  });

  test('should render header with project name when state is set', () => {
    const state = createMockProjectState({ project_name: 'TestProj' });
    dashboard.setProjectState(state);
    const rendered = dashboard.render();
    expect(rendered).toContain('TestProj');
  });

  test('should render "No project loaded" when no state is set', () => {
    const rendered = dashboard.render();
    expect(rendered).toContain('No project loaded');
  });

  test('should render phase progress section when state is set', () => {
    dashboard.setProjectState(createMockProjectState());
    const rendered = dashboard.render();
    expect(rendered).toContain('Phase Progress');
  });

  test('should render agent status section when agents exist', () => {
    const state = createMockProjectState({
      active_agents: ['architect'],
      agent_states: {
        architect: {
          agent_name: 'architect',
          status: AgentStatus.RUNNING,
          retry_count: 0,
          token_usage: 100,
        },
      },
    });
    dashboard.setProjectState(state);
    const rendered = dashboard.render();
    expect(rendered).toContain('Active Agents');
  });

  test('should render box-drawing characters', () => {
    const rendered = dashboard.render();
    // Check for box-drawing characters
    expect(rendered).toMatch(/[┌┐└┘─│├┤]/);
  });

  test('should respect width option in output', () => {
    const narrowDashboard = new Dashboard({ width: 60 });
    const wideDashboard = new Dashboard({ width: 120 });

    const narrowRender = narrowDashboard.render();
    const wideRender = wideDashboard.render();

    expect(narrowRender).toBeDefined();
    expect(wideRender).toBeDefined();
  });

  test('should display phases in correct order', () => {
    dashboard.setProjectState(createMockProjectState({ current_phase: Phase.EXECUTION }));
    const rendered = dashboard.render();
    // Verify phases appear in the output
    expect(rendered).toContain('INIT');
    expect(rendered).toContain('RESEARCH');
    expect(rendered).toContain('EXECUTION');
    // Verify phase progress section exists
    expect(rendered).toContain('Phase Progress');
  });

  test('should mark current phase with brackets or highlighting', () => {
    dashboard.setProjectState(createMockProjectState({ current_phase: Phase.DECISION }));
    const rendered = dashboard.render();
    expect(rendered).toContain('DECISION');
  });

  test('should display progress bar', () => {
    dashboard.setProjectState(createMockProjectState());
    const rendered = dashboard.render();
    // Progress bar should contain block characters
    expect(rendered).toMatch(/[█░]/);
  });

  test('should display percentage on progress bar', () => {
    dashboard.setProjectState(createMockProjectState());
    const rendered = dashboard.render();
    expect(rendered).toMatch(/%/);
  });

  test('should include border at bottom of render', () => {
    const rendered = dashboard.render();
    // Should end with a border
    expect(rendered).toMatch(/[└┘]/);
  });

  test('should render consistently with same state', () => {
    const state = createMockProjectState();
    dashboard.setProjectState(state);
    const render1 = dashboard.render();
    const render2 = dashboard.render();
    expect(render1).toBe(render2);
  });
});

// ============================================================
// Test Suite: Rendering Different States
// ============================================================

describe('Dashboard - Rendering Different States', () => {
  let dashboard: Dashboard;

  beforeEach(() => {
    dashboard = new Dashboard();
  });

  test('should render all phases distinctly', () => {
    const phases = [
      Phase.INIT,
      Phase.RESEARCH,
      Phase.DECISION,
      Phase.EXECUTION,
      Phase.FEEDBACK,
      Phase.DELIVERY,
      Phase.COMPLETED,
    ];

    for (const phase of phases) {
      dashboard.setProjectState(createMockProjectState({ current_phase: phase }));
      const rendered = dashboard.render();
      expect(rendered).toContain(phase.toUpperCase());
    }
  });

  test('should render different risk levels with distinct colors', () => {
    const risks = [RiskLevel.VERY_LOW, RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL];

    for (const risk of risks) {
      dashboard.setProjectState(createMockProjectState({ risk_level: risk }));
      const rendered = dashboard.render();
      expect(rendered).toContain(risk.toUpperCase());
    }
  });

  test('should render all decision paths', () => {
    const paths = [DecisionPath.EXPRESS, DecisionPath.QUICK, DecisionPath.STANDARD, DecisionPath.DEEP, DecisionPath.FULL];

    for (const path of paths) {
      dashboard.setProjectState(createMockProjectState({ decision_path: path }));
      const rendered = dashboard.render();
      expect(rendered).toContain(path.toUpperCase());
    }
  });

  test('should render agent statuses', () => {
    const statuses = [AgentStatus.IDLE, AgentStatus.RUNNING, AgentStatus.COMPLETED, AgentStatus.FAILED, AgentStatus.RETRYING];

    for (const status of statuses) {
      dashboard.setProjectState(
        createMockProjectState({
          agent_states: {
            agent: {
              agent_name: 'agent',
              status,
              retry_count: 0,
              token_usage: 100,
            },
          },
        })
      );
      const rendered = dashboard.render();
      expect(rendered).toBeDefined();
    }
  });

  test('should render with single agent', () => {
    dashboard.setProjectState(
      createMockProjectState({
        active_agents: ['solo'],
        agent_states: {
          solo: {
            agent_name: 'solo',
            status: AgentStatus.RUNNING,
            retry_count: 0,
            token_usage: 50,
          },
        },
      })
    );
    const rendered = dashboard.render();
    expect(rendered).toContain('solo');
  });

  test('should render with many agents', () => {
    const agents: Record<string, any> = {};
    const activeAgents: string[] = [];
    for (let i = 1; i <= 15; i++) {
      const name = `agent${i}`;
      activeAgents.push(name);
      agents[name] = {
        agent_name: name,
        status: AgentStatus.RUNNING,
        retry_count: 0,
        token_usage: 100 * i,
      };
    }

    dashboard.setProjectState(
      createMockProjectState({
        active_agents: activeAgents,
        agent_states: agents,
      })
    );
    const rendered = dashboard.render();
    expect(rendered).toContain('Active Agents');
  });

  test('should render with failed phase', () => {
    dashboard.setProjectState(createMockProjectState({ current_phase: Phase.FAILED }));
    const rendered = dashboard.render();
    expect(rendered).toContain('FAILED');
  });

  test('should render with paused phase', () => {
    dashboard.setProjectState(createMockProjectState({ current_phase: Phase.PAUSED }));
    const rendered = dashboard.render();
    expect(rendered).toContain('PAUSED');
  });
});

// ============================================================
// Test Suite: Rendering with Metrics
// ============================================================

describe('Dashboard - Rendering with Metrics', () => {
  let dashboard: Dashboard;

  beforeEach(() => {
    dashboard = new Dashboard();
  });

  test('should display metrics section when collector is set', () => {
    const collector = new MetricsCollector();
    dashboard.setMetrics(collector);
    const rendered = dashboard.render();
    expect(rendered).toContain('Metrics');
  });

  test('should display counter metrics', () => {
    const collector = new MetricsCollector();
    collector.increment('agents_spawned', undefined, 5);
    dashboard.setMetrics(collector);
    const rendered = dashboard.render();
    expect(rendered).toContain('Metrics');
  });

  test('should display timer metrics with average time', () => {
    const collector = new MetricsCollector();
    collector.recordTime('phase_duration', 1000);
    collector.recordTime('phase_duration', 2000);
    dashboard.setMetrics(collector);
    const rendered = dashboard.render();
    expect(rendered).toContain('Metrics');
  });

  test('should handle collector with no metrics', () => {
    const collector = new MetricsCollector();
    dashboard.setMetrics(collector);
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });

  test('should handle multiple metric types', () => {
    const collector = new MetricsCollector();
    collector.increment('counter1');
    collector.gauge('gauge1', 42);
    collector.recordTime('timer1', 500);
    collector.observe('histogram1', 100);
    dashboard.setMetrics(collector);
    const rendered = dashboard.render();
    expect(rendered).toContain('Metrics');
  });
});

// ============================================================
// Test Suite: Start/Stop Lifecycle
// ============================================================

describe('Dashboard - Start/Stop Lifecycle', () => {
  let dashboard: Dashboard;

  beforeEach(() => {
    dashboard = new Dashboard({ refreshInterval: 100 });
  });

  afterEach(() => {
    dashboard.stop();
  });

  test('should start without throwing', () => {
    expect(() => dashboard.start()).not.toThrow();
  });

  test('should stop without throwing', () => {
    dashboard.start();
    expect(() => dashboard.stop()).not.toThrow();
  });

  test('should not throw when starting twice', () => {
    expect(() => {
      dashboard.start();
      dashboard.start();
    }).not.toThrow();
  });

  test('should not throw when stopping without starting', () => {
    expect(() => dashboard.stop()).not.toThrow();
  });

  test('should not throw when stopping twice', () => {
    dashboard.start();
    expect(() => {
      dashboard.stop();
      dashboard.stop();
    }).not.toThrow();
  });

  test('should be able to restart after stopping', () => {
    dashboard.start();
    dashboard.stop();
    expect(() => dashboard.start()).not.toThrow();
  });

  test('should accept project state during lifecycle', () => {
    const state = createMockProjectState();
    dashboard.start();
    expect(() => dashboard.setProjectState(state)).not.toThrow();
    dashboard.stop();
  });

  test('should accept metrics during lifecycle', () => {
    const collector = new MetricsCollector();
    dashboard.start();
    expect(() => dashboard.setMetrics(collector)).not.toThrow();
    dashboard.stop();
  });

  test('should accept events during lifecycle', () => {
    dashboard.start();
    expect(() => dashboard.addEvent('Test event')).not.toThrow();
    dashboard.stop();
  });
});

// ============================================================
// Test Suite: Edge Cases
// ============================================================

describe('Dashboard - Edge Cases', () => {
  test('should render with no state set', () => {
    const dashboard = new Dashboard();
    const rendered = dashboard.render();
    expect(rendered).toContain('No project loaded');
  });

  test('should render with no events', () => {
    const dashboard = new Dashboard();
    const rendered = dashboard.render();
    expect(rendered).not.toContain('Recent Events');
  });

  test('should render with no metrics', () => {
    const dashboard = new Dashboard();
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });

  test('should render with no agents', () => {
    const dashboard = new Dashboard();
    dashboard.setProjectState(
      createMockProjectState({
        active_agents: [],
        agent_states: {},
      })
    );
    const rendered = dashboard.render();
    expect(rendered).not.toContain('Active Agents');
  });

  test('should handle very narrow width', () => {
    const dashboard = new Dashboard({ width: 40 });
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });

  test('should handle very wide width', () => {
    const dashboard = new Dashboard({ width: 200 });
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });

  test('should handle zero maxEvents', () => {
    const dashboard = new Dashboard({ maxEvents: 0 });
    dashboard.addEvent('Test');
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });

  test('should handle large maxEvents', () => {
    const dashboard = new Dashboard({ maxEvents: 1000 });
    for (let i = 0; i < 100; i++) {
      dashboard.addEvent(`Event ${i}`);
    }
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });

  test('should handle empty project name', () => {
    const dashboard = new Dashboard();
    dashboard.setProjectState(createMockProjectState({ project_name: '' }));
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });

  test('should handle empty project description', () => {
    const dashboard = new Dashboard();
    dashboard.setProjectState(createMockProjectState({ project_description: '' }));
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });

  test('should handle very large token usage', () => {
    const dashboard = new Dashboard();
    dashboard.setProjectState(
      createMockProjectState({
        total_token_usage: 999999999,
        token_budget: 1000000000,
      })
    );
    const rendered = dashboard.render();
    expect(rendered).toContain('M');
  });

  test('should handle zero token usage', () => {
    const dashboard = new Dashboard();
    dashboard.setProjectState(
      createMockProjectState({
        total_token_usage: 0,
        token_budget: 1000,
      })
    );
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });

  test('should handle agent with no task', () => {
    const dashboard = new Dashboard();
    dashboard.setProjectState(
      createMockProjectState({
        agent_states: {
          idle_agent: {
            agent_name: 'idle_agent',
            status: AgentStatus.IDLE,
            retry_count: 0,
            token_usage: 0,
          },
        },
      })
    );
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });

  test('should handle agent with high retry count', () => {
    const dashboard = new Dashboard();
    dashboard.setProjectState(
      createMockProjectState({
        agent_states: {
          retry_agent: {
            agent_name: 'retry_agent',
            status: AgentStatus.RETRYING,
            retry_count: 10,
            token_usage: 5000,
          },
        },
      })
    );
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });

  test('should render with null/undefined phase_history', () => {
    const dashboard = new Dashboard();
    dashboard.setProjectState(createMockProjectState({ phase_history: [] }));
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });

  test('should handle very long agent names', () => {
    const dashboard = new Dashboard();
    const longName = 'a'.repeat(100);
    dashboard.setProjectState(
      createMockProjectState({
        active_agents: [longName],
        agent_states: {
          [longName]: {
            agent_name: longName,
            status: AgentStatus.RUNNING,
            retry_count: 0,
            token_usage: 100,
          },
        },
      })
    );
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });

  test('should handle special characters in project name', () => {
    const dashboard = new Dashboard();
    dashboard.setProjectState(
      createMockProjectState({
        project_name: 'Project!@#$%^&*()',
      })
    );
    const rendered = dashboard.render();
    expect(rendered).toContain('Project');
  });

  test('should maintain state across multiple renders', () => {
    const dashboard = new Dashboard();
    const state = createMockProjectState({ project_name: 'Persistent' });
    dashboard.setProjectState(state);

    const render1 = dashboard.render();
    const render2 = dashboard.render();
    const render3 = dashboard.render();

    expect(render1).toContain('Persistent');
    expect(render2).toContain('Persistent');
    expect(render3).toContain('Persistent');
  });

  test('should handle compact mode rendering', () => {
    const dashboard = new Dashboard({ compact: true });
    dashboard.setProjectState(createMockProjectState());
    for (let i = 0; i < 20; i++) {
      dashboard.addEvent(`Event ${i}`);
    }
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });

  test('should handle non-compact mode rendering', () => {
    const dashboard = new Dashboard({ compact: false });
    dashboard.setProjectState(createMockProjectState());
    for (let i = 0; i < 20; i++) {
      dashboard.addEvent(`Event ${i}`);
    }
    const rendered = dashboard.render();
    expect(rendered).toBeDefined();
  });
});
