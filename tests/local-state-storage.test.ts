import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { seedState } from "../src/lib/demo-data";
import type { AppState } from "../src/lib/types";

let testDirectory: string | null = null;
const originalDataDirectory = process.env.APP_DATA_DIR;

function createTestDirectory() {
  testDirectory = mkdtempSync(join(tmpdir(), "cine-local-state-"));
  process.env.APP_DATA_DIR = testDirectory;
  vi.resetModules();
}

afterEach(() => {
  if (originalDataDirectory === undefined) {
    delete process.env.APP_DATA_DIR;
  } else {
    process.env.APP_DATA_DIR = originalDataDirectory;
  }

  if (testDirectory) {
    const resolvedDirectory = resolve(testDirectory);
    if (!resolvedDirectory.startsWith(resolve(tmpdir()))) {
      throw new Error("El directorio temporal salió del área segura esperada.");
    }
    rmSync(resolvedDirectory, { recursive: true, force: true });
    testDirectory = null;
  }
  vi.resetModules();
});

describe("local state storage", () => {
  it("writes and reads a validated state atomically", async () => {
    createTestDirectory();
    const { readLocalState, saveLocalStateStrict } = await import("../src/lib/local-state-storage");
    const state = structuredClone(seedState);

    saveLocalStateStrict(state);
    const loaded = readLocalState(
      (value): value is AppState =>
        Boolean(value && typeof value === "object" && Array.isArray((value as AppState).movies)),
      (value) => value
    );

    expect(loaded).toEqual(state);
  });

  it("keeps only the newest deferred snapshot while preserving other writes", async () => {
    createTestDirectory();
    const { loadDeferredWriteQueue, saveDeferredWriteQueue } = await import("../src/lib/local-state-storage");
    const firstState = structuredClone(seedState);
    const latestState = structuredClone(seedState);
    latestState.group.name = "Estado más reciente";

    saveDeferredWriteQueue([
      { type: "snapshot-backup", state: firstState },
      { type: "pending-remove", groupId: "group_main", movieId: "movie_test" },
      { type: "snapshot-backup", state: latestState }
    ]);

    expect(loadDeferredWriteQueue()).toEqual([
      { type: "pending-remove", groupId: "group_main", movieId: "movie_test" },
      { type: "snapshot-backup", state: latestState }
    ]);
  });
});
