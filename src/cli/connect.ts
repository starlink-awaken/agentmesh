#!/usr/bin/env bun
/**
 * agentmesh connect / disconnect — 一键接入/断开各 AI 工具
 *
 * 支持: Codex Desktop, Claude Code, Gemini CLI, Cursor, Windsurf,
 *       KiloCode, Cline, OpenCode, OpenRouter, 通用 OPENAI_API_BASE
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { logger } from '../core/logger.js';

// ============================================================================
// Types
// ============================================================================

interface ToolAdapter {
  name: string;
  description: string;
  detect(): boolean;                          // 是否已安装
  getConfigPath(): string | null;             // 配置文件路径
  readConfig(): Record<string, any> | null;   // 读取当前配置
  generateConfig(gwUrl: string): {
    path: string;
    content: string | Record<string, any>;
    format: 'toml' | 'json' | 'json-merge' | 'yaml' | 'env';
  } | null;
  hasGatewayConfig(config: any): boolean;     // 是否已配置网关
}

interface ConnectResult {
  tool: string;
  status: 'ok' | 'skipped' | 'failed' | 'not_installed';
  detail: string;
  backupPath?: string;
}

interface DisconnectResult {
  tool: string;
  status: 'ok' | 'no_backup' | 'not_configured' | 'failed';
  detail: string;
}

// ============================================================================
// Helpers
// ============================================================================

const HOME = Bun.env.HOME || '/tmp';
const BACKUP_DIR = join(HOME, '.config', 'agentmesh', 'backups');
const GATEWAY_URL = Bun.env.AGENT_MESH_URL || 'http://127.0.0.1:3000/v1';
const GATEWAY_HOST = new URL(GATEWAY_URL).host;

function ensureDir(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function backupFile(originalPath: string): string | null {
  if (!existsSync(originalPath)) return null;
  ensureDir(BACKUP_DIR);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const name = originalPath.replace(/\//g, '_').replace(/^_/, '');
  const backupPath = join(BACKUP_DIR, `${name}.${ts}.bak`);
  copyFileSync(originalPath, backupPath);
  return backupPath;
}

// TOML 简单序列化（够用，不引入额外依赖）
function toToml(obj: Record<string, any>, parentKey = ''): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    const fullKey = parentKey ? `${parentKey}.${key}` : key;
    if (typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`[${fullKey}]`);
      lines.push(toToml(value, fullKey));
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          lines.push(`${key} = "${item}"`);
        } else {
          lines.push(`${key} = ${JSON.stringify(item)}`);
        }
      }
    } else if (typeof value === 'string') {
      lines.push(`${key} = "${value}"`);
    } else if (typeof value === 'boolean') {
      lines.push(`${key} = ${value}`);
    } else {
      lines.push(`${key} = ${value}`);
    }
  }
  return lines.join('\n');
}

// ============================================================================
// Tool Adapters
// ============================================================================

// Codex Desktop (~/.codex/config.toml)
const codexDesktopAdapter: ToolAdapter = {
  name: 'codex-desktop',
  description: 'OpenAI Codex Desktop (macOS app)',
  detect: () => existsSync(join(HOME, '.codex')),
  getConfigPath: () => join(HOME, '.codex', 'config.toml'),
  readConfig() {
    const path = this.getConfigPath();
    if (!path || !existsSync(path)) return null;
    try {
      const content = readFileSync(path, 'utf-8');
      return { raw: content }; // TOML 解析简化处理
    } catch { return null; }
  },
  generateConfig(gwUrl: string) {
    const path = this.getConfigPath()!;
    const section = {
      model: 'deepseek-v4-pro',
      model_provider: 'agentmesh',
    };
    const providerSection = {
      name: 'Agent Mesh Gateway',
      base_url: gwUrl,
      wire_api: 'responses',
      env_key: 'OPENAI_API_KEY',
    };

    return {
      path,
      format: 'toml' as const,
      content: { model: section.model, model_provider: section.model_provider, model_providers: { agentmesh: providerSection } },
    };
  },
  hasGatewayConfig(config: any) {
    return config?.raw?.includes('agentmesh') || config?.raw?.includes('model_providers');
  },
};

// Claude Code (~/.claude/settings.json)
const claudeCodeAdapter: ToolAdapter = {
  name: 'claude-code',
  description: 'Anthropic Claude Code CLI',
  detect: () => existsSync(join(HOME, '.claude')),
  getConfigPath: () => join(HOME, '.claude', 'settings.json'),
  readConfig() {
    const path = this.getConfigPath();
    if (!path || !existsSync(path)) return {};
    try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return {}; }
  },
  generateConfig(_gwUrl: string) {
    return null; // Claude Code 不支持直接换模型后端，用通用 ENV 方式
  },
  hasGatewayConfig() { return false; },
};

// Shell Profile (~/.zshrc 或 ~/.bashrc) — 通用 OPENAI_API_BASE
const shellProfileAdapter: ToolAdapter = {
  name: 'shell-env',
  description: 'Shell 环境变量 (OPENAI_API_BASE)',
  detect: () => existsSync(join(HOME, '.zshrc')) || existsSync(join(HOME, '.bashrc')),
  getConfigPath() {
    if (existsSync(join(HOME, '.zshrc'))) return join(HOME, '.zshrc');
    if (existsSync(join(HOME, '.bashrc'))) return join(HOME, '.bashrc');
    return null;
  },
  readConfig() {
    const path = this.getConfigPath();
    if (!path) return null;
    try {
      const content = readFileSync(path, 'utf-8');
      return { raw: content };
    } catch { return null; }
  },
  generateConfig(gwUrl: string) {
    const path = this.getConfigPath();
    if (!path) return null;
    const block = [
      '',
      '# >>> Agent Mesh Gateway (agentmesh connect) >>>',
      `export OPENAI_API_BASE="${gwUrl}"`,
      `export AGENT_MESH_URL="${gwUrl}"`,
      `export AGENT_GATEWAY_URL="http://${GATEWAY_HOST}"`,
      '# <<< Agent Mesh Gateway <<<',
      '',
    ].join('\n');

    return { path, format: 'env' as const, content: block };
  },
  hasGatewayConfig(config: any) {
    return config?.raw?.includes('Agent Mesh Gateway');
  },
};

// Cursor (~/Library/Application Support/Cursor/User/settings.json)
const cursorAdapter: ToolAdapter = {
  name: 'cursor',
  description: 'Cursor IDE',
  detect: () => existsSync(join(HOME, 'Library', 'Application Support', 'Cursor')),
  getConfigPath: () => join(HOME, 'Library', 'Application Support', 'Cursor', 'User', 'settings.json'),
  readConfig() {
    const path = this.getConfigPath();
    if (!path || !existsSync(path)) return {};
    try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return {}; }
  },
  generateConfig(gwUrl: string) {
    const path = this.getConfigPath();
    if (!path) return null;
    const overrides: Record<string, any> = {};
    // Cursor 使用 VS Code 风格的 OpenAI 配置
    overrides['openai.apiBase'] = gwUrl;
    overrides['openai.customHeaders'] = { 'x-custom-provider': 'agentmesh' };

    return { path, format: 'json-merge' as const, content: overrides };
  },
  hasGatewayConfig(config: any) {
    return config?.['openai.apiBase']?.includes('3000');
  },
};

// 通用 OpenAI 兼容工具 — 通过环境变量提示
const openaiCompatAdapter: ToolAdapter = {
  name: 'openai-compat',
  description: '通用 OpenAI 兼容工具 (OpenCode, KiloCode, Cline, etc.)',
  detect: () => true,
  getConfigPath: () => null,
  readConfig() { return null; },
  generateConfig(_gwUrl: string) {
    return null; // 环境变量方式已由 shell-env 处理
  },
  hasGatewayConfig() { return false; },
};

const ADAPTERS: ToolAdapter[] = [
  codexDesktopAdapter,
  claudeCodeAdapter,
  cursorAdapter,
  shellProfileAdapter,
  openaiCompatAdapter,
];

// ============================================================================
// Connect
// ============================================================================

export async function connectTools(
  targetTools: string[],
  opts: { dryRun?: boolean; port?: number; host?: string } = {}
): Promise<ConnectResult[]> {
  const results: ConnectResult[] = [];
  const gwUrl = opts.host && opts.port
    ? `http://${opts.host}:${opts.port}/v1`
    : GATEWAY_URL;

  const targets = targetTools.length > 0
    ? ADAPTERS.filter(a => targetTools.includes(a.name) || targetTools.includes('all'))
    : ADAPTERS;

  for (const adapter of targets) {
    // 特殊处理 'all'
    if (targetTools.includes('all') && adapter.name === 'openai-compat') continue;

    const installed = adapter.detect();
    if (!installed) {
      results.push({ tool: adapter.name, status: 'not_installed', detail: `${adapter.description} 未安装` });
      continue;
    }

    const config = adapter.readConfig();
    const generated = adapter.generateConfig(gwUrl);

    if (!generated) {
      // 环境变量类，打印提示
      results.push({
        tool: adapter.name,
        status: 'ok',
        detail: `${adapter.description}: 请设置环境变量 OPENAI_API_BASE=${gwUrl}`,
      });
      continue;
    }

    if (adapter.hasGatewayConfig(config)) {
      results.push({ tool: adapter.name, status: 'skipped', detail: '已配置网关，跳过' });
      continue;
    }

    if (opts.dryRun) {
      results.push({
        tool: adapter.name,
        status: 'ok',
        detail: `[DRY-RUN] 将修改 ${generated.path}`,
      });
      continue;
    }

    // 备份原文件
    const backupPath = backupFile(generated.path);

    try {
      const dir = dirname(generated.path);
      ensureDir(dir);

      switch (generated.format) {
        case 'toml': {
          const tomlContent = toToml(generated.content as Record<string, any>);
          // 追加到现有 TOML 文件
          const existing = existsSync(generated.path)
            ? readFileSync(generated.path, 'utf-8')
            : '';
          writeFileSync(generated.path, existing.trimEnd() + '\n\n# Added by agentmesh connect\n' + tomlContent + '\n');
          break;
        }
        case 'json-merge': {
          // JSON 合并：读取现有 JSON，合并新字段
          const existingJson = existsSync(generated.path)
            ? JSON.parse(readFileSync(generated.path, 'utf-8'))
            : {};
          const merged = { ...existingJson, ...(generated.content as Record<string, any>) };
          writeFileSync(generated.path, JSON.stringify(merged, null, 2) + '\n');
          break;
        }
        case 'env': {
          // Shell profile：追加块
          const existing = existsSync(generated.path)
            ? readFileSync(generated.path, 'utf-8')
            : '';
          writeFileSync(generated.path, existing.trimEnd() + '\n' + (generated.content as string));
          break;
        }
        case 'json': {
          writeFileSync(generated.path, JSON.stringify(generated.content, null, 2) + '\n');
          break;
        }
      }

      results.push({
        tool: adapter.name,
        status: 'ok',
        detail: `已配置 → ${gwUrl}` + (backupPath ? ` (备份: ${backupPath})` : ''),
        backupPath: backupPath || undefined,
      });
    } catch (err: any) {
      results.push({ tool: adapter.name, status: 'failed', detail: err.message });
    }
  }

  return results;
}

// ============================================================================
// Disconnect
// ============================================================================

export async function disconnectTools(targetTools: string[]): Promise<DisconnectResult[]> {
  const results: DisconnectResult[] = [];
  const targets = targetTools.length > 0 && !targetTools.includes('all')
    ? targetTools
    : ['codex-desktop', 'cursor', 'shell-env'];

  for (const toolName of targets) {
    const adapter = ADAPTERS.find(a => a.name === toolName);
    if (!adapter) {
      results.push({ tool: toolName, status: 'not_configured', detail: '未知工具' });
      continue;
    }

    const configPath = adapter.getConfigPath();
    if (!configPath || !existsSync(configPath)) {
      results.push({ tool: adapter.name, status: 'no_backup', detail: '配置文件不存在' });
      continue;
    }

    // 对于 shell-env，移除标记块
    if (adapter.name === 'shell-env') {
      try {
        let content = readFileSync(configPath, 'utf-8');
        const marker = '# >>> Agent Mesh Gateway (agentmesh connect) >>>';
        if (!content.includes(marker)) {
          results.push({ tool: adapter.name, status: 'not_configured', detail: '未找到网关配置块' });
          continue;
        }
        content = content.replace(/# >>> Agent Mesh Gateway[\s\S]*?# <<< Agent Mesh Gateway <<<\n?/g, '');
        writeFileSync(configPath, content.trimEnd() + '\n');
        results.push({ tool: adapter.name, status: 'ok', detail: '已移除环境变量配置' });
      } catch (err: any) {
        results.push({ tool: adapter.name, status: 'failed', detail: err.message });
      }
      continue;
    }

    // 查找备份文件
    const backupPattern = configPath.replace(/\//g, '_').replace(/^_/, '');
    const files = existsSync(BACKUP_DIR)
      ? Bun.spawnSync({ cmd: ['ls', '-t', BACKUP_DIR], stdout: 'pipe' }).stdout
      : new Uint8Array();
    const fileList = new TextDecoder().decode(files).split('\n').filter(f => f.startsWith(backupPattern));

    if (fileList.length > 0) {
      const latestBackup = join(BACKUP_DIR, fileList[0]!);
      try {
        writeFileSync(configPath, readFileSync(latestBackup, 'utf-8'));
        results.push({ tool: adapter.name, status: 'ok', detail: `已从备份恢复 (${latestBackup})` });
      } catch (err: any) {
        results.push({ tool: adapter.name, status: 'failed', detail: err.message });
      }
    } else {
      results.push({ tool: adapter.name, status: 'no_backup', detail: `无备份文件，请手动恢复 ${configPath}` });
    }
  }

  return results;
}

// ============================================================================
// List detected tools
// ============================================================================

export function listDetectedTools(): Array<{ name: string; description: string; installed: boolean; configPath?: string }> {
  return ADAPTERS.map(a => ({
    name: a.name,
    description: a.description,
    installed: a.detect(),
    configPath: a.getConfigPath() || undefined,
  }));
}

// ============================================================================
// Interactive selection
// ============================================================================

export async function interactiveConnect(): Promise<void> {
  const tools = listDetectedTools().filter(t => t.installed && t.name !== 'openai-compat');

  console.log(`
  🔍 检测到 ${tools.length} 个已安装的 AI 工具:

  [0] 全部接入 (推荐)
`);
  tools.forEach((t, i) => {
    const hasConfig = t.configPath ? ` → ${t.configPath.replace(HOME, '~')}` : '';
    console.log(`  [${i + 1}] ${t.name.padEnd(18)} ${t.description}${hasConfig}`);
  });
  console.log(`  [q] 退出`);

  process.stdout.write(`\n  选择 (多个用逗号分隔, 默认 0): `);

  const input = await readStdinLine();
  const trimmed = input.trim() || '0';

  if (trimmed === 'q' || trimmed === 'Q') {
    console.log('  已取消\n');
    return;
  }

  const selections = trimmed.split(',').map(s => s.trim()).filter(Boolean);
  let targets: string[] = [];

  if (selections.includes('0')) {
    targets = tools.map(t => t.name);
    console.log('  已选择: 全部工具');
  } else {
    for (const sel of selections) {
      const idx = parseInt(sel, 10);
      if (idx >= 1 && idx <= tools.length) {
        const tool = tools[idx - 1]!;
        targets.push(tool.name);
        console.log(`  已选择: ${tool.name}`);
      }
    }
  }

  if (targets.length === 0) {
    console.log('  未选择任何工具\n');
    return;
  }

  console.log(`\n  预览变更:\n`);
  const results = await connectTools(targets, { dryRun: true });
  for (const r of results) {
    const icon = r.status === 'ok' ? '✅' : r.status === 'skipped' ? '⏭️' : '⚫';
    console.log(`  ${icon} ${r.tool.padEnd(16)} ${r.detail}`);
  }

  process.stdout.write(`\n  确认执行? (y/N): `);
  const confirm = (await readStdinLine()).trim().toLowerCase();

  if (confirm === 'y' || confirm === 'yes') {
    console.log(`\n  执行中...\n`);
    const execResults = await connectTools(targets);
    for (const r of execResults) {
      const icon = r.status === 'ok' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌';
      console.log(`  ${icon} ${r.tool.padEnd(16)} ${r.detail}`);
    }
    console.log(`\n  ✅ 接入完成。使用 \`agentmesh disconnect\` 恢复\n`);
  } else {
    console.log('  已取消\n');
  }
}

function readStdinLine(): Promise<string> {
  return new Promise((resolve) => {
    // 使用 process.stdin 的 data 事件，每次重新监听（支持多次调用）
    const onData = (chunk: Buffer) => {
      process.stdin.removeListener('data', onData);
      process.stdin.pause();
      resolve(chunk.toString().trim());
    };
    process.stdin.resume();
    process.stdin.once('data', onData);
  });
}

// ============================================================================
// CLI entry
// ============================================================================

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const cmd = args[0];
  const rest = args.slice(1);
  const dryRun = rest.includes('--dry-run');
  const targets = rest.filter(a => !a.startsWith('--'));

  async function run() {
    if (cmd === 'connect') {
      const results = await connectTools(targets.length ? targets : ['all'], { dryRun });
      console.log('\n  接入结果:\n');
      for (const r of results) {
        const icon = r.status === 'ok' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌';
        console.log(`  ${icon} ${r.tool.padEnd(16)} ${r.detail}`);
      }
      if (dryRun) console.log('\n  ⚠️  DRY-RUN 模式，未实际修改文件');
      else console.log(`\n  💡 备份目录: ${BACKUP_DIR}\n    使用 \`agentmesh disconnect\` 恢复`);
    } else if (cmd === 'disconnect') {
      const results = await disconnectTools(targets.length ? targets : ['all']);
      console.log('\n  断开结果:\n');
      for (const r of results) {
        const icon = r.status === 'ok' ? '✅' : '❌';
        console.log(`  ${icon} ${r.tool.padEnd(16)} ${r.detail}`);
      }
    } else if (cmd === 'list' || cmd === 'detect') {
      const tools = listDetectedTools();
      console.log('\n  检测到的工具:\n');
      for (const t of tools) {
        console.log(`  ${t.installed ? '🟢' : '⚫'} ${t.name.padEnd(16)} ${t.description}`);
        if (t.configPath) console.log(`     ${t.configPath}`);
      }
    } else {
      console.log(`
  agentmesh connect — 一键接入 AI 工具

  用法:
    agentmesh connect [tool...] [--dry-run]
    agentmesh disconnect [tool...]
    agentmesh connect list

  工具:
    codex-desktop   Codex Desktop (macOS)
    claude-code     Anthropic Claude Code (环境变量)
    cursor          Cursor IDE
    shell-env       通用 Shell 环境变量
    all             所有工具

  选项:
    --dry-run       预览变更，不实际修改

  示例:
    agentmesh connect all              # 接入所有工具
    agentmesh connect codex-desktop    # 仅接入 Codex Desktop
    agentmesh connect --dry-run        # 预览将要修改的内容
    agentmesh disconnect all           # 恢复所有工具配置
    agentmesh connect list             # 列出可接入的工具
`);
    }
  }

  run().catch(err => {
    logger.error(`connect CLI error: ${err.message}`);
    process.exit(1);
  });
}
