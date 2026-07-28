import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  buildBackupPayload,
  parseArguments,
  prepareDatabaseTarget,
  readDatabaseTables,
  safeTimestamp
} from "./lib/database-operations.mjs";

const args = parseArguments();
const target = prepareDatabaseTarget(args);
const prisma = new PrismaClient();

try {
  const tables = await readDatabaseTables(prisma);
  const payload = buildBackupPayload({ target, tables });
  const defaultFilename = join(
    "data",
    `database-export-${target.environment}-${safeTimestamp()}.json`
  );
  const outputPath = resolve(
    process.cwd(),
    typeof args.output === "string" ? args.output : defaultFilename
  );

  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`Exportación de solo lectura completada: ${outputPath}`);
  console.log(
    JSON.stringify(
      {
        environment: target.environment,
        databaseHost: target.databaseHost,
        counts: Object.fromEntries(
          Object.entries(tables).map(([name, entries]) => [name, entries.length])
        ),
        checksum: payload.metadata.tablesChecksum
      },
      null,
      2
    )
  );
} finally {
  await prisma.$disconnect();
}
