import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { analyzeDatabaseIntegrity, renderIntegrityReport } from "./lib/database-integrity.mjs";
import {
  parseArguments,
  prepareDatabaseTarget,
  readDatabaseTables
} from "./lib/database-operations.mjs";

const args = parseArguments();
const target = prepareDatabaseTarget(args);
const prisma = new PrismaClient();

try {
  const tables = await readDatabaseTables(prisma);
  const report = analyzeDatabaseIntegrity(tables);
  const payload = {
    metadata: {
      checkedAt: new Date().toISOString(),
      environment: target.environment,
      databaseHost: target.databaseHost,
      databaseName: target.databaseName,
      readOnly: true
    },
    ...report
  };

  console.log(renderIntegrityReport(report, target));

  if (typeof args.output === "string") {
    const outputPath = resolve(process.cwd(), args.output);
    writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`\nInforme guardado en ${outputPath}`);
  }

  if (!report.healthy) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
