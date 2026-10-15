import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SquadLeaderboardEntry } from '@aurafit/shared';
import { ToastContext } from '@/hooks/useToast';
import { SquadLeaderboard, canReportBoardSquad } from './SquadLeaderboard';

const MINE = '6f1c2b8e-1a2b-4c3d-8e9f-0123456789ab';
const OTHER = '7a2d3c9f-2b3c-4d4e-9f0a-123456789abc';

const squads: SquadLeaderboardEntry[] = [
  { rank: 1, id: OTHER, name: 'Iron Wolves', tag: 'WOLF', icon: 'dog', memberCount: 4, maxMembers: 5, weeklyAura: 9000 },
  { rank: 2, id: MINE, name: 'Night Shift', tag: 'NIGHT', icon: 'zap', memberCount: 2, maxMembers: 5, weeklyAura: 4000 },
];

const render = (props: { mySquadId?: string | null; reportable?: boolean }) =>
  renderToStaticMarkup(
    createElement(
      ToastContext.Provider,
      { value: { show: () => {} } },
      createElement(SquadLeaderboard, { squads, loading: false, error: null, onRetry: () => {}, ...props }),
    ),
  );

describe('squad leaderboard report action', () => {
  it('offers Report only on squads the viewer is not in', () => {
    const html = render({ mySquadId: MINE, reportable: true });
    expect(html).toContain('aria-label="Report squad Iron Wolves"');
    expect(html).not.toContain('Report squad Night Shift');
  });

  it('works for viewers without a squad', () => {
    const html = render({ mySquadId: null, reportable: true });
    expect(html).toContain('Report squad Iron Wolves');
    expect(html).toContain('Report squad Night Shift');
  });

  it('is hidden unless reportable (demo, or own squad still loading)', () => {
    expect(render({ mySquadId: MINE })).not.toContain('Report squad');
    expect(canReportBoardSquad(OTHER, undefined, false)).toBe(false);
    expect(canReportBoardSquad(OTHER, MINE, true)).toBe(true);
    expect(canReportBoardSquad(MINE, MINE, true)).toBe(false);
  });
});
