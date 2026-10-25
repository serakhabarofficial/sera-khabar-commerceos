import { describe, expect, it } from "vitest";
import { createAuthCache } from "../../server/authCache.js";
import { database, handlers, orgId, uuid } from "./campaignHandlerHarness";

type Row = Record<string, unknown>;

// Just enough of supabase-js for app_settings and user_roles reads/writes,
// counting every round-trip.
function fakeSupabase(tables: Record<string, Row[]>) {
  const reads: string[] = [];
  function from(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let upsertRows: Row[] | null = null;
    const q = {
      select() { return q; },
      eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return q; },
      in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return q; },
      like(key: string, pattern: string) {
        const suffix = pattern.replace(/^%/, "");
        filters.push((row) => String(row[key]).endsWith(suffix));
        return q;
      },
      order() { return q; },
      upsert(rows: Row[]) { upsertRows = rows; return q; },
      then(resolve: (value: unknown) => unknown) {
        if (upsertRows) {
          for (const row of upsertRows) {
            tables[table] = [...(tables[table] || []).filter((existing) => existing.key !== row.key), row];
          }
          return resolve({ data: upsertRows, error: null });
        }
        reads.push(table);
        return resolve({ data: (tables[table] || []).filter((row) => filters.every((filter) => filter(row))), error: null });
      },
    };
    return q;
  }
  return { from, reads, tables };
}

function load(tables: Record<string, Row[]>) {
  const supabase = fakeSupabase(tables);
  const harness = handlers(database(), { getServiceSupabase: () => supabase, createAuthCache });
  harness.load([
    "customStoreOrgCache", "resolveCustomStoreOrgId", "isValidOrgId",
    "settingsCache", "getSettingsCached", "getSettings", "saveSettings", "orgSettingKey", "getOrgSettings",
    "staffCache", "getOrgStaff", "getActiveOrgStaff", "getStaffNameMap", "authCache", "invalidateAuthCacheForUser",
  ]);
  return { supabase, fn: harness.context as unknown as Record<string, (...args: unknown[]) => Promise<unknown>> };
}

describe("storefront API key lookup cache", () => {
  it("reads app_settings once for repeated storefront calls with the same key", async () => {
    const { supabase, fn } = load({ app_settings: [{ key: `${orgId}:custom_store_api_key`, value: "sk_live" }] });
    expect(await fn.resolveCustomStoreOrgId(supabase, "sk_live")).toBe(orgId);
    expect(await fn.resolveCustomStoreOrgId(supabase, "sk_live")).toBe(orgId);
    expect(supabase.reads).toEqual(["app_settings"]);
  });

  it("forgets keys when a custom_store_api_key is saved", async () => {
    const { supabase, fn } = load({ app_settings: [{ key: `${orgId}:custom_store_api_key`, value: "sk_old" }] });
    expect(await fn.resolveCustomStoreOrgId(supabase, "sk_old")).toBe(orgId);
    await fn.saveSettings({ [`${orgId}:custom_store_api_key`]: "sk_new" });
    expect(await fn.resolveCustomStoreOrgId(supabase, "sk_old")).toBeNull();
    expect(await fn.resolveCustomStoreOrgId(supabase, "sk_new")).toBe(orgId);
  });
});

describe("read-mostly settings cache", () => {
  it("serves cached org settings and clears the keys saveSettings writes", async () => {
    const { supabase, fn } = load({ app_settings: [{ key: `${orgId}:org_name`, value: "Sera Khabar" }] });
    expect(await fn.getOrgSettings(orgId, ["org_name"], { cached: true })).toEqual({ org_name: "Sera Khabar" });
    expect(await fn.getOrgSettings(orgId, ["org_name"], { cached: true })).toEqual({ org_name: "Sera Khabar" });
    expect(supabase.reads).toHaveLength(1);

    await fn.saveSettings({ [`${orgId}:org_name`]: "সেরা খাবার" });
    expect(await fn.getOrgSettings(orgId, ["org_name"], { cached: true })).toEqual({ org_name: "সেরা খাবার" });
    expect(supabase.reads).toHaveLength(2);
  });

  it("leaves uncached reads live", async () => {
    const { supabase, fn } = load({ app_settings: [{ key: `${orgId}:org_name`, value: "Sera Khabar" }] });
    await fn.getOrgSettings(orgId, ["org_name"]);
    await fn.getOrgSettings(orgId, ["org_name"]);
    expect(supabase.reads).toHaveLength(2);
  });
});

describe("staff name cache", () => {
  const staff = () => [
    { user_id: uuid(1), org_id: orgId, display_name: "Sadia", deleted_at: null, suspended_at: null, created_at: "2026-01-01" },
    { user_id: uuid(2), org_id: orgId, display_name: "Rakib", deleted_at: null, suspended_at: "2026-10-01", created_at: "2026-01-02" },
    { user_id: uuid(3), org_id: "other-org", display_name: "Elsewhere", deleted_at: null, suspended_at: null, created_at: "2026-01-03" },
  ];

  it("reads the workspace roster once and keeps other workspaces out", async () => {
    const { supabase, fn } = load({ user_roles: staff() });
    const names = await fn.getStaffNameMap(supabase, orgId) as Map<string, string>;
    await fn.getStaffNameMap(supabase, orgId);
    expect(supabase.reads).toEqual(["user_roles"]);
    expect([...names.values()]).toEqual(["Sadia", "Rakib"]);
    expect((await fn.getActiveOrgStaff(supabase, orgId) as Row[]).map((member) => member.display_name)).toEqual(["Sadia"]);
  });

  it("re-reads after any user_roles write invalidates auth", async () => {
    const { supabase, fn } = load({ user_roles: staff() });
    await fn.getStaffNameMap(supabase, orgId);
    supabase.tables.user_roles[0].display_name = "Sadia Islam";
    fn.invalidateAuthCacheForUser(uuid(1));
    expect((await fn.getStaffNameMap(supabase, orgId) as Map<string, string>).get(uuid(1))).toBe("Sadia Islam");
    expect(supabase.reads).toHaveLength(2);
  });
});
