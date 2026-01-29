/**
 * ReflectionFormPage - 反思表单页面
 *
 * 当用户在"突破"后打开 Lumi 时显示，让用户反思上次的应用使用体验
 *
 * 功能：
 * - 情绪评分（0-5，0.5 间隔）
 * - 任务影响评分（0-5，0.5 间隔）
 * - 反思文本（可选）
 * - 三个操作：填写提交 / 跳过（稍后再问）/ 删除（永久忽略）
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { StarRating } from '../../components/urge';
import { usePendingReflections } from '../../hooks/usePendingReflections';
import type { PendingReflectionForm } from '../../hooks/usePendingReflections';
import { useTranslation } from '../../hooks/useTranslation';

// =====================================================
// 类型定义
// =====================================================

interface ReflectionFormContentProps {
  form: PendingReflectionForm;
  onSubmit: (params: {
    emotionRating?: number;
    taskImpactRating?: number;
    reflectionText?: string;
    saveAsConsequence?: boolean;
  }) => Promise<boolean>;
  onSkip: () => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  isSubmitting: boolean;
}

// =====================================================
// 子组件：表单内容
// =====================================================

const ReflectionFormContent: React.FC<ReflectionFormContentProps> = ({
  form,
  onSubmit,
  onSkip,
  onDelete,
  isSubmitting,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // 表单状态
  const [emotionRating, setEmotionRating] = useState(0);
  const [taskImpactRating, setTaskImpactRating] = useState(0);
  const [reflectionText, setReflectionText] = useState('');
  const [saveAsConsequence, setSaveAsConsequence] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 格式化事件时间
  const formatEventTime = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return t('time.today');
    } else if (diffDays === 1) {
      return t('time.yesterday');
    } else if (diffDays < 7) {
      return t('time.daysAgo', { days: diffDays });
    } else {
      return date.toLocaleDateString();
    }
  };

  /**
   * 提交表单
   */
  const handleSubmit = useCallback(async () => {
    const success = await onSubmit({
      emotionRating: emotionRating > 0 ? emotionRating : undefined,
      taskImpactRating: taskImpactRating > 0 ? taskImpactRating : undefined,
      reflectionText: reflectionText.trim() || undefined,
      saveAsConsequence,
    });

    if (success) {
      navigate('/app/home', { replace: true });
    }
  }, [onSubmit, emotionRating, taskImpactRating, reflectionText, saveAsConsequence, navigate]);

  /**
   * 跳过表单
   */
  const handleSkip = useCallback(async () => {
    const success = await onSkip();
    if (success) {
      navigate('/app/home', { replace: true });
    }
  }, [onSkip, navigate]);

  /**
   * 删除表单
   */
  const handleDelete = useCallback(async () => {
    const success = await onDelete();
    if (success) {
      navigate('/app/home', { replace: true });
    }
  }, [onDelete, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col safe-area-inset">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 pt-[59px] pb-4 flex items-center">
        <button
          onClick={handleSkip}
          disabled={isSubmitting}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          <i className="fa-solid fa-xmark text-gray-600"></i>
        </button>
        <h2 className="flex-1 text-center font-bold text-lg text-gray-800 mr-10">
          {t('reflection.title')}
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* 事件信息卡片 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <i className="fa-solid fa-mobile-screen text-purple-500 text-xl"></i>
            </div>
            <div>
              <p className="font-medium text-gray-800">
                {form.blockedAppName || form.blockedAppId}
              </p>
              <p className="text-sm text-gray-500">
                {formatEventTime(form.eventCreatedAt)}
              </p>
            </div>
          </div>
          <p className="text-gray-600 text-sm mt-3">
            {t('reflection.eventDescription')}
          </p>
        </div>

        {/* 情绪评分 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <StarRating
            value={emotionRating}
            onChange={setEmotionRating}
            label={t('reflection.emotionLabel')}
            lowLabel={t('reflection.emotionLow')}
            highLabel={t('reflection.emotionHigh')}
            size="lg"
          />
        </div>

        {/* 任务影响评分 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <StarRating
            value={taskImpactRating}
            onChange={setTaskImpactRating}
            label={t('reflection.taskImpactLabel')}
            lowLabel={t('reflection.taskImpactLow')}
            highLabel={t('reflection.taskImpactHigh')}
            size="lg"
          />
        </div>

        {/* 反思文本 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <label className="block font-medium text-gray-700 mb-2">
            {t('reflection.textLabel')}
          </label>
          <textarea
            value={reflectionText}
            onChange={(e) => setReflectionText(e.target.value)}
            placeholder={t('reflection.textPlaceholder')}
            rows={4}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent"
          />

          {/* 保存为后果记忆选项 */}
          {reflectionText.trim() && (
            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsConsequence}
                onChange={(e) => setSaveAsConsequence(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
              />
              <span className="text-sm text-gray-600">
                {t('reflection.saveAsConsequence')}
              </span>
            </label>
          )}
        </div>

        {/* 跳过次数提示 */}
        {form.skipCount > 0 && (
          <p className="text-center text-gray-400 text-xs mb-4">
            {t('reflection.skipCountHint', { count: form.skipCount })}
          </p>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="bg-white border-t border-gray-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {/* 提交按钮 */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full py-4 bg-brand-blue text-white font-semibold rounded-xl shadow-sm hover:bg-brand-darkBlue active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-3"
        >
          {isSubmitting ? (
            <>
              <i className="fa-solid fa-spinner fa-spin"></i>
              <span>{t('common.processing')}</span>
            </>
          ) : (
            <>
              <i className="fa-solid fa-check"></i>
              <span>{t('reflection.submit')}</span>
            </>
          )}
        </button>

        {/* 次要操作 */}
        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            disabled={isSubmitting}
            className="flex-1 py-3 text-gray-600 font-medium bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {t('reflection.skip')}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isSubmitting}
            className="flex-1 py-3 text-red-500 font-medium bg-red-50 rounded-xl hover:bg-red-100 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {t('reflection.delete')}
          </button>
        </div>
      </div>

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <i className="fa-solid fa-trash-can text-red-500 text-2xl"></i>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                {t('reflection.deleteConfirmTitle')}
              </h3>
              <p className="text-gray-500 text-sm mb-6">
                {t('reflection.deleteConfirmDescription')}
              </p>
              <div className="flex flex-col gap-3 w-full">
                <button
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="w-full py-3 bg-red-500 text-white font-medium rounded-xl hover:bg-red-600 active:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('reflection.deleteConfirm')}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isSubmitting}
                  className="w-full py-3 text-gray-500 font-medium bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =====================================================
// 主组件
// =====================================================

export const ReflectionFormPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    hasPending,
    pendingForm,
    isLoading,
    isSubmitting,
    error,
    submitReflection,
    skipReflection,
    deleteReflection,
  } = usePendingReflections();

  // 加载中
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <i className="fa-solid fa-spinner fa-spin text-brand-blue text-3xl"></i>
          <p className="text-gray-500">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // 错误
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm p-6 text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fa-solid fa-exclamation-circle text-red-500 text-2xl"></i>
          </div>
          <h2 className="text-gray-800 text-lg font-semibold mb-2">{t('common.error')}</h2>
          <p className="text-gray-500 text-sm mb-4">{error}</p>
          <button
            onClick={() => navigate('/app/home', { replace: true })}
            className="w-full py-3 bg-brand-blue text-white rounded-xl font-medium"
          >
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  // 没有待填写的表单
  if (!hasPending || !pendingForm) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm p-6 text-center max-w-sm">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fa-solid fa-check text-green-500 text-2xl"></i>
          </div>
          <h2 className="text-gray-800 text-lg font-semibold mb-2">
            {t('reflection.noPending')}
          </h2>
          <p className="text-gray-500 text-sm mb-4">
            {t('reflection.noPendingDescription')}
          </p>
          <button
            onClick={() => navigate('/app/home', { replace: true })}
            className="w-full py-3 bg-brand-blue text-white rounded-xl font-medium"
          >
            {t('reflection.goHome')}
          </button>
        </div>
      </div>
    );
  }

  // 显示表单
  return (
    <ReflectionFormContent
      form={pendingForm}
      onSubmit={submitReflection}
      onSkip={skipReflection}
      onDelete={deleteReflection}
      isSubmitting={isSubmitting}
    />
  );
};

export default ReflectionFormPage;
