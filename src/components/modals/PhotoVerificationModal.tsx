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
  const { verifyWithPhoto, isVerifying, result, clearResult } = useTaskVerification();
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

  /** 重试：清除结果和预览，让用户重新拍照 */
  const handleRetry = useCallback(() => {
    clearResult();
    setPreview(null);
    // 重置 file input 以允许选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [clearResult]);

  if (!isOpen) return null;

  /** 验证失败状态 */
  const isFailed = result !== null && !result.verified && !isVerifying;

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
        {/* 失败状态：完整的失败提示页面 */}
        {isFailed ? (
          <>
            {/* 失败图标 */}
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-[#FFF7ED] flex items-center justify-center">
                <span className="text-3xl">📸</span>
              </div>
            </div>

            {/* 标题 */}
            <h2
              className="text-gray-900 font-semibold text-[20px] text-center"
              style={{ fontFamily: "'Quicksand', sans-serif" }}
            >
              Couldn&apos;t Verify
            </h2>

            {/* 说明文字 */}
            <p
              className="text-gray-500 text-[14px] text-center -mt-2 leading-relaxed"
              style={{ fontFamily: "'Quicksand', sans-serif" }}
            >
              We couldn&apos;t confirm &ldquo;{taskDescription}&rdquo; from the photo. Try a clearer angle showing your completed task!
            </p>

            {/* 提示 tips 卡片 */}
            <div
              className="w-full rounded-xl px-4 py-3 flex flex-col gap-2"
              style={{ backgroundColor: '#FFF9E6', border: '1px solid rgba(230,200,101,0.3)' }}
            >
              <span
                className="text-[13px] text-[#92400E] font-semibold"
                style={{ fontFamily: "'Quicksand', sans-serif" }}
              >
                Tips for better verification:
              </span>
              <ul className="text-[13px] text-[#92400E]/80 list-none flex flex-col gap-1" style={{ fontFamily: "'Quicksand', sans-serif" }}>
                <li>&#x2022; Make sure the task result is clearly visible</li>
                <li>&#x2022; Use good lighting, avoid shadows</li>
                <li>&#x2022; Include relevant context in the frame</li>
              </ul>
            </div>

            {/* 按钮 */}
            <div className="flex gap-3 w-full">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors"
                style={{ fontFamily: "'Quicksand', sans-serif", fontSize: '14px' }}
              >
                Maybe Later
              </button>
              <button
                onClick={handleRetry}
                className="flex-1 py-3 rounded-xl font-semibold transition-colors bg-brand-goldBorder text-white hover:bg-[#D4A825]"
                style={{ fontFamily: "'Quicksand', sans-serif", fontSize: '14px' }}
              >
                Try Again
              </button>
            </div>
          </>
        ) : (
          <>
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

            {/* 验证成功结果 */}
            {result && result.verified && !isVerifying && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl w-full justify-center bg-green-50 border border-green-200">
                <span className="text-[20px]">✅</span>
                <span
                  className="text-green-700 text-[15px] font-semibold flex items-center gap-1"
                  style={{ fontFamily: "'Quicksand', sans-serif" }}
                >
                  Verified! +{result.coins_awarded}
                  <img src="/coin.png" alt="coin" className="w-4 h-4" />
                </span>
              </div>
            )}

            {/* 操作按钮（非失败状态） */}
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
              {!isVerifying && (
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
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
