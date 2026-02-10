import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { trackEvent } from '../../lib/amplitude';
import { useTranslation } from '../../hooks/useTranslation';

export interface BetaRequestModalProps {
  /** 是否展示弹窗 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
}

/**
 * Beta 测试申请弹窗组件
 *
 * 用于 Landing Page 上收集用户邮箱，提交到 test_version_requests 表
 * 无需用户登录即可提交申请
 *
 * @param {BetaRequestModalProps} props - 组件属性
 * @returns {JSX.Element | null} 弹窗组件
 */
export function BetaRequestModal({ isOpen, onClose }: BetaRequestModalProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  /**
   * 验证邮箱格式
   * @param {string} emailToValidate - 待验证的邮箱
   * @returns {boolean} 是否为有效邮箱格式
   */
  const isValidEmail = (emailToValidate: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(emailToValidate);
  };

  /**
   * 处理邮箱提交
   * 1. 验证邮箱格式
   * 2. 提交到 Supabase test_version_requests 表
   * 3. 显示成功/失败状态
   */
  const handleSubmit = async () => {
    // 验证邮箱
    if (!email.trim()) {
      setErrorMessage(t('landing.beta.emptyError'));
      return;
    }

    if (!isValidEmail(email)) {
      setErrorMessage(t('landing.beta.invalidError'));
      return;
    }

    if (!supabase) {
      setErrorMessage(t('landing.beta.serviceError'));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      // 先检查邮箱是否已存在
      const { data: existing } = await supabase
        .from('test_version_requests')
        .select('id')
        .eq('email', email.trim())
        .limit(1);

      if (existing && existing.length > 0) {
        setErrorMessage(t('landing.beta.duplicateError'));
        setIsSubmitting(false);
        return;
      }

      // 插入新记录
      const { error } = await supabase
        .from('test_version_requests')
        .insert({
          email: email.trim(),
          user_id: null, // 未登录用户没有 user_id
          status: 'pending'
        });

      if (error) {
        throw error;
      }

      // 追踪 Android Beta 邮箱提交成功
      trackEvent('android_beta_email_submitted', {
        email_domain: email.trim().split('@')[1] || 'unknown'
      });

      setIsSuccess(true);
      setEmail('');
    } catch (error: unknown) {
      console.error('Error submitting beta request:', error);
      setErrorMessage(t('landing.beta.submitError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * 处理关闭弹窗
   * 重置所有状态
   */
  const handleClose = () => {
    setEmail('');
    setIsSuccess(false);
    setErrorMessage('');
    onClose();
  };

  /**
   * 处理键盘回车提交
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSubmitting) {
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* 关闭按钮 */}
        <button
          type="button"
          className="absolute right-3 top-3 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition z-10"
          onClick={handleClose}
          aria-label={t('common.closeModal')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* 顶部装饰条 */}
        <div className="h-2 bg-gradient-to-r from-[#2545BD] to-[#FE8D00]" />

        <div className="p-8">
          {isSuccess ? (
            // 成功状态
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{t('landing.beta.successTitle')}</h3>
              <p className="text-gray-600 mb-6">
                {t('landing.beta.successMessage')}
              </p>
              <button
                onClick={handleClose}
                className="px-8 py-3 bg-[#2545BD] text-white font-semibold rounded-full hover:bg-[#1e3a9f] transition-all"
              >
                {t('landing.beta.gotIt')}
              </button>
            </div>
          ) : (
            // 输入表单
            <>
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{t('landing.beta.title')}</h3>
                <p className="text-gray-600">
                  {t('landing.beta.subtitle')}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrorMessage('');
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={t('landing.beta.emailPlaceholder')}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2545BD] focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
                    disabled={isSubmitting}
                    autoFocus
                  />
                  {errorMessage && (
                    <p className="mt-2 text-sm text-red-500">{errorMessage}</p>
                  )}
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full py-3 bg-[#2545BD] text-white font-semibold rounded-xl hover:bg-[#1e3a9f] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {t('landing.beta.joining')}
                    </>
                  ) : (
                    t('landing.beta.joinWaitlist')
                  )}
                </button>
              </div>

              <p className="mt-4 text-xs text-center text-gray-400">
                {t('landing.beta.privacyNote')}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
