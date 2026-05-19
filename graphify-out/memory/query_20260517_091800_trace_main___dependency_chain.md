---
type: "query"
date: "2026-05-17T09:18:00.671495+00:00"
question: "Trace main() dependency chain"
contributor: "graphify"
source_nodes: ["index_main main"]
---

# Q: Trace main() dependency chain

## Answer

Two main() functions found: (1) src/index.ts:16 — server entry, bootstraps Fastify, initializes config→model gateway→agent registry→vector store. Key calls: loadConfig(), configureRetry(), initRateLimiter(), initModelRouter(), getRoutingRules(), getDefaultAgent(). (2) src/cli.ts:353 — CLI entry, dispatches 12+ subcommands. Key calls: showHelp(), cmdStart(), cmdHealth(), cmdStatus(), cmdModels(), cmdQuota(), cmdAgents(), cmdTasks(), cmdConfig(), cmdDoctor(), initLogger(). Also dynamically imports runSetup(), connectTools(), disconnectTools(), runRelease(). Both share Configuration System (community 6) but bridge to different communities: CLI to Connect Tool Adapters (community 1), Server to Agent Adapter Implementations (community 7) and Model Gateway Core Concepts (community 4).

## Source Nodes

- index_main main