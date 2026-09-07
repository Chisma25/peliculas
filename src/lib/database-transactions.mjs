// Shared by the application and Node maintenance scripts. The lock is scoped
// to the database because normalized tables are shared by every snapshot.
export function withCoordinatedWrite(prisma, action) {
  return prisma.$transaction(async client => {
    await client.$executeRaw`SELECT pg_advisory_xact_lock(1128877637, 1)`;
    return action(client);
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
}

// MVCC keeps every table at the same committed snapshot without taking the
// application write lock. Enforce read-only at the database, not by convention.
export function withConsistentRead(prisma, action) {
  return prisma.$transaction(async client => {
    await client.$executeRaw`SET TRANSACTION READ ONLY`;
    return action(client);
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 });
}
