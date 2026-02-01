/**
 * AI Tools - 三层 AI 架构工具系统
 * 
 * 架构：
 * - AI #1: Gemini Live 2.5 (实时语音对话)
 * - AI #2: Gemini Flash (意图检测) ← useIntentDetection
 * - AI #3: Gemini 3 Flash (分析执行) ← toolHandlers
 */

// 工具定义
export {
  aiTools,
  habitTools,
  reportTools,
  suggestHabitStackTool,
  getDailyReportTool,
  createHabitStackTool,
} from './toolDefinitions';

export type {
  ToolCallResult,
  ToolCallHandler,
  ToolCallContext,
} from './toolDefinitions';

// 工具处理器 (AI #3)
export {
  handleToolCall,
  handleSuggestHabitStack,
  handleGetDailyReport,
  handleCreateHabitStack,
} from './toolHandlers';

// 意图检测 Hook (AI #2)
export { useIntentDetection } from './useIntentDetection';
export type { DetectIntentResult, LastSuggestion } from './useIntentDetection';

// 旧的 Hook（保留兼容，但推荐使用 useIntentDetection）
export { useAITools } from './useAITools';
