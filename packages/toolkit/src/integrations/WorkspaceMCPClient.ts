import { spawn, type ChildProcess } from "child_process";
import { ToolRegistry } from "../tools/ToolRegistry.js";
import type { AgentTool, ParameterProperty } from "../tools/types.js";

export interface WorkspaceMCPService {
  id: string;
  name: string;
  description: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  port?: number;
}

export interface ConnectedMCPService {
  name: string;
  tools: string[];
  status: "connected" | "error";
  error?: string;
}

interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

const RPC_TIMEOUT = 10_000;

export class WorkspaceMCPClient {
  private registry: ToolRegistry;
  private services: WorkspaceMCPService[] = [];
  private connections: Map<string, ConnectedMCPService> = new Map();
  private connected = false;
  private processes: Map<string, ChildProcess> = new Map();
  private rpcId = 1;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  async discoverServices(): Promise<WorkspaceMCPService[]> {
    const services = await this._fetchFromAgora();
    if (services.length > 0) {
      this.services = services;
      return services;
    }
    this.services = [
      { id: "minerva", name: "minerva", description: "Deep research system (L0-L4)", command: "minerva-mcp" },
      { id: "sophia", name: "sophia", description: "Symbolic research paradigm engine", command: "sophia-mcp" },
      { id: "agora", name: "agora", description: "MCP service hub", command: "agora-mcp" },
    ];
    return this.services;
  }

  async connectAll(): Promise<ConnectedMCPService[]> {
    if (this.services.length === 0) await this.discoverServices();
    const promises = this.services.map((svc) => this._connectService(svc));
    await Promise.allSettled(promises);
    this.connected = true;
    return Array.from(this.connections.values());
  }

  async registerAllTools(): Promise<number> {
    let count = 0;
    for (const svc of this.services) {
      count += await this._registerServiceTools(svc);
    }
    return count;
  }

  getStatus() {
    let connected = 0, errors = 0;
    for (const conn of this.connections.values()) {
      if (conn.status === "connected") connected++;
      else errors++;
    }
    return {
      total: this.services.length, connected, errors,
      services: Array.from(this.connections.values()),
    };
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    for (const [id, proc] of this.processes) {
      try { proc.kill(); } catch { /* ignore */ }
    }
    this.processes.clear();
    this.connections.clear();
    this.connected = false;
  }

  // ── MCP Stdio Protocol ──

  private async _connectService(svc: WorkspaceMCPService): Promise<void> {
    if (!svc.command) {
      this.connections.set(svc.id, { name: svc.name, tools: [], status: "connected" });
      return;
    }
    try {
      const tools = await this._mcpHandshake(svc);
      this.connections.set(svc.id, { name: svc.name, tools, status: "connected" });
    } catch (err) {
      this.connections.set(svc.id, {
        name: svc.name, tools: [], status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async _mcpHandshake(svc: WorkspaceMCPService): Promise<string[]> {
    const proc = spawn(svc.command!, svc.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...svc.env },
    });
    this.processes.set(svc.id, proc);

    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    let buffer = "";

    proc.stdout!.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg: MCPResponse = JSON.parse(line);
          const p = pending.get(msg.id);
          if (p) {
            clearTimeout(p.timer);
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error.message));
            else p.resolve(msg.result);
          }
        } catch { /* skip incomplete or non-JSON lines */ }
      }
    });

    proc.stderr!.on("data", () => { /* MCP servers log to stderr, ignore */ });

    const send = (method: string, params: Record<string, unknown> = {}): Promise<unknown> => {
      const id = this.rpcId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`RPC timeout: ${method}`));
        }, RPC_TIMEOUT);
        pending.set(id, { resolve, reject, timer });
        proc.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    };

    proc.on("close", () => {
      for (const [, p] of pending) {
        clearTimeout(p.timer);
        p.reject(new Error("MCP process exited"));
      }
      pending.clear();
    });

    // Step 1: Initialize
    await send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "agentmesh-toolkit", version: "2.0.0" },
    });

    // Step 2: List tools
    const toolResult = await send("tools/list");
    const toolDefs = (toolResult as { tools?: MCPToolDefinition[] })?.tools ?? [];
    const toolNames = toolDefs.map((t) => t.name);

    // Register each tool with proper MCP call handler
    for (const def of toolDefs) {
      const params: Record<string, ParameterProperty> = {};
      if (def.inputSchema?.properties) {
        for (const [key, val] of Object.entries(def.inputSchema.properties)) {
          params[key] = { type: typeof (val as Record<string, unknown>).type === "string" ? (val as Record<string, unknown>).type as string : "string" } as ParameterProperty;
        }
      }
      const tool: AgentTool = {
        id: `workspace:${svc.id}:${def.name}`,
        name: `${svc.name}_${def.name}`,
        description: def.description ?? `${svc.name} MCP tool`,
        category: "workspace-mcp",
        version: "1.0.0",
        parameters: { type: "object", properties: params },
        handler: async (callParams: unknown) => {
          try {
            const result = await send("tools/call", { name: def.name, arguments: callParams });
            return { success: true, data: result };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
      };
      this.registry.register(tool);
    }

    return toolNames;
  }

  private async _registerServiceTools(svc: WorkspaceMCPService): Promise<number> {
    for (const [, proc] of this.processes) {
      if (proc.exitCode !== null) return 0;
    }
    return 0;
  }

  // ── Fallback: Agora registry discovery ──

  private async _fetchFromAgora(): Promise<WorkspaceMCPService[]> {
    return new Promise((resolve) => {
      const child = spawn("agora", ["list", "--json"], { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      child.stdout?.on("data", (d: Buffer) => (output += d.toString()));
      child.on("close", (code) => {
        if (code !== 0 || !output.trim()) { resolve([]); return; }
        try {
          const parsed = JSON.parse(output);
          const list = Array.isArray(parsed) ? parsed : parsed.services ?? [];
          resolve(list.map((svc: Record<string, unknown>) => ({
            id: String(svc.name ?? svc.id ?? ""),
            name: String(svc.name ?? ""),
            description: String(svc.description ?? ""),
            command: svc.command ? String(svc.command) : undefined,
            args: Array.isArray(svc.args) ? svc.args.map(String) : undefined,
          })));
        } catch { resolve([]); }
      });
      child.on("error", () => resolve([]));
    });
  }
}
