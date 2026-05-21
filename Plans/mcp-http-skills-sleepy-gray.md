# Monorepo Architecture Implementation Plan: MCP + HTTP + Skills Unified Gateway

**Context:** 现有三个独立 TypeScript 项目（agentmesh ~5.1K 行、honeycomb ~64K 行、agent-toolkit ~25K 行）各自有重复模块（事件/重试/限流/LLM/存储），且跨项目桥接停留在注释层面。需要重构为 B 方案 monorepo，新增 model-orchestrator 包实现本地+云端模型聚合与动态调度，新增 MCP/HTTP/Skills 三种外部访问方式。

---

## Phase 0: Monorepo Skeleton

**目标：** 搭建 monorepo 基础设施，创建 core-types 共享类型包

### 文件创建

| 文件 | 内容 |
|------|------|
| `agentmesh/bun.lock` | 初始化 bun lock |
| `agentmesh/.gitignore` | dist, node_modules, .env, *.log |
| `agentmesh/tsconfig.base.json` | 共享 tsconfig（strict, ESNext, bundler resolution） |
| `agentmesh/package.json` | `workspaces: ["packages/*"]` + scripts |
| `agentmesh/packages/core-types/package.json` | `@agentmesh/core-types`, zero deps |
| `agentmesh/packages/core-types/tsconfig.json` | extends `../../tsconfig.base.json` |
| `agentmesh/packages/core-types/src/index.ts` | 聚合导出 |

### 核心接口设计

**`core-types/src/model.ts`** — 统一模型描述：
```typescript
export type ModelProvider = 'ollama' | 'lm-studio' | 'llama-cpp' | 'openai' | 'anthropic' | 'openrouter';
export type ModelLocation = 'local' | 'cloud';
export type ModelCapability = 'chat' | 'completion' | 'embedding' | 'vision' | 'tools';

export interface ModelDescriptor {
  id: string;            // 全局唯一 ID
  name: string;          // 模型名称
  provider: ModelProvider;
  location: ModelLocation;
  capabilities: ModelCapability[];
  contextWindow: number;
  costPer1KTokens?: { input: number; output: number };
  avgLatencyMs?: number;
  isAvailable: boolean;
  metadata?: Record<string, unknown>;
}

export interface ModelRoutePolicy {
  strategy: 'cost-first' | 'speed-first' | 'capability-first' | 'balanced';
  priority: string[];    // preferred model IDs
  fallbackChain: string[];
}
```

**`core-types/src/agent.ts`**：
```typescript
export interface AgentDefinition {
  id: string;
  name: string;
  type: 'claude-code' | 'openclaw' | 'process' | 'http';
  capabilities: string[];
  layer?: 'L1' | 'L2' | 'L3' | 'L4' | 'governance';
  endpoint?: string;
  metadata?: Record<string, unknown>;
}
```

**`core-types/src/task.ts`**：
```typescript
export type TaskStatus = 'pending' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  status: TaskStatus;
  request: unknown;
  result?: unknown;
  assignedAgent?: string;
  assignedModel?: string;
  createdAt: number;
  completedAt?: number;
  error?: string;
}
```

**`core-types/src/events.ts`** — 统一事件类型常量。

### 验证
```bash
cd agentmesh && bun install
cd packages/core-types && bun run tsc --noEmit
```

---

## Phase 1: Model Orchestrator

**目标：** 实现本地+云端模型聚合发现与动态调度

### 文件创建

| 文件 | 估算行数 |
|------|----------|
| `model-orchestrator/package.json` | — |
| `model-orchestrator/src/types.ts` | 80 |
| `model-orchestrator/src/index.ts` | 30 |
| `model-orchestrator/src/providers/base.ts` | 60 |
| `model-orchestrator/src/discovery/local.ts` | 200 |
| `model-orchestrator/src/providers/ollama.ts` | 100 |
| `model-orchestrator/src/providers/lm-studio.ts` | 80 |
| `model-orchestrator/src/providers/llama-cpp.ts` | 80 |
| `model-orchestrator/src/providers/openai.ts` | 80 |
| `model-orchestrator/src/providers/anthropic.ts` | 80 |
| `model-orchestrator/src/providers/openrouter.ts` | 60 |
| `model-orchestrator/src/scheduler.ts` | 200 |
| `model-orchestrator/src/policies.ts` | 100 |
| `model-orchestrator/__tests__/scheduler.test.ts` | 80 |
| `model-orchestrator/__tests__/discovery.test.ts` | 60 |

### Provider 抽象设计

```typescript
// providers/base.ts
export interface ModelProvider {
  readonly name: string;
  readonly type: ModelProvider;
  discover(): Promise<ModelDescriptor[]>;
  health(): Promise<boolean>;
  chat(model: string, messages: unknown[], options?: ChatOptions): Promise<ChatResult>;
  stream?(model: string, messages: unknown[], options?: ChatOptions): AsyncIterable<StreamChunk>;
  embed?(model: string, input: string[]): Promise<number[][]>;
}
```

### 本地发现机制

```typescript
// discovery/local.ts
export class LocalModelDiscoverer {
  // 1. Probe Ollama API (默认 http://localhost:11434/api/tags)
  // 2. Probe LM Studio API (默认 http://localhost:1234/v1/models)
  // 3. Scan for llama.cpp processes (search common ports + process list)
  // 4. Read config/models.yaml for manually registered local models
  // 返回 ModelDescriptor[] 合并去重
  async discoverAll(): Promise<ModelDescriptor[]>
}
```

### 调度器设计

```typescript
// scheduler.ts
export class ModelScheduler {
  // 输入：模型请求需求 + 策略
  // 输出：最优模型选择
  //
  // 算法：
  // 1. 筛选可用模型（health check + capability match）
  // 2. 按策略评分：
  //    - cost-first: 按 costPer1KTokens 升序
  //    - speed-first: 按 avgLatencyMs 升序
  //    - capability-first: 按能力匹配度 + contextWindow
  //    - balanced: 加权综合分（成本 30% + 速度 30% + 能力 40%）
  // 3. 负载感知：当前活跃请求数加权降分
  // 4. fallback chain：首选不可用时沿链降级
  //
  async selectModel(request: ModelRequest, policy: ModelRoutePolicy): Promise<ModelSelection>
  // 返回：{ model: ModelDescriptor, provider: ModelProvider, confidence: number }
}
```

### 验证
```bash
cd packages/model-orchestrator && bun test
# 手动测试：node -e "new (require('./src/discovery/local').LocalModelDiscoverer)().discoverAll().then(console.log)"
```

---

## Phase 2: Copy Existing Projects

**目标：** 将三个现有项目搬入 monorepo，确保各自能独立编译测试

### 操作清单

| 源路径 | 目标路径 | 注意 |
|--------|----------|------|
| `agentmesh/src/` | `packages/gateway/src/` | 去掉 dist/、node_modules/ |
| `agentmesh/tests/` | `packages/gateway/__tests__/` | — |
| `agentmesh/config/` | `config/` (根级) | 统一配置 |
| `honeycomb/engine/src/` | `packages/engine/src/` | 保留全部 92 个测试 |
| `honeycomb/engine/tests/` | `packages/engine/__tests__/` | — |
| `agent-toolkit/src/` | `packages/toolkit/src/` | 保留全部 41 个测试 |
| `agent-toolkit/tests/` | `packages/toolkit/__tests__/` | — |

### 需要修改

1. 每个包新建 `tsconfig.json` 继承 `../../tsconfig.base.json`
2. 每个包 `package.json` 改名 `@agentmesh/xxx`，更新路径引用
3. `packages/engine` 和 `packages/toolkit` 接口层逐步加 `@agentmesh/core-types` 依赖
4. 根 `config/gateway.yaml` 指向新路径

### 验证
```bash
cd packages/gateway && bun run tsc --noEmit && bun test
cd packages/engine && bun run tsc --noEmit && bun test
cd packages/toolkit && bun run tsc --noEmit && bun test
```

---

## Phase 3: MCP Server + CLI + Server

**目标：** 提供三种外部访问方式

### 3.1 MCP Server (`apps/server/src/mcp/`)

使用 `@modelcontextprotocol/sdk` 创建 TypeScript MCP 服务器：

| MCP Tool | 功能 | 数据来源 |
|----------|------|----------|
| `models_list` | 列出所有可用模型 | model-orchestrator |
| `models_health` | 模型健康状态 | model-orchestrator |
| `models_chat` | 调用模型聊天 | model-orchestrator → scheduler |
| `tasks_submit` | 提交任务 | gateway TaskManager |
| `tasks_status` | 查询任务状态 | gateway TaskManager |
| `skills_list` | 列出可用技能 | toolkit SkillLoader |
| `skills_execute` | 执行技能 | toolkit SkillRouter → SkillExecutor |
| `system_health` | 系统健康总览 | engine Orchestrator |
| `system_metrics` | 性能指标 | engine MetricsCollector |

文件清单：
- `apps/server/package.json` — 依赖 `@modelcontextprotocol/sdk`, `@agentmesh/gateway`
- `apps/server/src/mcp/index.ts` — MCP 服务器入口
- `apps/server/src/mcp/tools/models.ts` — 模型相关 tool handlers
- `apps/server/src/mcp/tools/tasks.ts` — 任务相关 tool handlers
- `apps/server/src/mcp/tools/skills.ts` — 技能相关 tool handlers
- `apps/server/src/mcp/tools/system.ts` — 系统相关 tool handlers

### 3.2 HTTP API 增强

在现有 `gateway` 包基础上增加：
- `GET /v1/skills` — 列出可用技能
- `POST /v1/skills/:id/execute` — 执行技能
- `POST /v1/model-orchestrator/select` — 查询最优模型路由
- `GET /v1/model-orchestrator/models` — 列出所有模型(含本地)
- `POST /v1/model-orchestrator/chat` — 通过调度器聊天

### 3.3 Skills Access

在 `gateway` 包新增 `routes/skills.ts`，封装 agent-toolkit 的：
- `SkillLoader.search(query)` → GET `/v1/skills?q=xxx`
- `SkillRouter.match(task)` → 分析匹配
- `SkillController.execute(skillId, input)` → POST `/v1/skills/:id/execute`

### 3.4 统一 CLI (`apps/cli/src/index.ts`)

| 命令 | 功能 |
|------|------|
| `agentmesh start` | 启动所有服务（多进程） |
| `agentmesh model list` | 列出模型 |
| `agentmesh model health` | 模型健康检查 |
| `agentmesh status` | 系统状态概览 |
| `agentmesh skills list` | 列出技能 |
| `agentmesh mcp` | 启动 MCP 服务器（stdio 模式） |

### 3.5 多进程启动器

```typescript
// apps/server/src/launcher.ts
// 启动：gateway (port 3000) + MCP server (port 7422)
// 支持：health check 轮询、崩溃自动重启(最多3次)、优雅关闭
```

### 验证
```bash
cd apps/server && bun run src/index.ts
# 测试 MCP: 另开终端，用 mcp-cli 或 curl 测试 tool call
# 测试 HTTP: curl http://localhost:3000/v1/model-orchestrator/models
# 测试 CLI: cd apps/cli && bun run src/index.ts model list
```

---

## Phase 4: Deduplicate Cross-Cutting Modules

**目标：** 消除三项目间的重复模块，建立真实 import 级桥接

### 去重清单

| 重复模块 | 保留 | 淘汰 |
|----------|------|------|
| 事件系统 | toolkit EventEmitter (223行) | gateway event-bus (76行), engine MessageBus 保持（自有协议） |
| 重试 | toolkit retry (530行) | gateway retry (69行) → import from toolkit |
| 限流 | toolkit RateLimitMiddleware (379行) | gateway rate-limit (83行) → import from toolkit |
| LLM 调用 | toolkit LLMClient (3000+) | gateway providers (329行) 保持轻代理, engine LLM 可选迁 |
| 健康检查 | toolkit HealthCheck (374行) | gateway health (100行) → 包装 toolkit 实现 |
| 向量存储 | toolkit Knowledge (1600行) | gateway vector-store (208行) → import from toolkit |

### 桥接建立

`packages/gateway/src/core/` 中新增导入：
```typescript
// 示例：gateway 使用 toolkit 的 retry
import { RetryableClient } from '@agentmesh/toolkit';
// 而非自实现 retry
```

`packages/engine/src/orchestrator.ts` 中新增：
```typescript
// 示例：engine 使用 toolkit 的 ToolRegistry
import { ToolRegistry } from '@agentmesh/toolkit';
```

### 验证
```bash
bun test  # 跑所有包测试，确保导入正确
# 确认 import from toolkit 的模块正确 resolve
```

---

## 实施总览

| Phase | 工作内容 | 估算时间 | 验证方式 |
|-------|----------|----------|----------|
| 0 | monorepo 骨架 + core-types | 0.5天 | tsc --noEmit + bun install |
| 1 | model-orchestrator 完整实现 | 1.5天 | bun test + 手动调用 |
| 2 | 三个项目搬进 packages | 0.5天 | 各包 tsc + bun test |
| 3 | MCP Server + CLI + Server + HTTP/Skills | 1.5天 | 端到端测试 |
| 4 | 去重 + 建立桥接 | 1天 | 全量 bun test |

**总计估算：** ~5 天

---

## 关键依赖

- `@modelcontextprotocol/sdk` — MCP 服务端
- `bun` — 运行时 + 包管理
- 各已有项目的 `package.json` 依赖保持不变
