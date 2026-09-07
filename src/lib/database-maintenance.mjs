import { isDeepStrictEqual } from "node:util";
import { withConsistentRead, withCoordinatedWrite } from "./database-transactions.mjs";

const TECHNICAL_TITLES = new Set(["F1 Review 1987", "F1 Review 2006"]);

async function updateSnapshots(database, rewrite) {
  for (const snapshot of await database.appSnapshot.findMany()) {
    const data = snapshot.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) continue;
    const next = rewrite(data);
    if (!isDeepStrictEqual(data, next)) {
      await database.appSnapshot.update({ where: { id: snapshot.id }, data: { data: next } });
    }
  }
}

export async function applyMovieMetadataChanges(prisma, changes) {
  return withCoordinatedWrite(prisma, async database => {
    const updated = new Map();
    const skipped = [];
    for (const { record, nextData } of changes) {
      const current = await database.movieRecord.findUnique({ where: { id: record.id } });
      // Preparation may involve slow network work. Recheck only after locking,
      // and never recreate deleted records or overwrite a newer revision.
      if (!current || current.slug !== record.slug ||
          !isDeepStrictEqual(current.data, record.data) ||
          current.updatedAt.getTime() !== record.updatedAt.getTime()) {
        skipped.push(record.id);
        continue;
      }
      const data = { ...nextData, id: current.id, slug: current.slug };
      await database.movieRecord.update({ where: { id: current.id }, data: { data } });
      updated.set(current.id, data);
    }
    if (updated.size > 0) {
      await updateSnapshots(database, data => ({ ...data,
        ...(Array.isArray(data.movies) ? { movies: data.movies.map(movie => updated.get(movie.id) ?? movie) } : {})
      }));
    }
    return { updated: updated.size, skipped };
  });
}

export function cleanTechnicalMovies(prisma, { apply = false } = {}) {
  const execute = async database => {
    // Select again under the lock; a title can change after a dry run.
    const targets = (await database.movieRecord.findMany()).filter(record => TECHNICAL_TITLES.has(record.data?.title));
    if (!apply || targets.length === 0) return targets;
    const movieIds = targets.map(record => record.id);
    const ids = new Set(movieIds);
    const withoutMovies = entries => entries.filter(entry => !ids.has(entry.movieId));
    await updateSnapshots(database, data => ({ ...data,
      ...(Array.isArray(data.movies) ? { movies: data.movies.filter(movie => !ids.has(movie.id)) } : {}),
      ...(Array.isArray(data.pendingMovieIds) ? { pendingMovieIds: data.pendingMovieIds.filter(id => !ids.has(id)) } : {}),
      ...Object.fromEntries(["ratings", "watchEntries", "activity"].filter(key => Array.isArray(data[key]))
        .map(key => [key, withoutMovies(data[key])])),
      ...(Array.isArray(data.weeklyBatches) ? { weeklyBatches: data.weeklyBatches.map(batch => ({ ...batch,
        selectedMovieId: ids.has(batch.selectedMovieId) ? null : batch.selectedMovieId,
        ...(Array.isArray(batch.items) ? { items: withoutMovies(batch.items) } : {})
      })) } : {})
    }));
    await database.weeklyBatchRecord.updateMany({ where: { selectedMovieId: { in: movieIds } }, data: { selectedMovieId: null } });
    await database.weeklyBatchItemRecord.deleteMany({ where: { movieId: { in: movieIds } } });
    await database.ratingRecord.deleteMany({ where: { movieId: { in: movieIds } } });
    await database.watchEntryRecord.deleteMany({ where: { movieId: { in: movieIds } } });
    await database.pendingMovie.deleteMany({ where: { movieId: { in: movieIds } } });
    await database.movieRecord.deleteMany({ where: { id: { in: movieIds } } });
    return targets;
  };
  return apply ? withCoordinatedWrite(prisma, execute) : withConsistentRead(prisma, execute);
}
