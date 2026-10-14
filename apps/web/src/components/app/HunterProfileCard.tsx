import { Crown, Share2, Shield } from 'lucide-react';
import type { PlayerAttributes, UserProfile } from '@aurafit/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { ProgressBar, type ProgressTone } from '@/components/ui/ProgressBar';
import { Button } from '@/components/ui/Button';
import { formatNumber } from '@/lib/format';

interface RankInfo {
  rank: string;
  nextRank: string | null;
  progressToNext: number;
  pointsNeeded: number;
}

const ATTRS: { key: keyof PlayerAttributes; label: string; name: string; tone: ProgressTone }[] = [
  { key: 'str', label: 'STR', name: 'Strength', tone: 'danger' },
  { key: 'agi', label: 'AGI', name: 'Agility', tone: 'blue' },
  { key: 'end', label: 'END', name: 'Stamina', tone: 'emerald' },
  { key: 'rec', label: 'REC', name: 'Recovery', tone: 'accent' },
];

/** Share button state: enabled with a handler, or disabled with a visible reason (demo mode). */
export type ProfileShare = { onShare: () => void } | { disabledReason: string };

export function HunterProfileCard({ user, rankInfo, share }: { user: UserProfile; rankInfo: RankInfo; share?: ProfileShare }) {
  return (
    <Card as="section" variant="feature" aria-labelledby="profile-name">
      <div className="profile__head">
        <div className="stack-2">
          <Badge tone="accent" outline>
            <Crown aria-hidden="true" className="icon-inline" /> {rankInfo.rank} Hunter
          </Badge>
          <h2 id="profile-name" className="profile__name">
            {user.username}
          </h2>
          <p className="text-secondary text-sm">
            {user.handle} · Level {user.level}
          </p>
        </div>
        <Avatar src={user.avatarUrl} alt={`${user.username}'s avatar`} name={user.username} size={64} shape="rounded" ring priority />
      </div>

      <div className="panel">
        <div className="row-between text-sm">
          <span id="rank-progress-label" className="text-secondary">
            Rank ascendance
          </span>
          <span className="text-accent fw-700">
            {rankInfo.progressToNext}% to {rankInfo.nextRank ?? 'MAX'}
          </span>
        </div>
        <ProgressBar
          value={rankInfo.progressToNext}
          labelledBy="rank-progress-label"
          valueText={`${rankInfo.progressToNext}% to ${rankInfo.nextRank ?? 'max rank'}`}
        />
        <div className="row-between text-xs text-muted">
          <span>{formatNumber(user.auraPoints)} AURA</span>
          {rankInfo.nextRank && <span>{formatNumber(rankInfo.pointsNeeded)} to next tier</span>}
        </div>
      </div>

      <h3 className="overline mt-5">Core RPG attributes</h3>
      <ul className="attr-grid list-reset">
        {ATTRS.map(({ key, label, name, tone }) => (
          <li key={key} className="attr">
            <div className="row-between text-sm">
              <span className="text-secondary fw-600">
                {label} <span className="attr__name">({name})</span>
              </span>
              <span className="fw-800">{user.attributes[key]}</span>
            </div>
            <ProgressBar value={user.attributes[key]} label={`${name} ${user.attributes[key]} of 100`} tone={tone} size="xs" />
          </li>
        ))}
      </ul>

      <dl className="chip-row">
        <div className="mini-stat">
          <dt>Streak shields</dt>
          <dd className="text-blue">
            <Shield aria-hidden="true" className="icon-inline" /> {user.streakShields} available
          </dd>
        </div>
        <div className="mini-stat">
          <dt>Weekly Aura</dt>
          <dd className="text-accent">+{formatNumber(user.weeklyAuraGained)}</dd>
        </div>
      </dl>

      {share && <ShareRow share={share} />}
    </Card>
  );
}

function ShareRow({ share }: { share: ProfileShare }) {
  if ('onShare' in share) {
    return (
      <div className="profile-share">
        <Button variant="secondary" leadingIcon={<Share2 />} onClick={share.onShare} block>
          Share your hunter card
        </Button>
      </div>
    );
  }
  // aria-disabled (not disabled) keeps the button focusable so the reason is discoverable.
  return (
    <div className="profile-share">
      <Button variant="secondary" leadingIcon={<Share2 />} aria-disabled="true" aria-describedby="profile-share-note" title={share.disabledReason} block>
        Share your hunter card
      </Button>
      <p id="profile-share-note" className="profile-share__note">
        {share.disabledReason}
      </p>
    </div>
  );
}
