# Agent Gateway 设计方案

## 1. 背景与目标

构建一个 **Agent 统一调度网关**，实现：
- 多 Agent 双向调度（Claude Code ↔ OpenClaw ↔ 其他 Agent）
- 任务智能路由（根据任务类型选择合适的 Agent）
- 多 Agent 协作（同一任务调度多个 Agent）
- 上下文共享（文件级共享空间）

## 2. 需求总结

| 需求 | 描述 |
|------|------|
| 双向调度 | OpenClaw → 其他 Agent，其他 Agent → OpenClaw |
| 多 Agent 协作 | 同一任务调度多个 Agent，共享上下文 |
| 智能路由 | 根据任务类型自动选择合适的 Agent |
| 上下文共享 | 运行时内存 + 文件持久化 + 向量 DB 长期存储 |
| 通信协议 | 自定义消息格式 + 流式响应 + 事件驱动 |
| 架构模式 | 混合模式：集中式入口 + 事件驱动 Mesh |

## 3. 架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Gateway                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  Task API   │  │  Event Bus  │  │  Discovery  │       │
│  │  (REST/WS)  │  │  (Pub/Sub)  │  │   Service   │       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│         │                 │                 │               │
│  ┌──────┴────────────────┴─────────────────┴──────┐      │
│  │              Context Manager                     │      │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐       │      │
│  │  │  Memory  │  │  Files   │  │ VectorDB │       │      │
│  │  │  Cache   │  │  Persist │  │ Storage  │       │      │
│  │  └─────────┘  └─────────┘  └─────────┘       │      │
│  └──────────────────────┬──────────────────────────┘      │
└─────────────────────────┼──────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   ┌─────────┐       ┌─────────┐       ┌─────────┐
   │ Claude  │       │  Open   │       │  Other  │
   │  Code   │◄────►│  Claw   │◄────►│  Agents │
   └─────────┘       └─────────┘       └─────────┘
```

### 3.2 核心组件

| 组件 | 职责 |
|------|------|
| **Task API** | 接收任务请求，支持 REST + WebSocket |
| **Event Bus** | 事件驱动通信，Pub/Sub 模式 |
| **Discovery Service** | Agent 注册、服务发现、健康检查 |
| **Context Manager** | 三层存储：内存 → 文件 → 向量 DB |
| **Router** | 任务类型 → Agent 路由策略 |
| **Agent Adapter** | 适配不同 Agent 的调用协议 |

## 4. 通信协议

### 4.1 消息格式

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
  payload: {
    task?: string;
    context?: ContextRef;
    files?: string[];
    options?: {
      stream?: boolean;
      timeout?: number;
    };
  };

  // 事件驱动
  event_type?: 'task_started' | 'task_progress' | 'task_completed' | 'task_failed';
  event_data?: Record<string, unknown>;

  // 响应
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

interface ContextRef {
  shared_space_id: string;
  history?: string[];  // 历史消息 ID
  artifacts?: string[]; // 共享文件路径
}
```

### 4.2 事件类型

| 事件 | 描述 |
|------|------|
| `agent.registered` | Agent 注册 |
| `agent.unregistered` | Agent 注销 |
| `task.submitted` | 任务提交 |
| `task.assigned` | 任务分配 |
| `task.started` | 任务开始 |
| `task.progress` | 任务进度（流式） |
| `task.completed` | 任务完成 |
| `task.failed` | 任务失败 |
| `context.updated` | 上下文更新 |

## 5. 存储设计

### 5.1 三层存储

| 层级 | 存储 | 用途 | 时机 |
|------|------|------|------|
| L1 | 内存 (Map) | 运行时上下文 | 任务执行中 |
| L2 | 文件系统 | 任务产物持久化 | 任务完成后 |
| L3 | 向量 DB | 历史经验检索 | 长期积累 |

### 5.2 目录结构

```
/agent-gateway/
├── data/
│   ├── tasks/
│   │   └── {task_id}/
│   │       ├── context.json
│   │       ├── messages/
│   │       └── artifacts/
│   └── vector-db/
│       └── (chromadb / qdrant data)
├── logs/
└── config/
    ├── agents.yaml      # Agent 配置
    ├── routing.yaml     # 路由规则
    └── protocol.yaml    # 协议配置
```

## 6. 路由策略

### 6.1 任务类型匹配

```yaml
routing:
  rules:
    - name: code-review
      keywords: [review, code review, pr review]
      agent: claude-code
      priority: 10

    - name: browser-automation
      keywords: [browser, scrape, click]
      agent: playwright-agent
      priority: 10

    - name: shell-command
      keywords: [run, execute, bash, terminal]
      agent: shell-agent
      priority: 10

    - name: multi-agent
      keywords: [collaborate, team, together]
      strategy: broadcast  # 广播到多个 Agent
      agents: [claude-code, openclaw]
```

### 6.2 负载均衡

- 轮询调度
- 最少任务优先
- 能力匹配优先

## 7. Agent 适配器

每个 Agent 需要实现适配器接口：

```typescript
interface AgentAdapter {
  // 唯一标识
  id: string;
  name: string;
  capabilities: string[];

  // 调用接口
  invoke(request: AgentMessage): Promise<AgentMessage>;
  invokeStream(request: AgentMessage): AsyncIterable<AgentMessage>;

  // 健康检查
  health(): Promise<boolean>;

  // 能力检测
  capabilities(): Promise<string[]>;
}
```

### 7.1 内置适配器

| 适配器 | 描述 |
|--------|------|
| ClaudeCodeAdapter | 调用 Claude Code CLI |
| OpenClawAdapter | 调用 OpenClaw |
| ProcessAdapter | 调用本地进程/CLI |
| HTTPAdapter | 调用 HTTP API |

## 8. 实现计划

### Phase 1: 核心骨架 (MVP)
- [ ] 项目初始化 (TypeScript + Node.js)
- [ ] 基础 API 服务 (Express/Fastify)
- [ ] 事件总线实现 (EventEmitter / PubSub)
- [ ] 简单的任务调度

### Phase 2: 上下文管理
- [ ] Context Manager 实现
- [ ] 文件系统存储
- [ ] 向量 DB 集成 (ChromaDB)

### Phase 3: Agent 集成
- [ ] Agent 注册与发现
- [ ] Claude Code 适配器
- [ ] OpenClaw 适配器
- [ ] 路由策略实现

### Phase 4: 高级特性
- [ ] WebSocket 流式支持
- [ ] 多 Agent 协作
- [ ] 监控与日志
- [ ] 配置管理

## 9. 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 运行时 | Bun | 快速启动 |
| Web 框架 | Fastify | 高性能 |
| 消息总线 | EventEmitter3 / Redis PubSub | 解耦 |
| 向量 DB | ChromaDB | 轻量易用 |
| 存储 | SQLite + 文件 | 简单可靠 |
| CLI 调用 | execa | 跨平台 |

## 10. 验证方案

### 10.1 单元测试
- 路由匹配测试
- 消息协议测试
- 上下文管理测试

### 10.2 集成测试
- Agent 注册与调用
- 多 Agent 协作
- 上下文共享

### 10.3 E2E 测试
- 完整任务流程
- 故障恢复
- 性能基准

---

*Created: 2026-02-21*
*Status: DRAFT - 等待用户批准*
