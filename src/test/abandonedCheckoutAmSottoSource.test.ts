import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ABANDONED_CHECKOUT_SOURCE_PATHS, parseAbandonedCheckoutCapture } from "../../server/abandonedCheckouts.js";
import { abandonedCheckoutSourceLabel } from "@/lib/abandonedCheckouts";

const capture = (source: string, sourcePath: string) => ({
  draftKey: "3f2b8c1e-5d4a-4b6f-9a2e-1c7d8e9f0a1b",
  source,
  sourcePath,
  phone: "01712345678",
  items: [{ productName: "আমসত্ত্ব আচার | Mango Leather Pickle", variantName: "৫০০ গ্রাম", quantity: 1, unitPrice: 350 }],
  subtotal: 350,
  deliveryRate: 100,
  total: 450,
});

describe("আমসত্ত্ব আচার incomplete checkouts", () => {
  it("accepts captures from /step/am-sotto-achar under their own source", () => {
    expect(ABANDONED_CHECKOUT_SOURCE_PATHS.am_sotto_achar).toBe("/step/am-sotto-achar");
    expect(parseAbandonedCheckoutCapture(capture("am_sotto_achar", "/step/am-sotto-achar"))).toMatchObject({
      source: "am_sotto_achar",
      sourcePath: "/step/am-sotto-achar",
    });
  });

  it("rejects the source with another page's path", () => {
    expect(() => parseAbandonedCheckoutCapture(capture("am_sotto_achar", "/step/kalojira-mixed"))).toThrow();
  });

  it("labels them আমসত্ত্ব আচার in the Incomplete orders tab", () => {
    expect(abandonedCheckoutSourceLabel("am_sotto_achar")).toBe("আমসত্ত্ব আচার");
    expect(abandonedCheckoutSourceLabel("kalojira_mixed")).toBe("Kalojira Mixed");
  });

  it("allows the source in the database and moves the mislabelled আমসত্ত্ব captures", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261021165128_abandoned_checkouts_am_sotto_source.sql"), "utf8");
    expect(migration).toContain("(source = 'am_sotto_achar' and source_path = '/step/am-sotto-achar')");
    expect(migration).toMatch(/update public\.abandoned_checkouts[\s\S]*where source = 'kalojira_mixed'[\s\S]*আমসত্ত্ব/);
  });
});
