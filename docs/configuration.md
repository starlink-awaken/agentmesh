# Configuration Guide

## Config File

Default location: `config/gateway.yaml`

## Full Configuration Reference

```yaml
# Server
port: 3000
wsPort: 3001
host: "0.0.0.0"
dataDir: "./data"
logDir: "./logs"
logLevel: "info"  # debug | info | warn | error

# =============================================================================
# Model Gateway
# =============================================================================
models:
  default_model: deepseek-chat

  providers:
    deepseek:
      base_url: https://api.deepseek.com/v1
      api_key_env: DEEPSEEK_API_KEY     # 从环境变量读取
      models:
        - deepseek-chat
        - deepseek-reasoner
        - deepseek-v4-pro
        - deepseek-v4-flash

    openai:
      base_url: https://api.openai.com/v1
      api_key_env: OPENAI_API_KEY
      models:
        - gpt-5.1
        - gpt-5.1-codex
        - o4-mini

    openrouter:
      base_url: https://openrouter.ai/api/v1
      api_key_env: OPENROUTER_API_KEY

    ollama:
      base_url: http://127.0.0.1:11434/v1
      api_key: ollama                    # 直接指定 key
      models:
        - qwen3:14b
        - codestral:22b

  # Provider 优先级（从高到低）
  fallback_chain:
    - deepseek
    - openrouter
    - ollama

  # 模型名匹配规则
  model_routing:
    "deepseek":        # 匹配包含 "deepseek" 的模型名
      - deepseek
    "gpt-":            # GPT 系列优先 openai，配额不够用 deepseek
      - openai
      - deepseek
    "o1":              # 推理模型
      - openai
      - deepseek
    "claude":          # Claude 通过 OpenRouter
      - openrouter

# =============================================================================
# Agent Configuration
# =============================================================================
routing:
  defaultAgent: "claude-code"
  rules:
    - name: code-generation
      keywords: [write code, generate code, 写代码, 生成代码]
      agent: claude-code
      priority: 10

    - name: code-review
      keywords: [review, code review, 代码审查]
      agent: claude-code
      priority: 15

    - name: browser-automation
      keywords: [browser, scrape, 浏览器, 爬虫]
      agent: openclaw
      priority: 15

    - name: multi-agent
      keywords: [collaborate, team, 协作]
      strategy: broadcast
      agents: [claude-code, openclaw]
      priority: 20

agents:
  - id: claude-code
    name: Claude Code
    type: claude-code
    capabilities: [code-generation, code-review, debugging, refactoring]

  - id: openclaw
    name: OpenClaw
    type: openclaw
    capabilities: [browser-automation, web-scraping, ui-testing]
```

## API Key Configuration

API Keys can be set in three ways:

### 1. `.env` file (recommended)
```
DEEPSEEK_API_KEY=sk-xxx
OPENAI_API_KEY=sk-xxx
OPENROUTER_API_KEY=sk-xxx
```

### 2. Environment variables
```bash
export DEEPSEEK_API_KEY=sk-xxx
```

### 3. Inline in config (ollama only)
```yaml
providers:
  ollama:
    api_key: ollama  # local, no real key needed
```

### Key Resolution Order
1. Inline `api_key` in config
2. Environment variable via `api_key_env`
3. Not found → provider skipped

## Provider Configuration

### Adding a new provider

```yaml
models:
  providers:
    my-provider:
      base_url: https://api.my-provider.com/v1
      api_key_env: MY_PROVIDER_API_KEY
      models: [my-model-v1, my-model-v2]

  fallback_chain:
    - deepseek
    - my-provider     # add to chain
    - ollama

  model_routing:
    "my-model":       # route by model name
      - my-provider
```

### Provider Requirements
- Must implement OpenAI-compatible `/v1/chat/completions` endpoint
- Must support Bearer token authentication
- Optional: supports SSE streaming

## Adding a new Agent

```yaml
agents:
  - id: my-agent
    name: My Custom Agent
    type: process
    command: my-agent-cli
    args: ["--interactive"]
    capabilities:
      - my-capability-1
      - my-capability-2
```

## Logging

Logs are written to `logs/agentmesh-YYYY-MM-DD.log`.

Log levels:
- `debug` — verbose provider calls, routing decisions
- `info` — startup, quota refresh, provider selection
- `warn` — fallback triggered, quota probe failures
- `error` — provider errors, crashes
