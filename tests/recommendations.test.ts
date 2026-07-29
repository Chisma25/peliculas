import { describe, expect, it } from "vitest";

import { seedState } from "@/lib/demo-data";
import {
  generatePendingWeeklyOptions,
  generateWeeklyRecommendations,
  hasRecommendationMetadata
} from "@/lib/recommendations";

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
});
