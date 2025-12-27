import React, { useState, useEffect } from 'react';
import { SUPPORTED_LANGUAGES, getPreferredLanguage, setPreferredLanguage } from '../../lib/language';
import { useTranslation } from '../../hooks/useTranslation';

interface LanguageSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const LanguageSelectionModal: React.FC<LanguageSelectionModalProps> = ({ isOpen, onClose }) => {
    const { t, setLanguage: setContextLanguage } = useTranslation();
    const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setSelectedLanguage(getPreferredLanguage());
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSelectLanguage = (code: string | null) => {
        setSelectedLanguage(code);
        setPreferredLanguage(code);
        setContextLanguage(code); // Update context to trigger UI re-render
        onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-3xl p-6 w-[90%] max-w-md shadow-2xl transform transition-all scale-100 animate-scale-in max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center mb-4 flex-none">
                    <h3 className="text-xl font-bold text-gray-800">{t('language.title')}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <i className="fa-solid fa-times text-xl"></i>
                    </button>
                </div>

                <p className="text-gray-500 text-sm mb-4 flex-none">
                    {t('language.description')}
                </p>

                {/* Language List */}
                <div className="overflow-y-auto flex-1 -mx-2 px-2">
                    {/* Auto-detect Option */}
                    <button
                        onClick={() => handleSelectLanguage(null)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl mb-2 transition-all ${
                            selectedLanguage === null
                                ? 'bg-brand-blue text-white'
                                : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-xl">🌍</span>
                            <div className="text-left">
                                <p className="font-medium">{t('language.autoDetect')}</p>
                                <p className={`text-xs ${selectedLanguage === null ? 'text-white/70' : 'text-gray-400'}`}>
                                    {t('language.autoDetectHint')}
                                </p>
                            </div>
                        </div>
                        {selectedLanguage === null && (
                            <i className="fa-solid fa-check"></i>
                        )}
                    </button>

                    <div className="h-px bg-gray-100 my-3"></div>

                    {/* Language Options */}
                    <div className="grid grid-cols-2 gap-2">
                        {SUPPORTED_LANGUAGES.map((lang) => (
                            <button
                                key={lang.code}
                                onClick={() => handleSelectLanguage(lang.code)}
                                className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                                    selectedLanguage === lang.code
                                        ? 'bg-brand-blue text-white'
                                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                                }`}
                            >
                                <span className="font-medium text-sm truncate">{lang.nativeName}</span>
                                {selectedLanguage === lang.code && (
                                    <i className="fa-solid fa-check text-xs ml-1 flex-none"></i>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
