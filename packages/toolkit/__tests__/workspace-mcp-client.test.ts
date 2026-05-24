import { describe, it, expect } from "bun:test";
import { ToolRegistry } from "../src/tools/ToolRegistry.js";
import { WorkspaceMCPClient } from "../src/integrations/WorkspaceMCPClient.js";

function createClient(services?: any[]): WorkspaceMCPClient {
  const registry = new ToolRegistry();
  const client = new WorkspaceMCPClient(registry);
  if (services) (client as any).services = services;
  return client;
}

describe("WorkspaceMCPClient", () => {
  it("creates client with empty state", () => {
    const client = createClient();
    expect(client.isConnected()).toBe(false);
    const status = client.getStatus();
    expect(status.total).toBe(0);
    expect(status.connected).toBe(0);
    expect(status.errors).toBe(0);
  });

  it("uses fallback services when Agora CLI unavailable", async () => {
    const client = createClient();
    const svcs = await client.discoverServices();
    expect(svcs.length).toBeGreaterThanOrEqual(3);
    const names = svcs.map((s) => s.id);
    expect(names).toContain("minerva");
    expect(names).toContain("sophia");
    expect(names).toContain("agora");
  });

  it("returns status after discovery", async () => {
    const client = createClient();
    await client.discoverServices();
    const status = client.getStatus();
    expect(status.total).toBeGreaterThanOrEqual(3);
  });

  it("registers tools from preloaded services", async () => {
    const registry = new ToolRegistry();
    const client = new WorkspaceMCPClient(registry);
    (client as any).services = [
      { id: "s1", name: "s1", description: "svc1", command: "cmd1" },
      { id: "s2", name: "s2", description: "svc2", command: "cmd2" },
    ];
    const count = await client.registerAllTools();
    expect(count).toBe(0);
  });

  it("tracks connection status after connect (no-command)", async () => {
    const client = createClient([
      { id: "test-svc", name: "Test Svc", description: "A test service" },
    ]);
    const results = await client.connectAll();
    expect(results.length).toBe(1);
    expect(results[0].name).toBe("Test Svc");
    expect(results[0].status).toBe("connected");
  });

  it("disconnect cleanup works", () => {
    const client = createClient();
    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it("handles mixed connection states", async () => {
    const registry = new ToolRegistry();
    const client = new WorkspaceMCPClient(registry);
    (client as any).services = [
      { id: "a", name: "A", description: "svc a" },
      { id: "b", name: "B", description: "svc b" },
    ];
    await client.connectAll();
    const status = client.getStatus();
    expect(status.total).toBe(2);
  });
});
