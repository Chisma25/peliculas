import { withCoordinatedWrite } from "../../src/lib/database-transactions.mjs";
import { analyzeDatabaseIntegrity } from "./database-integrity.mjs";

function parseDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function executeInOrder(operations) {
  for (const operation of operations) await operation;
}

export async function seedDatabase(prisma, data, snapshotId = "main") {
  if (!data || typeof data !== "object" || !data.group?.id ||
      !["users", "movies", "pendingMovieIds", "watchEntries", "ratings", "weeklyBatches"].every(key => Array.isArray(data[key]))) {
    throw new Error("El estado de importación debe incluir el grupo y todas las colecciones.");
  }
  if ([...data.watchEntries, ...data.weeklyBatches].some(entry => entry.groupId !== data.group.id)) {
    throw new Error("El estado de importación contiene registros de otro grupo.");
  }
  const report = analyzeDatabaseIntegrity({
    users: data.users, movies: data.movies.map(movie => ({ id: movie.id, slug: movie.slug, data: movie })),
    pendingMovies: data.pendingMovieIds.map(movieId => ({ movieId, groupId: data.group.id })),
    watchEntries: data.watchEntries, ratings: data.ratings, weeklyBatches: data.weeklyBatches,
    weeklyBatchItems: data.weeklyBatches.flatMap(batch => batch.items.map(item => ({ ...item, batchId: batch.id })))
  });
  if (!report.healthy) throw new Error("El estado de importación tiene errores de integridad.");

  return withCoordinatedWrite(prisma, async database => {
    const users = Array.isArray(data.users) ? data.users : [];
    const movies = Array.isArray(data.movies) ? data.movies : [];
    const groupId = data.group?.id;
    const pendingMovieIds = Array.isArray(data.pendingMovieIds) ? data.pendingMovieIds : [];
    const watchEntries = Array.isArray(data.watchEntries) ? data.watchEntries : [];
    const ratings = Array.isArray(data.ratings) ? data.ratings : [];
    const weeklyBatches = Array.isArray(data.weeklyBatches) ? data.weeklyBatches : [];

    await database.appSnapshot.upsert({
      where: {
        id: snapshotId
      },
      create: {
        id: snapshotId,
        data
      },
      update: {
        data
      }
    });

    if (users.length > 0) {
      await executeInOrder(
        users.map((user) =>
          database.userRecord.upsert({
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
      await executeInOrder(
        movies.map((movie) =>
          database.movieRecord.upsert({
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
        await database.weeklyBatchRecord.findMany({
          where: { groupId },
          select: { id: true }
        })
      ).map((batch) => batch.id);

      await executeInOrder([
        database.pendingMovie.deleteMany({ where: { groupId } }),
        database.watchEntryRecord.deleteMany({ where: { groupId } }),
        ...(existingBatchIds.length > 0
          ? [database.weeklyBatchItemRecord.deleteMany({ where: { batchId: { in: existingBatchIds } } })]
          : []),
        database.weeklyBatchRecord.deleteMany({ where: { groupId } }),
        ...(pendingMovieIds.length > 0
          ? [
              database.pendingMovie.createMany({
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
              database.watchEntryRecord.createMany({
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
              database.weeklyBatchRecord.createMany({
                data: weeklyBatches.map((batch) => ({
                  id: batch.id,
                  groupId: batch.groupId,
                  weekOf: new Date(batch.weekOf),
                  createdAt: new Date(batch.createdAt),
                  selectedMovieId: batch.selectedMovieId ?? null
                })),
                skipDuplicates: true
              }),
              database.weeklyBatchItemRecord.createMany({
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

    await executeInOrder([
      database.ratingRecord.deleteMany(),
      ...(ratings.length > 0
        ? [
            database.ratingRecord.createMany({
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


  });
}
