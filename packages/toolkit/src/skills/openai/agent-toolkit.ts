/**
 * Agent Toolkit 技能
 *
 * 提供 @starlink-awaken/agent-toolkit 的多智能体协作、LLM 调用和技能管理能力
 */
import type { OpenAISkillDefinition } from './types.js';
import type { ReferenceRoute } from '../types.js';

const references: ReferenceRoute[] = [
  { topic: 'Agent Toolkit README', file: 'README.md', loadWhen: 'Using agent-toolkit' },
  { topic: 'API Documentation', file: 'docs/api/tools.md', loadWhen: 'API reference' },
  { topic: 'Cookbook', file: 'COOKBOOK.md', loadWhen: 'Examples' },
];

export const agentToolkitSkill: OpenAISkillDefinition = {
  id: 'agent-toolkit',
  name: 'Agent Toolkit',
  description: 'Use @starlink-awaken/agent-toolkit for multi-agent collaboration, LLM calls, and skill management',
  longDescription: `## Agent Toolkit Skill

This skill provides access to the @starlink-awaken/agent-toolkit library:

### Capabilities

**Multi-Agent Collaboration**
- TeamManager, MultiRoleAgentManager, WorkflowOrchestrator
- GroupChat, ConversationAgent, HumanProxy

**LLM Providers**
- OpenAI (GPT-4, GPT-3.5, o1)
- Anthropic (Claude 3.5, Claude 3 Opus)
- Google Gemini (Pro, Flash, Ultra)
- Ollama (Local LLM)

**Skills System**
- Progressive Disclosure, SkillLoader, SkillRouter
- SkillController, SkillExecutor, SkillDiscovery
- 30+ Built-in Skills (Playwright, Figma, Vercel, etc.)

**Memory & Knowledge**
- MemoryStore, ReasoningBank, SelfJudge
- Vector Store (Memory, ChromaDB, Qdrant)
- KnowledgeGraph, HybridRetriever

**Tools & Middleware**
- ToolRegistry, DynamicComposer
- Logging, Rate Limiting, Validation, Security

**Observability**
- Logger, Metrics, Tracer, HealthCheck

**Enterprise Features**
- Session Management with Checkpoints
- Retry with Exponential Backoff
- Unified Error Types

### Usage Examples
- "Create a team of agents with agent-toolkit"
- "Use OpenAI provider to call GPT-4"
- "Set up vector store with ChromaDB"
- "Add logging middleware to the pipeline"
- "Create a session with checkpoint support"

### When to Use
- Building multi-agent applications
- Integrating multiple LLM providers
- Creating skill-based AI systems
- Setting up enterprise-grade observability`,

  triggers: [
    'agent-toolkit', 'agent toolkit', '@starlink-awaken',
    'multi-agent', 'team manager', 'group chat', 'workflow',
    'llm provider', 'openai', 'anthropic', 'gemini', 'ollama',
    'skill loader', 'skill router', 'skill system',
    'memory', 'reasoning bank', 'vector store',
    'tool registry', 'middleware', 'logging', 'rate limit',
    'session', 'checkpoint', 'retry',
    'logger', 'metrics', 'tracer', 'health check',
  ],

  role: 'architect',
  scope: 'implementation',
  outputFormat: 'code',
  category: 'agent-framework',

  dependencies: [],

  references,

  mcpServers: [],
  externalScripts: [],

  yamlConfig: {
    display_name: 'Agent Toolkit',
    short_description: 'Multi-agent collaboration and LLM framework',
    default_prompt: `You have access to @starlink-awaken/agent-toolkit.

Available modules:
- llm: createLLMClient() for OpenAI, Anthropic, Gemini, Ollama
- team: TeamManager, WorkflowOrchestrator for multi-agent
- skills: SkillLoader, SkillRouter for progressive disclosure
- memory: MemoryStore, ReasoningBank for context
- tools: ToolRegistry for tool management
- middleware: Logging, RateLimit, Validation
- observability: Logger, Metrics, Tracer, HealthCheck
- session: SessionManager with checkpoint support
- retry: RetryableClient with exponential backoff

Use the appropriate module to solve the task.`,
  },
};
