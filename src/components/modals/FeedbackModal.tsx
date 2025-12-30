import React from 'react';
import { FeedbackCard } from '../feedback/FeedbackCard';

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    onInterviewRequest?: () => void;
}

/**
 * 反馈弹窗 - 包裹橙色反馈卡片
 */
export const FeedbackModal: React.FC<FeedbackModalProps> = ({
    isOpen,
    onClose,
    onInterviewRequest
}) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            {/* Modal Content */}
            <div
                className="relative w-full max-w-md animate-fade-in"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute -top-3 -right-3 z-10 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors"
                >
                    <i className="fa-solid fa-xmark"></i>
                </button>

                <FeedbackCard onInterviewRequest={onInterviewRequest} />
            </div>
        </div>
    );
};

export default FeedbackModal;
