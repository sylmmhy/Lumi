import React, { useState } from 'react';

interface FeedbackInterviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (email?: string) => void;
    isGuest?: boolean;
}

/**
 * 收集用户反馈访谈意愿与邮箱的模态框。
 *
 * @param {FeedbackInterviewModalProps} props - 控制显示与回调的参数
 * @returns {JSX.Element | null} 访谈邀请或邮箱收集的模态框
 */
export const FeedbackInterviewModal: React.FC<FeedbackInterviewModalProps> = ({ isOpen, onClose, onConfirm, isGuest }) => {
    const [email, setEmail] = useState('');
    const [step, setStep] = useState<'confirm' | 'email'>('confirm');

    if (!isOpen) return null;

    const handleInterestClick = () => {
        if (isGuest) {
            setStep('email');
        } else {
            onConfirm();
        }
    };

    const handleEmailSubmit = () => {
        if (!email || !email.includes('@')) {
            alert('Please enter a valid email address');
            return;
        }
        onConfirm(email);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm p-6 text-center relative animate-fade-in">
                <h3 className="text-2xl font-serif font-bold italic text-brand-orange mb-4">
                    {step === 'confirm' ? 'Thank you for your feedback!' : 'Contact Info'}
                </h3>
                
                {step === 'confirm' ? (
                    <>
                        <p className="text-gray-600 mb-6 leading-relaxed">
                            If you're open to a 15-minute chat, I'd love to buy you a coffee ($5) as a thank you. Your insights mean the world to me!
                        </p>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleInterestClick}
                                className="w-full bg-brand-orange text-white font-bold py-3 rounded-xl shadow-lg shadow-orange-200 active:scale-95 transition-all hover:bg-brand-darkOrange"
                            >
                                Yes, I'm interested! ☕
                            </button>
                            <button
                                onClick={onClose}
                                className="w-full bg-gray-100 text-gray-500 font-medium py-3 rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                No thanks
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-gray-600 mb-4 leading-relaxed text-sm">
                            Please leave your email so I can contact you for the coffee chat!
                        </p>
                        <input
                            type="email"
                            placeholder="your@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 mb-4 focus:outline-none focus:ring-2 focus:ring-brand-orange/20 bg-gray-50 text-gray-800 placeholder:text-gray-400 font-semibold"
                            autoFocus
                        />
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleEmailSubmit}
                                className="w-full bg-brand-orange text-white font-bold py-3 rounded-xl shadow-lg shadow-orange-200 active:scale-95 transition-all hover:bg-brand-darkOrange"
                            >
                                Submit
                            </button>
                            <button
                                onClick={() => setStep('confirm')}
                                className="w-full bg-transparent text-gray-400 font-medium py-2 hover:text-gray-600 text-sm"
                            >
                                Back
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
