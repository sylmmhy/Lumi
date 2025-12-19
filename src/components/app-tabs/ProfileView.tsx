import React, { useState, useContext, useRef } from 'react';
import { PremiumModal, SpecialOfferModal } from '../modals/PremiumModals';
import { AvatarSelectionPopup } from '../modals/AvatarSelectionPopup';
import { FeedbackInterviewModal } from '../modals/FeedbackInterviewModal';
import { AuthContext } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

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
    const [feedbackInput, setFeedbackInput] = useState('');
    const [rating, setRating] = useState<number | null>(null); // 1-5 rating
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
    const [feedbackSent, setFeedbackSent] = useState(false);
    const [currentFeedbackId, setCurrentFeedbackId] = useState<string | null>(null); // Track current feedback session ID
    const [showInterviewModal, setShowInterviewModal] = useState(false);

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
                alert('Failed to save name. Please try again.');
            } else {
                setIsEditingName(false);
            }
        } catch (error) {
            console.error('Error saving name:', error);
            alert('Failed to save name. Please try again.');
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

        } catch (error: any) {
            console.error('Error uploading avatar:', error.message);
            alert('Failed to upload avatar. Please make sure you have created an "avatars" bucket in Supabase Storage.');
        } finally {
            setUploading(false);
        }
    };

    const handleRatingSelect = async (star: number) => {
        setRating(star);
        try {
            if (currentFeedbackId) {
                // Update existing feedback
                const { error } = await supabase!
                    .from('user_feedback')
                    .update({ rating: star })
                    .eq('id', currentFeedbackId);

                if (error) throw error;
                console.log('Rating updated:', star);
            } else {
                // Create new feedback
                const { data, error } = await supabase!
                    .from('user_feedback')
                    .insert({
                        rating: star,
                        user_id: auth?.userId || null, // Explicitly null if undefined
                        content: feedbackInput || null 
                    })
                    .select()
                    .single();

                if (error) throw error;
                if (data) {
                    setCurrentFeedbackId(data.id);
                    console.log('Rating saved, new ID:', data.id);
                }
            }
            
            // Trigger interview modal after rating (if not already shown)
            setTimeout(() => {
                setShowInterviewModal(true);
            }, 1000);
        } catch (error) {
            console.error('Error saving rating:', error);
        }
    };

    const handleFeedbackSubmit = async () => {
        if (!feedbackInput.trim()) return; // Only submit if there is text
        
        setIsSubmittingFeedback(true);
        try {
            if (currentFeedbackId) {
                // Update existing feedback with content
                const { error } = await supabase!
                    .from('user_feedback')
                    .update({
                        content: feedbackInput,
                        // Update rating too just in case state is newer, though it should be synced
                        rating: rating 
                    })
                    .eq('id', currentFeedbackId);
                
                if (error) throw error;
            } else {
                // Create new feedback
                const { data, error } = await supabase!
                    .from('user_feedback')
                    .insert({
                        content: feedbackInput,
                        rating: rating, 
                        user_id: auth?.userId || null // Explicitly null if undefined
                    })
                    .select()
                    .single();

                if (error) throw error;
                // We don't strictly need to set ID here if we are resetting immediately, 
                // but for consistency in logic flow:
                if (data) setCurrentFeedbackId(data.id);
            }
            
            setFeedbackSent(true);
            setFeedbackInput('');
            setRating(null);
            setCurrentFeedbackId(null); // Reset session so next time creates new row
            
            // 3秒后恢复初始状态
            setTimeout(() => {
                setFeedbackSent(false);
                // Show interview invite popup after feedback success animation starts
                setShowInterviewModal(true);
            }, 1500); // A bit faster than 3s to keep momentum
        } catch (error) {
            console.error('Error submitting feedback:', error);
            alert('Failed to send feedback. Please try again.');
        } finally {
            setIsSubmittingFeedback(false);
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
            alert("Thanks! I'll reach out to you soon.");
        } catch (error) {
            console.error('Error joining interview list:', error);
        }
    };

    return (
        <div className="flex-1 bg-gray-50 flex flex-col h-full relative overflow-y-auto no-scrollbar">
            {/* Header Profile Section */}
            <div className="bg-white p-4 pb-6 flex flex-col items-center shadow-sm rounded-b-[40px] z-10 relative flex-none">
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
                    <h2 className="text-2xl font-serif font-bold text-gray-800">Not logged in</h2>
                ) : isEditingName ? (
                    <div className="flex flex-col items-center gap-2 w-full px-4">
                        <input
                            type="text"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            placeholder="Enter your name"
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
                        <p className="text-xs text-gray-400">Lumi will call you by this name</p>
                        <div className="flex gap-2 mt-1">
                            <button
                                onClick={handleCancelEditName}
                                className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveName}
                                disabled={!nameInput.trim() || isSavingName}
                                className="px-4 py-1 text-sm bg-brand-blue text-white rounded-lg hover:bg-brand-darkBlue transition-colors disabled:opacity-50"
                            >
                                {isSavingName ? (
                                    <i className="fa-solid fa-spinner fa-spin"></i>
                                ) : (
                                    'Save'
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
                                {auth?.userName || auth?.userEmail?.split('@')[0] || 'Set your name'}
                            </h2>
                            <i className="fa-solid fa-pen text-xs text-gray-400 group-hover:text-brand-blue transition-colors"></i>
                        </button>
                        <p className="text-xs text-gray-400 mt-0.5">Tap to edit name</p>
                    </div>
                )}
                <p className="text-gray-500 text-sm mt-1">{isGuest ? 'Not logged in' : (auth?.userEmail || 'user@example.com')}</p>
                {isPremium && <p className="text-yellow-600 font-bold text-xs mt-1 bg-yellow-100 px-3 py-1 rounded-full">Premium Active</p>}
            </div>

            <div className="px-6 -mt-4 relative z-20">

                {/* Personal Introduction Panel with Feedback Input */}
                <div
                    className="relative overflow-hidden rounded-[32px] bg-[#F25F3A] p-6 shadow-soft mb-8"
                >
                    {/* Abstract Shapes Background - Simplified for clean look */}
                    <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full"></div>
                    <div className="absolute -left-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full"></div>

                    <div className="relative z-10 text-center">
                        <p className="font-serif text-xl font-bold leading-relaxed mb-4 text-white drop-shadow-sm flex flex-col items-center">
                            <span>Hi I‘am Miko, I have ADHD so I want to make sth help myself and others. Pls left your feedback I'm eager for that.</span>
                            <span className="mt-2 inline-block">🥹🙏❤️</span>
                        </p>

                        {/* Rating Hearts */}
                        <div className="flex justify-center gap-4 mb-5">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    onClick={() => handleRatingSelect(star)}
                                    className={`text-3xl transition-transform hover:scale-110 active:scale-95 focus:outline-none ${
                                        (rating || 0) >= star ? 'text-red-500' : 'text-white/50 hover:text-red-300'
                                    }`}
                                >
                                    <i className={`${(rating || 0) >= star ? 'fa-solid' : 'fa-regular'} fa-heart`}></i>
                                </button>
                            ))}
                        </div>

                        {/* Feedback Input Area */}
                        <div className="bg-white rounded-xl p-1.5 flex items-center gap-2 shadow-sm transition-all">
                            {feedbackSent ? (
                                <div className="w-full h-10 flex items-center justify-center gap-2 text-[#F57C00] font-bold animate-fade-in">
                                    <i className="fa-solid fa-check-circle"></i>
                                    <span>Thank you! ❤️</span>
                                </div>
                            ) : (
                                <>
                                    <textarea
                                        value={feedbackInput}
                                        onChange={(e) => setFeedbackInput(e.target.value)}
                                        placeholder="Type your feedback here..."
                                        rows={3}
                                        className="flex-1 bg-transparent border-none outline-none text-gray-800 placeholder-gray-400 px-2 text-sm font-medium resize-none py-2 leading-relaxed text-left"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleFeedbackSubmit();
                                            }
                                        }}
                                    />
                                    <div className="flex flex-col justify-end h-full pb-1">
                                        <button
                                            onClick={handleFeedbackSubmit}
                                            disabled={!feedbackInput.trim() || isSubmittingFeedback}
                                            className="w-10 h-10 rounded-lg bg-orange-50 text-[#F57C00] flex items-center justify-center hover:bg-orange-100 active:bg-orange-200 transition-all disabled:opacity-50 disabled:scale-100 flex-none"
                                        >
                                            {isSubmittingFeedback ? (
                                                <i className="fa-solid fa-spinner fa-spin"></i>
                                            ) : (
                                                <i className="fa-solid fa-paper-plane"></i>
                                            )}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Settings List - Temporarily hidden per user request */}
                {/* <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-8">
                    {showLinkedAccounts && (
                        <>
                            <MenuItem icon="fa-brands fa-google" label="Link Google Account" sub="Connected" />
                            <MenuItem icon="fa-solid fa-mobile-screen" label="Link Phone Number" />
                            <div className="h-px bg-gray-50 mx-4 my-1"></div>
                        </>
                    )}

                    <MenuItem icon="fa-brands fa-discord" label="Join Discord Community" />
                    <MenuItem icon="fa-solid fa-headset" label="Contact Developer" />

                    <div className="h-px bg-gray-50 mx-4 my-1"></div>
                    <MenuItem icon="fa-solid fa-shield-halved" label="Privacy Policy" />
                    <MenuItem icon="fa-solid fa-file-contract" label="Terms of Service" />
                    <div className="h-px bg-gray-50 mx-4 my-1"></div>
                    <MenuItem
                        icon="fa-solid fa-right-from-bracket"
                        label="Log Out"
                        isDestructive
                        onClick={handleLogout}
                    />
                </div> */}

                {/* Biography Section */}
                <div className="mb-8 mt-4">
                    <div className="bg-white rounded-3xl p-6 shadow-sm relative">
                        {/* Floating Heart Logo */}
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-white p-2 rounded-full shadow-sm">
                            <div className="w-10 h-10 bg-pink-50 rounded-full flex items-center justify-center">
                                <span className="text-2xl">💗</span>
                            </div>
                        </div>

                        <h3 className="font-serif font-bold text-gray-800 text-lg mb-4 text-center mt-4">Meet the Maker</h3>
                        
                        <div className="text-gray-600 text-sm leading-relaxed space-y-4 text-left">
                            <p>
                                Hi, I'm a female indie developer based in San Francisco and a Columbia University alum.
                            </p>
                            <p>
                                I used to be a designer, but having ADHD means I'm always eager to explore new things.
                            </p>
                            <p>
                                The rise of AI has given me the chance to build something that brings genuine happiness to myself and others, rather than letting my dreams fade in the daily grind.
                            </p>
                            <p>
                                I hope my work fosters more inclusion and awareness for neurodiversity.
                            </p>
                            <div className="pt-2 border-t border-gray-100 mt-4">
                                <p className="mt-3">
                                    I'm so glad you're here. If you're in the Bay Area, let me buy you a coffee and hang out! You can reach me at:
                                </p>
                                <a 
                                    href="mailto:ys3367@columbia.edu" 
                                    className="block mt-2 text-brand-orange font-medium hover:text-brand-darkOrange transition-colors"
                                >
                                    ys3367@columbia.edu
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Standalone Logout Button */}
                <button
                    onClick={handleAuthAction}
                    className="w-full py-3 text-red-500 font-medium bg-white rounded-xl shadow-sm border border-gray-100 hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                >
                    <i className={`fa-solid ${isGuest ? 'fa-right-to-bracket' : 'fa-right-from-bracket'}`}></i>
                    <span>{isGuest ? 'Log In / Sign Up' : 'Log Out'}</span>
                </button>
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
        </div>
    );
};
