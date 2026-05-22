# Changelog

## [2.0.0] — 2026-05-22

### Added (新功能)
- **Monorepo Skeleton**: 7-package monorepo (`@agentmesh/gateway`, `@agentmesh/engine`, `@agentmesh/toolkit`, `@agentmesh/core-types`, `@agentmesh/model-orchestrator`, `@agentmesh/cli`, `@agentmesh/server`), 113,561 lines of source, 144 test files
- **core-types**: 17 unified cross-package TypeScript interfaces (Agent, Task, Model, Event, Space, Provider)
- **Model Orchestrator**: 6-Provider aggregation discovery + dynamic scheduler with fallback chains
- **MCP Server**: 11 MCP tools (tasks, skills, models, system metrics) with stdio mode
- **Multi-process Launcher**: Unified `apps/server/src/launcher.ts` orchestrating all services
- **Engine Integration**: Honeycomb Engine embedded as `@agentmesh/engine` for collaborative agent execution
- **Toolkit Bridge**: Agent Toolkit as `@agentmesh/toolkit` — deduplicated event-bus, retry, skill loading

### Changed (变更)
- **Monorepo Restructure**: Three previously independent projects (AgentMesh Gateway, Honeycomb Engine, Agent Toolkit) merged into a single monorepo at `packages/` and `apps/`
- **Phase 4 Dedup**: event-bus and retry logic bridged to use toolkit imports instead of local copies
- **Provider architecture**: Extracted `base.ts` shared utilities across all providers for parallelization and consistency
- **Build Order**: `build:order` script ensures core-types → toolkit → model-orchestrator → gateway dependency chain

### Fixed (修复)
- Cross-project import resolution via workspace protocol (`"workspace:*"`)
- Duplicate provider logic centralized into base class pattern

### Added
- **GatewayContainer**: Unified DI lifecycle manager wrapping all core singletons (`init → reload → dispose`)
- **Task Persistence**: bun:sqlite backend, WAL mode, tasks survive restarts
- **Task Cancellation**: `POST /v1/tasks/:id/cancel` + `agentmesh cancel <id>`
- **Agent Hot Reload**: edit `config/gateway.yaml`, agents auto-reload within 3s
- **Web Dashboard**: `GET /dashboard` — real-time status with Dark theme, auto-refresh
- **Scheduled Tasks**: cron-based scheduler via `POST /v1/scheduler` + cron-parser
- **Agent Pipeline**: multi-agent sequential execution via `POST /v1/pipeline`
- **Graceful Shutdown**: SIGTERM/SIGINT → dispose + fastify.close
- **Detailed Health**: `GET /v1/health/detailed` with circuit breakers, config, uptime
- **CLI Table Output**: Unicode box-drawing + ANSI colors for agents/tasks/models/health

### Changed
- **API Versioning**: All routes unified under `/v1/` prefix (model-gateway management included)
- **Routes renamed**: `websocket.ts` → `sse.ts` (was always SSE, never WebSocket)
- **Type cleanup**: Duplicate `GatewayConfig`/`RoutingRule` removed from types/index.ts
- **Agent configs**: 25+ hardcoded defaults extracted to `src/core/agents.default.ts`
- **Config injection**: `(config as any).models` replaced with typed `ModelsSection` + YAML→TS mapping
- **Logger unified**: Pino bridge via `initLogger({ pino: fastify.log })`
- **Error handling**: Global `setErrorHandler` + consistent `{error: {code, message}}` format
- **Rate limiter**: Now configurable from YAML `models.defaults.rate_limit`
- **Storage paths**: Derived from `config.dataDir` instead of hardcoded `./data/`
- **cron-parser**: Replaces hand-rolled 40-line cron implementation

### Fixed
- `purgeCompleted` count overwrite bug when store is present
- `startConfigWatcher` file watcher leak on dispose
- `reloadAgents` unconditional re-registration of unchanged agents
- `TaskManager` removes stale JSDoc cruft, uses single `_save()` path

## [1.2.0] — 2026-05-16

### Added
- **Tests**: 9 test files, 61 tests, 0 failures
- **CI/CD**: GitHub Actions (typecheck + test + build)
- **Circuit Breaker**: Three-state (CLOSED/OPEN/HALF_OPEN) with configurable thresholds
- **Retry Logic**: Exponential backoff with jitter, configurable status codes
- **Rate Limiting**: Token Bucket per-endpoint, per-IP
- **`connect` command**: Interactive tool detection and one-click AI tool configuration
  - Auto-detects: Codex Desktop, Claude Code, Cursor, Shell env
  - `connect list` — list detected tools
  - `connect all` — batch configure with backup
  - `connect` — interactive selection (no typing)
  - `disconnect all` — restore from backup
- **Provider Health Check**: `GET /model-gateway/health/:provider` and `/health/all`
- **Quota Pre-warming**: Async background codexbar fetch at startup
- **Logger Unification**: Delegate to Pino when available, file persistence always

### Changed
- Router now skips circuits in OPEN state during fallback
- Providers wrapped with retry + circuit breaker recording
- Config extended with `defaults:` section (circuit_breaker, retry)
- Logger can accept Pino instance from Fastify

## [1.1.0] — 2026-05-16

### Added
- **Model Gateway Layer**: Unified OpenAI-compatible endpoint with multi-provider routing
  - `/v1/chat/completions` — standard chat completions proxy
  - `/v1/responses` — Codex Desktop Responses API adapter
  - `/v1/models` — model listing
- **Quota-Aware Routing**: Integration with codexbar for real-time provider quota sensing
  - Automatic fallback chain: DeepSeek → OpenRouter → Ollama
  - Per-model routing rules
  - 60-second quota cache with automatic refresh
- **CLI Rewrite**: Full command-line interface
  - `start` — start the gateway server
  - `setup` — interactive setup wizard
  - `health` — health check
  - `models` — list available models
  - `quota` — show provider quota status
  - `config show/path/edit` — config management
  - `doctor` — system diagnostics
  - `help [command]` — detailed help
- **New Providers**: DeepSeek, OpenAI, OpenRouter, Ollama
- **Structured Logging**: Leveled logging (debug/info/warn/error) with file persistence
- **Docker Support**: Multi-stage Dockerfile + docker-compose.yml
- **Documentation**: Architecture docs, API reference, configuration guide, CHANGELOG

### Changed
- Server startup banner redesigned with model gateway endpoints
- Config format extended with `models:` section
- CLI binary now supports subcommands

## [1.0.3] — 2026-05-14

### Added
- Initial public release
- Agent orchestration: 25+ agent adapters
- Task management with REST API + WebSocket
- Context sharing with shared spaces
- YAML-based routing rules
