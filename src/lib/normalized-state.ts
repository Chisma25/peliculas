import type { AppState } from "@/lib/types";

export type NormalizedStateCollections = Pick<
  AppState,
  "users" | "movies" | "ratings" | "watchEntries" | "pendingMovieIds" | "weeklyBatches"
>;

export function mergeNormalizedState(
  snapshotState: AppState,
  normalizedCollections: NormalizedStateCollections
): AppState {
  return {
    ...snapshotState,
    users: normalizedCollections.users,
    movies: normalizedCollections.movies,
    ratings: normalizedCollections.ratings,
    watchEntries: normalizedCollections.watchEntries,
    pendingMovieIds: normalizedCollections.pendingMovieIds,
    weeklyBatches: normalizedCollections.weeklyBatches
  };
}

export function hasNormalizedDatabaseState(collections: NormalizedStateCollections) {
  return collections.users.length > 0 || collections.movies.length > 0;
}

export function toCompactSnapshotState(state: AppState): AppState {
  return {
    ...state,
    users: state.users.map((user) => ({
      ...user,
      avatarUrl: undefined
    })),
    ratings: [],
    watchEntries: [],
    pendingMovieIds: [],
    weeklyBatches: []
  };
}
