import { Sparkles } from 'lucide-react';
import { ROLE_PERMISSIONS, type UserProfile, type UserRole } from '@aurafit/shared';
import { Badge } from '@/components/ui/Badge';
import { ROLE_META } from '@/lib/roles';
import { formatNumber } from '@/lib/format';

/** `demo`: local demo persona (the header's "Demo mode" badge is hidden below 1024px, so repeat it here). */
export function RoleBanner({ user, role, demo = false }: { user: UserProfile; role: UserRole; demo?: boolean }) {
  const meta = ROLE_META[role];
  return (
    <section className="role-banner" aria-label={demo ? 'Demo persona' : 'Signed-in account'}>
      <div className="role-banner__who">
        <Badge tone={meta.tone} outline>
          {meta.short}
        </Badge>
        <div className="role-banner__text">
          <p className="role-banner__name">{user.username}</p>
          <p className="role-banner__title">{user.title}</p>
        </div>
      </div>
      <div className="role-banner__meta">
        {demo && (
          <Badge tone="orange" outline size="sm" className="show-below-lg" title="Progress is saved in this browser only">
            Demo mode
          </Badge>
        )}
        <span className="aura-chip show-below-lg">
          <Sparkles aria-hidden="true" className="aura-chip__icon" />
          <span className="sr-only">Aura points: </span>
          {formatNumber(user.auraPoints)}
        </span>
        <span className="text-xs text-secondary">
          <span className="text-emerald fw-700">{ROLE_PERMISSIONS[role].length}</span> active permissions
        </span>
      </div>
    </section>
  );
}
