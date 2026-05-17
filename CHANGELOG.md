# Changelog

## [1.5.0] — 2026-05-17

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
