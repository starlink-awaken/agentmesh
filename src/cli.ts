#!/usr/bin/env bun
/**
 * Agent Mesh Gateway CLI
 * 统一命令行接口 — start, setup, health, models, quota, config, doctor, help
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { initLogger } from './core/logger.js';

const PROJECT_ROOT = resolve(dirname(import.meta.dir), '..');
const VERSION = '1.5.0';
const BANNER = `
   █████╗  ██████╗ ███████╗███╗   ██╗████████╗
  ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
  ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║
  ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║
  ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║
  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝
  𝙼 𝙴 𝚂 𝙷    𝙶 𝙰 𝚃 𝙴 𝚆 𝙰 𝚈   v${VERSION}
`;

const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' };
const ICON = { ok: '✅', fail: '❌', warn: '⚠️', dot: '⚫' };
const STATUS_ICON: Record<string, string> = { completed: '🎯', failed: '❌', running: '🔄', pending: '🕐', assigned: '⚫' };
function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => (r[i] || '').length)));
  const sep = '─'.repeat(widths.reduce((a, b) => a + b, 0) + widths.length * 3 + 1);
  let out = `╭${sep}╮\n│ ${headers.map((h, i) => C.bold + h.padEnd(widths[i]!) + C.reset).join(' │ ')} │\n├${sep}┤\n`;
  for (const row of rows) {
    out += `│ ${row.map((cell, i) => cell.padEnd(widths[i]!)).join(' │ ')} │\n`;
  }
  out += `╰${sep}╯`;
  return out;
}

const BASE_URL = () => {
  const host = Bun.env.AGENT_GATEWAY_HOST || '127.0.0.1';
  const port = Bun.env.AGENT_GATEWAY_PORT || '3000';
  return `http://${host}:${port}`;
};

async function apiRequest<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE_URL()}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({ message: resp.statusText }))) as { message?: string };
    throw new Error(`[${resp.status}] ${err.message || 'Unknown error'}`);
  }
  return resp.json() as Promise<T>;
}

// ===========================================================================
// Help
// ===========================================================================
function showHelp(topic?: string) {
  if (topic === 'start' || topic === 'run') {
    console.log(`
  agentmesh start — 启动网关服务

  用法:
    agentmesh start [--port PORT] [--host HOST]

  选项:
    --port  监听端口 (默认: 3000)
    --host  监听地址 (默认: 0.0.0.0)

  示例:
    agentmesh start
    agentmesh start --port 9400`);
    return;
  }

  if (topic === 'setup') {
    console.log(`  agentmesh setup — 交互式初始化向导

  引导配置:
    - API Key (DeepSeek, OpenAI, OpenRouter)
    - 服务端口和日志级别
    - 生成 .env 配置文件`);
    return;
  }

  if (topic === 'models' || topic === 'model') {
    console.log(`  agentmesh models — 列出可用模型`);
    return;
  }

  if (topic === 'quota') {
    console.log(`  agentmesh quota — 查看配额状态 (需 codexbar)

  显示所有 Provider 的实时配额/余额信息。
  首次调用可能较慢 (codexbar 数据采集)。`);
    return;
  }

  if (topic === 'config') {
    console.log(`  agentmesh config — 配置管理

  用法:
    agentmesh config show    显示当前配置
    agentmesh config path    显示配置文件路径
    agentmesh config edit    在编辑器中打开配置`);
    return;
  }

  console.log(`
${BANNER}
  🤖 Agent Mesh Gateway CLI  v${VERSION}

  用法:
    agentmesh <command> [options]

  管理命令:
    start                 启动网关服务
    setup                 交互式初始化向导 (配置API Key等)
    doctor                系统诊断检查

  接入命令:
    connect [tool]        一键接入 AI 工具 (--dry-run 预览)
    disconnect [tool]     恢复工具配置到接入前状态
    hermes setup          配置 Hermes 双向通路 (手机↔网关)

  查询命令:
    health, status        健康检查
    models                列出可用模型
    quota                 查看配额状态
    agents                列出已注册 Agent
    tasks                 列出任务列表
    cancel <id>           取消指定任务

  配置命令:
    config show           显示当前配置
    config path           显示配置文件路径
    config edit           在编辑器中打开配置

  获取帮助:
    help                  显示此帮助
    help <command>        显示特定命令帮助

  示例:
    agentmesh start
    agentmesh setup
    agentmesh connect --dry-run    # 预览接入变更
    agentmesh connect all           # 接入所有工具
    agentmesh disconnect all        # 恢复所有工具

  文档: https://github.com/starlink-awaken/agentmesh
`);
}

// ===========================================================================
// Commands
// ===========================================================================
async function cmdStart(args: string[]) {
  // 解析参数
  const portArg = args.indexOf('--port');
  const hostArg = args.indexOf('--host');
  const port = portArg >= 0 ? args[portArg + 1] || '3000' : '3000';
  const host = hostArg >= 0 ? args[hostArg + 1] || '0.0.0.0' : '0.0.0.0';

  // 设置环境变量传递给服务器
  Bun.env.AGENT_GATEWAY_PORT = port;
  Bun.env.AGENT_GATEWAY_HOST = host;

  console.log(`${BANNER}
  🚀 Starting Agent Mesh Gateway...
  ═══════════════════════════════════════
  API v1:     http://${host}:${port}/v1
  Health:     http://${host}:${port}/v1/health
  Models:     http://${host}:${port}/v1/models
  Quota:      http://${host}:${port}/v1/model-gateway/quota
  Docs:       http://${host}:${port}/docs
  ═══════════════════════════════════════
`);

  // 动态导入并启动服务器
  await import('./index.js');
  // 服务器会在导入时启动
}

async function cmdHealth() {
  try {
    const data = await apiRequest<any>('/v1/health');
    console.log(`\n  ${C.green}${ICON.ok} Gateway Running${C.reset}`);
    console.log(`  Status:    ${C.bold}${data.status}${C.reset}  Uptime: ${C.cyan}${data.uptime_seconds}s${C.reset}  Agents: ${C.green}${data.agents?.online || data.agents?.length || 0} online${C.reset} / ${data.agents?.total || data.agents?.length || 0} total`);
    if (data.tasks) {
      console.log(`  Tasks:     ${C.yellow}${data.tasks.pending}pending${C.reset}  ${C.cyan}${data.tasks.running}running${C.reset}  ${C.green}${data.tasks.completed}done${C.reset}  ${C.red}${data.tasks.failed}failed${C.reset}`);
    }
    console.log('');
  } catch (err: any) {
    console.error(`\n  ${C.red}${ICON.fail} Gateway not reachable at ${BASE_URL()}${C.reset}`);
    console.error(`  ${C.dim}Error: ${err.message}${C.reset}`);
    console.log(`\n  Start it with: ${C.cyan}agentmesh start${C.reset}\n`);
  }
}

async function cmdModels() {
  try {
    const data = await apiRequest<any>('/v1/models');
    const byProvider: Record<string, string[]> = {};
    for (const m of data.data || []) {
      (byProvider[m.owned_by] ??= []).push(m.id);
    }
    const rows: string[][] = [];
    for (const [provider, models] of Object.entries(byProvider)) {
      rows.push([`${C.cyan}${provider}${C.reset}`, models.join(', ')]);
    }
    console.log('\n  ' + table(['Provider', 'Models'], rows) + '\n');
  } catch (err: any) {
    console.error(`\n  ${C.red}${ICON.fail} ${err.message}${C.reset}\n`);
  }
}

async function cmdQuota() {
  try {
    console.log('\n  ⏳ Fetching quota data (may take ~15s)...');
    const data = await apiRequest<any>('/v1/model-gateway/quota', { signal: AbortSignal.timeout(60_000) });
    console.log('\n  📊 Provider Quota Status:\n');
    if (!data || Object.keys(data).length === 0) {
      console.log('  No quota data available. Is codexbar installed?\n');
      return;
    }
    for (const [name, info] of Object.entries<any>(data)) {
      const icon = info.available ? '🟢' : '🔴';
      console.log(`  ${icon} ${name.padEnd(15)} ${info.summary}`);
    }
    console.log('');
  } catch (err: any) {
    console.error(`\n  ❌ ${err.message}\n`);
  }
}

async function cmdAgents() {
  try {
    const data = await apiRequest<any[]>('/v1/agents');
    const rows = data.map(a => [
      a.status === 'online' ? `${C.green}●${C.reset}` : `${C.dim}○${C.reset}`,
      a.id,
      a.name,
      a.status,
      (a.capabilities || []).slice(0, 3).join(', '),
    ]);
    console.log('\n  ' + table(['', 'ID', 'Name', 'Status', 'Capabilities (top 3)'], rows) + '\n');
  } catch (err: any) {
    console.error(`\n  ${C.red}${ICON.fail} ${err.message}${C.reset}\n`);
  }
}

async function cmdCancel(taskId: string) {
  try {
    const data = await apiRequest<any>(`/v1/tasks/${taskId}/cancel`, { method: 'POST' });
    console.log(`\n  ${C.green}${ICON.ok} Task ${data.task_id} cancelled${C.reset}\n`);
  } catch (err: any) {
    console.error(`\n  ${C.red}${ICON.fail} ${err.message}${C.reset}\n`);
  }
}

async function cmdTasks() {
  try {
    const tasks = await apiRequest<any[]>('/v1/tasks');
    if (!tasks.length) { console.log(`\n  ${C.dim}(no tasks)${C.reset}\n`); return; }
    const rows = tasks.map(t => [
      (STATUS_ICON[t.status] || ICON.dot) + ' ' + t.status,
      t.id?.slice(0, 8) || '-',
      String(t.assigned_agents?.length || 0),
      new Date(t.created_at).toLocaleString(),
    ]);
    console.log('\n  ' + table(['Status', 'ID', 'Agents', 'Created'], rows) + '\n');
  } catch (err: any) {
    console.error(`\n  ${C.red}${ICON.fail} ${err.message}${C.reset}\n`);
  }
}

async function cmdConfig(args: string[]) {
  const configPath = join(PROJECT_ROOT, 'config', 'gateway.yaml');
  const sub = args[0];

  if (sub === 'path') {
    console.log(`\n  Config: ${configPath}\n`);
  } else if (sub === 'edit') {
    const editor = Bun.env.EDITOR || Bun.env.VISUAL || 'vim';
    console.log(`  Opening ${configPath} with ${editor}...`);
    Bun.spawnSync([editor, configPath], { stdio: ['inherit', 'inherit', 'inherit'] });
  } else {
    // show
    try {
      const content = readFileSync(configPath, 'utf-8');
      console.log(`\n  ── ${configPath} ──\n`);
      console.log(content.split('\n').map(l => `  ${l}`).join('\n'));
    } catch {
      console.error(`\n  ❌ Config not found: ${configPath}\n`);
    }
  }
}

async function cmdStatus() {
  try {
    const [health, models, stats] = await Promise.all([
      apiRequest<any>('/v1/health'),
      apiRequest<any>('/v1/models').catch(() => ({ data: [] })),
      apiRequest<any>('/v1/model-gateway/stats').catch(() => null),
    ]);
    console.log(`
╔═══════════════════════════════════════════════════╗
║     Agent Mesh Gateway Status                    ║
╠═══════════════════════════════════════════════════╣
║  Status:    ${health.status}                                      ║
║  Agents:    ${String(health.agents?.length || 0).padStart(2)} online                               ║
║  Models:    ${String(models.data?.length || 0).padStart(2)} available                            ║
║  Uptime:    ${stats?.uptime_seconds ? Math.floor(stats.uptime_seconds) + 's' : 'N/A'}                                   ║
╠═══════════════════════════════════════════════════╣`);
    if (stats?.providers) {
      console.log('║  Provider Metrics:                              ║');
      for (const [name, m] of Object.entries<any>(stats.providers)) {
        console.log(`║  ${name.padEnd(12)} reqs:${String(m.requests).padStart(5)}  ok:${(m.success_rate||'N/A').padStart(6)}  avg:${String(m.avg_latency_ms||0).padStart(4)}ms     ║`);
      }
    }
    if (stats?.recent?.length) {
      console.log('╠═══════════════════════════════════════════════════╣');
      console.log('║  Recent:                                        ║');
      for (const r of stats.recent.slice(0, 5)) {
        const time = new Date(r.time).toLocaleTimeString();
        console.log(`║  ${r.status >= 400 ? '❌' : '✅'} ${time} ${r.model} → ${r.actual}  ${r.latency_ms}ms              ║`);
      }
    }
    console.log('╚═══════════════════════════════════════════════════╝\n');
  } catch { console.error('\n  ❌ Gateway not reachable. Start: agentmesh start\n'); }
}

async function cmdDoctor() {
  console.log('\n  🔍 Agent Mesh Gateway Diagnostics\n');
  const checks: Array<[string, boolean, string]> = [];

  // bun
  try {
    const proc = Bun.spawnSync({ cmd: ['bun', '--version'], stdout: 'pipe' });
    const ver = new TextDecoder().decode(proc.stdout).trim();
    checks.push(['Bun Runtime', true, ver]);
  } catch { checks.push(['Bun Runtime', false, 'Not found']); }

  // codexbar
  try {
    const proc = Bun.spawnSync({ cmd: ['codexbar', '--version'], stdout: 'pipe', stderr: 'pipe' });
    checks.push(['codexbar', proc.exitCode === 0, proc.exitCode === 0 ? 'OK' : 'Warning']);
  } catch { checks.push(['codexbar', false, 'Install for quota tracking']); }

  // API keys
  for (const [name, env] of [['DeepSeek', 'DEEPSEEK_API_KEY'], ['OpenAI', 'OPENAI_API_KEY'], ['OpenRouter', 'OPENROUTER_API_KEY']] as [string, string][]) {
    checks.push([`${name} API Key`, !!Bun.env[env], Bun.env[env!] ? 'Configured (env)' : 'Not set']);
  }

  // .env file
  const envPath = join(PROJECT_ROOT, '.env');
  checks.push(['.env file', existsSync(envPath), existsSync(envPath) ? 'Exists' : 'Run: agentmesh setup']);

  // docker
  try {
    const proc = Bun.spawnSync({ cmd: ['docker', '--version'], stdout: 'pipe' });
    checks.push(['Docker', true, new TextDecoder().decode(proc.stdout).trim()]);
  } catch { checks.push(['Docker', false, 'Not required']); }

  // config
  const configPath = join(PROJECT_ROOT, 'config', 'gateway.yaml');
  checks.push(['Config file', existsSync(configPath), existsSync(configPath) ? 'OK' : 'Missing!']);

  // Print
  for (const [name, ok, detail] of checks) {
    console.log(`  ${ok ? '✅' : '⚠️'} ${name.padEnd(20)} ${detail}`);
  }

  // Gateway status
  try {
    await apiRequest('/v1/health');
    console.log(`  ✅ Gateway              Running at ${BASE_URL()}`);
  } catch {
    console.log('  ⚠️ Gateway              Not running (start: agentmesh start)');
  }

  console.log('');
}

// ===========================================================================
// Main
// ===========================================================================
async function main() {
  const args = Bun.argv.slice(2);
  initLogger({ level: (Bun.env.LOG_LEVEL as any) || 'info', dir: join(PROJECT_ROOT, 'logs') });

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    showHelp(args[1]);
    return;
  }

  const cmd = args[0];
  const rest = args.slice(1);

  try {
    switch (cmd) {
      case 'start': case 'run':
        await cmdStart(rest); break;
      case 'setup': case 'init':
        const { runSetup } = await import('./cli/setup.js');
        await runSetup(); break;
      case 'health':
        await cmdHealth(); break;
      case 'status': case 'info':
        await cmdStatus(); break;
      case 'models': case 'model':
        await cmdModels(); break;
      case 'quota':
        await cmdQuota(); break;
      case 'agents': case 'ls':
        await cmdAgents(); break;
      case 'tasks':
        await cmdTasks(); break;
      case 'cancel':
        if (!rest[0]) { console.error(`\n  ${C.red}Usage: agentmesh cancel <task-id>${C.reset}\n`); break; }
        await cmdCancel(rest[0]); break;
      case 'config':
        await cmdConfig(rest); break;
      case 'connect': {
        // 子命令: connect list
        if (rest[0] === 'list') {
          const { listDetectedTools } = await import('./cli/connect.js');
          const tools = listDetectedTools();
          console.log('\n  🔍 检测到的 AI 工具:\n');
          for (const t of tools) {
            console.log(`  ${t.installed ? '🟢' : '⚫'} ${t.name.padEnd(18)} ${t.description}`);
            if (t.configPath) console.log(`     Config: ${t.configPath}`);
          }
          console.log(`\n  执行 \`agentmesh connect\` 进入交互式选择`);
          console.log(`  执行 \`agentmesh connect all --dry-run\` 预览接入变更\n`);
          break;
        }
        // 无参数或 -i → 交互式选择
        const hasTargets = rest.some(a => !a.startsWith('--'));
        const isInteractive = rest.includes('-i') || rest.includes('--interactive') || !hasTargets;
        if (isInteractive && !rest.includes('--dry-run')) {
          const { interactiveConnect } = await import('./cli/connect.js');
          await interactiveConnect();
          break;
        }
        const { connectTools } = await import('./cli/connect.js');
        const dryRun = rest.includes('--dry-run');
        const targets = rest.filter(a => !a.startsWith('--') && a !== '-i' && a !== '--interactive');
        const results = await connectTools(targets.length ? targets : ['all'], { dryRun });
        console.log('\n  接入结果:\n');
        for (const r of results) {
          const icon = r.status === 'ok' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌';
          console.log(`  ${icon} ${r.tool.padEnd(16)} ${r.detail}`);
        }
        if (dryRun) console.log('\n  ⚠️  DRY-RUN 模式，未实际修改文件');
        else console.log(`\n  💡 使用 \`agentmesh disconnect\` 恢复配置`);
        break;
      }
      case 'disconnect': {
        const { disconnectTools } = await import('./cli/connect.js');
        const targets = rest.filter(a => !a.startsWith('--'));
        const results = await disconnectTools(targets.length ? targets : ['all']);
        console.log('\n  断开结果:\n');
        for (const r of results) {
          const icon = r.status === 'ok' ? '✅' : '❌';
          console.log(`  ${icon} ${r.tool.padEnd(16)} ${r.detail}`);
        }
        break;
      }
      case 'release':
        const { runRelease } = await import('./cli/release.js');
        await runRelease(rest[0] || 'patch'); break;
      case 'hermes':
        if (rest[0] === 'setup') {
          console.log(`
  ╔═══════════════════════════════════════════════════╗
  ║     Hermes ↔ Agent Mesh 双向通路设置               ║
  ╚═══════════════════════════════════════════════════╝

  Hermes 网关已在运行（Discord + Weixin 已连接）。
  现在只需添加一个 webhook 订阅，让 Hermes 能调用本网关。

  方式 1: 手动订阅 (推荐)
    hermes webhook subscribe \\
      --name agentmesh \\
      --url http://127.0.0.1:3000/hermes/task \\
      --event message.received \\
      --format '{"prompt":"{{message}}","model":"deepseek-chat"}'

  方式 2: 从 Discord/Weixin 用 !task 命令触发
    在 Hermes 的 skills 目录创建 agentmesh skill:
      ~/.hermes/skills/agentmesh.md
    内容: "当用户发送 !task <描述> 时，POST 到 http://127.0.0.1:3000/hermes/task"

  当前网关端点:
    POST /hermes/task       提交任务 (手机 → 网关)
    GET  /hermes/task/:id   查询结果 (网关 → 手机)
    GET  /hermes/health     Hermes 健康检查

  使用流程:
    📱 手机 Discord/Weixin 发消息
      → Hermes Gateway 接收
      → Webhook → POST :3000/hermes/task
      → Agent Mesh 执行
      → 结果返回 Hermes
      → 📱 手机收到回复
`);
        } else {
          console.log('\n  agentmesh hermes setup    Hermes 双向通路设置指南\n');
        }
        break;
      case 'doctor': case 'check':
        await cmdDoctor(); break;
      default:
        console.error(`\n  ❌ Unknown command: ${cmd}\n  Run 'agentmesh help' for available commands.\n`);
    }
  } catch (err: any) {
    console.error(`\n  ❌ Error: ${err.message}\n`);
  }
}

main();
