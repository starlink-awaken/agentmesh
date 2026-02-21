# Agent Gateway API 文档

## 概述

Agent Gateway 是一个多 Agent 调度网关，提供 REST API 用于任务提交、Agent 管理和共享空间操作。

**基础 URL**: `http://localhost:3000`

---

## 认证

当前版本无需认证。生产环境建议添加 API Key 或 JWT 认证。

---

## 端点概览

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/tasks` | 提交任务 |
| GET | `/tasks` | 获取所有任务 |
| GET | `/tasks/:taskId` | 获取任务状态 |
| POST | `/spaces` | 创建共享空间 |
| GET | `/spaces/:spaceId` | 获取共享空间 |
| GET | `/agents` | 获取 Agent 列表 |
| POST | `/agents` | 注册 Agent |
| GET | `/events` | Server-Sent Events 流 |
| GET | `/ws-info` | WebSocket 信息 |
| POST | `/broadcast` | 广播事件 |

---

## 端点详情

### 1. 健康检查

检查网关状态和所有 Agent 的在线情况。

**请求**
```http
GET /health
```

**响应**
```json
{
  "status": "ok",
  "timestamp": 1708531200000,
  "agents": [
    {
      "id": "claude-code",
      "name": "Claude Code",
      "status": "online"
    }
  ]
}
```

---

### 2. 提交任务

向网关提交任务，自动路由到合适的 Agent 或指定的 Agent。

**请求**
```http
POST /tasks
Content-Type: application/json
```

**请求体**
```json
{
  "source": "api",
  "target": "gateway",
  "correlation_id": "uuid-可选",
  "payload": {
    "task": "帮我写一个排序算法",
    "options": {
      "timeout": 300,
      "stream": false
    }
  }
}
```

**完整请求体 (AgentMessage)**
```json
{
  "id": "uuid-可选-会自动生成",
  "type": "request",
  "source": "api",
  "target": "gateway",
  "correlation_id": "uuid-可选",
  "timestamp": 1708531200000,
  "payload": {
    "task": "任务描述",
    "context": {
      "shared_space_id": "空间ID-可选"
    },
    "files": ["文件路径-可选"],
    "options": {
      "stream": false,
      "timeout": 300
    }
  }
}
```

**响应** (202 Accepted)
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Task submitted successfully"
}
```

**错误响应** (500)
```json
{
  "error": {
    "code": "TASK_FAILED",
    "message": "具体错误信息"
  }
}
```

---

### 3. 获取所有任务

列出所有任务。

**请求**
```http
GET /tasks
```

**响应**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "assigned_agents": ["claude-code"],
    "created_at": 1708531200000
  }
]
```

---

### 4. 获取任务状态

查询特定任务的详细状态和结果。

**请求**
```http
GET /tasks/:taskId
```

**路径参数**
| 参数 | 类型 | 描述 |
|------|------|------|
| taskId | string | 任务 ID |

**响应**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "assigned_agents": ["claude-code"],
  "result": "任务执行结果",
  "error": null,
  "created_at": 1708531200000,
  "updated_at": 1708531200100
}
```

**错误响应** (404)
```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task xxx not found"
  }
}
```

---

### 5. 创建共享空间

创建一个用于多 Agent 协作的共享上下文空间。

**请求**
```http
POST /spaces
Content-Type: application/json
```

**请求体**
```json
{
  "metadata": {
    "name": "项目A开发",
    "description": "多人协作项目"
  }
}
```

**响应** (201 Created)
```json
{
  "space_id": "space-550e8400-e29b-41d4-a716-446655440000"
}
```

---

### 6. 获取共享空间

获取共享空间的元数据。

**请求**
```http
GET /spaces/:spaceId
```

**路径参数**
| 参数 | 类型 | 描述 |
|------|------|------|
| spaceId | string | 空间 ID |

**响应**
```json
{
  "shared_space_id": "space-550e8400-e29b-41d4-a716-446655440000",
  "message_count": 5,
  "artifact_count": 3,
  "metadata": {
    "name": "项目A开发"
  },
  "created_at": 1708531200000,
  "updated_at": 1708531200500
}
```

**错误响应** (404)
```json
{
  "error": {
    "code": "SPACE_NOT_FOUND",
    "message": "Shared space xxx not found"
  }
}
```

---

### 7. 获取 Agent 列表

列出所有已注册的 Agent。

**请求**
```http
GET /agents
```

**响应**
```json
[
  {
    "id": "claude-code",
    "name": "Claude Code",
    "type": "claude-code",
    "capabilities": [
      "code-generation",
      "code-review",
      "debugging",
      "refactoring",
      "documentation",
      "file-operations"
    ],
    "status": "online",
    "lastSeen": 1708531200000
  }
]
```

---

### 8. 注册 Agent

动态注册一个新的 Agent。

**请求**
```http
POST /agents
Content-Type: application/json
```

**请求体**
```json
{
  "id": "my-agent",
  "name": "My Custom Agent",
  "type": "http",
  "capabilities": ["code-generation", "text-generation"],
  "endpoint": "http://localhost:8080"
}
```

**响应** (201 Created)
```json
{
  "id": "my-agent",
  "status": "registered"
}
```

---

### 9. Server-Sent Events (SSE)

订阅实时任务事件和 Agent 状态更新。

**请求**
```http
GET /events?taskId=xxx&spaceId=xxx
```

**查询参数**
| 参数 | 类型 | 描述 |
|------|------|------|
| taskId | string | 可选 - 订阅特定任务的事件 |
| spaceId | string | 可选 - 订阅特定空间的事件 |

**响应**
```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**事件格式**
```json
data: {"type": "connected", "client_id": "xxx"}

data: {"type": "task_status", "task": {...}}

data: {"type": "welcome", "agents": [...]}

data: {"type": "heartbeat", "timestamp": 1708531200000}

data: {"type": "task.submitted", "task_id": "xxx", "timestamp": 1708531200000}

data: {"type": "task.completed", "task_id": "xxx", "result": "xxx", "timestamp": 1708531200000}
```

---

### 10. 广播事件

向所有连接的客户端广播事件。

**请求**
```http
POST /broadcast
Content-Type: application/json
```

**请求体**
```json
{
  "type": "custom_event",
  "data": {
    "message": "Hello all"
  }
}
```

**响应**
```json
{
  "delivered": true,
  "client_count": 5
}
```

---

## 数据类型

### AgentMessage

```typescript
interface AgentMessage {
  // 基础字段
  id: string;
  type: 'request' | 'response' | 'event' | 'stream' | 'stream_end';
  source: string;
  target: string;
  correlation_id: string;
  timestamp: number;

  // 请求内容
  payload?: {
    task?: string;
    context?: {
      shared_space_id: string;
      history?: string[];
      artifacts?: string[];
    };
    files?: string[];
    options?: {
      stream?: boolean;
      timeout?: number;
    };
  };

  // 事件驱动
  event_type?: string;
  event_data?: Record<string, unknown>;

  // 响应
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}
```

### Task

```typescript
interface Task {
  id: string;
  status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed';
  message: AgentMessage;
  assignedAgents: string[];
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
  createdAt: number;
  updatedAt: number;
}
```

### Agent

```typescript
interface Agent {
  id: string;
  name: string;
  type: string;
  capabilities: string[];
  status: 'online' | 'offline' | 'busy';
  endpoint?: string;
  lastSeen: number;
}
```

---

## 错误码

| 错误码 | HTTP 状态码 | 描述 |
|--------|-------------|------|
| TASK_NOT_FOUND | 404 | 任务不存在 |
| TASK_FAILED | 500 | 任务执行失败 |
| SPACE_NOT_FOUND | 404 | 共享空间不存在 |
| AGENT_NOT_FOUND | 404 | Agent 不存在 |
| INVALID_REQUEST | 400 | 请求参数无效 |

---

## 示例

### cURL

```bash
# 健康检查
curl http://localhost:3000/health

# 提交任务
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"payload": {"task": "帮我写一个排序算法"}}'

# 查询任务状态
curl http://localhost:3000/tasks/{task_id}

# 获取 Agent 列表
curl http://localhost:3000/agents

# 创建共享空间
curl -X POST http://localhost:3000/spaces \
  -H "Content-Type: application/json" \
  -d '{"metadata": {"name": "项目A"}}'
```

### JavaScript

```javascript
const baseUrl = 'http://localhost:3000';

// 提交任务
async function submitTask(task) {
  const response = await fetch(`${baseUrl}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: { task } })
  });
  return response.json();
}

// 订阅任务事件
function subscribeTask(taskId) {
  const eventSource = new EventSource(`${baseUrl}/events?taskId=${taskId}`);
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Event:', data);
  };
  return eventSource;
}
```

---

## CLI 命令

安装 CLI 后可使用以下命令：

```bash
# 列出所有 Agent
agent-gateway agents

# 提交通用任务（自动路由）
agent-gateway task 帮我写一个排序算法

# 提交任务到指定 Agent
agent-gateway to claude-code 帮我review这段代码

# 创建共享空间
agent-gateway space create-space

# 列出所有任务
agent-gateway tasks

# 检查 Gateway 状态
agent-gateway health
```

---

## 许可

MIT License
