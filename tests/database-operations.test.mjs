import { describe, expect, it } from "vitest";

import {
  buildBackupPayload,
  checksumTables,
  parseArguments,
  validateBackupPayload
} from "../scripts/lib/database-operations.mjs";

const tables = {
  appSnapshots: [],
  tmdbCacheEntries: [],
  users: [{ id: "user-1" }],
  movies: [{ id: "movie-1" }],
  pendingMovies: [],
  watchEntries: [],
  ratings: [],
  weeklyBatches: [],
  weeklyBatchItems: []
};

describe("database operation safeguards", () => {
  it("parses explicit CLI flags without evaluating their contents", () => {
    expect(
      parseArguments([
        "--dry-run",
        "--environment=preview",
        "--file=data/database-export-preview.json"
      ])
    ).toEqual({
      "dry-run": true,
      environment: "preview",
      file: "data/database-export-preview.json"
    });
  });

  it("builds and verifies a versioned backup checksum", () => {
    const payload = buildBackupPayload({
      target: {
        environment: "preview",
        databaseHost: "preview.example.com",
        databaseName: "cine"
      },
      tables,
      exportedAt: "2026-07-28T20:00:00.000Z"
    });

    expect(payload.metadata.tablesChecksum).toBe(checksumTables(tables));
    expect(validateBackupPayload(payload)).toBe(payload);
  });

  it("rejects a backup whose contents changed after export", () => {
    const payload = buildBackupPayload({
      target: {
        environment: "production",
        databaseHost: "production.example.com",
        databaseName: "cine"
      },
      tables: structuredClone(tables)
    });
    payload.tables.movies.push({ id: "movie-injected" });

    expect(() => validateBackupPayload(payload)).toThrow("checksum");
  });
});
