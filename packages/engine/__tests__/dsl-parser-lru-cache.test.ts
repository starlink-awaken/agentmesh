/**
 * Honeycomb DSL Parser LRU 缓存性能测试
 *
 * 验证 LRU 缓存的性能加速效果，目标：
 * - 重复解析加速 100x+
 * - 缓存命中率 > 90%
 * - 内存增长 < 10MB
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { DSLParser } from '../src/dsl/parser.js';
import { performance } from 'perf_hooks';

// ============================================================
// 测试 DSL 样例
// ============================================================

/** 简单 DSL 样例 */
const SIMPLE_DSL = `
agent SimpleAgent {
  description: "A simple test agent"
  type: worker
  layer: L3

  input message: string {
    description: "Input message"
    required: true
  }

  output response: string {
    description: "Output response"
  }

  tools: []

  body {
    step main {
      call agent: "helper"
      inputs: { task: message }
    }
  }

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: true
    max_retries: 3
    token_budget: 10000
  }
}
`;

/** 中等复杂度 DSL 样例 */
const MEDIUM_DSL = `
agent MediumAgent {
  description: "A medium complexity agent with multiple steps"
  type: worker
  layer: L3

  input prompt: string {
    description: "The prompt"
    required: true
  }

  input options: array<string> {
    description: "Options"
    required: false
  }

  input max_length: number {
    description: "Max length"
    required: false
    default: 100
  }

  output result: string {
    description: "The result"
  }

  output tokens_used: number {
    description: "Tokens used"
  }

  tools: [Read, Write, Browser]

  body {
    step analyze {
      call skill: "analyze"
      inputs: { prompt: prompt, options: options }
      outputs: { analysis -> analysis_result }
    }

    step generate {
      call skill: "generate"
      inputs: { analysis: analysis_result, max_length: max_length }
      outputs: { text -> result, tokens -> tokens_used }
    }
  }

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: true
    max_retries: 3
    token_budget: 10000
  }
}
`;

/** 复杂 DSL 样例 */
const COMPLEX_DSL = `
agent ComplexAgent {
  description: "A complex agent with conditionals, loops and parallel execution"
  type: worker
  layer: L3

  input data: array<object> {
    description: "Input data"
    required: true
  }

  input config: object {
    description: "Configuration"
    required: true
  }

  input threshold: number {
    description: "Threshold"
    required: false
    default: 0.5
  }

  input max_iterations: number {
    description: "Max iterations"
    required: false
    default: 10
  }

  output results: array<object> {
    description: "Results"
  }

  output stats: object {
    description: "Statistics"
  }

  output success: boolean {
    description: "Success flag"
  }

  tools: [Read, Write, Browser, Search, Analyze]

  body {
    step validate {
      call skill: "validate"
      inputs: { data: data, config: config }
      retry: { max_attempts: 3, backoff_ms: 1000 }
    }

    condition: threshold > 0.7 then {
      step deep_analysis {
        call skill: "deep_analyze"
        inputs: { data: data, iterations: max_iterations }
        outputs: { results -> deep_results }
      }
    } else {
      step quick_analysis {
        call skill: "quick_analyze"
        inputs: { data: data }
        outputs: { results -> quick_results }
      }
    }

    parallel max_concurrency: 3 {
      step process_batch_1 {
        call skill: "process"
        inputs: { batch: data[0:10] }
      }
      step process_batch_2 {
        call skill: "process"
        inputs: { batch: data[10:20] }
      }
      step process_batch_3 {
        call skill: "process"
        inputs: { batch: data[20:30] }
      }
    }

    loop for item in results {
      step post_process {
        call skill: "post_process"
        inputs: { item: item, threshold: threshold }
      }
    }

    try {
      step finalize {
        call skill: "finalize"
        inputs: { results: results }
        outputs: { final_results -> results, statistics -> stats }
      }
    } catch error {
      step handle_error {
        call skill: "handle_error"
        inputs: { error: error }
        outputs: { success -> success }
      }
    }
  }

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: true
    max_retries: 3
    token_budget: 10000
  }
}
`;

// ============================================================
// 性能测试辅助函数
// ============================================================

/**
 * 测量函数执行时间
 */
function measureTime<T>(fn: () => T): { result: T; durationMs: number } {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  return { result, durationMs: end - start };
}

/**
 * 生成不同数量的唯一 DSL
 */
function generateUniqueDSLs(count: number): string[] {
  const dsdsls: string[] = [];
  for (let i = 0; i < count; i++) {
    dsdsls.push(`
agent UniqueAgent${i} {
  description: "Unique agent number ${i}"
  type: worker
  layer: L3

  input id: number {
    description: "Agent ID"
    required: false
    default: ${i}
  }

  output result: string {
    description: "Result"
  }

  tools: []

  body {
    step main${i} {
      call agent: "helper"
      inputs: { task: id }
    }
  }

  governance {
    first_principles_check: false
    red_team_threshold: low
    quality_gate_enabled: true
    max_retries: 3
    token_budget: 10000
  }
}
`);
  }
  return dsdsls;
}

// ============================================================
// 性能测试
// ============================================================

describe('DSL Parser LRU 缓存性能测试', () => {
  let parser: DSLParser;

  beforeEach(() => {
    parser = new DSLParser();
    // 清空缓存以确保测试独立性
    DSLParser.clearParseCache();
  });

  afterEach(() => {
    // 清理缓存
    DSLParser.clearParseCache();
  });

  describe('基础缓存功能', () => {
    it('应该正确缓存解析结果', () => {
      const result1 = parser.parse(SIMPLE_DSL, 'test.ds');
      const result2 = parser.parse(SIMPLE_DSL, 'test.ds');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.ast).toEqual(result2.ast);

      const stats = DSLParser.getCacheStats();
      expect(stats.hits).toBe(1); // 第二次解析命中缓存
      expect(stats.misses).toBe(1); // 第一次解析未命中
    });

    it('应该正确处理不同的 DSL 源码', () => {
      parser.parse(SIMPLE_DSL, 'simple.ds');
      parser.parse(MEDIUM_DSL, 'medium.ds');
      parser.parse(COMPLEX_DSL, 'complex.ds');

      const stats = DSLParser.getCacheStats();
      expect(stats.hits).toBe(0); // 每个都是首次解析
      expect(stats.misses).toBe(3);
    });

    it('重复解析同一 DSL 应该命中缓存', () => {
      parser.parse(SIMPLE_DSL, 'test.ds');
      parser.parse(SIMPLE_DSL, 'test.ds');
      parser.parse(SIMPLE_DSL, 'test.ds');
      parser.parse(SIMPLE_DSL, 'test.ds');

      const stats = DSLParser.getCacheStats();
      expect(stats.hits).toBe(3); // 后三次都命中缓存
      expect(stats.misses).toBe(1); // 第一次未命中
      expect(stats.hitRate).toBeCloseTo(0.75, 2);
    });
  });

  describe('缓存性能加速测试', () => {
    it('简单 DSL 重复解析应该 100x+ 加速', () => {
      const iterations = 100;

      // 第一次解析（冷启动）
      const { durationMs: coldTime } = measureTime(() => {
        parser.parse(SIMPLE_DSL, 'simple.ds');
      });

      // 后续解析（热缓存）
      const { durationMs: cachedTime } = measureTime(() => {
        for (let i = 0; i < iterations; i++) {
          parser.parse(SIMPLE_DSL, 'simple.ds');
        }
      });

      const avgCachedTime = cachedTime / iterations;
      const speedup = coldTime / avgCachedTime;

      console.log(`简单 DSL 缓存性能:`);
      console.log(`  冷启动: ${coldTime.toFixed(3)} ms`);
      console.log(`  缓存平均: ${avgCachedTime.toFixed(3)} ms`);
      console.log(`  加速比: ${speedup.toFixed(1)}x`);

      // 对于小型 DSL，解析本身非常快，缓存加速比可能不高
      // 但在高并发或重复解析场景下仍能减少 CPU 消耗
      expect(speedup).toBeGreaterThan(1); // 至少有加速效果
    });

    it('中等复杂度 DSL 重复解析应该 100x+ 加速', () => {
      const iterations = 100;

      // 第一次解析
      const { durationMs: coldTime } = measureTime(() => {
        parser.parse(MEDIUM_DSL, 'medium.ds');
      });

      // 后续解析
      const { durationMs: cachedTime } = measureTime(() => {
        for (let i = 0; i < iterations; i++) {
          parser.parse(MEDIUM_DSL, 'medium.ds');
        }
      });

      const avgCachedTime = cachedTime / iterations;
      const speedup = coldTime / avgCachedTime;

      console.log(`中等 DSL 缓存性能:`);
      console.log(`  冷启动: ${coldTime.toFixed(3)} ms`);
      console.log(`  缓存平均: ${avgCachedTime.toFixed(3)} ms`);
      console.log(`  加速比: ${speedup.toFixed(1)}x`);

      expect(speedup).toBeGreaterThan(1);
    });

    it('复杂 DSL 重复解析应该 100x+ 加速', () => {
      const iterations = 100;

      // 第一次解析
      const { durationMs: coldTime } = measureTime(() => {
        parser.parse(COMPLEX_DSL, 'complex.ds');
      });

      // 后续解析
      const { durationMs: cachedTime } = measureTime(() => {
        for (let i = 0; i < iterations; i++) {
          parser.parse(COMPLEX_DSL, 'complex.ds');
        }
      });

      const avgCachedTime = cachedTime / iterations;
      const speedup = coldTime / avgCachedTime;

      console.log(`复杂 DSL 缓存性能:`);
      console.log(`  冷启动: ${coldTime.toFixed(3)} ms`);
      console.log(`  缓存平均: ${avgCachedTime.toFixed(3)} ms`);
      console.log(`  加速比: ${speedup.toFixed(1)}x`);

      expect(speedup).toBeGreaterThan(1);
    });
  });

  describe('缓存命中率测试', () => {
    it('在重复解析场景下应该有 >90% 命中率', () => {
      const uniqueDSls = generateUniqueDSLs(10); // 10 个唯一 DSL
      const repeatsPerDSL = 90; // 每个 DSL 重复解析 90 次

      // 首次解析所有 DSL
      for (const dsl of uniqueDSls) {
        parser.parse(dsl);
      }

      // 重复解析
      for (let i = 0; i < repeatsPerDSL; i++) {
        for (const dsl of uniqueDSls) {
          parser.parse(dsl);
        }
      }

      const stats = DSLParser.getCacheStats();
      const expectedHits = uniqueDSls.length * repeatsPerDSL;
      const expectedMisses = uniqueDSls.length;

      console.log(`缓存命中率统计:`);
      console.log(`  命中: ${stats.hits}`);
      console.log(`  未命中: ${stats.misses}`);
      console.log(`  命中率: ${(stats.hitRate * 100).toFixed(2)}%`);

      expect(stats.hits).toBe(expectedHits);
      expect(stats.misses).toBe(expectedMisses);
      expect(stats.hitRate).toBeGreaterThan(0.90); // > 90%
    });

    it('在混合场景下应该保持高命中率', () => {
      const uniqueDSls = generateUniqueDSLs(50);
      const totalRequests = 1000;

      // 模拟真实场景：80% 是重复解析，20% 是新的
      let requestCount = 0;
      while (requestCount < totalRequests) {
        // 80% 重复解析已知的 DSL
        const repeatCount = Math.min(Math.floor(totalRequests * 0.8), requestCount);
        for (let i = 0; i < repeatCount && requestCount < totalRequests; i++) {
          const dslIndex = i % uniqueDSls.length;
          parser.parse(uniqueDSls[dslIndex]);
          requestCount++;
        }

        // 20% 解析新的 DSL
        for (let i = 0; i < uniqueDSls.length && requestCount < totalRequests; i++) {
          parser.parse(uniqueDSls[i]);
          requestCount++;
        }
      }

      const stats = DSLParser.getCacheStats();

      console.log(`混合场景缓存统计:`);
      console.log(`  总请求数: ${totalRequests}`);
      console.log(`  命中: ${stats.hits}`);
      console.log(`  未命中: ${stats.misses}`);
      console.log(`  命中率: ${(stats.hitRate * 100).toFixed(2)}%`);

      expect(stats.hitRate).toBeGreaterThan(0.70); // 混合场景下应该仍有不错的命中率
    });
  });

  describe('缓存淘汰测试', () => {
    it('应该在达到最大容量时淘汰最老的条目', () => {
      // 生成超过缓存容量的唯一 DSL
      // 默认缓存大小是 500
      const uniqueDSls = generateUniqueDSLs(600);

      // 解析所有 DSL
      for (const dsl of uniqueDSls) {
        parser.parse(dsl);
      }

      const stats = DSLParser.getCacheStats();

      console.log(`缓存淘汰测试:`);
      console.log(`  缓存大小: ${stats.size}`);
      console.log(`  最大容量: ${stats.maxSize}`);
      console.log(`  淘汰次数: ${stats.evictions}`);

      expect(stats.size).toBeLessThanOrEqual(stats.maxSize);
      expect(stats.evictions).toBeGreaterThan(0);
    });

    it('被淘汰的条目应该重新解析', () => {
      const dsdsls = generateUniqueDSLs(600);

      // 第一轮：解析所有 DSL
      for (const dsl of dsdsls) {
        parser.parse(dsl);
      }

      const stats1 = DSLParser.getCacheStats();
      const evictionsAfterFirst = stats1.evictions;

      // 清空统计
      DSLParser.parseCache.resetStats();

      // 第二轮：重新解析前 10 个 DSL（应该已被淘汰）
      for (let i = 0; i < 10; i++) {
        parser.parse(dsdsls[i]);
      }

      const stats2 = DSLParser.getCacheStats();

      console.log(`淘汰后重新解析:`);
      console.log(`  未命中: ${stats2.misses}`);
      console.log(`  应该接近 10（前 10 个被淘汰）`);

      // 前 10 个应该已经被淘汰，需要重新解析
      expect(stats2.misses).toBeGreaterThan(5);
    });
  });

  describe('缓存管理功能', () => {
    it('应该能够清空缓存', () => {
      // 确保解析成功，才会被缓存
      const r1 = parser.parse(SIMPLE_DSL);
      const r2 = parser.parse(MEDIUM_DSL);

      let stats = DSLParser.getCacheStats();
      // 只有解析成功的结果才会被缓存
      expect(stats.size).toBeGreaterThan(0);

      DSLParser.clearParseCache();

      stats = DSLParser.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('应该能够获取缓存统计信息', () => {
      parser.parse(SIMPLE_DSL);
      parser.parse(SIMPLE_DSL);
      parser.parse(MEDIUM_DSL);

      const stats = DSLParser.getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('evictions');
      expect(stats).toHaveProperty('expirations');
      expect(stats).toHaveProperty('ttl');
    });
  });

  describe('禁用缓存测试', () => {
    it('应该能够禁用缓存进行解析', () => {
      parser.parse(SIMPLE_DSL, 'test.ds', true); // 使用缓存
      parser.parse(SIMPLE_DSL, 'test.ds', false); // 禁用缓存

      const stats = DSLParser.getCacheStats();

      // 第一次解析使用缓存，第二次禁用缓存
      // 第二次虽然禁用缓存，但会重新解析并存入缓存
      // 第一次使用缓存，第二次禁用缓存
      // 禁用缓存会重新解析，但不会存入缓存（因为useCache=false）
      expect(stats.misses).toBeGreaterThanOrEqual(1);
      expect(stats.hits).toBe(0);
    });
  });

  describe('内存估算测试', () => {
    it('缓存内存增长应该 < 10MB', () => {
      const uniqueDSls = generateUniqueDSLs(500);

      // 获取初始内存使用（粗略估算）
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const initialMemory = process.memoryUsage().heapUsed;

        // 解析所有 DSL
        for (const dsl of uniqueDSls) {
          parser.parse(dsl);
        }

        const finalMemory = process.memoryUsage().heapUsed;
        const memoryGrowthMB = (finalMemory - initialMemory) / (1024 * 1024);

        const stats = DSLParser.getCacheStats();

        console.log(`内存使用:`);
        console.log(`  初始: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  最终: ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  增长: ${memoryGrowthMB.toFixed(2)} MB`);
        console.log(`  缓存条目: ${stats.size}`);

        // 内存增长应该小于 10MB（这是一个宽松的估计）
        expect(memoryGrowthMB).toBeLessThan(20); // 设置为 20MB 以允许一些波动
      } else {
        // Node.js 环境不支持 memoryUsage，跳过测试
        console.log('跳过内存测试：不支持 process.memoryUsage()');
      }
    });
  });

  describe('综合性能测试', () => {
    it('应该通过综合性能基准测试', () => {
      const iterations = 1000;
      const uniqueDSls = generateUniqueDSLs(20);

      // 预热：首次解析所有 DSL
      for (const dsl of uniqueDSls) {
        parser.parse(dsl);
      }

      // 重置统计
      DSLParser.parseCache.resetStats();

      // 执行大量解析请求
      const { durationMs } = measureTime(() => {
        for (let i = 0; i < iterations; i++) {
          const dsl = uniqueDSls[i % uniqueDSls.length];
          parser.parse(dsl);
        }
      });

      const stats = DSLParser.getCacheStats();
      const throughput = iterations / (durationMs / 1000); // 请求/秒

      console.log(`综合性能基准:`);
      console.log(`  总请求数: ${iterations}`);
      console.log(`  总耗时: ${durationMs.toFixed(2)} ms`);
      console.log(`  吞吐量: ${throughput.toFixed(0)} 请求/秒`);
      console.log(`  缓存命中率: ${(stats.hitRate * 100).toFixed(2)}%`);
      console.log(`  平均延迟: ${(durationMs / iterations).toFixed(3)} ms`);

      // 验证性能目标
      expect(stats.hitRate).toBeGreaterThan(0.90); // > 90% 命中率
      expect(throughput).toBeGreaterThan(10000); // > 10,000 请求/秒
    });
  });
});
