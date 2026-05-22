/**
 * 内置技能定义
 * 迁移自 core/, architecture/, lifecycle/ 模块
 */
import type { SkillDefinition } from './types.js';

/**
 * Algorithm 技能 - 问题解决框架
 */
export const algorithmSkill: SkillDefinition = {
  id: 'algorithm',
  name: 'algorithm',
  description: 'Use for complex problem-solving with structured methodology',
  longDescription: 'TheAlgorithm is a 7-phase problem-solving framework (OBSERVE -> THINK -> PLAN -> BUILD -> EXECUTE -> VERIFY -> LEARN) that ensures systematic task execution with ISC (Ideal State Criteria) generation.',
  triggers: [
    'algorithm', 'problem solving', 'solve', 'fix', 'debug', 'implement',
    'task', 'workflow', 'process', 'methodology', 'approach',
    'thealgorithm', '七阶段', '问题解决', 'ISC', '标准生成',
  ],
  role: 'generalist',
  scope: 'implementation',
  outputFormat: 'mixed',
  category: 'framework',
  dependencies: [],
  references: [
    { topic: 'Seven Phases', file: 'seven-phases.md', loadWhen: 'Understanding the workflow' },
    { topic: 'ISC Generation', file: 'isc-generation.md', loadWhen: 'Creating criteria' },
    { topic: 'Capability Selection', file: 'capability-selection.md', loadWhen: 'Selecting agents' },
  ],
  constraints: [
    { type: 'must-do', rule: 'Generate ISC criteria before execution', reason: 'Ensures verifiable outcomes' },
    { type: 'must-do', rule: 'Use VERIFY phase before claiming completion', reason: 'Validates results' },
  ],
  workflow: [
    { order: 1, name: 'OBSERVE', description: 'Analyze request and constraints' },
    { order: 2, name: 'THINK', description: 'Select capabilities and approach' },
    { order: 3, name: 'PLAN', description: 'Define execution strategy' },
    { order: 4, name: 'BUILD', description: 'Create artifacts and code' },
    { order: 5, name: 'EXECUTE', description: 'Run selected capabilities' },
    { order: 6, name: 'VERIFY', description: 'Validate against ISC criteria' },
    { order: 7, name: 'LEARN', description: 'Capture improvements' },
  ],
};

/**
 * C4 Modeling 技能 - 架构图建模
 */
export const c4ModelSkill: SkillDefinition = {
  id: 'c4-model',
  name: 'c4-model',
  description: 'Use for creating C4 architecture diagrams',
  longDescription: 'C4 model is a lean architecture description technique with 4 levels: Context, Container, Component, and Code. Generates Mermaid diagrams.',
  triggers: [
    'c4', 'architecture', 'diagram', 'system design', 'context', 'container',
    'component', 'mermaid', '架构图', '系统设计', '建模',
  ],
  role: 'architect',
  scope: 'design',
  outputFormat: 'text',
  category: 'architecture',
  references: [
    { topic: 'Context Diagram', file: 'context-diagram.md', loadWhen: 'System overview' },
    { topic: 'Container Diagram', file: 'container-diagram.md', loadWhen: 'Application boundaries' },
    { topic: 'Component Diagram', file: 'component-diagram.md', loadWhen: 'Internal components' },
  ],
  constraints: [
    { type: 'must-do', rule: 'Start with Context diagram before drilling down', reason: 'C4 hierarchy' },
  ],
};

/**
 * ADR Management 技能 - 架构决策记录
 */
export const adrSkill: SkillDefinition = {
  id: 'adr',
  name: 'adr',
  description: 'Use for managing Architecture Decision Records',
  longDescription: 'ADR is a document that captures an important architectural decision along with its context and consequences.',
  triggers: [
    'adr', 'architecture decision', 'decision record', 'rfc', 'proposal',
    '架构决策', '技术选型', '决策记录',
  ],
  role: 'architect',
  scope: 'design',
  outputFormat: 'text',
  category: 'architecture',
  references: [
    { topic: 'ADR Format', file: 'adr-format.md', loadWhen: 'Writing ADR' },
    { topic: 'Lifecycle', file: 'adr-lifecycle.md', loadWhen: 'Managing ADRs' },
  ],
};

/**
 * Formal Methods 技能 - 形式化方法
 */
export const formalMethodSkill: SkillDefinition = {
  id: 'formal-method',
  name: 'formal-method',
  description: 'Use for formal verification and modeling',
  longDescription: 'Formal methods using TLA+ and Alloy for system specification, model checking, and property verification.',
  triggers: [
    'tla', 'tla+', 'alloy', 'formal', 'verification', 'model checking',
    'specification', 'invariant', 'state machine', '形式化', '验证',
  ],
  role: 'architect',
  scope: 'design',
  outputFormat: 'text',
  category: 'architecture',
  references: [
    { topic: 'TLA+ Basics', file: 'tla-basics.md', loadWhen: 'Writing TLA+ specs' },
    { topic: 'Alloy Basics', file: 'alloy-basics.md', loadWhen: 'Using Alloy' },
  ],
};

/**
 * Knowledge Graph 技能 - 知识图谱
 */
export const knowledgeGraphSkill: SkillDefinition = {
  id: 'knowledge-graph',
  name: 'knowledge-graph',
  description: 'Use for managing knowledge entities and relationships',
  longDescription: 'Knowledge graph for building entity relationships, data sources integration, and semantic querying.',
  triggers: [
    'knowledge', 'graph', 'entity', 'relationship', 'ontology', 'kg',
    '知识图谱', '实体', '关系',
  ],
  role: 'specialist',
  scope: 'implementation',
  outputFormat: 'code',
  category: 'knowledge',
  references: [
    { topic: 'Entity Management', file: 'entities.md', loadWhen: 'Creating entities' },
    { topic: 'Relationships', file: 'relationships.md', loadWhen: 'Building relations' },
  ],
};

/**
 * Telos 技能 - 实体生命周期
 */
export const telosSkill: SkillDefinition = {
  id: 'telos',
  name: 'telos',
  description: 'Use for entity lifecycle management',
  longDescription: 'Telos framework for modeling entity lifecycle states, transitions, and actions.',
  triggers: [
    'telos', 'lifecycle', 'state', 'transition', 'entity', 'workflow',
    '生命周期', '状态机', '实体',
  ],
  role: 'specialist',
  scope: 'implementation',
  outputFormat: 'code',
  category: 'framework',
  references: [
    { topic: 'State Machine', file: 'state-machine.md', loadWhen: 'Modeling states' },
    { topic: 'Transitions', file: 'transitions.md', loadWhen: 'Defining transitions' },
  ],
};

/**
 * Pattern Loader 技能 - Fabric 模式库
 */
export const patternSkill: SkillDefinition = {
  id: 'pattern',
  name: 'pattern',
  description: 'Use for prompt patterns and templates',
  longDescription: 'Fabric pattern library with 240+ specialized patterns for analysis, extraction, summarization, and transformation.',
  triggers: [
    'pattern', 'fabric', 'prompt', 'template', 'analyze', 'extract',
    'summarize', 'transform', 'summarization', 'extraction',
    '模式', '提示词', '分析', '提取',
  ],
  role: 'specialist',
  scope: 'implementation',
  outputFormat: 'text',
  category: 'tool',
  references: [
    { topic: 'Analyze Patterns', file: 'analyze-patterns.md', loadWhen: 'Analysis tasks' },
    { topic: 'Extract Patterns', file: 'extract-patterns.md', loadWhen: 'Extraction tasks' },
    { topic: 'Summarize Patterns', file: 'summarize-patterns.md', loadWhen: 'Summarization tasks' },
    { topic: 'Transform Patterns', file: 'transform-patterns.md', loadWhen: 'Transformation tasks' },
  ],
};

/**
 * 代码审查技能
 */
export const codeReviewSkill: SkillDefinition = {
  id: 'code-review',
  name: 'code-review',
  description: 'Use for comprehensive code review',
  longDescription: 'Perform thorough code reviews covering correctness, security, performance, and best practices.',
  triggers: [
    'review', 'code review', 'pr review', 'pull request', 'inspect',
    '审查', '代码审查', '评审',
  ],
  role: 'reviewer',
  scope: 'review',
  outputFormat: 'text',
  category: 'quality',
  references: [
    { topic: 'Security Review', file: 'security-review.md', loadWhen: 'Security concerns' },
    { topic: 'Performance Review', file: 'performance-review.md', loadWhen: 'Performance concerns' },
  ],
  constraints: [
    { type: 'must-not-do', rule: 'Approve code with known security vulnerabilities', reason: 'Security first' },
  ],
};

/**
 * 安全审查技能
 */
export const securityReviewSkill: SkillDefinition = {
  id: 'security-review',
  name: 'security-review',
  description: 'Use for security-focused code review',
  longDescription: 'Focused security review for identifying vulnerabilities, OWASP Top 10 issues, and secure coding practices.',
  triggers: [
    'security', 'vulnerability', 'secure', 'owasp', 'pentest', 'exploit',
    '安全', '漏洞', '渗透',
  ],
  role: 'reviewer',
  scope: 'review',
  outputFormat: 'text',
  category: 'security',
  references: [
    { topic: 'OWASP Top 10', file: 'owasp-top-10.md', loadWhen: 'General security' },
    { topic: 'Authentication', file: 'authentication.md', loadWhen: 'Auth-related code' },
    { topic: 'Authorization', file: 'authorization.md', loadWhen: 'Permission checks' },
  ],
};

/**
 * 测试技能
 */
export const testingSkill: SkillDefinition = {
  id: 'testing',
  name: 'testing',
  description: 'Use for writing and managing tests',
  longDescription: 'Comprehensive testing skills including unit tests, integration tests, E2E tests, and test strategies.',
  triggers: [
    'test', 'testing', 'unit', 'integration', 'e2e', 'jest', 'vitest',
    'playwright', 'pytest', 'spec', '测试', '单元测试',
  ],
  role: 'specialist',
  scope: 'implementation',
  outputFormat: 'code',
  category: 'quality',
  references: [
    { topic: 'Unit Testing', file: 'unit-testing.md', loadWhen: 'Writing unit tests' },
    { topic: 'E2E Testing', file: 'e2e-testing.md', loadWhen: 'Writing E2E tests' },
    { topic: 'Test Strategy', file: 'test-strategy.md', loadWhen: 'Planning test coverage' },
  ],
};

/**
 * 获取所有内置技能
 */
export const builtInSkills: SkillDefinition[] = [
  algorithmSkill,
  c4ModelSkill,
  adrSkill,
  formalMethodSkill,
  knowledgeGraphSkill,
  telosSkill,
  patternSkill,
  codeReviewSkill,
  securityReviewSkill,
  testingSkill,
];
