/**
 * Edge Module - 边缘计算与云边协同
 *
 * 基于 CAMPHOR 论文和云边端专利设计
 *
 * @author PAI
 */

import { EdgeAgent, createEdgeAgent } from './EdgeAgent.js';
import { EdgeCoordinator } from './EdgeCoordinator.js';
import { TaskOffloader } from './TaskOffloader.js';
import { PromptCompressor, createPromptCompressor } from './PromptCompressor.js';

export { EdgeAgent, createEdgeAgent };
export { EdgeCoordinator };
export { TaskOffloader };
export { PromptCompressor, createPromptCompressor };

export type {
  EdgeAgentConfig,
  EdgeAgentType,
  EdgeTask,
  EdgeResult,
  OffloadStrategy,
  CompressionConfig,
  ComputeTier,
  OffloadDecision,
} from './types.js';

/**
 * 快速创建边缘系统
 */
export function createEdgeSystem(options: {
  defaultTier?: 'cloud' | 'edge' | 'device';
  offloadStrategy?: 'cloud_only' | 'edge_only' | 'cloud_first' | 'edge_first' | 'dynamic';
  compressionMethod?: 'token' | 'summary' | 'hybrid';
} = {}) {
  const {
    defaultTier = 'edge',
    offloadStrategy = 'dynamic',
    compressionMethod = 'token',
  } = options;

  const coordinator = new EdgeCoordinator({ defaultTier });
  const offloader = new TaskOffloader({ strategy: offloadStrategy, tier: defaultTier });
  const compressor = createPromptCompressor(compressionMethod);

  return {
    coordinator,
    offloader,
    compressor,
  };
}
