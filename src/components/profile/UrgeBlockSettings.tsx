/**
 * UrgeBlockSettings - 冲动阻止设置组件
 *
 * 功能：
 * - 启用/禁用 Urge Block 功能
 * - 设置冷却时间
 * - 引导用户配置 iOS Shortcuts 自动化
 *
 * 设计：
 * - 可折叠的设置区块
 * - 与 PermissionsSection 风格一致
 * - 用户在 iOS Shortcuts 中选择要阻止的应用（不在 Lumi 中选择）
 */

import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useUrgeBlockBridge } from '../../hooks/useUrgeBlockBridge';
import type { UrgeBlockSettings as UrgeBlockSettingsType } from '../../hooks/useUrgeBlockBridge';

// =====================================================
// 常量
// =====================================================

/** URL 模板 - 用户在 Shortcuts 中插入变量 */
const URL_TEMPLATE = 'lumi://urge-surfing?app=';

const COOLDOWN_OPTIONS = [
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
];

/** 自定义选项的特殊值 */
const CUSTOM_COOLDOWN_VALUE = -1;
/** 最大冷却时间：1440 分钟 = 24 小时 */
const MAX_COOLDOWN_MINUTES = 1440;

// =====================================================
// 组件实现
// =====================================================

export function UrgeBlockSettings() {
  const { t } = useTranslation();
  const {
    isNativeApp,
    openShortcuts,
    getSettings,
    saveSettings,
  } = useUrgeBlockBridge();

  // 状态
  const [isExpanded, setIsExpanded] = useState(false);
  const [settings, setSettings] = useState<UrgeBlockSettingsType>(() => getSettings());
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // 自定义冷却时间状态
  const [isCustomCooldown, setIsCustomCooldown] = useState(() => {
    const current = getSettings().cooldownMinutes;
    return !COOLDOWN_OPTIONS.some(opt => opt.value === current);
  });
  const [customCooldownInput, setCustomCooldownInput] = useState(() => {
    const current = getSettings().cooldownMinutes;
    return COOLDOWN_OPTIONS.some(opt => opt.value === current) ? '' : String(current);
  });

  // 同步设置到本地存储和服务器
  const handleSaveSettings = useCallback(async (newSettings: UrgeBlockSettingsType) => {
    setIsSaving(true);
    setSettings(newSettings);
    try {
      await saveSettings(newSettings);
    } catch (error) {
      console.error('保存设置失败:', error);
    } finally {
      setIsSaving(false);
    }
  }, [saveSettings]);

  /**
   * 切换启用状态
   */
  const handleToggleEnabled = useCallback(() => {
    const newSettings = { ...settings, enabled: !settings.enabled };
    handleSaveSettings(newSettings);
  }, [settings, handleSaveSettings]);

  /**
   * 修改冷却时间
   */
  const handleCooldownChange = useCallback((minutes: number) => {
    const newSettings = { ...settings, cooldownMinutes: minutes };
    handleSaveSettings(newSettings);
  }, [settings, handleSaveSettings]);

  /**
   * 下拉菜单选择变更
   */
  const handleDropdownChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = parseInt(e.target.value, 10);
    if (value === CUSTOM_COOLDOWN_VALUE) {
      setIsCustomCooldown(true);
      setCustomCooldownInput(String(settings.cooldownMinutes));
    } else {
      setIsCustomCooldown(false);
      setCustomCooldownInput('');
      handleCooldownChange(value);
    }
  }, [settings.cooldownMinutes, handleCooldownChange]);

  /**
   * 自定义输入变更
   */
  const handleCustomInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      setCustomCooldownInput(value);
    }
  }, []);

  /**
   * 自定义输入确认（失焦或回车）
   */
  const handleCustomInputConfirm = useCallback(() => {
    const value = parseInt(customCooldownInput, 10);
    if (isNaN(value) || value < 0) {
      setCustomCooldownInput('0');
      handleCooldownChange(0);
    } else if (value > MAX_COOLDOWN_MINUTES) {
      setCustomCooldownInput(String(MAX_COOLDOWN_MINUTES));
      handleCooldownChange(MAX_COOLDOWN_MINUTES);
    } else {
      handleCooldownChange(value);
    }
  }, [customCooldownInput, handleCooldownChange]);

  /**
   * 打开 Shortcuts 设置引导
   */
  const handleOpenSetupGuide = useCallback(() => {
    setShowSetupGuide(true);
  }, []);

  /**
   * 复制 URL 模板到剪贴板
   */
  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(URL_TEMPLATE);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('复制到剪贴板失败:', error);
      // 降级方案
      const textArea = document.createElement('textarea');
      textArea.value = URL_TEMPLATE;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch {
        console.error('降级复制也失败');
      }
      document.body.removeChild(textArea);
    }
  }, []);

  // 加载初始设置
  useEffect(() => {
    setSettings(getSettings());
  }, [getSettings]);

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
      {/* 主行 - 点击展开 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center">
            <i className="fa-solid fa-hand text-purple-500"></i>
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-800">{t('urgeBlock.title')}</p>
            <p className="text-xs text-gray-400">{t('urgeBlock.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {settings.enabled ? (
            <span className="text-xs text-green-500 flex items-center gap-1">
              <i className="fa-solid fa-circle-check"></i>
              {t('urgeBlock.enabled')}
            </span>
          ) : (
            <span className="text-xs text-gray-400">
              {t('urgeBlock.disabled')}
            </span>
          )}
          <i className={`fa-solid fa-chevron-right text-gray-300 text-sm transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}></i>
        </div>
      </button>

      {/* 展开内容 */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="border-t border-gray-100"></div>

        {/* 启用开关 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-50 rounded-full flex items-center justify-center">
              <i className="fa-solid fa-power-off text-green-500 text-sm"></i>
            </div>
            <div>
              <p className="font-medium text-gray-700 text-sm">{t('urgeBlock.enableFeature')}</p>
              <p className="text-xs text-gray-400">{t('urgeBlock.enableDescription')}</p>
            </div>
          </div>
          <button
            onClick={handleToggleEnabled}
            disabled={isSaving}
            className={`w-12 h-7 rounded-full p-1 transition-colors ${settings.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* 冷却时间设置 - 暂时禁用 */}
        <div className="p-4 border-b border-gray-100 opacity-50 pointer-events-none">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
              <i className="fa-solid fa-hourglass-half text-gray-400 text-sm"></i>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-500 text-sm">{t('urgeBlock.cooldownTime')}</p>
                <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{t('common.comingSoon')}</span>
              </div>
              <p className="text-xs text-gray-400">{t('urgeBlock.cooldownDescription')}</p>
            </div>
          </div>
          <div className="pl-11 space-y-3">
            {/* 下拉菜单 */}
            <select
              value={isCustomCooldown ? CUSTOM_COOLDOWN_VALUE : settings.cooldownMinutes}
              onChange={handleDropdownChange}
              disabled={true}
              className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-500 cursor-not-allowed"
            >
              {COOLDOWN_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              <option value={CUSTOM_COOLDOWN_VALUE}>{t('urgeBlock.customCooldown')}</option>
            </select>

            {/* 自定义输入框 */}
            {isCustomCooldown && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max={MAX_COOLDOWN_MINUTES}
                  value={customCooldownInput}
                  onChange={handleCustomInputChange}
                  onBlur={handleCustomInputConfirm}
                  onKeyDown={(e) => e.key === 'Enter' && handleCustomInputConfirm()}
                  disabled={true}
                  placeholder="0"
                  className="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-500 cursor-not-allowed"
                />
                <span className="text-sm text-gray-400">{t('urgeBlock.minutes')}</span>
              </div>
            )}

            {/* 自定义输入提示 */}
            {isCustomCooldown && (
              <p className="text-xs text-gray-400">
                {t('urgeBlock.customCooldownHint', { max: MAX_COOLDOWN_MINUTES })}
              </p>
            )}
          </div>
        </div>

        {/* iOS Shortcuts 设置引导 */}
        {isNativeApp && (
          <div className="p-4">
            <button
              onClick={handleOpenSetupGuide}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium rounded-xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-wand-magic-sparkles"></i>
              <span>{t('urgeBlock.setupShortcuts')}</span>
            </button>
            <p className="text-xs text-gray-400 text-center mt-2">
              {t('urgeBlock.setupShortcutsHint')}
            </p>
          </div>
        )}

        {/* 非原生环境提示 */}
        {!isNativeApp && (
          <div className="p-4 bg-amber-50">
            <div className="flex items-start gap-2">
              <i className="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5 text-xs"></i>
              <p className="text-xs text-amber-700">
                {t('urgeBlock.webModeWarning')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Shortcuts 设置引导弹窗 */}
      {showSetupGuide && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-center">{t('urgeBlock.setupGuideTitle')}</h3>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                {/* Step 1 */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-600 font-semibold text-sm">1</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{t('urgeBlock.step1Title')}</p>
                    <p className="text-xs text-gray-500 mt-1">{t('urgeBlock.step1Description')}</p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-600 font-semibold text-sm">2</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{t('urgeBlock.step2Title')}</p>
                    <p className="text-xs text-gray-500 mt-1">{t('urgeBlock.step2Description')}</p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-600 font-semibold text-sm">3</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{t('urgeBlock.step3Title')}</p>
                    <p className="text-xs text-gray-500 mt-1">{t('urgeBlock.step3Description')}</p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-600 font-semibold text-sm">4</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{t('urgeBlock.step4Title')}</p>
                    <p className="text-xs text-gray-500 mt-1">{t('urgeBlock.step4Description')}</p>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-600 font-semibold text-sm">5</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{t('urgeBlock.step5Title')}</p>
                    <p className="text-xs text-gray-500 mt-1">{t('urgeBlock.step5Description')}</p>
                  </div>
                </div>

                {/* Step 6 */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-600 font-semibold text-sm">6</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{t('urgeBlock.step6Title')}</p>
                    <p className="text-xs text-gray-500 mt-1">{t('urgeBlock.step6Description')}</p>
                  </div>
                </div>

                {/* Step 7 */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-600 font-semibold text-sm">7</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{t('urgeBlock.step7Title')}</p>
                    <p className="text-xs text-gray-500 mt-1">{t('urgeBlock.step7Description')}</p>
                  </div>
                </div>

                {/* Step 8 */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-600 font-semibold text-sm">8</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{t('urgeBlock.step8Title')}</p>
                    <p className="text-xs text-gray-500 mt-1">{t('urgeBlock.step8Description')}</p>
                  </div>
                </div>

                {/* URL 模板 - 可复制 */}
                <div className="bg-purple-50 rounded-xl p-3 mt-4">
                  <p className="text-xs text-purple-700 font-medium mb-2">{t('urgeBlock.urlSchemeLabel')}</p>
                  <button
                    onClick={handleCopyUrl}
                    className="w-full flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-purple-200 hover:border-purple-400 transition-colors"
                  >
                    <code className="text-sm text-purple-600 break-all text-left">
                      {URL_TEMPLATE}
                    </code>
                    <span className={`text-xs flex items-center gap-1 ml-2 flex-shrink-0 ${isCopied ? 'text-green-600' : 'text-purple-600'}`}>
                      {isCopied ? (
                        <>
                          <i className="fa-solid fa-check"></i>
                          <span>{t('urgeBlock.copied')}</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-copy"></i>
                          <span>{t('urgeBlock.copyUrl')}</span>
                        </>
                      )}
                    </span>
                  </button>
                  <p className="text-xs text-gray-500 mt-2">
                    {t('urgeBlock.urlVariableHint')}
                  </p>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="p-4 border-t border-gray-100 space-y-2">
              <button
                onClick={() => {
                  openShortcuts();
                  setShowSetupGuide(false);
                }}
                className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-arrow-up-right-from-square"></i>
                <span>{t('urgeBlock.openShortcuts')}</span>
              </button>
              <button
                onClick={() => setShowSetupGuide(false)}
                className="w-full py-3 text-gray-500 font-medium"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
