import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { database, foreignOrg, handlers, orgId, uuid } from "./campaignHandlerHarness";

const PRODUCT = uuid(20);
const VARIANT = uuid(21);
const FOREIGN_PRODUCT = uuid(30);

function fixture() {
  const db = database({
    products: [
      { id: PRODUCT, org_id: orgId, slug: "mango-leather-pickle", image_url: "old.jpg", weight_kg: 0.5, stock_quantity: 9 },
      { id: FOREIGN_PRODUCT, org_id: foreignOrg, slug: "not-ours", image_url: "x.jpg", weight_kg: 1, stock_quantity: 1 },
    ],
    product_variants: [{ id: VARIANT, product_id: PRODUCT, org_id: orgId, attributes: { size: "500g" }, weight_kg: 0.5, stock_quantity: 4 }],
    product_images: [{ id: uuid(22), product_id: PRODUCT, org_id: orgId, image_url: "primary.jpg", is_primary: true, sort_order: 0 }],
  });
  // Cloudflare is not configured here, so the purge only clears local caches.
  const harness = handlers(db, { CLOUDFLARE_ZONE_ID: "", CLOUDFLARE_API_TOKEN: "", PUBLIC_DOMAIN: "" });
  harness.load([
    "enrichOrderItems", "orderItemVariantCache", "orderItemProductCache", "cachedOrderItemRows",
    "loadOrderItemVariants", "loadOrderItemProducts", "variantDisplay", "readableVariantName", "purgeProductCache",
  ]);
  const fn = harness.context as unknown as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>[]>>;
  const reads = () => db.calls.filter((call) => call.method === "select").map((call) => call.table);
  return { db, fn, reads };
}

const items = [
  { id: uuid(1), order_id: uuid(2), product_id: PRODUCT, variant_id: VARIANT, quantity: 2 },
  { id: uuid(3), order_id: uuid(4), product_id: FOREIGN_PRODUCT, variant_id: null, quantity: 1 },
];

describe("orders list catalog cache", () => {
  it("reuses catalog details between polls of the orders list", async () => {
    const { db, fn, reads } = fixture();
    const first = await fn.enrichOrderItems(db, orgId, items, { cached: true });
    const second = await fn.enrichOrderItems(db, orgId, items, { cached: true });

    expect(reads()).toEqual(["product_variants", "products", "product_images"]);
    expect(second).toEqual(first);
    expect(first[0]).toMatchObject({ product_slug: "mango-leather-pickle", image_url: "primary.jpg", weight_kg: 0.5, available_stock: 6 });
    // Another workspace's product never leaks in.
    expect(first[1]).toMatchObject({ product_slug: null, image_url: null });
  });

  it("reads live again after a product save purges caches", async () => {
    const { db, fn, reads } = fixture();
    await fn.enrichOrderItems(db, orgId, items, { cached: true });
    db.tables.product_images[0].image_url = "new.jpg";
    await fn.purgeProductCache(orgId, { id: PRODUCT, slug: "mango-leather-pickle" });

    const after = await fn.enrichOrderItems(db, orgId, items, { cached: true });
    expect(after[0].image_url).toBe("new.jpg");
    expect(reads()).toHaveLength(6);
  });

  it("keeps the order editor live", async () => {
    const { db, fn, reads } = fixture();
    await fn.enrichOrderItems(db, orgId, items);
    await fn.enrichOrderItems(db, orgId, items);
    expect(reads()).toHaveLength(6);
  });

  it("is used only by the polled orders list", () => {
    const source = readFileSync("server/index.js", "utf8");
    const cachedCalls = source.match(/enrichOrderItems\([^)]*\{ cached: true \}\)/g) || [];
    expect(cachedCalls).toEqual(["enrichOrderItems(supabase, orgId, itemRows, { cached: true })"]);
  });
});
