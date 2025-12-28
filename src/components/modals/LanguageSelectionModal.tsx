import React, { useState } from 'react';
import { SUPPORTED_LANGUAGES, getPreferredLanguages, setPreferredLanguages } from '../../lib/language';
import { useTranslation } from '../../hooks/useTranslation';

interface LanguageSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * 语音语言多选弹窗，负责读取与保存用户的首选语言设置。
 *
 * @param {LanguageSelectionModalProps} props - 弹窗开关与关闭回调
 * @returns {JSX.Element | null} 语言选择弹窗
 */
export const LanguageSelectionModal: React.FC<LanguageSelectionModalProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const [selectedLanguages, setSelectedLanguages] = useState<string[]>(() => getPreferredLanguages());

    if (!isOpen) return null;

    /**
     * 切换语言的选中状态（多选）。
     * @param {string} code - 语言代码
     */
    const handleToggleLanguage = (code: string) => {
        setSelectedLanguages(prev => {
            if (prev.includes(code)) {
                // 取消选中
                return prev.filter(c => c !== code);
            } else {
                // 添加选中
                return [...prev, code];
            }
        });
    };

    /**
     * 切换到自动识别语言（清空选择）。
     */
    const handleSelectAutoDetect = () => {
        setSelectedLanguages([]);
    };

    /**
     * 保存用户的语言选择并关闭弹窗。
     */
    const handleSave = () => {
        setPreferredLanguages(selectedLanguages.length > 0 ? selectedLanguages : null);
        onClose();
    };

    const isAutoDetect = selectedLanguages.length === 0;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-3xl p-6 w-[90%] max-w-md shadow-2xl transform transition-all scale-100 animate-scale-in max-h-[70vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center mb-2 flex-none">
                    <h3 className="text-xl font-bold text-gray-800">{t('language.title')}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <i className="fa-solid fa-times text-xl"></i>
                    </button>
                </div>

                <p className="text-gray-500 text-sm mb-3 flex-none">
                    {t('language.description')} {t('language.descriptionMulti')}
                </p>

                {/* Language List */}
                <div className="overflow-y-auto flex-1 -mx-2 px-2 mb-4">
                    {/* Auto-detect Option */}
                    <button
                        onClick={handleSelectAutoDetect}
                        className={`w-full flex items-center justify-between p-3 rounded-xl mb-2 transition-all ${
                            isAutoDetect
                                ? 'bg-brand-blue text-white'
                                : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-xl">🌍</span>
                            <div className="text-left">
                                <p className="font-medium">{t('language.autoDetect')}</p>
                                <p className={`text-xs ${isAutoDetect ? 'text-white/70' : 'text-gray-400'}`}>
                                    {t('language.autoDetectHint')}
                                </p>
                            </div>
                        </div>
                        {isAutoDetect && (
                            <i className="fa-solid fa-check"></i>
                        )}
                    </button>

                    <div className="h-px bg-gray-100 my-3"></div>

                    {/* Language Options - Multi-select */}
                    <div className="grid grid-cols-2 gap-2">
                        {SUPPORTED_LANGUAGES.map((lang) => {
                            const isSelected = selectedLanguages.includes(lang.code);
                            return (
                                <button
                                    key={lang.code}
                                    onClick={() => handleToggleLanguage(lang.code)}
                                    className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                                        isSelected
                                            ? 'bg-brand-blue text-white'
                                            : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                                    }`}
                                >
                                    <span className="font-medium text-sm truncate">{lang.nativeName}</span>
                                    {isSelected && (
                                        <i className="fa-solid fa-check text-xs ml-1 flex-none"></i>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Save Button */}
                <button
                    onClick={handleSave}
                    className="w-full py-3 bg-brand-blue text-white font-medium rounded-xl hover:bg-brand-darkBlue transition-colors flex-none"
                >
                    {t('common.save') || 'Save'}
                    {selectedLanguages.length > 0 && (
                        <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-sm">
                            {selectedLanguages.length}
                        </span>
                    )}
                </button>
            </div>
        </div>
    );
};
