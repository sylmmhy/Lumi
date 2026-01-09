import React from 'react';
import { LandingNavbar } from './LandingNavbar';
import { LandingHero } from './LandingHero';
import { LandingFeatures } from './LandingFeatures';
import { LandingTestimonials } from './LandingTestimonials';
import { LandingCTA } from './LandingCTA';
import { LandingFAQ } from './LandingFAQ';
import { LandingFooter } from './LandingFooter';

interface LandingPageProps {
    onGetStarted?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
    return (
        <div className="min-h-screen bg-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
            <LandingNavbar onGetStarted={onGetStarted} />
            <LandingHero onGetStarted={onGetStarted} />
            <section id="features">
                <LandingFeatures />
            </section>
            <section id="testimonials">
                <LandingTestimonials />
            </section>
            <LandingCTA onGetStarted={onGetStarted} />
            <section id="faq">
                <LandingFAQ />
            </section>
            <LandingFooter onGetStarted={onGetStarted} />
        </div>
    );
};
