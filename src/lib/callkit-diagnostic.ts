/**
 * CallKit 诊断模块
 *
 * 用于自动采集 VoIP 来电过程中的异常证据并上报后端：
 * 1. 监听 iOS 端派发的 callKitDiagnostic 事件（绝对超时触发 / endCall 失败）
 * 2. Web 端音频异常检测（volume=0 持续 5 秒）
 * 3. forceEndCallKit 桥接（通知 iOS 强制结束残留 CallKit 通话）
 *
 * 数据流：
 * iOS CallKit 异常 → CustomEvent('callKitDiagnostic') → reportDiagnosticToBackend()
 * Web 音频异常 → createAudioAnomalyDetector() → reportDiagnosticToBackend()
 */

import { getSupabaseClient } from './supabase';

// ==========================================
// 1. iOS 诊断事件监听器
// ==========================================

/**
 * 初始化 CallKit 诊断事件监听器
 *
 * 在 main.tsx 启动时调用，监听 iOS 端通过 evaluateJavaScript 派发的诊断事件。
 * 事件触发条件：
 * - 绝对超时被触发（didActivate 未调用）
 * - endCall 重试后仍失败
 */
export function initCallKitDiagnosticListener(): void {
  window.addEventListener('callKitDiagnostic', ((e: CustomEvent) => {
    const diagnosticData = e.detail;
    console.log('📊 [CallKit诊断] 收到 iOS 诊断事件:', diagnosticData);

    // 尝试从 URL 中获取 callRecordId
    const urlParams = new URLSearchParams(window.location.search);
    const callRecordId = urlParams.get('callRecordId') || undefined;

    reportDiagnosticToBackend(diagnosticData, callRecordId);
  }) as EventListener);

  console.log('✅ [CallKit诊断] 诊断事件监听器已注册');
}

// ==========================================
// 2. 诊断数据上报
// ==========================================

/**
 * 上报诊断数据到后端
 *
 * 通过 manage-call-records edge function 的 report_diagnostic action 上报。
 * 如果有 callRecordId，数据会写入对应的 call_records.diagnostic_data；
 * 如果没有，仅记录到 edge function 日志中。
 *
 * @param diagnosticData - 诊断数据对象
 * @param callRecordId - 可选的来电记录 ID
 */
export async function reportDiagnosticToBackend(
  diagnosticData: Record<string, unknown>,
  callRecordId?: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('📊 [CallKit诊断] Supabase 未配置，无法上报');
      return;
    }

    const { error } = await supabase.functions.invoke('manage-call-records', {
      body: {
        action: 'report_diagnostic',
        call_record_id: callRecordId ?? null,
        diagnostic_data: {
          ...diagnosticData,
          reported_at: new Date().toISOString(),
        },
      },
    });

    if (error) {
      console.warn('📊 [CallKit诊断] 上报失败:', error);
    } else {
      console.log('📊 [CallKit诊断] 上报成功', callRecordId ? `(callRecordId=${callRecordId})` : '(无 callRecordId)');
    }
  } catch (err) {
    console.warn('📊 [CallKit诊断] 上报异常:', err);
  }
}

// ==========================================
// 3. forceEndCallKit 桥接
// ==========================================

/**
 * 通知 iOS 端强制结束 CallKit 通话
 *
 * 当 Web 端检测到音频异常（volume=0 持续 5 秒）时调用，
 * 通过 JS Bridge 触发 iOS 端的 forceEndCallKit 方法。
 *
 * @param reason - 触发原因（如 "zero_volume_5s"）
 */
export function forceEndCallKit(reason: string): void {
  window.webkit?.messageHandlers?.forceEndCallKit?.postMessage({ reason });
  console.log('📊 [CallKit诊断] 已发送 forceEndCallKit:', reason);
}

// ==========================================
// 4. 音频异常检测器
// ==========================================

/** 音频异常检测器的配置 */
interface AudioAnomalyDetectorOptions {
  /** 关联的来电记录 ID（可选） */
  callRecordId?: string;
  /** 检测到异常时的回调 */
  onAnomalyDetected?: () => void;
}

/** 音频异常检测器的返回值 */
interface AudioAnomalyDetector {
  /** 报告当前音量（由 VAD hook 的 onVolumeReport 每秒调用） */
  reportVolume: (volume: number) => void;
  /** 销毁检测器（session cleanup 时调用） */
  dispose: () => void;
}

/**
 * 创建音频异常检测器
 *
 * 监测 volume=0 持续超过 5 秒的情况。这通常意味着 CallKit 音频会话
 * 未正确释放，麦克风被 CallKit 占用导致 Web 端收不到任何音频数据。
 *
 * 使用方式：
 * ```ts
 * const detector = createAudioAnomalyDetector({ callRecordId, onAnomalyDetected: () => { ... } });
 * // 在 VAD 回调中：
 * detector.reportVolume(volume);
 * // 清理：
 * detector.dispose();
 * ```
 *
 * @param options - 配置选项
 * @returns 检测器控制接口
 */
export function createAudioAnomalyDetector(options: AudioAnomalyDetectorOptions): AudioAnomalyDetector {
  let zeroVolumeStart: number | null = null;
  let reported = false;
  const THRESHOLD_MS = 5000; // 持续 5 秒 volume=0

  return {
    reportVolume(volume: number) {
      if (reported) return;

      if (volume === 0) {
        if (!zeroVolumeStart) zeroVolumeStart = Date.now();
        if (Date.now() - zeroVolumeStart >= THRESHOLD_MS) {
          reported = true;
          console.warn('📊 [CallKit诊断] 检测到音频异常：volume=0 持续超过 5 秒');

          // 上报诊断数据
          reportDiagnosticToBackend({
            source: 'web_audio_anomaly',
            anomaly: 'zero_volume_5s',
            duration_ms: Date.now() - zeroVolumeStart,
          }, options.callRecordId);

          // 尝试强制结束 CallKit
          forceEndCallKit('zero_volume_5s');

          // 通知外部
          options.onAnomalyDetected?.();
        }
      } else {
        // 一旦有声音，重置计时
        zeroVolumeStart = null;
      }
    },
    dispose() {
      reported = true;
    },
  };
}
