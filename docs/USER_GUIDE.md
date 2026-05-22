# Agent Mesh v2.0 用户指南

## 1. 项目概览

Agent Mesh 是一个本地优先的多模型网关 + 模型编排系统，支持：

- 自动发现本地模型（Ollama、LM Studio、llama.cpp）
- 连接云端模型（OpenAI、Anthropic、OpenRouter）
- 多种调度策略（cost-first / speed-first / capability-first / balanced）
- HTTP API 与 MCP 双协议接入
- Fastify 多 Agent HTTP 网关

## 2. 前置条件

- [bun](https://bun.sh) >= 1.0
- Node.js >= 18（bun 运行时内部依赖）
- 本地模型运行环境（可选）：Ollama / LM Studio / llama.cpp

## 3. 安装

```bash
# 1. 克隆仓库
git clone <仓库地址>
cd agentmesh

# 2. 安装依赖
bun install --frozen-lockfile

# 3. 按依赖顺序构建所有包
bun run build:order
```

构建顺序：`core-types → toolkit → model-orchestrator → gateway`

## 4. 配置本地模型

编辑 `config/models.yaml`，开启或关闭 Provider：

```yaml
local:
  ollama:
    enabled: true            # 启用 Ollama 自动发现
    base_url: http://localhost:11434

  lm_studio:
    enabled: true            # 启用 LM Studio
    base_url: http://localhost:1234

  llama_cpp:
    enabled: true            # 自动扫描端口 8080-8000
    # instances:             # 或手动注册
    #   - name: my-model
    #     port: 8080
```

将不需要的 Provider 设为 `enabled: false` 即可关闭。

## 5. 发现模型

启动服务前，可先查看可用的本地模型：

```bash
bun run apps/cli/src/index.ts model list
```

或启动服务后用 HTTP API 查看：

```bash
curl localhost:3000/v1/model-orchestrator/models
```

## 6. 启动服务

```bash
# 启动网关（HTTP :3000 + MCP stdio）
bun run start
```

成功后会看到类似输出：

```
[INFO] Gateway listening on :3000
[INFO] MCP server ready
[INFO] Model orchestrator initialized
```

## 7. HTTP API 调用

服务启动后，可用 curl 测试：

### 健康检查

```bash
curl localhost:3000/v1/health
```

### 查看可用模型

```bash
curl localhost:3000/v1/model-orchestrator/models
```

### 聊天补全

```bash
curl -X POST localhost:3000/v1/model-orchestrator/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3.5:4b",
    "messages": [
      {"role": "user", "content": "Hello, what is Agent Mesh?"}
    ]
  }'
```

### 查看注册的 Skills

```bash
curl localhost:3000/v1/skills
```

## 8. MCP 接入

Claude Code 等 MCP 客户端可通过 `agora mcp` 连接 Agent Mesh：

```bash
# 在 Claude Code 配置中添加 MCP 服务
# 通过 agora CLI 注册
agora mcp connect agentmesh
```

MCP 协议在 stdio 上运行，与 HTTP 网关共享同一个编排层。

## 9. 调度策略

Agent Mesh 支持四种调度策略，通过 `config/models.yaml` 的 `scheduler.default_policy` 配置：

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| `speed-first` | 优先选择延迟最低的模型 | 聊天、简单问答 |
| `cost-first` | 优先选择成本最低的模型 | 批量处理、低成本场景 |
| `capability-first` | 优先选择能力最强的模型 | 复杂推理、编码任务 |
| `balanced` | 速度/成本/能力加权评分 | 通用场景 |

权重配置：

```yaml
scheduler:
  default_policy: speed-first
  cost_weight: 0.3
  speed_weight: 0.3
  capability_weight: 0.4
```

## 10. 添加云端模型

编辑 `config/models.yaml` 的 `cloud` 节，设置对应环境变量的 API Key：

### OpenAI

```yaml
cloud:
  openai:
    enabled: true
    api_key_env: OPENAI_API_KEY    # 从环境变量读取
    base_url: https://api.openai.com/v1
```

设置环境变量：

```bash
export OPENAI_API_KEY=sk-xxxxx
```

### Anthropic

```yaml
cloud:
  anthropic:
    enabled: true
    api_key_env: ANTHROPIC_API_KEY
    base_url: https://api.anthropic.com/v1
```

### OpenRouter

```yaml
cloud:
  openrouter:
    enabled: true
    api_key_env: OPENROUTER_API_KEY
```

重启服务后生效。

## 11. 配置参考 — `config/models.yaml` 完整字段

```yaml
# ─── 本地模型 Provider ───
local:
  ollama:
    enabled: bool               # 是否启用
    base_url: string            # Ollama 服务地址

  lm_studio:
    enabled: bool
    base_url: string

  llama_cpp:
    enabled: bool
    instances:                  # 手动注册实例列表（可选）
      - name: string            # 自定义名称
        port: number            # 端口号
        model_path: string      # 模型路径

# ─── 云端模型 Provider ───
cloud:
  openai:
    enabled: bool
    api_key_env: string         # API Key 环境变量名
    base_url: string            # 可选，默认 https://api.openai.com/v1

  anthropic:
    enabled: bool
    api_key_env: string
    base_url: string

  openrouter:
    enabled: bool
    api_key_env: string

# ─── 模型元数据覆盖 ───
# 用于调度器的成本/延迟感知路由，按模型 ID 前缀匹配（最长匹配优先）
model_overrides:
  - id_prefix: string            # 模型 ID 前缀
    avg_latency_ms: number       # 平均延迟（毫秒）
    cost_per_1k_input: number    # 每千 token 输入成本（美元）
    cost_per_1k_output: number   # 每千 token 输出成本（美元）

# ─── 调度器配置 ───
scheduler:
  default_policy: string         # cost-first | speed-first | capability-first | balanced
  health_check_interval_ms: number  # 健康检查间隔（毫秒）
  cost_weight: number            # 成本权重（0-1）
  speed_weight: number           # 速度权重（0-1）
  capability_weight: number      # 能力权重（0-1）
```
