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
cd packages/model-orchestrator && bun test  # model-orchestrator 测试
cd apps/server && bun run src/mcp/index.ts  # 启动 MCP 服务器 (stdio)
cd apps/cli && bun run src/index.ts model list  # CLI 查模型
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

- **gateway** (`packages/gateway/src/`): 原 agentmesh v1.5, Fastify HTTP 网关
  - `/v1/*` → apiRoutes/sseRoutes/hermesRoutes
  - `/v1/chat/completions` → modelGatewayRoutes
  - **EventBus** (`core/event-bus.ts`): 基于 @agentmesh/toolkit EventEmitter 的桥接
  - **Retry** (`model-gateway/retry.ts`): 基于 @agentmesh/toolkit RetryableClient 的桥接

- **engine** (`packages/engine/src/`): 原 honeycomb v2.0, 编排引擎
  - Orchestrator + PhaseStateMachine + DSL Compiler + AgentRunner + MessageBus
  - 桥接: 使用 @agentmesh/toolkit ToolRegistry

- **toolkit** (`packages/toolkit/src/`): 原 agent-toolkit v1.0, 共享能力层
  - AlgorithmEngine(7-phase) + PatternLoader + 16 Agent Design Patterns
  - SkillLoader/Router/Executor + MemoryStore + ToolRegistry
  - LLM 多 Provider (OpenAI/Anthropic/Ollama) + Middleware + Observability

- **model-orchestrator** (`packages/model-orchestrator/src/`): 新项目
  - 6 个 ModelProvider: ollama/lm-studio/llama-cpp/openai/anthropic/openrouter
  - LocalModelDiscoverer: 自动探测本地模型
  - ModelScheduler: cost/speed/capability/balanced 4 策略调度
  - ModelRegistry: Provider 注册 + 模型管理

### 对外访问

- **MCP Server** (`apps/server/src/mcp/`): 11 个 MCP tools
  - `models_list/chat/health` → model-orchestrator 真实实现
  - `tasks_submit/status/list` → 占位（待连接 gateway TaskManager）
  - `skills_list/search/execute` → 占位（待连接 toolkit SkillController）
  - `system_health/metrics` → 进程级

- **CLI** (`apps/cli/src/`): 统一命令行
  - `agentmesh model list|health` → model-orchestrator
  - `agentmesh start|mcp|status`

## 构建 & 测试

```sh
# 全部编译
cd packages/core-types && bun run build    # core-types 必须先编译（被所有包依赖）
cd packages/toolkit && bun run build       # toolkit 第二（被 gateway/engine 依赖）
cd packages/model-orchestrator && bun run build  # 第三

# 全部类型检查
bun run typecheck
```

## 关键配置

`config/gateway.yaml` — gateway 和模型网关共享配置。
模型 Provider 配置在 `packages/model-orchestrator/` 中编程式配置。

## 类型

- `packages/core-types/src/` — 共享类型定义 (model/agent/task/events)
- `packages/gateway/src/types/` — 原 agentmesh 类型
- `packages/model-orchestrator/src/types.ts` — 模型编排特有类型
