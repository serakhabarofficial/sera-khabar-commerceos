// Product names on an order, for search and for telling single-product orders
// from mixed ones. New orders carry items; legacy rows keep one product string.

export type OrderProductRecord = {
  product?: string | null;
  items?: ReadonlyArray<{ product_name?: string | null }> | null;
};

/** Splits a legacy product string ("2 x Honey, Ghee (1 kg)") into its lines. */
export function splitProductLines(product: string | null): string[] {
  if (!product) return [];

  const lines: string[] = [];
  let current = "";
  let parenthesesDepth = 0;
  for (let index = 0; index < product.length; index += 1) {
    const character = product[index];
    if (character === "(") parenthesesDepth += 1;
    if (character === ")") parenthesesDepth = Math.max(0, parenthesesDepth - 1);

    const plusSeparator = character === "+" &&
      /\s/.test(product[index - 1] || "") &&
      /\s/.test(product[index + 1] || "");
    if ((character === "," || plusSeparator) && parenthesesDepth === 0) {
      if (current.trim()) lines.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) lines.push(current.trim());
  return lines.map((line, index) => index === 0
    ? line.replace(/^cart checkout\s*-\s*/i, "")
    : line);
}

const normalizeName = (name: string) =>
  name
    .replace(/^\d+\s*(x|×)\s+/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim()
    .toLowerCase();

export function orderProductNames(order: OrderProductRecord): string[] {
  if (order.items?.length) return order.items.map((item) => item.product_name || "").filter(Boolean);
  return splitProductLines(order.product ?? null).map((line) => line.replace(/^\d+\s*(x|×)\s+/i, ""));
}

/** An order with more than one different product (sizes of the same product count as one). */
export function isMixedOrder(order: OrderProductRecord): boolean {
  return new Set(orderProductNames(order).map(normalizeName).filter(Boolean)).size > 1;
}
