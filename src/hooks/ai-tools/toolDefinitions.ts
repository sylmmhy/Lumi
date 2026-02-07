/**
 * AI Tools - Gemini Live 2.5 Function Calling 工具定义
 * 
 * 这些工具让 Live 2.5 可以在对话中调用后端服务，
 * 实现 "Live 2.5 对话 + Gemini 3 Flash 决策" 的混合架构
 */

import { Type, type FunctionDeclaration } from '@google/genai';

// ============================================================================
// 工具定义
// ============================================================================

/**
 * 习惯叠加推荐工具
 * 当用户想养成新习惯时，分析并推荐最佳挂载方案
 */
export const suggestHabitStackTool: FunctionDeclaration = {
  name: 'suggest_habit_stack',
  description: `当用户表达想要养成新习惯、培养好习惯、或者询问如何坚持某个习惯时调用此工具。
工具会分析用户已有的稳定习惯（锚点），推荐最佳的习惯叠加方案。

触发示例：
- "我想养成吃维生素的习惯"
- "帮我培养每天运动的习惯"
- "怎么才能坚持冥想"
- "I want to build a habit of reading"
- "How can I stick to exercising"`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      new_habit: {
        type: Type.STRING,
        description: '用户想要养成的新习惯名称，如"吃维生素"、"冥想"、"运动"',
      },
      duration_minutes: {
        type: Type.NUMBER,
        description: '新习惯预计需要的时间（分钟），默认为5分钟',
      },
    },
    required: ['new_habit'],
  },
};

/**
 * 每日报告工具
 * 获取用户的每日目标完成情况报告
 */
export const getDailyReportTool: FunctionDeclaration = {
  name: 'get_daily_report',
  description: `当用户询问自己的进度、完成情况、或想要回顾一天的表现时调用此工具。

触发示例：
- "我今天完成得怎么样"
- "看看我的进度"
- "给我报告一下"
- "How did I do today"
- "Show me my progress"`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      date: {
        type: Type.STRING,
        description: '报告日期，格式为 YYYY-MM-DD，默认为今天',
      },
    },
    required: [],
  },
};

/**
 * 创建习惯叠加工具
 * 用户确认后，创建习惯叠加关系
 */
export const createHabitStackTool: FunctionDeclaration = {
  name: 'create_habit_stack',
  description: `当用户确认要创建习惯叠加时调用。必须在 suggest_habit_stack 返回推荐后，用户明确同意时才调用。

触发示例：
- "好的，就这样设置吧"
- "帮我创建这个提醒"
- "Yes, set it up"
- "Sounds good, let's do it"`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      anchor_task_id: {
        type: Type.STRING,
        description: '锚点任务的 UUID',
      },
      new_habit_title: {
        type: Type.STRING,
        description: '新习惯的名称',
      },
      position: {
        type: Type.STRING,
        enum: ['before', 'after'],
        description: '新习惯相对于锚点的位置',
      },
      reminder_message: {
        type: Type.STRING,
        description: '提醒消息文案',
      },
    },
    required: ['anchor_task_id', 'new_habit_title', 'position'],
  },
};

// ============================================================================
// 工具集合
// ============================================================================

/**
 * 所有可用的 AI 工具
 */
export const aiTools: FunctionDeclaration[] = [
  suggestHabitStackTool,
  getDailyReportTool,
  createHabitStackTool,
];

/**
 * 习惯相关工具（用于特定场景）
 */
export const habitTools: FunctionDeclaration[] = [
  suggestHabitStackTool,
  createHabitStackTool,
];

/**
 * 报告工具（用于特定场景）
 */
export const reportTools: FunctionDeclaration[] = [
  getDailyReportTool,
];

// ============================================================================
// 工具调用处理器类型
// ============================================================================

export interface ToolCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** 给 AI 的自然语言响应提示 */
  responseHint?: string;
}

export interface ToolCallHandler {
  (args: Record<string, unknown>, context: ToolCallContext): Promise<ToolCallResult>;
}

export interface ToolCallContext {
  userId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** 用户首选语言 */
  preferredLanguage?: string;
  /** 会话 ID，用于生成幂等键（防止破坏性工具重复执行） */
  sessionId?: string;
}
