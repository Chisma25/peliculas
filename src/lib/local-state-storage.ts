import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { AppState, Movie, User, UserRating, WatchEntry, WeeklyRecommendationBatch } from "@/lib/types";

export type DeferredDatabaseWrite =
  | {
      type: "user-upsert";
      user: User;
    }
  | {
      type: "movie-upsert";
      movie: Movie;
    }
  | {
      type: "pending-upsert";
      groupId: string;
      movieId: string;
      addedAt: string;
    }
  | {
      type: "pending-remove";
      groupId: string;
      movieId: string;
    }
  | {
      type: "watch-upsert";
      entry: WatchEntry;
    }
  | {
      type: "rating-upsert";
      rating: UserRating;
    }
  | {
      type: "weekly-batch-upsert";
      batch: WeeklyRecommendationBatch;
    }
  | {
      type: "weekly-batch-selection";
      batchId: string;
      selectedMovieId?: string;
    }
  | {
      type: "snapshot-backup";
      state: AppState;
    };

type StateValidator = (value: unknown) => value is AppState;
type StateNormalizer = (state: AppState) => AppState;

const configuredDataDirectory = process.env.APP_DATA_DIR?.trim();
const DATA_DIRECTORY = configuredDataDirectory
  ? resolve(/* turbopackIgnore: true */ configuredDataDirectory)
  : join(process.cwd(), "data");
const STATE_FILE = join(DATA_DIRECTORY, "runtime-state.json");
const WRITE_QUEUE_FILE = join(DATA_DIRECTORY, "runtime-write-queue.json");

function ensureDataDirectory() {
  if (!existsSync(DATA_DIRECTORY)) {
    mkdirSync(DATA_DIRECTORY, { recursive: true });
  }
}

function isDeferredDatabaseWrite(value: unknown): value is DeferredDatabaseWrite {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { type?: string };
  return (
    candidate.type === "pending-upsert" ||
    candidate.type === "pending-remove" ||
    candidate.type === "watch-upsert" ||
    candidate.type === "rating-upsert" ||
    candidate.type === "weekly-batch-upsert" ||
    candidate.type === "weekly-batch-selection" ||
    candidate.type === "user-upsert" ||
    candidate.type === "movie-upsert" ||
    candidate.type === "snapshot-backup"
  );
}

function compactDeferredWriteQueue(queue: DeferredDatabaseWrite[]) {
  const latestSnapshotIndex = [...queue]
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.type === "snapshot-backup")
    .map(({ index }) => index)
    .pop();

  return queue.filter((entry, index) => entry.type !== "snapshot-backup" || index === latestSnapshotIndex);
}

export function readLocalState(validate: StateValidator, normalize: StateNormalizer) {
  try {
    if (!existsSync(STATE_FILE)) {
      return null;
    }

    const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8")) as unknown;
    return validate(parsed) ? normalize(parsed) : null;
  } catch {
    return null;
  }
}

export function saveLocalStateStrict(state: AppState) {
  ensureDataDirectory();

  const temporaryStateFile = `${STATE_FILE}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(temporaryStateFile, JSON.stringify(state, null, 2), "utf8");
    renameSync(temporaryStateFile, STATE_FILE);
  } catch (error) {
    rmSync(temporaryStateFile, { force: true });
    throw error;
  }
}

export function saveLocalState(state: AppState) {
  try {
    saveLocalStateStrict(state);
  } catch {
    // Persistencia local best-effort.
  }
}

export function loadDeferredWriteQueue() {
  try {
    if (!existsSync(WRITE_QUEUE_FILE)) {
      return [];
    }

    const parsed = JSON.parse(readFileSync(WRITE_QUEUE_FILE, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isDeferredDatabaseWrite) : [];
  } catch {
    return [];
  }
}

export function saveDeferredWriteQueue(queue: DeferredDatabaseWrite[]) {
  try {
    ensureDataDirectory();
    writeFileSync(WRITE_QUEUE_FILE, JSON.stringify(compactDeferredWriteQueue(queue), null, 2), "utf8");
  } catch {
    // Persistencia local best-effort.
  }
}
