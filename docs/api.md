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
List available models across all configured providers.

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
Standard OpenAI-compatible chat completions. Supports streaming (SSE).

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

**Streaming:** Returns `text/event-stream` with SSE chunks.

### `POST /v1/responses`
Codex Desktop Responses API adapter. Converts between Responses API and Chat Completions.

**Request:**
```json
{
  "model": "deepseek-v4-pro",
  "input": [
    {"role": "system", "content": "You are a coding assistant."},
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
          "text": "Here is a sorting function...\n\n```python\ndef sort(arr):...\n```"
        }
      ]
    }
  ],
  "usage": {
    "input_tokens": 30,
    "output_tokens": 150,
    "total_tokens": 180
  }
}
```

**Input Mapping:**
- `input[].role` → `messages[].role`
- `input[].content` (text/list) → `messages[].content` (string)
- `input[].type: "message"` → message entry
- `instructions` → prepended system message

**Output Mapping:**
- Chat `choices[0].message.content` → Responses `output[].content[].text`
- Chat `choices[0].message.tool_calls` → Responses `output[].type: "function_call"`

## Agent Management

### `GET /agents`
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

### `POST /agents`
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

### `POST /tasks`
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

### `GET /tasks`
List all tasks.

### `GET /tasks/:taskId`
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

## Spaces

### `POST /spaces`
Create a shared context space.

**Request:**
```json
{
  "metadata": { "name": "Project A", "createdBy": "cli" }
}
```

**Response:** `{ "space_id": "space-xxx" }`

### `GET /spaces/:spaceId`
Shared space details.

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

## Routing

The model router selects providers based on:
1. Model name pattern matching
2. Quota availability (via codexbar)
3. API key presence
4. Fallback chain priority

See [Configuration Guide](./configuration.md) for routing rules.
