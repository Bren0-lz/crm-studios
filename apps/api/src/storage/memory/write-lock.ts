import { AsyncLocalStorage } from "node:async_hooks";
export function createClinicWriteLock() {
  const pending = new Map<string, Promise<void>>();
  const owner = new AsyncLocalStorage<ReadonlySet<string>>();
  return async function write<T>(
    clinicId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    if (owner.getStore()?.has(clinicId)) return action();
    const previous = pending.get(clinicId);
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    pending.set(clinicId, current);
    await previous;
    try {
      return await owner.run(
        new Set([...(owner.getStore() ?? []), clinicId]),
        action,
      );
    } finally {
      release();
      if (pending.get(clinicId) === current) pending.delete(clinicId);
    }
  };
}
