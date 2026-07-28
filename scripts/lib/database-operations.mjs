import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export function parseArguments(argv = process.argv.slice(2)) {
  const parsed = {};

  for (const argument of argv) {
    if (!argument.startsWith("--")) throw new Error(`Argumento no reconocido: ${argument}`);
    const [rawKey, ...rawValue] = argument.slice(2).split("=");
    parsed[rawKey] = rawValue.length > 0 ? rawValue.join("=") : true;
  }

  return parsed;
}

export function loadEnvironmentFile(filename, options = {}) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) throw new Error(`No existe el archivo de entorno ${path}.`);

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || (!options.override && process.env[match[1]])) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

export function prepareDatabaseTarget(args) {
  if (typeof args["env-file"] === "string") {
    loadEnvironmentFile(args["env-file"], { override: true });
  } else {
    const defaultFile = join(process.cwd(), ".env.local");
    if (existsSync(defaultFile)) loadEnvironmentFile(defaultFile);
  }

  const environment =
    (typeof args.environment === "string" ? args.environment : process.env.DATABASE_ENVIRONMENT)
      ?.trim()
      .toLowerCase();
  if (!["development", "preview", "production"].includes(environment)) {
    throw new Error(
      "Indica explícitamente --environment=development, --environment=preview o --environment=production."
    );
  }

  const configuredEnvironment = process.env.DATABASE_ENVIRONMENT?.trim().toLowerCase();
  if (configuredEnvironment && configuredEnvironment !== environment) {
    throw new Error(
      `El argumento environment=${environment} no coincide con DATABASE_ENVIRONMENT=${configuredEnvironment}.`
    );
  }

  const appEnvironment = process.env.APP_ENV?.trim().toLowerCase();
  if (appEnvironment && appEnvironment !== environment) {
    throw new Error(`APP_ENV=${appEnvironment} no coincide con el destino ${environment}.`);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("Falta DATABASE_URL.");

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL no es una URL válida.");
  }
  if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
    throw new Error("DATABASE_URL debe utilizar PostgreSQL.");
  }

  const productionHost = process.env.PRODUCTION_DATABASE_HOST?.trim().toLowerCase();
  const databaseHost = parsedUrl.hostname.toLowerCase();
  if (productionHost) {
    if (environment === "production" && databaseHost !== productionHost) {
      throw new Error("El destino declarado como Producción no coincide con PRODUCTION_DATABASE_HOST.");
    }
    if (environment === "preview" && databaseHost === productionHost) {
      throw new Error("Preview no puede apuntar al host declarado de Producción.");
    }
  }

  return {
    environment,
    databaseHost,
    databaseName: parsedUrl.pathname.replace(/^\//, "") || null
  };
}

export async function readDatabaseTables(prisma) {
  const [
    appSnapshots,
    tmdbCacheEntries,
    users,
    movies,
    pendingMovies,
    watchEntries,
    ratings,
    weeklyBatches,
    weeklyBatchItems
  ] = await Promise.all([
    prisma.appSnapshot.findMany(),
    prisma.tmdbCacheEntry.findMany(),
    prisma.userRecord.findMany(),
    prisma.movieRecord.findMany(),
    prisma.pendingMovie.findMany(),
    prisma.watchEntryRecord.findMany(),
    prisma.ratingRecord.findMany(),
    prisma.weeklyBatchRecord.findMany(),
    prisma.weeklyBatchItemRecord.findMany()
  ]);

  return {
    appSnapshots,
    tmdbCacheEntries,
    users,
    movies,
    pendingMovies,
    watchEntries,
    ratings,
    weeklyBatches,
    weeklyBatchItems
  };
}

export function checksumTables(tables) {
  return createHash("sha256").update(JSON.stringify(tables)).digest("hex");
}

export function buildBackupPayload({ target, tables, exportedAt = new Date().toISOString() }) {
  return {
    metadata: {
      format: "cine-semanal-database-export",
      version: 1,
      exportedAt,
      environment: target.environment,
      databaseHost: target.databaseHost,
      databaseName: target.databaseName,
      checksumAlgorithm: "sha256",
      tablesChecksum: checksumTables(tables)
    },
    tables
  };
}

export function validateBackupPayload(payload) {
  if (!payload || typeof payload !== "object" || !payload.metadata || !payload.tables) {
    throw new Error("El archivo no tiene el formato de backup esperado.");
  }
  if (payload.metadata.format !== "cine-semanal-database-export" || payload.metadata.version !== 1) {
    throw new Error("El formato o la versión del backup no son compatibles.");
  }

  const checksum = checksumTables(payload.tables);
  if (checksum !== payload.metadata.tablesChecksum) {
    throw new Error("El checksum del backup no coincide: el archivo puede estar incompleto o alterado.");
  }

  return payload;
}

export function safeTimestamp(value = new Date()) {
  return value.toISOString().replace(/[:.]/g, "-");
}
