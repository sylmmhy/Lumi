import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface TestVersionModalProps {
  /** 是否展示弹窗 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 是否已登录 */
  isLoggedIn?: boolean;
}

/**
 * 测试版本请求弹窗：在用户第一次设置闹钟后显示，
 * 提示电话提醒功能只在 iOS/Android 上可用，并提供邮箱输入以请求测试版本。
 */
export function TestVersionModal({ isOpen, onClose, isLoggedIn = false }: TestVersionModalProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const handleSubmit = async () => {
    if (!supabase) return;

    setIsSubmitting(true);
    let emailToSubmit = email;
    let userId = null;

    // 如果已登录，尝试自动获取邮箱
    if (isLoggedIn) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.email) {
        emailToSubmit = user.email;
        userId = user.id;
      }
    }

    if (!emailToSubmit || !emailToSubmit.includes('@')) {
      alert('Please enter a valid email address.');
      setIsSubmitting(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('test_version_requests')
        .insert({
          email: emailToSubmit,
          user_id: userId,
          status: 'pending'
        });

      if (error) throw error;

      setRequestSent(true);
      setEmail('');
    } catch (error: any) {
      console.error('Error requesting test version:', error);
      alert('Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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
            💗 Please note that the phone-call reminder feature is only available on iOS or Android. If you are interested, you can click below to request a test version, and the developer will send you an email.
          </p>

          {requestSent ? (
            <div className="w-full bg-green-50 border border-green-200 text-green-700 font-serif italic font-bold text-sm py-3 rounded-xl text-center">
              Request Sent! We'll contact you soon.
            </div>
          ) : (
            <div className="space-y-3">
              {!isLoggedIn && (
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 bg-white text-sm"
                />
              )}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full bg-white border border-gray-200 text-brand-darkBlue font-serif italic font-bold text-sm py-3 rounded-xl shadow-sm hover:bg-gray-100 transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Submitting...' : 'Request Test Version'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
