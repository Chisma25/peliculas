import type { Prisma, PrismaClient } from "@prisma/client";
export function withCoordinatedWrite<T>(prisma: PrismaClient, action: (client: Prisma.TransactionClient) => Promise<T>): Promise<T>;
export function withConsistentRead<T>(prisma: PrismaClient, action: (client: Prisma.TransactionClient) => Promise<T>): Promise<T>;
