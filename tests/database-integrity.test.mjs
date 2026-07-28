import { describe, expect, it } from "vitest";

import { analyzeDatabaseIntegrity } from "../scripts/lib/database-integrity.mjs";

function healthyTables() {
  return {
    appSnapshots: [
      {
        id: "main",
        data: {
          users: [{ id: "user-1" }],
          movies: [{ id: "movie-1" }],
          group: { memberIds: ["user-1"] }
        }
      }
    ],
    tmdbCacheEntries: [],
    users: [{ id: "user-1", username: "isma" }],
    movies: [
      {
        id: "movie-1",
        slug: "oppenheimer",
        data: {
          title: "Oppenheimer",
          year: 2023,
          genres: ["Drama"],
          externalRating: { source: "TMDb", value: "81%" }
        }
      }
    ],
    pendingMovies: [],
    watchEntries: [
      {
        id: "watch-1",
        groupId: "group-1",
        movieId: "movie-1",
        watchedOn: "2026-07-27T20:00:00.000Z"
      }
    ],
    ratings: [
      {
        id: "rating-1",
        movieId: "movie-1",
        userId: "user-1",
        score: 8.25
      }
    ],
    weeklyBatches: [
      {
        id: "batch-1",
        groupId: "group-1",
        selectedMovieId: "movie-1",
        weekOf: "2026-07-27T00:00:00.000Z"
      }
    ],
    weeklyBatchItems: [{ id: "item-1", batchId: "batch-1", movieId: "movie-1" }]
  };
}

describe("database integrity audit", () => {
  it("accepts a consistent database snapshot", () => {
    const report = analyzeDatabaseIntegrity(healthyTables());

    expect(report.healthy).toBe(true);
    expect(report.severities).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it("detects orphan records and invalid quarter-point scores", () => {
    const tables = healthyTables();
    tables.ratings.push({
      id: "rating-orphan",
      movieId: "missing-movie",
      userId: "missing-user",
      score: 7.3
    });

    const codes = analyzeDatabaseIntegrity(tables).findings.map((finding) => finding.code);

    expect(codes).toContain("RATING_MOVIE_ORPHAN");
    expect(codes).toContain("RATING_USER_ORPHAN");
    expect(codes).toContain("RATING_SCORE_INVALID");
  });

  it("detects pending/watched overlap and selections of missing movies", () => {
    const tables = healthyTables();
    tables.pendingMovies.push({
      groupId: "group-1",
      movieId: "movie-1",
      addedAt: "2026-07-27T20:00:00.000Z"
    });
    tables.weeklyBatches[0].selectedMovieId = "movie-outside-batch";

    const codes = analyzeDatabaseIntegrity(tables).findings.map((finding) => finding.code);

    expect(codes).toContain("MOVIE_PENDING_AND_WATCHED");
    expect(codes).toContain("BATCH_SELECTION_MOVIE_ORPHAN");
  });

  it("accepts a pending selection outside the recommendation batch", () => {
    const tables = healthyTables();
    tables.movies.push({
      id: "movie-pending",
      slug: "matrix",
      data: {
        title: "Matrix",
        year: 1999,
        genres: ["Ciencia ficción"],
        externalRating: { source: "TMDb", value: "82%" }
      }
    });
    tables.pendingMovies.push({
      groupId: "group-1",
      movieId: "movie-pending",
      addedAt: "2026-07-27T20:00:00.000Z"
    });
    tables.weeklyBatches[0].selectedMovieId = "movie-pending";

    const report = analyzeDatabaseIntegrity(tables);

    expect(report.healthy).toBe(true);
    expect(report.findings.map((finding) => finding.code)).not.toContain(
      "BATCH_SELECTION_OUTSIDE_BATCH"
    );
  });

  it("reports incomplete metadata without declaring structural corruption", () => {
    const tables = healthyTables();
    tables.movies[0].data = {
      title: "F1 Review 1987",
      year: 1987,
      genres: ["Pendiente"],
      externalRating: { source: "TMDb", value: "0%" }
    };

    const report = analyzeDatabaseIntegrity(tables);

    expect(report.healthy).toBe(true);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "warning", code: "MOVIE_METADATA_INCOMPLETE" })
      ])
    );
  });
});
