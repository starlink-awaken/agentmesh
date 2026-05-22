/**
 * Context 模块 - 上下文窗口动态裁剪
 *
 * @description 提供上下文消息的动态裁剪能力，支持多种策略
 */

export { ContextTrimmer, createContextTrimmer } from './ContextTrimmer.js';

export type {
  TrimConfig,
  TrimStrategy,
  ContextItem,
  TrimResult,
  Tokenizer,
} from './types.js';
