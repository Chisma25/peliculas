import { describe, expect, it, vi } from "vitest";

import { commitStateChangeAtomically, StatePersistenceUnavailableError } from "@/lib/state-persistence";

function createDependencies() {
  return {
    flushDeferredWrites: vi.fn(async () => true),
    runDatabaseTransaction: vi.fn(async () => undefined),
    writeLocalState: vi.fn(),
    publishCommittedState: vi.fn()
  };
}

describe("commitStateChangeAtomically", () => {
  it("publishes database state only after the transaction commits", async () => {
    const dependencies = createDependencies();
    const order: string[] = [];
    dependencies.runDatabaseTransaction.mockImplementation(async () => {
      order.push("transaction");
    });
    dependencies.publishCommittedState.mockImplementation(() => {
      order.push("publish");
    });

    await commitStateChangeAtomically({
      usesDatabase: true,
      canWriteDatabase: true,
      ...dependencies
    });

    expect(order).toEqual(["transaction", "publish"]);
    expect(dependencies.writeLocalState).not.toHaveBeenCalled();
  });

  it("does not publish state when the database transaction fails", async () => {
    const dependencies = createDependencies();
    dependencies.runDatabaseTransaction.mockRejectedValue(new Error("database unavailable"));

    await expect(
      commitStateChangeAtomically({
        usesDatabase: true,
        canWriteDatabase: true,
        ...dependencies
      })
    ).rejects.toThrow("database unavailable");

    expect(dependencies.publishCommittedState).not.toHaveBeenCalled();
    expect(dependencies.writeLocalState).not.toHaveBeenCalled();
  });

  it("does not start or publish a mutation while database writes are in backoff", async () => {
    const dependencies = createDependencies();

    await expect(
      commitStateChangeAtomically({
        usesDatabase: true,
        canWriteDatabase: false,
        ...dependencies
      })
    ).rejects.toBeInstanceOf(StatePersistenceUnavailableError);

    expect(dependencies.flushDeferredWrites).not.toHaveBeenCalled();
    expect(dependencies.runDatabaseTransaction).not.toHaveBeenCalled();
    expect(dependencies.publishCommittedState).not.toHaveBeenCalled();
  });

  it("does not publish a mutation if legacy deferred writes cannot be flushed", async () => {
    const dependencies = createDependencies();
    dependencies.flushDeferredWrites.mockResolvedValue(false);

    await expect(
      commitStateChangeAtomically({
        usesDatabase: true,
        canWriteDatabase: true,
        ...dependencies
      })
    ).rejects.toBeInstanceOf(StatePersistenceUnavailableError);

    expect(dependencies.runDatabaseTransaction).not.toHaveBeenCalled();
    expect(dependencies.publishCommittedState).not.toHaveBeenCalled();
  });

  it("publishes local state only after its durable write succeeds", async () => {
    const dependencies = createDependencies();
    const order: string[] = [];
    dependencies.writeLocalState.mockImplementation(() => {
      order.push("write");
    });
    dependencies.publishCommittedState.mockImplementation(() => {
      order.push("publish");
    });

    await commitStateChangeAtomically({
      usesDatabase: false,
      canWriteDatabase: false,
      ...dependencies
    });

    expect(order).toEqual(["write", "publish"]);
    expect(dependencies.flushDeferredWrites).not.toHaveBeenCalled();
    expect(dependencies.runDatabaseTransaction).not.toHaveBeenCalled();
  });

  it("does not publish local state when its durable write fails", async () => {
    const dependencies = createDependencies();
    dependencies.writeLocalState.mockImplementation(() => {
      throw new Error("disk full");
    });

    await expect(
      commitStateChangeAtomically({
        usesDatabase: false,
        canWriteDatabase: false,
        ...dependencies
      })
    ).rejects.toThrow("disk full");

    expect(dependencies.publishCommittedState).not.toHaveBeenCalled();
  });
});
