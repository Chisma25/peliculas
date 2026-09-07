import type { Prisma, PrismaClient } from "@prisma/client";
import { StatePersistenceUnavailableError } from "@/lib/state-persistence";
import { withCoordinatedWrite } from "@/lib/database-transactions.mjs";

// The normalized tables are shared by every snapshot in this database, so the
// lock must be database-wide, not keyed by a process or APP_SNAPSHOT_ID.
export async function withDatabaseMutation<T>(
  prisma: PrismaClient,
  action: (client: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  try {
    return await withCoordinatedWrite(prisma, action);
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
