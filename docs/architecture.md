# Architecture

## System Overview

Three-layer unified architecture for Agent Mesh Gateway v2.0.

## Model Orchestrator Layer

The Model Orchestrator (`packages/model-orchestrator/`) provides:
- 6 Model Providers: Ollama, LM Studio, llama.cpp, OpenAI, Anthropic, OpenRouter
- LocalModelDiscoverer: auto-detect local models via API probes + port scanning
- ModelRegistry: provider registration, model lifecycle, circuit breaker isolation
- ModelScheduler: strategy-based selection (cost/speed/capability/balanced)
- CircuitBreakerRegistry: 3-state (CLOSED/OPEN/HALF_OPEN) per-provider
- withRetry(): exponential backoff with jitter, configurable status codes
## Gateway Layer

The Gateway (`packages/gateway/`) is a Fastify HTTP server (:3000) with:

### Model Gateway Routes (`model-gateway/routes.ts`)
- `GET /v1/models` — model list (dynamic discovery, falls back to static config)
- `POST /v1/chat/completions` — OpenAI-compatible with streaming
- `POST /v1/responses` — Codex Desktop Responses API adapter
- Gateway model-gateway management: health, quota, stats, per-provider health

### API Routes (`routes/api.ts`)
- `GET /v1/health` / `GET /v1/health/detailed` — health check + detailed
- `POST /v1/tasks` / `GET /v1/tasks` / `GET /v1/tasks/:taskId` — task CRUD
- `POST /v1/tasks/:taskId/cancel` — cancel running task
- `POST /v1/scheduler` / `GET /v1/scheduler` / `DELETE /v1/scheduler/:id` — cron tasks
- `POST /v1/pipeline` — multi-agent sequential execution
- `POST /v1/spaces` / `GET /v1/spaces/:spaceId` — shared context spaces
- `GET /v1/agents` / `POST /v1/agents` — agent registry
- `GET /v1/model-orchestrator/models` — bridge to model-orchestrator
- `POST /v1/model-orchestrator/chat` — bridge to model-orchestrator scheduler
- `GET /v1/skills` / `POST /v1/skills/:skillId/execute` — bridge to toolkit
- `GET /dashboard` — web dashboard (dark theme, auto-refresh)

### Bridge Pattern
Gateway bridges to other packages without direct coupling:
- model-orchestrator: `/v1/model-orchestrator/*` routes use `@agentmesh/model-orchestrator` 
- toolkit: `/v1/skills` routes use `@agentmesh/toolkit SkillLoader/SkillController`
- engine: Pipeline routes use Orchestrator from `@agentmesh/engine`
## Engine Layer

The Engine (`packages/engine/`) is Honeycomb Orchestrator providing:
- Orchestrator + PhaseStateMachine for multi-phase agent workflows
- DSL Compiler for domain-specific workflow definitions
- AgentRunner for parallel agent execution
- MessageBus for inter-agent communication
- MetricsCollector for performance metrics (exported to MCP)
- Domain plugin system: visual-production, document-processing, data-science

## Toolkit Layer

The Toolkit (`packages/toolkit/`) is the shared capability SDK:
- AlgorithmEngine (7-phase) + PatternLoader + 16 Agent Design Patterns
- SkillLoader/Router/Executor — skill lifecycle management
- MemoryStore — persistent agent memory
- ToolRegistry — shared tool registration
- LLM multi-Provider (OpenAI/Anthropic/Ollama)
- Middleware pipeline + Observability
- VectorStore (MemoryVectorStore / ChromaVectorStore / QdrantVectorStore)
- KnowledgeGraph + DataSources + HybridRetriever

## MCP Server

The MCP Server (`apps/server/src/mcp/`) provides 11 tools:
- `models_list/chat/health` — model orchestration
- `tasks_submit/status/list` — task management
- `skills_list/search/execute` — skill management
- `system_health/metrics` — system monitoring
## Data Flow

### Chat Completions Flow
```
1. Client → POST /v1/chat/completions { model, messages }
2. Gateway: model-orchestrator scheduler (primary path)
   a. Circuit breaker check
   b. withRetry() exponential backoff
   c. Strategy-based model selection
3. Fallback: old resolveProvider() if scheduler returns no match
4. Provider Client: POST to provider API with streaming
5. Response: SSE stream or JSON → Client
```

### Model Discovery Flow
```
1. Startup: LocalModelDiscoverer.discoverAll()
2. Probe Ollama API → http://localhost:11434/api/tags
3. Probe LM Studio API → http://localhost:1234/v1/models
4. Scan llama.cpp ports → 8080/8081/8082/8000
5. Cloud providers loaded from models.yaml (API keys)
6. All results merged, deduplicated → ModelRegistry
```

### Codex Desktop Flow
```
1. Codex Desktop → POST /v1/responses { input, model }
2. Adapter: convert input items → messages array
3. Model-orchestrator scheduler or fallback router
4. Provider Client: POST /v1/chat/completions
5. Adapter: convert response → responses format
6. Response → Codex Desktop
```

## Technology Stack

- **Runtime**: Bun (>=1.0.0) / Node.js (>=18.0.0)
- **Server**: Fastify 5 with Fastify WebSocket
- **HTTP Client**: Native Fetch API
- **Streaming**: Server-Sent Events (SSE)
- **Config**: YAML (gateway.yaml + models.yaml)
- **Vector Store**: ChromaDB / Qdrant / Memory (optional)
- **MCP**: @modelcontextprotocol/sdk
- **Logging**: Custom structured logger + Pino

## Package Dependencies

```
apps/cli → apps/server → packages/gateway → packages/engine → packages/toolkit
                 ↘              ↙              ↙
            packages/model-orchestrator
                 ↕
           packages/core-types (zero dependency)
```

Strictly one-directional. toolkit is the pure bottom layer.
