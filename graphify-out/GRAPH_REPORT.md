# Graph Report - /Volumes/Workspace/agentmesh  (2026-05-17)

## Corpus Check
- Corpus is ~22,170 words - fits in a single context window. You may not need a graph.

## Summary
- 462 nodes · 767 edges · 18 communities (13 shown, 5 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Hermes + Circuit Breaker|Hermes + Circuit Breaker]]
- [[_COMMUNITY_CLI Connect Tool Adapters|CLI Connect Tool Adapters]]
- [[_COMMUNITY_Adapter Base + Config Types|Adapter Base + Config Types]]
- [[_COMMUNITY_Package Metadata|Package Metadata]]
- [[_COMMUNITY_Model Gateway Core Concepts|Model Gateway Core Concepts]]
- [[_COMMUNITY_Agent Orchestration Concepts|Agent Orchestration Concepts]]
- [[_COMMUNITY_Configuration System|Configuration System]]
- [[_COMMUNITY_Agent Adapter Implementations|Agent Adapter Implementations]]
- [[_COMMUNITY_Provider Call + Retry Logic|Provider Call + Retry Logic]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Context Manager|Context Manager]]
- [[_COMMUNITY_Agent Registry|Agent Registry]]
- [[_COMMUNITY_Agent Router|Agent Router]]
- [[_COMMUNITY_Task Manager|Task Manager]]
- [[_COMMUNITY_Vector Store|Vector Store]]
- [[_COMMUNITY_CLI Entry Points|CLI Entry Points]]
- [[_COMMUNITY_Event Bus|Event Bus]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 21 edges
2. `main()` - 21 edges
3. `AgentMessage` - 16 edges
4. `AgentRegistry` - 15 edges
5. `Router` - 14 edges
6. `ContextManager` - 14 edges
7. `CircuitBreakerRegistry` - 14 edges
8. `TaskManager` - 12 edges
9. `VectorStore` - 11 edges
10. `dependencies` - 10 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `fastify`  [INFERRED]
  src/index.ts → package.json
- `Gateway Configuration (gateway.yaml)` --conceptually_related_to--> `GatewayConfig`  [INFERRED]
  config/gateway.yaml → src/core/config.ts
- `Gateway Configuration (gateway.yaml)` --conceptually_related_to--> `AgentConfig`  [INFERRED]
  config/gateway.yaml → src/core/config.ts
- `Gateway Configuration (gateway.yaml)` --conceptually_related_to--> `RoutingRule`  [INFERRED]
  config/gateway.yaml → src/core/config.ts
- `ClaudeCodeAdapter` --conceptually_related_to--> `Adapter Pattern`  [EXTRACTED]
  src/adapters/claude-code.ts → CLAUDE.md

## Hyperedges (group relationships)
- **Task Processing Pipeline** —  [EXTRACTED]
- **Gateway Bootstrap Sequence** —  [EXTRACTED]
- **Universal Message Protocol** —  [INFERRED]
- **Gateway Resilience Layer** — circuit_breaker_registry, retry_config, rate_limiter [INFERRED 0.85]
- **Provider Selection Pipeline** — model_router, circuit_breaker_registry, quota_manager [INFERRED 0.85]
- **Gateway Request Processing Pipeline** — rate_limiter, model_router, model_provider_caller, circuit_breaker_registry, retry_config, gateway_metrics [INFERRED 0.95]
- **Adapter Pattern Hierarchy** — agent_adapter_interface, base_agent_adapter, claude_code_adapter, openclaw_adapter, process_adapter [INFERRED 0.85]
- **Hermes Async Webhook Flow** — hermes_routes, hermes_task, hermes_task_queue, hermes_async_execution, model_gateway_router, model_gateway_providers, logger_core [INFERRED 0.85]
- **SSE-Based Real-time Event System** — websocket_routes, sse_event_streaming, task_manager, agent_registry [INFERRED 0.85]

## Communities (18 total, 5 thin omitted)

### Community 0 - "Hermes + Circuit Breaker"
Cohesion: 0.05
Nodes (43): executeHermesTask(), HermesTask, tasks, CircuitBreakerConfig, CircuitBreakerRegistry, CircuitEntry, CircuitState, DEFAULTS (+35 more)

### Community 1 - "CLI Connect Tool Adapters"
Cohesion: 0.05
Nodes (56): ADAPTERS, args, BACKUP_DIR, backupFile(), claudeCodeAdapter, codexDesktopAdapter, ConnectResult, connectTools() (+48 more)

### Community 2 - "Adapter Base + Config Types"
Cohesion: 0.08
Nodes (37): AgentAdapter, ProcessConfig, AgentRegistry, DEFAULT_AGENT_CONFIGS, AgentConfig, GatewayConfig, getAllAgentConfigs, getDefaultAgent (+29 more)

### Community 3 - "Package Metadata"
Cohesion: 0.05
Nodes (37): author, bin, agentmesh, bugs, url, description, devDependencies, @types/bun (+29 more)

### Community 4 - "Model Gateway Core Concepts"
Cohesion: 0.08
Nodes (31): API Key Resolution (inline → env_var → skip), Circuit Breaker (CLOSED/OPEN/HALF_OPEN), Circuit Breaker Registry, Codex Desktop Responses API Adapter, Codexbar CLI Quota Probe, Provider Fallback Chain (DeepSeek → OpenRouter → Ollama), Gateway Runtime Metrics, Gateway YAML Configuration (config/gateway.yaml) (+23 more)

### Community 5 - "Agent Orchestration Concepts"
Cohesion: 0.09
Nodes (33): Adapter Pattern, AgentAdapter Interface, Agent Mesh Gateway, Agent Orchestration Layer, AgentRegistry, Agent Router (Core), API Routes Handler (REST), BaseAgentAdapter Abstract Class (+25 more)

### Community 6 - "Configuration System"
Cohesion: 0.1
Nodes (27): AgentConfig, DEFAULT_CONFIG, GatewayConfig, getAgentConfig(), getConfig(), getDefaultAgent(), getRoutingRules(), loadConfig() (+19 more)

### Community 7 - "Agent Adapter Implementations"
Cohesion: 0.1
Nodes (13): ClaudeCodeAdapter, OpenClawAdapter, ProcessAdapter, dependencies, chromadb, execa, fastify, @fastify/cors (+5 more)

### Community 8 - "Provider Call + Retry Logic"
Cohesion: 0.13
Nodes (21): callChatCompletions(), callResponsesApi(), convertChatToResponses(), convertInputToMessages(), convertToolSchemas(), extractTextContent(), sseEncoder, transformSSEStream() (+13 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, allowJs, declaration, jsx, lib, module, moduleDetection (+13 more)

### Community 10 - "Context Manager"
Cohesion: 0.23
Nodes (3): Context Manager (Core), ContextManager, metadata

### Community 15 - "CLI Entry Points"
Cohesion: 0.29
Nodes (8): CLI main, connectTools, ToolAdapter, initLogger, Logger, @starlink-awaken/agentmesh, runRelease, runSetup

## Knowledge Gaps
- **171 isolated node(s):** `name`, `version`, `description`, `main`, `types` (+166 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `Configuration System` to `Hermes + Circuit Breaker`, `Agent Adapter Implementations`?**
  _High betweenness centrality (0.172) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Agent Adapter Implementations` to `Package Metadata`?**
  _High betweenness centrality (0.171) - this node is a cross-community bridge._
- **Why does `fastify` connect `Agent Adapter Implementations` to `Configuration System`?**
  _High betweenness centrality (0.151) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `main()` (e.g. with `runSetup()` and `listDetectedTools()`) actually correct?**
  _`main()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `AgentMessage` (e.g. with `TaskManager` and `EventBus`) actually correct?**
  _`AgentMessage` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _171 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Hermes + Circuit Breaker` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._