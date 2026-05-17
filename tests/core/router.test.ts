import { describe, test, expect, beforeEach } from 'bun:test';
import { Router } from '../../src/core/router.js';
import type { Agent, AgentMessage } from '../../src/types/index.js';
import type { RoutingRule } from '../../src/core/config.js';

function makeAgent(id: string, caps: string[], status: Agent['status'] = 'online'): Agent {
  return { id, name: `Agent ${id}`, type: 'process', capabilities: caps, status, lastSeen: Date.now() };
}

describe('agent router', () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
  });

  test('registers and retrieves agents', () => {
    router.registerAgent(makeAgent('test-agent', ['code-generation']));
    expect(router.getAgent('test-agent')!.id).toBe('test-agent');
  });

  test('unregisters agents', () => {
    router.registerAgent(makeAgent('test-agent', ['code-generation']));
    router.unregisterAgent('test-agent');
    expect(router.getAgent('test-agent')).toBeUndefined();
  });

  test('filters offline from online agents', () => {
    router.registerAgent(makeAgent('a', ['x'], 'online'));
    router.registerAgent(makeAgent('b', ['x'], 'offline'));
    router.registerAgent(makeAgent('c', ['x'], 'online'));
    expect(router.getOnlineAgents()).toHaveLength(2);
  });

  test('routes by keyword match', () => {
    const rules: RoutingRule[] = [
      { name: 'review', keywords: ['review', 'code review'], agent: 'review-bot', priority: 15 },
      { name: 'code', keywords: ['write code'], agent: 'code-bot', priority: 10 },
    ];
    router.configure(rules, 'fallback');
    router.registerAgent(makeAgent('review-bot', ['review']));
    router.registerAgent(makeAgent('code-bot', ['coding']));
    router.registerAgent(makeAgent('fallback', ['general']));

    const msg: AgentMessage = {
      id: '1', type: 'request', source: 'test', target: 'gateway',
      correlation_id: '1', timestamp: Date.now(),
      payload: { task: 'please review this code' },
    };
    const result = router.route(msg);
    expect(result.agentIds).toContain('review-bot');
  });

  test('higher priority wins when keywords overlap', () => {
    const rules: RoutingRule[] = [
      { name: 'low', keywords: ['code'], agent: 'low', priority: 5 },
      { name: 'high', keywords: ['code'], agent: 'high', priority: 20 },
    ];
    router.configure(rules);
    router.registerAgent(makeAgent('low', ['general']));
    router.registerAgent(makeAgent('high', ['general']));

    const msg: AgentMessage = {
      id: '1', type: 'request', source: 'test', target: 'gateway',
      correlation_id: '1', timestamp: Date.now(),
      payload: { task: 'help with code' },
    };
    expect(router.route(msg).agentIds).toContain('high');
  });

  test('falls back to default when no rule matches', () => {
    router.configure([], 'default-bot');
    router.registerAgent(makeAgent('default-bot', ['general']));

    const msg: AgentMessage = {
      id: '1', type: 'request', source: 'test', target: 'gateway',
      correlation_id: '1', timestamp: Date.now(),
      payload: { task: 'something unrelated' },
    };
    expect(router.route(msg).agentIds).toContain('default-bot');
  });

  test('skips offline agents and uses fallback', () => {
    router.configure(
      [{ name: 'code', keywords: ['code'], agent: 'offline-bot', priority: 10 }],
      'online-fallback'
    );
    router.registerAgent(makeAgent('offline-bot', ['coding'], 'offline'));
    router.registerAgent(makeAgent('online-fallback', ['general'], 'online'));

    const msg: AgentMessage = {
      id: '1', type: 'request', source: 'test', target: 'gateway',
      correlation_id: '1', timestamp: Date.now(),
      payload: { task: 'write code' },
    };
    expect(router.route(msg).agentIds).toContain('online-fallback');
  });
});
