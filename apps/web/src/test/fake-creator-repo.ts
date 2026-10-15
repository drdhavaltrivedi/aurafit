/** In-memory CreatorRepository for route tests (not a test file itself). Mirrors the SQL rules. */
import { buildCreatorDrop, type CreatorDrop, type FollowedCreator, type ValidDropEditorInput } from '@aurafit/shared';
import type { AnalyticsSnapshot, CreateDropInput, CreatorRecord, CreatorRepository, FollowResult, UnfollowResult } from '@/lib/creator/types';

export class FakeCreatorRepo implements CreatorRepository {
  drops: CreatorDrop[] = [];
  creators = new Map<string, CreatorRecord>();
  follows: Array<{ followerId: string; creatorId: string; createdAt: string }> = [];
  failWith: Error | null = null;
  calls: string[] = [];
  analyticsCalls: Array<{ creatorId: string; days: number }> = [];

  private guard(call: string) {
    this.calls.push(call);
    if (this.failWith) throw this.failWith;
  }

  addCreator(c: Partial<CreatorRecord> & { id: string; handle: string }): CreatorRecord {
    const rec: CreatorRecord = { username: c.handle.slice(1), avatarUrl: '', title: 'Coach', bio: '', role: 'CREATOR', official: false, ...c };
    this.creators.set(rec.id, rec);
    return rec;
  }

  addDrop(drop: CreatorDrop) {
    this.drops.unshift(drop);
    return drop;
  }

  private profile(id: string) {
    const c = this.creators.get(id);
    return { id, username: c?.username ?? 'x', handle: c?.handle ?? '@x', avatarUrl: '' };
  }

  async listOwnDrops(creatorId: string) {
    this.guard('listOwnDrops');
    return this.drops.filter((d) => d.creatorId === creatorId);
  }
  async getDropForEdit(dropId: string) {
    this.guard('getDropForEdit');
    return this.drops.find((d) => d.id === dropId) ?? null;
  }
  async createDrop({ id, creatorId, input }: CreateDropInput) {
    this.guard('createDrop');
    return this.addDrop(buildCreatorDrop(input, this.profile(creatorId), id));
  }
  async updateDrop(dropId: string, creatorId: string, input: ValidDropEditorInput) {
    this.guard('updateDrop');
    const i = this.drops.findIndex((d) => d.id === dropId && d.creatorId === creatorId);
    if (i < 0) return null;
    this.drops[i] = buildCreatorDrop(input, this.profile(creatorId), dropId, this.drops[i]);
    return this.drops[i];
  }
  async deleteDrop(dropId: string, creatorId: string) {
    this.guard('deleteDrop');
    const before = this.drops.length;
    this.drops = this.drops.filter((d) => !(d.id === dropId && d.creatorId === creatorId));
    return this.drops.length < before;
  }
  async findCreatorByHandle(handle: string) {
    this.guard('findCreatorByHandle');
    return [...this.creators.values()].find((c) => c.handle === handle) ?? null;
  }
  async followerCount(creatorId: string) {
    return this.follows.filter((f) => f.creatorId === creatorId).length;
  }
  async isFollowing(followerId: string, creatorId: string) {
    return this.follows.some((f) => f.followerId === followerId && f.creatorId === creatorId);
  }
  async follow(followerId: string, creatorId: string): Promise<FollowResult> {
    this.guard('follow');
    if (!this.creators.has(creatorId)) return { status: 'creator_not_found' };
    if (followerId === creatorId) return { status: 'cannot_follow_self' };
    const had = await this.isFollowing(followerId, creatorId);
    if (!had) this.follows.push({ followerId, creatorId, createdAt: new Date(Date.now() + this.follows.length).toISOString() });
    return { status: had ? 'already_following' : 'followed', followerCount: await this.followerCount(creatorId) };
  }
  async unfollow(followerId: string, creatorId: string): Promise<UnfollowResult> {
    this.guard('unfollow');
    const had = await this.isFollowing(followerId, creatorId);
    this.follows = this.follows.filter((f) => !(f.followerId === followerId && f.creatorId === creatorId));
    return { status: had ? 'unfollowed' : 'not_following', followerCount: await this.followerCount(creatorId) };
  }
  async listFollowing(followerId: string): Promise<FollowedCreator[]> {
    this.guard('listFollowing');
    return this.follows
      .filter((f) => f.followerId === followerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .flatMap((f) => {
        const c = this.creators.get(f.creatorId);
        if (!c) return [];
        const { bio: _bio, ...summary } = c;
        return [{ ...summary, followedAt: f.createdAt }];
      });
  }
  async analytics(creatorId: string, days: number): Promise<AnalyticsSnapshot | null> {
    this.guard('analytics');
    this.analyticsCalls.push({ creatorId, days });
    const own = this.drops.filter((d) => d.creatorId === creatorId);
    return {
      from: '2026-10-08',
      to: '2026-10-14',
      totals: {
        followers: await this.followerCount(creatorId),
        liveDrops: own.filter((d) => d.status === 'LIVE').length,
        scheduledDrops: own.filter((d) => d.status === 'SCHEDULED').length,
        completions: 3,
        uniqueAthletes: 2,
        auraAwarded: 450,
      },
      drops: own.map((d) => ({
        dropId: d.id,
        title: d.title,
        status: d.status,
        publishAt: d.publishAt,
        completions: 3,
        uniqueAthletes: 2,
        lastCompletedOn: '2026-10-14',
        allTimeCompletions: d.completionsCount,
      })),
      series: Array.from({ length: days }, (_, i) => ({ date: `d${i}`, completions: i === days - 1 ? 3 : 0 })),
    };
  }
}
