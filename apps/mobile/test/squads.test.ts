import { describe, expect, it } from 'vitest';
import { parseSquadJoinLink } from '@aurafit/shared';
import { shortWhen, squadErrorText, squadShareContent } from '../src/lib/squads';

describe('squad share content', () => {
  const squad = { name: 'Night Shift', tag: 'NIGHT', inviteCode: 'K7MX2QPA' };

  it('uses the https join link when the site URL is known', () => {
    const c = squadShareContent(squad, 'https://aurafit.app');
    expect(c).toEqual({
      title: 'Join Night Shift on AuraFit',
      message: 'Join my AuraFit squad Night Shift [NIGHT]: https://aurafit.app/join/K7MX2QPA (invite code K7MX2QPA)',
      url: 'https://aurafit.app/join/K7MX2QPA',
    });
    // The shared link round-trips through the deep-link parser.
    expect(parseSquadJoinLink(c!.url)).toBe('K7MX2QPA');
  });

  it('falls back to the app deep link; nothing to share without a code (non-leaders)', () => {
    expect(squadShareContent(squad, null)?.url).toBe('aurafit://join/K7MX2QPA');
    expect(squadShareContent({ ...squad, inviteCode: null }, 'https://aurafit.app')).toBeNull();
  });
});

describe('squad errors and times', () => {
  it('maps squad codes to friendly text, else keeps the server message', () => {
    expect(squadErrorText('SQUAD_FULL', 'x')).toMatch(/full/);
    expect(squadErrorText('INVALID_INVITE_CODE', 'x')).toMatch(/invite code/);
    expect(squadErrorText('SOMETHING_ELSE', 'Server said no')).toBe('Server said no');
  });

  it('formats activity times and tolerates junk', () => {
    expect(shortWhen('2026-10-14T07:05:00Z', 'en-GB')).toMatch(/Wed/);
    expect(shortWhen('nope')).toBe('');
  });
});
