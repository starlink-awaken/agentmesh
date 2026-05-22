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
          console.log(`\n  Discovered models: ${models.length}`);
          for (const m of models) {
            const loc = m.location === 'local' ? '🏠' : '☁️';
            const status = m.isAvailable ? '✓' : '✗';
            console.log(`  ${status} ${loc} ${m.id} (ctx: ${m.contextWindow})`);
          }
          if (models.length === 0) console.log('  (no models found — check if services are running)');
          break;
        }
        case 'health': {
          const { registry } = initFromConfig();
          const models = await registry.refresh();
          const online = models.filter(m => m.isAvailable).length;
          console.log(`\n  Models: ${online}/${models.length} online`);
          for (const m of models) {
            console.log(`  ${m.isAvailable ? '✓' : '✗'} ${m.id} — ${m.location}`);
          }
          break;
        }
        default:
          console.log('Usage: agentmesh model list|health');
      }
      break;
    }

    case 'status':
      console.log(`\n  Agent Mesh v2.0.0`);
      console.log(`  Uptime: ${Math.floor(process.uptime() / 60)}m`);
      console.log(`  Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
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

    case 'doctor': {
      const { existsSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      console.log('\n== Agent Mesh Doctor ==\n');

      // Config files
      const fileChecks: [string, string][] = [
        ['config/gateway.yaml', 'Gateway config'],
        ['config/models.yaml', 'Models config'],
      ];
      for (const [rel, label] of fileChecks) {
        const full = resolve(process.cwd(), rel);
        console.log(`  ${label}: ${existsSync(full) ? '✓' : '✗'}  ${full}`);
      }

      // Ports
      const ports: [string, number][] = [['Gateway HTTP', 3000], ['WebSocket', 3001]];
      for (const [label, port] of ports) {
        try {
          const conn = await Bun.connect({
            hostname: '127.0.0.1',
            port,
            socket: {
              open(s) { s.end(); },
              data() {},
              close() {},
              error() {},
            },
          });
          console.log(`  Port ${port} (${label}): ✓ open`);
        } catch {
          console.log(`  Port ${port} (${label}): ✗ closed`);
        }
      }

      // API keys
      const keyEnvVars = [
        'ANTHROPIC_API_KEY',
        'OPENAI_API_KEY',
        'OPENROUTER_API_KEY',
        'DEEPSEEK_API_KEY',
      ];
      for (const key of keyEnvVars) {
        const val = process.env[key];
        console.log(`  ${key}: ${val ? `✓ set (${val.slice(0, 10)}...)` : '✗ not set'}`);
      }

      // Local model services
      const localServices: [string, string, number][] = [
        ['Ollama', '127.0.0.1', 11434],
        ['LM Studio', '127.0.0.1', 1234],
      ];
      for (const [label, host, port] of localServices) {
        try {
          const conn = await Bun.connect({
            hostname: host,
            port,
            socket: {
              open(s) { s.end(); },
              data() {},
              close() {},
              error() {},
            },
          });
          console.log(`  ${label} (${host}:${port}): ✓ reachable`);
        } catch {
          console.log(`  ${label} (${host}:${port}): ✗ not reachable`);
        }
      }

      console.log('');
      break;
    }

    case 'quota': {
      console.log('\n== Provider Quota ==');
      try {
        const proc = Bun.spawn(
          ['codexbar', 'usage', '--format', 'json', '--provider', 'all'],
          { stdout: 'pipe', stderr: 'pipe' },
        );
        const output = await new Response(proc.stdout).text();
        const entries = JSON.parse(output.trim()) as any[];

        if (entries.length === 0) {
          console.log('\n  No quota data available.\n');
          break;
        }

        for (const entry of entries) {
          const provider = (entry.provider as string) || 'unknown';
          let available = false;
          let summary = 'Unknown';

          try {
            switch (provider) {
              case 'codex': {
                const remaining = entry.credits?.remaining ?? 0;
                const secUsed = entry.usage?.secondary?.usedPercent ?? 0;
                available = remaining > 0 || secUsed < 100;
                summary = `Credits: ${remaining}, Secondary: ${secUsed}%`;
                break;
              }
              case 'openai':
                available = !entry.error;
                summary = entry.error ? `Error: ${entry.error.message}` : 'API Key configured';
                break;
              case 'deepseek': {
                const desc = entry.usage?.primary?.resetDescription ?? '';
                const match = desc.match(/¥([\d.]+)/);
                const bal = match ? parseFloat(match[1]) : -1;
                available = bal > 0;
                summary = `Balance: ¥${Math.max(bal, 0).toFixed(2)}`;
                break;
              }
              case 'openrouter': {
                const orUsage = entry.usage?.openRouterUsage ?? {};
                const bal = orUsage.balance ?? 0;
                const usedPct = orUsage.usedPercent ?? 0;
                available = bal > 0;
                summary = `Balance: $${Number(bal).toFixed(2)}, Used: ${usedPct}%`;
                break;
              }
              case 'gemini': {
                const usedPct = entry.usage?.primary?.usedPercent ?? 0;
                available = usedPct < 95;
                summary = `Used: ${usedPct}%`;
                break;
              }
              case 'copilot':
              case 'cursor': {
                const usedPct = entry.usage?.primary?.usedPercent ?? 0;
                available = usedPct < 100;
                summary = `Used: ${usedPct}%`;
                break;
              }
              case 'ollama':
                available = true;
                summary = 'Local — always available';
                break;
              default:
                available = !entry.error;
                summary = entry.error ? `Error: ${entry.error.message}` : 'Status unknown';
            }
          } catch {
            available = true;
            summary = 'Parse error, assuming available';
          }

          console.log(`  ${available ? '✓' : '✗'} ${provider.padEnd(12)} ${summary}`);
        }
      } catch (err) {
        console.log(`\n  ✗ Failed to query quota: ${(err as Error).message}`);
        console.log('  (codexbar CLI must be installed for quota queries)\n');
      }
      console.log('');
      break;
    }

    case 'config': {
      const { existsSync, readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      const gatewayPath = resolve(process.cwd(), 'config/gateway.yaml');
      const modelsPath = resolve(process.cwd(), 'config/models.yaml');

      switch (subcommand) {
        case 'show':
          console.log('\n== Configuration ==\n');

          console.log('--- config/gateway.yaml ---');
          if (existsSync(gatewayPath)) {
            console.log(readFileSync(gatewayPath, 'utf-8'));
          } else {
            console.log('  (file not found)\n');
          }

          console.log('--- config/models.yaml ---');
          if (existsSync(modelsPath)) {
            console.log(readFileSync(modelsPath, 'utf-8'));
          } else {
            console.log('  (file not found)\n');
          }
          break;

        case 'path':
          console.log(`\n  Gateway config: ${gatewayPath}${existsSync(gatewayPath) ? ' ✓' : ' ✗'}`);
          console.log(`  Models config:  ${modelsPath}${existsSync(modelsPath) ? ' ✓' : ' ✗'}`);
          console.log('');
          break;

        default:
          console.log('Usage: agentmesh config show|path');
      }
      break;
    }

    case 'setup': {
      const { existsSync, writeFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const { createInterface } = await import('node:readline/promises');

      console.log('\n== Agent Mesh Setup Wizard ==\n');

      // Pre-check
      const gatewayPath = resolve(process.cwd(), 'config/gateway.yaml');
      const modelsPath = resolve(process.cwd(), 'config/models.yaml');
      const envPath = resolve(process.cwd(), '.env');

      console.log('  Current state:');
      console.log(`    Config dir:  ${existsSync(gatewayPath) ? '✓ exists' : '✗ missing'}`);
      console.log(`    Models cfg:  ${existsSync(modelsPath) ? '✓ exists' : '✗ missing'}`);
      console.log(`    .env file:   ${existsSync(envPath) ? '✓ exists' : '✗ missing'}`);
      console.log('');

      const rl = createInterface({ input: process.stdin, output: process.stdout });

      // API keys
      const keyQuestions: [string, string][] = [
        ['ANTHROPIC_API_KEY', 'Anthropic (Claude)'],
        ['OPENAI_API_KEY', 'OpenAI'],
        ['OPENROUTER_API_KEY', 'OpenRouter'],
        ['DEEPSEEK_API_KEY', 'DeepSeek'],
      ];

      const envEntries: string[] = [];
      for (const [key, label] of keyQuestions) {
        const current = process.env[key];
        if (current) {
          console.log(`  ${label} API key (${key}): ✓ already set`);
          envEntries.push(`${key}=${current}`);
        } else {
          const answer = await rl.question(`  Enter ${label} API key (or leave blank to skip): `);
          if (answer.trim()) {
            envEntries.push(`${key}=${answer.trim()}`);
            console.log(`    ✓ ${key} saved`);
          } else {
            console.log(`    - ${label} skipped`);
          }
        }
      }

      // Write .env if any new keys were provided
      if (envEntries.length > 0) {
        const existing = existsSync(envPath) ? await Bun.file(envPath).text() : '';
        const newLines = envEntries.filter(e => !existing.includes(e.split('=')[0]!));
        if (newLines.length > 0) {
          const content = existing + (existing && !existing.endsWith('\n') ? '\n' : '') + newLines.join('\n') + '\n';
          writeFileSync(envPath, content);
          console.log(`\n  ✓ Written ${newLines.length} key(s) to .env`);
        } else {
          console.log('\n  - All keys already in .env, nothing to write');
        }
      }

      console.log('\n  Setup complete! Run the following to apply:');
      console.log('    source .env              # Load API keys');
      console.log('    agentmesh doctor         # Verify setup');
      console.log('    agentmesh model list     # Discover models\n');

      rl.close();
      break;
    }

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
  agentmesh doctor            系统诊断（配置/端口/API Key）
  agentmesh quota             查询 Provider 配额（需 codexbar）
  agentmesh config show       显示配置文件内容
  agentmesh config path       显示配置文件路径
  agentmesh setup             交互式配置向导
      `);
  }
}

main().catch(console.error);
