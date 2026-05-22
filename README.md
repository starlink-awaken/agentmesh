# Agent Mesh v2.0 — 统一 Agent 调度基础设施

[English](./README.md) | [中文](./README.zh-CN.md)

> 三层统一架构：API 网关 + 编排引擎 + 能力库，本地和云端模型聚合调度。

## 架构总览

```
agentmesh/  (monorepo — bun workspaces)
├── packages/
│   ├── core-types/         统一接口契约 (model/agent/task/events)
│   ├── model-orchestrator/ 本地+云端模型聚合发现与动态调度
│   ├── gateway/            Fastify HTTP API 网关
│   ├── engine/             Honeycomb 多 Agent 编排引擎
│   └── toolkit/            共享能力 SDK (LLM/Memory/Pattern/Skills)
├── apps/
│   ├── server/             MCP 服务器 + 进程管理器
│   └── cli/                统一命令行
└── config/
    └── gateway.yaml        网关配置
```

## 快速开始

```bash
# 克隆项目
git clone https://github.com/starlink-awaken/agentmesh.git
cd agentmesh

# 安装依赖
bun install

# 类型检查（7 个包全部验证）
bun run typecheck

# 测试
bun test
```

### 发现本地模型

```bash
bun run apps/cli/src/index.ts model list
bun run apps/cli/src/index.ts model health
```

### 启动 MCP 服务器

```bash
bun run apps/server/src/mcp/index.ts
```

### 启动 HTTP 网关

```bash
cd packages/gateway && bun run src/index.ts
```

## Model Orchestrator

本地和云端模型的统一聚合与动态调度。

### 支持的 Provider

| Provider | 位置 | 发现方式 |
|----------|------|----------|
| Ollama | 本地 | `http://localhost:11434/api/tags` |
| LM Studio | 本地 | `http://localhost:1234/v1/models` |
| llama.cpp | 本地 | 端口扫描 (8080/8081/8082/8000) |
| OpenAI | 云端 | API |
| Anthropic | 云端 | API |
| OpenRouter | 云端 | API |

### 调度策略

- **cost-first**: 按 token 单价升序
- **speed-first**: 按平均延迟升序
- **capability-first**: 按能力匹配度 + contextWindow
- **balanced**: 加权综合（成本 30% + 速度 30% + 能力 40%）

## 包依赖

```
apps/cli → apps/server → packages/gateway → packages/engine → packages/toolkit
                 ↘              ↙              ↙
            packages/model-orchestrator
                 ↕
           packages/core-types (零依赖)
```

## 测试

| 包 | 测试数 |
|----|--------|
| engine | 92 |
| toolkit | 41 |
| gateway | 9 |
| model-orchestrator | 2 |
| **总计** | **144** |

## 许可证

MIT
