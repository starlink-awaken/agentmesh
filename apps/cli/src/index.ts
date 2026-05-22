#!/usr/bin/env bun
/**
 * Agent Mesh — 统一 CLI
 *
 * 用法:
 *   agentmesh model list    列出模型
 *   agentmesh model health  模型健康检查
 *   agentmesh status        系统状态
 *   agentmesh skills list   列出技能
 *   agentmesh mcp           启动 MCP 服务器（stdio 模式，使用 bun run）
 *   agentmesh start         启动所有服务
 */

const [, , command, subcommand] = process.argv;

async function main() {
  switch (command) {
    case 'start':
      console.log('[CLI] Starting all services...');
      // 使用 bun run 启动 MCP server
      const { spawn } = await import('node:child_process');
      const mcpProc = spawn('bun', ['run', 'apps/server/src/mcp/index.ts'], {
        stdio: 'inherit',
        env: { ...process.env },
      });
      console.log('[CLI] MCP server started. PID:', mcpProc.pid);
      mcpProc.on('exit', (code: number | null) => {
        console.log('[CLI] MCP server exited with code', code);
      });
      process.on('SIGINT', () => { mcpProc.kill(); process.exit(0); });
      break;

    case 'model': {
      const { initFromConfig } = await import('@agentmesh/model-orchestrator');
      switch (subcommand) {
        case 'list': {
          const { registry } = initFromConfig();
          await registry.refresh();
          const models = registry.getAll();
          console.log(JSON.stringify(models, null, 2));
          break;
        }
        case 'health': {
          const { registry } = initFromConfig();
          const models = await registry.refresh();
          console.log(`在线: ${models.filter(m => m.isAvailable).length}/${models.length}`);
          break;
        }
        default:
          console.log('Usage: agentmesh model list|health');
      }
      break;
    }

    case 'status':
      console.log(JSON.stringify({
        version: '2.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        node: process.version,
      }, null, 2));
      break;

    case 'skills':
      if (subcommand === 'list') {
        console.log('[CLI] Skills system not yet connected.');
        console.log('Integrate agent-toolkit SkillLoader for skill listing.');
      } else {
        console.log('Usage: agentmesh skills list');
      }
      break;

    case 'mcp':
      console.error('[CLI] Starting MCP server in stdio mode...');
      console.error('[CLI] Use: bun run apps/server/src/mcp/index.ts');
      break;

    default:
      console.log(`
Agent Mesh CLI v2.0.0

用法:
  agentmesh start             启动所有服务
  agentmesh model list        列出可用模型
  agentmesh model health      检查模型健康
  agentmesh status            系统状态
  agentmesh skills list       列出技能
  agentmesh mcp               启动 MCP 服务器 (stdio)
      `);
  }
}

main().catch(console.error);
