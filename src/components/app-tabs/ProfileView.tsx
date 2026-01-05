import React, { useState, useContext, useRef, useEffect } from 'react';
import { PremiumModal, SpecialOfferModal } from '../modals/PremiumModals';
import { AvatarSelectionPopup } from '../modals/AvatarSelectionPopup';
import { FeedbackInterviewModal } from '../modals/FeedbackInterviewModal';
import { FeedbackModal } from '../modals/FeedbackModal';
import { LanguageSelectionModal } from '../modals/LanguageSelectionModal';
import { UILanguageSelectionModal } from '../modals/UILanguageSelectionModal';
import { AuthContext } from '../../context/AuthContextDefinition';
import { supabase } from '../../lib/supabase';
import { getPreferredLanguages, getLanguagesDisplayText, getUILanguageNativeName } from '../../lib/language';
import { useTranslation } from '../../hooks/useTranslation';

interface ProfileViewProps {
    isPremium: boolean;
    onRequestLogin?: () => void;
}

/**
 * 个人资料视图，展示用户信息、会员入口与设置项。
 * 
 * @param props.isPremium - 当前用户是否为付费用户
 * @returns Profile 页面内容
 */
export const ProfileView: React.FC<ProfileViewProps> = ({ isPremium, onRequestLogin }) => {
    const { t } = useTranslation();
    const auth = useContext(AuthContext);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [showPremiumModal, setShowPremiumModal] = useState(false);
    const [showSpecialOffer, setShowSpecialOffer] = useState(false);
    const [showAvatarPopup, setShowAvatarPopup] = useState(false);
    const [offerClaimed, setOfferClaimed] = useState(false); // Used to ensure one-time popup
    const isGuest = !auth?.isLoggedIn;
    
    // Name editing state
    const [isEditingName, setIsEditingName] = useState(false);
    const [nameInput, setNameInput] = useState('');
    const [isSavingName, setIsSavingName] = useState(false);

    // Feedback state
    const [showInterviewModal, setShowInterviewModal] = useState(false);
    const [showLanguageModal, setShowLanguageModal] = useState(false);
    const [showUILanguageModal, setShowUILanguageModal] = useState(false);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [currentLanguages, setCurrentLanguages] = useState<string[]>([]);

    // Get current UI language from context
    const { uiLanguage } = useTranslation();

    // Load current language preference
    useEffect(() => {
        setCurrentLanguages(getPreferredLanguages());
    }, [showLanguageModal, showUILanguageModal]); // Refresh when either modal closes

    const handleClosePremium = () => {
        setShowPremiumModal(false);
        // Trigger special offer if not already claimed/shown and user is NOT premium
        if (!offerClaimed && !isPremium) {
            setTimeout(() => {
                setShowSpecialOffer(true);
                setOfferClaimed(true);
            }, 300);
        }
    };

    const handleAuthAction = () => {
        if (isGuest) {
            onRequestLogin?.();
            return;
        }
        if (window.confirm('确定要退出登录吗？')) {
            // 保持在当前页面，仅切换为未登录状态
            auth?.logout();
        }
    };

    const handleAvatarClick = () => {
        setShowAvatarPopup(true);
    };

    const handleStartEditName = () => {
        setNameInput(auth?.userName || '');
        setIsEditingName(true);
    };

    const handleSaveName = async () => {
        if (!nameInput.trim()) return;

        setIsSavingName(true);
        try {
            const result = await auth?.updateProfile({ name: nameInput.trim() });
            if (result?.error) {
                console.error('Error saving name:', result.error);
                alert(t('profile.saveFailed'));
            } else {
                setIsEditingName(false);
            }
        } catch (error) {
            console.error('Error saving name:', error);
            alert(t('profile.saveFailed'));
        } finally {
            setIsSavingName(false);
        }
    };

    const handleCancelEditName = () => {
        setIsEditingName(false);
        setNameInput('');
    };

    const handleUploadClick = () => {
        setShowAvatarPopup(false);
        fileInputRef.current?.click();
    };

    const handleSelectAvatar = async (avatarUrl: string) => {
        setShowAvatarPopup(false);
        try {
            await auth?.updateProfile({ pictureUrl: avatarUrl });
        } catch (error) {
            console.error('Error updating avatar:', error);
        }
    };

    // Random default avatar logic
    React.useEffect(() => {
        // 1. 如果未登录、或用户已有头像，则不处理
        if (!auth || isGuest || auth.userPicture) return;

        // 2. 定义可选头像
        const AVATAR_OPTIONS = [
            '/avatars/avatar1.png',
            '/avatars/avatar2.png',
            '/avatars/avatar3.png',
            '/avatars/avatar4.png',
        ];

        // 3. 使用用户 ID (auth.userId) 作为随机种子，确保同一个用户永远得到相同的“随机”头像
        // 简单的哈希算法：将 userId 字符串的字符代码相加
        let hash = 0;
        if (auth.userId) {
            for (let i = 0; i < auth.userId.length; i++) {
                hash = auth.userId.charCodeAt(i) + ((hash << 5) - hash);
            }
        }
        
        // 4. 取模得到固定索引（使用 Math.abs 确保正数）
        const index = Math.abs(hash) % AVATAR_OPTIONS.length;
        const consistentRandomAvatar = AVATAR_OPTIONS[index];

        // 5. 更新用户资料
        auth.updateProfile({ pictureUrl: consistentRandomAvatar });
    }, [auth, auth?.userId, auth?.userPicture, isGuest]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        try {
            setUploading(true);
            const file = event.target.files?.[0];
            if (!file || !auth?.userId) return;

            const fileExt = file.name.split('.').pop();
            const fileName = `${auth.userId}/${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            // 1. Upload image to 'avatars' bucket
            const { error: uploadError } = await supabase!.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) {
                throw uploadError;
            }

            // 2. Get public URL
            const { data: { publicUrl } } = supabase!.storage
                .from('avatars')
                .getPublicUrl(filePath);

            // 3. Update profile
            await auth.updateProfile({ pictureUrl: publicUrl });

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('Error uploading avatar:', message);
            alert('Failed to upload avatar. Please make sure you have created an "avatars" bucket in Supabase Storage.');
        } finally {
            setUploading(false);
        }
    };

    const handleJoinInterview = async (email?: string) => {
        setShowInterviewModal(false);
        
        // Determine user ID and email to save
        let userIdToSave = auth?.userId;
        let emailToSave = email || auth?.userEmail || 'none'; // Fallback to 'none' if no email available

        try {
            const { error } = await supabase!
                .from('interview_leads')
                .insert({
                    user_id: userIdToSave || null,
                    email: emailToSave,
                    status: 'interested'
                });

            if (error) throw error;
            alert(t('feedback.thanksSoon'));
        } catch (error) {
            console.error('Error joining interview list:', error);
        }
    };

    return (
        <div className="flex-1 bg-gray-50 flex flex-col h-full relative overflow-y-auto no-scrollbar">
            {/* Header Profile Section */}
            <div className="bg-white pt-12 px-4 pb-6 flex flex-col items-center shadow-sm rounded-b-[40px] z-10 relative flex-none">
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                />
                <div className="w-24 h-24 bg-gray-100 rounded-full mb-4 flex items-center justify-center text-4xl shadow-inner relative border-2 border-white">
                    {!isGuest && auth?.userPicture ? (
                        <img
                            src={auth.userPicture}
                            alt="Avatar"
                            className="w-full h-full rounded-full object-cover"
                        />
                    ) : (
                        <span>😐</span>
                    )}

                    {isPremium && (
                        <div className="absolute -top-1 -right-1 w-8 h-8 bg-yellow-400 rounded-full text-white text-sm flex items-center justify-center shadow-md border-2 border-white">
                            <i className="fa-solid fa-crown text-yellow-900"></i>
                        </div>
                    )}
                    {!isGuest && (
                        <button
                            onClick={handleAvatarClick}
                            disabled={uploading}
                            className="absolute bottom-0 right-0 w-8 h-8 bg-brand-blue rounded-full text-white text-sm flex items-center justify-center shadow-md border-2 border-white hover:bg-brand-darkBlue transition-colors disabled:opacity-50"
                        >
                            {uploading ? (
                                <i className="fa-solid fa-spinner fa-spin"></i>
                            ) : (
                                <i className="fa-solid fa-pen"></i>
                            )}
                        </button>
                    )}
                </div>
                {/* Name Display/Edit Section */}
                {isGuest ? (
                    <h2 className="text-2xl font-serif font-bold text-gray-800">{t('profile.notLoggedIn')}</h2>
                ) : isEditingName ? (
                    <div className="flex flex-col items-center gap-2 w-full px-4">
                        <input
                            type="text"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            placeholder={t('profile.enterName')}
                            className="text-xl font-serif font-bold text-gray-800 text-center bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 w-full max-w-[200px] focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveName();
                                } else if (e.key === 'Escape') {
                                    handleCancelEditName();
                                }
                            }}
                        />
                        <p className="text-xs text-gray-400">{t('profile.nameHint')}</p>
                        <div className="flex gap-2 mt-1">
                            <button
                                onClick={handleCancelEditName}
                                className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleSaveName}
                                disabled={!nameInput.trim() || isSavingName}
                                className="px-4 py-1 text-sm bg-brand-blue text-white rounded-lg hover:bg-brand-darkBlue transition-colors disabled:opacity-50"
                            >
                                {isSavingName ? (
                                    <i className="fa-solid fa-spinner fa-spin"></i>
                                ) : (
                                    t('common.save')
                                )}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center">
                        <button
                            onClick={handleStartEditName}
                            className="group flex items-center gap-2 hover:bg-gray-50 rounded-lg px-3 py-1 transition-colors"
                        >
                            <h2 className="text-2xl font-serif font-bold text-gray-800">
                                {auth?.userName || auth?.userEmail?.split('@')[0] || t('profile.setYourName')}
                            </h2>
                            <i className="fa-solid fa-pen text-xs text-gray-400 group-hover:text-brand-blue transition-colors"></i>
                        </button>
                        <p className="text-xs text-gray-400 mt-0.5">{t('profile.tapToEdit')}</p>
                    </div>
                )}
                <p className="text-gray-500 text-sm mt-1">{isGuest ? t('profile.notLoggedIn') : (auth?.userEmail || 'user@example.com')}</p>
                {isPremium && <p className="text-yellow-600 font-bold text-xs mt-1 bg-yellow-100 px-3 py-1 rounded-full">{t('profile.premiumActive')}</p>}
            </div>

            <div className="px-6 -mt-4 relative z-20">

                {/* Settings Section - Language Selection */}
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
                    {/* UI Language Setting */}
                    <button
                        onClick={() => setShowUILanguageModal(true)}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center">
                                <i className="fa-solid fa-globe text-purple-500"></i>
                            </div>
                            <div className="text-left">
                                <p className="font-medium text-gray-800">{t('profile.uiLanguage')}</p>
                                <p className="text-sm text-gray-400">{t('profile.uiLanguageHint')}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">
                                {getUILanguageNativeName(uiLanguage)}
                            </span>
                            <i className="fa-solid fa-chevron-right text-gray-300 text-sm"></i>
                        </div>
                    </button>

                    {/* Lumi Voice Language Setting */}
                    <button
                        onClick={() => setShowLanguageModal(true)}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                                <i className="fa-solid fa-microphone text-brand-blue"></i>
                            </div>
                            <div className="text-left">
                                <p className="font-medium text-gray-800">{t('profile.lumiLanguage')}</p>
                                <p className="text-sm text-gray-400">{t('profile.voiceLanguage')}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">
                                {getLanguagesDisplayText(currentLanguages)}
                            </span>
                            <i className="fa-solid fa-chevron-right text-gray-300 text-sm"></i>
                        </div>
                    </button>
                </div>

                {/* Login/Logout Button - Below Language Settings */}
                <button
                    onClick={handleAuthAction}
                    className="w-full py-3 text-red-500 font-medium bg-white rounded-xl shadow-sm border border-gray-100 hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-center justify-center gap-2 mb-6"
                >
                    <i className={`fa-solid ${isGuest ? 'fa-right-to-bracket' : 'fa-right-from-bracket'}`}></i>
                    <span>{isGuest ? t('profile.loginSignup') : t('profile.logout')}</span>
                </button>

                {/* Biography Section */}
                <div className="mb-8 mt-4">
                    <div className="bg-white rounded-3xl p-6 shadow-sm relative">
                        {/* Floating Heart Logo */}
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-white p-2 rounded-full shadow-sm">
                            <div className="w-10 h-10 bg-pink-50 rounded-full flex items-center justify-center">
                                <span className="text-2xl">💗</span>
                            </div>
                        </div>

                        <h3 className="font-serif font-bold text-gray-800 text-lg mb-4 text-center mt-4">{t('profile.meetTheMaker')}</h3>

                        <div className="text-gray-600 text-sm leading-relaxed space-y-4 text-left">
                            <p>
                                {t('profile.makerIntro')}
                            </p>
                            <p>
                                {t('profile.makerAdhd')}
                            </p>
                            <p>
                                {t('profile.makerDream')}
                            </p>
                            <p>
                                {t('profile.makerHope')}
                            </p>
                            <div className="pt-2 border-t border-gray-100 mt-4">
                                <p className="mt-3">
                                    {t('profile.makerContact')}
                                </p>
                                <a
                                    href="mailto:ys3367@columbia.edu"
                                    className="block mt-2 text-brand-orange font-medium hover:text-brand-darkOrange transition-colors"
                                >
                                    ys3367@columbia.edu
                                </a>

                                {/* Share Feedback Button */}
                                <button
                                    onClick={() => setShowFeedbackModal(true)}
                                    className="w-full mt-4 py-3 px-4 bg-gradient-to-r from-[#F25F3A] to-[#FF7849] text-white font-medium rounded-xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                >
                                    <i className="fa-solid fa-comment-dots"></i>
                                    <span>Share Your Feedback</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* Bottom Spacer */}
            <div className="h-24 flex-none"></div>

            {showPremiumModal && <PremiumModal onClose={handleClosePremium} />}
            {showSpecialOffer && <SpecialOfferModal onClose={() => setShowSpecialOffer(false)} />}
            {showAvatarPopup && (
                <AvatarSelectionPopup
                    onClose={() => setShowAvatarPopup(false)}
                    onSelectAvatar={handleSelectAvatar}
                    onUploadClick={handleUploadClick}
                />
            )}
            
            <FeedbackInterviewModal
                isOpen={showInterviewModal}
                onClose={() => setShowInterviewModal(false)}
                onConfirm={handleJoinInterview}
                isGuest={isGuest}
            />

            {showLanguageModal && (
                <LanguageSelectionModal
                    isOpen={showLanguageModal}
                    onClose={() => setShowLanguageModal(false)}
                />
            )}

            {showUILanguageModal && (
                <UILanguageSelectionModal
                    isOpen={showUILanguageModal}
                    onClose={() => setShowUILanguageModal(false)}
                />
            )}

            <FeedbackModal
                isOpen={showFeedbackModal}
                onClose={() => setShowFeedbackModal(false)}
                onInterviewRequest={() => {
                    setShowFeedbackModal(false);
                    setTimeout(() => setShowInterviewModal(true), 300);
                }}
            />
        </div>
    );
};
