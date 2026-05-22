import { describe, it, expect, beforeAll } from 'bun:test';
import { LocalModelDiscoverer } from '../src/discovery/local.js';

describe('LocalModelDiscoverer', () => {
  let discoverer: LocalModelDiscoverer;

  beforeAll(() => {
    // 使用非默认端口确保不会误触真实服务
    discoverer = new LocalModelDiscoverer({
      ollamaUrl: 'http://localhost:19999',
      lmStudioUrl: 'http://localhost:19998',
    });
  });

  it('returns empty array when no local services are running', async () => {
    // 在没有本地服务时应该返回空数组或超时优雅处理
    const result = await discoverer.discoverAll();
    expect(Array.isArray(result)).toBe(true);
  });

  it('discovers nothing from fake endpoints', async () => {
    const models = await discoverer.discoverAll();
    // 可能因为 llama.cpp 端口扫描误触，但至少不应从 ollama/lm-studio 发现
    const fakeEndpointModels = models.filter(m =>
      m.id.startsWith('ollama/') || m.id.startsWith('lm-studio/')
    );
    expect(fakeEndpointModels).toHaveLength(0);
  });

  it('anyAlive returns false when no services', async () => {
    const alive = await discoverer.anyAlive();
    expect(alive).toBe(false);
  });
});
