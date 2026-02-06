/**
 * AI Coach Session - 类型定义与配置常量
 *
 * 从 useAICoachSession.ts 提取，集中管理所有公共接口和常量
 */

// ==========================================
// 配置常量
// ==========================================

/** 连接超时时间（毫秒） */
export const CONNECTION_TIMEOUT_MS = 15000;

/** 摄像头重试次数 */
export const MAX_CAMERA_RETRIES = 2;

/** 摄像头重试间隔（毫秒） */
export const CAMERA_RETRY_DELAY_MS = 1000;

// ==========================================
// 类型定义
// ==========================================

export interface AICoachMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  isVirtual?: boolean;
}

export interface AICoachSessionState {
  /** 任务描述 */
  taskDescription: string;
  /** 剩余时间（秒） */
  timeRemaining: number;
  /** 计时器是否运行中 */
  isTimerRunning: boolean;
  /** 消息列表 */
  messages: AICoachMessage[];
}

export interface UseAICoachSessionOptions {
  /** 初始倒计时时间（秒），默认 300（5分钟） */
  initialTime?: number;
  /** 倒计时结束时的回调 */
  onCountdownComplete?: () => void;
  /** 是否启用虚拟消息（AI 主动问候），默认 true */
  enableVirtualMessages?: boolean;
  /** 是否启用 VAD（用户说话检测），默认 true */
  enableVAD?: boolean;
}
