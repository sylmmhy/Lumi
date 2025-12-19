import React from 'react';

interface AvatarSelectionPopupProps {
    onClose: () => void;
    onSelectAvatar: (avatarUrl: string) => void;
    onUploadClick: () => void;
}

const AVATAR_OPTIONS = [
    '/avatars/avatar1.png',
    '/avatars/avatar2.png',
    '/avatars/avatar3.png',
    '/avatars/avatar4.png',
];

export const AvatarSelectionPopup: React.FC<AvatarSelectionPopupProps> = ({ onClose, onSelectAvatar, onUploadClick }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-3xl p-6 w-[90%] max-w-sm shadow-2xl transform transition-all scale-100 animate-scale-in" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-800">Choose Avatar</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <i className="fa-solid fa-times text-xl"></i>
                    </button>
                </div>

                <div className="grid grid-cols-3 gap-4 justify-items-center">
                    {AVATAR_OPTIONS.map((avatar, index) => (
                        <button
                            key={index}
                            onClick={() => onSelectAvatar(avatar)}
                            className="w-20 h-20 rounded-full overflow-hidden border-2 border-transparent hover:border-brand-blue hover:scale-105 transition-all shadow-sm"
                        >
                            <img src={avatar} alt={`Avatar ${index + 1}`} className="w-full h-full object-cover" />
                        </button>
                    ))}

                    <button
                        onClick={onUploadClick}
                        className="w-20 h-20 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-brand-blue hover:border-brand-blue hover:bg-blue-50 transition-all"
                    >
                        <i className="fa-solid fa-plus text-2xl"></i>
                    </button>
                </div>
            </div>
        </div>
    );
};
