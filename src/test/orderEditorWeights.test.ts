import { describe, expect, it } from "vitest";
import {
  catalogOptionLabel,
  catalogOptionPrice,
  changeCartItemVariant,
  upsertCartItem,
  type CatalogProduct,
} from "@/lib/orderEditor";

const ghee: CatalogProduct = {
  id: "ghee",
  name: "Pure Cow Ghee",
  slug: "pure-cow-ghee",
  selling_price: 450,
  stock_quantity: 0,
  weight_kg: null,
  image_url: null,
  images: [],
  variants: [
    { id: "ghee-250", attributes: { weight: "250 g" }, price_adjustment: 0, stock_quantity: 40, weight_kg: 0.25 },
    { id: "ghee-500", attributes: { weight: "500 g" }, price_adjustment: 400, stock_quantity: 34, weight_kg: 0.5 },
    { id: "ghee-1k", attributes: { weight: "1 kg" }, price_adjustment: 1200, stock_quantity: 2, weight_kg: 1 },
  ],
};

describe("catalog weight options", () => {
  it("labels a variant by its attributes and falls back to the product weight", () => {
    expect(catalogOptionLabel(ghee, ghee.variants[1])).toBe("500 g");
    expect(catalogOptionLabel({ ...ghee, variants: [], weight_kg: 1 })).toBe("1 kg");
    expect(catalogOptionLabel({ ...ghee, variants: [], weight_kg: null })).toBe("Standard");
  });

  it("prices a variant as the product price plus its adjustment", () => {
    expect(catalogOptionPrice(ghee, ghee.variants[2])).toBe(1650);
    expect(catalogOptionPrice(ghee)).toBe(450);
  });
});

describe("changeCartItemVariant", () => {
  it("swaps the weight in place and keeps quantity and discount intent", () => {
    const start = upsertCartItem([], ghee, ghee.variants[0]);
    const withQty = start.map((item) => ({ ...item, quantity: 2, discount_type: "fixed" as const, discount_value: 50, unit_discount: 50 }));

    const [line] = changeCartItemVariant(withQty, withQty[0].id, ghee, ghee.variants[1]);

    expect(line).toMatchObject({
      product_id: "ghee",
      variant_id: "ghee-500",
      variant_name: "500 g",
      unit_price: 850,
      weight_kg: 0.5,
      available_stock: 34,
      quantity: 2,
      discount_type: "fixed",
      discount_value: 50,
      unit_discount: 50,
    });
  });

  it("clamps quantity to the new weight's stock", () => {
    const items = upsertCartItem([], ghee, ghee.variants[0]).map((item) => ({ ...item, quantity: 5 }));
    const [line] = changeCartItemVariant(items, items[0].id, ghee, ghee.variants[2]);
    expect(line.quantity).toBe(2);
  });

  it("merges into an existing line that already has the chosen weight", () => {
    let items = upsertCartItem([], ghee, ghee.variants[0]);
    items = upsertCartItem(items, ghee, ghee.variants[1]);
    const result = changeCartItemVariant(items, items[0].id, ghee, ghee.variants[1]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ variant_id: "ghee-500", quantity: 2 });
  });

  it("leaves the cart untouched for an unknown line", () => {
    const items = upsertCartItem([], ghee, ghee.variants[0]);
    expect(changeCartItemVariant(items, "missing", ghee, ghee.variants[1])).toBe(items);
  });
});
