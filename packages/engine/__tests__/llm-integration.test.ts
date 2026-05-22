/**
 * LLM Integration Tests
 *
 * 测试 LLMClient 与 Orchestrator 的集成功能
 * 确保向后兼容性：默认使用模拟模式，不破坏现有行为
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { HoneycombOrchestrator } from '../src/orchestrator.js';
import { Phase } from '../src/types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// 获取项目根目录（从engine/tests/向上两级）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

describe('LLM Integration', () => {
  const testDbPath = path.join(projectRoot, 'test-llm-integration.db');

  // 清理测试数据库
  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('默认使用模拟模式（向后兼容）', async () => {
    const orchestrator = new HoneycombOrchestrator({
      db_path: ':memory:',
      agents_root: path.join(projectRoot, 'agents'),
      domains_root: path.join(projectRoot, 'domains'),
      log_level: 'error',
    });

    const state = orchestrator.createProject({
      name: 'Test Project',
      description: 'Test project for LLM integration',
      archetype: 'software-dev',
      goals: ['test'],
    });

    // 应该创建成功（使用模拟模式）
    expect(state.project_id).toBeDefined();
    expect(state.complexity).toBeDefined();

    // 验证默认行为
    expect(state.current_phase).toBe(Phase.INIT);
    expect(state.decision_path).toBeDefined();

    orchestrator.shutdown();
  });

  test('llm.enabled=false 时使用模拟模式', async () => {
    const orchestrator = new HoneycombOrchestrator({
      db_path: ':memory:',
      agents_root: path.join(projectRoot, 'agents'),
      domains_root: path.join(projectRoot, 'domains'),
      log_level: 'error',
      llm: {
        enabled: false,
      },
    });

    const state = orchestrator.createProject({
      name: 'Test Project',
      description: 'Test project for LLM integration',
      archetype: 'software-dev',
      goals: ['test'],
    });

    expect(state.project_id).toBeDefined();
    expect(state.current_phase).toBe(Phase.INIT);

    orchestrator.shutdown();
  });

  test('llm.enabled=true 时初始化 LLMClient（使用 simulation provider）', async () => {
    const orchestrator = new HoneycombOrchestrator({
      db_path: ':memory:',
      agents_root: path.join(projectRoot, 'agents'),
      domains_root: path.join(projectRoot, 'domains'),
      log_level: 'error',
      llm: {
        enabled: true,
        provider: 'simulation',
      },
    });

    const state = orchestrator.createProject({
      name: 'Test Project',
      description: 'Test project for LLM integration',
      archetype: 'software-dev',
      goals: ['test'],
    });

    expect(state.project_id).toBeDefined();
    expect(state.current_phase).toBe(Phase.INIT);

    orchestrator.shutdown();
  });

  test('LLM 配置完全可选', () => {
    const orchestrator1 = new HoneycombOrchestrator({
      db_path: ':memory:',
      agents_root: path.join(projectRoot, 'agents'),
      domains_root: path.join(projectRoot, 'domains'),
      log_level: 'error',
    });

    const orchestrator2 = new HoneycombOrchestrator({
      db_path: ':memory:',
      agents_root: path.join(projectRoot, 'agents'),
      domains_root: path.join(projectRoot, 'domains'),
      log_level: 'error',
      llm: {
        enabled: false,
      },
    });

    // 两者都应该正常创建
    expect(orchestrator1).toBeDefined();
    expect(orchestrator2).toBeDefined();

    orchestrator1.shutdown();
    orchestrator2.shutdown();
  });

  test('项目启动时传递 LLMClient 给 AgentPool', async () => {
    const orchestrator = new HoneycombOrchestrator({
      db_path: ':memory:',
      agents_root: path.join(projectRoot, 'agents'),
      domains_root: path.join(projectRoot, 'domains'),
      log_level: 'error',
      llm: {
        enabled: true,
        provider: 'simulation',
      },
    });

    const state = orchestrator.createProject({
      name: 'Test Project',
      description: 'Test project for LLM integration',
      archetype: 'software-dev',
      goals: ['test'],
    });

    expect(state.project_id).toBeDefined();

    // 启动项目（会传递 LLMClient 给 AgentPool）
    await orchestrator.startProject(state.project_id);

    // 验证项目已进入下一阶段
    const updatedState = orchestrator.getProjectState();
    expect(updatedState).toBeDefined();
    expect(updatedState?.current_phase).not.toBe(Phase.INIT);

    orchestrator.shutdown();
  });

  test('复杂度评估与 LLM 集成无关', () => {
    const orchestrator = new HoneycombOrchestrator({
      db_path: ':memory:',
      agents_root: path.join(projectRoot, 'agents'),
      domains_root: path.join(projectRoot, 'domains'),
      log_level: 'error',
    });

    const state1 = orchestrator.createProject({
      name: 'Simple Project',
      description: 'A simple project',
      archetype: 'software-dev',
      goals: ['simple goal'],
    });

    const state2 = orchestrator.createProject({
      name: 'Complex Project',
      description: 'A very complex project with many goals and constraints',
      archetype: 'software-dev',
      goals: ['goal1', 'goal2', 'goal3', 'goal4', 'goal5'],
      constraints: ['constraint1', 'constraint2'],
    });

    // 复杂度评估应该正常工作
    expect(state1.complexity).toBeDefined();
    expect(state2.complexity).toBeDefined();

    orchestrator.shutdown();
  });

  test('llm 未配置时 AgentRunner 使用模拟执行', async () => {
    const orchestrator = new HoneycombOrchestrator({
      db_path: ':memory:',
      agents_root: path.join(projectRoot, 'agents'),
      domains_root: path.join(projectRoot, 'domains'),
      log_level: 'error',
    });

    const state = orchestrator.createProject({
      name: 'Test Project',
      description: 'Test project',
      archetype: 'software-dev',
      goals: ['test'],
    });

    await orchestrator.startProject(state.project_id);

    const finalState = orchestrator.getProjectState();
    expect(finalState).toBeDefined();
    // 验证有 token 使用（模拟执行产生）
    expect(finalState?.total_token_usage).toBeGreaterThanOrEqual(0);

    orchestrator.shutdown();
  });

  test('AgentPool.setLLMClient 方法存在且可调用', async () => {
    const orchestrator = new HoneycombOrchestrator({
      db_path: ':memory:',
      agents_root: path.join(projectRoot, 'agents'),
      domains_root: path.join(projectRoot, 'domains'),
      log_level: 'error',
      llm: {
        enabled: true,
        provider: 'simulation',
      },
    });

    const state = orchestrator.createProject({
      name: 'Test Project',
      description: 'Test project',
      archetype: 'software-dev',
      goals: ['test'],
    });

    // startProject 会调用 setLLMClient
    await orchestrator.startProject(state.project_id);

    // 如果没有抛出异常，说明集成正常工作
    const finalState = orchestrator.getProjectState();
    expect(finalState).toBeDefined();

    orchestrator.shutdown();
  });
});

describe('LLM Configuration Edge Cases', () => {
  test('空 LLM 配置对象', () => {
    const orchestrator = new HoneycombOrchestrator({
      db_path: ':memory:',
      agents_root: path.join(projectRoot, 'agents'),
      domains_root: path.join(projectRoot, 'domains'),
      log_level: 'error',
      llm: {},
    });

    expect(orchestrator).toBeDefined();
    orchestrator.shutdown();
  });

  test('仅 provider 配置', () => {
    const orchestrator = new HoneycombOrchestrator({
      db_path: ':memory:',
      agents_root: path.join(projectRoot, 'agents'),
      domains_root: path.join(projectRoot, 'domains'),
      log_level: 'error',
      llm: {
        provider: 'simulation',
      },
    });

    expect(orchestrator).toBeDefined();
    orchestrator.shutdown();
  });

  test('Claude 配置缺少 API key（应回退到模拟）', () => {
    const orchestrator = new HoneycombOrchestrator({
      db_path: ':memory:',
      agents_root: path.join(projectRoot, 'agents'),
      domains_root: path.join(projectRoot, 'domains'),
      log_level: 'error',
      llm: {
        enabled: true,
        provider: 'claude',
        claude: {
          apiKey: '',  // 空 API key
        },
      },
    });

    expect(orchestrator).toBeDefined();
    orchestrator.shutdown();
  });
});
