import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { analyzeDatabaseIntegrity, renderIntegrityReport } from "./lib/database-integrity.mjs";
import {
  parseArguments,
  prepareDatabaseTarget,
  readDatabaseTables,
  validateBackupPayload
} from "./lib/database-operations.mjs";

const args = parseArguments();
if (args["dry-run"] !== true) {
  throw new Error(
    "Restauración bloqueada: esta herramienta solo admite --dry-run y nunca escribe en la base."
  );
}
if (typeof args.file !== "string") {
  throw new Error("Indica el backup mediante --file=ruta/al/backup.json.");
}

const target = prepareDatabaseTarget(args);
const file = resolve(process.cwd(), args.file);
const backup = validateBackupPayload(JSON.parse(readFileSync(file, "utf8")));

if (backup.metadata.environment !== target.environment) {
  throw new Error(`El backup pertenece a ${backup.metadata.environment}, no a ${target.environment}.`);
}
if (backup.metadata.databaseHost !== target.databaseHost) {
  throw new Error("El host del backup no coincide exactamente con el destino conectado.");
}

const prisma = new PrismaClient();
try {
  const currentTables = await readDatabaseTables(prisma);
  const backupReport = analyzeDatabaseIntegrity(backup.tables);
  const currentReport = analyzeDatabaseIntegrity(currentTables);
  const tableNames = Object.keys(backupReport.counts);
  const countChanges = Object.fromEntries(
    tableNames.map((name) => [
      name,
      {
        current: currentReport.counts[name] ?? 0,
        backup: backupReport.counts[name] ?? 0,
        delta: (backupReport.counts[name] ?? 0) - (currentReport.counts[name] ?? 0)
      }
    ])
  );

  console.log("SIMULACIÓN: no se ha escrito ninguna fila.");
  console.log(`Backup: ${file}`);
  console.log(`Destino: ${target.environment} · ${target.databaseHost}`);
  console.log("\nCambios de volumen que produciría la restauración:");
  console.log(JSON.stringify(countChanges, null, 2));
  console.log("\nSalud del backup:");
  console.log(renderIntegrityReport(backupReport, target));

  if (!backupReport.healthy) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
