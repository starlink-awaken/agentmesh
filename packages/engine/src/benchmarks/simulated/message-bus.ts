/**
 * Honeycomb v2 - 消息总线性能基准测试
 *
 * 测试 MessageBus 的吞吐量、延迟和订阅性能
 */

import { MessageBus } from '../../message-bus.js';
import { calculateStats, collectSamples } from '../utils.js';
import type { MessageBusResult } from '../types.js';
import type { MessageType } from '../../types.js';

// ============================================================
// 基准测试：单个消息发送延迟
// ============================================================

/**
 * 基准测试：单个消息发送延迟
 */
export async function benchMessageSendLatency(samples: number = 10000): Promise<MessageBusResult> {
  const bus = new MessageBus();

  // 添加一个订阅者以触发分发
  let receivedCount = 0;
  bus.subscribe('receiver', () => {
    receivedCount++;
  });

  const durationsMs: number[] = [];

  for (let i = 0; i < samples; i++) {
    const start = performance.now();

    const msg = bus.createMessage('sender', 'receiver', 'event' as MessageType, { index: i }, `trace-${i}`);
    bus.send(msg);

    durationsMs.push(performance.now() - start);
  }

  const stats = calculateStats(durationsMs);

  return {
    type: 'message-bus',
    name: 'Message Send Latency',
    description: `发送 ${samples} 条消息的延迟 (${samples} 个样本)`,
    stats,
    messageCount: samples,
    senderCount: 1,
    throughput: {
      opsPerSecond: (samples * 1000) / durationsMs.reduce((a, b) => a + b, 0),
      totalOps: samples,
      totalDurationMs: durationsMs.reduce((a, b) => a + b, 0),
    },
    passed: stats.avg < 0.1, // 目标：< 0.1ms
    threshold: 0.1,
  };
}

// ============================================================
// 基准测试：批量消息吞吐量
// ============================================================

/**
 * 基准测试：批量消息吞吐量（单发送者）
 */
export async function benchThroughputSingleSender(messageCount: number = 10000): Promise<MessageBusResult> {
  const bus = new MessageBus();

  // 添加订阅者
  bus.subscribe('receiver', () => {});

  const { durationsMs } = collectSamples(
    () => {
      const msg = bus.createMessage('sender', 'receiver', 'event' as MessageType, {});
      bus.send(msg);
    },
    messageCount,
  );

  const stats = calculateStats(durationsMs);
  const totalDurationMs = durationsMs.reduce((a, b) => a + b, 0);

  return {
    type: 'message-bus',
    name: `Throughput - Single Sender (${messageCount} messages)`,
    description: `单发送者发送 ${messageCount} 条消息的吞吐量`,
    stats,
    messageCount,
    senderCount: 1,
    throughput: {
      opsPerSecond: (messageCount * 1000) / totalDurationMs,
      totalOps: messageCount,
      totalDurationMs,
    },
    passed: ((messageCount * 1000) / totalDurationMs) > 100000, // 目标：> 100,000 msg/s
    threshold: 100000,
  };
}

// ============================================================
// 基准测试：多发送者吞吐量
// ============================================================

/**
 * 基准测试：多发送者吞吐量
 */
export async function benchThroughputMultipleSenders(
  senderCount: number = 5,
  messagesPerSender: number = 2000,
): Promise<MessageBusResult> {
  const bus = new MessageBus();

  // 添加订阅者
  for (let i = 0; i < senderCount; i++) {
    bus.subscribe(`receiver-${i}`, () => {});
  }

  const start = performance.now();

  for (let i = 0; i < senderCount; i++) {
    for (let j = 0; j < messagesPerSender; j++) {
      const msg = bus.createMessage(`sender-${i}`, `receiver-${j % senderCount}`, 'event' as MessageType, { index: j });
      bus.send(msg);
    }
  }

  const totalDurationMs = performance.now() - start;
  const totalMessages = senderCount * messagesPerSender;

  // 计算单条消息的平均时间
  const avgMs = totalDurationMs / totalMessages;

  const stats = calculateStats([avgMs]);

  return {
    type: 'message-bus',
    name: `Throughput - Multiple Senders (${senderCount} senders)`,
    description: `${senderCount} 个发送者，每人 ${messagesPerSender} 条消息的吞吐量`,
    stats,
    messageCount: totalMessages,
    senderCount,
    throughput: {
      opsPerSecond: (totalMessages * 1000) / totalDurationMs,
      totalOps: totalMessages,
      totalDurationMs,
    },
    passed: ((totalMessages * 1000) / totalDurationMs) > 50000, // 目标：> 50,000 msg/s
    threshold: 50000,
  };
}

// ============================================================
// 基准测试：订阅/取消订阅性能
// ============================================================

/**
 * 基准测试：订阅性能
 */
export async function benchSubscribePerformance(subscriberCount: number = 100): Promise<MessageBusResult> {
  const bus = new MessageBus();

  const samples = 100;
  const durationsMs: number[] = [];

  for (let i = 0; i < samples; i++) {
    const start = performance.now();

    // 创建临时订阅者
    const unsubscribes: Array<() => void> = [];
    for (let j = 0; j < subscriberCount; j++) {
      unsubscribes.push(bus.subscribe(`agent-${j}`, () => {}));
    }

    durationsMs.push(performance.now() - start);

    // 清理
    for (const unsub of unsubscribes) {
      unsub();
    }
  }

  const stats = calculateStats(durationsMs.map((d) => d / subscriberCount));

  return {
    type: 'message-bus',
    name: `Subscribe Performance (${subscriberCount} subscribers)`,
    description: `添加 ${subscriberCount} 个订阅者的平均时间`,
    stats,
    messageCount: subscriberCount,
    senderCount: 1,
    passed: stats.avg < 0.01, // 目标：每次订阅 < 0.01ms
    threshold: 0.01,
  };
}

/**
 * 基准测试：取消订阅性能
 */
export async function benchUnsubscribePerformance(subscriberCount: number = 100): Promise<MessageBusResult> {
  const bus = new MessageBus();

  // 先创建订阅
  const unsubscribes: Array<() => void> = [];
  for (let i = 0; i < subscriberCount; i++) {
    unsubscribes.push(bus.subscribe(`agent-${i}`, () => {}));
  }

  const samples = 100;
  const durationsMs: number[] = [];

  for (let i = 0; i < samples; i++) {
    // 重新创建订阅
    const freshUnsubscribes: Array<() => void> = [];
    for (let j = 0; j < subscriberCount; j++) {
      freshUnsubscribes.push(bus.subscribe(`temp-${i}-${j}`, () => {}));
    }

    const start = performance.now();

    for (const unsub of freshUnsubscribes) {
      unsub();
    }

    durationsMs.push(performance.now() - start);
  }

  const stats = calculateStats(durationsMs.map((d) => d / subscriberCount));

  return {
    type: 'message-bus',
    name: `Unsubscribe Performance (${subscriberCount} subscribers)`,
    description: `取消 ${subscriberCount} 个订阅的平均时间`,
    stats,
    messageCount: subscriberCount,
    senderCount: 1,
    passed: stats.avg < 0.01, // 目标：每次取消订阅 < 0.01ms
    threshold: 0.01,
  };
}

// ============================================================
// 基准测试：不同优先级消息性能
// ============================================================

/**
 * 基准测试：不同优先级消息发送性能
 */
export async function benchPriorityMessages(
  messageCount: number = 5000,
): Promise<MessageBusResult[]> {
  const bus = new MessageBus();
  bus.subscribe('receiver', () => {});

  const priorities = [0, 1, 2, 3]; // CRITICAL, HIGH, NORMAL, LOW
  const results: MessageBusResult[] = [];

  for (const priority of priorities) {
    const durationsMs: number[] = [];

    for (let i = 0; i < messageCount; i++) {
      const start = performance.now();

      const msg = bus.createMessage('sender', 'receiver', 'event' as MessageType, { index: i });
      msg.priority = priority as any;
      bus.send(msg);

      durationsMs.push(performance.now() - start);
    }

    const stats = calculateStats(durationsMs);
    const priorityNames = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];

    results.push({
      type: 'message-bus',
      name: `Priority ${priorityNames[priority]} Messages`,
      description: `优先级 ${priorityNames[priority]} 消息发送性能`,
      stats,
      messageCount,
      senderCount: 1,
      priority,
      passed: true,
    });
  }

  return results;
}

// ============================================================
// 基准测试：消息历史查询性能
// ============================================================

/**
 * 基准测试：消息历史查询性能
 */
export async function benchHistoryQuery(
  historySize: number = 1000,
  queryCount: number = 100,
): Promise<MessageBusResult> {
  const bus = new MessageBus();

  // 填充历史
  const traceId = 'benchmark-trace';
  for (let i = 0; i < historySize; i++) {
    const msg = bus.createMessage('sender', 'receiver', 'event' as MessageType, { index: i }, traceId);
    bus.send(msg);
  }

  const durationsMs: number[] = [];

  for (let i = 0; i < queryCount; i++) {
    const start = performance.now();

    bus.getHistory('receiver', 100);

    durationsMs.push(performance.now() - start);
  }

  const stats = calculateStats(durationsMs);

  return {
    type: 'message-bus',
    name: `History Query (${historySize} messages in history)`,
    description: `查询历史消息的性能（历史大小: ${historySize}）`,
    stats,
    messageCount: historySize,
    senderCount: 1,
    passed: stats.avg < 1, // 目标：每次查询 < 1ms
    threshold: 1,
  };
}

// ============================================================
// 基准测试：广播性能
// ============================================================

/**
 * 基准测试：广播消息性能
 */
export async function benchBroadcastPerformance(
  subscriberCount: number = 50,
  messageCount: number = 1000,
): Promise<MessageBusResult> {
  const bus = new MessageBus();

  // 添加订阅者
  for (let i = 0; i < subscriberCount; i++) {
    bus.subscribe(`agent-${i}`, () => {});
  }

  const durationsMs: number[] = [];

  for (let i = 0; i < messageCount; i++) {
    const start = performance.now();

    bus.broadcast({
      id: `broadcast-${i}`,
      from: 'broadcaster',
      type: 'event' as MessageType,
      priority: 1,
      payload: { message: `Broadcast ${i}` },
      context_shards: [],
      timestamp: Date.now(),
      trace_id: `trace-${i}`,
    });

    durationsMs.push(performance.now() - start);
  }

  const stats = calculateStats(durationsMs);

  return {
    type: 'message-bus',
    name: `Broadcast Performance (${subscriberCount} subscribers)`,
    description: `广播 ${messageCount} 条消息给 ${subscriberCount} 个订阅者`,
    stats,
    messageCount,
    senderCount: 1,
    throughput: {
      opsPerSecond: (messageCount * 1000) / durationsMs.reduce((a, b) => a + b, 0),
      totalOps: messageCount,
      totalDurationMs: durationsMs.reduce((a, b) => a + b, 0),
    },
    passed: stats.avg < 1, // 目标：每次广播 < 1ms
    threshold: 1,
  };
}

// ============================================================
// 导出所有消息总线基准测试
// ============================================================

/**
 * 运行所有消息总线基准测试
 */
export async function runAllMessageBusBenchmarks(): Promise<MessageBusResult[]> {
  const results: MessageBusResult[] = [];

  console.log('运行消息总线基准测试...');

  results.push(await benchMessageSendLatency());
  console.log(`  ✓ 消息发送延迟: 平均 ${results[0].stats.avg.toFixed(4)} ms`);

  results.push(await benchThroughputSingleSender());
  console.log(`  ✓ 单发送者吞吐量: ${results[1].throughput?.opsPerSecond.toFixed(0)} msg/s`);

  results.push(await benchThroughputMultipleSenders());
  console.log(`  ✓ 多发送者吞吐量: ${results[2].throughput?.opsPerSecond.toFixed(0)} msg/s`);

  results.push(await benchSubscribePerformance());
  console.log(`  ✓ 订阅性能: 平均 ${results[3].stats.avg.toFixed(4)} ms`);

  results.push(await benchUnsubscribePerformance());
  console.log(`  ✓ 取消订阅性能: 平均 ${results[4].stats.avg.toFixed(4)} ms`);

  const priorityResults = await benchPriorityMessages();
  results.push(...priorityResults);
  console.log(`  ✓ 优先级消息测试: ${priorityResults.length} 个优先级`);

  results.push(await benchHistoryQuery());
  console.log(`  ✓ 历史查询: 平均 ${results[results.length - 1].stats.avg.toFixed(4)} ms`);

  results.push(await benchBroadcastPerformance());
  console.log(`  ✓ 广播性能: 平均 ${results[results.length - 1].stats.avg.toFixed(4)} ms`);

  return results;
}
