import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20261022080131_order_calls.sql");

describe("order_calls schema", () => {
  it("creates a workspace-scoped call log tied to orders", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/create table if not exists public\.order_calls/i);
    expect(sql).toMatch(/org_id uuid not null/i);
    expect(sql).toMatch(/order_id uuid references public\.orders\(id\) on delete cascade/i);
    expect(sql).toMatch(/direction text not null check \(direction in \('outgoing', 'incoming'\)\)/i);
    expect(sql).toMatch(/phone text not null check \(phone ~ '\^01\[0-9\]\{9\}\$'\)/i);
    expect(sql).toMatch(/outcome text not null default 'ringing' check \(outcome in \('ringing', 'answered', 'no_answer'\)\)/i);
    expect(sql).toMatch(/note text check \(note is null or char_length\(note\) <= 300\)/i);
    expect(sql).toMatch(/create index if not exists order_calls_org_order_started_idx/i);
  });

  it("stores only one active hashed MicroSIP key per staff member", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/create table if not exists public\.call_helper_keys/i);
    expect(sql).toMatch(/key_hash text not null unique check \(key_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/i);
    expect(sql).toMatch(/create unique index if not exists call_helper_keys_one_active_per_user[\s\S]*where revoked_at is null/i);
  });

  it("never exposes either table to browser roles", async () => {
    const sql = await readFile(migrationPath, "utf8");

    for (const table of ["order_calls", "call_helper_keys"]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, "i"));
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${table} from anon, authenticated`, "i"));
      expect(sql).toMatch(new RegExp(`grant all on public\\.${table} to service_role`, "i"));
    }
    expect(sql.includes("\nbegin;")).toBe(true);
    expect(sql).toMatch(/commit;/i);
  });
});
