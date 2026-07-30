type RuntimeEnvironment = Record<string, string | undefined>;

export class DataUnavailableError extends Error {
  readonly code = "DATA_UNAVAILABLE";

  constructor(message = "Los datos no están disponibles temporalmente.") {
    super(message);
    this.name = "DataUnavailableError";
  }
}

export function shouldFailClosedOnDatabaseError(environment: RuntimeEnvironment = process.env) {
  const appEnvironment = environment.APP_ENV?.trim().toLowerCase();
  const vercelEnvironment = environment.VERCEL_ENV?.trim().toLowerCase();
  const effectiveEnvironment = vercelEnvironment || appEnvironment;

  return effectiveEnvironment === "production" || effectiveEnvironment === "preview";
}

export function ensureDatabaseReadCanProceed(
  input: {
    usesDatabase: boolean;
    backoffUntil: number;
    now?: number;
  },
  environment: RuntimeEnvironment = process.env
) {
  if (!input.usesDatabase) {
    return false;
  }

  if ((input.now ?? Date.now()) >= input.backoffUntil) {
    return true;
  }

  if (shouldFailClosedOnDatabaseError(environment)) {
    throw new DataUnavailableError();
  }

  return false;
}

export function failClosedAfterDatabaseReadError(environment: RuntimeEnvironment = process.env): never | void {
  if (shouldFailClosedOnDatabaseError(environment)) {
    throw new DataUnavailableError();
  }
}
