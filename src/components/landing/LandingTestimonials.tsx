import React, { useMemo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

interface Testimonial {
    quote: string;
    name: string;
    role: string;
    avatar: string;
}

/**
 * 使用 DiceBear API 生成无版权头像
 * https://www.dicebear.com/ - 免费开源头像生成服务
 */
const getAvatarUrl = (seed: string) =>
    `https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

export const LandingTestimonials: React.FC = () => {
    const { t } = useTranslation();

    const testimonials: Testimonial[] = useMemo(() => [
        {
            quote: t('landing.testimonials.quote1'),
            name: t('landing.testimonials.name1'),
            role: t('landing.testimonials.role1'),
            avatar: getAvatarUrl("sleep-user")
        },
        {
            quote: t('landing.testimonials.quote2'),
            name: t('landing.testimonials.name2'),
            role: t('landing.testimonials.role2'),
            avatar: getAvatarUrl("meals-user")
        },
        {
            quote: t('landing.testimonials.quote3'),
            name: t('landing.testimonials.name3'),
            role: t('landing.testimonials.role3'),
            avatar: getAvatarUrl("habit-user")
        }
    ], [t]);
    return (
        <section
            className="py-24 px-6 relative overflow-hidden"
            style={{
                fontFamily: 'Nunito, sans-serif',
                background: 'linear-gradient(to bottom, #FFFFFF 0%, #FAFBFC 100%)'
            }}
        >
            {/* Subtle Dot Pattern for texture */}
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#2545BD 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

            <div className="max-w-6xl mx-auto relative z-10">
                {/* Section Title */}
                <div className="text-center mb-20">
                    <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-4 tracking-tight">
                        {t('landing.testimonials.heading')}
                    </h2>
                    <p className="text-lg text-gray-500 font-medium mb-6">
                        {t('landing.testimonials.subtitle')}
                    </p>
                    <div className="w-20 h-1.5 bg-[#2545BD] mx-auto rounded-full opacity-20" />
                </div>

                {/* Testimonial Cards */}
                <div className="grid md:grid-cols-3 gap-8">
                    {testimonials.map((testimonial, index) => (
                        <div
                            key={index}
                            className="bg-white border border-gray-100 rounded-[32px] p-10 flex flex-col justify-between transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.04)] group"
                        >
                            <div className="mb-10">
                                <span className="text-6xl text-[#2545BD] opacity-10 font-serif leading-none block mb-[-20px]">“</span>
                                <p className="text-xl text-gray-700 font-medium leading-relaxed relative z-10">
                                    {testimonial.quote}
                                </p>
                            </div>
                            <div className="flex items-center gap-4">
                                <img
                                    src={testimonial.avatar}
                                    alt={testimonial.name}
                                    className="w-12 h-12 rounded-full bg-gray-100"
                                />
                                <div>
                                    <p className="text-base font-bold text-gray-900">
                                        {testimonial.name}
                                    </p>
                                    <p className="text-sm text-gray-400">
                                        {testimonial.role}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

