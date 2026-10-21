import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';
import { CONTACT_EMAIL } from '@/components/shell/SiteFooter';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Get help with AuraFit: contact us, sign-in problems, deleting your account and reporting content.',
  alternates: { canonical: '/support' },
};
export const dynamic = 'force-static';

const TOC = [
  { id: 'contact', label: 'Contact us' },
  { id: 'sign-in', label: 'Signing in' },
  { id: 'progress', label: 'Progress and sync' },
  { id: 'reminders', label: 'Streak reminders' },
  { id: 'squads', label: 'Squads' },
  { id: 'report', label: 'Reporting content' },
  { id: 'delete', label: 'Deleting your account' },
] as const;

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

export default function SupportPage() {
  return (
    <LegalPage
      viewer={null}
      eyebrow="Help"
      title="AuraFit Support"
      toc={TOC}
      intro={<p>Answers to common questions about the AuraFit app and website. Can&apos;t find what you need? Email us and we will help.</p>}
    >
      <LegalSection id="contact" title="Contact us">
        <p>
          Email {mail}. We usually reply within two business days. Include the email address on your AuraFit account and, for app
          problems, your phone model and what you were doing when it happened.
        </p>
      </LegalSection>

      <LegalSection id="sign-in" title="Signing in">
        <ul>
          <li>
            Forgot your password? Tap <strong>Log in</strong> → <strong>Forgot password</strong> in the app, or use{' '}
            <Link href="/forgot-password">reset your password</Link> on the web. We email you a reset link.
          </li>
          <li>Didn&apos;t get the email? Check your spam folder, wait a few minutes and try again.</li>
          <li>The same account works in the iPhone app, the Android app and on the web.</li>
        </ul>
      </LegalSection>

      <LegalSection id="progress" title="Progress and sync">
        <p>
          When you are signed in, your Aura, rank, streak and workout history are saved to your account and follow you to every device.
          <strong> Try demo</strong> mode uses sample data that stays on that device only; create an account to keep real progress.
        </p>
      </LegalSection>

      <LegalSection id="reminders" title="Streak reminders">
        <p>
          AuraFit can remind you before your streak runs out. Allow notifications when the app asks, or turn them on later in your
          phone&apos;s Settings → Notifications → AuraFit. You can change the reminder time from the bell icon at the top of the app.
        </p>
      </LegalSection>

      <LegalSection id="squads" title="Squads">
        <p>
          Create a squad from the Guild tab and share its invite code or link with friends. Squad leaders can make a new invite code and
          remove members.
        </p>
      </LegalSection>

      <LegalSection id="report" title="Reporting content">
        <p>
          See a workout drop or squad that breaks the rules? Use the <strong>Report</strong> button on it. Our moderators review every
          report. For anything urgent, email {mail}.
        </p>
      </LegalSection>

      <LegalSection id="delete" title="Deleting your account">
        <p>
          In the app, tap the settings gear at the top right → <strong>Delete account</strong>, or on the web go to <Link href="/account">Account</Link>.
          This permanently removes your account and data. If you can no longer sign in, email {mail} from the address on your account.
          See the <Link href="/privacy">Privacy Policy</Link> for details.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
