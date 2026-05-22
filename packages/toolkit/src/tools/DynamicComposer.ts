/**
 * DynamicComposer - 动态组合器
 * 根据需求动态组合工具
 */
import type {
  AgentTool,
  ToolComposition,
  ToolRequirement,
  ExecutionResult,
  ToolResult,
  ExecutionCondition,
} from './types.js';
import { ToolRegistry } from './ToolRegistry.js';

export class DynamicComposer {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  /**
   * 根据需求组合工具
   */
  async compose(requirements: ToolRequirement[]): Promise<ToolComposition | null> {
    const selectedTools: AgentTool[] = [];

    for (const req of requirements) {
      // 搜索工具
      const candidates = this.registry.search(req.name);

      // 过滤匹配需求的工具
      const matched = candidates.filter(tool => {
        // 分类匹配
        if (req.category && tool.category !== req.category) {
          return false;
        }

        // 必须包含的标签
        if (req.mustHave) {
          const toolTags = new Set(tool.tags || []);
          for (const tag of req.mustHave) {
            if (!toolTags.has(tag)) {
              return false;
            }
          }
        }

        return true;
      });

      if (matched.length > 0) {
        selectedTools.push(matched[0]);
      }
    }

    if (selectedTools.length === 0) {
      return null;
    }

    // 创建组合
    return {
      id: `composition_${Date.now()}`,
      name: requirements.map(r => r.name).join(' + '),
      description: `Auto-composed from requirements: ${requirements.map(r => r.name).join(', ')}`,
      tools: selectedTools,
      executionOrder: selectedTools.length > 1 ? 'sequential' : 'sequential',
    };
  }

  /**
   * 执行组合
   */
  async execute(
    composition: ToolComposition,
    input: unknown,
    context?: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const results: ToolResult[] = [];

    let currentInput = input;
    let success = true;
    let error: string | undefined;

    try {
      if (composition.executionOrder === 'sequential') {
        // 顺序执行
        for (const tool of composition.tools) {
          const result = await this.registry.execute(
            tool.id,
            currentInput,
            context as any
          );
          results.push(result);

          if (!result.success) {
            if (composition.onError?.strategy === 'stop') {
              success = false;
              error = result.error;
              break;
            } else if (composition.onError?.strategy === 'fallback' && composition.onError.fallbackToolId) {
              // 使用备用工具
              const fallbackResult = await this.registry.execute(
                composition.onError.fallbackToolId,
                currentInput,
                context as any
              );
              results.push(fallbackResult);
              if (!fallbackResult.success) {
                success = false;
                error = fallbackResult.error;
              }
            } else if (composition.onError?.strategy === 'continue') {
              continue;
            }
          } else {
            // 将结果传递给下一个工具
            currentInput = result.data;
          }
        }
      } else if (composition.executionOrder === 'parallel') {
        // 并行执行
        const promises = composition.tools.map(tool =>
          this.registry.execute(tool.id, currentInput, context as any)
        );
        const parallelResults = await Promise.all(promises);
        results.push(...parallelResults);

        // 检查是否有失败
        const hasFailure = parallelResults.some(r => !r.success);
        if (hasFailure) {
          success = false;
          error = 'Some tools failed in parallel execution';
        }
      }
    } catch (e) {
      success = false;
      error = e instanceof Error ? e.message : 'Unknown error';
    }

    return {
      compositionId: composition.id,
      results,
      totalTime: Date.now() - startTime,
      success,
      error,
    };
  }

  /**
   * 优化组合
   */
  async optimize(composition: ToolComposition): Promise<ToolComposition> {
    // 简单优化：去除重复工具，保持唯一
    const uniqueTools = composition.tools.filter(
      (tool, index, self) => index === self.findIndex(t => t.id === tool.id)
    );

    return {
      ...composition,
      tools: uniqueTools,
    };
  }

  /**
   * 从模板创建组合
   */
  createFromTemplate(
    templateId: string,
    toolReplacements?: Record<string, string>
  ): ToolComposition | null {
    const templates = this.getTemplates();
    const template = templates[templateId];

    if (!template) return null;

    const tools: AgentTool[] = [];
    for (const toolId of template.toolIds) {
      const replacementId = toolReplacements?.[toolId];
      const actualId = replacementId || toolId;
      const tool = this.registry.get(actualId);
      if (tool) {
        tools.push(tool);
      }
    }

    if (tools.length === 0) return null;

    return {
      id: `composition_${Date.now()}`,
      name: template.name,
      description: template.description,
      tools,
      executionOrder: template.executionOrder,
    };
  }

  /**
   * 获取预设模板
   */
  private getTemplates(): Record<string, {
    name: string;
    description: string;
    toolIds: string[];
    executionOrder: 'sequential' | 'parallel' | 'conditional';
  }> {
    return {
      'research-analysis': {
        name: 'Research & Analysis',
        description: 'Research topic then analyze findings',
        toolIds: ['search', 'analyze'],
        executionOrder: 'sequential',
      },
      'code-review': {
        name: 'Code Review',
        description: 'Generate code then review it',
        toolIds: ['code-generator', 'code-reviewer'],
        executionOrder: 'sequential',
      },
      'test-generate': {
        name: 'Test Generation',
        description: 'Generate code then create tests',
        toolIds: ['code-generator', 'test-generator'],
        executionOrder: 'sequential',
      },
    };
  }

  /**
   * 条件执行
   */
  async executeConditional(
    composition: ToolComposition,
    input: unknown,
    conditions: ExecutionCondition[],
    context?: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const results: ToolResult[] = [];

    let currentInput = input;
    let currentToolIndex = 0;
    let success = true;
    let error: string | undefined;

    while (currentToolIndex < composition.tools.length) {
      const tool = composition.tools[currentToolIndex];
      const result = await this.registry.execute(
        tool.id,
        currentInput,
        context as any
      );
      results.push(result);

      if (!result.success) {
        success = false;
        error = result.error;
        break;
      }

      // 检查条件
      const condition = conditions.find(c => c.toolId === tool.id);
      if (condition && condition.nextToolId) {
        // 评估条件
        const shouldContinue = this.evaluateCondition(condition, result.data);
        if (!shouldContinue) {
          break;
        }
        // 跳转到指定工具
        const nextIndex = composition.tools.findIndex(t => t.id === condition.nextToolId);
        if (nextIndex !== -1) {
          currentToolIndex = nextIndex;
        } else {
          currentToolIndex++;
        }
      } else {
        currentToolIndex++;
      }

      currentInput = result.data;
    }

    return {
      compositionId: composition.id,
      results,
      totalTime: Date.now() - startTime,
      success,
      error,
    };
  }

  private evaluateCondition(condition: ExecutionCondition, data: unknown): boolean {
    const value = data as Record<string, unknown>;
    const checkValue = condition.value;

    switch (condition.operator) {
      case 'equals':
        return value.result === checkValue;
      case 'not_equals':
        return value.result !== checkValue;
      case 'contains':
        return JSON.stringify(value).includes(String(checkValue));
      case 'greater_than':
        return Number(value.result) > Number(checkValue);
      case 'less_than':
        return Number(value.result) < Number(checkValue);
      default:
        return true;
    }
  }
}
