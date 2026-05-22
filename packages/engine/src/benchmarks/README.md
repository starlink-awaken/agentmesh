# Honeycomb 性能基准测试框架

Honeycomb 多 Agent 系统的性能基准测试套件，用于建立性能基线、检测性能回归和验证优化效果。

## 目录结构

```
src/benchmarks/
├── README.md                    # 本文档 - 使用说明
├── runner.ts                    # 测试运行器（CLI 入口）
├── types.ts                     # 类型定义
├── utils.ts                     # 工具函数
├── simulated/                   # 模拟执行测试
│   ├── agent-execution.ts      # Agent 执行性能
│   ├── message-bus.ts          # 消息总线性能
│   ├── checkpoint.ts           # 检查点性能
│   └── state-machine.ts        # 状态机性能
├── results/                     # JSON 结果存储（.gitignore）
└── reports/                     # Markdown 报告（.gitignore）
```

## 快速开始

### 编译后运行

```bash
# 进入 engine 目录
cd engine

# 构建项目
bun run build

# 运行所有基准测试
node dist/benchmarks/runner.js

# 运行特定类型的测试
node dist/benchmarks/runner.js --type agent-execution
node dist/benchmarks/runner.js --type message-bus
node dist/benchmarks/runner.js --type checkpoint
node dist/benchmarks/runner.js --type state-machine
```

### 使用 Bun 直接运行

```bash
# 直接运行 TypeScript 源码
bun run src/benchmarks/runner.ts

# 运行特定类型
bun run src/benchmarks/runner.ts --type checkpoint
```

### NPM 脚本

在 `package.json` 中添加以下脚本：

```json
{
  "scripts": {
    "benchmark": "node dist/benchmarks/runner.js",
    "benchmark:agent": "node dist/benchmarks/runner.js --type agent-execution",
    "benchmark:bus": "node dist/benchmarks/runner.js --type message-bus",
    "benchmark:cp": "node dist/benchmarks/runner.js --type checkpoint",
    "benchmark:sm": "node dist/benchmarks/runner.js --type state-machine"
  }
}
```

然后使用：

```bash
bun run benchmark
bun run benchmark:agent
```

## CLI 选项

```
选项:
  --type <type>      只运行指定类型的测试
                    可选值: agent-execution, message-bus, checkpoint, state-machine
  --output <dir>     指定输出目录 (默认: ./benchmarks)
  --no-json         不生成 JSON 报告
  --no-md           不生成 Markdown 报告
  --quiet           静默模式
  --help            显示帮助信息
```

## 测试类型

### 1. Agent 执行基准测试 (`agent-execution`)

测试 `AgentRunner` 和 `AgentPool` 的性能：

| 测试 | 描述 | 目标 |
|------|------|------|
| 单个 Agent 执行 | 执行单个 Agent 的平均时间 | < 10ms |
| 串行执行 (10 agents) | 串行执行 10 个 Agent | < 10ms/agent |
| 并发执行 (100 agents) | 并发执行 100 个 Agent | < 5000ms 总计 |
| Agent Pool 加载 | 加载 100 个 Agent 定义 | < 1000ms |
| Agent Pool 查询 | 1000 次查询操作 | < 0.1ms/query |

### 2. 消息总线基准测试 (`message-bus`)

测试 `MessageBus` 的吞吐量和延迟：

| 测试 | 描述 | 目标 |
|------|------|------|
| 消息发送延迟 | 单条消息发送延迟 | < 0.1ms |
| 单发送者吞吐量 | 10000 条消息吞吐量 | > 100,000 msg/s |
| 多发送者吞吐量 | 5 发送者 x 2000 消息 | > 50,000 msg/s |
| 订阅性能 | 添加 100 个订阅者 | < 0.01ms/订阅 |
| 取消订阅性能 | 取消 100 个订阅 | < 0.01ms/取消 |
| 优先级消息 | 不同优先级的发送性能 | - |
| 历史查询 | 查询历史消息 | < 1ms |
| 广播性能 | 广播给 50 个订阅者 | < 1ms |

### 3. 检查点基准测试 (`checkpoint`)

测试 `CheckpointManager` 的性能：

| 测试 | 描述 | 目标 |
|------|------|------|
| 创建检查点 (Small/Medium/Large) | 不同大小的检查点创建 | < 10ms |
| 恢复检查点 | 从检查点恢复状态 | < 1ms |
| 批量创建 | 100 个检查点批量操作 | < 1000ms |
| 列表查询 | 查询 50 个检查点 | < 5ms |
| 状态序列化 | JSON 序列化 | < 1ms |
| 状态反序列化 | JSON 反序列化 | < 1ms |

### 4. 状态机基准测试 (`state-machine`)

测试 `PhaseStateMachine` 的性能：

| 测试 | 描述 | 目标 |
|------|------|------|
| 状态转换 | 单次状态转换 | < 0.1ms |
| 完整阶段序列 | 7 个阶段的完整序列 | < 0.1ms/转换 |
| 决策路径选择 | 选择决策路径 | < 0.01ms |
| 风险评估 | 评估项目风险 | < 1ms |
| 评估与选择 | 组合评估和选择 | < 1ms |
| 有效阶段序列 | 获取有效序列 | < 0.01ms |
| 序列化 | 状态机序列化 | < 0.1ms |
| 反序列化 | 状态机反序列化 | < 0.1ms |
| 可用转换 | 查询可用转换 | < 0.01ms |

## 输出格式

### JSON 报告 (`results/timestamp.json`)

机器可读的 JSON 格式，包含所有测试结果和环境信息：

```json
{
  "reportId": "bench-1234567890-abc12345",
  "environment": {
    "nodeVersion": "v20.x.x",
    "bunVersion": "1.x.x",
    "platform": "darwin",
    "arch": "arm64",
    "cpuCores": 8,
    "totalMemoryMB": 16384,
    "timestamp": "2026-02-07T05:00:00.000Z"
  },
  "agentExecution": [...],
  "messageBus": [...],
  "checkpoint": [...],
  "stateMachine": [...],
  "summary": {
    "totalTests": 25,
    "passedTests": 24,
    "failedTests": 1,
    "totalDurationMs": 5432.10
  }
}
```

### Markdown 报告 (`reports/timestamp.md`)

人类可读的 Markdown 格式报告：

```markdown
# Honeycomb 性能基准测试报告

**报告 ID**: bench-1234567890-abc12345
**时间**: 2026-02-07T05:00:00.000Z

## 环境信息
| 项目 | 值 |
|------|-----|
| Node 版本 | v20.x.x |
| 平台 | darwin (arm64) |
...
```

## 性能基线

以下是 Honeycomb v2.0.0-alpha.1 的预期性能基线：

| 指标类别 | 目标值 |
|---------|--------|
| Agent 执行 | < 10ms/agent |
| 消息吞吐量 | > 100,000 msg/s |
| 检查点创建 | < 10ms |
| 检查点恢复 | < 1ms |
| 状态转换 | < 0.1ms |

## CI/CD 集成

### GitHub Actions 示例

```yaml
name: Performance Benchmarks

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install
        working-directory: ./engine

      - name: Build
        run: bun run build
        working-directory: ./engine

      - name: Run benchmarks
        run: bun run benchmark
        working-directory: ./engine

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: engine/benchmarks/results/
```

## 开发指南

### 添加新的基准测试

1. 在 `simulated/` 目录下创建新文件或扩展现有文件
2. 实现返回 `BenchmarkResult` 的异步函数
3. 在 `runner.ts` 的 `runAll()` 方法中调用新测试
4. 更新本文档

### 添加新的测试类型

1. 在 `types.ts` 中添加新的结果类型（扩展 `BenchmarkResult`）
2. 在 `simulated/` 下创建新目录和实现
3. 在 `runner.ts` 中添加对应的运行逻辑
4. 更新 `utils.ts` 中的报告生成（如需要）

## 注意事项

- 所有测试使用模拟执行，不调用真实 LLM API
- �结果受系统负载影响，建议在空闲环境下运行
- 不同平台（Node.js vs Bun）可能有性能差异
- 首次运行可能包含 JIT 编译时间，多次运行取平均更准确

## 许可证

MIT
