/**
 * SkillRunnable - 技能适配器
 *
 * 将现有 SkillDefinition 适配为 Runnable 接口
 * 与 skills/ 模块整合
 *
 * @author PAI
 * @version 1.0.0
 */

import type { RunnableConfig, RunnableInterface } from './types.js';
import { Runnable } from './Runnable.js';
import type {
  SkillDefinition,
  SkillInstance,
  SkillExecutionContext,
  SkillExecutionResult,
} from '../skills/types.js';

/**
 * SkillRunnableConfig - SkillRunnable 配置
 */
export interface SkillRunnableConfig {
  /** 技能定义 */
  skill: SkillDefinition;
  /** 技能实例（可选） */
  instance?: SkillInstance;
  /** 执行器函数（可选） */
  executor?: SkillExecutorFunc;
  /** 名称 */
  name?: string;
  /** 描述 */
  description?: string;
}

/**
 * SkillExecutorFunc - 技能执行器函数类型
 */
export type SkillExecutorFunc = (
  context: SkillExecutionContext,
  memories: string[]
) => Promise<SkillExecutionResult>;

/**
 * SkillInput - SkillRunnable 输入类型
 */
export interface SkillInput {
  /** 任务描述 */
  task: string;
  /** 输入内容（可选） */
  input?: string;
  /** 上下文 */
  context?: Record<string, unknown>;
  /** 记忆内容 */
  memories?: string[];
}

/**
 * SkillOutput - SkillRunnable 输出类型
 */
export interface SkillOutput {
  /** 任务是否成功 */
  success: boolean;
  /** 输出内容 */
  output?: string;
  /** 记忆内容（如果有更新） */
  memoryContent?: string;
  /** 推理过程 */
  reasoning?: string;
  /** 执行元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * SkillRunnable - 技能适配器
 *
 * 将 SkillDefinition 适配为 Runnable 接口
 *
 * @example
 * ```typescript
 * // 创建 SkillRunnable
 * const skillRunnable = new SkillRunnable({
 *   skill: skillDefinition,
 *   executor: async (context, memories) => {
 *     // 自定义执行逻辑
 *     return {
 *       action: 'INSERT',
 *       success: true,
 *       memoryContent: processTask(context.task)
 *     };
 *   }
 * });
 *
 * // 作为 Runnable 使用
 * const result = await skillRunnable.invoke({
 *   task: "分析这段代码",
 *   input: "function hello() {}",
 *   memories: []
 * });
 * ```
 */
export class SkillRunnable extends Runnable<SkillInput, SkillOutput> {
  private skill: SkillDefinition;
  private instance?: SkillInstance;
  private executor?: SkillExecutorFunc;

  constructor(config: SkillRunnableConfig) {
    super({
      name: config.name ?? config.skill.id,
      description: config.description ?? config.skill.description,
    });
    this.skill = config.skill;
    this.instance = config.instance;
    this.executor = config.executor;
  }

  /**
   * 单次执行 - 执行技能
   */
  async invoke(input: SkillInput, config?: RunnableConfig): Promise<SkillOutput> {
    // 创建执行上下文
    const context: SkillExecutionContext = {
      task: input.task,
      input: input.input,
      retrievedMemories: input.memories ?? [],
      selectedSkills: [this.skill.id],
      sessionId: (config?.metadata?.sessionId as string) ?? crypto.randomUUID(),
      metadata: {
        ...input.context,
        ...config?.metadata,
        skillId: this.skill.id,
        skillName: this.skill.name,
      },
    };

    // 执行技能
    if (this.executor) {
      // 使用自定义执行器
      const result = await this.executor(context, input.memories ?? []);
      return this.mapExecutionResult(result);
    }

    // 使用默认执行逻辑
    return this.defaultExecute(context, input.memories ?? []);
  }

  /**
   * 流式执行 - 暂不支持，返回单次结果
   */
  async *stream(input: SkillInput, config?: RunnableConfig): AsyncGenerator<SkillOutput, void, unknown> {
    const result = await this.invoke(input, config);
    yield result;
  }

  /**
   * 批量执行
   */
  async batch(inputs: SkillInput[], config?: RunnableConfig): Promise<SkillOutput[]> {
    return Promise.all(inputs.map(input => this.invoke(input, config)));
  }

  /**
   * 获取技能定义
   */
  getSkill(): SkillDefinition {
    return this.skill;
  }

  /**
   * 获取技能实例
   */
  getInstance(): SkillInstance | undefined {
    return this.instance;
  }

  /**
   * 创建 SkillRunnable 的工厂方法
   */
  static fromSkill(
    skill: SkillDefinition,
    options?: {
      instance?: SkillInstance;
      executor?: SkillExecutorFunc;
    }
  ): SkillRunnable {
    return new SkillRunnable({
      skill,
      instance: options?.instance,
      executor: options?.executor,
    });
  }

  /**
   * 创建多个 SkillRunnable
   */
  static fromSkills(
    skills: SkillDefinition[],
    options?: {
      executor?: SkillExecutorFunc;
    }
  ): SkillRunnable[] {
    return skills.map(skill =>
      SkillRunnable.fromSkill(skill, { executor: options?.executor })
    );
  }

  /**
   * 默认执行逻辑
   */
  private async defaultExecute(
    context: SkillExecutionContext,
    memories: string[]
  ): Promise<SkillOutput> {
    // 如果有工作流，执行工作流
    if (this.skill.workflow && this.skill.workflow.length > 0) {
      return this.executeWorkflow(context, memories);
    }

    // 否则返回默认结果
    return {
      success: true,
      output: `Skill ${this.skill.name} executed`,
      reasoning: `Executed skill: ${this.skill.description}`,
      metadata: {
        skillId: this.skill.id,
        skillName: this.skill.name,
        workflow: false,
      },
    };
  }

  /**
   * 执行工作流
   */
  private async executeWorkflow(
    context: SkillExecutionContext,
    memories: string[]
  ): Promise<SkillOutput> {
    const workflowSteps: string[] = [];
    let memoryContent = memories.join('\n');

    for (const step of this.skill.workflow!) {
      workflowSteps.push(`Step ${step.order}: ${step.name}`);

      // 简单的占位执行
      if (step.name.toLowerCase().includes('process')) {
        memoryContent += `\n[Processed: ${context.task}]`;
      }
    }

    return {
      success: true,
      output: workflowSteps.join('\n'),
      memoryContent,
      reasoning: `Executed ${this.skill.workflow!.length} workflow steps`,
      metadata: {
        skillId: this.skill.id,
        workflow: true,
        stepCount: this.skill.workflow!.length,
      },
    };
  }

  /**
   * 将执行结果映射为 SkillOutput
   */
  private mapExecutionResult(result: SkillExecutionResult): SkillOutput {
    return {
      success: result.success,
      output: result.memoryContent,
      memoryContent: result.memoryContent,
      reasoning: result.reasoning,
      metadata: {
        action: result.action,
        memoryIndex: result.memoryIndex,
      },
    };
  }
}

/**
 * SkillRunnableSequence - 技能顺序链
 *
 * 将多个技能按顺序执行
 *
 * @example
 * ```typescript
 * const sequence = new SkillRunnableSequence([
 *   skillRunnable1,
 *   skillRunnable2,
 *   skillRunnable3
 * ]);
 *
 * const result = await sequence.invoke({
 *   task: "复杂任务",
 *   memories: []
 * });
 * ```
 */
export class SkillRunnableSequence extends Runnable<SkillInput, SkillOutput> {
  private runnables: SkillRunnable[];

  constructor(runnables: SkillRunnable[]) {
    super({ name: 'SkillRunnableSequence' });
    this.runnables = runnables;
  }

  async invoke(input: SkillInput, config?: RunnableConfig): Promise<SkillOutput> {
    let currentMemories = input.memories ?? [];
    let lastOutput: SkillOutput | undefined;

    for (const runnable of this.runnables) {
      lastOutput = await runnable.invoke(
        {
          ...input,
          memories: currentMemories,
        },
        config
      );

      // 更新记忆
      if (lastOutput.memoryContent) {
        currentMemories = [...currentMemories, lastOutput.memoryContent];
      }

      // 如果失败则停止
      if (!lastOutput.success) {
        return lastOutput;
      }
    }

    return lastOutput!;
  }

  /**
   * 添加技能到序列
   */
  add(runnable: SkillRunnable): SkillRunnableSequence {
    return new SkillRunnableSequence([...this.runnables, runnable]);
  }

  /**
   * 获取序列长度
   */
  get length(): number {
    return this.runnables.length;
  }
}

/**
 * createSkillRunnable - 创建 SkillRunnable 的便捷工厂函数
 */
export function createSkillRunnable(
  skill: SkillDefinition,
  options?: {
    instance?: SkillInstance;
    executor?: SkillExecutorFunc;
  }
): SkillRunnable {
  return SkillRunnable.fromSkill(skill, options);
}

export default SkillRunnable;
