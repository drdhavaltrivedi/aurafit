/*
 * TEMPLATE — have this reviewed before launch.
 * Plain-language starting point only, not legal advice. Have a qualified lawyer
 * review it (operating entity, governing law, liability limits, consumer law in
 * each market, app store terms, future paid features) before relying on it.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';
import { CONTACT_EMAIL } from '@/components/shell/SiteFooter';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The rules for using AuraFit, including the health and safety disclaimer.',
  alternates: { canonical: '/terms' },
};
export const dynamic = 'force-static';

const TOC = [
  { id: 'health', label: 'Health and safety' },
  { id: 'accounts', label: 'Your account' },
  { id: 'play-fair', label: 'Play fair' },
  { id: 'content', label: 'Content you publish' },
  { id: 'game', label: 'Aura, ranks and other game items' },
  { id: 'service', label: 'Changes and availability' },
  { id: 'ending', label: 'Ending your account' },
  { id: 'liability', label: 'Disclaimers and liability' },
  { id: 'changes', label: 'Changes to these terms' },
  { id: 'contact', label: 'Contact' },
] as const;

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

export default function TermsPage() {
  return (
    <LegalPage
      viewer={null}
      eyebrow="Legal"
      title="Terms of Service"
      toc={TOC}
      intro={
        <p>
          These terms are the agreement between you and AuraFit when you use our website, progressive web app or mobile app. By creating
          an account or using AuraFit you agree to them. Please also read our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      }
    >
      <LegalSection id="health" title="Health and safety">
        <p className="legal__callout">
          <strong>AuraFit is not medical advice.</strong> Workouts, quests and tips in the app are general fitness content for
          motivation and entertainment. They are not a diagnosis, treatment or a substitute for advice from a doctor or other qualified
          professional.
        </p>
        <ul>
          <li>
            <strong>Consult a doctor before starting any exercise program</strong>, especially if you are pregnant, have a medical
            condition or injury, take medication, or have not exercised in a while.
          </li>
          <li>Stop immediately and seek medical help if you feel pain, dizziness, faintness, chest pain or shortness of breath.</li>
          <li>Choose a safe place to exercise, warm up, stay hydrated, and work within your own limits. Streaks are never worth an injury.</li>
          <li>Workout drops are created by community creators. Use your own judgment about whether a routine is right for you.</li>
        </ul>
        <p>You exercise at your own risk.</p>
      </LegalSection>

      <LegalSection id="accounts" title="Your account">
        <ul>
          <li>You must be at least 13 years old (or the minimum age in your country) to create an account.</li>
          <li>Give accurate sign-up information and keep your password secret. You are responsible for activity on your account.</li>
          <li>Tell us at {mail} if you think someone else has accessed your account.</li>
        </ul>
      </LegalSection>

      <LegalSection id="play-fair" title="Play fair">
        <p>Do not:</p>
        <ul>
          <li>cheat, automate or fake activity to gain Aura, ranks or leaderboard positions;</li>
          <li>attack, overload, reverse-engineer or probe the service or other users&apos; accounts;</li>
          <li>harass others, impersonate anyone, or publish content that is illegal, hateful, sexual, dangerous or infringes others&apos; rights.</li>
        </ul>
        <p>We may remove content, reset game progress or suspend accounts that break these rules.</p>
      </LegalSection>

      <LegalSection id="content" title="Content you publish">
        <p>
          You keep ownership of the workout drops, names and other content you publish. You give AuraFit a worldwide, non-exclusive,
          royalty-free licence to host, display and share that content within the service so other users can see and use it. The
          licence ends when you delete the content or your account. Only publish routines you have the right to share, and describe
          them accurately and safely.
        </p>
      </LegalSection>

      <LegalSection id="game" title="Aura, ranks and other game items">
        <p>
          Aura points, ranks, streaks, shields and badges are game features. They have no monetary value, cannot be exchanged for money
          and are not your property. We may rebalance them, for example the weekly Aura total resets every Monday (UTC).
        </p>
      </LegalSection>

      <LegalSection id="service" title="Changes and availability">
        <p>
          AuraFit is free to use and shows no ads. We are constantly improving it, so features may change or be removed. We try to keep
          the service available but cannot promise it will always be uninterrupted or error-free. If we ever introduce paid features,
          they will come with clear pricing and terms that you accept separately.
        </p>
      </LegalSection>

      <LegalSection id="ending" title="Ending your account">
        <p>
          You can stop using AuraFit at any time and delete your account from the <Link href="/account">account page</Link>; this
          permanently deletes your data as described in the <Link href="/privacy#delete">Privacy Policy</Link>. We may suspend or close
          accounts that seriously or repeatedly break these terms, and will tell you why where we can.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="Disclaimers and liability">
        <p>
          AuraFit is provided &quot;as is&quot;. To the extent the law allows, we disclaim implied warranties and are not liable for
          indirect or consequential losses, or for injury resulting from exercise you choose to do. Nothing in these terms limits
          rights you have under consumer protection law that cannot be limited, or our liability for things the law does not allow us
          to exclude.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to these terms">
        <p>
          If we change these terms in a material way, we will update the date at the top and let you know in the app or by email before
          the changes take effect. If you keep using AuraFit afterwards, the new terms apply.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>Questions about these terms: {mail}.</p>
      </LegalSection>
    </LegalPage>
  );
}
