/**
 * AI Tools - Gemini Live 2.5 Function Calling 工具系统
 * 
 * 实现 "Live 2.5 对话 + Gemini 3 Flash 决策" 的混合架构
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

// 工具处理器
export {
  handleToolCall,
  handleSuggestHabitStack,
  handleGetDailyReport,
  handleCreateHabitStack,
} from './toolHandlers';

// Hook
export { useAITools } from './useAITools';
