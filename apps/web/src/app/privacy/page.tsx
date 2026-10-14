/*
 * TEMPLATE — have this reviewed before launch.
 * Plain-language starting point only, not legal advice. Have a qualified lawyer
 * review it for every market you launch in (e.g. GDPR/UK GDPR, CCPA/CPRA, COPPA
 * and other children's privacy rules, app store requirements), fill in the
 * operating entity, and keep it in sync with what the app actually does.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';
import { CONTACT_EMAIL } from '@/components/shell/SiteFooter';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What AuraFit collects, why, who processes it, and how to delete your account.',
  alternates: { canonical: '/privacy' },
};
export const dynamic = 'force-static';

const TOC = [
  { id: 'summary', label: 'The short version' },
  { id: 'collect', label: 'What we collect' },
  { id: 'public-cards', label: 'Public hunter cards' },
  { id: 'use', label: 'How we use it' },
  { id: 'share', label: 'Who processes it' },
  { id: 'retention', label: 'How long we keep it' },
  { id: 'delete', label: 'Deleting your account' },
  { id: 'rights', label: 'Your rights and choices' },
  { id: 'security', label: 'Security' },
  { id: 'children', label: 'Children' },
  { id: 'changes', label: 'Changes to this policy' },
  { id: 'contact', label: 'Contact' },
] as const;

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

export default function PrivacyPage() {
  return (
    <LegalPage
      viewer={null}
      eyebrow="Legal"
      title="Privacy Policy"
      toc={TOC}
      intro={
        <p>
          AuraFit turns workouts into a game: you earn Aura, keep streaks and climb ranks. To do that we store a small amount of data
          about you. This page explains what, why, and how to remove it.
        </p>
      }
    >
      <LegalSection id="summary" title="The short version">
        <ul>
          <li>We store your email, your public profile and your quest and workout history so your progress follows you.</li>
          <li>
            Your public profile stats can be shared as a hunter card image and a public page at <code>/u/your-handle</code>. These
            never include your email or activity history, and they are kept out of search engines.
          </li>
          <li>We do not show ads, and we do not sell or rent your personal data to anyone.</li>
          <li>Your data is hosted by our database and authentication provider, Supabase.</li>
          <li>
            You can delete your account and its data at any time from <Link href="/account">your account page</Link>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="collect" title="What we collect">
        <h3>Account data</h3>
        <p>
          Your email address and a securely hashed password. If you choose <strong>Sign in with Google</strong>, Google shares your
          email address, name and profile picture with us; we never receive your Google password.
        </p>
        <h3>Profile data</h3>
        <p>
          Your display name, handle, avatar, title and bio, and game stats such as Aura points, rank, level, attribute scores and streak.
          Your profile and game stats are <strong>public</strong>: other people can see them on leaderboards, next to workout
          drops you publish, and on your public hunter card (see <a href="#public-cards">Public hunter cards</a>). Your email address
          is never shown publicly.
        </p>
        <h3>Activity data</h3>
        <p>
          A log of the quests and workouts you complete (what, when and how much Aura it earned). This history is private to you.
          Workout drops you publish as a creator are public.
        </p>
        <h3>Technical data</h3>
        <p>
          Session cookies that keep you signed in, and standard server logs (such as IP address, browser type and request time) that
          we and our providers use to run and secure the service. The web app also stores preferences such as theme and sound, and
          demo-mode progress, in your browser&apos;s local storage; that data stays on your device.
        </p>
        <p>
          We do not use advertising or cross-site tracking cookies, and we do not collect precise location, contacts or health records
          from your device.
        </p>
      </LegalSection>

      <LegalSection id="public-cards" title="Public hunter cards">
        <p>
          Every account has a shareable hunter card: an image (for example for Stories or posts) and a public page at{' '}
          <code>/u/your-handle</code>. Anyone with the link can view them. They show only fields that are already public on the
          leaderboard: your display name, handle, rank, level, Aura points, the four attribute scores (STR, AGI, END, REC), your
          streak and your workout count.
        </p>
        <p>
          They never show your email address, avatar, bio, fitness goal or level, sign-in details, or your quest and workout history.
          Hunter card pages ask search engines not to index them, and we do not list them in our sitemap. Cards are cached for a few
          minutes, so a change can take a short while to appear.
        </p>
        <p>
          Nothing is posted anywhere unless you choose to share it. When you share to another service (such as X, WhatsApp or
          Telegram), that service&apos;s own privacy policy applies to what you post there. Your card exists for as long as your
          account does; deleting your account removes the card image and the page. Copies you already posted elsewhere stay
          where you posted them.
        </p>
      </LegalSection>

      <LegalSection id="use" title="How we use it">
        <ul>
          <li>To create and secure your account and keep you signed in.</li>
          <li>To run the game: award Aura, track streaks, show leaderboards and your quest board.</li>
          <li>To prevent cheating and abuse, and to keep the service reliable.</li>
          <li>To send essential account emails, such as sign-up confirmation and password resets.</li>
        </ul>
        <p>We do not use your data for advertising, and we do not make automated decisions about you that have legal effects.</p>
      </LegalSection>

      <LegalSection id="share" title="Who processes it">
        <p>We share data only with service providers who help us run AuraFit, under contracts that limit how they can use it:</p>
        <ul>
          <li>
            <strong>Supabase</strong> — database hosting and authentication. Your account, profile and activity data are stored there.
          </li>
          <li>
            <strong>Google</strong> — only if you choose Sign in with Google.
          </li>
          <li>
            <strong>Our hosting provider</strong> — serves the website and processes requests and logs.
          </li>
        </ul>
        <p>
          We may also disclose information if the law requires it, or to protect the safety of our users. If AuraFit is ever sold or
          merged, we will tell you before your data becomes subject to a different privacy policy.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="How long we keep it">
        <p>
          We keep your data for as long as your account exists. When you delete your account, your profile, activity history and
          published workout drops are deleted immediately from our live database. Copies in our providers&apos; encrypted backups are
          removed as those backups expire on their regular schedule.
        </p>
      </LegalSection>

      <LegalSection id="delete" title="Deleting your account">
        <p>
          Sign in on the web, go to <Link href="/account">Account</Link> and choose <strong>Delete account</strong> (the same account
          works in the mobile app). This permanently removes your sign-in, profile, quest and workout history, and any workout
          drops you published. Squads you led stay up for their other members, without you as leader. Deletion cannot be undone.
        </p>
        <p>If you can no longer sign in, email {mail} from the address on your account and we will delete it for you.</p>
      </LegalSection>

      <LegalSection id="rights" title="Your rights and choices">
        <p>
          Depending on where you live, you may have the right to access, correct, export or delete your personal data, and to object to
          or restrict how we use it. You can edit your profile in the app and delete your account yourself; for anything else, email{' '}
          {mail}. You also have the right to complain to your local data protection authority.
        </p>
      </LegalSection>

      <LegalSection id="security" title="Security">
        <p>
          Data is encrypted in transit (HTTPS) and access to it is restricted by row-level security rules in our database. Passwords are
          hashed by our authentication provider and are never visible to us. No system is perfectly secure, so please use a unique
          password.
        </p>
      </LegalSection>

      <LegalSection id="children" title="Children">
        <p>
          AuraFit is not intended for children under 13 (or the minimum age required in your country). If you believe a child has
          created an account, contact {mail} and we will delete it.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to this policy">
        <p>
          If we make material changes, we will update the date at the top of this page and let you know in the app or by email before
          they take effect.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>Questions or requests about your privacy: {mail}.</p>
      </LegalSection>
    </LegalPage>
  );
}
