import type { Prisma } from "@prisma/client";
import type { Movie, WatchEntry } from "@/lib/types";
import { parseWatchDate } from "@/lib/record-dates";

// Normal mutations use the transaction client supplied by the shared coordinator.
// Bulk sync functions are retained for replaying legacy deferred writes.

export function mapWatchRecordsToStateEntries(records: Array<{
  id: string;
  movieId: string;
  groupId: string;
  watchedOn: Date | null;
  selectedForWeek: string | null;
}>): WatchEntry[] {
  return records.map((entry) => ({
    id: entry.id,
    movieId: entry.movieId,
    groupId: entry.groupId,
    watchedOn: entry.watchedOn?.toISOString(),
    selectedForWeek: entry.selectedForWeek ?? undefined
  }));
}

export function isMovie(value: unknown): value is Movie {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Movie>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.slug === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.year === "number" &&
    Array.isArray(candidate.genres) &&
    Array.isArray(candidate.cast) &&
    typeof candidate.externalRating === "object"
  );
}

export function mapMovieRecordsToStateMovies(records: Array<{ data: unknown }>): Movie[] {
  return records.map((entry) => entry.data).filter(isMovie);
}

export async function syncMoviesToDatabase(movies: Movie[]) {
  const { prisma } = await import("@/lib/prisma");

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

export async function upsertMovieToDatabase(movie: Movie, client?: Prisma.TransactionClient) {
  const database = client ?? (await import("@/lib/prisma")).prisma;
  await database.movieRecord.upsert({
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
  });
}

export async function syncPendingMoviesToDatabase(groupId: string, pendingMovieIds: string[]) {
  const { prisma } = await import("@/lib/prisma");

  await prisma.$transaction([
    prisma.pendingMovie.deleteMany({ where: { groupId } }),
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
      : [])
  ]);
}

export async function syncWatchEntriesToDatabase(groupId: string, watchEntries: WatchEntry[]) {
  const { prisma } = await import("@/lib/prisma");

  await prisma.$transaction([
    prisma.watchEntryRecord.deleteMany({ where: { groupId } }),
    ...(watchEntries.length > 0
      ? [
          prisma.watchEntryRecord.createMany({
            data: watchEntries.map((entry, index) => ({
              id: entry.id,
              movieId: entry.movieId,
              groupId: entry.groupId,
              watchedOn: parseWatchDate(entry.watchedOn),
              selectedForWeek: entry.selectedForWeek,
              createdAt: parseWatchDate(entry.watchedOn) ?? new Date(Date.now() - index * 1000)
            })),
            skipDuplicates: true
          })
        ]
      : [])
  ]);
}

export async function upsertPendingMovieToDatabase(
  groupId: string,
  movieId: string,
  addedAt = new Date(),
  client?: Prisma.TransactionClient
) {
  const database = client ?? (await import("@/lib/prisma")).prisma;
  await database.pendingMovie.upsert({
    where: {
      groupId_movieId: {
        groupId,
        movieId
      }
    },
    create: {
      groupId,
      movieId,
      addedAt
    },
    update: {
      addedAt
    }
  });
}

export async function removePendingMovieFromDatabase(groupId: string, movieId: string, client?: Prisma.TransactionClient) {
  const database = client ?? (await import("@/lib/prisma")).prisma;
  await database.pendingMovie.deleteMany({
    where: {
      groupId,
      movieId
    }
  });
}

export async function upsertWatchEntryToDatabase(entry: WatchEntry, client?: Prisma.TransactionClient) {
  const database = client ?? (await import("@/lib/prisma")).prisma;
  await database.watchEntryRecord.upsert({
    where: {
      id: entry.id
    },
    create: {
      id: entry.id,
      movieId: entry.movieId,
      groupId: entry.groupId,
      watchedOn: parseWatchDate(entry.watchedOn),
      selectedForWeek: entry.selectedForWeek ?? null,
      createdAt: parseWatchDate(entry.watchedOn) ?? new Date()
    },
    update: {
      movieId: entry.movieId,
      groupId: entry.groupId,
      watchedOn: parseWatchDate(entry.watchedOn),
      selectedForWeek: entry.selectedForWeek ?? null
    }
  });
}
