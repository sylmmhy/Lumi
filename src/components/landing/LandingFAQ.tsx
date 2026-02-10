import React, { useState, useMemo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

interface FAQItem {
    question: string;
    answer: string;
}

export const LandingFAQ: React.FC = () => {
    const { t } = useTranslation();
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const faqs: FAQItem[] = useMemo(() => [
        {
            question: t('landing.faq.q1'),
            answer: t('landing.faq.a1')
        },
        {
            question: t('landing.faq.q2'),
            answer: t('landing.faq.a2')
        },
        {
            question: t('landing.faq.q3'),
            answer: t('landing.faq.a3')
        },
        {
            question: t('landing.faq.q4'),
            answer: t('landing.faq.a4')
        },
        {
            question: t('landing.faq.q5'),
            answer: t('landing.faq.a5')
        },
        {
            question: t('landing.faq.q6'),
            answer: t('landing.faq.a6')
        },
        {
            question: t('landing.faq.q7'),
            answer: t('landing.faq.a7')
        },
        {
            question: t('landing.faq.q8'),
            answer: t('landing.faq.a8')
        }
    ], [t]);

    const toggleFAQ = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <section className="py-20 px-6 bg-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
            <div className="max-w-3xl mx-auto">
                {/* Section Title */}
                <h2 className="text-4xl md:text-5xl font-bold text-center text-gray-900 mb-12">
                    {t('landing.faq.title')}
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
