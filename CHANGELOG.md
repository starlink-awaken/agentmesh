# Changelog

All notable changes to this project will be documented in this file.

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
