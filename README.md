# Agent Mesh v2.0 — Unified Agent Scheduling Infrastructure

[English](./README.md) | [中文](./README.zh-CN.md)

> Three-layer unified architecture: API Gateway + Orchestration Engine + Capability SDK, with local and cloud model aggregation and dynamic scheduling.

## Architecture Overview

```
agentmesh/  (monorepo — bun workspaces)
├── packages/
│   ├── core-types/         Unified interface contracts (model/agent/task/events)
│   ├── model-orchestrator/ Local + cloud model aggregation discovery + dynamic scheduling
│   ├── gateway/            Fastify HTTP API Gateway (:3000)
│   ├── engine/             Honeycomb Multi-Agent Orchestration Engine
│   ├── toolkit/            Shared Capability SDK (LLM/Memory/Pattern/Skills)
│   └── domains/            Pluggable domain templates (visual-production, etc.)
├── apps/
│   ├── server/             MCP Server (11 tools) + Process Manager
│   └── cli/                Unified CLI
└── config/
    ├── gateway.yaml        Gateway configuration
    └── models.yaml         Model provider, circuit breaker, and retry config
```

## Quick Start

```bash
git clone https://github.com/starlink-awaken/agentmesh.git
cd agentmesh

# Install dependencies
bun install

# Type check (all 7 packages)
bun run typecheck

# Run all 144 tests
bun test
```

### Gateway

```bash
cd packages/gateway && bun run src/index.ts
# HTTP API at http://localhost:3000
```

### MCP Server

```bash
bun run apps/server/src/mcp/index.ts
# MCP over stdio, compatible with any MCP client
```

### CLI

```bash
bun run apps/cli/src/index.ts model list
bun run apps/cli/src/index.ts model health
bun run apps/cli/src/index.ts start
bun run apps/cli/src/index.ts status
```

## Model Orchestrator

Unified aggregation and dynamic scheduling for local + cloud models.

### Supported Providers

| Provider | Location | Discovery |
|----------|----------|-----------|
| Ollama | Local | `http://localhost:11434/api/tags` |
| LM Studio | Local | `http://localhost:1234/v1/models` |
| llama.cpp | Local | Port scan (8080/8081/8082/8000) |
| OpenAI | Cloud | API key |
| Anthropic | Cloud | API key |
| OpenRouter | Cloud | API key |

### Scheduling Strategies

- **cost-first**: Ascending by token unit price
- **speed-first**: Ascending by average latency
- **capability-first**: Capability match + contextWindow score
- **balanced**: Weighted composite (cost 30% + speed 30% + capability 40%)

### Circuit Breaker

3-state: CLOSED → OPEN (3 failures) → HALF_OPEN → CLOSED/OPEN. Configured in `models.yaml`.

### Retry

Exponential backoff with jitter. Default: 3 retries, 500ms base delay, max 10s.

## Package Dependency

```
apps/cli → apps/server → packages/gateway → packages/engine → packages/toolkit
                 ↘              ↙              ↙
            packages/model-orchestrator
                 ↕
           packages/core-types (zero-dependency)
```

Strictly one-directional. toolkit is the pure bottom layer.

## API Endpoints

| Endpoint | Layer | Description |
|----------|-------|-------------|
| `GET /v1/health` | gateway | Health check |
| `GET /v1/health/detailed` | gateway | Detailed health (circuits, config) |
| `GET /v1/models` | model-gateway | Model list (dynamic discovery) |
| `POST /v1/chat/completions` | model-gateway | OpenAI-compatible chat |
| `POST /v1/responses` | model-gateway | Codex Desktop adapter |
| `GET /v1/model-orchestrator/models` | bridge | Model-orchestrator listing |
| `POST /v1/model-orchestrator/chat` | bridge | Scheduler-routed chat |
| `GET /v1/skills` | bridge | Skill list |
| `POST /v1/skills/:id/execute` | bridge | Execute skill |
| `GET /v1/tasks` | gateway | Task list |
| `POST /v1/tasks` | gateway | Submit task |
| `GET /v1/agents` | gateway | Agent list |
| `POST /v1/pipeline` | gateway | Multi-agent pipeline |
| `GET /dashboard` | gateway | Web dashboard |

## Project Status

```
AgentMesh v2:    7 packages monorepo | 144 tests | 113K source lines | 0 compile errors
├── core-types:         5 files | zero-dependency type package
├── model-orchestrator: 12 files | 6 Providers | dynamic scheduler | circuit breaker | retry
├── gateway:            37 files | 9 tests | Fastify HTTP gateway | 45+ routes
├── engine:             93 files | 92 tests | Honeycomb orchestration
├── toolkit:            156 files | 41 tests | Capability SDK
├── server:             2 files | MCP (11 tools)
└── cli:                1 file | Unified CLI
```

## Documentation

- [Architecture](./docs/architecture.md)
- [API Reference](./docs/api.md)
- [Configuration Guide](./docs/configuration.md)

## License

MIT
