/**
 * PhotoVerificationModal - Out-of-Session 拍照验证弹窗
 *
 * 用户在 HomeView 手动完成任务后，可以通过拍照获得额外 XP。
 * 拍照后调用 verify-task-completion Edge Function 进行视觉验证。
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
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center gap-6 p-6 mx-4 rounded-2xl"
        style={{ backgroundColor: '#2E2B28', maxWidth: '360px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <h2
          style={{
            fontFamily: 'Sansita, sans-serif',
            fontSize: '24px',
            color: '#FFC92A',
            textAlign: 'center',
          }}
        >
          Verify Your Task
        </h2>

        <p
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            color: '#999',
            textAlign: 'center',
          }}
        >
          Take a photo to verify &ldquo;{taskDescription}&rdquo; and earn bonus XP!
        </p>

        {/* 预览 / 拍照按钮 */}
        {preview ? (
          <div className="relative w-full" style={{ aspectRatio: '4/3', borderRadius: '12px', overflow: 'hidden' }}>
            <img src={preview} alt="Task verification" className="w-full h-full object-cover" />
          </div>
        ) : (
          <button
            onClick={handleTakePhoto}
            disabled={isVerifying}
            className="flex flex-col items-center justify-center gap-2 w-full"
            style={{
              aspectRatio: '4/3',
              borderRadius: '12px',
              border: '2px dashed #555',
              backgroundColor: '#1e1e1e',
            }}
          >
            <span style={{ fontSize: '48px' }}>📸</span>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#999' }}>
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
              style={{
                width: '18px',
                height: '18px',
                border: '2px solid #666',
                borderTopColor: '#FFC92A',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#999' }}>
              Analyzing photo...
            </span>
          </div>
        )}

        {/* 验证结果 */}
        {result && !isVerifying && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-xl w-full justify-center"
            style={{
              backgroundColor: result.verified ? '#1a3a1a' : '#3a1a1a',
              border: result.verified ? '1px solid #2d5a2d' : '1px solid #5a2d2d',
            }}
          >
            {result.verified ? (
              <>
                <span style={{ fontSize: '20px' }}>✅</span>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', fontWeight: 600, color: '#4ade80' }}>
                  Verified! +{result.xp_awarded} XP
                </span>
              </>
            ) : (
              <>
                <span style={{ fontSize: '20px' }}>🤔</span>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', color: '#f87171' }}>
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
              className="flex-1 py-3 rounded-xl"
              style={{ backgroundColor: '#444', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: '14px' }}
            >
              Retake
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl"
            style={{
              backgroundColor: result?.verified ? '#FFC92A' : '#444',
              color: result?.verified ? '#000' : '#fff',
              fontFamily: 'Inter, sans-serif',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            {result?.verified ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
