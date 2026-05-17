import type { AgentMessage, Task } from '../types/index.js';
import { taskManager } from './task-manager.js';
import { router } from './router.js';

interface PipelineStep {
  agentId: string;
  transform?: (input: string) => string;
}

export interface PipelineResult {
  taskIds: string[];
  outputs: Array<{ agentId: string; result?: unknown; error?: string }>;
}

/**
 * AgentPipeline — 串联多个 Agent 依次执行
 * 通过 taskManager.processTask() 委托执行，不重复实现任务生命周期
 */
export class AgentPipeline {
  async execute(steps: PipelineStep[], initialInput: string): Promise<PipelineResult> {
    const taskIds: string[] = [];
    const outputs: PipelineResult['outputs'] = [];
    let currentInput = initialInput;

    for (const step of steps) {
      const input = step.transform ? step.transform(currentInput) : currentInput;

      const message: AgentMessage = {
        id: '', type: 'request', source: 'pipeline', target: step.agentId,
        correlation_id: '', timestamp: Date.now(),
        payload: { task: input },
      };

      // 验证 Agent 可用
      const { agentIds } = router.route(message);
      if (agentIds.length === 0 || !agentIds.includes(step.agentId)) {
        outputs.push({ agentId: step.agentId, error: `Agent ${step.agentId} not available` });
        return { taskIds, outputs };
      }

      // 委托给 TaskManager 执行完整生命周期
      let task: Task;
      try {
        task = await taskManager.processTask(message);
      } catch (err: any) {
        outputs.push({ agentId: step.agentId, error: err.message });
        return { taskIds, outputs };
      }

      taskIds.push(task.id);

      if (task.status === 'completed' && task.result !== undefined) {
        const resultStr = typeof task.result === 'string' ? task.result : JSON.stringify(task.result);
        outputs.push({ agentId: step.agentId, result: task.result });
        currentInput = resultStr;
      } else {
        outputs.push({ agentId: step.agentId, error: task.error?.message || 'Unknown error' });
        break;
      }
    }

    return { taskIds, outputs };
  }
}

export const agentPipeline = new AgentPipeline();
