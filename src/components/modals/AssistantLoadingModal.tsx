import React from 'react';
import { getPanelStyle, designSystem } from '../../styles/designSystem';

interface AssistantLoadingModalProps {
  isOpen: boolean;
}

export const AssistantLoadingModal: React.FC<AssistantLoadingModalProps> = ({ isOpen }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className={`relative ${getPanelStyle()} px-8 py-6 max-w-sm w-full mx-4
                      transform transition-all duration-300 scale-100 !border-white/12`}>

        {/* Subtle inner glow */}
        <div className={designSystem.patterns.innerGlow}></div>

        {/* Content */}
        <div className="flex flex-col items-center gap-4 relative z-10">
          {/* Spinner */}
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-4 border-white/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-transparent border-t-white rounded-full animate-spin"></div>
          </div>

          {/* Message */}
          <p className={`${designSystem.typography.sizes.base} ${designSystem.colors.text.primary}
                        ${designSystem.typography.fonts.body} text-center`}>
            Your assistant is on the way...
          </p>
        </div>
      </div>
    </div>
  );
};
