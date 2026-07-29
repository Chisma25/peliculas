import { PrismaClient } from "@prisma/client";

import { parseArguments, prepareDatabaseTarget } from "./lib/database-operations.mjs";

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

const TECHNICAL_TITLES = new Set(["F1 Review 1987", "F1 Review 2006"]);
const prisma = new PrismaClient();

try {
  const records = await prisma.movieRecord.findMany();
  const targets = records.filter((record) => TECHNICAL_TITLES.has(record.data?.title));
  const movieIds = targets.map((record) => record.id);

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

  if (apply && movieIds.length > 0) {
    await prisma.$transaction(async (database) => {
      await database.weeklyBatchRecord.updateMany({
        where: { selectedMovieId: { in: movieIds } },
        data: { selectedMovieId: null }
      });
      await database.weeklyBatchItemRecord.deleteMany({ where: { movieId: { in: movieIds } } });
      await database.ratingRecord.deleteMany({ where: { movieId: { in: movieIds } } });
      await database.watchEntryRecord.deleteMany({ where: { movieId: { in: movieIds } } });
      await database.pendingMovie.deleteMany({ where: { movieId: { in: movieIds } } });
      await database.movieRecord.deleteMany({ where: { id: { in: movieIds } } });
    });
    console.log(`Registros técnicos eliminados de Preview: ${movieIds.length}.`);
  }
} finally {
  await prisma.$disconnect();
}
