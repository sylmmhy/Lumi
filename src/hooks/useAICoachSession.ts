/**
 * 兼容性 re-export
 *
 * 实际实现已迁移到 ./ai-coach/ 目录
 * 保留此文件是为了不破坏现有的 import 路径
 */
export { useAICoachSession } from './ai-coach';
export type {
  AICoachMessage,
  AICoachSessionState,
  UseAICoachSessionOptions,
} from './ai-coach';
