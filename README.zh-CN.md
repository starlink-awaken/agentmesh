# @starlink-awaken/agentmesh

<p align="center">
  <img src="https://img.shields.io/npm/v/@starlink-awaken/agentmesh" alt="npm version">
  <img src="https://img.shields.io/npm/l/@starlink-awaken/agentmesh" alt="license">
  <img src="https://img.shields.io/github/stars/starlink-awaken/agentmesh" alt="stars">
  <img src="https://img.shields.io/github/forks/starlink-awaken/agentmesh" alt="forks">
</p>

> 统一的 Agent 调度网关 - 多智能体调度与路由

[English](./README.md) | [中文](./README.zh-CN.md)

## 概述

Agent Mesh 是一个强大的多智能体调度网关，能够协调和调度多种 AI Agent（包括 Claude Code、OpenClaw 以及其他本地安装的 Agent CLI 工具）。

## 特性

- 🤖 **多 Agent 支持** - 内置支持 24+ 种 AI Agent
- 🎯 **智能路由** - 根据任务类型自动选择合适的 Agent
- 🔄 **双向调度** - 支持 Agent 之间的相互调用
- 👥 **多 Agent 协作** - 同一任务可调度多个 Agent
- 📁 **上下文共享** - 文件级共享空间，支持上下文持久化
- 🌐 **REST API** - 完整的 HTTP API 支持
- 📡 **实时事件** - SSE/WebSocket 实时任务更新
- 📊 **监控日志** - 内置指标收集和日志系统

## 快速开始

### 安装

```bash
# 使用 bun
bun add @starlink-awaken/agentmesh

# 或使用 npm
npm install @starlink-awaken/agentmesh

# 或使用 yarn
yarn add @starlink-awaken/agentmesh
```

### CLI 全局安装

```bash
npm install -g @starlink-awaken/agentmesh

# 或者
bun install -g @starlink-awaken/agentmesh
```

### 启动服务

```bash
# 使用 bun
bun run src/index.ts

# 或使用 CLI
agent-gateway start

# 或指定端口
agent-gateway start --port 8080
```

### 使用 Docker

```bash
# 构建镜像
docker build -t agentmesh .

# 运行容器
docker run -p 3000:3000 agentmesh
```

## 使用方法

### CLI 命令

```bash
# 列出所有可用 Agent
agent-gateway agents

# 提交通用任务（自动路由）
agent-gateway task "帮我写一个排序算法"

# 提交任务到指定 Agent
agent-gateway to claude-code "帮我 review 这段代码"

# 创建共享空间
agent-gateway space create-space

# 列出所有任务
agent-gateway tasks

# 检查 Gateway 状态
agent-gateway health
```

### REST API

```bash
# 健康检查
curl http://localhost:3000/health

# 提交任务
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"payload": {"task": "帮我写一个排序算法"}}'

# 获取 Agent 列表
curl http://localhost:3000/agents

# 创建共享空间
curl -X POST http://localhost:3000/spaces \
  -H "Content-Type: application/json" \
  -d '{"metadata": {"name": "项目A"}}'
```

### JavaScript/TypeScript

```typescript
import { AgentGateway } from '@starlink-awaken/agentmesh';

const gateway = new AgentGateway({
  port: 3000,
  agents: [
    { id: 'claude-code', command: 'claude', args: ['-p'] }
  ]
});

await gateway.start();

// 提交任务
const task = await gateway.submitTask({
  payload: {
    task: '帮我写一个排序算法'
  }
});

console.log('Task ID:', task.id);
```

## 配置

### 路由规则

在 `config/gateway.yaml` 中配置任务路由规则：

```yaml
routing:
  rules:
    - name: code-review
      keywords: [review, code review, pr review]
      agent: claude-code
      priority: 10

    - name: browser-automation
      keywords: [browser, scrape, click]
      agent: openclaw
      priority: 10
```

### Agent 配置

```yaml
agents:
  - id: claude-code
    name: Claude Code
    type: claude-code
    capabilities:
      - code-generation
      - code-review

  - id: my-agent
    name: My Custom Agent
    type: http
    endpoint: http://localhost:8080
```

## 支持的 Agent

| Agent | 描述 | 能力 |
|-------|------|------|
| claude-code | Anthropic Claude Code | 代码生成、审查、重构 |
| openclaw | OpenClaw | 浏览器自动化、网页抓取 |
| cursor | Cursor | 代码补全、聊天 |
| windsurf | Windsurf | Agent 编码、Flow 状态 |
| aider | Aider | Git 集成编辑、多文件修改 |
| ollama | Ollama | 本地 LLM、隐私优先 |
| perplexity | Perplexity | 研究助手、网络搜索 |
| grok | xAI Grok | 推理、代码生成 |
| ... | 更多 Agent | 见文档 |

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Mesh Gateway                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  Task API   │  │  Event Bus  │  │  Discovery │       │
│  │  (REST/WS) │  │  (Pub/Sub) │  │   Service  │       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│         │                 │                 │               │
│  ┌──────┴────────────────┴─────────────────┴──────┐      │
│  │              Context Manager                     │      │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐       │      │
│  │  │  Memory │  │  Files  │  │VectorDB │       │      │
│  │  │  Cache  │  │ Persist │  │ Storage │       │      │
│  │  └─────────┘  └─────────┘  └─────────┘       │      │
│  └──────────────────────┬──────────────────────────┘      │
└─────────────────────────┼──────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   ┌─────────┐       ┌─────────┐       ┌─────────┐
   │ Claude  │       │  Open   │       │  Other  │
   │  Code   │◄────►│  Claw   │◄────►│  Agents │
   └─────────┘       └─────────┘       └─────────┘
```

## 文档

- [API 文档](./docs/api.md)
- [配置参考](./config/gateway.yaml)
- [Agent 开发指南](./docs/agent-adapter.md)

## 贡献

欢迎贡献代码！请阅读 [贡献指南](./CONTRIBUTING.md) 了解如何参与项目开发。

## 许可证

MIT License - 请查看 [LICENSE](./LICENSE) 文件。

## 赞助

如果你喜欢这个项目，请考虑赞助我们。

---

Made with ❤️ by [Starlink Awaken](https://github.com/starlink-awaken)
