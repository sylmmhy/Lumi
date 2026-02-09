/**
 * AI Coach Session - 会话生命周期 Hook
 *
 * 封装会话的启动、连接、清理、结束流程：
 * - startSession：硬件初始化（摄像头/麦克风）+ 网络请求（system instruction / Gemini token）+ Gemini 连接
 * - cleanup：统一清理（停止计时器 + 断开连接 + 重置状态 + 记录通话时长）
 * - endSession / resetSession / stopAudioImmediately
 * - 竞态保护（sessionEpoch / startSessionInFlight / isCleaningUp）
 * - 通话记录管理（callRecordId）
 * - 组件卸载清理
 *
 * 通过 optionsRef 模式使所有函数引用稳定，避免不必要的重渲染。
 */
import { useRef, useCallback, useEffect } from 'react';
import { fetchGeminiToken } from '../useGeminiLive';
import { getSupabaseClient } from '../../lib/supabase';
import { getVoiceName } from '../../lib/voiceSettings';
import { devError, devLog, devWarn } from '../gemini-live/utils';
import { CONNECTION_TIMEOUT_MS, MAX_CAMERA_RETRIES, CAMERA_RETRY_DELAY_MS } from './types';
import { withTimeout } from './utils';
import type { SuccessRecordForVM } from '../useVirtualMessages';
import type { UseSessionTimerReturn } from './useSessionTimer';
import type { UseTranscriptProcessorReturn } from './useTranscriptProcessor';

/** startSession 的 options 参数 */
export interface StartSessionOptions {
  userId?: string;
  customSystemInstruction?: string;
  userName?: string;
  preferredLanguages?: string[];
  taskId?: string;
  callRecordId?: string;
  /** 是否为重连（重连时会将对话上下文传给后端） */
  isReconnect?: boolean;
  /** 对话模式：coach（目标导向）、daily（陪伴聊天）或 setup（习惯设定 Prompt C） */
  chatMode?: 'coach' | 'daily' | 'setup';
}

/** useSessionLifecycle 的配置 */
export interface UseSessionLifecycleOptions {
  // ---- 子 Hooks ----
  /** Gemini Live 实例 */
  geminiLive: {
    disconnect: () => void;
    connect: (systemInstruction?: string, overrideConfig?: undefined, token?: string, voiceName?: string) => Promise<void>;
    stopAudio: () => void;
    cameraEnabled: boolean;
    toggleCamera: () => Promise<void>;
    isRecording: boolean;
    toggleMicrophone: () => Promise<void>;
    isConnected: boolean;
  };
  /** 篝火模式 */
  campfire: {
    isCampfireMode: boolean;
    stopCampfireResources: () => void;
    savedSystemInstructionRef: React.MutableRefObject<string>;
    cleanupResources: () => void;
  };
  /** 倒计时 */
  timer: UseSessionTimerReturn;
  /** 转录处理 */
  transcript: UseTranscriptProcessorReturn;

  // ---- 配置 ----
  initialTime: number;

  // ---- 连接状态（由主 Hook 管理，通过 setter 修改） ----
  isSessionActive: boolean;
  isConnecting: boolean;
  setIsConnecting: (v: boolean) => void;
  setIsSessionActive: (v: boolean) => void;
  setIsObserving: (v: boolean) => void;
  setConnectionError: (v: string | null) => void;
  setTaskDescription: (v: string) => void;

  // ---- 共享 Refs（由主 Hook 管理） ----
  sessionEpochRef: React.MutableRefObject<number>;
  currentUserIdRef: React.MutableRefObject<string | null>;
  currentTaskDescriptionRef: React.MutableRefObject<string>;
  currentTaskIdRef: React.MutableRefObject<string | null>;
  preferredLanguagesRef: React.MutableRefObject<string[] | null>;
  successRecordRef: React.MutableRefObject<SuccessRecordForVM | null>;

  /** 获取当前对话上下文（用于重连时让 AI "记得"之前聊了什么） */
  getSessionContext?: () => { messages: Array<{ role: 'user' | 'ai'; text: string; timestamp: number }>; summary: string; topics: string[] };
}

export interface UseSessionLifecycleReturn {
  /** 开始 AI 教练会话 */
  startSession: (taskDescription: string, options?: StartSessionOptions) => Promise<boolean>;
  /** 统一清理函数 */
  cleanup: () => void;
  /** 结束 AI 教练会话 */
  endSession: () => void;
  /** 重置会话（结束 + 清空所有状态） */
  resetSession: () => void;
  /** 立即停止音频播放（不断连接） */
  stopAudioImmediately: () => void;
}

/**
 * 会话生命周期 Hook
 */
export function useSessionLifecycle(options: UseSessionLifecycleOptions): UseSessionLifecycleReturn {
  /**
   * 用 ref 存储所有 options，使函数引用稳定。
   * 函数在调用时从 ref 读取最新值，避免闭包捕获旧值。
   */
  const optRef = useRef(options);
  useEffect(() => { optRef.current = options; });

  // ==========================================
  // 内部 Refs（仅生命周期使用）
  // ==========================================
  const isCleaningUpRef = useRef(false);
  const startSessionInFlightRef = useRef(false);
  const currentCallRecordIdRef = useRef<string | null>(null);

  // ==========================================
  // 统一清理函数
  // ==========================================
  const cleanup = useCallback(() => {
    const o = optRef.current;

    // bump epoch: 任何 cleanup 都会让 in-flight 的 startSession/campfire reconnect 作废
    o.sessionEpochRef.current += 1;

    // 防止重复清理
    if (isCleaningUpRef.current) {
      try {
        o.geminiLive.disconnect();
      } catch (e) {
        devWarn('cleanup: geminiLive.disconnect() failed (ignored)', e);
      }
      return;
    }
    isCleaningUpRef.current = true;

    devLog('🧹 执行统一清理...');

    // 记录通话结束时间和时长（如果有 callRecordId）
    const callRecordId = currentCallRecordIdRef.current;
    if (callRecordId && o.timer.taskStartTime > 0) {
      const durationSeconds = Math.round((Date.now() - o.timer.taskStartTime) / 1000);
      devLog('📞 记录通话结束:', { callRecordId, durationSeconds });

      const supabaseForEndCall = getSupabaseClient();
      if (supabaseForEndCall) {
        supabaseForEndCall.functions.invoke('manage-call-records', {
          body: {
            action: 'end_call',
            call_record_id: callRecordId,
            end_at: new Date().toISOString(),
            duration_seconds: durationSeconds,
          },
        }).then(({ error }) => {
          if (error) {
            devWarn('⚠️ 记录通话结束失败:', error);
          } else {
            devLog('✅ 通话结束已记录');
          }
        });
      }
      currentCallRecordIdRef.current = null;
    }

    // 0. 取消后台 nudge（会话结束时确保不会继续推送）
    const supabaseForNudge = getSupabaseClient();
    if (supabaseForNudge) {
      supabaseForNudge.functions.invoke('background-nudge', {
        body: { action: 'cancel' },
      }).catch(() => {});
    }

    // 1. 停止计时器
    o.timer.stopTimer();

    // 2. 断开 Gemini 连接
    o.geminiLive.disconnect();

    // 3. 重置状态
    o.setIsSessionActive(false);
    o.setIsObserving(false);
    o.setIsConnecting(false);

    // 重置清理标志（延迟重置，确保当前清理完成）
    setTimeout(() => {
      isCleaningUpRef.current = false;
    }, 100);

    devLog('✅ 统一清理完成');
  }, []);

  // ==========================================
  // 开始 AI 教练会话
  // ==========================================
  const startSession = useCallback(async (
    taskDescription: string,
    sessionOptions?: StartSessionOptions,
  ): Promise<boolean> => {
    // 幂等守卫
    if (startSessionInFlightRef.current) {
      devWarn('startSession ignored: another startSession is already in progress');
      return false;
    }
    startSessionInFlightRef.current = true;

    const o = optRef.current;
    const { userId, customSystemInstruction, userName, preferredLanguages, taskId, callRecordId, isReconnect, chatMode } = sessionOptions || {};
    let epochAtStart = o.sessionEpochRef.current;

    try {
      devLog('🚀 开始 AI 教练会话...');

      // 如果当前在篝火模式，先停掉篝火资源
      if (o.campfire.isCampfireMode) {
        o.campfire.stopCampfireResources();
      }

      // 防止 sessionRef 残留导致 connect 被忽略
      o.geminiLive.disconnect();

      // 如果存在旧会话/正在连接，先统一 cleanup
      if (o.isSessionActive || o.isConnecting || o.geminiLive.isConnected) {
        devLog('⚠️ 检测到旧会话/连接中，先清理...');
        cleanup();
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      // 重置清理标志
      isCleaningUpRef.current = false;

      // capture epoch
      epochAtStart = o.sessionEpochRef.current;

      o.transcript.reset();
      o.currentUserIdRef.current = userId || null;
      o.currentTaskDescriptionRef.current = taskDescription;
      o.currentTaskIdRef.current = taskId || null;
      currentCallRecordIdRef.current = callRecordId || null;
      o.preferredLanguagesRef.current = preferredLanguages || null;
      o.setIsConnecting(true);
      o.setConnectionError(null);

      // 更新任务描述并重置
      o.setTaskDescription(taskDescription);
      o.timer.resetTimer();

      devLog('🚀 全并行启动: 硬件初始化 + 网络请求同时进行...');

      const supabaseClient = getSupabaseClient();
      if (!supabaseClient) {
        throw new Error('Supabase 未配置');
      }

      const needFetchInstruction = !customSystemInstruction;

      const [, , instructionResult, token] = await withTimeout(
        Promise.all([
          // 任务A：摄像头初始化（带重试机制）
          (async () => {
            devLog('🎬 [并行] 摄像头初始化...', { cameraEnabled: o.geminiLive.cameraEnabled });
            if (!o.geminiLive.cameraEnabled) {
              let cameraRetries = 0;
              let cameraSuccess = false;

              while (cameraRetries < MAX_CAMERA_RETRIES && !cameraSuccess) {
                devLog(`📹 摄像头尝试 #${cameraRetries + 1}，调用 toggleCamera()...`);
                try {
                  await o.geminiLive.toggleCamera();
                  cameraSuccess = true;
                  devLog('✅ 摄像头启用成功');
                } catch (cameraError) {
                  cameraRetries++;
                  const errorMessage = cameraError instanceof Error ? cameraError.message : String(cameraError);
                  devWarn('❌ 摄像头启用异常:', cameraError);
                  devLog('❌ 摄像头错误详情:', errorMessage);

                  if (errorMessage.includes('Permission') || errorMessage.includes('NotAllowed')) {
                    devLog('⚠️ 摄像头权限被拒绝，跳过重试');
                    break;
                  }

                  if (cameraRetries < MAX_CAMERA_RETRIES) {
                    devLog(`⚠️ 摄像头启用失败，${CAMERA_RETRY_DELAY_MS}ms 后重试 (${cameraRetries}/${MAX_CAMERA_RETRIES})...`);
                    await new Promise(resolve => setTimeout(resolve, CAMERA_RETRY_DELAY_MS));
                    devLog(`🔄 重试等待结束，开始第 ${cameraRetries + 1} 次尝试...`);
                  } else {
                    devLog('⚠️ 摄像头启用失败，已达最大重试次数，继续流程');
                  }
                }
              }
              devLog(`📹 摄像头初始化循环结束: cameraSuccess=${cameraSuccess}, cameraEnabled=${o.geminiLive.cameraEnabled}`);
            }
          })(),

          // 任务B：麦克风初始化 + callRecordId 记录
          (async () => {
            devLog('🎤 [并行] 麦克风初始化...');
            if (!o.geminiLive.isRecording) {
              devLog('🎤 调用 toggleMicrophone()...');
              await o.geminiLive.toggleMicrophone();
              devLog('🎤 toggleMicrophone() 完成');
            } else {
              devLog('🎤 麦克风已启用，跳过');
            }

            // 麦克风连接成功后，记录 callRecordId（fire-and-forget）
            if (callRecordId) {
              devLog('📞 记录 mic_connected_at:', callRecordId);
              const supabaseForMic = getSupabaseClient();
              if (supabaseForMic) {
                supabaseForMic.functions.invoke('manage-call-records', {
                  body: {
                    action: 'mark_mic_connected',
                    call_record_id: callRecordId,
                  },
                }).then(({ error }) => {
                  if (error) {
                    devWarn('⚠️ 记录 mic_connected_at 失败:', error);
                  } else {
                    devLog('✅ mic_connected_at 已记录');
                  }
                });
              }
            }
          })(),

          // 任务C：获取系统指令（后端记忆检索）
          needFetchInstruction
            ? supabaseClient.functions.invoke('get-system-instruction', {
                body: {
                  taskInput: taskDescription,
                  userName,
                  preferredLanguages,
                  userId,
                  chatMode,
                  localTime: (() => {
                    const now = new Date();
                    const hours = now.getHours();
                    const minutes = now.getMinutes().toString().padStart(2, '0');
                    return `${hours}:${minutes} (24-hour format)`;
                  })(),
                  localDate: new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric'
                  }),
                  localDateISO: new Date().toISOString().split('T')[0],
                  // 重连场景：传入对话上下文让 AI "记得"之前聊了什么
                  ...(isReconnect && o.getSessionContext ? {
                    isReconnect: true,
                    context: o.getSessionContext(),
                  } : {}),
                }
              })
            : Promise.resolve(null),

          // 任务D：获取 Gemini token
          fetchGeminiToken(),
        ]),
        CONNECTION_TIMEOUT_MS,
        '获取配置超时，请检查网络连接后重试'
      );

      if (epochAtStart !== o.sessionEpochRef.current) {
        devLog('startSession cancelled after parallel init (stale epoch)');
        return false;
      }

      // 处理 system instruction 结果
      let systemInstruction = customSystemInstruction;
      if (instructionResult) {
        if (instructionResult.error) {
          throw new Error(`获取系统指令失败: ${instructionResult.error.message}`);
        }
        systemInstruction = instructionResult.data.systemInstruction;

        // 日志：显示检索到的记忆
        if (import.meta.env.DEV) {
          const retrievedMemories = instructionResult.data.retrievedMemories as string[] | undefined;
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('🧠 [记忆检索] 本次会话取到的记忆:');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          if (retrievedMemories && retrievedMemories.length > 0) {
            retrievedMemories.forEach((mem, index) => {
              console.log(`  ${index + 1}. ${mem}`);
            });
          } else {
            console.log('  (无记忆 - 这可能是新用户或没有相关记忆)');
          }
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }

        // 提取成功记录
        if (instructionResult.data.successRecord) {
          o.successRecordRef.current = instructionResult.data.successRecord;
          if (import.meta.env.DEV) {
            console.log('📊 获取到用户成功记录:', o.successRecordRef.current);
          }
        } else {
          o.successRecordRef.current = null;
        }
      } else {
        o.successRecordRef.current = null;
      }

      // 保存 system instruction 用于篝火模式退出后恢复
      if (systemInstruction) {
        o.campfire.savedSystemInstructionRef.current = systemInstruction;
      }

      if (import.meta.env.DEV) {
        devLog('✅ 并行获取完成，正在连接 Gemini Live...');
      }

      // 获取用户选择的 AI 声音
      const voiceName = getVoiceName();
      if (import.meta.env.DEV) {
        devLog('🎤 使用 AI 声音:', voiceName);
      }

      // 使用预获取的 token 连接（带超时保护）
      await withTimeout(
        o.geminiLive.connect(systemInstruction, undefined, token, voiceName),
        CONNECTION_TIMEOUT_MS,
        '连接 AI 服务超时，请检查网络连接后重试'
      );

      if (epochAtStart !== o.sessionEpochRef.current) {
        devLog('startSession cancelled after connect (stale epoch)');
        o.geminiLive.disconnect();
        return false;
      }

      if (import.meta.env.DEV) {
        devLog('✅ 连接已建立');
      }

      o.setIsConnecting(false);
      o.setIsSessionActive(true);
      o.setIsObserving(true);

      // 开始倒计时
      o.timer.startTimer();

      if (import.meta.env.DEV) {
        devLog('✨ AI 教练会话已成功开始');
      }

      return true;
    } catch (error) {
      if (epochAtStart !== o.sessionEpochRef.current) {
        devLog('startSession aborted (stale epoch), ignoring error:', error);
        return false;
      }

      const errorMessage = error instanceof Error ? error.message : '连接失败，请重试';
      console.error('❌ startSession 错误:', errorMessage);
      devError('❌ startSession 错误详情:', error);
      o.setIsConnecting(false);
      o.setConnectionError(errorMessage);

      cleanup();

      throw error;
    } finally {
      startSessionInFlightRef.current = false;
    }
  }, [cleanup]);

  // ==========================================
  // 立即停止音频播放
  // ==========================================
  const stopAudioImmediately = useCallback(() => {
    devLog('🔇 立即停止音频播放...');
    optRef.current.geminiLive.stopAudio();
  }, []);

  // ==========================================
  // 结束 AI 教练会话
  // ==========================================
  const endSession = useCallback(() => {
    devLog('🔌 结束 AI 教练会话...');
    const o = optRef.current;

    // 如果在篝火模式中直接挂电话，先清理篝火模式资源
    if (o.campfire.isCampfireMode) {
      o.campfire.stopCampfireResources();
    }

    cleanup();

    devLog('✅ AI 教练会话已结束');
  }, [cleanup]);

  // ==========================================
  // 重置会话
  // ==========================================
  const resetSession = useCallback(() => {
    const o = optRef.current;
    endSession();
    o.transcript.reset();
    o.setConnectionError(null);
    o.setTaskDescription('');
    o.timer.resetTimer();
  }, [endSession]);

  // ==========================================
  // 组件卸载时清理
  // ==========================================
  useEffect(() => {
    return () => {
      const o = optRef.current;
      o.sessionEpochRef.current += 1;
      o.timer.cleanupTimer();
      o.geminiLive.disconnect();
      o.campfire.cleanupResources();
    };
  }, []);

  return {
    startSession,
    cleanup,
    endSession,
    resetSession,
    stopAudioImmediately,
  };
}
