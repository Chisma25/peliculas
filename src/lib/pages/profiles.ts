import { getAvatarDeliveryUrl } from "@/lib/avatar-data";
import { hydrateMovie } from "@/lib/movies/metadata";

import { mapRatingRecordsToStateEntries } from "@/lib/ratings/records";
import { shouldUseProcessLocalMutableCache } from "@/lib/runtime-cache-policy";
import {
  cloneState,
  readTimedCache,
  TimedCache,
  writeTimedCacheWithTtl,
  PAGE_ROUTE_CACHE_TTL_MS
} from "@/lib/state-cache";
import type { createStateReader } from "@/lib/state-readers";
import { AppState, Movie, User } from "@/lib/types";
import { normalizeUsername } from "@/lib/user-input";
import {
  buildProfileFromRatings,
  createProfileReader,
  type ProfileData,
  type ProfileSummary
} from "@/lib/users/profiles";

type Dependencies = {
  shouldAttemptDatabaseRead: () => boolean;
  loadUsersForRead: (options?: { includeAvatarUrls?: boolean }) => Promise<User[]>;
  loadMoviesByIdsFromDatabase: (movieIds: string[]) => Promise<Map<string, Movie>>;
  hydrateMoviesForDatabaseRead: (movies: Movie[]) => Promise<void>;
  markDatabaseReadHealthy: () => void;
  markDatabaseReadFailure: (scope: string, error: unknown) => void;
  shouldUseDatabase: () => boolean;
  loadAppState: () => Promise<AppState>;
  buildProfileFromState: ReturnType<typeof createProfileReader>["buildProfileFromState"];
  getDatabaseReadGroup: () => AppState["group"];
  listMembersFromState: ReturnType<typeof createStateReader>["listMembersFromState"];
  getProfileSummaryFromState: ReturnType<typeof createProfileReader>["getProfileSummaryFromState"];
  loadSnapshotUsersForRequest: () => Promise<User[]>;
};

export function createProfilePageReader({
  shouldAttemptDatabaseRead,
  loadUsersForRead,
  loadMoviesByIdsFromDatabase,
  hydrateMoviesForDatabaseRead,
  markDatabaseReadHealthy,
  markDatabaseReadFailure,
  shouldUseDatabase,
  loadAppState,
  buildProfileFromState,
  getDatabaseReadGroup,
  listMembersFromState,
  getProfileSummaryFromState,
  loadSnapshotUsersForRequest
}: Dependencies) {
  type ProfileDataCacheKey = string;

  let groupPageDataMemoryCache: TimedCache<{
    group: AppState["group"];
    members: Array<{
      member: User;
      profileSummary: ProfileSummary;
    }>;
  }> | null = null;

  const profilePageDataMemoryCache = new Map<ProfileDataCacheKey, TimedCache<ProfileData | null>>();

  async function getProfileDataFromDatabase(userId: string) {
    if (!shouldAttemptDatabaseRead()) {
      return null;
    }

    try {
      const { prisma } = await import("@/lib/prisma");
      const users = await loadUsersForRead({ includeAvatarUrls: true });
      const user = users.find((entry) => entry.id === userId);
      if (!user) {
        return null;
      }

      const ratingRows = await prisma.ratingRecord.findMany({
        where: { userId },
        orderBy: [{ score: "desc" }, { updatedAt: "desc" }]
      });
      const ratings = mapRatingRecordsToStateEntries(ratingRows);
      const moviesById = await loadMoviesByIdsFromDatabase(ratings.map((rating) => rating.movieId));
      if (ratings.length > 0 && moviesById.size === 0) {
        return null;
      }

      const profile = buildProfileFromRatings(user, ratings, moviesById);
      await hydrateMoviesForDatabaseRead([...profile.topThree, ...profile.bottomThree].map((item) => item.movie));
      markDatabaseReadHealthy();
      return cloneState(profile);
    } catch (error) {
      markDatabaseReadFailure("profile page read", error);
      return null;
    }
  }

  async function getProfileDataHydrated(userId: string) {
    const usesDatabase = shouldUseDatabase();
    const shouldUseMemoryCache = shouldUseProcessLocalMutableCache(usesDatabase);

    if (usesDatabase) {
      const databaseProfile = await getProfileDataFromDatabase(userId);
      if (databaseProfile) {
        return databaseProfile;
      }
    }

    if (shouldUseMemoryCache) {
      const cached = readTimedCache(profilePageDataMemoryCache.get(userId));
      if (cached !== null) {
        return cached;
      }
    }

    const state = await loadAppState();
    const profile = buildProfileFromState(state, userId);
    if (!profile) {
      if (shouldUseMemoryCache) {
        profilePageDataMemoryCache.set(userId, writeTimedCacheWithTtl<ProfileData | null>(null, PAGE_ROUTE_CACHE_TTL_MS));
      }
      return null;
    }

    const moviesToHydrate = new Map<string, Movie>();
    [...profile.topThree, ...profile.bottomThree].forEach((item) => {
      moviesToHydrate.set(item.movie.id, item.movie);
    });
    await Promise.all([...moviesToHydrate.values()].map((movie) => hydrateMovie(state, movie)));

    const hydratedProfile = buildProfileFromState(state, userId);
    if (shouldUseMemoryCache) {
      profilePageDataMemoryCache.set(userId, writeTimedCacheWithTtl(hydratedProfile, PAGE_ROUTE_CACHE_TTL_MS));
    }
    return hydratedProfile;
  }

  async function getGroupPageDataFromDatabase() {
    if (!shouldAttemptDatabaseRead()) {
      return null;
    }

    try {
      const { prisma } = await import("@/lib/prisma");
      const group = getDatabaseReadGroup();
      const users = await loadUsersForRead({ includeAvatarUrls: true });
      const summaries = await prisma.ratingRecord.groupBy({
        by: ["userId"],
        _count: { _all: true },
        _avg: { score: true },
        _max: { score: true }
      });
      const summariesByUserId = new Map(
        summaries.map((summary) => [
          summary.userId,
          {
            ratingsCount: summary._count._all,
            averageScore: summary._avg.score ?? 0,
            bestScore: summary._max.score ?? 0
          }
        ])
      );
      const members = group.memberIds
        .map((memberId) => users.find((user) => user.id === memberId))
        .filter((member): member is User => Boolean(member))
        .map((member) => ({
          member,
          profileSummary: summariesByUserId.get(member.id) ?? {
            ratingsCount: 0,
            averageScore: 0,
            bestScore: 0
          }
        }));
      const groupData = { group, members };
      markDatabaseReadHealthy();
      return cloneState(groupData);
    } catch (error) {
      markDatabaseReadFailure("group page read", error);
      return null;
    }
  }

  async function getGroupPageData() {
    const usesDatabase = shouldUseDatabase();
    const shouldUseMemoryCache = shouldUseProcessLocalMutableCache(usesDatabase);

    if (usesDatabase) {
      const databaseGroupData = await getGroupPageDataFromDatabase();
      if (databaseGroupData) {
        return databaseGroupData;
      }
    }

    if (shouldUseMemoryCache) {
      const cached = readTimedCache(groupPageDataMemoryCache);
      if (cached) {
        return cached;
      }
    }

    const state = await loadAppState();
    const groupData = {
      group: state.group,
      members: listMembersFromState(state).map((member) => ({
        member: {
          ...member,
          avatarUrl: member.avatarUrl ? getAvatarDeliveryUrl(member.id, member.avatarUrl) : undefined
        },
        profileSummary: getProfileSummaryFromState(state, member.id)
      }))
    };
    if (shouldUseMemoryCache) {
      groupPageDataMemoryCache = writeTimedCacheWithTtl(groupData, PAGE_ROUTE_CACHE_TTL_MS);
    }
    return groupData;
  }

  async function listMembers() {
    const state = await loadAppState();
    return listMembersFromState(state);
  }

  async function getUserByUsername(username: string) {
    const users = await loadSnapshotUsersForRequest();
    const normalizedUsername = normalizeUsername(username);
    return users.find((user) => normalizeUsername(user.username) === normalizedUsername) ?? null;
  }

  function invalidateProfilePageCaches() { groupPageDataMemoryCache = null; profilePageDataMemoryCache.clear(); }

  return { invalidateProfilePageCaches, getProfileDataHydrated, getGroupPageData, listMembers, getUserByUsername };
}
