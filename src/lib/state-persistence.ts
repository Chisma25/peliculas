import type { Prisma } from "@prisma/client";
import type { AppState } from "@/lib/types";

export type DatabaseWriteOperation = {
  run: (client: Prisma.TransactionClient) => Promise<unknown>;
};
export type PersistMutation = (state: AppState, operations: DatabaseWriteOperation[]) => Promise<void>;
export type StateMutationRunner = <T>(action: (state: AppState, persist: PersistMutation) => Promise<T>) => Promise<T>;

type CommitStateChangeInput = {
  usesDatabase: boolean;
  canWriteDatabase: boolean;
  flushDeferredWrites: () => Promise<boolean>;
  runDatabaseTransaction: () => Promise<void>;
  writeLocalState: () => void | Promise<void>;
  publishCommittedState: () => void;
};

export class StatePersistenceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatePersistenceUnavailableError";
  }
}

export async function commitStateChangeAtomically(input: CommitStateChangeInput) {
  if (input.usesDatabase) {
    if (!input.canWriteDatabase) {
      throw new StatePersistenceUnavailableError("Database writes are temporarily unavailable.");
    }

    const deferredWritesFlushed = await input.flushDeferredWrites();
    if (!deferredWritesFlushed) {
      throw new StatePersistenceUnavailableError("Deferred database writes could not be flushed.");
    }

    await input.runDatabaseTransaction();
  } else {
    await input.writeLocalState();
  }

  input.publishCommittedState();
}
