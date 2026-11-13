import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

describe("GET /api/order-board", () => {
  it("pages the cards past PostgREST's 1000-row cap and keeps them in position order", () => {
    const start = server.indexOf('app.get("/api/order-board"');
    const route = server.slice(start, server.indexOf("\n});", start));
    expect(route).toContain('fetchReportPages(\n      () => supabase.from("order_board_cards").select(BOARD_CARD_FIELDS).eq("org_id", orgId)');
    expect(route).toContain(".sort((a, b) => (a.position ?? 0) - (b.position ?? 0)");
  });
});
