/**
 * AgentPatterns - Agent 设计模式库
 *
 * 基于 Google Agentic Design Patterns 整理
 * 21 个生产级 Agent 设计模式
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * 模式类别
 */
export type PatternCategory =
  | 'execution'      // 核心执行
  | 'interaction'    // 外部交互
  | 'memory'         // 状态与记忆
  | 'collaboration'; // 多代理协作

/**
 * 模式定义
 */
export interface AgentPattern {
  id: string;
  name: string;
  nameCN: string;
  category: PatternCategory;
  description: string;
  useCases: string[];
  codeExample?: string;
  frameworks?: string[];
}

/**
 * 模式执行结果
 */
export interface PatternResult {
  pattern: AgentPattern;
  output: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * ========== 第一部分：核心执行模式 ==========
 */

/**
 * 1. Prompt Chaining - 提示词链
 *
 * 将复杂任务分解为一系列顺序步骤
 */
export const promptChaining: AgentPattern = {
  id: 'prompt-chaining',
  name: 'Prompt Chaining',
  nameCN: '提示词链',
  category: 'execution',
  description: '将复杂任务分解为一系列顺序步骤，每一步的输出作为下一步的输入',
  useCases: [
    '多步骤文档生成',
    '数据处理流水线',
    '复杂查询分析'
  ],
  codeExample: `
async function promptChaining(input: string, steps: string[]): Promise<string> {
  let context = input;
  for (const step of steps) {
    const result = await llm.invoke(step + "\\n\\n上下文: " + context);
    context = result;
  }
  return context;
}`,
  frameworks: ['LangChain', 'LangGraph', 'CrewAI']
};

/**
 * 2. Routing - 路由
 *
 * 根据输入内容智能选择处理路径
 */
export const routing: AgentPattern = {
  id: 'routing',
  name: 'Routing',
  nameCN: '路由',
  category: 'execution',
  description: '根据输入内容或上下文条件，选择最合适的处理路径或工具',
  useCases: [
    '意图分类',
    '自动客服分流',
    '多模型选择'
  ],
  codeExample: `
async function route(input: string): Promise<string> {
  const intent = await classifyIntent(input);
  switch (intent) {
    case 'technical': return await handleTechnical(input);
    case 'billing': return await handleBilling(input);
    default: return await handleGeneral(input);
  }
}`,
  frameworks: ['LangChain', 'LangGraph']
};

/**
 * 3. Parallelization - 并行化
 *
 * 并发执行独立任务提升效率
 */
export const parallelization: AgentPattern = {
  id: 'parallelization',
  name: 'Parallelization',
  nameCN: '并行化',
  category: 'execution',
  description: '将独立的子任务并行执行，充分利用计算资源',
  useCases: [
    '批量文档处理',
    '多源数据收集',
    '并发API调用'
  ],
  codeExample: `
async function parallelProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  return Promise.all(items.map(processor));
}`,
  frameworks: ['LangGraph', 'Pypipe']
};

/**
 * 4. Planning - 规划
 *
 * 动态生成多步骤执行计划
 */
export const planning: AgentPattern = {
  id: 'planning',
  name: 'Planning',
  nameCN: '规划',
  category: 'execution',
  description: '让 Agent 自主分解复杂目标为可执行的步骤计划',
  useCases: [
    '复杂任务分解',
    '项目规划',
    '代码重构策略'
  ],
  codeExample: `
async function plan(goal: string): Promise<Step[]> {
  const prompt = \`
    目标: \${goal}
    请制定详细的执行步骤计划
  \`;
  const response = await llm.invoke(prompt);
  return parseSteps(response);
}`,
  frameworks: ['LangGraph', 'OpenAI', 'Claude']
};

/**
 * ========== 第二部分：外部交互模式 ==========
 */

/**
 * 5. Tool Use - 工具使用
 *
 * Agent 调用外部工具扩展能力
 */
export const toolUse: AgentPattern = {
  id: 'tool-use',
  name: 'Tool Use',
  nameCN: '工具使用',
  category: 'interaction',
  description: 'Agent 通过调用外部 API、数据库或服务完成任务',
  useCases: [
    '搜索增强',
    '数据库查询',
    'API 集成'
  ],
  codeExample: `
const tools = [
  { name: 'search', description: '搜索互联网', parameters: {...} },
  { name: 'calculator', description: '数学计算', parameters: {...} }
];

const result = await llm.withTools(tools).invoke(userQuery);`,
  frameworks: ['OpenAI', 'Anthropic', 'LangChain']
};

/**
 * 6. Knowledge Retrieval - 知识检索
 *
 * 从知识库中检索相关信息
 */
export const knowledgeRetrieval: AgentPattern = {
  id: 'knowledge-retrieval',
  name: 'Knowledge Retrieval',
  nameCN: '知识检索',
  category: 'interaction',
  description: '从向量数据库或知识库中检索相关信息增强回答',
  useCases: [
    'RAG 增强生成',
    '企业知识库',
    '文档问答'
  ],
  codeExample: `
async function ragQuery(query: string) {
  const embeddings = await embed(query);
  const results = await vectorDB.search(embeddings, topK: 5);
  const context = results.map(r => r.content).join('\\n');
  return await llm.invoke(\`问题: \${query}\\n上下文: \${context}\`);
}`,
  frameworks: ['LangChain', 'LlamaIndex', 'RAGFlow']
};

/**
 * 7. JSON Mode / Structured Output - 结构化输出
 *
 * 强制 LLM 输出指定格式
 */
export const structuredOutput: AgentPattern = {
  id: 'structured-output',
  name: 'Structured Output',
  nameCN: '结构化输出',
  category: 'interaction',
  description: '强制 LLM 输出指定格式的结构化数据',
  useCases: [
    'API 响应格式化',
    '数据提取',
    '表单生成'
  ],
  codeExample: `
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{role: 'user', content: query}],
  response_format: { type: 'json_object' },
  schema: userSchema
});`,
  frameworks: ['OpenAI', 'Anthropic', 'BAML']
};

/**
 * ========== 第三部分：状态与记忆模式 ==========
 */

/**
 * 8. Memory Management - 记忆管理
 *
 * 管理短期和长期记忆
 */
export const memoryManagement: AgentPattern = {
  id: 'memory-management',
  name: 'Memory Management',
  nameCN: '记忆管理',
  category: 'memory',
  description: '管理短期对话上下文和长期知识沉淀',
  useCases: [
    '会话连续性',
    '个性化记忆',
    '跨会话学习'
  ],
  codeExample: `
class MemoryManager {
  private shortTerm: Message[] = [];
  private longTerm: VectorStore;

  async add(message: Message) {
    this.shortTerm.push(message);
    if (this.shortTerm.length > 10) {
      const summary = await summarize(this.shortTerm);
      await this.longTerm.save(summary);
      this.shortTerm = [];
    }
  }
}`,
  frameworks: ['LangChain', 'Mem0', 'MemGPT']
};

/**
 * 9. Reflection - 反思
 *
 * Agent 自我审视输出质量
 */
export const reflection: AgentPattern = {
  id: 'reflection',
  name: 'Reflection',
  nameCN: '反思',
  category: 'memory',
  description: 'Agent 审视自己的输出，识别错误和改进点',
  useCases: [
    '质量检查',
    '错误修正',
    '自我改进'
  ],
  codeExample: `
async function reflect(output: string): Promise<Evaluation> {
  const review = await llm.invoke(\`
    审查以下输出质量:
    \${output}
    检查: 准确性、完整性、格式
  \`);
  return parseEvaluation(review);
}`,
  frameworks: ['LangGraph', 'AutoGPT']
};

/**
 * 10. Self-Correction - 自我修正
 *
 * 基于反馈自动修正错误
 */
export const selfCorrection: AgentPattern = {
  id: 'self-correction',
  name: 'Self-Correction',
  nameCN: '自我修正',
  category: 'memory',
  description: '基于错误反馈自动修正输出',
  useCases: [
    '迭代优化',
    '错误重试',
    '质量改进'
  ],
  codeExample: `
async function selfCorrect(input: string, maxRetries = 3): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const output = await generate(input);
    const feedback = await validate(output);
    if (feedback.valid) return output;
    input = \`修正反馈: \${feedback.issues}\\n原输出: \${output}\`;
  }
  throw new Error('Max retries exceeded');
}`,
  frameworks: ['LangGraph', 'Claude']
};

/**
 * 11. Learning & Adaptation - 学习与适应
 *
 * 基于经验调整行为
 */
export const learningAdaptation: AgentPattern = {
  id: 'learning-adaptation',
  name: 'Learning & Adaptation',
  nameCN: '学习与适应',
  category: 'memory',
  description: '基于外部反馈和历史经验调整 Agent 行为',
  useCases: [
    '个性化服务',
    '风格适应',
    '性能优化'
  ],
  codeExample: `
async function learnAndAdapt(feedback: Feedback) {
  const pattern = extractPattern(feedback);
  await userPreferences.update(pattern);
  const adaptedPrompt = await buildAdaptedPrompt(userPreferences);
  return adaptedPrompt;
}`,
  frameworks: ['Mem0', 'GPTutor']
};

/**
 * ========== 第四部分：多代理协作模式 ==========
 */

/**
 * 12. Multi-Agent Collaboration - 多代理协作
 *
 * 多个专业 Agent 协同工作
 */
export const multiAgentCollaboration: AgentPattern = {
  id: 'multi-agent-collaboration',
  name: 'Multi-Agent Collaboration',
  nameCN: '多代理协作',
  category: 'collaboration',
  description: '多个专业 Agent 各司其职，协同完成复杂任务',
  useCases: [
    '团队开发',
    '研究分析',
    '内容创作'
  ],
  codeExample: `
const team = {
  researcher: createAgent({ role: '研究员', tools: ['search'] }),
  analyst: createAgent({ role: '分析师', tools: ['analyze'] }),
  writer: createAgent({ role: '作家', tools: ['write'] })
};

async function collaborate(task: string) {
  const research = await team.researcher.execute(task);
  const analysis = await team.analyst.execute(research);
  return await team.writer.execute(analysis);
}`,
  frameworks: ['CrewAI', 'LangGraph', 'AutoGen']
};

/**
 * 13. Hierarchical Agents - 层级代理
 *
 * 管理者-执行者分层架构
 */
export const hierarchicalAgents: AgentPattern = {
  id: 'hierarchical-agents',
  name: 'Hierarchical Agents',
  nameCN: '层级代理',
  category: 'collaboration',
  description: '上层 Agent 负责规划和协调，下层 Agent 负责执行',
  useCases: [
    '项目管理',
    '复杂系统控制',
    '任务分发'
  ],
  codeExample: `
const manager = createAgent({
  role: '项目经理',
  subAgents: [designer, developer, tester]
});

async function handleProject(requirement: string) {
  const plan = await manager.plan(requirement);
  const tasks = await manager.distribute(plan);
  const results = await Promise.all(tasks.map(manager.execute));
  return manager.combine(results);
}`,
  frameworks: ['LangGraph', 'AutoGen']
};

/**
 * 14. Debate - 辩论
 *
 * Agent 之间观点碰撞
 */
export const debate: AgentPattern = {
  id: 'debate',
  name: 'Debate',
  nameCN: '辩论',
  category: 'collaboration',
  description: '多个 Agent 从不同角度辩论，形成更全面的结论',
  useCases: [
    '方案评审',
    '风险评估',
    '决策优化'
  ],
  codeExample: `
async function debate(topic: string, perspectives: string[]) {
  const agents = perspectives.map(p => createAgent({ role: p }));
  let discussion = [];

  for (let round = 0; round < 3; round++) {
    const arguments = await Promise.all(
      agents.map(a => a.argue(topic, discussion))
    );
    discussion.push(...arguments);
  }

  return await judge.summarize(discussion);
}`,
  frameworks: ['Council', 'MultiAgent']
};

/**
 * 15. Human-in-the-Loop - 人工介入
 *
 * 关键节点人工确认
 */
export const humanInTheLoop: AgentPattern = {
  id: 'human-in-loop',
  name: 'Human-in-the-Loop',
  nameCN: '人工介入',
  category: 'collaboration',
  description: '在关键决策点请求人工确认或输入',
  useCases: [
    '审批流程',
    '质量控制',
    '敏感操作'
  ],
  codeExample: `
async function executeWithHumanApproval(action: Action) {
  if (action.requiresApproval) {
    const approval = await requestHumanApproval(action);
    if (!approval.approved) {
      return { status: 'rejected', feedback: approval.feedback };
    }
  }
  return await execute(action);
}`,
  frameworks: ['LangGraph', 'AutoGen']
};

/**
 * 16. Guardrails - 安全护栏
 *
 * 输入输出安全检查
 */
export const guardrails: AgentPattern = {
  id: 'guardrails',
  name: 'Guardrails',
  nameCN: '安全护栏',
  category: 'collaboration',
  description: '对输入输出进行安全检查和过滤',
  useCases: [
    '内容审核',
    '隐私保护',
    '恶意输入过滤'
  ],
  codeExample: `
async function withGuardrails(input: string): Promise<string> {
  const safetyCheck = await safetyClassifier.check(input);
  if (!safetyCheck.safe) {
    return "抱歉，我无法处理此请求";
  }

  const output = await llm.invoke(input);

  const outputCheck = await safetyClassifier.check(output);
  if (!outputCheck.safe) {
    return "生成内容未通过安全检查";
  }

  return output;
}`,
  frameworks: ['Guardrails AI', 'NVIDIA']
};

/**
 * 17. ReAct - 推理行动模式
 *
 * 思考-行动-观察迭代循环
 */
export const react: AgentPattern = {
  id: 'react',
  name: 'ReAct',
  nameCN: '推理行动',
  category: 'execution',
  description: '在思考、行动和观察的迭代循环中运行，直到满足退出条件',
  useCases: [
    '复杂动态任务规划',
    '机器人路径规划',
    '多步推理问题'
  ],
  codeExample: `
async function* reactAgent(prompt: string, tools: Tool[]) {
  let context = prompt;
  let iteration = 0;

  while (iteration < maxIterations) {
    // 思考
    const thought = await llm.invoke(\`思考: \${context}\`);

    // 行动
    const action = await parseToolCall(thought, tools);
    if (!action) {
      // 任务完成
      return thought;
    }

    // 观察
    const observation = await executeTool(action);
    context += \`\\n观察: \${observation}\`;

    yield { thought, action, observation };
    iteration++;
  }
}`,
  frameworks: ['LangChain', 'LangGraph', 'OpenAI']
};

/**
 * 18. Sequential - 顺序执行模式
 *
 * 按预定义的线性顺序执行一系列专业Agent
 */
export const sequential: AgentPattern = {
  id: 'sequential',
  name: 'Sequential',
  nameCN: '顺序执行',
  category: 'execution',
  description: '按预定义的线性顺序执行一系列专业Agent，一个Agent的输出直接作为下一个Agent的输入',
  useCases: [
    '数据处理流水线',
    '文档生成流程',
    '多步骤分析'
  ],
  codeExample: `
async function sequentialPipeline(input: string, agents: Agent[]): Promise<string> {
  let result = input;

  for (const agent of agents) {
    result = await agent.execute(result);
  }

  return result;
}

// 示例：数据提取 → 清洗 → 分析
const pipeline = await sequentialPipeline(rawData, [
  dataExtractor,
  dataCleaner,
  dataAnalyzer
]);`,
  frameworks: ['LangGraph', 'CrewAI']
};

/**
 * 19. Parallel - 并行执行模式
 *
 * 多个专业子Agent同时独立执行任务
 */
export const parallelExec: AgentPattern = {
  id: 'parallel',
  name: 'Parallel',
  nameCN: '并行执行',
  category: 'execution',
  description: '多个专业子Agent同时独立执行任务或子任务，然后合成最终结果',
  useCases: [
    '多源数据收集',
    '并行分析',
    '多角度评估'
  ],
  codeExample: `
async function parallelExecute<T>(
  task: string,
  agents: Agent[]
): Promise<CombinedResult> {
  const results = await Promise.all(
    agents.map(agent => agent.execute(task))
  );

  // 合成结果
  return synthesizeResults(results);
}

// 示例：同时分析客户反馈
const analysis = await parallelExecute(feedback, [
  sentimentAgent,      // 情感分析
  keywordAgent,      // 关键词提取
  categoryAgent,     // 分类
  urgencyAgent       // 紧急程度
]);`,
  frameworks: ['LangGraph', 'AutoGen']
};

/**
 * 20. Orchestrator - 协调器模式
 *
 * 中央协调器分析请求并动态分派任务
 */
export const orchestrator: AgentPattern = {
  id: 'orchestrator',
  name: 'Orchestrator',
  nameCN: '协调器',
  category: 'collaboration',
  description: '使用中央协调器分析用户请求并动态分解为子任务，分派给专业Agent执行',
  useCases: [
    '客服系统',
    '复杂业务流程',
    '自适应路由'
  ],
  codeExample: `
class Orchestrator {
  private subAgents: Map<string, Agent> = new Map();

  async handle(request: string): Promise<Response> {
    // 1. 分析请求
    const plan = await this.analyzeAndPlan(request);

    // 2. 分派子任务
    const subtasks = plan.subtasks;
    const results = await Promise.all(
      subtasks.map(task => this.dispatch(task))
    );

    // 3. 合成最终响应
    return this.synthesize(request, results);
  }

  private async analyzeAndPlan(request: Request): Promise<Plan> {
    const prompt = \`
      分析请求: \${request.content}
      确定需要哪些子任务
    \`;
    return await llm.invoke(prompt);
  }

  private async dispatch(task: Subtask): Promise<Result> {
    const agent = this.subAgents.get(task.type);
    return await agent.execute(task);
  }
}`,
  frameworks: ['LangGraph', 'AutoGen', 'CAMPHOR']
};

/**
 * 21. Loop - 循环执行模式
 *
 * 重复执行直到满足终止条件
 */
export const loop: AgentPattern = {
  id: 'loop',
  name: 'Loop',
  nameCN: '循环执行',
  category: 'execution',
  description: '重复执行一系列专业子Agent，直到满足特定的终止条件',
  useCases: [
    '迭代优化',
    '质量改进',
    '自我修正'
  ],
  codeExample: `
async function loopExecute(
  input: string,
  agents: Agent[],
  options: {
    maxIterations?: number;
    exitCondition?: (state: State) => boolean;
  } = {}
): Promise<string> {
  const { maxIterations = 10, exitCondition } = options;

  let state = { result: input, iteration: 0, done: false };

  while (state.iteration < maxIterations && !state.done) {
    // 执行一轮
    for (const agent of agents) {
      state.result = await agent.execute(state.result);
    }

    // 检查退出条件
    if (exitCondition) {
      state.done = exitCondition(state);
    }

    state.iteration++;
  }

  return state.result;
}

// 示例：生成代码直到通过测试
const code = await loopGenerate(prompt, [generator, reviewer], {
  maxIterations: 5,
  exitCondition: (s) => s.passedTests > 0
});`,
  frameworks: ['LangGraph', 'Claude']
};

/**
 * 统一导出所有模式
 */
export const agentDesignPatterns: AgentPattern[] = [
  // 执行模式
  promptChaining,
  routing,
  parallelization,
  planning,
  react,
  sequential,
  parallelExec,
  loop,

  // 交互模式
  toolUse,
  knowledgeRetrieval,
  structuredOutput,

  // 记忆模式
  memoryManagement,
  reflection,
  selfCorrection,
  learningAdaptation,

  // 协作模式
  multiAgentCollaboration,
  hierarchicalAgents,
  debate,
  humanInTheLoop,
  guardrails,
  orchestrator,
];

/**
 * AgentPatterns 类
 */
export class AgentPatterns {
  private patterns: Map<string, AgentPattern> = new Map();

  constructor() {
    for (const pattern of agentDesignPatterns) {
      this.patterns.set(pattern.id, pattern);
    }
  }

  /**
   * 获取所有模式
   */
  getAll(): AgentPattern[] {
    return agentDesignPatterns;
  }

  /**
   * 按类别获取模式
   */
  getByCategory(category: PatternCategory): AgentPattern[] {
    return agentDesignPatterns.filter((p: AgentPattern) => p.category === category);
  }

  /**
   * 获取模式详情
   */
  get(id: string): AgentPattern | undefined {
    return this.patterns.get(id);
  }

  /**
   * 搜索模式
   */
  search(query: string): AgentPattern[] {
    const q = query.toLowerCase();
    return agentDesignPatterns.filter((p: AgentPattern) =>
      p.name.toLowerCase().includes(q) ||
      p.nameCN.includes(query) ||
      p.description.toLowerCase().includes(q) ||
      p.useCases.some((u: string) => u.toLowerCase().includes(q))
    );
  }

  /**
   * 格式化输出为 Markdown
   */
  toMarkdown(pattern: AgentPattern): string {
    return `## ${pattern.name} (${pattern.nameCN})

**类别**: ${pattern.category}

**描述**: ${pattern.description}

### 使用场景
${pattern.useCases.map(u => `- ${u}`).join('\n')}

### 代码示例
\`\`\`typescript
${pattern.codeExample}
\`\`\`

### 适用框架
${pattern.frameworks?.map(f => `- ${f}`).join('\n') || '通用'}
`;
  }
}

export default AgentPatterns;
