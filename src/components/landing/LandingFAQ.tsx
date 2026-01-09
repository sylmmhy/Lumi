import React, { useState } from 'react';

interface FAQItem {
    question: string;
    answer: string;
}

const faqs: FAQItem[] = [
    {
        question: "What is Lumi?",
        answer: "Lumi is an AI-powered productivity companion that acts as your 'body double' - helping you stay focused, build habits, and overcome procrastination through real-time support and gentle accountability."
    },
    {
        question: "What is a body double?",
        answer: "A body double is a productivity technique where having someone present (even virtually) helps you stay focused and accountable. Lumi provides this support 24/7 through AI, so you always have a companion to help you get things done."
    },
    {
        question: "How does the AI coaching work?",
        answer: "Lumi learns your patterns, understands what you're avoiding, and provides personalized nudges and check-ins at the right moments. It's like having a supportive friend who knows exactly when you need encouragement."
    },
    {
        question: "Is Lumi free to use?",
        answer: "Lumi is currently in beta testing. Request access to try it for free and be among the first to experience AI-powered productivity coaching."
    },
    {
        question: "How is Lumi different from other habit apps?",
        answer: "Unlike passive habit trackers, Lumi actively engages with you through video check-ins, real-time conversations, and personalized interventions. We focus on accountability that actually works, not just tracking streaks."
    },
    {
        question: "Can Lumi help with ADHD?",
        answer: "Many users with ADHD find Lumi's body double approach especially helpful. The real-time presence, gentle reminders, and non-judgmental support can be valuable tools for managing executive function challenges."
    },
    {
        question: "What platforms is Lumi available on?",
        answer: "Lumi is available as a web app and mobile app for iOS and Android. You can access your AI companion from any device, anywhere."
    },
    {
        question: "How do I request beta access?",
        answer: "Click the 'Request Beta Access' button on this page to join our waitlist. We're rolling out access gradually to ensure the best experience for all users."
    }
];

export const LandingFAQ: React.FC = () => {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const toggleFAQ = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <section className="py-20 px-6 bg-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
            <div className="max-w-3xl mx-auto">
                {/* Section Title */}
                <h2 className="text-4xl md:text-5xl font-bold text-center text-gray-900 mb-12">
                    Frequently asked questions
                </h2>

                {/* FAQ Items */}
                <div className="space-y-0">
                    {faqs.map((faq, index) => (
                        <div
                            key={index}
                            className="border-b border-gray-200"
                        >
                            <button
                                onClick={() => toggleFAQ(index)}
                                className="w-full py-6 flex justify-between items-center text-left hover:text-gray-600 transition-colors"
                            >
                                <span className="text-lg font-medium text-gray-900 pr-8">
                                    {faq.question}
                                </span>
                                <span className="text-2xl text-gray-400 flex-shrink-0">
                                    {openIndex === index ? '−' : '+'}
                                </span>
                            </button>
                            {openIndex === index && (
                                <div className="pb-6 pr-12">
                                    <p className="text-gray-600 leading-relaxed">
                                        {faq.answer}
                                    </p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
