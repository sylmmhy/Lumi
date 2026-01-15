/**
 * userStateTools - 用户状态报告工具定义
 *
 * 定义 reportUserState 工具，让 AI 在每次回复前通过 Function Calling
 * 报告用户的情绪状态（抗拒/配合/中性）
 *
 * 这比依赖 [RESIST] 文本标记更可靠，因为：
 * 1. Function Calling 是 Gemini Live 原生支持的机制
 * 2. 工具调用在语音回复之前触发，时序可控
 * 3. 结构化数据，不会被流式响应截断
 */
import type { FunctionDeclaration } from '@google/genai';
import { Type } from '@google/genai';

// ============================================
// 类型定义
// ============================================

/**
 * 用户状态类型
 *
 * resisting: 用户正在抗拒（找借口、拒绝、消极）
 * cooperating: 用户正在配合（同意、行动、积极）
 * neutral: 状态不明确或无关问题
 */
export type UserState = 'resisting' | 'cooperating' | 'neutral';

// ============================================
// 工具定义
// ============================================

/**
 * reportUserState 工具声明
 *
 * AI 必须在每次回复前调用此工具报告用户状态
 * 这是一个"观察型"工具，用于状态追踪而非执行操作
 */
export const reportUserStateDeclaration: FunctionDeclaration = {
  name: 'reportUserState',
  description: `Report the user's current emotional state before responding.
Call this function BEFORE every response to indicate whether the user is resisting, cooperating, or neutral.
- resisting: User is making excuses, refusing, deflecting, or showing negative attitude toward the task
- cooperating: User is agreeing, taking action, or showing positive engagement
- neutral: User's state is unclear or they're asking unrelated questions`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      state: {
        type: Type.STRING,
        description: 'The detected user state',
        enum: ['resisting', 'cooperating', 'neutral'],
      },
      reason: {
        type: Type.STRING,
        description: 'Brief reason for this classification (for debugging, keep under 50 chars)',
      },
    },
    required: ['state'],
  },
};

/**
 * 所有用户状态相关的工具声明
 * 可以在此数组中添加更多相关工具
 */
export const userStateTools: FunctionDeclaration[] = [
  reportUserStateDeclaration,
];

export default userStateTools;
