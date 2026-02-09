/**
 * useCampfireSession - 篝火专注会话管理 Hook
 *
 * 核心功能：
 * 1. 管理 Gemini Live 连接生命周期
 * 2. 超时 → 自动断开
 * 3. 上下文管理（消息历史、摘要）
 * 4. 闲聊计数
 *
 * 连接策略：
 * - 空闲超时后断开 Gemini（节省配额）
 * - 用户通过手动按钮唤醒 Lumi 重连
 * - 重连时注入上下文，让 AI 能接上之前的对话
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useGeminiLive, fetchGeminiToken } from '../gemini-live';
import { useSessionContext } from '../useSessionContext';
import { useAmbientAudio } from './useAmbientAudio';
import { useFocusTimer } from './useFocusTimer';

// ============================================================================
// Types
// ============================================================================

type SessionStatus =
  | 'idle'          // 待机（未开始）
  | 'starting'      // 正在开始会话
  | 'focusing'      // 专注中（Gemini 可能断开）
  | 'connecting'    // 正在连接 Gemini
  | 'active'        // 对话中（Gemini 已连接）
  | 'ending'        // 正在结束会话
  | 'ended';        // 已结束

interface UseCampfireSessionOptions {
  /** 用户 ID */
  userId: string;
  /** AI 语气偏好 */
  aiTone?: 'gentle' | 'direct' | 'humorous' | 'tough_love';
  /** 语言 */
  language?: string;
  /** 无对话超时时间（秒），超时后断开 Gemini */
  idleTimeout?: number;
  /** 会话结束回调 */
  onSessionEnd?: (stats: SessionStats) => void;
}

interface SessionStats {
  sessionId: string;
  taskDescription: string | null;
  durationSeconds: number;
  chatCount: number;
}

interface UseCampfireSessionReturn {
  // 状态
  status: SessionStatus;
  sessionId: string | null;
  taskDescription: string | null;
  error: string | null;
  
  // Gemini 状态
  isConnected: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  
  // 计时
  elapsedSeconds: number;
  formattedTime: string;
  
  // 统计
  chatCount: number;
  
  // 白噪音
  isAmbientPlaying: boolean;
  toggleAmbient: () => void;
  
  // 动作
  startSession: (taskDescription?: string) => Promise<void>;
  endSession: () => Promise<SessionStats | null>;
  setTaskDescription: (task: string) => void;

  // 手动唤醒
  wakeUpLumi: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const IDLE_TIMEOUT_DEFAULT = 30; // 默认 30 秒无对话断开

// ============================================================================
// Hook
// ============================================================================

export function useCampfireSession(options: UseCampfireSessionOptions): UseCampfireSessionReturn {
  const {
    userId,
    aiTone = 'gentle',
    language = 'zh',
    idleTimeout = IDLE_TIMEOUT_DEFAULT,
    onSessionEnd,
  } = options;

  // ==========================================
  // State
  // ==========================================
  
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [taskDescription, setTaskDescription] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatCount, setChatCount] = useState(0);

  // 上下文管理（通用 hook）
  const sessionContext = useSessionContext({ maxMessages: 10 });

  // 计时器引用
  const idleTimerRef = useRef<number | null>(null);
  const reconnectLockRef = useRef(false);
  const hasGreetedRef = useRef(false); // 是否已发送过开场白

  // ==========================================
  // Sub-hooks
  // ==========================================

  // 专注计时
  const focusTimer = useFocusTimer();

  // 白噪音
  const ambientAudio = useAmbientAudio({
    normalVolume: 0.5,
    duckedVolume: 0.1,
  });

  // Gemini Live
  const geminiLive = useGeminiLive({
    enableMicrophone: true,
    enableCamera: false,
    onTranscriptUpdate: (transcript) => {
      // 更新上下文消息
      sessionContext.updateFromTranscript(transcript);
    },
  });

  // ==========================================
  // AI 说话时降低白噪音
  // ==========================================
  
  useEffect(() => {
    ambientAudio.setDucked(geminiLive.isSpeaking);
  }, [geminiLive.isSpeaking, ambientAudio]);

  // ==========================================
  // 空闲计时器管理
  // ==========================================

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const disconnectGemini = useCallback(() => {
    clearIdleTimer();
    geminiLive.disconnect();
    setStatus('focusing');
    console.log('🔌 [Campfire] Disconnected from Gemini, back to focusing');
  }, [geminiLive, clearIdleTimer]);

  const startIdleTimer = useCallback(() => {
    clearIdleTimer();
    
    idleTimerRef.current = window.setTimeout(() => {
      console.log('🕐 [Campfire] Idle timeout, disconnecting Gemini...');
      disconnectGemini();
    }, idleTimeout * 1000);
  }, [idleTimeout, clearIdleTimer, disconnectGemini]);

  // ==========================================
  // Gemini 连接管理
  // ==========================================

  const connectGemini = useCallback(async (isReconnect: boolean = false) => {
    if (reconnectLockRef.current) {
      console.log('🔒 [Campfire] Reconnect locked, skipping...');
      return;
    }

    reconnectLockRef.current = true;
    setStatus('connecting');
    setError(null);

    try {
      console.log(`🔌 [Campfire] ${isReconnect ? 'Reconnecting' : 'Connecting'} to Gemini...`);

      // 1. 获取 Gemini Token
      console.log('🔑 [Campfire] Fetching Gemini token...');
      const token = await fetchGeminiToken();
      console.log('✅ [Campfire] Got Gemini token');

      // 2. 获取 System Prompt
      console.log('📡 [Campfire] Fetching config from Edge Function...');
      const configResponse = await fetch(`${SUPABASE_URL}/functions/v1/start-campfire-focus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          userId,
          sessionId: sessionId || undefined,
          taskDescription,
          context: isReconnect ? sessionContext.getContext() : undefined,
          isReconnect,
          aiTone,
          language,
        }),
      });

      if (!configResponse.ok) {
        const errorText = await configResponse.text();
        console.error('❌ [Campfire] Edge Function error:', configResponse.status, errorText);
        throw new Error(`Failed to get config: ${configResponse.status} - ${errorText}`);
      }

      const config = await configResponse.json();
      console.log('✅ [Campfire] Got config:', { sessionId: config.sessionId, hasPrompt: !!config.geminiConfig?.systemPrompt });
      
      // 更新 sessionId（首次连接时）
      if (!sessionId && config.sessionId) {
        setSessionId(config.sessionId);
      }

      // 3. 连接 Gemini Live
      console.log('🌐 [Campfire] Connecting to Gemini Live WebSocket...');
      await geminiLive.connect(
        config.geminiConfig?.systemPrompt || '',
        [],
        token,
        config.geminiConfig?.voiceConfig?.voiceName || 'Aoede'
      );
      console.log('✅ [Campfire] Gemini Live connected!');

      setStatus('active');
      
      // 获取有效的 sessionId（可能是新创建的或已有的）
      const effectiveSessionId = sessionId || config.sessionId;
      
      setChatCount(prev => {
        const newCount = prev + 1;

        // 异步更新数据库中的 chatCount
        if (effectiveSessionId) {
          fetch(`${SUPABASE_URL}/functions/v1/update-focus-session`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              sessionId: effectiveSessionId,
              incrementChatCount: true,
            }),
          }).catch(err => {
            console.warn('Failed to update chat count:', err);
          });
        }

        return newCount;
      });
      startIdleTimer();

      console.log('✅ [Campfire] Connected to Gemini');

    } catch (err) {
      console.error('❌ [Campfire] Connection failed:', err);
      setError((err as Error).message);
      setStatus('focusing'); // 回到专注状态
    } finally {
      reconnectLockRef.current = false;
    }
  }, [userId, sessionId, taskDescription, aiTone, language, geminiLive, startIdleTimer]);

  // ==========================================
  // 手动唤醒 Lumi（替代 VAD 自动重连）
  // ==========================================

  const wakeUpLumi = useCallback(() => {
    if (status !== 'focusing' || reconnectLockRef.current) return;
    console.log('🔥 [Campfire] Wake up Lumi! 用户手动重连...');
    connectGemini(true);
  }, [status, connectGemini]);

  // ==========================================
  // 对话活动重置空闲计时器
  // ==========================================

  useEffect(() => {
    // 用户说话或 AI 说话时重置计时器
    if (status === 'active' && (geminiLive.isRecording || geminiLive.isSpeaking)) {
      startIdleTimer();
    }
  }, [status, geminiLive.isRecording, geminiLive.isSpeaking, startIdleTimer]);

  // ==========================================
  // 首次连接成功时发送开场白触发
  // ==========================================

  useEffect(() => {
    // 只在首次连接成功时触发
    if (geminiLive.isConnected && !hasGreetedRef.current && status === 'active') {
      hasGreetedRef.current = true;
      
      // 延迟 500ms 确保麦克风已启动
      setTimeout(() => {
        console.log('💬 [Campfire] Sending initial greeting trigger...');
        geminiLive.sendTextMessage('[用户刚进入篝火模式，请按开场指南打招呼]');
      }, 500);
    }
  }, [geminiLive.isConnected, status, geminiLive]);

  // ==========================================
  // AI 说完话检测
  // ==========================================

  const wasSpeakingRef = useRef(false);

  useEffect(() => {
    const justStoppedSpeaking = wasSpeakingRef.current && !geminiLive.isSpeaking;
    wasSpeakingRef.current = geminiLive.isSpeaking;

    if (justStoppedSpeaking && status === 'active') {
      // AI 说完了，开始空闲计时
      startIdleTimer();
    }
  }, [geminiLive.isSpeaking, status, startIdleTimer]);

  // ==========================================
  // Public Actions
  // ==========================================

  // 开始会话
  const startSession = useCallback(async (task?: string) => {
    if (status !== 'idle') {
      console.warn('[Campfire] Session already started');
      return;
    }

    console.log('🔥 [Campfire] Starting session...');
    setStatus('starting');
    setError(null);

    if (task) {
      setTaskDescription(task);
    }

    // 重置上下文
    sessionContext.reset();
    hasGreetedRef.current = false; // 重置开场白标记

    try {
      // 1. 开始计时
      focusTimer.start();
      console.log('⏱️ [Campfire] Timer started');

      // 3. 播放白噪音
      ambientAudio.play();
      console.log('🔊 [Campfire] Ambient audio started');

      // 4. 连接 Gemini（首次）
      console.log('🔌 [Campfire] Connecting to Gemini...');
      await connectGemini(false);
      console.log('✅ [Campfire] Session started successfully!');

    } catch (err) {
      console.error('❌ [Campfire] Failed to start session:', err);
      setError((err as Error).message);
      setStatus('idle');
    }
  }, [status, focusTimer, ambientAudio, connectGemini]);

  // 结束会话
  const endSession = useCallback(async (): Promise<SessionStats | null> => {
    if (status === 'idle' || status === 'ended') {
      return null;
    }

    setStatus('ending');

    // 停止计时
    focusTimer.stop();

    // 停止白噪音
    ambientAudio.stop();

    // 断开 Gemini
    geminiLive.disconnect();

    // 清理计时器
    clearIdleTimer();

    const stats: SessionStats = {
      sessionId: sessionId || '',
      taskDescription,
      durationSeconds: focusTimer.elapsedSeconds,
      chatCount,
    };

    // 更新数据库（使用 Edge Function）
    if (sessionId) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/update-focus-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            sessionId,
            durationSeconds: stats.durationSeconds,
            endSession: {
              status: 'completed',
              endedAt: new Date().toISOString(),
            },
            metadata: {
              summary: sessionContext.getContext().summary,
              topics: sessionContext.getContext().topics,
            },
          }),
        });
      } catch (err) {
        console.error('Failed to update session:', err);
      }
    }

    setStatus('ended');
    onSessionEnd?.(stats);

    return stats;
  }, [
    status, sessionId, taskDescription, chatCount,
    focusTimer, ambientAudio, geminiLive,
    clearIdleTimer, onSessionEnd
  ]);

  // ==========================================
  // Cleanup
  // ==========================================

  useEffect(() => {
    return () => {
      clearIdleTimer();
    };
  }, [clearIdleTimer]);

  // ==========================================
  // Return
  // ==========================================

  return {
    // 状态
    status,
    sessionId,
    taskDescription,
    error,

    // Gemini 状态
    isConnected: geminiLive.isConnected,
    isSpeaking: geminiLive.isSpeaking,
    isListening: geminiLive.isRecording,

    // 计时
    elapsedSeconds: focusTimer.elapsedSeconds,
    formattedTime: focusTimer.formattedTime,

    // 统计
    chatCount,

    // 白噪音
    isAmbientPlaying: ambientAudio.isPlaying,
    toggleAmbient: ambientAudio.toggle,

    // 动作
    startSession,
    endSession,
    setTaskDescription,

    // 手动唤醒
    wakeUpLumi,
  };
}

export default useCampfireSession;
