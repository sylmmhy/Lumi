import React from 'react';

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

const testimonials: Testimonial[] = [
    {
        quote: "As a freelance designer, I used to lose entire days to procrastination. Now I just open Lumi, tell it what I need to do, and somehow I actually do it. Finished 3 client projects last month!",
        name: "Sarah Chen",
        role: "Freelance UI Designer",
        avatar: getAvatarUrl("sarah-chen")
    },
    {
        quote: "I have ADHD and body doubling is literally the only thing that works for me. Having Lumi there while I study feels like having a patient friend who never gets tired. My GPA went from 2.8 to 3.5.",
        name: "Marcus Johnson",
        role: "Computer Science Student",
        avatar: getAvatarUrl("marcus-j")
    },
    {
        quote: "Tried Focusmate, tried Forest, tried everything. Lumi is different because it actually talks to me and checks in. The AI feels weirdly human? Anyway, 45-day meditation streak and counting.",
        name: "Emily Park",
        role: "Product Manager at Spotify",
        avatar: getAvatarUrl("emily-park")
    }
];

export const LandingTestimonials: React.FC = () => {
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
                    <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-6 tracking-tight">
                        Members are getting more<br />done and feeling great
                    </h2>
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

