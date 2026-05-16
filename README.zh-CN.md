# Agent Mesh Gateway

<p align="center">
  <img src="https://img.shields.io/npm/v/@starlink-awaken/agentmesh" alt="npm version">
  <img src="https://img.shields.io/npm/l/@starlink-awaken/agentmesh" alt="license">
  <img src="https://img.shields.io/github/stars/starlink-awaken/agentmesh" alt="stars">
</p>

> 统一 Agent 调度网关 + 多模型智能路由 — 构建本地 AI 基础设施的核心层

[English](./README.md) | [中文](./README.zh-CN.md)

## 概述

Agent Mesh Gateway 是一个轻量级的本地 AI 基础设施层，提供两大核心能力：

- **Agent 调度层** — 协调 25+ 种 AI Agent（Claude Code, Codex Desktop, Gemini CLI...），进行任务路由与协作
- **模型网关层** — 统一 OpenAI 兼容 API 端点，根据 codexbar 实时配额数据智能路由到最优 Provider

## 特性

- **多 Agent 支持** — 内置 25+ Agent 适配器
- **智能模型路由** — 根据配额自动选择 Provider（DeepSeek → OpenRouter → Ollama）
- **配额感知 Fallback** — 通过 codexbar 实时感知各平台配额，自动降级
- **Codex Desktop 适配** — 内置 Responses API → Chat Completions 转换
- **OpenAI 兼容 API** — 标准 `/v1/chat/completions` 和 `/v1/models` 端点
- **CLI 工具** — 完整的命令行管理接口
- **Docker 支持** — Dockerfile + docker-compose 一键部署
- **结构化日志** — 带级别的日志 + 文件持久化

## 快速开始

### 安装

```bash
npm install -g @starlink-awaken/agentmesh
# 或
bun install -g @starlink-awaken/agentmesh
```

### 初始化

```bash
agentmesh setup    # 交互式配置 API Key
agentmesh start    # 启动网关
agentmesh doctor   # 检查系统状态
```

### 从源码运行

```bash
git clone https://github.com/starlink-awaken/agentmesh.git
cd agentmesh
cp .env.example .env   # 编辑填入 API Key
./start.sh             # 一键启动
```

### Docker

```bash
docker compose up -d   # 启动网关 + ChromaDB
```

## 使用方法

### CLI

```bash
agentmesh start              # 启动服务
agentmesh connect            # 交互式接入 AI 工具 (自动嗅探)
agentmesh connect list       # 检测已安装工具
agentmesh disconnect all     # 恢复工具配置
agentmesh health             # 健康检查
agentmesh models             # 列出可用模型
agentmesh quota              # 配额状态
agentmesh config show        # 查看配置
agentmesh doctor             # 系统诊断
agentmesh help               # 帮助
```

### API

```bash
# 健康检查
curl http://127.0.0.1:3000/health

# 模型列表
curl http://127.0.0.1:3000/v1/models

# 配额信息
curl http://127.0.0.1:3000/model-gateway/quota

# Chat Completions
curl -X POST http://127.0.0.1:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Codex Desktop Responses API
curl -X POST http://127.0.0.1:3000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-v4-pro",
    "input": [{"role": "user", "content": "Write a function"}]
  }'
```

### 对接 AI 工具

**一键接入：**
```bash
agentmesh connect            # 交互式选择工具
agentmesh connect all        # 接入所有检测到的工具
agentmesh disconnect all     # 恢复
```

**Codex Desktop** (`~/.codex/config.toml`):
```toml
model_provider = "agentmesh"
[model_providers.agentmesh]
name = "Agent Mesh"
base_url = "http://127.0.0.1:3000/v1"
wire_api = "responses"
```

**Claude Code / 其他工具:**
统一指向 `http://127.0.0.1:3000/v1`，使用 OpenAI 兼容 API。

## 架构

```
  Codex Desktop   Claude Code   Gemini CLI   Other Tools
        │               │             │            │
        └───────────────┼─────────────┼────────────┘
                        │   /v1/*     │
                        ▼             ▼
              ┌─────────────────────────┐
              │   Agent Mesh Gateway    │
              │                         │
              │  ┌───────────────────┐  │
              │  │  Model Router     │  │  ← codexbar 配额感知
              │  │  Provider Select  │  │
              │  └───────────────────┘  │
              │                         │
              │  ┌───────────────────┐  │
              │  │  Agent Router     │  │  ← 任务关键词匹配
              │  │  Task Dispatcher  │  │
              │  └───────────────────┘  │
              └─────────┬───────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
     DeepSeek      OpenRouter       Ollama
```

## 配置

配置文件: `config/gateway.yaml`

```yaml
models:
  providers:
    deepseek:
      base_url: https://api.deepseek.com/v1
      api_key_env: DEEPSEEK_API_KEY
      models: [deepseek-chat, deepseek-v4-pro]
    # ... 更多 Provider

  fallback_chain: [deepseek, openrouter, ollama]

  model_routing:
    "gpt-": [openai, deepseek]
    "deepseek": [deepseek]
    "claude": [openrouter]
```

## 支持的 Provider

| Provider | 类型 | 需要 |
|----------|------|------|
| DeepSeek | API Key | `DEEPSEEK_API_KEY` |
| OpenAI | API Key | `OPENAI_API_KEY` |
| OpenRouter | API Key | `OPENROUTER_API_KEY` |
| Ollama | 本地 | 安装 [Ollama](https://ollama.ai) |

## API 端点

| 端点 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `GET /v1/models` | 模型列表 |
| `POST /v1/chat/completions` | Chat Completions |
| `POST /v1/responses` | Codex Desktop Responses |
| `GET /model-gateway/health` | 网关健康 + 配额 |
| `GET /model-gateway/quota` | 配额详情 |
| `GET /agents` | Agent 列表 |
| `POST /tasks` | 提交 Agent 任务 |

## 文档

- [架构设计](./docs/architecture.md)
- [API 文档](./docs/api.md)
- [配置参考](./docs/configuration.md)

## 贡献

欢迎贡献！详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

MIT — [LICENSE](./LICENSE)
