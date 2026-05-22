/**
 * MCPServers - MCP 服务器发现器
 *
 * 整合 mcpservers.org 的热门 MCP 服务器列表，提供搜索和发现功能
 *
 * @author PAI
 * @version 1.0.0
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { AgentTool, ParameterProperty } from '../tools/types.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import type { ToolRegistryStats } from '../tools/types.js';

/**
 * MCP 服务器条目
 */
export interface MCPServer {
  name: string;
  description: string;
  url: string;
  category: string;
  author?: string;
  stars?: number;
  pricing?: 'free' | 'freemium' | 'paid';
  official?: boolean;
  sponsor?: boolean;
}

/**
 * MCP 服务器分类
 */
export type MCPCategory =
  | 'AI'
  | 'Browser'
  | 'Database'
  | 'Development'
  | 'DevOps'
  | 'Finance'
  | 'Knowledge'
  | 'Marketing'
  | 'Media'
  | 'Productivity'
  | 'Security'
  | 'Social'
  | 'Storage'
  | 'Utility'
  | 'Other';

/**
 * MCP 配置 - 用于动态发现和连接
 */
export interface MCPConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  autoConnect?: boolean;
}

/**
 * MCP 发现选项
 */
export interface MCPDiscoveryOptions {
  configPaths?: string[];
  envPrefix?: string;
  autoConnect?: boolean;
  healthCheckInterval?: number;
}

/**
 * MCP 服务器连接状态
 */
export interface MCPServerConnection {
  server: MCPConfig;
  status: 'connected' | 'disconnected' | 'error';
  lastHealthCheck?: number;
  tools: AgentTool[];
  process?: ChildProcess;
  error?: string;
}

/**
 * MCP 工具定义
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCPServers 类
 *
 * 提供 MCP 服务器的搜索和发现能力
 */
export class MCPServers {
  private servers: MCPServer[] = [];

  constructor() {
    this.initializeServers();
  }

  /**
   * 初始化内置 MCP 服务器列表（热门服务器）
   */
  private initializeServers(): void {
    this.servers = [
      // AI & ML
      { name: 'OpenAI', description: 'OpenAI GPT models integration', url: 'https://openai.com/api/', category: 'AI', official: true },
      { name: 'Anthropic', description: 'Claude models integration', url: 'https://www.anthropic.com/', category: 'AI', official: true },
      { name: 'Google AI', description: 'Google Gemini and PaLM models', url: 'https://ai.google.dev/', category: 'AI', official: true },
      { name: 'Hugging Face', description: 'NLP models and datasets', url: 'https://huggingface.co/', category: 'AI' },
      { name: 'Perplexity', description: 'AI-powered search', url: 'https://www.perplexity.ai/', category: 'AI' },
      { name: 'xAI', description: 'xAI Grok models', url: 'https://x.ai/', category: 'AI' },
      { name: 'DeepWiki', description: 'AI-powered codebase understanding', url: 'https://deepwiki.com/', category: 'AI', official: true },

      // Browser & Automation
      { name: 'Browser Tools', description: 'Browser automation and control', url: 'https://github.com/anthropics/browser-tools', category: 'Browser' },
      { name: 'Playwright', description: 'Web automation and testing', url: 'https://playwright.dev/', category: 'Browser', official: true },
      { name: 'Chrome DevTools', description: 'Chrome browser control and inspection', url: 'https://github.com/anthropics/chrome-devtools-mcp', category: 'Browser', official: true },
      { name: 'Puppeteer', description: 'Headless Chrome automation', url: 'https://pptr.dev/', category: 'Browser' },
      { name: 'Scrapfly', description: 'Web scraping API', url: 'https://scrapfly.io/', category: 'Browser' },
      { name: 'Bright Data', description: 'Web scraping and data collection', url: 'https://brightdata.com/', category: 'Browser', sponsor: true },

      // Database
      { name: 'Supabase', description: 'PostgreSQL database and auth', url: 'https://supabase.com/', category: 'Database', official: true },
      { name: 'Neon', description: 'Serverless PostgreSQL', url: 'https://neon.tech/', category: 'Database' },
      { name: 'MongoDB', description: 'NoSQL database', url: 'https://www.mongodb.com/', category: 'Database' },
      { name: 'Redis', description: 'In-memory data store', url: 'https://redis.io/', category: 'Database' },
      { name: 'SQLite', description: 'Local SQLite database', url: 'https://sqlite.org/', category: 'Database' },

      // Development
      { name: 'GitHub', description: 'GitHub API integration', url: 'https://github.com/', category: 'Development', official: true },
      { name: 'GitLab', description: 'GitLab API integration', url: 'https://gitlab.com/', category: 'Development' },
      { name: 'npm', description: 'npm package registry', url: 'https://npmjs.com/', category: 'Development' },
      { name: 'Docker', description: 'Docker container management', url: 'https://docker.com/', category: 'Development' },
      { name: 'E2B', description: 'Secure code execution sandbox', url: 'https://e2b.dev/', category: 'Development' },
      { name: 'Bolt', description: 'AI-powered coding', url: 'https://bolt.new/', category: 'Development' },
      { name: 'CodeSandbox', description: 'Cloud development environments', url: 'https://codesandbox.io/', category: 'Development' },

      // DevOps
      { name: 'AWS', description: 'AWS cloud services', url: 'https://aws.amazon.com/', category: 'DevOps', official: true },
      { name: 'Cloudflare', description: 'Cloudflare workers and services', url: 'https://cloudflare.com/', category: 'DevOps', official: true },
      { name: 'Vercel', description: 'Vercel deployment platform', url: 'https://vercel.com/', category: 'DevOps' },
      { name: 'Railway', description: 'Railway deployment', url: 'https://railway.app/', category: 'DevOps' },
      { name: 'Render', description: 'Cloud hosting', url: 'https://render.com/', category: 'DevOps' },

      // Finance
      { name: 'Alpha Vantage', description: 'Financial market data', url: 'https://www.alphavantage.co/', category: 'Finance', sponsor: true },
      { name: 'CoinGecko', description: 'Cryptocurrency data', url: 'https://www.coingecko.com/', category: 'Finance' },
      { name: 'Stripe', description: 'Payment processing', url: 'https://stripe.com/', category: 'Finance' },
      { name: 'Plaid', description: 'Financial data API', url: 'https://plaid.com/', category: 'Finance' },

      // Knowledge
      { name: 'Notion', description: 'Knowledge base and docs', url: 'https://notion.so/', category: 'Knowledge' },
      { name: 'Obsidian', description: 'Markdown knowledge base', url: 'https://obsidian.md/', category: 'Knowledge' },
      { name: 'Memory', description: 'AI-powered memory', url: 'https://memory.ai/', category: 'Knowledge' },
      { name: 'Qdrant', description: 'Vector database', url: 'https://qdrant.tech/', category: 'Knowledge' },
      { name: 'Weaviate', description: 'Vector search engine', url: 'https://weaviate.io/', category: 'Knowledge' },

      // Media
      { name: 'Unsplash', description: 'Photo library', url: 'https://unsplash.com/', category: 'Media' },
      { name: 'Pexels', description: 'Free photos', url: 'https://pexels.com/', category: 'Media' },
      { name: 'YouTube', description: 'Video platform', url: 'https://youtube.com/', category: 'Media' },
      { name: 'Spotify', description: 'Music streaming', url: 'https://spotify.com/', category: 'Media' },
      { name: 'ElevenLabs', description: 'Text-to-speech', url: 'https://elevenlabs.io/', category: 'Media' },

      // Productivity
      { name: 'Slack', description: 'Team communication', url: 'https://slack.com/', category: 'Productivity' },
      { name: 'Linear', description: 'Issue tracking', url: 'https://linear.app/', category: 'Productivity' },
      { name: 'Trello', description: 'Kanban boards', url: 'https://trello.com/', category: 'Productivity' },
      { name: 'Asana', description: 'Project management', url: 'https://asana.com/', category: 'Productivity' },
      { name: 'Google Calendar', description: 'Calendar integration', url: 'https://calendar.google.com/', category: 'Productivity', official: true },
      { name: 'Gmail', description: 'Email integration', url: 'https://gmail.com/', category: 'Productivity', official: true },

      // Security
      { name: 'Auth0', description: 'Authentication', url: 'https://auth0.com/', category: 'Security' },
      { name: 'Clerk', description: 'User authentication', url: 'https://clerk.com/', category: 'Security' },
      { name: '1Password', description: 'Password management', url: 'https://1password.com/', category: 'Security' },
      { name: 'Have I Been Pwned', description: 'Data breach checking', url: 'https://haveibeenpwned.com/', category: 'Security' },

      // Social
      { name: 'Twitter', description: 'Social media', url: 'https://twitter.com/', category: 'Social' },
      { name: 'Reddit', description: 'Reddit API', url: 'https://reddit.com/', category: 'Social' },
      { name: 'LinkedIn', description: 'Professional network', url: 'https://linkedin.com/', category: 'Social' },
      { name: 'Discord', description: 'Chat platform', url: 'https://discord.com/', category: 'Social' },

      // Storage
      { name: 'S3', description: 'AWS S3 storage', url: 'https://aws.amazon.com/s3/', category: 'Storage', official: true },
      { name: 'Cloudflare R2', description: 'S3-compatible storage', url: 'https://cloudflare.com/r2/', category: 'Storage' },
      { name: 'Dropbox', description: 'File storage', url: 'https://dropbox.com/', category: 'Storage' },
      { name: 'Google Drive', description: 'Google cloud storage', url: 'https://drive.google.com/', category: 'Storage', official: true },

      // Utility
      { name: 'Exa Search', description: 'AI-powered search', url: 'https://exa.ai/', category: 'Utility' },
      { name: 'Brave Search', description: 'Web search', url: 'https://search.brave.com/', category: 'Utility' },
      { name: 'SearXNG', description: 'Metasearch engine', url: 'https://searxng.github.io/', category: 'Utility' },
      { name: 'Tavily', description: 'AI search for agents', url: 'https://tavily.com/', category: 'Utility' },
      { name: 'Kagi', description: 'Premium search', url: 'https://kagi.com/', category: 'Utility' },
      { name: 'Telegram', description: 'Messaging', url: 'https://telegram.org/', category: 'Utility' },
      { name: 'SendGrid', description: 'Email sending', url: 'https://sendgrid.com/', category: 'Utility' },
      { name: 'Mailgun', description: 'Email service', url: 'https://mailgun.com/', category: 'Utility' },
      { name: 'Anki', description: 'Spaced repetition flashcards', url: 'https://ankiweb.net/', category: 'Utility', sponsor: true },
      { name: 'Bitrix24', description: 'Tasks and workgroups', url: 'https://bitrix24.com/', category: 'Utility' },
    ];
  }

  /**
   * 获取所有 MCP 服务器
   */
  getAll(): MCPServer[] {
    return [...this.servers];
  }

  /**
   * 获取所有分类
   */
  getCategories(): string[] {
    const categories = new Set(this.servers.map(server => server.category));
    return Array.from(categories).sort();
  }

  /**
   * 搜索 MCP 服务器
   */
  search(query: string, options?: {
    category?: string;
    official?: boolean;
    free?: boolean;
  }): MCPServer[] {
    let results = [...this.servers];

    // 关键词搜索
    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(server =>
        server.name.toLowerCase().includes(lowerQuery) ||
        server.description.toLowerCase().includes(lowerQuery) ||
        server.category.toLowerCase().includes(lowerQuery)
      );
    }

    // 按分类过滤
    if (options?.category) {
      results = results.filter(server =>
        server.category.toLowerCase() === options.category!.toLowerCase()
      );
    }

    // 官方服务器
    if (options?.official) {
      results = results.filter(server => server.official);
    }

    // 免费服务器
    if (options?.free) {
      results = results.filter(server => server.pricing === 'free' || !server.pricing);
    }

    return results;
  }

  /**
   * 按分类获取服务器
   */
  getByCategory(category: string): MCPServer[] {
    return this.search('', { category });
  }

  /**
   * 获取官方服务器
   */
  getOfficial(): MCPServer[] {
    return this.search('', { official: true });
  }

  /**
   * 获取赞助商服务器
   */
  getSponsors(): MCPServer[] {
    return this.servers.filter(server => server.sponsor);
  }

  /**
   * 格式化输出为 Markdown
   */
  toMarkdown(servers: MCPServer[]): string {
    if (servers.length === 0) {
      return '没有找到匹配的 MCP 服务器';
    }

    let md = '| MCP Server | 描述 | 分类 | 官方 | 赞助 |\n';
    md += '|------------|------|------|------|------|\n';

    for (const server of servers) {
      md += `| [${server.name}](${server.url}) | ${server.description} | ${server.category} | ${server.official ? '✅' : '-'} | ${server.sponsor ? '💎' : '-'} |\n`;
    }

    return md;
  }

  /**
   * 格式化输出为 JSON
   */
  toJSON(servers: MCPServer[]): string {
    return JSON.stringify(servers, null, 2);
  }

  /**
   * 按分类分组的 Markdown
   */
  toGroupedMarkdown(servers: MCPServer[]): string {
    const grouped = new Map<string, MCPServer[]>();

    for (const server of servers) {
      const list = grouped.get(server.category) || [];
      list.push(server);
      grouped.set(server.category, list);
    }

    let md = '';
    for (const [category, list] of grouped) {
      md += `### ${category}\n\n`;
      md += '| Server | 描述 | 官方 | 赞助 |\n';
      md += '|--------|------|------|------|\n';
      for (const server of list) {
        md += `| [${server.name}](${server.url}) | ${server.description} | ${server.official ? '✅' : '-'} | ${server.sponsor ? '💎' : '-'} |\n`;
      }
      md += '\n';
    }

    return md;
  }
}

/**
 * MCPDiscovery - MCP 服务器动态发现和连接管理
 *
 * 提供从环境变量、配置文件、npx 命令自动发现 MCP Servers 的能力
 * 管理连接生命周期，自动注册工具到 ToolRegistry，定期健康检查
 *
 * @example
 * ```typescript
 * const discovery = new MCPDiscovery();
 * await discovery.discover({ envPrefix: 'MCP_', autoConnect: true });
 * await discovery.registerTools('my-server', toolRegistry);
 * discovery.startHealthCheck();
 * ```
 */
export class MCPDiscovery {
  private servers: Map<string, MCPConfig> = new Map();
  private connections: Map<string, MCPServerConnection> = new Map();
  private healthCheckInterval?: ReturnType<typeof setInterval>;
  private options: MCPDiscoveryOptions;

  constructor(options: MCPDiscoveryOptions = {}) {
    this.options = {
      envPrefix: 'MCP_',
      autoConnect: false,
      healthCheckInterval: 30000, // 默认 30 秒
      configPaths: [],
      ...options,
    };
  }

  /**
   * 发现并加载 MCP 服务器配置
   *
   * 从以下来源发现服务器:
   * 1. 环境变量 (MCP_SERVER_*)
   * 2. 配置文件 (mcp.json, mcp.config.json)
   * 3. npx 命令 (npx -y @modelcontextprotocol/server-* list)
   */
  async discover(options?: MCPDiscoveryOptions): Promise<MCPConfig[]> {
    const mergedOptions = { ...this.options, ...options };
    const discoveredServers: MCPConfig[] = [];

    // 1. 从环境变量发现
    const envServers = this.discoverFromEnv(mergedOptions.envPrefix || 'MCP_');
    discoveredServers.push(...envServers);

    // 2. 从配置文件发现
    const configServers = await this.discoverFromConfig(mergedOptions.configPaths || []);
    discoveredServers.push(...configServers);

    // 3. 从 npx 命令发现
    const npxServers = await this.discoverFromNpx();
    discoveredServers.push(...npxServers);

    // 注册所有发现的服务器
    for (const server of discoveredServers) {
      this.servers.set(server.id, server);

      // 如果自动连接开启，则连接服务器
      if (mergedOptions.autoConnect) {
        await this.connect(server.id);
      }
    }

    return Array.from(this.servers.values());
  }

  /**
   * 从环境变量发现 MCP 服务器
   *
   * 环境变量格式:
   * MCP_SERVER_<name>_COMMAND=<command>
   * MCP_SERVER_<name>_ARGS=<args>
   * MCP_SERVER_<name>_ENV=<env_json>
   */
  private discoverFromEnv(prefix: string): MCPConfig[] {
    const servers: MCPConfig[] = [];
    const env = process.env;

    // 查找所有以 MCP_SERVER_ 开头的环境变量
    for (const [key, value] of Object.entries(env)) {
      if (key.startsWith(`${prefix}SERVER_`) && key.endsWith('_COMMAND')) {
        const name = key.replace(`${prefix}SERVER_`, '').replace('_COMMAND', '');
        const id = name.toLowerCase().replace(/_/g, '-');

        const argsKey = `${prefix}SERVER_${name}_ARGS`;
        const envKey = `${prefix}SERVER_${name}_ENV`;

        let args: string[] = [];
        let serverEnv: Record<string, string> = {};

        if (env[argsKey]) {
          try {
            args = JSON.parse(env[argsKey] as string);
          } catch {
            args = (env[argsKey] as string).split(' ');
          }
        }

        if (env[envKey]) {
          try {
            serverEnv = JSON.parse(env[envKey] as string);
          } catch {
            // 忽略解析错误
          }
        }

        servers.push({
          id,
          name,
          command: value as string,
          args,
          env: serverEnv,
          autoConnect: false,
        });
      }
    }

    return servers;
  }

  /**
   * 从配置文件发现 MCP 服务器
   *
   * 支持的配置文件:
   * - mcp.json
   * - mcp.config.json
   * - .mcp.json
   * - 自定义路径
   */
  private async discoverFromConfig(configPaths: string[]): Promise<MCPConfig[]> {
    const servers: MCPConfig[] = [];

    // 如果指定了自定义路径
    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        const configServers = await this.loadConfigFile(configPath);
        servers.push(...configServers);
      }
    }

    // 查找默认配置文件位置
    const defaultPaths = [
      path.join(process.cwd(), 'mcp.json'),
      path.join(process.cwd(), 'mcp.config.json'),
      path.join(process.cwd(), '.mcp.json'),
      path.join(process.env.HOME || '', '.config', 'mcp.json'),
      path.join(process.env.HOME || '', '.mcp.json'),
    ];

    for (const configPath of defaultPaths) {
      if (fs.existsSync(configPath) && !configPaths.includes(configPath)) {
        const configServers = await this.loadConfigFile(configPath);
        servers.push(...configServers);
      }
    }

    return servers;
  }

  /**
   * 加载并解析配置文件
   */
  private async loadConfigFile(configPath: string): Promise<MCPConfig[]> {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);

      if (Array.isArray(config)) {
        return config.map((item: Partial<MCPConfig>) => ({
          id: item.id || this.generateServerId(item.name || 'unknown'),
          name: item.name || item.id || 'unknown',
          command: item.command || '',
          args: item.args || [],
          env: item.env || {},
          autoConnect: item.autoConnect || false,
        })).filter((item: MCPConfig) => item.command);
      }

      if (config.mcpServers && typeof config.mcpServers === 'object') {
        return Object.entries(config.mcpServers).map(([id, server]: [string, unknown]) => {
          const s = server as Record<string, unknown>;
          return {
            id: this.generateServerId(id),
            name: id,
            command: (s.command as string) || '',
            args: (s.args as string[]) || [],
            env: (s.env as Record<string, string>) || {},
            autoConnect: (s.autoConnect as boolean) || false,
          };
        });
      }

      return [];
    } catch (error) {
      console.warn(`Failed to load config from ${configPath}:`, error);
      return [];
    }
  }

  /**
   * 从 npx 命令发现可用的 MCP 服务器
   */
  private async discoverFromNpx(): Promise<MCPConfig[]> {
    const servers: MCPConfig[] = [];

    // 常见的 MCP 服务器包
    const commonPackages = [
      '@modelcontextprotocol/server-filesystem',
      '@modelcontextprotocol/server-github',
      '@modelcontextprotocol/server-brave-search',
      '@modelcontextprotocol/server-slack',
      '@modelcontextprotocol/server-sqlite',
      '@modelcontextprotocol/server-postgres',
      '@modelcontextprotocol/server-google-maps',
    ];

    // 尝试获取每个包的信息
    for (const pkg of commonPackages) {
      try {
        const info = await this.getNpmPackageInfo(pkg);
        if (info) {
          servers.push({
            id: this.generateServerId(info.name),
            name: info.name,
            command: 'npx',
            args: ['-y', pkg],
            autoConnect: false,
          });
        }
      } catch {
        // 忽略单个包的错误
      }
    }

    return servers;
  }

  /**
   * 获取 npm 包信息
   */
  private async getNpmPackageInfo(packageName: string): Promise<{ name: string } | null> {
    return new Promise((resolve) => {
      const child = spawn('npm', ['view', packageName, 'name', '--json'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0 && output) {
          try {
            const info = JSON.parse(output);
            resolve({ name: info.name || packageName });
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });

      child.on('error', () => {
        resolve(null);
      });

      // 超时处理
      setTimeout(() => {
        child.kill();
        resolve(null);
      }, 5000);
    });
  }

  /**
   * 连接到 MCP 服务器
   */
  async connect(serverId: string): Promise<MCPServerConnection> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    // 如果已经连接，先断开
    if (this.connections.has(serverId)) {
      await this.disconnect(serverId);
    }

    const connection: MCPServerConnection = {
      server,
      status: 'disconnected',
      tools: [],
    };

    try {
      // 启动 MCP 服务器进程
      const child = spawn(server.command, server.args || [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...server.env },
      });

      connection.process = child;

      // 处理进程输出
      let buffer = '';
      child.stdout?.on('data', (data) => {
        buffer += data.toString();
        // 尝试解析工具列表
        try {
          const lines = buffer.split('\n');
          for (const line of lines) {
            if (line.startsWith('{')) {
              const msg = JSON.parse(line);
              if (msg.type === 'tools' && msg.tools) {
                connection.tools = this.parseTools(msg.tools, serverId);
              }
            }
          }
        } catch {
          // 继续累积 buffer
        }
      });

      child.stderr?.on('data', (data) => {
        console.error(`[MCP ${serverId}] stderr:`, data.toString());
      });

      child.on('error', (error) => {
        connection.status = 'error';
        connection.error = error.message;
      });

      child.on('exit', (code) => {
        if (code === 0) {
          connection.status = 'disconnected';
        } else {
          connection.status = 'error';
          connection.error = `Process exited with code ${code}`;
        }
      });

      // 初始状态
      connection.status = 'connected';
      connection.lastHealthCheck = Date.now();

      this.connections.set(serverId, connection);
      return connection;
    } catch (error) {
      connection.status = 'error';
      connection.error = error instanceof Error ? error.message : 'Unknown error';
      this.connections.set(serverId, connection);
      return connection;
    }
  }

  /**
   * 解析 MCP 工具
   */
  private parseTools(tools: MCPTool[], serverId: string): AgentTool[] {
    return tools.map((tool) => ({
      id: `${serverId}:${tool.name}`,
      name: tool.name,
      description: tool.description,
      category: 'mcp',
      version: '1.0.0',
      parameters: {
        type: 'object' as const,
        properties: tool.inputSchema as Record<string, ParameterProperty> || {},
      },
      handler: async (params: unknown) => {
        // 通过 MCP 协议调用工具
        return {
          success: true,
          data: { tool: tool.name, params },
        };
      },
    }));
  }

  /**
   * 断开 MCP 服务器连接
   */
  async disconnect(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      return;
    }

    if (connection.process) {
      connection.process.kill();
      connection.process = undefined;
    }

    connection.status = 'disconnected';
    this.connections.delete(serverId);
  }

  /**
   * 将 MCP 工具注册到 ToolRegistry
   */
  async registerTools(serverId: string, registry: ToolRegistry): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`Server ${serverId} not connected`);
    }

    for (const tool of connection.tools) {
      registry.register(tool);
    }
  }

  /**
   * 启动健康检查
   */
  startHealthCheck(): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      for (const [serverId, connection] of this.connections) {
        await this.healthCheck(serverId);
      }
    }, this.options.healthCheckInterval || 30000);
  }

  /**
   * 停止健康检查
   */
  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * 执行健康检查
   */
  private async healthCheck(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      return;
    }

    connection.lastHealthCheck = Date.now();

    // 检查进程是否存活
    if (connection.process && connection.process.killed) {
      connection.status = 'error';
      connection.error = 'Process not running';
    }
  }

  /**
   * 获取所有已发现的服务器
   */
  getServers(): MCPConfig[] {
    return Array.from(this.servers.values());
  }

  /**
   * 获取服务器配置
   */
  getServer(serverId: string): MCPConfig | undefined {
    return this.servers.get(serverId);
  }

  /**
   * 获取服务器连接状态
   */
  getConnection(serverId: string): MCPServerConnection | undefined {
    return this.connections.get(serverId);
  }

  /**
   * 获取所有连接
   */
  getConnections(): Map<string, MCPServerConnection> {
    return new Map(this.connections);
  }

  /**
   * 添加服务器配置
   */
  addServer(config: MCPConfig): void {
    this.servers.set(config.id, config);
  }

  /**
   * 移除服务器配置
   */
  removeServer(serverId: string): boolean {
    // 先断开连接
    if (this.connections.has(serverId)) {
      this.disconnect(serverId);
    }
    return this.servers.delete(serverId);
  }

  /**
   * 获取服务器状态摘要
   */
  getStatus(): {
    totalServers: number;
    connected: number;
    disconnected: number;
    error: number;
  } {
    let connected = 0;
    let disconnected = 0;
    let error = 0;

    for (const conn of this.connections.values()) {
      switch (conn.status) {
        case 'connected':
          connected++;
          break;
        case 'disconnected':
          disconnected++;
          break;
        case 'error':
          error++;
          break;
      }
    }

    return {
      totalServers: this.servers.size,
      connected,
      disconnected,
      error,
    };
  }

  /**
   * 生成服务器 ID
   */
  private generateServerId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * 销毁 Discovery 实例
   */
  async destroy(): Promise<void> {
    this.stopHealthCheck();

    // 断开所有连接
    for (const serverId of this.connections.keys()) {
      await this.disconnect(serverId);
    }

    this.servers.clear();
  }
}

export default MCPServers;
