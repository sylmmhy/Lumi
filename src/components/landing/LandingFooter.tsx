import React from 'react';

interface LandingFooterProps {
    onGetStarted?: () => void;
}

export const LandingFooter: React.FC<LandingFooterProps> = ({ onGetStarted: _onGetStarted }) => {
    return (
        <footer className="py-8 bg-gray-900 text-white">
            <div className="container mx-auto px-4 text-center">
                {/* TODO: Add footer content */}
            </div>
        </footer>
    );
};
