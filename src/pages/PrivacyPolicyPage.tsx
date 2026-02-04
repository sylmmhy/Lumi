import { useEffect, type ReactNode } from 'react'

/**
 * 隐私政策页面
 * 用于 App Store 审核和用户查阅
 */
export function PrivacyPolicyPage() {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="min-h-screen px-5 py-10 leading-relaxed">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold text-white">Privacy Policy</h1>
        <p className="mb-8 text-slate-400">
          Last Updated: January 5, 2026
        </p>

        <Section title="1. Introduction">
          <p>
            Welcome to Lumi, operated by Meowgical LLC, a Delaware limited liability company
            ("Company," "we," "our," or "us"). Lumi is an AI-powered task management and body
            doubling application designed to help you stay focused and accomplish your goals.
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information
            when you use our mobile application and website (collectively, the "Service").
          </p>
          <p>
            By using Lumi, you agree to the collection and use of information in accordance with
            this Privacy Policy. If you do not agree with our policies and practices, please do not
            use our Service.
          </p>
        </Section>

        <Section title="2. Information We Collect">
          <SubSection title="2.1 Account Information">
            <p>When you create an account, we collect:</p>
            <ul className={listClassName}>              <li>Email address</li>
              <li>Name (optional)</li>
              <li>Profile picture (optional)</li>
              <li>Authentication credentials (securely hashed)</li>
            </ul>
          </SubSection>

          <SubSection title="2.2 Task and Usage Data">
            <p>To provide our core service, we collect:</p>
            <ul className={listClassName}>              <li>Tasks you create (descriptions, times, categories)</li>
              <li>Task completion status and history</li>
              <li>Routine and habit tracking data</li>
              <li>App usage patterns and preferences</li>
            </ul>
          </SubSection>

          <SubSection title="2.3 Device Information">
            <p>We automatically collect certain device information:</p>
            <ul className={listClassName}>              <li>Device type and operating system</li>
              <li>Unique device identifier (for analytics)</li>
              <li>Browser type (for web users)</li>
              <li>Timezone settings</li>
            </ul>
          </SubSection>

          <SubSection title="2.4 Audio and Video Data">
            <p>
              With your explicit permission, our AI coaching feature may access:
            </p>
            <ul className={listClassName}>              <li><strong>Microphone:</strong> For voice interaction with our AI assistant</li>
              <li><strong>Camera:</strong> Optional video feature for enhanced AI interaction</li>
            </ul>
            <p>
              Audio and video data is processed in real-time and is not stored on our servers.
              This data may be transmitted to our third-party AI service providers for processing during active sessions only.
            </p>
          </SubSection>
        </Section>

        <Section title="3. How We Use Your Information">
          <p>We use the collected information for the following purposes:</p>
          <ul className={listClassName}>            <li><strong>Service Delivery:</strong> To provide, maintain, and improve our task management and AI coaching features</li>
            <li><strong>Personalization:</strong> To customize your experience and provide relevant task suggestions</li>
            <li><strong>Communication:</strong> To send task reminders, updates, and support messages</li>
            <li><strong>Analytics:</strong> To understand how users interact with our Service and improve functionality</li>
            <li><strong>Security:</strong> To detect, prevent, and address technical issues and fraudulent activity</li>
          </ul>
        </Section>

        <Section title="4. Third-Party Services">
          <p>We integrate with the following third-party services:</p>

          <SubSection title="4.1 Analytics Services">
            <p>
              We use industry-standard analytics services to understand how users interact
              with our app and to improve our Service. These services collect anonymized
              usage data such as feature usage, session duration, and general interaction patterns.
            </p>
          </SubSection>

          <SubSection title="4.2 AI Services">
            <p>
              We use third-party AI services to power our coaching and interaction features.
              Audio, video, and text data may be processed by these providers during active sessions:
            </p>
            <ul className={listClassName}>              <li>
                <strong>OpenAI</strong> - AI language models and processing
                <br />
                <a href="https://openai.com/privacy" className={linkClassName}>OpenAI Privacy Policy</a>
              </li>
              <li>
                <strong>Anthropic</strong> - AI assistant and language processing
                <br />
                <a href="https://www.anthropic.com/privacy" className={linkClassName}>Anthropic Privacy Policy</a>
              </li>
              <li>
                <strong>Google Cloud AI</strong> - AI and machine learning services
                <br />
                <a href="https://policies.google.com/privacy" className={linkClassName}>Google Privacy Policy</a>
              </li>
            </ul>
          </SubSection>

          <SubSection title="4.3 Infrastructure Services">
            <ul className={listClassName}>              <li>
                <strong>Supabase</strong> - Database hosting and user authentication
                <br />
                <a href="https://supabase.com/privacy" className={linkClassName}>Supabase Privacy Policy</a>
              </li>
              <li>
                <strong>Stripe</strong> - Payment processing (we do not store your payment card details)
                <br />
                <a href="https://stripe.com/privacy" className={linkClassName}>Stripe Privacy Policy</a>
              </li>
            </ul>
          </SubSection>
        </Section>

        <Section title="5. Data Storage and Security">
          <p>
            We implement appropriate technical and organizational security measures to protect
            your personal information, including:
          </p>
          <ul className={listClassName}>            <li>Encryption of data in transit (HTTPS/TLS)</li>
            <li>Secure authentication with token-based sessions</li>
            <li>Regular security assessments</li>
            <li>Access controls and authentication for our systems</li>
          </ul>
          <p>
            Your data is stored on secure, enterprise-grade servers provided by Supabase,
            a trusted infrastructure provider. We continuously monitor and improve our
            security practices to ensure the safety of your information.
          </p>
        </Section>

        <Section title="6. Data Retention">
          <p>We retain your information for as long as:</p>
          <ul className={listClassName}>            <li>Your account remains active</li>
            <li>Necessary to provide you with our services</li>
            <li>Required by applicable laws and regulations</li>
          </ul>
          <p>
            When you delete your account, we will delete or anonymize your personal data within
            30 days, except where retention is required by law.
          </p>
        </Section>

        <Section title="7. Your Rights">
          <p>You have the following rights regarding your personal data:</p>
          <ul className={listClassName}>            <li><strong>Access:</strong> Request information about the personal data we hold about you</li>
            <li><strong>Correction:</strong> Request correction of any inaccurate data</li>
            <li><strong>Deletion:</strong> Request deletion of your account and personal data</li>
          </ul>
          <p>
            To exercise these rights, please contact us at the email address provided below.
          </p>

          <SubSection title="7.1 How to Delete Your Account">
            <p>
              You can request deletion of your account and all associated data by contacting us via email:
            </p>
            <p>
              <strong>Email:</strong>{' '}
              <a href="mailto:yilun@meetlumi.org?subject=Account%20Deletion%20Request" className={linkClassName}>
                yilun@meetlumi.org
              </a>
            </p>
            <p>Please include the following information in your request:</p>
            <ul className={listClassName}>              <li>The email address associated with your account</li>
              <li>Subject line: "Account Deletion Request"</li>
            </ul>
            <p>
              <strong>What happens when you delete your account:</strong>
            </p>
            <ul className={listClassName}>              <li>All your personal information (email, name, profile picture) will be permanently deleted</li>
              <li>All your tasks, routines, and habit tracking data will be permanently deleted</li>
              <li>Your account credentials will be removed from our authentication system</li>
              <li>Analytics data associated with your account will be anonymized</li>
            </ul>
            <p>
              We will process your deletion request within <strong>30 days</strong> and send you a confirmation
              email once your account has been deleted.
            </p>
          </SubSection>
        </Section>

        <Section title="8. Children's Privacy">
          <p>
            Our Service is not intended for children under 13 years of age. We do not knowingly
            collect personal information from children under 13. If you are a parent or guardian
            and believe your child has provided us with personal information, please contact us
            immediately.
          </p>
        </Section>

        <Section title="9. International Data Transfers">
          <p>
            Your information may be transferred to and processed in countries other than your
            country of residence. These countries may have different data protection laws.
            By using our Service, you consent to such transfers.
          </p>
        </Section>

        <Section title="10. Changes to This Privacy Policy">
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any
            changes by posting the new Privacy Policy on this page and updating the
            "Last Updated" date. We encourage you to review this Privacy Policy periodically.
          </p>
        </Section>

        <Section title="11. Contact Us">
          <p>
            If you have any questions about this Privacy Policy or our data practices,
            please contact us at:
          </p>
          <p>
            <strong>Meowgical LLC</strong>
          </p>
          <p>
            <strong>Email:</strong>{' '}
            <a href="mailto:Yilun@meetlumi.org" className={linkClassName}>Yilun@meetlumi.org</a>
          </p>
          <p>
            <strong>Website:</strong>{' '}
            <a href="https://meetlumi.org" className={linkClassName}>https://meetlumi.org</a>
          </p>
        </Section>

        <div className="mt-12 border-t border-slate-700 pt-6 text-center text-sm text-slate-500">
          <p>&copy; {new Date().getFullYear()} Lumi. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}

const linkClassName = 'text-sky-400 underline hover:text-sky-300'
const listClassName = 'list-disc space-y-1 pl-6'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-4 text-xl font-semibold text-white">{title}</h2>
      <div className="space-y-4 text-slate-300">{children}</div>
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="my-4">
      <h3 className="mb-2 text-base font-semibold text-slate-200">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  )
}
