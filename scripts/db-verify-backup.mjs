import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { analyzeDatabaseIntegrity, renderIntegrityReport } from "./lib/database-integrity.mjs";
import { parseArguments, validateBackupPayload } from "./lib/database-operations.mjs";

const args = parseArguments();
if (typeof args.file !== "string") {
  throw new Error("Indica el backup mediante --file=ruta/al/backup.json.");
}

const file = resolve(process.cwd(), args.file);
const payload = validateBackupPayload(JSON.parse(readFileSync(file, "utf8")));
const report = analyzeDatabaseIntegrity(payload.tables);

console.log(`Backup verificado: ${file}`);
console.log(
  renderIntegrityReport(report, {
    environment: payload.metadata.environment,
    databaseHost: payload.metadata.databaseHost
  })
);

if (!report.healthy) process.exitCode = 2;
