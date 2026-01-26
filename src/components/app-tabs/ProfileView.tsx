import React, { useState, useContext, useRef, useEffect } from 'react';
import { PremiumModal, SpecialOfferModal } from '../modals/PremiumModals';
import { AvatarSelectionPopup } from '../modals/AvatarSelectionPopup';
import { FeedbackInterviewModal } from '../modals/FeedbackInterviewModal';
import { FeedbackModal } from '../modals/FeedbackModal';
import { LanguageSelectionModal } from '../modals/LanguageSelectionModal';
import { UILanguageSelectionModal } from '../modals/UILanguageSelectionModal';
import { PermissionsSection } from '../profile/PermissionsSection';
import { MemoriesSection } from '../profile/MemoriesSection';
import { AuthContext } from '../../context/AuthContextDefinition';
import { supabase } from '../../lib/supabase';
import { getPreferredLanguages, getLanguagesDisplayText, getUILanguageNativeName } from '../../lib/language';
import { getRingtoneType, setRingtoneType, type RingtoneType } from '../../lib/ringtoneSettings';
import { getVoiceMode, setVoiceMode, isLiveKitAvailable, type VoiceMode } from '../../lib/liveKitSettings';
import { getVoiceName, setVoiceName, getVoicesByGender, getVoicePreviewUrl, mapUILanguageToPreviewLanguage, type VoiceName } from '../../lib/voiceSettings';
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

    // Delete account state
    const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Account management state
    const [showAccountManageModal, setShowAccountManageModal] = useState(false);
    const [emailCopied, setEmailCopied] = useState(false);

    // Ringtone type state
    const [currentRingtoneType, setCurrentRingtoneType] = useState<RingtoneType>(getRingtoneType());

    // LiveKit mode state (iOS only)
    const [showLiveKitOption] = useState<boolean>(isLiveKitAvailable());
    const [currentVoiceMode, setCurrentVoiceMode] = useState<VoiceMode>(getVoiceMode());

    // AI Voice state
    const [currentVoiceName, setCurrentVoiceName] = useState<VoiceName>(getVoiceName());
    const [showVoiceSelectionModal, setShowVoiceSelectionModal] = useState(false);
    const [playingVoice, setPlayingVoice] = useState<VoiceName | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // 获取按性别分组的声音列表
    const maleVoices = getVoicesByGender('male');
    const femaleVoices = getVoicesByGender('female');

    // Get current UI language from context
    const { uiLanguage } = useTranslation();

    // Load current language preference
    useEffect(() => {
        setCurrentLanguages(getPreferredLanguages());
    }, [showLanguageModal, showUILanguageModal]); // Refresh when either modal closes

    // Handle ringtone type toggle
    const handleRingtoneTypeToggle = () => {
        const newType: RingtoneType = currentRingtoneType === 'voice' ? 'music' : 'voice';
        setRingtoneType(newType);
        setCurrentRingtoneType(newType);
    };

    // Handle voice mode toggle (LiveKit / WebView)
    const handleVoiceModeToggle = () => {
        const newMode: VoiceMode = currentVoiceMode === 'webview' ? 'livekit' : 'webview';
        setVoiceMode(newMode);
        setCurrentVoiceMode(newMode);
    };

    /**
     * 处理 AI 声音选择
     * @param voiceName - 选择的声音名称
     */
    const handleVoiceSelect = (voiceName: VoiceName) => {
        setVoiceName(voiceName);
        setCurrentVoiceName(voiceName);
        setShowVoiceSelectionModal(false);
    };

    /**
     * 播放声音试听
     * @param voiceName - 声音名称
     */
    const handlePlayPreview = (voiceName: VoiceName) => {
        // 如果正在播放同一个声音，停止播放
        if (playingVoice === voiceName && audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setPlayingVoice(null);
            return;
        }

        // 停止当前播放
        if (audioRef.current) {
            audioRef.current.pause();
        }

        // 根据当前 UI 语言获取对应的试听 URL
        const previewLanguage = mapUILanguageToPreviewLanguage(uiLanguage);
        const previewUrl = getVoicePreviewUrl(voiceName, previewLanguage);

        // 检查 URL 是否有效
        if (!previewUrl) {
            console.warn('No preview URL for voice:', voiceName);
            return;
        }

        // 创建新的 Audio 实例并播放
        const audio = new Audio(previewUrl);
        audioRef.current = audio;
        setPlayingVoice(voiceName);

        audio.play().catch(error => {
            console.error('Failed to play audio:', error);
            setPlayingVoice(null);
        });

        // 播放结束后重置状态
        audio.onended = () => {
            setPlayingVoice(null);
        };

        audio.onerror = () => {
            console.error('Audio playback error');
            setPlayingVoice(null);
        };
    };

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

    const handleDeleteAccount = async () => {
        if (!auth?.deleteAccount) return;

        setIsDeleting(true);
        try {
            const result = await auth.deleteAccount();
            if (result.error) {
                alert(t('profile.deleteAccountError'));
                console.error('Delete account error:', result.error);
            } else {
                setShowDeleteAccountModal(false);
                alert(t('profile.deleteAccountSuccess'));
            }
        } catch (error) {
            alert(t('profile.deleteAccountError'));
            console.error('Delete account error:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    /**
     * 复制用户邮箱到剪贴板
     * 复制成功后显示 2 秒的成功反馈
     */
    const handleCopyEmail = async () => {
        if (!auth?.userEmail) return;

        try {
            await navigator.clipboard.writeText(auth.userEmail);
            setEmailCopied(true);
            // 2 秒后重置状态
            setTimeout(() => setEmailCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy email:', error);
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
        <div className="flex-1 bg-gray-50 flex flex-col h-full relative overflow-y-auto no-scrollbar overscroll-none">
            {/* Sticky Top Bar - 始终固定在顶部，59pt 适配 iPhone 刘海 */}
            <div className="fixed top-0 left-0 right-0 bg-white z-50 flex items-end justify-start px-6 pb-3 pt-[59px] shadow-sm">
                <span className="text-[24px] text-gray-900" style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 600 }}>{t('profile.title')}</span>
            </div>

            {/* Header Profile Section - mt-[95px] 为固定 header 留出空间，pt-[30px] 头像安全距离 */}
            <div className="bg-white mt-[95px] pt-[30px] px-4 pb-6 flex flex-col items-center shadow-sm rounded-b-[40px] z-10 relative flex-none">
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
                    <button
                        onClick={handleStartEditName}
                        className="group flex items-center gap-2 hover:bg-gray-50 rounded-lg px-3 py-1 transition-colors"
                    >
                        <h2 className="text-2xl font-serif font-bold text-gray-800">
                            {auth?.userName || auth?.userEmail?.split('@')[0] || t('profile.setYourName')}
                        </h2>
                        <i className="fa-solid fa-pen text-xs text-gray-400 group-hover:text-brand-blue transition-colors"></i>
                    </button>
                )}
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
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100"
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

                    {/* Ringtone Type Setting */}
                    <button
                        onClick={handleRingtoneTypeToggle}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-pink-50 rounded-full flex items-center justify-center">
                                <i className="fa-solid fa-bell text-pink-500"></i>
                            </div>
                            <div className="text-left">
                                <p className="font-medium text-gray-800">{t('profile.ringtoneType')}</p>
                                <p className="text-sm text-gray-400">{t('profile.ringtoneTypeHint')}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">
                                {currentRingtoneType === 'voice' ? t('profile.ringtoneVoice') : t('profile.ringtoneMusic')}
                            </span>
                            <div className={`w-12 h-7 rounded-full p-1 transition-colors ${currentRingtoneType === 'music' ? 'bg-brand-blue' : 'bg-gray-300'}`}>
                                <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${currentRingtoneType === 'music' ? 'translate-x-5' : 'translate-x-0'}`} />
                            </div>
                        </div>
                    </button>

                    {/* AI Voice Gender Setting */}
                    <button
                        onClick={() => setShowVoiceSelectionModal(true)}
                        className={`w-full flex items-center justify-between p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors ${showLiveKitOption ? 'border-b border-gray-100' : ''}`}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-orange-50 rounded-full flex items-center justify-center">
                                <i className="fa-solid fa-volume-high text-orange-500"></i>
                            </div>
                            <div className="text-left">
                                <p className="font-medium text-gray-800">{t('profile.aiVoice')}</p>
                                <p className="text-sm text-gray-400">{t('profile.aiVoiceHint')}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">
                                {currentVoiceName}
                            </span>
                            <i className="fa-solid fa-chevron-right text-gray-300 text-sm"></i>
                        </div>
                    </button>

                    {/* LiveKit Voice Mode Setting - iOS Only */}
                    {showLiveKitOption && (
                        <button
                            onClick={handleVoiceModeToggle}
                            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center">
                                    <i className="fa-solid fa-phone text-green-500"></i>
                                </div>
                                <div className="text-left">
                                    <p className="font-medium text-gray-800">{t('profile.voiceMode')}</p>
                                    <p className="text-sm text-gray-400">{t('profile.voiceModeHint')}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500">
                                    {currentVoiceMode === 'livekit' ? t('profile.voiceModeLiveKit') : t('profile.voiceModeWebView')}
                                </span>
                                <div className={`w-12 h-7 rounded-full p-1 transition-colors ${currentVoiceMode === 'livekit' ? 'bg-green-500' : 'bg-gray-300'}`}>
                                    <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${currentVoiceMode === 'livekit' ? 'translate-x-5' : 'translate-x-0'}`} />
                                </div>
                            </div>
                        </button>
                    )}
                </div>

                {/* Account Management Section - Only show for logged in users */}
                {!isGuest && (
                    <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
                        <button
                            onClick={() => setShowAccountManageModal(true)}
                            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                                    <i className="fa-solid fa-user-gear text-gray-500"></i>
                                </div>
                                <div className="text-left">
                                    <p className="font-medium text-gray-800">{t('profile.accountManagement')}</p>
                                    <p className="text-sm text-gray-400">{t('profile.accountManagementHint')}</p>
                                </div>
                            </div>
                            <i className="fa-solid fa-chevron-right text-gray-300 text-sm"></i>
                        </button>
                    </div>
                )}

                {/* Device Permissions Section */}
                <PermissionsSection />

                {/* AI Memories Section */}
                <MemoriesSection />

                {/* Login/Logout Button - Below Language Settings */}
                <button
                    onClick={handleAuthAction}
                    className="w-full py-3 text-red-500 font-medium bg-white rounded-xl shadow-sm border border-gray-100 hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-center justify-center gap-2 mb-3"
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

            {/* Account Management Modal */}
            {showAccountManageModal && (
                <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col">
                    {/* Header - pt-[59px] 适配 iPhone 灵动岛/刘海安全区域 */}
                    <div className="bg-white shadow-sm px-4 pt-[59px] pb-4 flex items-center">
                        <button
                            onClick={() => setShowAccountManageModal(false)}
                            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                        >
                            <i className="fa-solid fa-arrow-left text-gray-600"></i>
                        </button>
                        <h2 className="flex-1 text-center font-bold text-lg text-gray-800 mr-10">
                            {t('profile.accountManagement')}
                        </h2>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4">
                        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                            {/* Email Row */}
                            <div className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                                        <i className="fa-solid fa-envelope text-brand-blue"></i>
                                    </div>
                                    <div className="text-left">
                                        <p className="font-medium text-gray-800">{t('profile.email')}</p>
                                        <p className="text-sm text-gray-500">{auth?.userEmail || '-'}</p>
                                    </div>
                                </div>
                                {/* 复制按钮 */}
                                {auth?.userEmail && (
                                    <button
                                        onClick={handleCopyEmail}
                                        className="w-10 h-10 rounded-full hover:bg-gray-100 active:bg-gray-200 flex items-center justify-center transition-colors"
                                        aria-label="Copy email"
                                    >
                                        {emailCopied ? (
                                            <i className="fa-solid fa-check text-green-500"></i>
                                        ) : (
                                            <i className="fa-regular fa-copy text-gray-400"></i>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Delete Account Button */}
                        <button
                            onClick={() => setShowDeleteAccountModal(true)}
                            className="w-full mt-4 py-3 text-red-500 font-medium bg-white rounded-xl shadow-sm hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                        >
                            <i className="fa-solid fa-trash-can"></i>
                            <span>{t('profile.deleteAccount')}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* AI Voice Selection Modal */}
            {showVoiceSelectionModal && (
                <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col">
                    {/* Header - pt-[59px] 适配 iPhone 灵动岛/刘海安全区域 */}
                    <div className="bg-white shadow-sm px-4 pt-[59px] pb-4 flex items-center">
                        <button
                            onClick={() => setShowVoiceSelectionModal(false)}
                            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                        >
                            <i className="fa-solid fa-arrow-left text-gray-600"></i>
                        </button>
                        <h2 className="flex-1 text-center font-bold text-lg text-gray-800 mr-10">
                            {t('profile.aiVoiceTitle')}
                        </h2>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4">
                        <p className="text-gray-500 text-sm mb-4 text-center">
                            {t('profile.aiVoiceDescription')}
                        </p>

                        {/* Male Voices Section */}
                        <div className="mb-4">
                            <div className="flex items-center gap-2 mb-2 px-1">
                                <i className="fa-solid fa-mars text-blue-500"></i>
                                <span className="text-sm font-medium text-gray-600">{t('profile.aiVoiceMale')}</span>
                            </div>
                            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                                {maleVoices.map((voice, index) => (
                                    <div
                                        key={voice.name}
                                        className={`flex items-center justify-between p-4 ${index < maleVoices.length - 1 ? 'border-b border-gray-100' : ''}`}
                                    >
                                        {/* 左侧：头像 + 名称 + 播放按钮 */}
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                                                <span className="text-blue-600 font-medium">{voice.name.charAt(0)}</span>
                                            </div>
                                            <p className="font-medium text-gray-800">{voice.displayName}</p>
                                            {/* 播放试听按钮 */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePlayPreview(voice.name);
                                                }}
                                                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center transition-colors"
                                                aria-label={`Play ${voice.name} preview`}
                                            >
                                                <i className={`fa-solid ${playingVoice === voice.name ? 'fa-stop' : 'fa-play'} text-gray-600 text-xs`}></i>
                                            </button>
                                        </div>
                                        {/* 右侧：选择按钮 */}
                                        <button
                                            onClick={() => handleVoiceSelect(voice.name)}
                                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                                                currentVoiceName === voice.name
                                                    ? 'bg-brand-blue'
                                                    : 'border-2 border-gray-300 hover:border-brand-blue'
                                            }`}
                                        >
                                            {currentVoiceName === voice.name && (
                                                <i className="fa-solid fa-check text-white text-xs"></i>
                                            )}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Female Voices Section */}
                        <div className="mb-4">
                            <div className="flex items-center gap-2 mb-2 px-1">
                                <i className="fa-solid fa-venus text-pink-500"></i>
                                <span className="text-sm font-medium text-gray-600">{t('profile.aiVoiceFemale')}</span>
                            </div>
                            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                                {femaleVoices.map((voice, index) => (
                                    <div
                                        key={voice.name}
                                        className={`flex items-center justify-between p-4 ${index < femaleVoices.length - 1 ? 'border-b border-gray-100' : ''}`}
                                    >
                                        {/* 左侧：头像 + 名称 + 播放按钮 */}
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-pink-50 rounded-full flex items-center justify-center">
                                                <span className="text-pink-600 font-medium">{voice.name.charAt(0)}</span>
                                            </div>
                                            <p className="font-medium text-gray-800">{voice.displayName}</p>
                                            {/* 播放试听按钮 */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePlayPreview(voice.name);
                                                }}
                                                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center transition-colors"
                                                aria-label={`Play ${voice.name} preview`}
                                            >
                                                <i className={`fa-solid ${playingVoice === voice.name ? 'fa-stop' : 'fa-play'} text-gray-600 text-xs`}></i>
                                            </button>
                                        </div>
                                        {/* 右侧：选择按钮 */}
                                        <button
                                            onClick={() => handleVoiceSelect(voice.name)}
                                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                                                currentVoiceName === voice.name
                                                    ? 'bg-brand-blue'
                                                    : 'border-2 border-gray-300 hover:border-brand-blue'
                                            }`}
                                        >
                                            {currentVoiceName === voice.name && (
                                                <i className="fa-solid fa-check text-white text-xs"></i>
                                            )}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Account Confirmation Modal */}
            {showDeleteAccountModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                                <i className="fa-solid fa-triangle-exclamation text-red-500 text-2xl"></i>
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">
                                {t('profile.deleteAccountTitle')}
                            </h3>
                            <p className="text-gray-500 text-sm mb-6">
                                {t('profile.deleteAccountWarning')}
                            </p>
                            <div className="flex flex-col gap-3 w-full">
                                <button
                                    onClick={handleDeleteAccount}
                                    disabled={isDeleting}
                                    className="w-full py-3 bg-red-500 text-white font-medium rounded-xl hover:bg-red-600 active:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isDeleting ? (
                                        <>
                                            <i className="fa-solid fa-spinner fa-spin"></i>
                                            <span>{t('common.processing')}</span>
                                        </>
                                    ) : (
                                        <span>{t('profile.deleteAccountConfirm')}</span>
                                    )}
                                </button>
                                <button
                                    onClick={() => setShowDeleteAccountModal(false)}
                                    disabled={isDeleting}
                                    className="w-full py-3 text-gray-500 font-medium bg-gray-100 rounded-xl hover:bg-gray-200 active:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
