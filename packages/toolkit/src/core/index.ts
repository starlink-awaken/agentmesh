/**
 * Core 模块 - 统一导出
 *
 * @author PAI
 * @version 1.0.0
 */

export { AlgorithmEngine, type AlgorithmConfig } from './AlgorithmEngine.js';
export { ISCGenerator, type ISCGeneratorConfig } from './ISCGenerator.js';
export { CapabilityRouter, type RouterConfig, type CapabilitySelection, type TaskAnalysis } from './CapabilityRouter.js';

export type {
  ISCCriterion,
  AlgorithmPhase,
  AlgorithmContext,
  AlgorithmResult,
  CapabilityType,
  PhaseHandler
} from './types.js';
