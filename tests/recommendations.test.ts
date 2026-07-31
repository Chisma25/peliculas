import { describe, expect, it } from "vitest";

import { seedState } from "@/lib/demo-data";
import {
  generatePendingWeeklyOptions,
  generateWeeklyRecommendations,
  hasRecommendationMetadata,
  rankNowPlayingForGroup
} from "@/lib/recommendations";
import type { Movie } from "@/lib/types";

function makeNowPlayingMovie(id: string, rating: number, popularity: number, voteCount: number): Movie {
  return {
    ...structuredClone(seedState.movies[0]),
    id: `tmdb_${id}`,
    slug: `cartelera-${id}`,
    title: `Cartelera ${id}`,
    year: 2026,
    releaseDate: "2026-07-24",
    releaseDateEs: "2026-07-24",
    genres: ["Drama"],
    director: `Dirección ${id}`,
    posterUrl: `https://image.tmdb.org/t/p/w500/${id}.jpg`,
    backdrop: `https://image.tmdb.org/t/p/w780/${id}.jpg`,
    externalRating: {
      source: "TMDb",
      value: `${Math.round(rating * 10)}%`
    },
    popularity,
    voteCount,
    sourceIds: {
      tmdb: id
    }
  };
}

describe("recommendations engine", () => {
  it("returns three discovery movies that are neither watched nor pending", () => {
    const state = structuredClone(seedState);
    state.pendingMovieIds = ["movie_memories_of_murder"];

    const batch = generateWeeklyRecommendations(state);
    expect(batch.items).toHaveLength(3);

    const seenIds = new Set(state.watchEntries.map((entry) => entry.movieId));
    const pendingIds = new Set(state.pendingMovieIds);

    for (const item of batch.items) {
      expect(seenIds.has(item.movieId)).toBe(false);
      expect(pendingIds.has(item.movieId)).toBe(false);
    }
  });

  it("returns five weekly options from pending when enough pending movies exist", () => {
    const state = structuredClone(seedState);
    state.pendingMovieIds = [
      "movie_arrival",
      "movie_drive_my_car",
      "movie_memories_of_murder",
      "movie_past_lives",
      "movie_seven_samurai",
      "movie_chungking_express"
    ];

    const options = generatePendingWeeklyOptions(state);
    expect(options).toHaveLength(5);

    const pendingIds = new Set(state.pendingMovieIds);
    for (const item of options) {
      expect(pendingIds.has(item.movieId)).toBe(true);
      expect(item.summary.length).toBeGreaterThan(20);
    }
  });

  it("includes the decision signals needed by the weekly radar", () => {
    const state = structuredClone(seedState);
    state.pendingMovieIds = [
      "movie_arrival",
      "movie_drive_my_car",
      "movie_memories_of_murder",
      "movie_past_lives",
      "movie_seven_samurai"
    ];

    const options = generatePendingWeeklyOptions(state);

    for (const item of options) {
      expect(item.score).toBeGreaterThanOrEqual(0);
      expect(item.score).toBeLessThanOrEqual(100);
      expect(item.reasons[0]?.detail.length).toBeGreaterThan(20);
      expect(item.metrics).toHaveLength(4);
      expect(item.metrics?.map((metric) => metric.label)).toEqual([
        "Radar grupo",
        "Consenso",
        "Semana",
        "Momento"
      ]);
      expect(item.metrics?.every((metric) => metric.value >= 0 && metric.value <= 100)).toBe(true);
    }
  });

  it("keeps recommendation ids unique and reasons populated", () => {
    const state = structuredClone(seedState);
    state.pendingMovieIds = ["movie_memories_of_murder"];
    const batch = generateWeeklyRecommendations(state);
    const ids = batch.items.map((item) => item.movieId);

    expect(new Set(ids).size).toBe(ids.length);
    for (const item of batch.items) {
      expect(item.reasons.length).toBeGreaterThan(0);
      expect(item.summary.length).toBeGreaterThan(12);
    }
  });

  it("keeps incomplete movies available in pending but out of the weekly radar", () => {
    const state = structuredClone(seedState);
    const incompleteMovie = {
      ...state.movies[0],
      id: "movie-incomplete",
      slug: "f1-review-2006",
      title: "F1 Review 2006",
      year: 0,
      genres: []
    };
    state.movies.push(incompleteMovie);
    state.pendingMovieIds = [
      incompleteMovie.id,
      "movie_arrival",
      "movie_drive_my_car",
      "movie_memories_of_murder",
      "movie_past_lives",
      "movie_seven_samurai",
      "movie_chungking_express"
    ];

    expect(hasRecommendationMetadata(incompleteMovie)).toBe(false);
    expect(generatePendingWeeklyOptions(state).map((item) => item.movieId)).not.toContain(
      incompleteMovie.id
    );
    expect(state.pendingMovieIds).toContain(incompleteMovie.id);
  });

  it("prioritizes strong public interest for current theatrical suggestions", () => {
    const state = structuredClone(seedState);
    const candidates = [
      makeNowPlayingMovie("801", 8.4, 210, 4_800),
      makeNowPlayingMovie("802", 7.6, 125, 1_900),
      makeNowPlayingMovie("803", 7.2, 80, 760),
      makeNowPlayingMovie("804", 5.1, 12, 22)
    ];

    const suggestions = rankNowPlayingForGroup(state, candidates, 3);

    expect(suggestions).toHaveLength(3);
    expect(suggestions[0].movie.sourceIds?.tmdb).toBe("801");
    expect(suggestions.map((item) => item.movie.sourceIds?.tmdb)).not.toContain("804");
  });

  it("keeps watched, pending and incomplete records out of current theatrical suggestions", () => {
    const state = structuredClone(seedState);
    const watchedMovie = state.movies.find((movie) => state.watchEntries.some((entry) => entry.movieId === movie.id))!;
    const pendingMovie = state.movies.find((movie) => !state.watchEntries.some((entry) => entry.movieId === movie.id))!;
    watchedMovie.sourceIds = { ...watchedMovie.sourceIds, tmdb: "901" };
    pendingMovie.sourceIds = {};
    state.pendingMovieIds = [pendingMovie.id];

    const incomplete = {
      ...makeNowPlayingMovie("903", 8.8, 240, 5_000),
      genres: ["Pendiente"]
    };
    const candidates = [
      makeNowPlayingMovie("901", 8.9, 250, 6_000),
      {
        ...makeNowPlayingMovie("902", 8.7, 230, 5_500),
        slug: pendingMovie.slug
      },
      incomplete,
      makeNowPlayingMovie("904", 8.1, 180, 3_000),
      makeNowPlayingMovie("905", 7.8, 140, 2_000),
      makeNowPlayingMovie("906", 7.5, 110, 1_200)
    ];

    const ids = rankNowPlayingForGroup(state, candidates, 3).map((item) => item.movie.sourceIds?.tmdb);

    expect(ids).toEqual(expect.arrayContaining(["904", "905", "906"]));
    expect(ids).not.toEqual(expect.arrayContaining(["901", "902", "903"]));
  });
});
