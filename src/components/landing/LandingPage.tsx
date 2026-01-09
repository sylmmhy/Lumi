import React from 'react';
import { LandingHero } from './LandingHero';

interface LandingPageProps {
    onGetStarted?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
    return (
        <div className="min-h-screen" style={{ fontFamily: 'Nunito, sans-serif' }}>
            <LandingHero onGetStarted={onGetStarted} />
        </div>
    );
};
