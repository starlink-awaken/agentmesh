/**
 * Tests for MessageBus - pub/sub, request/response, history, FIFO eviction.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { MessageBus, type MessageHandler } from '../src/message-bus.ts';
import type { AgentMessage } from '../src/types.ts';

describe('MessageBus', () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  // ============================================================
  // createMessage
  // ============================================================

  describe('createMessage', () => {
    test('creates a well-formed message', () => {
      const msg = bus.createMessage('agentA', 'agentB', 'request', {
        data: 1,
      });
      expect(msg.id).toBeTruthy();
      expect(msg.from).toBe('agentA');
      expect(msg.to).toBe('agentB');
      expect(msg.type).toBe('request');
      expect(msg.payload).toEqual({ data: 1 });
      expect(msg.priority).toBe(1); // NORMAL
      expect(msg.context_shards).toEqual([]);
      expect(msg.timestamp).toBeGreaterThan(0);
      expect(msg.trace_id).toBeTruthy();
    });

    test('uses provided traceId', () => {
      const msg = bus.createMessage('a', 'b', 'event', null, 'trace-123');
      expect(msg.trace_id).toBe('trace-123');
    });

    test('generates unique IDs for different messages', () => {
      const m1 = bus.createMessage('a', 'b', 'event', null);
      const m2 = bus.createMessage('a', 'b', 'event', null);
      expect(m1.id).not.toBe(m2.id);
    });
  });

  // ============================================================
  // generateTraceId
  // ============================================================

  describe('generateTraceId', () => {
    test('generates unique trace IDs', () => {
      const t1 = bus.generateTraceId();
      const t2 = bus.generateTraceId();
      expect(t1).not.toBe(t2);
    });
  });

  // ============================================================
  // subscribe & send
  // ============================================================

  describe('subscribe and send', () => {
    test('subscriber receives messages addressed to them', () => {
      const received: AgentMessage[] = [];
      bus.subscribe('agentB', (msg) => received.push(msg));

      const msg = bus.createMessage('agentA', 'agentB', 'request', 'hello');
      bus.send(msg);

      expect(received.length).toBe(1);
      expect(received[0].payload).toBe('hello');
    });

    test('subscriber does not receive messages to other agents', () => {
      const received: AgentMessage[] = [];
      bus.subscribe('agentC', (msg) => received.push(msg));

      const msg = bus.createMessage('agentA', 'agentB', 'request', 'hello');
      bus.send(msg);

      expect(received.length).toBe(0);
    });

    test('multiple subscribers on same agent all receive', () => {
      const r1: AgentMessage[] = [];
      const r2: AgentMessage[] = [];
      bus.subscribe('agentB', (msg) => r1.push(msg));
      bus.subscribe('agentB', (msg) => r2.push(msg));

      const msg = bus.createMessage('a', 'agentB', 'event', 'data');
      bus.send(msg);

      expect(r1.length).toBe(1);
      expect(r2.length).toBe(1);
    });

    test('unsubscribe stops receiving messages', () => {
      const received: AgentMessage[] = [];
      const unsub = bus.subscribe('agentB', (msg) => received.push(msg));

      const msg1 = bus.createMessage('a', 'agentB', 'event', '1');
      bus.send(msg1);
      expect(received.length).toBe(1);

      unsub();

      const msg2 = bus.createMessage('a', 'agentB', 'event', '2');
      bus.send(msg2);
      expect(received.length).toBe(1); // no new message
    });
  });

  // ============================================================
  // subscribeToType
  // ============================================================

  describe('subscribeToType', () => {
    test('receives messages matching the type', () => {
      const received: AgentMessage[] = [];
      bus.subscribeToType('feedback', (msg) => received.push(msg));

      const msg = bus.createMessage('a', 'b', 'feedback', 'fb');
      bus.send(msg);

      expect(received.length).toBe(1);
    });

    test('does not receive messages of other types', () => {
      const received: AgentMessage[] = [];
      bus.subscribeToType('feedback', (msg) => received.push(msg));

      const msg = bus.createMessage('a', 'b', 'request', 'req');
      bus.send(msg);

      expect(received.length).toBe(0);
    });

    test('unsubscribe stops receiving type messages', () => {
      const received: AgentMessage[] = [];
      const unsub = bus.subscribeToType('event', (msg) => received.push(msg));

      bus.send(bus.createMessage('a', 'b', 'event', '1'));
      unsub();
      bus.send(bus.createMessage('a', 'b', 'event', '2'));

      expect(received.length).toBe(1);
    });
  });

  // ============================================================
  // broadcast
  // ============================================================

  describe('broadcast', () => {
    test('delivers to all agent subscribers', () => {
      const r1: AgentMessage[] = [];
      const r2: AgentMessage[] = [];
      bus.subscribe('agent1', (msg) => r1.push(msg));
      bus.subscribe('agent2', (msg) => r2.push(msg));

      const msg = bus.createMessage('orchestrator', '*', 'event', 'broadcast');
      // broadcast expects Omit<AgentMessage, 'to'>, but we can just pass
      const { to: _to, ...broadcastMsg } = msg;
      bus.broadcast(broadcastMsg);

      expect(r1.length).toBe(1);
      expect(r2.length).toBe(1);
      expect(r1[0].to).toBe('*');
    });

    test('broadcasts also dispatch to type subscribers', () => {
      const received: AgentMessage[] = [];
      bus.subscribeToType('event', (msg) => received.push(msg));

      const msg = bus.createMessage('orchestrator', '*', 'event', 'bcast');
      const { to: _to, ...broadcastMsg } = msg;
      bus.broadcast(broadcastMsg);

      expect(received.length).toBe(1);
    });
  });

  // ============================================================
  // request / response
  // ============================================================

  describe('request and response', () => {
    test('request resolves when a reply is sent', async () => {
      // Set up a responder
      bus.subscribe('responder', (msg) => {
        const reply = bus.createMessage(
          'responder',
          msg.from,
          'response',
          'pong',
        );
        (reply as any).reply_to = msg.id;
        bus.send(reply);
      });

      const response = await bus.request('requester', 'responder', 'ping', 5000);
      expect(response.payload).toBe('pong');
      expect(response.from).toBe('responder');
    });

    test('request times out if no reply', async () => {
      try {
        await bus.request('requester', 'nobody', 'ping', 100);
        // Should not reach here
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.message).toContain('timed out');
      }
    });
  });

  // ============================================================
  // History
  // ============================================================

  describe('history', () => {
    test('records all sent messages', () => {
      bus.send(bus.createMessage('a', 'b', 'event', '1'));
      bus.send(bus.createMessage('c', 'd', 'request', '2'));

      const history = bus.getHistory();
      expect(history.length).toBe(2);
    });

    test('getHistory returns newest first', () => {
      bus.send(bus.createMessage('a', 'b', 'event', 'first'));
      bus.send(bus.createMessage('a', 'b', 'event', 'second'));

      const history = bus.getHistory();
      expect(history[0].payload).toBe('second');
      expect(history[1].payload).toBe('first');
    });

    test('getHistory filters by agent name', () => {
      bus.send(bus.createMessage('a', 'b', 'event', '1'));
      bus.send(bus.createMessage('c', 'd', 'event', '2'));
      bus.send(bus.createMessage('b', 'a', 'event', '3'));

      const history = bus.getHistory('a');
      // 'a' is sender in msg1, receiver in msg3
      expect(history.length).toBe(2);
    });

    test('getHistory respects limit', () => {
      for (let i = 0; i < 10; i++) {
        bus.send(bus.createMessage('a', 'b', 'event', `msg-${i}`));
      }
      const history = bus.getHistory(undefined, 3);
      expect(history.length).toBe(3);
    });

    test('getMessagesByTraceId returns messages with same trace', () => {
      const traceId = 'shared-trace';
      const m1 = bus.createMessage('a', 'b', 'request', '1', traceId);
      const m2 = bus.createMessage('b', 'a', 'response', '2', traceId);
      const m3 = bus.createMessage('a', 'c', 'event', '3'); // different trace
      bus.send(m1);
      bus.send(m2);
      bus.send(m3);

      const traceMessages = bus.getMessagesByTraceId(traceId);
      expect(traceMessages.length).toBe(2);
    });
  });

  // ============================================================
  // FIFO Eviction
  // ============================================================

  describe('FIFO eviction', () => {
    test('history does not exceed MAX_HISTORY (10000)', () => {
      // Send 10050 messages
      for (let i = 0; i < 10050; i++) {
        bus.send(bus.createMessage('a', 'b', 'event', `msg-${i}`));
      }
      const history = bus.getHistory();
      expect(history.length).toBeLessThanOrEqual(10000);
    });
  });

  // ============================================================
  // Stats
  // ============================================================

  describe('stats', () => {
    test('returns aggregate statistics', () => {
      bus.send(bus.createMessage('a', 'b', 'event', '1'));
      bus.send(bus.createMessage('a', 'b', 'request', '2'));
      bus.send(bus.createMessage('c', 'd', 'event', '3'));

      const stats = bus.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byType['event']).toBe(2);
      expect(stats.byType['request']).toBe(1);
      expect(stats.byAgent['a']).toBe(2); // sender in 2 messages
    });
  });

  // ============================================================
  // Error Handling (safeInvoke)
  // ============================================================

  describe('error handling in handlers', () => {
    test('subscriber errors do not affect other subscribers', () => {
      const received: AgentMessage[] = [];
      bus.subscribe('target', () => {
        throw new Error('handler crash');
      });
      bus.subscribe('target', (msg) => received.push(msg));

      const msg = bus.createMessage('a', 'target', 'event', 'data');
      bus.send(msg);

      expect(received.length).toBe(1);
    });
  });

  // ============================================================
  // clear
  // ============================================================

  describe('clear', () => {
    test('clears history, subscriptions, and pending requests', () => {
      bus.subscribe('agent', () => {});
      bus.send(bus.createMessage('a', 'b', 'event', '1'));

      bus.clear();

      expect(bus.getHistory()).toEqual([]);
      expect(bus.getStats().total).toBe(0);
    });

    test('pending requests are rejected on clear', async () => {
      const promise = bus.request('a', 'b', 'ping', 30000);
      bus.clear();

      try {
        await promise;
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.message).toContain('cleared');
      }
    });
  });
});
