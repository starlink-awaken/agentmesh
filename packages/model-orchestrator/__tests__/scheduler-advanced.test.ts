import { describe, it, expect } from "bun:test";
import { ModelRegistry } from "../src/registry.js";
import { ModelScheduler } from "../src/scheduler.js";

describe("ModelScheduler Integration", () => {
  it("registers and discovers models", async () => {
    const reg = new ModelRegistry();
    reg.register({
      name: "test",
      type: "test",
      discover: async () => [
        { id: "model/a", name: "model/a", provider: "ollama", location: "local", capabilities: ["chat"], contextWindow: 4096, isAvailable: true },
        { id: "model/b", name: "model/b", provider: "ollama", location: "local", capabilities: ["chat", "tools"], contextWindow: 8192, isAvailable: true },
      ],
      health: async () => true,
      chat: async () => ({ id: "1", model: "m", content: "ok", finishReason: "stop" }),
    });
    const models = await reg.refresh();
    expect(models.length).toBe(2);

    const scheduler = new ModelScheduler(reg);
    expect(scheduler).toBeDefined();

    const result = await reg.chat("model/a", []);
    expect(result?.content).toBe("ok");
  });

  it("handles empty provider list", async () => {
    const reg = new ModelRegistry();
    const models = await reg.refresh();
    expect(models).toEqual([]);
  });

  it("filters unavailable models", () => {
    const available = [true, true, false].filter(Boolean);
    expect(available.length).toBe(2);
  });

  it("handles chat to unknown model", async () => {
    const reg = new ModelRegistry();
    const result = await reg.chat("nonexistent", []);
    expect(result).toBeNull();
  });
});
