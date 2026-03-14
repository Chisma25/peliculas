import { describe, expect, it } from "vitest";

import { seedState } from "@/lib/demo-data";
import { generateWeeklyRecommendations } from "@/lib/recommendations";

describe("generateWeeklyRecommendations", () => {
  it("returns five unseen movies when enough candidates exist", () => {
    const batch = generateWeeklyRecommendations(structuredClone(seedState));

    expect(batch.items).toHaveLength(5);

    const seen = new Set(seedState.watchEntries.map((entry) => entry.movieId));
    for (const item of batch.items) {
      expect(seen.has(item.movieId)).toBe(false);
    }
  });

  it("keeps movie ids unique and includes explanation reasons", () => {
    const batch = generateWeeklyRecommendations(structuredClone(seedState));
    const ids = batch.items.map((item) => item.movieId);

    expect(new Set(ids).size).toBe(ids.length);
    for (const item of batch.items) {
      expect(item.reasons.length).toBeGreaterThan(0);
      expect(item.summary.length).toBeGreaterThan(12);
    }
  });
});
