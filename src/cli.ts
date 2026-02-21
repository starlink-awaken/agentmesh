#!/usr/bin/env bun

import type { AgentMessage } from './types/index.js';

const BASE_URL = process.env.AGENT_GATEWAY_URL || 'http://localhost:3000';

async function request<T = any>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(error)}`);
  }

  return response.json() as Promise<T>;
}

// 命令
const commands = {
  // 列出所有 Agent
  async listAgents() {
    const agents = await request<any[]>('/agents');
    console.log('\n📋 可用 Agent:\n');
    agents.forEach(agent => {
      console.log(`  ${agent.id.padEnd(15)} ${agent.name.padEnd(20)} [${agent.status}]`);
      console.log(`    能力: ${agent.capabilities.join(', ')}\n`);
    });
  },

  // 提交任务
  async submitTask(args: string[]) {
    const task = args.join(' ');
    if (!task) {
      console.error('❌ 请提供任务描述');
      process.exit(1);
    }

    console.log(`\n📤 提交任务: ${task}\n`);

    const message: Partial<AgentMessage> = {
      type: 'request',
      source: 'cli',
      target: 'gateway',
      payload: {
        task,
        options: {
          stream: false,
          timeout: 300
        }
      }
    };

    const result = await request<any>('/tasks', {
      method: 'POST',
      body: JSON.stringify(message)
    });

    console.log(`✅ 任务已提交: ${result.task_id}`);
    console.log(`   状态: ${result.status}\n`);

    // 轮询获取结果
    console.log('Waiting for result...\n');

    let completed = false;
    let attempts = 0;
    const maxAttempts = 60;

    while (!completed && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const taskResult = await request<any>(`/tasks/${result.task_id}`);

      if (taskResult.status === 'completed') {
        completed = true;
        console.log('✅ 任务完成!\n');
        console.log('📊 结果:');
        if (typeof taskResult.result === 'object') {
          Object.entries(taskResult.result).forEach(([agent, res]) => {
            console.log(`\n--- ${agent} ---`);
            console.log(res);
          });
        } else {
          console.log(taskResult.result);
        }
      } else if (taskResult.status === 'failed') {
        completed = true;
        console.log('❌ 任务失败!');
        console.log('错误:', taskResult.error);
      } else {
        attempts++;
        process.stdout.write('.');
      }
    }

    if (!completed) {
      console.log('\n⚠️ 任务超时\n');
    }
  },

  // 提交到指定 Agent
  async submitToAgent(agentId: string, args: string[]) {
    const task = args.join(' ');
    if (!task) {
      console.error('❌ 请提供任务描述');
      process.exit(1);
    }

    console.log(`\n📤 提交任务到 ${agentId}: ${task}\n`);

    const message: Partial<AgentMessage> = {
      type: 'request',
      source: 'cli',
      target: agentId,
      payload: {
        task,
        options: {
          stream: false,
          timeout: 300
        }
      }
    };

    const result = await request<any>('/tasks', {
      method: 'POST',
      body: JSON.stringify(message)
    });

    console.log(`✅ 任务已提交: ${result.task_id}`);
    console.log(`   状态: ${result.status}\n`);

    // 轮询获取结果
    console.log('⏳ 等待执行结果...\n');

    let completed = false;
    let attempts = 0;
    const maxAttempts = 60;

    while (!completed && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const taskResult = await request<any>(`/tasks/${result.task_id}`);

      if (taskResult.status === 'completed') {
        completed = true;
        console.log('\n✅ 任务完成!\n');
        console.log('📊 结果:');
        console.log(taskResult.result);
      } else if (taskResult.status === 'failed') {
        completed = true;
        console.log('\n❌ 任务失败!');
        console.log('错误:', taskResult.error);
      } else {
        attempts++;
        process.stdout.write('.');
      }
    }

    if (!completed) {
      console.log('\n⚠️ 任务超时\n');
    }
  },

  // 创建共享空间
  async createSpace() {
    const result = await request<{ space_id: string }>('/spaces', {
      method: 'POST',
      body: JSON.stringify({ metadata: { createdBy: 'cli' } })
    });

    console.log(`\n✅ 共享空间已创建: ${result.space_id}\n`);
    return result.space_id;
  },

  // 列出任务
  async listTasks() {
    const tasks = await request<any[]>('/tasks');
    console.log('\n📋 任务列表:\n');
    if (tasks.length === 0) {
      console.log('  (无任务)\n');
      return;
    }
    tasks.forEach(task => {
      console.log(`  ${task.id?.slice(0, 8) || 'unknown'}...  ${task.status?.padEnd(10) || 'unknown'} ${new Date(task.created_at).toLocaleString()}`);
    });
    console.log('');
  },

  // 健康检查
  async health() {
    const result = await request<any>('/health');
    console.log('\n🔍 Gateway 状态:\n');
    console.log(`  状态: ${result.status}`);
    console.log(`  Agent 数量: ${result.agents?.length || 0}`);
    console.log(`  时间: ${new Date(result.timestamp).toLocaleString()}\n`);
  }
};

// 主入口
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
🤖 Agent Gateway CLI

用法:
  agent-gateway <command> [options]

命令:
  agents, list              列出所有可用 Agent
  task <description>        提交通用任务（自动路由）
  to <agent> <task>        提交任务到指定 Agent
  space, create-space       创建共享空间
  tasks, list-tasks         列出所有任务
  health, status            检查 Gateway 状态

示例:
  agent-gateway agents
  agent-gateway task 帮我写一个排序算法
  agent-gateway to claude-code 帮我review这段代码
  agent-gateway health
`);
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  try {
    switch (command) {
      case 'agents':
      case 'list':
      case 'ls':
        await commands.listAgents();
        break;

      case 'task':
        await commands.submitTask(commandArgs);
        break;

      case 'to':
        if (commandArgs.length < 2) {
          console.error('用法: agent-gateway to <agent> <task>');
          process.exit(1);
        }
        const agentId = commandArgs[0];
        if (agentId) {
          await commands.submitToAgent(agentId, commandArgs.slice(1));
        }
        break;

      case 'space':
      case 'create-space':
        await commands.createSpace();
        break;

      case 'tasks':
      case 'list-tasks':
        await commands.listTasks();
        break;

      case 'health':
      case 'status':
        await commands.health();
        break;

      default:
        console.error(`❌ 未知命令: ${command}`);
        console.log('运行 agent-gateway 查看帮助');
        process.exit(1);
    }
  } catch (error: any) {
    console.error(`\n❌ 错误: ${error.message}\n`);
    process.exit(1);
  }
}

main();
