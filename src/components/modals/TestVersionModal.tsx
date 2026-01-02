import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface TestVersionModalProps {
  /** 是否展示弹窗 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
}

/**
 * 测试版本请求弹窗：在用户第一次设置闹钟后显示，
 * 提示电话提醒功能只在 iOS/Android 上可用，并提供邮箱输入以请求测试版本。
 */
export function TestVersionModal({ isOpen, onClose }: TestVersionModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [androidRequestSent, setAndroidRequestSent] = useState(false);

  const handleAndroidClick = async () => {
    if (!supabase) return;

    setIsSubmitting(true);
    let emailToSubmit = '';
    let userId = null;

    // 获取当前用户信息
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      emailToSubmit = user.email || '';
      userId = user.id;
    }

    try {
      const { error } = await supabase
        .from('test_version_requests')
        .insert({
          email: emailToSubmit || null,
          user_id: userId,
          status: 'pending'
        });

      if (error) throw error;

      setAndroidRequestSent(true);
    } catch (error: unknown) {
      console.error('Error requesting test version:', error);
      alert('Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleiOSClick = () => {
    window.open('https://testflight.apple.com/join/JJaHMe4C', '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl">
        <button
          type="button"
          className="absolute right-3 top-3 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          onClick={onClose}
          aria-label="关闭弹窗"
        >
          ×
        </button>

        <div className="p-8">
          <p className="text-gray-600 text-base mb-6 leading-relaxed">
            💗 The phone-call reminder feature is only available on the mobile app. The iOS version is now available on TestFlight. Android version coming soon!
          </p>

          <div className="space-y-3">
            <button
              onClick={handleiOSClick}
              className="w-full bg-brand-darkBlue text-white font-serif italic font-bold text-sm py-3 rounded-xl shadow-sm hover:bg-brand-darkBlue/90 transition-colors active:scale-95 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              Get iOS Version (TestFlight)
            </button>
            {androidRequestSent ? (
              <div className="w-full bg-green-50 border border-green-200 text-green-700 font-serif italic font-bold text-sm py-3 rounded-xl text-center">
                Joined! We'll notify you when ready.
              </div>
            ) : (
              <button
                onClick={handleAndroidClick}
                disabled={isSubmitting}
                className="w-full bg-white border border-gray-200 text-brand-darkBlue font-serif italic font-bold text-sm py-3 rounded-xl shadow-sm hover:bg-gray-100 transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.523 2.402l1.68 2.89a.5.5 0 01-.183.684l-.632.366 1.767 3.04H14.91l1.767-3.04-.632-.366a.5.5 0 01-.183-.683l1.68-2.891zm-11.046 0l1.68 2.89a.5.5 0 01-.183.684l-.632.366 1.767 3.04H3.865l1.767-3.04-.632-.366a.5.5 0 01-.183-.683l1.68-2.891zM5 10.382h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2zm2.5 4a1 1 0 100 2 1 1 0 000-2zm9 0a1 1 0 100 2 1 1 0 000-2z"/>
                </svg>
                {isSubmitting ? 'Joining...' : 'Android Waitlist'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
