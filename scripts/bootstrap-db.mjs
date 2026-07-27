import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

const SNAPSHOT_ID = process.env.APP_SNAPSHOT_ID || "main";
const DATA_DIR = process.env.APP_DATA_DIR?.trim() || join(process.cwd(), "data");
const STATE_FILE = join(DATA_DIR, "runtime-state.json");
const APP_ENV = process.env.APP_ENV?.trim().toLowerCase();
const DATABASE_ENVIRONMENT = process.env.DATABASE_ENVIRONMENT?.trim().toLowerCase();
const CONFIRMED_ENVIRONMENT = process.env.CONFIRM_DATABASE_SEED?.trim().toLowerCase();

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Configura la conexion antes de lanzar el bootstrap.");
  process.exit(1);
}

if (!["development", "preview", "production"].includes(DATABASE_ENVIRONMENT)) {
  console.error("DATABASE_ENVIRONMENT debe ser development, preview o production antes de sembrar la base.");
  process.exit(1);
}

if (APP_ENV && APP_ENV !== DATABASE_ENVIRONMENT) {
  console.error(`APP_ENV=${APP_ENV} no coincide con DATABASE_ENVIRONMENT=${DATABASE_ENVIRONMENT}.`);
  process.exit(1);
}

if (CONFIRMED_ENVIRONMENT !== DATABASE_ENVIRONMENT) {
  console.error(
    `Seed bloqueado. Define CONFIRM_DATABASE_SEED=${DATABASE_ENVIRONMENT} para confirmar explícitamente el destino.`
  );
  process.exit(1);
}

if (!existsSync(STATE_FILE)) {
  console.error(`No se encontro ${STATE_FILE}. Arranca la app una vez o revisa el estado local antes de sembrar la base.`);
  process.exit(1);
}

const prisma = new PrismaClient();

function parseDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

try {
  const raw = readFileSync(STATE_FILE, "utf8");
  const data = JSON.parse(raw);
  const users = Array.isArray(data.users) ? data.users : [];
  const movies = Array.isArray(data.movies) ? data.movies : [];
  const groupId = data.group?.id;
  const pendingMovieIds = Array.isArray(data.pendingMovieIds) ? data.pendingMovieIds : [];
  const watchEntries = Array.isArray(data.watchEntries) ? data.watchEntries : [];
  const ratings = Array.isArray(data.ratings) ? data.ratings : [];
  const weeklyBatches = Array.isArray(data.weeklyBatches) ? data.weeklyBatches : [];

  await prisma.appSnapshot.upsert({
    where: {
      id: SNAPSHOT_ID
    },
    create: {
      id: SNAPSHOT_ID,
      data
    },
    update: {
      data
    }
  });

  if (users.length > 0) {
    await prisma.$transaction(
      users.map((user) =>
        prisma.userRecord.upsert({
          where: { id: user.id },
          create: {
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email,
            avatarSeed: user.avatarSeed ?? null,
            avatarUrl: user.avatarUrl ?? null,
            passwordHash: user.passwordHash,
            isAdmin: Boolean(user.isAdmin)
          },
          update: {
            name: user.name,
            username: user.username,
            email: user.email,
            avatarSeed: user.avatarSeed ?? null,
            avatarUrl: user.avatarUrl ?? null,
            passwordHash: user.passwordHash,
            isAdmin: Boolean(user.isAdmin)
          }
        })
      )
    );
  }

  if (movies.length > 0) {
    await prisma.$transaction(
      movies.map((movie) =>
        prisma.movieRecord.upsert({
          where: { id: movie.id },
          create: {
            id: movie.id,
            slug: movie.slug,
            data: movie
          },
          update: {
            slug: movie.slug,
            data: movie
          }
        })
      )
    );
  }

  if (groupId) {
    const existingBatchIds = (
      await prisma.weeklyBatchRecord.findMany({
        where: { groupId },
        select: { id: true }
      })
    ).map((batch) => batch.id);

    await prisma.$transaction([
      prisma.pendingMovie.deleteMany({ where: { groupId } }),
      prisma.watchEntryRecord.deleteMany({ where: { groupId } }),
      ...(existingBatchIds.length > 0
        ? [prisma.weeklyBatchItemRecord.deleteMany({ where: { batchId: { in: existingBatchIds } } })]
        : []),
      prisma.weeklyBatchRecord.deleteMany({ where: { groupId } }),
      ...(pendingMovieIds.length > 0
        ? [
            prisma.pendingMovie.createMany({
              data: pendingMovieIds.map((movieId, index) => ({
                groupId,
                movieId,
                addedAt: new Date(Date.now() - index * 1000)
              })),
              skipDuplicates: true
            })
          ]
        : []),
      ...(watchEntries.length > 0
        ? [
            prisma.watchEntryRecord.createMany({
              data: watchEntries.map((entry, index) => ({
                id: entry.id,
                movieId: entry.movieId,
                groupId: entry.groupId,
                watchedOn: parseDate(entry.watchedOn),
                selectedForWeek: entry.selectedForWeek ?? null,
                createdAt: parseDate(entry.watchedOn) ?? new Date(Date.now() - index * 1000)
              })),
              skipDuplicates: true
            })
          ]
        : []),
      ...(weeklyBatches.length > 0
        ? [
            prisma.weeklyBatchRecord.createMany({
              data: weeklyBatches.map((batch) => ({
                id: batch.id,
                groupId: batch.groupId,
                weekOf: new Date(batch.weekOf),
                createdAt: new Date(batch.createdAt),
                selectedMovieId: batch.selectedMovieId ?? null
              })),
              skipDuplicates: true
            }),
            prisma.weeklyBatchItemRecord.createMany({
              data: weeklyBatches.flatMap((batch) =>
                batch.items.map((item, index) => ({
                  id: item.id,
                  batchId: batch.id,
                  movieId: item.movieId,
                  position: index,
                  score: item.score,
                  summary: item.summary,
                  reasons: item.reasons ?? [],
                  metrics: item.metrics ?? []
                }))
              ),
              skipDuplicates: true
            })
          ]
        : [])
    ]);
  }

  await prisma.$transaction([
    prisma.ratingRecord.deleteMany(),
    ...(ratings.length > 0
      ? [
          prisma.ratingRecord.createMany({
            data: ratings.map((rating, index) => ({
              id: rating.id,
              movieId: rating.movieId,
              userId: rating.userId,
              score: rating.score,
              comment: rating.comment ?? null,
              watchedOn: parseDate(rating.watchedOn),
              createdAt: parseDate(rating.watchedOn) ?? new Date(Date.now() - index * 1000)
            })),
            skipDuplicates: true
          })
        ]
      : [])
  ]);

  console.log(`Snapshot "${SNAPSHOT_ID}" y tablas normalizadas cargadas correctamente en la base de datos.`);
} catch (error) {
  console.error("No se pudo cargar el estado en la base de datos.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
