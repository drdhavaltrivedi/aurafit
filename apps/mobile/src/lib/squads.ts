/**
 * Pure squad helpers for the app (no React Native imports; unit-tested in test/squads.test.ts).
 */
import { squadInviteMessage, squadJoinDeepLink, squadJoinUrl, type MySquad } from '@aurafit/shared';

/** Content for React Native's Share.share(): the https join link (works without the app) plus the code. */
export function squadShareContent(
  squad: Pick<MySquad, 'name' | 'tag' | 'inviteCode'>,
  siteOrigin: string | null,
): { title: string; message: string; url?: string } | null {
  const code = squad.inviteCode;
  if (!code) return null;
  const link = siteOrigin ? squadJoinUrl(siteOrigin, code) : squadJoinDeepLink(code);
  return { title: `Join ${squad.name} on AuraFit`, message: squadInviteMessage(squad, code, link), url: link };
}

/** User-facing text for squad error codes (falls back to the server's message). */
export function squadErrorText(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'INVALID_INVITE_CODE':
      return "That invite code doesn't match any squad. Check it, or ask the leader for a new one.";
    case 'SQUAD_FULL':
      return 'This squad is full (5 of 5 hunters).';
    case 'ALREADY_IN_SQUAD':
      return "You're already in a squad. Leave it before joining another.";
    case 'NOT_SQUAD_LEADER':
      return 'Only the squad leader can do that.';
    case 'RATE_LIMITED':
      return 'Slow down a little and try again in a moment.';
    default:
      return fallback;
  }
}

/** "Mon 09:14" style label for activity rows. */
export function shortWhen(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(d);
}
