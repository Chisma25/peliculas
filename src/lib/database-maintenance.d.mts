import type { MovieRecord, Prisma, PrismaClient } from "@prisma/client";
export function applyMovieMetadataChanges(prisma: PrismaClient, changes: Array<{ record: MovieRecord; nextData: Prisma.InputJsonObject }>): Promise<{ updated: number; skipped: string[] }>;
export function cleanTechnicalMovies(prisma: PrismaClient, options?: { apply?: boolean }): Promise<MovieRecord[]>;
