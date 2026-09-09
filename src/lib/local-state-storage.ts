import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { AppState } from "@/lib/types";

type StateValidator = (value: unknown) => value is AppState;
type StateNormalizer = (state: AppState) => AppState;

const configuredDataDirectory = process.env.APP_DATA_DIR?.trim();
const DATA_DIRECTORY = configuredDataDirectory
  ? resolve(/* turbopackIgnore: true */ configuredDataDirectory)
  : join(process.cwd(), "data");
const STATE_FILE = join(DATA_DIRECTORY, "runtime-state.json");

function ensureDataDirectory() {
  if (!existsSync(DATA_DIRECTORY)) {
    mkdirSync(DATA_DIRECTORY, { recursive: true });
  }
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
