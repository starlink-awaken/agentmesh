# Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Tool Consumers                         │
│  Codex Desktop  Claude Code  Gemini CLI  Other Tools     │
└────────────┬─────────────────────────────────────────────┘
             │  /v1/chat/completions  /v1/responses
             ▼
┌──────────────────────────────────────────────────────────┐
│                 Agent Mesh Gateway :3000                   │
│                                                           │
│  ┌──────────────────┐    ┌──────────────────────┐       │
│  │  Model Gateway    │    │  Agent Orchestrator   │       │
│  │  ┌──────────────┐ │    │  ┌──────────────────┐ │       │
│  │  │ Quota Probe  │ │    │  │  Agent Registry  │ │       │
│  │  │ (codexbar)   │ │    │  │  (25+ adapters)  │ │       │
│  │  └──────┬───────┘ │    │  └────────┬─────────┘ │       │
│  │         │         │    │           │           │       │
│  │  ┌──────┴───────┐ │    │  ┌────────┴─────────┐ │       │
│  │  │ Model Router │ │    │  │  Task Router     │ │       │
│  │  │ (fallback)   │ │    │  │  (keyword match) │ │       │
│  │  └──────┬───────┘ │    │  └────────┬─────────┘ │       │
│  │         │         │    │           │           │       │
│  │  ┌──────┴───────┐ │    │  ┌────────┴─────────┐ │       │
│  │  │Provider Client│ │    │  │ Event Bus        │ │       │
│  │  │(HTTP Stream) │ │    │  │ (Pub/Sub)        │ │       │
│  │  └──────────────┘ │    │  └──────────────────┘ │       │
│  └──────────────────┘    └──────────────────────┘       │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │              Context Manager                       │    │
│  │  Shared Spaces  File Cache  Vector Store (ChromaDB)│    │
│  └──────────────────────────────────────────────────┘    │
└──────────┬───────────────────────────────────────────────┘
           │
    ┌──────┼──────┬──────────┐
    ▼      ▼      ▼          ▼
  DeepSeek OpenAI OpenRouter Ollama
```

## Model Gateway Layer

### Quota Probe (`quota.ts`)
- Calls `codexbar usage --format json --provider all`
- Caches results for 60 seconds
- Parses provider-specific quota formats:
  - codex: credits.remaining
  - deepseek: balance in ¥ (from resetDescription)
  - openrouter: openRouterUsage.balance
  - ollama: always available

### Model Router (`router.ts`)
- `resolveProvider(model)`: determines which provider to use
- Priority: model_routing config → fallback_chain → first available
- Checks quota availability via `isProviderAvailable()`
- Checks API key availability via env vars or config

### Provider Client (`providers.ts`)
- `callChatCompletions()`: unified OpenAI-compatible client
- `callResponsesApi()`: converts Responses API → Chat Completions
  - Extracts messages from `input` array
  - Maps `input_text`/`output_text` content types
  - Preserves tool definitions

### Routes (`routes.ts`)
- `GET /v1/models`: aggregated model list
- `POST /v1/chat/completions`: proxy with streaming support
- `POST /v1/responses`: Codex Desktop adapter
- `GET /model-gateway/health`: quota-aware health check
- `GET /model-gateway/quota`: full quota details

## Agent Orchestration Layer

### Agent Registry
- Manages 25+ agent adapters
- Capability-based agent discovery
- Health check monitoring

### Task Router
- Keyword-based task-to-agent routing
- Priority-based rule matching
- Broadcast support for multi-agent tasks

### Context Manager
- Shared spaces with file persistence
- Message history per space
- Artifact storage

## Data Flow

### Chat Completions Flow
```
1. Client → POST /v1/chat/completions { model, messages }
2. Router: parse model → check routing config → check quota → select provider
3. Provider Client: POST to provider API with streaming
4. Response: SSE stream or JSON → Client
```

### Codex Desktop Flow
```
1. Codex Desktop → POST /v1/responses { input: [...], model }
2. Adapter: convert input items → messages array
3. Router: resolve provider (same as chat completions)
4. Provider Client: POST /v1/chat/completions to provider
5. Adapter: convert chat response → responses format (output items)
6. Response → Codex Desktop
```

### Quota Refresh Flow
```
1. First API call triggers quota probe
2. codexbar subprocess runs (~10-30s)
3. Results parsed and cached (60s TTL)
4. Router uses cached data for decisions
5. After 60s, next request triggers refresh
```

## Technology Stack

- **Runtime**: Bun (>=1.0.0)
- **Server**: Fastify 5
- **HTTP Client**: Native Fetch API
- **Streaming**: Server-Sent Events (SSE)
- **WebSocket**: Fastify WebSocket plugin
- **Vector Store**: ChromaDB (optional)
- **Logging**: Custom structured logger + Pino
- **Config**: YAML

## Design Decisions

1. **All providers via OpenAI-compatible API**: Avoids per-provider client complexity
2. **Quota caching**: codexbar is slow, 60s cache prevents latency spikes
3. **Streaming passthrough**: Zero-copy SSE forwarding for efficiency
4. **No additional deps for model gateway**: Uses Bun's built-in Fetch API
5. **codexbar as quota source**: Already aggregates 30+ providers, no duplicate logic
