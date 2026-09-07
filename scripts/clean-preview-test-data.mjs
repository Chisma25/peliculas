import { PrismaClient } from "@prisma/client";

import { parseArguments, prepareDatabaseTarget } from "./lib/database-operations.mjs";

import { cleanTechnicalMovies } from "../src/lib/database-maintenance.mjs";

const args = parseArguments();
const target = prepareDatabaseTarget(args);
const apply = args.apply === true;
const confirmation = typeof args.confirm === "string" ? args.confirm.trim().toLowerCase() : "";

if (target.environment !== "preview") {
  throw new Error("Este limpiador solo puede ejecutarse contra Preview.");
}
if (apply && confirmation !== "preview") {
  throw new Error("Para aplicar cambios añade --confirm=preview.");
}


const prisma = new PrismaClient();

try {
  const targets = await cleanTechnicalMovies(prisma, { apply });

  console.log(
    JSON.stringify(
      {
        environment: target.environment,
        databaseHost: target.databaseHost,
        mode: apply ? "apply" : "dry-run",
        targets: targets.map((record) => ({
          id: record.id,
          title: record.data.title,
          year: record.data.year
        }))
      },
      null,
      2
    )
  );

  if (apply) console.log(`Registros técnicos eliminados de Preview: ${targets.length}.`);
} finally {
  await prisma.$disconnect();
}
