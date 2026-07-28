import { describe, expect, it } from "vitest";

import {
  hasNormalizedDatabaseState,
  mergeNormalizedState,
  toCompactSnapshotState,
  type NormalizedStateCollections
} from "@/lib/normalized-state";
import type { AppState } from "@/lib/types";

function createState(): AppState {
  return {
    users: [
      {
        id: "user_snapshot",
        name: "Snapshot",
        username: "snapshot",
        email: "snapshot@example.com",
        avatarSeed: "snapshot",
        avatarUrl: "data:image/png;base64,avatar",
        passwordHash: "hash"
      }
    ],
    group: {
      id: "group_cine_club",
      name: "Cine club",
      memberIds: ["user_snapshot"],
      accentColor: "#fff"
    },
    movies: [
      {
        id: "movie_snapshot",
        slug: "snapshot",
        title: "Snapshot",
        year: 2020,
        synopsis: "",
        durationMinutes: 90,
        genres: [],
        director: "",
        cast: [],
        language: "",
        country: "",
        externalRating: { source: "TMDb", value: "0%" }
      }
    ],
    ratings: [
      {
        id: "rating_snapshot",
        movieId: "movie_snapshot",
        userId: "user_snapshot",
        score: 8
      }
    ],
    watchEntries: [
      {
        id: "watch_snapshot",
        movieId: "movie_snapshot",
        groupId: "group_cine_club"
      }
    ],
    pendingMovieIds: ["movie_snapshot"],
    weeklyBatches: [],
    activity: []
  };
}

function createNormalizedCollections(): NormalizedStateCollections {
  return {
    users: [],
    movies: [],
    ratings: [],
    watchEntries: [],
    pendingMovieIds: [],
    weeklyBatches: []
  };
}

describe("normalized state authority", () => {
  it("does not resurrect deleted records from a populated legacy snapshot", () => {
    const merged = mergeNormalizedState(createState(), createNormalizedCollections());

    expect(merged.users).toEqual([]);
    expect(merged.movies).toEqual([]);
    expect(merged.ratings).toEqual([]);
    expect(merged.watchEntries).toEqual([]);
    expect(merged.pendingMovieIds).toEqual([]);
  });

  it("uses normalized records even when they disagree with the snapshot", () => {
    const normalized = createNormalizedCollections();
    normalized.pendingMovieIds = ["movie_normalized"];
    normalized.ratings = [
      {
        id: "rating_normalized",
        movieId: "movie_normalized",
        userId: "user_normalized",
        score: 7.25
      }
    ];

    const merged = mergeNormalizedState(createState(), normalized);

    expect(merged.pendingMovieIds).toEqual(["movie_normalized"]);
    expect(merged.ratings).toEqual(normalized.ratings);
  });

  it("recognizes a normalized database independently of the snapshot", () => {
    const normalized = createNormalizedCollections();
    expect(hasNormalizedDatabaseState(normalized)).toBe(false);

    normalized.movies = [createState().movies[0]];
    expect(hasNormalizedDatabaseState(normalized)).toBe(true);
  });

  it("keeps mutable normalized collections out of snapshot backups", () => {
    const compact = toCompactSnapshotState(createState());

    expect(compact.ratings).toEqual([]);
    expect(compact.watchEntries).toEqual([]);
    expect(compact.pendingMovieIds).toEqual([]);
    expect(compact.weeklyBatches).toEqual([]);
    expect(compact.users).toHaveLength(1);
    expect(compact.users[0].avatarUrl).toBeUndefined();
    expect(compact.movies).toHaveLength(1);
  });
});
