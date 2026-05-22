# CLAUDE.md

## 项目结构

```
agentmesh/  (monorepo 根 — bun workspaces)
├── packages/
│   ├── core-types/         @agentmesh/core-types      统一接口契约
│   ├── model-orchestrator/ @agentmesh/model-orch      模型聚合调度
│   ├── gateway/            @agentmesh/gateway         Fastify HTTP 网关
│   ├── engine/             @agentmesh/engine          Honeycomb 编排引擎
│   └── toolkit/            @agentmesh/toolkit         共享能力 SDK
├── apps/
│   ├── server/             MCP 服务器 + 进程管理器
│   └── cli/                统一 CLI
└── config/
    └── gateway.yaml        统一配置
```

## 命令

```sh
bun install              # 安装所有包依赖
bun run build             # 编译所有包 (npm -ws run build)
bun run typecheck         # 所有包类型检查
bun test                  # 所有包测试

# 单包操作
cd packages/gateway && bun run dev       # gateway 开发模式
cd packages/gateway && bun run build     # gateway 编译
cd packages/gateway && bun test          # gateway 测试
cd packages/gateway && bun run start     # gateway 启动（HTTP 服务）
cd packages/gateway && bun run typecheck # gateway 类型检查

cd packages/toolkit && bun run build     # toolkit 编译
cd packages/toolkit && bun run typecheck # toolkit 类型检查
cd packages/toolkit && bun test          # toolkit 测试

cd packages/model-orchestrator && bun test        # model-orchestrator 测试
cd packages/model-orchestrator && bun run build   # model-orchestrator 编译

cd packages/engine && bun run build     # engine 编译
cd packages/engine && bun run typecheck # engine 类型检查

cd packages/core-types && bun run build # core-types 编译（被所有包依赖）

cd apps/server && bun run src/mcp/index.ts  # 启动 MCP 服务器 (stdio)
cd apps/cli && bun run src/index.ts model list  # CLI 查模型
```

## 编译顺序

```sh
cd packages/core-types && bun run build    # 1. core-types 必须先编译
cd packages/toolkit && bun run build       # 2. toolkit 第二
cd packages/model-orchestrator && bun run build  # 3. model-orchestrator
cd packages/gateway && bun run build       # 4. gateway
cd packages/engine && bun run build        # 5. engine
```

## 包依赖关系（严格单向）

```
apps/cli → apps/server → packages/gateway → packages/engine → packages/toolkit
                 ↘              ↙              ↙
            packages/model-orchestrator
                 ↕
           packages/core-types
```

## 架构

**Agent Mesh Gateway v2.0** — 三层统一架构：

- **API Layer**: `gateway` (Fastify HTTP) + `server` (MCP) + `cli` — 对外访问
- **Engine Layer**: `engine` (Honeycomb Orchestrator) — 编排和工作流
- **Capability Layer**: `toolkit` — LLM 调用、Pattern、Memory、Skills、Tools

### 核心模块

#### gateway (`packages/gateway/src/`)

Fastify HTTP 网关，注册路由如下：

**apiRoutes** — 前缀 `/v1`：
- `GET /v1/health` — 健康检查
- `GET /v1/health/detailed` — 详细健康检查（含断路器、向量存储、配置）
- `POST /v1/tasks` — 提交任务
- `GET /v1/tasks` — 获取所有任务
- `GET /v1/tasks/:taskId` — 获取任务状态
- `POST /v1/tasks/:taskId/cancel` — 取消任务
- `POST /v1/scheduler` — 创建定时任务
- `GET /v1/scheduler` — 列出定时任务
- `DELETE /v1/scheduler/:id` — 删除定时任务
- `POST /v1/pipeline` — Agent 协作流水线
- `POST /v1/spaces` — 创建共享空间
- `GET /v1/spaces/:spaceId` — 获取共享空间
- `GET /v1/agents` — 获取 Agent 列表
- `POST /v1/agents` — 注册 Agent
- `GET /v1/model-orchestrator/models` — 获取模型编排列表（桥接 @agentmesh/model-orchestrator）
- `POST /v1/model-orchestrator/chat` — 模型编排对话（桥接 @agentmesh/model-orchestrator）
- `GET /v1/skills` — 获取技能列表（桥接 @agentmesh/toolkit SkillLoader）
- `POST /v1/skills/:skillId/execute` — 执行技能（桥接 @agentmesh/toolkit SkillController）

**modelGatewayRoutes** — 无前缀（路径中自带 `/v1`）：
- `GET /v1/model-gateway/health` — 模型网关健康
- `GET /v1/model-gateway/quota` — 配额查询
- `GET /v1/model-gateway/stats` — 统计
- `GET /v1/model-gateway/health/:provider` — 指定 Provider 健康
- `GET /v1/model-gateway/health/all` — 所有 Provider 健康
- `GET /v1/models` — 模型列表
- `POST /v1/chat/completions` — OpenAI 兼容聊天
- `POST /v1/responses` — Codex Responses API

**sseRoutes** — 前缀 `/v1`：
- `GET /v1/events` — SSE 事件流
- `GET /v1/ws-info` — WebSocket 信息
- `POST /v1/events` — 推送事件

**hermesRoutes** — 前缀 `/v1`：
- `POST /v1/hermes/task` — 提交 Hermes 任务
- `GET /v1/hermes/task/:taskId` — 查询 Hermes 任务
- `GET /v1/hermes/tasks` — 所有 Hermes 任务
- `GET /v1/hermes/health` — Hermes 健康

**dashboardRoutes** — 无前缀：
- `GET /dashboard` — 仪表盘

#### engine (`packages/engine/src/`)

Honeycomb 编排引擎 v2.0：
- Orchestrator + PhaseStateMachine + DSL Compiler + AgentRunner + MessageBus
- MetricsCollector 导出给 MCP Server 使用

#### toolkit (`packages/toolkit/src/`)

共享能力层：
- AlgorithmEngine(7-phase) + PatternLoader + 16 Agent Design Patterns
- SkillLoader/Router/Executor + MemoryStore + ToolRegistry
- LLM 多 Provider (OpenAI/Anthropic/Ollama) + Middleware + Observability
- VectorStore (MemoryVectorStore / ChromaVectorStore / QdrantVectorStore)
- KnowledgeGraph + DataSources + HybridRetriever

#### model-orchestrator (`packages/model-orchestrator/src/`)

模型聚合调度层：
- 6 个 ModelProvider: ollama/lm-studio/llama-cpp/openai/anthropic/openrouter
- LocalModelDiscoverer: 自动探测本地模型
- ModelScheduler: cost/speed/capability/balanced 4 策略调度
- ModelRegistry: Provider 注册 + 模型管理
- 配置系统：`loadConfig()` 从环境变量和泵浦文件加载

### MCP Server (`apps/server/src/mcp/`)

依赖注入式 MCP 服务器，对接 model-orchestrator / gateway / toolkit 真实实现：
- `models_list/chat/health` → model-orchestrator 真实实现
- `tasks_submit/status/list` → gateway TaskManager
- `skills_list/search/execute` → toolkit SkillController
- `system_health/metrics` → 进程级 + engine MetricsCollector

### CLI (`apps/cli/src/`)

统一命令行入口：
- `agentmesh model list|health` — 模型操作
- `agentmesh start|mcp|status` — 服务管理

## 跨包桥接（Bridge 模式）

所有桥接均保持严格的单向依赖，toolkit 是纯底层的。

### gateway → toolkit 桥接

| 文件 | 桥接方式 |
|------|---------|
| `event-bus.ts` | 包装 `@agentmesh/toolkit EventEmitter`，保持旧版 API 兼容 |
| `retry.ts` | 包装 `@agentmesh/toolkit RetryableClient`，V1 API 兼容 |
| `health.ts` | 导入 `createHealthCheck/createMemoryHealthCheck/createEventLoopHealthCheck`，增加系统级健康检查层 |
| `vector-store.ts` | 包装 `@agentmesh/toolkit ChromaVectorStore`，保持 `VectorStore` 类名和单例导出 |
| `rate-limit.ts` | 注释桥接：网关的令牌桶与传统 HTTP 中间件架构不同，仅做引用说明 |
| `api.ts` | 使用 `@agentmesh/toolkit SkillLoader/SkillController` 实现 `/v1/skills` 路由 |

### gateway → model-orchestrator 桥接

| 文件 | 桥接方式 |
|------|---------|
| `api.ts` | 使用 `@agentmesh/model-orchestrator initFromConfig` 实现 `/v1/model-orchestrator/*` 路由 |

### engine → toolkit 桥接

| 文件 | 桥接方式 |
|------|---------|
| `orchestrator.ts` | 使用 `@agentmesh/toolkit ToolRegistry` 作为共享工具注册表 |

## 跨包 HTTP 路由一览

| 路由 | 所属包 | 说明 |
|------|--------|------|
| `/v1/health` | gateway | 网关健康检查 |
| `/v1/tasks` | gateway | 任务 CRUD |
| `/v1/spaces` | gateway | 共享空间 |
| `/v1/agents` | gateway | Agent 管理 |
| `/v1/events` | gateway | SSE 事件流 |
| `/v1/scheduler` | gateway | 定时任务 |
| `/v1/pipeline` | gateway | Agent 流水线 |
| `/v1/hermes/*` | gateway (hermes) | webhook 服务 |
| `/v1/chat/completions` | gateway (model-gateway) | OpenAI 兼容 |
| `/v1/responses` | gateway (model-gateway) | Codex 兼容 |
| `/v1/model-gateway/*` | gateway (model-gateway) | 模型网关管理 |
| `/v1/models` | gateway (model-gateway) | 模型列表 |
| `/v1/model-orchestrator/*` | gateway → model-orchestrator 桥接 | 模型编排路由 |
| `/v1/skills` | gateway → toolkit 桥接 | 技能路由 |
| `/dashboard` | gateway | 仪表盘 |

## 关键配置

`config/gateway.yaml` — gateway 和模型网关共享配置。
模型 Provider 配置在 `packages/model-orchestrator/` 中通过 `loadConfig()` 编程式加载。

## 类型

- `packages/core-types/src/` — 共享类型定义 (model/agent/task/events)
- `packages/gateway/src/types/` — 原 agentmesh 类型
- `packages/model-orchestrator/src/types.ts` — 模型编排特有类型

## 构建 & 测试

```sh
# 全部类型检查
bun run typecheck

# 全部测试
bun test

# 全部编译
bun run build

# 覆盖测试
cd packages/gateway && bun test --coverage
```
