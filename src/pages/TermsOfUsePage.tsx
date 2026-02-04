import { useEffect, type ReactNode } from 'react'

/**
 * 服务条款页面
 * 用于 App Store 审核和用户查阅
 */
export function TermsOfUsePage() {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="min-h-screen px-5 py-10 leading-relaxed">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold text-white">Terms of Use</h1>
        <p className="mb-8 text-slate-400">
          Last Updated: December 18, 2025
        </p>

        <Section title="1. Acceptance of Terms">
          <p>
            Welcome to Lumi. By accessing or using our mobile application and website
            (collectively, the "Service"), you agree to be bound by these Terms of Use ("Terms").
            If you do not agree to these Terms, please do not use the Service.
          </p>
          <p>
            These Terms constitute a legally binding agreement between you and Meowgical LLC,
            a Delaware limited liability company ("Company," "we," "our," or "us"), operating
            the Lumi application. We reserve the right to modify these Terms at any time, and
            such modifications will be effective immediately upon posting. Your continued use
            of the Service constitutes acceptance of any modified Terms.
          </p>
        </Section>

          <Section title="2. Description of Service">
            <p>
              Lumi is an AI-powered task management and body doubling application designed to help you
              stay focused and accomplish your goals. Our Service includes:
            </p>
            <ul className={listClassName}>
              <li>Task creation, management, and tracking</li>
              <li>AI-powered coaching and voice interaction features</li>
              <li>Routine and habit tracking</li>
              <li>Focus assistance through virtual body doubling</li>
              <li>Productivity analytics and insights</li>
            </ul>
          </Section>

        <Section title="3. User Accounts">
          <SubSection title="3.1 Account Registration">
            <p>
              To access certain features of the Service, you may be required to create an account.
              You agree to provide accurate, current, and complete information during registration
              and to update such information to keep it accurate, current, and complete.
            </p>
          </SubSection>

          <SubSection title="3.2 Account Security">
            <p>
              You are responsible for safeguarding your account credentials and for all activities
              that occur under your account. You agree to notify us immediately of any unauthorized
              use of your account or any other breach of security.
            </p>
          </SubSection>

          <SubSection title="3.3 Account Termination">
            <p>
              We reserve the right to suspend or terminate your account at any time for any reason,
              including but not limited to violation of these Terms. You may also delete your account
              at any time through the app settings.
            </p>
          </SubSection>
        </Section>

          <Section title="4. User Conduct">
            <p>You agree not to use the Service to:</p>
            <ul className={listClassName}>
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe upon the rights of others</li>
              <li>Upload or transmit viruses, malware, or other malicious code</li>
              <li>Attempt to gain unauthorized access to our systems or other users' accounts</li>
              <li>Interfere with or disrupt the Service or servers connected to the Service</li>
              <li>Use the Service for any commercial purpose without our prior written consent</li>
              <li>Engage in any activity that could damage, disable, or impair the Service</li>
              <li>Use automated means to access the Service without our permission</li>
            </ul>
          </Section>

          <Section title="5. AI Features and Content">
            <SubSection title="5.1 AI-Generated Content">
              <p>
                Our Service uses artificial intelligence to provide coaching, suggestions, and assistance.
                AI-generated content is provided for informational purposes only and should not be
                considered as professional advice. You acknowledge that:
              </p>
              <ul className={listClassName}>
                <li>AI responses may not always be accurate or appropriate for your specific situation</li>
                <li>You are responsible for evaluating and using AI-generated content at your own discretion</li>
                <li>AI features are tools to assist you, not replacements for professional guidance</li>
              </ul>
            </SubSection>

          <SubSection title="5.2 Audio and Video Features">
	            <p>
	              Certain AI features may require access to your device's microphone and camera.
	              By using these features, you consent to:
	            </p>
	            <ul className={listClassName}>
	              <li>Real-time processing of audio and video data</li>
	              <li>Transmission of this data to our AI service providers for processing</li>
	              <li>The collection of usage data related to these features for service improvement</li>
	            </ul>
            <p>
              Audio and video data is processed in real-time and is not stored on our servers
              after the session ends.
            </p>
          </SubSection>
        </Section>

        <Section title="6. User Content">
          <SubSection title="6.1 Your Content">
            <p>
              You retain ownership of any content you create through the Service, including tasks,
              notes, and other user-generated content ("User Content"). By using the Service,
              you grant us a limited license to store and process your User Content solely
              for the purpose of providing the Service to you. We will not share, sell, or
              publicly display your User Content to any third parties.
            </p>
          </SubSection>

          <SubSection title="6.2 Content Responsibility">
            <p>
              You are solely responsible for your User Content. You represent and warrant that
              you have all necessary rights to your User Content and that it does not violate
              any third-party rights or applicable laws.
            </p>
          </SubSection>
        </Section>

	        <Section title="7. Intellectual Property">
	          <p>
	            The Service and its original content, features, and functionality are owned by Lumi
	            and are protected by international copyright, trademark, patent, trade secret,
	            and other intellectual property laws. You may not:
	          </p>
	          <ul className={listClassName}>
	            <li>Copy, modify, or distribute any part of the Service</li>
	            <li>Reverse engineer or attempt to extract the source code of the Service</li>
	            <li>Use our trademarks, logos, or branding without prior written permission</li>
	            <li>Create derivative works based on the Service</li>
	          </ul>
	        </Section>

        <Section title="8. Subscriptions and Payments">
          <SubSection title="8.1 Subscription Plans">
            <p>
              Certain features of the Service may require a paid subscription. Subscription
              details, including pricing and features, are available within the app or on our website.
            </p>
          </SubSection>

          <SubSection title="8.2 Billing">
            <p>
              Subscription fees are billed in advance on a recurring basis (monthly or annually,
              depending on your selected plan). Payment is processed through our third-party
              payment processor (Stripe).
            </p>
          </SubSection>

          <SubSection title="8.3 Cancellation and Refunds">
            <p>
              You may cancel your subscription at any time through your account settings or
              app store settings. Cancellation will take effect at the end of the current
              billing period. We do not provide refunds for partial subscription periods,
              except as required by applicable law.
            </p>
          </SubSection>
        </Section>

	        <Section title="9. Disclaimers">
          <p>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
            EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
            MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </p>
	          <p>
	            We do not warrant that:
	          </p>
	          <ul className={listClassName}>
	            <li>The Service will be uninterrupted, secure, or error-free</li>
	            <li>The results obtained from using the Service will be accurate or reliable</li>
	            <li>Any errors in the Service will be corrected</li>
	          </ul>
          <p>
            Lumi is a productivity tool and is not intended to provide medical, psychological,
            or professional advice. If you have concerns about your mental health or productivity,
            please consult with appropriate professionals.
          </p>
        </Section>

          <Section title="10. Limitation of Liability">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL LUMI, ITS DIRECTORS,
              EMPLOYEES, PARTNERS, AGENTS, SUPPLIERS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION,
              LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM:
            </p>
            <ul className={listClassName}>
              <li>Your access to or use of (or inability to access or use) the Service</li>
              <li>Any conduct or content of any third party on the Service</li>
              <li>Any content obtained from the Service</li>
              <li>Unauthorized access, use, or alteration of your transmissions or content</li>
            </ul>
          </Section>

        <Section title="11. Indemnification">
          <p>
            You agree to defend, indemnify, and hold harmless Lumi and its officers, directors,
            employees, and agents from and against any claims, liabilities, damages, judgments,
            awards, losses, costs, expenses, or fees (including reasonable attorneys' fees)
            arising out of or relating to your violation of these Terms or your use of the Service.
          </p>
        </Section>

        <Section title="12. Governing Law">
          <p>
            These Terms shall be governed by and construed in accordance with the laws of the
            jurisdiction in which Lumi operates, without regard to its conflict of law provisions.
            Any disputes arising from these Terms or the Service shall be resolved through
            binding arbitration or in the courts of competent jurisdiction.
          </p>
        </Section>

        <Section title="13. Severability">
          <p>
            If any provision of these Terms is held to be invalid or unenforceable, the remaining
            provisions will continue in full force and effect. The invalid or unenforceable
            provision will be modified to the minimum extent necessary to make it valid and enforceable.
          </p>
        </Section>

          <Section title="14. Contact Us">
            <p>
              If you have any questions about these Terms of Use, please contact us at:
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
