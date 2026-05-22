/**
 * Architecture 模块 - 统一导出
 *
 * @author PAI
 * @version 1.0.0
 */

export { C4Model } from './C4Model.js';
export type { C4Element, C4Relation, C4ElementType } from './C4Model.js';

export { ADRManager } from './ADRManager.js';
export type { ADRRecord, ADRStatus, ADRSearchOptions } from './ADRManager.js';

export { FormalMethod } from './FormalMethod.js';
export type {
  State,
  Transition,
  Invariant,
  Property,
  FormalMethodType,
} from './FormalMethod.js';
