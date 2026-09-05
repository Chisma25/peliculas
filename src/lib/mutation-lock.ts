import type { Prisma, PrismaClient } from "@prisma/client";
import { StatePersistenceUnavailableError } from "@/lib/state-persistence";

// The normalized tables are shared by every snapshot in this database, so the
// lock must be database-wide, not keyed by a process or APP_SNAPSHOT_ID.
export async function withDatabaseMutation<T>(
  prisma: PrismaClient,
  action: (client: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  try {
    return await prisma.$transaction(async (client) => {
      // Transaction-scoped locks also work with Neon's pooled connections and
      // are released automatically on both commit and rollback.
      await client.$executeRaw`SELECT pg_advisory_xact_lock(1128877637, 1)`;
      return action(client);
    }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    // Validation errors keep their actionable messages; database/lock failures
    // become a retryable 503 without exposing database details to the browser.
    if (error instanceof Error && error.name.startsWith("Prisma")) {
      throw new StatePersistenceUnavailableError("No se pudo completar la transacción. Vuelve a intentarlo.");
    }
    throw error;
  }
}

// Local file persistence is supported by one application process. Queue the
// complete read/modify/write cycle, and do not let a rejection poison the queue.
export function createLocalMutationQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(action: () => Promise<T>): Promise<T> {
    const result = tail.then(action);
    tail = result.catch(() => undefined);
    return result;
  };
}
