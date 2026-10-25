/**
 * Per-warm-instance cache of rows looked up by id. `getMany(ids, fetchMissing)`
 * returns a Map of every requested id; only the ids not cached are passed to
 * `fetchMissing`, which resolves to a Map of the rows it found. Ids it did not
 * find are remembered as null. A `delete()`/`clear()` while a fetch is in
 * flight stops that fetch's result from being stored, so a write never leaves
 * an older row behind. Memory only: invalidation is local to this instance.
 */
export function createIdCache({ ttlMs, now = Date.now, maxEntries = 1000 } = {}) {
  const memory = new Map(); // id -> { value, expiresAt }
  let generation = 0;

  async function getMany(ids, fetchMissing) {
    const current = now();
    const found = new Map();
    const missing = [];
    for (const id of new Set(ids)) {
      const entry = memory.get(id);
      if (entry && entry.expiresAt > current) found.set(id, entry.value);
      else missing.push(id);
    }
    if (!missing.length) return found;

    const startedAt = generation;
    const fetched = await fetchMissing(missing);
    const store = startedAt === generation;
    if (store) {
      for (const [cachedId, entry] of memory) {
        if (entry.expiresAt <= current) memory.delete(cachedId);
      }
    }
    for (const id of missing) {
      const value = fetched.has(id) ? fetched.get(id) : null;
      found.set(id, value);
      if (!store) continue;
      memory.delete(id);
      while (memory.size >= maxEntries) memory.delete(memory.keys().next().value);
      memory.set(id, { value, expiresAt: current + ttlMs });
    }
    return found;
  }

  function remove(ids) {
    generation += 1;
    for (const id of ids) memory.delete(id);
  }

  function clear() {
    generation += 1;
    memory.clear();
  }

  return { getMany, delete: remove, clear, size: () => memory.size };
}
