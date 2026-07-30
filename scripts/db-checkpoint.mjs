import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { analyzeDatabaseIntegrity } from "./lib/database-integrity.mjs";
import {
  buildBackupPayload,
  parseArguments,
  prepareDatabaseTarget,
  readDatabaseTables,
  safeTimestamp,
  validateBackupPayload
} from "./lib/database-operations.mjs";

function sanitizeLabel(value) {
  return String(value ?? "manual")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "manual";
}

const args = parseArguments();
const target = prepareDatabaseTarget(args);
const label = sanitizeLabel(typeof args.label === "string" ? args.label : "manual");
const outputPath = resolve(
  process.cwd(),
  typeof args.output === "string"
    ? args.output
    : join(
        "data",
        `database-checkpoint-${target.environment}-${label}-${safeTimestamp()}.json`
      )
);

if (existsSync(outputPath)) {
  throw new Error(`El checkpoint ya existe y no se sobrescribirá: ${outputPath}`);
}

const temporaryPath = `${outputPath}.partial`;
const prisma = new PrismaClient();

try {
  const tables = await readDatabaseTables(prisma);
  const integrity = analyzeDatabaseIntegrity(tables);
  const payload = buildBackupPayload({ target, tables });

  payload.metadata.checkpointLabel = label;
  payload.metadata.integrity = {
    healthy: integrity.healthy,
    errors: integrity.severities.error,
    warnings: integrity.severities.warning
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });

  const persisted = validateBackupPayload(
    JSON.parse(readFileSync(temporaryPath, "utf8"))
  );
  if (persisted.metadata.environment !== target.environment) {
    throw new Error("El entorno del checkpoint escrito no coincide con el solicitado.");
  }
  if (persisted.metadata.databaseHost !== target.databaseHost) {
    throw new Error("El host del checkpoint escrito no coincide con el origen conectado.");
  }

  renameSync(temporaryPath, outputPath);

  console.log(`Checkpoint creado y verificado: ${outputPath}`);
  console.log(
    JSON.stringify(
      {
        environment: target.environment,
        databaseHost: target.databaseHost,
        label,
        healthy: integrity.healthy,
        errors: integrity.severities.error,
        warnings: integrity.severities.warning,
        counts: integrity.counts,
        checksum: persisted.metadata.tablesChecksum
      },
      null,
      2
    )
  );

  if (!integrity.healthy) {
    console.error(
      "El checkpoint se ha conservado para diagnóstico, pero la base contiene errores de integridad."
    );
    process.exitCode = 2;
  }
} finally {
  if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  await prisma.$disconnect();
}
