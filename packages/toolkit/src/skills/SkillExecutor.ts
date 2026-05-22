/**
 * SkillExecutor - 技能执行器
 *
 * LLM 调用生成记忆操作
 * ACTION 块解析
 * 默认规则执行器
 */
import type {
  SkillExecutionContext,
  SkillExecutionResult,
  SkillAction,
} from './types.js';
import type { SkillExecutor as SkillExecutorFn } from './types.js';
import { OllamaClient } from '../local-reflex/OllamaClient.js';

export interface ExecutorConfig {
  /** LLM 客户端配置 */
  llm?: {
    baseUrl?: string;
    model?: string;
    temperature?: number;
  };
  /** 最大重试次数 */
  maxRetries: number;
  /** 执行超时 (毫秒) */
  timeout: number;
  /** 是否启用详细日志 */
  verbose: boolean;
}

const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
  maxRetries: 2,
  timeout: 30000,
  verbose: false,
};

/**
 * ActionBlockParser - ACTION 块解析器
 * 用于解析 LLM 返回的 ACTION 块
 */
export class ActionBlockParser {
  /**
   * 解析 ACTION 块
   * 支持多种格式:
   * - ACTION: INSERT
   * - ```action
   *   INSERT
   *   ```
   * - <action>INSERT</action>
   */
  static parse(text: string): SkillAction {
    const trimmed = text.trim().toUpperCase();

    // 格式1: ACTION: INSERT
    const directMatch = trimmed.match(/^ACTION:\s*(\w+)/);
    if (directMatch) {
      return this.validateAction(directMatch[1]);
    }

    // 格式2: 代码块
    const codeBlockMatch = trimmed.match(/```(?:action|Action|ACTION)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const action = codeBlockMatch[1].trim().split('\n')[0];
      return this.validateAction(action);
    }

    // 格式3: XML 标签
    const xmlMatch = trimmed.match(/<action>([\s\S]*?)<\/action>/i);
    if (xmlMatch) {
      return this.validateAction(xmlMatch[1].trim());
    }

    // 格式4: 直接匹配动作关键词
    if (trimmed.includes('INSERT')) return 'INSERT';
    if (trimmed.includes('UPDATE')) return 'UPDATE';
    if (trimmed.includes('DELETE')) return 'DELETE';

    return 'NOOP';
  }

  /**
   * 验证动作类型
   */
  private static validateAction(action: string): SkillAction {
    const upperAction = action.toUpperCase();
    const validActions: SkillAction[] = ['INSERT', 'UPDATE', 'DELETE', 'NOOP'];

    if (validActions.includes(upperAction as SkillAction)) {
      return upperAction as SkillAction;
    }

    return 'NOOP';
  }

  /**
   * 解析 REASONING 块
   */
  static parseReasoning(text: string): string | undefined {
    const trimmed = text.trim();

    // 格式1: REASONING: xxx
    const directMatch = trimmed.match(/REASONING:\s*([\s\S]*?)(?:(?:\n\n)|$)/i);
    if (directMatch) {
      return directMatch[1].trim();
    }

    // 格式2: ```reasoning xxx ```
    const codeBlockMatch = trimmed.match(/```(?:reasoning|Reasoning|REASONING)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // 格式3: XML 标签
    const xmlMatch = trimmed.match(/<reasoning>([\s\S]*?)<\/reasoning>/i);
    if (xmlMatch) {
      return xmlMatch[1].trim();
    }

    return undefined;
  }

  /**
   * 解析完整响应
   */
  static parseFullResponse(text: string): {
    action: SkillAction;
    reasoning?: string;
    memoryIndex?: number;
    memoryContent?: string;
  } {
    const action = this.parse(text);
    const reasoning = this.parseReasoning(text);

    // 尝试解析内存索引
    const indexMatch = text.match(/INDEX:\s*(\d+)/i);
    const memoryIndex = indexMatch ? parseInt(indexMatch[1], 10) : undefined;

    // 尝试解析内存内容
    const contentMatch = text.match(/CONTENT:\s*([\s\S]*?)(?:(?:\n\n)|$)/i);
    const memoryContent = contentMatch ? contentMatch[1].trim() : undefined;

    return { action, reasoning, memoryIndex, memoryContent };
  }
}

/**
 * DefaultRuleExecutor - 默认规则执行器
 * 当没有 LLM 可用时使用基于规则的方法
 */
export class DefaultRuleExecutor {
  /**
   * 基于任务关键词执行规则匹配
   */
  static execute(context: SkillExecutionContext): SkillExecutionResult {
    const task = context.task.toLowerCase();
    const input = (context.input || '').toLowerCase();

    // 优先级1: 明确的删除指令
    if (this.containsDeleteKeywords(task, input)) {
      return {
        action: 'DELETE',
        success: true,
        reasoning: 'Task contains explicit delete/remove keywords',
      };
    }

    // 优先级2: 明确的更新/修改指令
    if (this.containsUpdateKeywords(task, input)) {
      return {
        action: 'UPDATE',
        success: true,
        reasoning: 'Task contains explicit update/modify keywords',
      };
    }

    // 优先级3: 明确的添加/创建指令
    if (this.containsInsertKeywords(task, input)) {
      return {
        action: 'INSERT',
        success: true,
        reasoning: 'Task contains explicit add/create keywords',
      };
    }

    // 优先级4: 基于检索到的记忆数量判断
    if (context.retrievedMemories.length === 0) {
      return {
        action: 'INSERT',
        success: true,
        reasoning: 'No relevant memories found, suggest inserting new information',
      };
    }

    // 默认不执行操作
    return {
      action: 'NOOP',
      success: true,
      reasoning: 'No clear action determined from task analysis',
    };
  }

  /**
   * 检查删除关键词
   */
  private static containsDeleteKeywords(task: string, input: string): boolean {
    const deleteKeywords = [
      'delete', 'remove', 'drop', 'erase', 'clear', 'cut',
      '卸载', '删除', '移除', '清除',
    ];

    const text = `${task} ${input}`;
    return deleteKeywords.some(kw => text.includes(kw));
  }

  /**
   * 检查更新关键词
   */
  private static containsUpdateKeywords(task: string, input: string): boolean {
    const updateKeywords = [
      'update', 'modify', 'change', 'edit', 'revise', 'alter',
      'replace', 'fix', 'correct', 'adjust',
      '更新', '修改', '更改', '调整', '修复',
    ];

    const text = `${task} ${input}`;
    return updateKeywords.some(kw => text.includes(kw));
  }

  /**
   * 检查插入关键词
   */
  private static containsInsertKeywords(task: string, input: string): boolean {
    const insertKeywords = [
      'add', 'create', 'new', 'insert', 'append', 'write',
      'build', 'implement', 'make', 'generate',
      '添加', '创建', '新增', '新建', '写入', '添加',
    ];

    const text = `${task} ${input}`;
    return insertKeywords.some(kw => text.includes(kw));
  }
}

/**
 * SkillExecutor - 技能执行器类
 * 协调 LLM 调用和执行逻辑
 */
export class SkillExecutor {
  private config: ExecutorConfig;
  private llmClient?: OllamaClient;

  constructor(config: Partial<ExecutorConfig> = {}) {
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config };

    if (this.config.llm) {
      this.llmClient = new OllamaClient({
        baseUrl: this.config.llm.baseUrl,
        model: this.config.llm.model,
        temperature: this.config.llm.temperature,
      });
    }
  }

  /**
   * 执行技能
   * 主要入口方法
   */
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    // 优先使用 LLM 执行
    if (this.llmClient) {
      return this.executeWithLLM(context);
    }

    // 回退到规则执行器
    return this.executeWithRules(context);
  }

  /**
   * 使用 LLM 执行
   */
  private async executeWithLLM(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const prompt = this.buildPrompt(context);
    let lastError: Error | null = null;

    // 重试逻辑
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.callLLM(prompt);

        if (this.config.verbose) {
          console.log(`[SkillExecutor] LLM response: ${response.substring(0, 200)}...`);
        }

        const parsed = ActionBlockParser.parseFullResponse(response);

        return {
          action: parsed.action,
          success: true,
          memoryIndex: parsed.memoryIndex,
          memoryContent: parsed.memoryContent,
          reasoning: parsed.reasoning,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (this.config.verbose) {
          console.error(`[SkillExecutor] Attempt ${attempt + 1} failed:`, lastError.message);
        }

        // 指数退避
        if (attempt < this.config.maxRetries) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    // 所有重试失败，回退到规则执行器
    console.warn('[SkillExecutor] LLM execution failed, falling back to rule-based executor');
    return this.executeWithRules(context);
  }

  /**
   * 使用规则执行器执行
   */
  private executeWithRules(context: SkillExecutionContext): SkillExecutionResult {
    return DefaultRuleExecutor.execute(context);
  }

  /**
   * 调用 LLM
   */
  private async callLLM(prompt: string): Promise<string> {
    if (!this.llmClient) {
      throw new Error('LLM client not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await this.llmClient.chat(
        [
          {
            role: 'system',
            content: `你是一个记忆技能执行助手。根据给定的任务和上下文，
确定需要执行的记忆操作并返回结果。

可用操作:
- INSERT: 插入新记忆
- UPDATE: 更新现有记忆
- DELETE: 删除记忆
- NOOP: 不执行任何操作

返回格式:
ACTION: <操作类型>
REASONING: <执行理由>
INDEX: <可选，记忆索引>
CONTENT: <可选，新记忆内容>`,
          },
          { role: 'user', content: prompt },
        ],
        {
          temperature: this.config.llm?.temperature ?? 0.3,
        }
      );

      return response.response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 构建提示词
   */
  private buildPrompt(context: SkillExecutionContext): string {
    const memoriesSection = context.retrievedMemories.length > 0
      ? `相关记忆:\n${context.retrievedMemories.map((m, i) => `[${i}]: ${m}`).join('\n')}`
      : '无相关记忆';

    const skillsSection = context.selectedSkills.length > 0
      ? `已选技能: ${context.selectedSkills.join(', ')}`
      : '无特定技能';

    return `任务: ${context.task}
输入: ${context.input || ''}
${memoriesSection}
${skillsSection}
会话ID: ${context.sessionId}
${context.metadata ? `额外信息: ${JSON.stringify(context.metadata)}` : ''}

请分析上述信息，确定需要执行的记忆操作。`;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 检查 LLM 是否可用
   */
  async isLLMAvailable(): Promise<boolean> {
    if (!this.llmClient) return false;
    return this.llmClient.isAvailable();
  }

  /**
   * 获取配置
   */
  getConfig(): ExecutorConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ExecutorConfig>): void {
    this.config = { ...this.config, ...config };

    // 如果新增了 LLM 配置，重新创建客户端
    if (this.config.llm && !this.llmClient) {
      this.llmClient = new OllamaClient({
        baseUrl: this.config.llm.baseUrl,
        model: this.config.llm.model,
        temperature: this.config.llm.temperature,
      });
    }
  }
}

/**
 * 创建技能执行器
 */
export function createSkillExecutor(config?: Partial<ExecutorConfig>): SkillExecutor {
  return new SkillExecutor(config);
}

/**
 * 创建自定义执行器
 * 用于注册到 SkillController
 */
export function createCustomExecutor(
  executorFn: (context: SkillExecutionContext, memories: string[]) => Promise<SkillExecutionResult>
): SkillExecutor {
  return new SkillExecutor();
}
