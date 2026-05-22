# API Reference

Base URL: `http://127.0.0.1:3000`

## Health & Status

### `GET /health`
Health check with agent status overview.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1778935574177,
  "agents": [
    {"id": "claude-code", "name": "Claude Code", "status": "online"}
  ]
}
```

### `GET /v1/health/detailed`
Detailed health check with circuit breaker, vector store, config info.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1778935574177,
  "circuit_breakers": { "deepseek": "CLOSED", "ollama": "CLOSED" },
  "vector_store": { "type": "memory", "count": 12 },
  "config": { "models_providers_count": 4 }
}
```

### `GET /model-gateway/health`
Model gateway health with provider availability and quota summary.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1778935574177,
  "providers_available": [
    {"name": "deepseek", "summary": "Balance: ¥561.18"}
  ],
  "providers_unavailable": [
    {"name": "codex", "summary": "Credits: 0"}
  ]
}
```

### `GET /model-gateway/quota`
Real-time quota data from codexbar. Cached for 60 seconds.

**Response:**
```json
{
  "codex": {
    "provider": "codex",
    "available": false,
    "usedPercent": 98,
    "summary": "Credits: 0, Secondary: 98%"
  },
  "deepseek": {
    "provider": "deepseek",
    "available": true,
    "balance": 561.18,
    "summary": "Balance: ¥561.18"
  },
  "ollama": {
    "provider": "ollama",
    "available": true,
    "summary": "Local - always available"
  }
}
```

## Model Gateway

### `GET /v1/models`
List available models. Primary source: model-orchestrator dynamic discovery (6 providers). Falls back to static config when discovery returns 0 results.

**Response:**
```json
{
  "object": "list",
  "data": [
    {"id": "deepseek-chat", "object": "model", "owned_by": "deepseek"},
    {"id": "deepseek-v4-pro", "object": "model", "owned_by": "deepseek"},
    {"id": "gpt-5.1", "object": "model", "owned_by": "openai"},
    {"id": "o4-mini", "object": "model", "owned_by": "openai"},
    {"id": "qwen3:14b", "object": "model", "owned_by": "ollama"}
  ]
}
```

### `POST /v1/chat/completions`
Standard OpenAI-compatible chat completions. Primary path uses **model-orchestrator scheduler** (circuit breaker + retry + strategy-based selection). Falls back to old resolveProvider() if scheduler returns no match. Supports streaming (SSE).

**Request:**
```json
{
  "model": "deepseek-chat",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 1024,
  "tools": []
}
```

**Response (non-streaming):**
```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "model": "deepseek-chat",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 10,
    "total_tokens": 30
  }
}
```

### `POST /v1/chat/completions` (Streaming)
Returns `text/event-stream` with SSE chunks. Internally uses `sessStart + chunkIndex` for chunk IDs instead of per-chunk `Date.now()`.

### `POST /v1/responses`
Codex Desktop Responses API adapter. Converts between Responses API and Chat Completions.

**Request:**
```json
{
  "model": "deepseek-v4-pro",
  "input": [
    {"role": "user", "content": "Write a sorting function"}
  ],
  "instructions": "Be concise.",
  "stream": false,
  "tools": []
}
```

**Response:**
```json
{
  "id": "resp_xxx",
  "object": "response",
  "model": "deepseek-v4-pro",
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "Here is a sorting function..."
        }
      ]
    }
  ],
  "usage": { "input_tokens": 30, "output_tokens": 150, "total_tokens": 180 }
}
```

## Model Orchestrator Bridge

### `GET /v1/model-orchestrator/models`
List all models via model-orchestrator's dynamic discovery.

**Response:**
```json
{
  "total": 8,
  "models": [
    {"id": "deepseek-chat", "provider": "deepseek", "location": "cloud"},
    {"id": "qwen3:14b", "provider": "ollama", "location": "local"}
  ]
}
```

### `POST /v1/model-orchestrator/chat`
Chat through model-orchestrator's scheduler (circuit breaker + retry + strategy routing).

**Request:**
```json
{
  "model": "deepseek-chat",
  "messages": [{"role": "user", "content": "Hello!"}],
  "temperature": 0.7
}
```

**Response:**
```json
{
  "model": "deepseek-chat",
  "content": "Hello! How can I help you today?"
}
```

### `GET /v1/model-orchestrator/chat/stream`
SSE streaming through model-orchestrator. Uses AbortController for cleanup.

## Skills

### `GET /v1/skills`
List available skills from toolkit SkillLoader.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Filter by category |

**Response:**
```json
{
  "total": 16,
  "skills": [
    {"id": "code-review", "name": "Code Review", "category": "development"}
  ]
}
```

### `POST /v1/skills/:skillId/execute`
Execute a skill via SkillController.

**Request:**
```json
{
  "input": { "task": "Review this code", "files": ["src/index.ts"] }
}
```

**Response:**
```json
{
  "skillId": "code-review",
  "result": { "status": "completed", "findings": [] }
}
```

### `POST /v1/chat/completions` (Skill Router)
Chat completions endpoint can trigger skill-based routing for specific patterns.

## Agent Management

### `GET /v1/agents`
List all registered agents.

**Response:**
```json
[
  {
    "id": "claude-code",
    "name": "Claude Code",
    "type": "claude-code",
    "capabilities": ["code-generation", "code-review"],
    "status": "online",
    "lastSeen": 1778935574177
  }
]
```

### `POST /v1/agents`
Register a new agent.

**Request:**
```json
{
  "id": "my-agent",
  "name": "My Custom Agent",
  "type": "process",
  "capabilities": ["code-generation"],
  "endpoint": "http://127.0.0.1:8080"
}
```

### `POST /v1/tasks`
Submit a task for agent execution.

**Request:**
```json
{
  "type": "request",
  "source": "api",
  "target": "gateway",
  "payload": {
    "task": "Help me write a sorting algorithm",
    "options": { "stream": false, "timeout": 300 }
  }
}
```

### `GET /v1/tasks`
List all tasks.

### `GET /v1/tasks/:taskId`
Task status and result.

**Response:**
```json
{
  "id": "task-xxx",
  "status": "completed",
  "assigned_agents": ["claude-code"],
  "result": "...",
  "created_at": 1778935574177,
  "updated_at": 1778935580000
}
```

### `POST /v1/tasks/:taskId/cancel`
Cancel a running task.

## Spaces

### `POST /v1/spaces`
Create a shared context space.

**Request:**
```json
{
  "metadata": { "name": "Project A", "createdBy": "cli" }
}
```

**Response:** `{ "space_id": "space-xxx" }`

### `GET /v1/spaces/:spaceId`
Shared space details.

## Scheduler

### `POST /v1/scheduler`
Create a cron-based scheduled task.

**Request:**
```json
{
  "cron": "0 9 * * *",
  "task": { "type": "request", "payload": { "task": "Daily report" } }
}
```

### `GET /v1/scheduler`
List all scheduled tasks.

### `DELETE /v1/scheduler/:id`
Delete a scheduled task.

## Pipeline

### `POST /v1/pipeline`
Multi-agent sequential pipeline with domain template support.

**Request:**
```json
{
  "domain": "visual-production",
  "phases": ["research", "decision", "execution"],
  "agents": ["visual-director", "storyboard-artist"]
}
```

## Dashboard

### `GET /dashboard`
Web dashboard with dark theme, auto-refresh. Real-time system status.

## Error Format

```json
{
  "error": {
    "code": "PROVIDER_ERROR",
    "message": "DeepSeek: insufficient_quota"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `TASK_FAILED` | 500 | Task processing failed |
| `TASK_NOT_FOUND` | 404 | Task ID not found |
| `SPACE_NOT_FOUND` | 404 | Space ID not found |
| Provider errors | 502 | Upstream provider error |
| No provider | 503 | All providers unavailable |
| Circuit open | 503 | Provider circuit breaker OPEN |

## Routing

The model router selects providers based on:
1. Model name pattern matching
2. **Model-Orchestrator scheduler** (primary): circuit breaker + retry + strategy-based
3. Quota availability (via codexbar)
4. API key presence
5. Fallback chain priority

See [Configuration Guide](./configuration.md) for routing rules and model config.
