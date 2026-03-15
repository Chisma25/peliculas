import { describe, expect, it } from "vitest";

import { seedState } from "@/lib/demo-data";
import { generatePendingWeeklyOptions, generateWeeklyRecommendations } from "@/lib/recommendations";

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
});
