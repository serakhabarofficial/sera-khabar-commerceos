import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAbandonedCheckoutCapture } from "../../server/abandonedCheckouts.js";
import { abandonedCheckoutSourceLabel } from "@/lib/abandonedCheckouts";

const capture = (source: string, sourcePath: string) => ({
  draftKey: "3f2b8c1e-5d4a-4b6f-9a2e-1c7d8e9f0a1b",
  source,
  sourcePath,
  phone: "01712345678",
  items: [{ productName: "খেজুরের গুড়", variantName: "১ কেজি", quantity: 1, unitPrice: 600 }],
  subtotal: 600,
  deliveryRate: 100,
  total: 700,
});

describe("landing page incomplete checkouts", () => {
  it("accepts any /step/<name> landing page without listing it first", () => {
    for (const path of ["/step/gur", "/step/katimon-mango", "/step/am-sotto-achar"]) {
      expect(parseAbandonedCheckoutCapture(capture("landing", path))).toMatchObject({ source: "landing", sourcePath: path });
    }
  });

  it("rejects landing captures whose address is not a landing page", () => {
    for (const path of ["/checkout", "/step/", "/step/gur/thank-you", "/step/Gur", "/products/gur", "/step/gur?x=1"]) {
      expect(() => parseAbandonedCheckoutCapture(capture("landing", path))).toThrow();
    }
  });

  it("keeps accepting the older fixed sources for pages still open in a browser", () => {
    expect(parseAbandonedCheckoutCapture(capture("am_sotto_achar", "/step/am-sotto-achar")).source).toBe("am_sotto_achar");
    expect(parseAbandonedCheckoutCapture(capture("storefront", "/checkout")).source).toBe("storefront");
    expect(() => parseAbandonedCheckoutCapture(capture("storefront", "/step/gur"))).toThrow();
  });

  it("names a landing page from its address", () => {
    expect(abandonedCheckoutSourceLabel("landing", "/step/gur")).toBe("Gur");
    expect(abandonedCheckoutSourceLabel("landing", "/step/katimon-mango")).toBe("Katimon Mango");
    expect(abandonedCheckoutSourceLabel("landing", "/step/am-sotto-achar")).toBe("Am Sotto Achar");
    expect(abandonedCheckoutSourceLabel("storefront", "/checkout")).toBe("Storefront checkout");
  });

  it("allows landing pages in the database and moves the existing landing captures", () => {
    const file = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) => name.endsWith("_abandoned_checkouts_landing_source.sql"));
    expect(file).toBeDefined();
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", file!), "utf8");
    expect(migration).toContain("source = 'landing' and source_path ~ '^/step/[a-z0-9]+(-[a-z0-9]+)*$'");
    expect(migration).toMatch(/update public\.abandoned_checkouts\s+set source = 'landing'/);
  });
});
