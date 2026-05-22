# Agent Mesh v2.0 — 统一 Agent 调度基础设施

[English](./README.md) | [中文](./README.zh-CN.md)

> 三层统一架构：API 网关 + 编排引擎 + 能力库，本地和云端模型聚合调度。

## 架构总览

```
agentmesh/  (monorepo — bun workspaces)
├── packages/
│   ├── core-types/         统一接口契约 (model/agent/task/events)
│   ├── model-orchestrator/ 本地+云端模型聚合发现与动态调度
│   ├── gateway/            Fastify HTTP API 网关 (:3000)
│   ├── engine/             Honeycomb 多 Agent 编排引擎
│   ├── toolkit/            共享能力 SDK (LLM/Memory/Pattern/Skills)
│   └── domains/            可插拔领域模板 (visual-production 等)
├── apps/
│   ├── server/             MCP 服务器 (11 tools) + 进程管理器
│   └── cli/                统一命令行
└── config/
    ├── gateway.yaml        网关配置
    └── models.yaml         模型 Provider/断路器/重试 配置
```

## 快速开始

### 安装

```bash
git clone https://github.com/starlink-awaken/agentmesh.git
cd agentmesh
bun install
```

### 类型检查 + 测试

```bash
bun run typecheck   # 7 个包全部验证
bun test            # 144 个测试全绿
```

### 启动 HTTP 网关

```bash
cd packages/gateway && bun run src/index.ts
# 浏览器访问 http://localhost:3000/dashboard
```

### 启动 MCP 服务器

```bash
bun run apps/server/src/mcp/index.ts
# 仅需终端，无需 HTTP 端口，兼容任何 MCP 客户端
```

### CLI 模型操作

```bash
bun run apps/cli/src/index.ts model list    # 列出本地+云端所有模型
bun run apps/cli/src/index.ts model health  # 模型健康检查
bun run apps/cli/src/index.ts status        # 系统状态
bun run apps/cli/src/index.ts start         # 启动服务
```

## Model Orchestrator

本地和云端模型的统一聚合与动态调度。

### 支持的 Provider

| Provider | 位置 | 发现方式 |
|----------|------|----------|
| Ollama | 本地 | `http://localhost:11434/api/tags` |
| LM Studio | 本地 | `http://localhost:1234/v1/models` |
| llama.cpp | 本地 | 端口扫描 (8080/8081/8082/8000) |
| OpenAI | 云端 | API key |
| Anthropic | 云端 | API key |
| OpenRouter | 云端 | API key |

### 调度策略

- **cost-first**: 按 token 单价升序
- **speed-first**: 按平均延迟升序
- **capability-first**: 按能力匹配度 + contextWindow
- **balanced**: 加权综合（成本 30% + 速度 30% + 能力 40%）

### 断路器

三态: CLOSED → OPEN (3次失败) → HALF_OPEN → CLOSED/OPEN。通过 `models.yaml` 配置。

### 重试

指数退避 + 随机抖动。默认: 3次重试, 500ms基础延迟, 最大10s。

## 包依赖

```
apps/cli → apps/server → packages/gateway → packages/engine → packages/toolkit
                 ↘              ↙              ↙
            packages/model-orchestrator
                 ↕
           packages/core-types (零依赖)
```

严格单向，toolkit 是纯底层能力层。

## API 端点一览

| 端点 | 层 | 说明 |
|------|-----|------|
| `GET /v1/health` | gateway | 健康检查 |
| `GET /v1/health/detailed` | gateway | 详细健康（断路器、配置） |
| `GET /v1/models` | model-gateway | 模型列表（动态发现） |
| `POST /v1/chat/completions` | model-gateway | OpenAI 兼容聊天 |
| `POST /v1/responses` | model-gateway | Codex Desktop 适配器 |
| `GET /v1/model-orchestrator/models` | bridge | 模型编排列表 |
| `POST /v1/model-orchestrator/chat` | bridge | 调度器路由聊天 |
| `GET /v1/skills` | bridge | 技能列表 |
| `POST /v1/skills/:id/execute` | bridge | 执行技能 |
| `GET /v1/tasks` | gateway | 任务列表 |
| `POST /v1/tasks` | gateway | 提交任务 |
| `GET /v1/agents` | gateway | Agent 列表 |
| `POST /v1/pipeline` | gateway | 多 Agent 流水线 |
| `GET /dashboard` | gateway | 网页仪表盘 |

## 项目状态

```
AgentMesh v2:    7 包 monorepo | 144 测试 | 113K 源码行 | 0 编译错误
├── core-types:         5 文件 | 零依赖类型包
├── model-orchestrator: 12 文件 | 6 Provider | 动态调度器 | 断路器 | 重试
├── gateway:            37 文件 | 9 测试 | Fastify HTTP GW | 45+ 路由
├── engine:             93 文件 | 92 测试 | Honeycomb 编排
├── toolkit:            156 文件 | 41 测试 | 能力 SDK
├── server:             2 文件 | MCP (11 tools)
└── cli:                1 文件 | 统一 CLI
```

## 文档

- [架构设计](./docs/architecture.md)
- [API 文档](./docs/api.md)
- [配置参考](./docs/configuration.md)

## 许可证

MIT
