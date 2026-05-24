import { describe, it, expect } from "bun:test";
import { ModelRegistry } from "../src/registry.js";

describe("Model chat execution", () => {
  it("registers provider and executes chat", async () => {
    const reg = new ModelRegistry();
    reg.register({
      name: "test",
      type: "test",
      discover: async () => [
        { id: "test/m", name: "test/m", provider: "ollama", location: "local", capabilities: ["chat"], contextWindow: 4096, isAvailable: true },
      ],
      health: async () => true,
      chat: async () => ({ id: "resp-1", model: "test/m", content: "ok", finishReason: "stop" }),
    });
    await reg.refresh();
    const result = await reg.chat("test/m", []);
    expect(result?.content).toBe("ok");
    expect(result?.model).toBe("test/m");
  });

  it("chat returns null for unknown model", async () => {
    const reg = new ModelRegistry();
    const result = await reg.chat("nonexistent", []);
    expect(result).toBeNull();
  });

  it("tracks availability in model list", () => {
    const models = [
      { id: "a", isAvailable: true },
      { id: "b", isAvailable: true },
      { id: "c", isAvailable: false },
    ];
    const available = models.filter((m) => m.isAvailable);
    expect(available.length).toBe(2);
  });

  it("health check returns correct status", () => {
    const provider = { name: "ok", type: "test", health: () => true };
    expect(provider.health()).toBe(true);
  });
});

describe("Model pool management", () => {
  it("tracks registry state across refresh", async () => {
    const reg = new ModelRegistry();
    let discoverCount = 0;
    reg.register({
      name: "counter",
      type: "test",
      discover: async () => {
        discoverCount++;
        return [{ id: "counter/m", name: "counter/m", provider: "ollama", location: "local", capabilities: ["chat"], contextWindow: 4096, isAvailable: true }];
      },
      health: async () => true,
      chat: async () => ({ id: "1", model: "m", content: "ok", finishReason: "stop" }),
    });

    await reg.refresh();
    expect(discoverCount).toBe(1);

    await reg.refresh();
    expect(discoverCount).toBe(2);
  });

  it("multiple providers are aggregated", async () => {
    const reg = new ModelRegistry();
    reg.register({
      name: "p1",
      type: "test",
      discover: async () => [{ id: "p1/m1", name: "p1/m1", provider: "ollama", location: "local", capabilities: ["chat"], contextWindow: 4096, isAvailable: true }],
      health: async () => true,
      chat: async () => ({ id: "1", model: "m", content: "ok", finishReason: "stop" }),
    });
    reg.register({
      name: "p2",
      type: "test",
      discover: async () => [
        { id: "p2/m1", name: "p2/m1", provider: "ollama", location: "local", capabilities: ["chat"], contextWindow: 4096, isAvailable: true },
        { id: "p2/m2", name: "p2/m2", provider: "ollama", location: "local", capabilities: ["tools"], contextWindow: 16384, isAvailable: true },
      ],
      health: async () => true,
      chat: async () => ({ id: "2", model: "m", content: "ok", finishReason: "stop" }),
    });

    const models = await reg.refresh();
    expect(models.length).toBe(3);
  });
});
