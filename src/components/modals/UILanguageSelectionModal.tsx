import React, { useState, useEffect } from 'react';
import { SUPPORTED_UI_LANGUAGES, getUILanguage } from '../../lib/language';
import { useTranslation } from '../../hooks/useTranslation';

interface UILanguageSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const UILanguageSelectionModal: React.FC<UILanguageSelectionModalProps> = ({ isOpen, onClose }) => {
    const { t, setUILanguage } = useTranslation();
    const [selectedLanguage, setSelectedLanguage] = useState<string>('en');

    useEffect(() => {
        if (isOpen) {
            setSelectedLanguage(getUILanguage());
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSelectLanguage = (code: string) => {
        setSelectedLanguage(code);
        setUILanguage(code);
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
                    <h3 className="text-xl font-bold text-gray-800">{t('uiLanguage.title')}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <i className="fa-solid fa-times text-xl"></i>
                    </button>
                </div>

                <p className="text-gray-500 text-sm mb-4 flex-none">
                    {t('uiLanguage.description')}
                </p>

                {/* Language List */}
                <div className="overflow-y-auto flex-1 -mx-2 px-2">
                    <div className="space-y-2">
                        {SUPPORTED_UI_LANGUAGES.map((lang) => (
                            <button
                                key={lang.code}
                                onClick={() => handleSelectLanguage(lang.code)}
                                className={`w-full flex items-center justify-between p-4 rounded-xl transition-all ${
                                    selectedLanguage === lang.code
                                        ? 'bg-brand-blue text-white'
                                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="font-medium">{lang.nativeName}</span>
                                    <span className={`text-sm ${selectedLanguage === lang.code ? 'text-white/70' : 'text-gray-400'}`}>
                                        ({lang.name})
                                    </span>
                                </div>
                                {selectedLanguage === lang.code && (
                                    <i className="fa-solid fa-check"></i>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
