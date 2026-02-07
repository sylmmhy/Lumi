/**
 * PhotoVerificationModal - Out-of-Session 拍照验证弹窗
 *
 * 用户在 HomeView 手动完成任务后，可以通过拍照获得额外金币。
 * 拍照后调用 verify-task-completion Edge Function 进行视觉验证。
 *
 * 设计风格：白色卡片 + 金色点缀，匹配 LeaderboardView/StatsView 设计系统。
 */

import { useState, useCallback, useRef } from 'react';
import { useTaskVerification } from '../../hooks/useTaskVerification';
import type { VerificationResult } from '../../hooks/useTaskVerification';

interface PhotoVerificationModalProps {
  /** 是否显示弹窗 */
  isOpen: boolean;
  /** 关闭弹窗 */
  onClose: () => void;
  /** 任务 ID */
  taskId: string;
  /** 任务描述 */
  taskDescription: string;
  /** 用户 ID */
  userId: string;
  /** 验证完成回调 */
  onVerified?: (result: VerificationResult) => void;
}

export function PhotoVerificationModal({
  isOpen,
  onClose,
  taskId,
  taskDescription,
  userId,
  onVerified,
}: PhotoVerificationModalProps) {
  const { verifyWithPhoto, isVerifying, result } = useTaskVerification();
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 读取为 base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]; // 去掉 data:image/...;base64, 前缀
      setPreview(reader.result as string);

      // 调用验证
      const verificationResult = await verifyWithPhoto(taskId, taskDescription, base64, userId);
      if (verificationResult) {
        onVerified?.(verificationResult);
      }
    };
    reader.readAsDataURL(file);
  }, [taskId, taskDescription, userId, verifyWithPhoto, onVerified]);

  const handleTakePhoto = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* 半透明背景 */}
      <div className="absolute inset-0 bg-gray-500/40" />

      {/* 卡片 */}
      <div
        className="relative bg-white rounded-[24px] shadow-2xl border border-gray-100/50 flex flex-col items-center gap-5 p-6 mx-4"
        style={{ maxWidth: '360px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <h2
          className="text-gray-900 font-semibold text-[20px] text-center"
          style={{ fontFamily: "'Quicksand', sans-serif" }}
        >
          Verify Your Task
        </h2>

        <p
          className="text-gray-500 text-[14px] text-center -mt-2"
          style={{ fontFamily: "'Quicksand', sans-serif" }}
        >
          Take a photo to verify &ldquo;{taskDescription}&rdquo; and earn bonus coins!
        </p>

        {/* 预览 / 拍照按钮 */}
        {preview ? (
          <div className="relative w-full rounded-xl overflow-hidden" style={{ aspectRatio: '4/3' }}>
            <img src={preview} alt="Task verification" className="w-full h-full object-cover" />
          </div>
        ) : (
          <button
            onClick={handleTakePhoto}
            disabled={isVerifying}
            className="flex flex-col items-center justify-center gap-3 w-full rounded-xl"
            style={{
              aspectRatio: '4/3',
              border: '2px dashed #E6C865',
              backgroundColor: '#FFF9E6',
            }}
          >
            {/* 金色圆形相机图标 */}
            <div className="w-14 h-14 rounded-full bg-[#FEF3C7] flex items-center justify-center">
              <i className="fa-solid fa-camera text-[#E6C865] text-2xl" />
            </div>
            <span
              className="text-gray-500 text-[14px]"
              style={{ fontFamily: "'Quicksand', sans-serif" }}
            >
              Tap to take a photo
            </span>
          </button>
        )}

        {/* 隐藏的文件输入 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* 验证状态 */}
        {isVerifying && (
          <div className="flex items-center gap-2">
            <div
              className="w-[18px] h-[18px] rounded-full"
              style={{
                border: '2px solid #E5E7EB',
                borderTopColor: '#E6C865',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span
              className="text-gray-500 text-[14px]"
              style={{ fontFamily: "'Quicksand', sans-serif" }}
            >
              Analyzing photo...
            </span>
          </div>
        )}

        {/* 验证结果 */}
        {result && !isVerifying && (
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-xl w-full justify-center ${
              result.verified
                ? 'bg-green-50 border border-green-200'
                : 'bg-amber-50 border border-amber-200'
            }`}
          >
            {result.verified ? (
              <>
                <span className="text-[20px]">✅</span>
                <span
                  className="text-green-700 text-[15px] font-semibold flex items-center gap-1"
                  style={{ fontFamily: "'Quicksand', sans-serif" }}
                >
                  Verified! +{result.coins_awarded}
                  <img src="/coin.png" alt="coin" className="w-4 h-4" />
                </span>
              </>
            ) : (
              <>
                <span className="text-[20px]">🤔</span>
                <span
                  className="text-amber-700 text-[15px]"
                  style={{ fontFamily: "'Quicksand', sans-serif" }}
                >
                  Could not verify. Try again?
                </span>
              </>
            )}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-3 w-full">
          {!result && !isVerifying && preview && (
            <button
              onClick={handleTakePhoto}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors"
              style={{ fontFamily: "'Quicksand', sans-serif", fontSize: '14px' }}
            >
              Retake
            </button>
          )}
          <button
            onClick={onClose}
            className={`flex-1 py-3 rounded-xl font-semibold transition-colors ${
              result?.verified
                ? 'bg-brand-goldBorder text-white hover:bg-[#D4A825]'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            style={{ fontFamily: "'Quicksand', sans-serif", fontSize: '14px' }}
          >
            {result?.verified ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
