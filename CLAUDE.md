# CLAUDE.md

## 命令

```sh
bun run dev          # 启动开发服务器 (src/index.ts)
bun run start        # 同上
bun run build        # tsc 编译到 dist/
bun test             # 运行所有测试 (bun test)
bun test tests/model-gateway/router.test.ts  # 单个测试
```

## 架构

**Agent Mesh Gateway** — Fastify 多智能体调度网关 + 模型网关。

### 路由拓扑 (全 /v1 版本化)

```
/v1/health          → apiRoutes
/v1/tasks           → apiRoutes (CRUD)
/v1/spaces          → apiRoutes (CRUD)
/v1/agents          → apiRoutes (list/register)
/v1/events          → sseRoutes (SSE 实时事件流)
/v1/hermes/task     → hermesRoutes (webhook)
/v1/models          → modelGatewayRoutes (OpenAI 兼容)
/v1/chat/completions → modelGatewayRoutes (OpenAI 兼容)
/v1/responses       → modelGatewayRoutes (Codex 兼容)
/v1/model-gateway/* → modelGatewayRoutes (管理: health/quota/stats)
```

### 智能体系统 (`src/core/` + `src/adapters/`)

任务流：`POST /v1/tasks → TaskManager.processTask() → Router.route() → Adapter.invoke()`

- **Router** (`core/router.ts`): 关键词匹配路由，按 `config/gateway.yaml` 中 routing.rules 优先级排序。支持 direct/broadcast 策略
- **AgentRegistry** (`core/agent-registry.ts`): 25+ Agent 默认定义在 `core/agents.default.ts`，YAML 配置覆盖
- **Adapters** (`adapters/`): `BaseAdapter → ClaudeCodeAdapter / OpenClawAdapter / ProcessAdapter`
- **TaskManager** (`core/task-manager.ts`): 任务生命周期 (pending→assigned→running→completed/failed)
- **ContextManager** (`core/context-manager.ts`): L1 内存 → L2 文件系统 → L3 ChromaDB，路径来自 config.dataDir
- **EventBus** (`core/event-bus.ts`): 9 种事件类型的 pub/sub

### 模型网关 (`src/model-gateway/`)

请求流：`POST /v1/chat/completions → resolveProvider(model) → 断路保护 → 限流 → 重试 → 上游`

- **Router** (`model-gateway/router.ts`): 模型名模式匹配 → 回退链 → 首个可用 provider
- **断路保护** (`circuit-breaker.ts`): CLOSED→OPEN(3次失败)→HALF_OPEN(30s)→CLOSED
- **重试** (`retry.ts`): 指数退避 500ms→10s, 最多3次, 仅限 429/5xx
- **限流** (`rate-limit.ts`): 令牌桶, 默认 60rpm(chat)/30rpm(responses), 从 YAML 可配置
- **Providers** (`providers.ts`): 代理转发 + Codex Responses API SSE 流转换
- **Quota** (`quota.ts`): 通过 codexbar CLI 查询配额

### 配置系统 (`core/config.ts`)

`config/gateway.yaml` → `GatewayConfig` 类型。模型网关配置通过 `models` 节注入：providers、model_routing、fallback_chain、defaults (circuit_breaker/retry/rate_limit)。YAML snake_case → TS camelCase 映射在 `index.ts` 边界处完成。

### CLI (`src/cli.ts`)

start, setup, connect/disconnect, health, status, models, quota, agents, tasks, config, doctor, hermes

## 关键模式

- **适配器模式**: Agent 执行通过 `AgentAdapter` 接口。新增 Agent = 新增适配器或 ProcessAdapter + 配置
- **事件驱动**: 任务状态变更 → EventBus → SSE 客户端
- **配置驱动**: Agent/Provider 均通过 `gateway.yaml` 配置。CLI connect 通过 `ToolAdapter` 接口 (检测/读取/生成配置) 修改外部工具
- **Fastify** 是唯一 HTTP 框架。不要引入 express/Bun.serve

## 测试

`bun test`。测试镜像 src 结构：`tests/core/`、`tests/model-gateway/`。

类型：`src/types/index.ts` (通信协议)、`src/core/config.ts` (配置)、`src/model-gateway/types.ts` (模型网关)
