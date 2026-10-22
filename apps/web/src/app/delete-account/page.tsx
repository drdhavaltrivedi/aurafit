import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';
import { CONTACT_EMAIL } from '@/components/shell/SiteFooter';

export const metadata: Metadata = {
  title: 'Delete your AuraFit account',
  description: 'How to delete your AuraFit account and data, what is deleted, and what is kept and for how long.',
  alternates: { canonical: '/delete-account' },
};
export const dynamic = 'force-static';

const TOC = [
  { id: 'in-app', label: 'Delete in the app' },
  { id: 'web', label: 'Delete on the web' },
  { id: 'email', label: 'Ask us by email' },
  { id: 'deleted', label: 'What is deleted' },
  { id: 'kept', label: 'What is kept, and for how long' },
] as const;

const mail = <a href={`mailto:${CONTACT_EMAIL}?subject=Delete%20my%20AuraFit%20account`}>{CONTACT_EMAIL}</a>;

/** Account deletion instructions for the AuraFit apps (linked from Google Play's Data safety form). */
export default function DeleteAccountPage() {
  return (
    <LegalPage
      viewer={null}
      eyebrow="AuraFit by Brilworks"
      title="Delete your AuraFit account"
      toc={TOC}
      intro={
        <p>
          You can delete your AuraFit account and its data at any time, from the Android or iPhone app, on the web, or by asking us by
          email. Deletion is permanent and cannot be undone.
        </p>
      }
    >
      <LegalSection id="in-app" title="Delete in the app">
        <ol>
          <li>Open AuraFit and sign in.</li>
          <li>Tap the settings gear at the top right.</li>
          <li>
            Tap <strong>Delete account</strong>, read the confirmation and confirm.
          </li>
        </ol>
      </LegalSection>

      <LegalSection id="web" title="Delete on the web">
        <ol>
          <li>
            Sign in and go to <Link href="/account">Account</Link>.
          </li>
          <li>
            Choose <strong>Delete account</strong> and confirm.
          </li>
        </ol>
      </LegalSection>

      <LegalSection id="email" title="Ask us by email">
        <p>
          If you can no longer sign in, email {mail} from the address on your account with the subject &quot;Delete my AuraFit
          account&quot;. We confirm and delete it within 30 days.
        </p>
      </LegalSection>

      <LegalSection id="deleted" title="What is deleted">
        <p>Deleted immediately from our live database:</p>
        <ul>
          <li>Your sign-in (email address and password, or Google sign-in link)</li>
          <li>Your profile: display name, handle, avatar, bio, Aura, rank, stats and streak</li>
          <li>Your quest and workout history</li>
          <li>Workout drops you published, and who you follow and who follows you</li>
          <li>Your squad membership, notification settings and push notification tokens</li>
          <li>Reports you filed about other content</li>
        </ul>
      </LegalSection>

      <LegalSection id="kept" title="What is kept, and for how long">
        <ul>
          <li>
            <strong>Squads you led</strong> stay up for their other members, without you as leader. Your name is not shown in them.
          </li>
          <li>
            <strong>Moderation records:</strong> if a moderator took action on your account or content, the record of that action (your
            account ID and handle at the time) is kept for 400 days for safety and abuse prevention, then deleted automatically.
          </li>
          <li>
            <strong>Backups:</strong> copies in our hosting provider&apos;s encrypted backups are removed as those backups expire, within
            30 days.
          </li>
        </ul>
        <p>
          More detail is in our <Link href="/privacy">Privacy Policy</Link>. Questions: {mail}.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
