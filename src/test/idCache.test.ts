import { describe, expect, it, vi } from "vitest";
import { createIdCache } from "../../server/idCache.js";

function rows(ids: string[]) {
  return new Map(ids.map((id) => [id, { id, name: `row ${id}` }]));
}

describe("createIdCache", () => {
  it("fetches only the ids it has not seen within the TTL", async () => {
    let now = 1_000_000;
    const cache = createIdCache({ ttlMs: 60_000, now: () => now });
    const fetchMissing = vi.fn(async (ids: string[]) => rows(ids));

    await cache.getMany(["a", "b"], fetchMissing);
    now += 59_999;
    const result = await cache.getMany(["a", "b", "c"], fetchMissing);

    expect(fetchMissing).toHaveBeenCalledTimes(2);
    expect(fetchMissing.mock.calls[1][0]).toEqual(["c"]);
    expect(result.get("a")).toEqual({ id: "a", name: "row a" });
    expect(result.get("c")).toEqual({ id: "c", name: "row c" });
  });

  it("does not call fetchMissing when everything is cached", async () => {
    const cache = createIdCache({ ttlMs: 60_000 });
    const fetchMissing = vi.fn(async (ids: string[]) => rows(ids));
    await cache.getMany(["a"], fetchMissing);
    await cache.getMany(["a", "a"], fetchMissing);
    expect(fetchMissing).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after the TTL expires", async () => {
    let now = 1_000_000;
    const cache = createIdCache({ ttlMs: 60_000, now: () => now });
    const fetchMissing = vi.fn(async (ids: string[]) => rows(ids));
    await cache.getMany(["a"], fetchMissing);
    now += 60_000;
    await cache.getMany(["a"], fetchMissing);
    expect(fetchMissing).toHaveBeenCalledTimes(2);
  });

  it("remembers ids that were not found as null", async () => {
    const cache = createIdCache({ ttlMs: 60_000 });
    const fetchMissing = vi.fn(async () => new Map());
    expect((await cache.getMany(["gone"], fetchMissing)).get("gone")).toBeNull();
    expect((await cache.getMany(["gone"], fetchMissing)).get("gone")).toBeNull();
    expect(fetchMissing).toHaveBeenCalledTimes(1);
  });

  it("re-fetches deleted ids and everything after clear()", async () => {
    const cache = createIdCache({ ttlMs: 60_000 });
    const fetchMissing = vi.fn(async (ids: string[]) => rows(ids));
    await cache.getMany(["a", "b"], fetchMissing);

    cache.delete(["a"]);
    await cache.getMany(["a", "b"], fetchMissing);
    expect(fetchMissing.mock.calls[1][0]).toEqual(["a"]);

    cache.clear();
    await cache.getMany(["a", "b"], fetchMissing);
    expect(fetchMissing.mock.calls[2][0]).toEqual(["a", "b"]);
  });

  it("does not store a fetch that was in flight when the cache was cleared", async () => {
    const cache = createIdCache({ ttlMs: 60_000 });
    let release: () => void = () => {};
    const slow = vi.fn(() => new Promise<Map<string, unknown>>((resolve) => {
      release = () => resolve(rows(["a"]));
    }));
    const pending = cache.getMany(["a"], slow);
    cache.clear();
    release();
    await pending;

    const fetchMissing = vi.fn(async (ids: string[]) => rows(ids));
    await cache.getMany(["a"], fetchMissing);
    expect(fetchMissing).toHaveBeenCalledTimes(1);
  });

  it("stores nothing when fetchMissing throws", async () => {
    const cache = createIdCache({ ttlMs: 60_000 });
    await expect(cache.getMany(["a"], async () => { throw new Error("db down"); })).rejects.toThrow("db down");
    const fetchMissing = vi.fn(async (ids: string[]) => rows(ids));
    await cache.getMany(["a"], fetchMissing);
    expect(fetchMissing).toHaveBeenCalledTimes(1);
  });

  it("keeps at most maxEntries ids", async () => {
    const cache = createIdCache({ ttlMs: 60_000, maxEntries: 2 });
    const fetchMissing = vi.fn(async (ids: string[]) => rows(ids));
    await cache.getMany(["a", "b", "c"], fetchMissing);
    expect(cache.size()).toBe(2);
  });
});
