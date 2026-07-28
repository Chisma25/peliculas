import { describe, expect, it } from "vitest";

import type { WeeklyRecommendationBatch } from "@/lib/types";
import { classifyWeeklySelection, shouldCarryWeeklySelection } from "@/lib/weekly-selection";

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

    expect(shouldCarryWeeklySelection(selectedBatch, ["movie-other"])).toBe(true);
  });

  it("starts a refreshed batch without a selection after the movie was watched", () => {
    const selectedBatch = { ...batch, selectedMovieId: "movie-pending" };

    expect(shouldCarryWeeklySelection(selectedBatch, ["movie-pending"])).toBe(false);
  });
});
