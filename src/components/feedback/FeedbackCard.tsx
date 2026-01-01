import React, { useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContextDefinition';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../hooks/useTranslation';

interface FeedbackCardProps {
    onInterviewRequest?: () => void;
}

/**
 * 橙色反馈卡片组件 - 包含评分心形和文字反馈输入
 */
export const FeedbackCard: React.FC<FeedbackCardProps> = ({ onInterviewRequest }) => {
    const { t } = useTranslation();
    const auth = useContext(AuthContext);

    const [feedbackInput, setFeedbackInput] = useState('');
    const [rating, setRating] = useState<number | null>(null);
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
    const [feedbackSent, setFeedbackSent] = useState(false);
    const [currentFeedbackId, setCurrentFeedbackId] = useState<string | null>(null);

    const handleRatingSelect = async (star: number) => {
        setRating(star);
        try {
            if (currentFeedbackId) {
                const { error } = await supabase!
                    .from('user_feedback')
                    .update({ rating: star })
                    .eq('id', currentFeedbackId);

                if (error) throw error;
                console.log('Rating updated:', star);
            } else {
                const { data, error } = await supabase!
                    .from('user_feedback')
                    .insert({
                        rating: star,
                        user_id: auth?.userId || null,
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

            // Trigger interview modal after rating
            setTimeout(() => {
                onInterviewRequest?.();
            }, 1000);
        } catch (error) {
            console.error('Error saving rating:', error);
        }
    };

    const handleFeedbackSubmit = async () => {
        if (!feedbackInput.trim()) return;

        setIsSubmittingFeedback(true);
        try {
            if (currentFeedbackId) {
                const { error } = await supabase!
                    .from('user_feedback')
                    .update({
                        content: feedbackInput,
                        rating: rating
                    })
                    .eq('id', currentFeedbackId);

                if (error) throw error;
            } else {
                const { data, error } = await supabase!
                    .from('user_feedback')
                    .insert({
                        content: feedbackInput,
                        rating: rating,
                        user_id: auth?.userId || null
                    })
                    .select()
                    .single();

                if (error) throw error;
                if (data) {
                    setCurrentFeedbackId(data.id);
                }
            }

            setFeedbackSent(true);
            setFeedbackInput('');

            setTimeout(() => {
                onInterviewRequest?.();
            }, 1500);

        } catch (error) {
            console.error('Error submitting feedback:', error);
            alert(t('profile.feedbackFailed'));
        } finally {
            setIsSubmittingFeedback(false);
        }
    };

    return (
        <div className="relative overflow-hidden rounded-[32px] bg-[#F25F3A] p-6 shadow-soft">
            {/* Abstract Shapes Background */}
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full"></div>
            <div className="absolute -left-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full"></div>

            <div className="relative z-10 text-center">
                <h2 className="font-sans text-2xl font-bold leading-tight mb-3 text-white drop-shadow-sm">
                    {t('profile.feedbackTitle')}
                </h2>
                <p className="font-sans text-base font-medium leading-relaxed mb-4 text-white">
                    {t('profile.feedbackBody')}
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
                            <span>{t('profile.thankYou')} ❤️</span>
                        </div>
                    ) : (
                        <>
                            <textarea
                                value={feedbackInput}
                                onChange={(e) => setFeedbackInput(e.target.value)}
                                placeholder={t('profile.feedbackPlaceholder')}
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
    );
};

export default FeedbackCard;
