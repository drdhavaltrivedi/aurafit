import type { CreatorAnalyticsResponse, CreatorDrop, CreatorSummary, FollowedCreator, ValidDropEditorInput } from '@aurafit/shared';

/** A creator-capable profile (role CREATOR or ADMIN), as stored. */
export interface CreatorRecord extends CreatorSummary {
  bio: string;
}

export type FollowResult =
  | { status: 'followed' | 'already_following'; followerCount: number }
  | { status: 'creator_not_found' | 'cannot_follow_self' | 'profile_not_found' };

export type UnfollowResult = { status: 'unfollowed' | 'not_following'; followerCount: number };

/** Analytics without the `range` label (the route adds it). */
export type AnalyticsSnapshot = Omit<CreatorAnalyticsResponse, 'range'>;

export interface CreateDropInput {
  id: string;
  creatorId: string;
  input: ValidDropEditorInput;
}

/**
 * Database access for creator tools (drop authoring, follows, analytics). Separate from GameRepository
 * so routes can be tested with an in-memory fake. Writes are scoped by creator id in the query itself
 * (defence in depth on top of the route's ownership check).
 */
export interface CreatorRepository {
  /** Every drop of this creator (live and scheduled), newest first. */
  listOwnDrops(creatorId: string): Promise<CreatorDrop[]>;
  /** Any drop by id regardless of schedule (for ownership checks), or null. */
  getDropForEdit(dropId: string): Promise<CreatorDrop | null>;
  createDrop(input: CreateDropInput): Promise<CreatorDrop>;
  /** Updates content fields (never counters); `input.publishAt === undefined` keeps the schedule. Null when not found/owned. */
  updateDrop(dropId: string, creatorId: string, input: ValidDropEditorInput): Promise<CreatorDrop | null>;
  /** True when a row was deleted. */
  deleteDrop(dropId: string, creatorId: string): Promise<boolean>;
  /** Creator/admin profile by exact stored handle ("@name"), or null (members are not creators). */
  findCreatorByHandle(handle: string): Promise<CreatorRecord | null>;
  followerCount(creatorId: string): Promise<number>;
  isFollowing(followerId: string, creatorId: string): Promise<boolean>;
  follow(followerId: string, creatorId: string): Promise<FollowResult>;
  unfollow(followerId: string, creatorId: string): Promise<UnfollowResult>;
  /** Creators the profile follows, newest follow first. */
  listFollowing(followerId: string): Promise<FollowedCreator[]>;
  /** Aggregated analytics for the last `days` UTC days, or null when the profile is gone. */
  analytics(creatorId: string, days: number, now: Date): Promise<AnalyticsSnapshot | null>;
}
