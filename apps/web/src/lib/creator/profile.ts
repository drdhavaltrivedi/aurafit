import type { CreatorProfileResponse } from '@aurafit/shared';
import type { GameRepository } from '@/lib/data/types';
import type { CreatorRepository } from './types';

/**
 * Public creator profile (API route and the /c/[handle] page). Live drops come from the game
 * repository's public listing, so every visibility rule of the public catalog (schedule, moderation)
 * applies here too. Totals are computed from those visible drops. null when no creator has the handle.
 */
export async function loadCreatorProfile(
  repo: CreatorRepository,
  game: GameRepository,
  handle: string,
  viewerId: string | null,
): Promise<CreatorProfileResponse | null> {
  const creator = await repo.findCreatorByHandle(handle);
  if (!creator) return null;
  const isSelf = viewerId === creator.id;
  const [drops, followerCount, isFollowing] = await Promise.all([
    game.listDrops({ creatorId: creator.id }),
    repo.followerCount(creator.id),
    viewerId && !isSelf ? repo.isFollowing(viewerId, creator.id) : Promise.resolve(false),
  ]);
  const badge = drops[0]?.creatorBadge ?? (creator.official ? 'Official AuraFit' : 'Verified Creator');
  return {
    creator: {
      ...creator,
      badge,
      followerCount,
      liveDropCount: drops.length,
      totalCompletions: drops.reduce((s, d) => s + d.completionsCount, 0),
      totalLikes: drops.reduce((s, d) => s + d.likesCount, 0),
    },
    drops,
    isFollowing: viewerId === null ? null : isFollowing,
    isSelf,
  };
}
