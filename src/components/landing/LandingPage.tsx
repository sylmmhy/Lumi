import React from 'react';
import { LandingHero } from './LandingHero';
import { LandingFeatures } from './LandingFeatures';
import { LandingTestimonials } from './LandingTestimonials';
import { LandingFooter } from './LandingFooter';

interface LandingPageProps {
    onGetStarted?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
    return (
        <div className="min-h-screen bg-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
            <LandingHero onGetStarted={onGetStarted} />
            <LandingFeatures />
            <LandingTestimonials />
            <LandingFooter onGetStarted={onGetStarted} />
        </div>
    );
};
