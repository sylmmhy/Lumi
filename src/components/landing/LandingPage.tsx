import React from 'react';
import { LandingNavbar } from './LandingNavbar';
import { LandingHero } from './LandingHero';
import { LandingFeatures } from './LandingFeatures';
import { LandingTestimonials } from './LandingTestimonials';
import { LandingCTA } from './LandingCTA';
import { LandingFAQ } from './LandingFAQ';
import { LandingFooter } from './LandingFooter';

interface LandingPageProps {
    /** 点击"Download on App Store"按钮的回调 */
    onDownloadiOS?: () => void;
    /** 点击"Android Beta"按钮的回调 */
    onRequestAndroid?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onDownloadiOS, onRequestAndroid }) => {
    return (
        <div className="min-h-screen bg-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
            <LandingNavbar onDownloadiOS={onDownloadiOS} />
            <LandingHero onDownloadiOS={onDownloadiOS} onRequestAndroid={onRequestAndroid} />
            <section id="features">
                <LandingFeatures />
            </section>
            <section id="testimonials">
                <LandingTestimonials />
            </section>
            <LandingCTA onDownloadiOS={onDownloadiOS} onRequestAndroid={onRequestAndroid} />
            <section id="faq">
                <LandingFAQ />
            </section>
            <LandingFooter onDownloadiOS={onDownloadiOS} />
        </div>
    );
};
