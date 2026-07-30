import { describe, expect, it } from "vitest";

import {
  analyzeOperationalHealth,
  type OperationalHealthData
} from "@/lib/operational-health";

function healthyData(): OperationalHealthData {
  return {
    users: [{ id: "user-1" }],
    movies: [{ id: "movie-1" }],
    pendingMovies: [],
    watchEntries: [{ groupId: "group-1", movieId: "movie-1" }],
    ratings: [{ id: "rating-1", movieId: "movie-1", userId: "user-1", score: 8.25 }],
    weeklyBatches: [{ id: "batch-1", selectedMovieId: "movie-1" }],
    weeklyBatchItems: [{ batchId: "batch-1", movieId: "movie-1" }]
  };
}

describe("operational health", () => {
  it("accepts a coherent database snapshot", () => {
    expect(analyzeOperationalHealth(healthyData())).toMatchObject({
      healthy: true,
      issues: []
    });
  });

  it("detects orphan records and invalid scores without exposing record contents", () => {
    const data = healthyData();
    data.ratings.push({
      id: "rating-broken",
      movieId: "missing-movie",
      userId: "missing-user",
      score: 8.3
    });

    expect(analyzeOperationalHealth(data)).toMatchObject({
      healthy: false,
      issues: ["rating_movie_orphan", "rating_score_invalid", "rating_user_orphan"]
    });
  });

  it("detects a movie that is pending and watched at the same time", () => {
    const data = healthyData();
    data.pendingMovies.push({ groupId: "group-1", movieId: "movie-1" });

    expect(analyzeOperationalHealth(data).issues).toContain("movie_pending_and_watched");
  });
});
