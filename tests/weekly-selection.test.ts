import { describe, expect, it } from "vitest";

import type { WeeklyRecommendationBatch } from "@/lib/types";
import {
  classifyWeeklySelection,
  isWeeklyBatchCurrent,
  shouldCarryWeeklySelection
} from "@/lib/weekly-selection";

const batch: WeeklyRecommendationBatch = {
  id: "batch-current",
  groupId: "group-cine",
  weekOf: "2026-07-27T00:00:00.000Z",
  createdAt: "2026-07-27T18:00:00.000Z",
  items: [
    {
      id: "recommendation-1",
      movieId: "movie-recommended",
      score: 9,
      summary: "Recomendación semanal",
      reasons: []
    }
  ]
};

describe("weekly movie selection", () => {
  it("allows a recommendation from the stored batch", () => {
    expect(classifyWeeklySelection(batch, [], "movie-recommended")).toBe("recommendation");
  });

  it("allows any movie currently saved in pending", () => {
    expect(classifyWeeklySelection(batch, ["movie-pending", "movie-another"], "movie-another")).toBe(
      "pending"
    );
  });

  it("rejects a movie that is neither recommended nor pending", () => {
    expect(classifyWeeklySelection(batch, ["movie-pending"], "movie-manipulated")).toBeNull();
  });

  it("carries an unviewed selection into a refreshed recommendation batch", () => {
    const selectedBatch = { ...batch, selectedMovieId: "movie-pending" };

    expect(shouldCarryWeeklySelection(selectedBatch, ["movie-other"], ["movie-pending"])).toBe(true);
  });

  it("starts a refreshed batch without a selection after the movie was watched", () => {
    const selectedBatch = { ...batch, selectedMovieId: "movie-pending" };

    expect(shouldCarryWeeklySelection(selectedBatch, ["movie-pending"], ["movie-pending"])).toBe(false);
  });

  it("does not carry a selection that is no longer pending", () => {
    const selectedBatch = { ...batch, selectedMovieId: "movie-removed" };

    expect(shouldCarryWeeklySelection(selectedBatch, [], ["movie-pending"])).toBe(false);
  });

  it("recognizes a batch from the current week", () => {
    expect(isWeeklyBatchCurrent(batch, new Date("2026-07-29T12:00:00.000Z"))).toBe(true);
  });

  it("expires a batch when a new week starts", () => {
    expect(isWeeklyBatchCurrent(batch, new Date("2026-08-03T12:00:00.000Z"))).toBe(false);
  });
});
