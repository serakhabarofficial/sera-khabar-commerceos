import JsBarcode from "jsbarcode";

export interface ShippingLabelItem {
  product_name: string | null;
  variant_name: string | null;
  quantity: number;
}

export interface ShippingLabelOrder {
  id: string;
  order_number: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  product: string | null;
  quantity: number | null;
  price: number | null;
  delivery_rate: number | null;
  tracking_code?: string | null;
  consignment_id?: string | number | null;
  items?: ShippingLabelItem[];
}

type ShippingLabelResult =
  | { ok: true }
  | { ok: false; missingOrderNumbers: string[] };

type ShippingLabelHtmlResult =
  | { ok: true; html: string }
  | { ok: false; missingOrderNumbers: string[] };

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const parseInlineQuantity = (value: string) => {
  const match = value.match(/^(\d+)\s*(?:x|×)\s+(.+)$/i);
  return match
    ? { quantity: Number.parseInt(match[1], 10), productName: match[2].trim() }
    : null;
};

const formatCod = (order: ShippingLabelOrder) => {
  const amount = Number(order.price || 0) + Number(order.delivery_rate || 0);
  return `৳${amount.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
};

const formatShippingPhone = (phone: string) => phone.trim().replace(/\s+/g, "");

// The name gets its own line and may wrap, so it only shrinks for very long
// names; the phone sits on the next line and is never cut off.
const nameSizeClass = (length: number) => {
  if (length > 32) return "name-size-tight";
  if (length > 22) return "name-size-small";
  if (length > 14) return "name-size-compact";
  return "name-size-normal";
};

const orderNumberText = (orderNumber: string) => orderNumber.replace(/^#/, "");

export function getShippingLabelCn(order: ShippingLabelOrder): string | null {
  for (const candidate of [order.consignment_id, order.tracking_code]) {
    if (candidate == null) continue;
    const value = String(candidate).trim();
    if (value) return value;
  }
  return null;
}

function barcodeSvg(cn: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "barcode");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `CN barcode ${cn}`);
  JsBarcode(svg, cn, {
    format: "CODE128",
    displayValue: false,
    background: "#ffffff",
    lineColor: "#000000",
    width: 1.35,
    height: 48,
    margin: 0,
  });
  // Stretch the bars to the label width; a wider barcode scans more reliably.
  svg.setAttribute("preserveAspectRatio", "none");
  return new XMLSerializer().serializeToString(svg);
}

function productRows(order: ShippingLabelOrder) {
  if (order.items?.length) {
    return order.items.map((item) => ({
      productName: item.product_name || "Item",
      weight: item.variant_name || "—",
      quantity: item.quantity || 1,
    }));
  }

  const lines = (order.product || "Item")
    .split(",")
    .map((line) => line.trim())
    .filter(Boolean);

  return (lines.length ? lines : ["Item"]).map((line) => {
    const parsed = parseInlineQuantity(line);
    return {
      productName: parsed?.productName || line,
      weight: "—",
      quantity: parsed?.quantity || (lines.length === 1 ? order.quantity || 1 : 1),
    };
  });
}

// A 3x4in label fits six product rows. Larger orders list the first five and
// say how many more there are, so nothing is silently cut off the bottom.
const MAX_LABEL_ROWS = 6;

function labelSection(order: ShippingLabelOrder, cn: string, businessName: string) {
  const products = productRows(order);
  const totalQuantity = products.reduce((sum, item) => sum + item.quantity, 0);
  const shown = products.length > MAX_LABEL_ROWS ? products.slice(0, MAX_LABEL_ROWS - 1) : products;
  const hidden = products.slice(shown.length);
  const hiddenQuantity = hidden.reduce((sum, item) => sum + item.quantity, 0);
  const moreRow = hidden.length
    ? `
      <tr class="more-items">
        <td colspan="2">+${hidden.length} more ${hidden.length === 1 ? "item" : "items"} — see order #${escapeHtml(orderNumberText(order.order_number))}</td>
        <td class="quantity">${hiddenQuantity}</td>
      </tr>`
    : "";
  const rows = shown
    .map((item) => `
      <tr>
        <td class="product">${escapeHtml(item.productName)}</td>
        <td class="weight">${escapeHtml(item.weight)}</td>
        <td class="quantity">${item.quantity}</td>
      </tr>`)
    .join("") + moreRow;
  const customerName = order.customer_name || "Customer";
  const phone = order.phone ? formatShippingPhone(order.phone) : "—";
  const nameClass = nameSizeClass(Array.from(customerName).length);

  return `
    <section class="${products.length > 3 ? "shipping-label many-items" : "shipping-label"}">
      <div class="label-summary">
        <header class="brand-header">
          <img src="/sera-khabar-print-logo.png" alt="${escapeHtml(businessName)}" />
        </header>
        <div class="barcode-wrap">${barcodeSvg(cn)}</div>
        <div class="cn"><span>CN:</span> ${escapeHtml(cn)}</div>
        <div class="recipient-details">
          <div class="shipment-meta">
            <div class="meta-field"><span>ORDER</span><strong>#${escapeHtml(orderNumberText(order.order_number))}</strong></div>
            <div class="meta-field"><span>COD</span><strong>${formatCod(order)}</strong></div>
          </div>
          <div class="customer-label">CUSTOMER</div>
          <div class="recipient-name ${nameClass}">${escapeHtml(customerName)}</div>
          <div class="recipient-phone">${escapeHtml(phone)}</div>
        </div>
      </div>
      <table class="products">
        <thead>
          <tr><th>Product</th><th>Weight</th><th>Qty</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <footer class="label-footer"><span>TOTAL QTY</span><strong>${totalQuantity}</strong></footer>
    </section>`;
}

export function buildShippingLabelHtml(
  orders: ShippingLabelOrder[],
  businessName = "Sera Khabar",
): ShippingLabelHtmlResult {
  const missingOrderNumbers = orders
    .filter((order) => !getShippingLabelCn(order))
    .map((order) => order.order_number);

  if (missingOrderNumbers.length > 0) {
    return { ok: false, missingOrderNumbers };
  }

  const labels = orders
    .map((order) => labelSection(order, getShippingLabelCn(order) as string, businessName))
    .join("");

  return {
    ok: true,
    html: `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title></title>
          <style>
            @page { size: 3in 4in; margin: 0; }
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; color: #000; background: #fff; }
            body { font-family: Arial, "Noto Sans Bengali", sans-serif; }
            .shipping-label {
              width: 3in;
              height: 4in;
              padding: 0.09in;
              border: 2px solid #000;
              overflow: hidden;
              page-break-after: always;
              break-after: page;
              display: flex;
              flex-direction: column;
            }
            .shipping-label:last-child { page-break-after: auto; break-after: auto; }
            .label-summary { flex: 0 0 auto; }
            .brand-header { height: 0.34in; display: flex; align-items: center; justify-content: center; padding: 0.02in 0.16in; }
            .brand-header img { display: block; max-width: 2.2in; max-height: 0.3in; filter: grayscale(1) brightness(0); }
            .barcode-wrap { height: 0.66in; display: flex; align-items: center; justify-content: center; padding: 0.04in 0.08in 0.03in; }
            .barcode { display: block; width: 100%; height: 0.59in; }
            .cn { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 0.04in 0; text-align: center; font-size: 16px; line-height: 1; font-weight: 800; letter-spacing: 0.5px; }
            .cn span { font-size: 12px; }
            .recipient-details { padding: 0.05in 0.03in 0.06in; border-bottom: 1px solid #000; }
            .shipment-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.08in; padding-bottom: 0.05in; border-bottom: 1px solid #000; }
            .meta-field { min-width: 0; }
            .meta-field + .meta-field { text-align: right; }
            .meta-field span, .customer-label { display: block; font-size: 7px; line-height: 1; font-weight: 700; letter-spacing: 0.14em; }
            .meta-field strong { display: block; margin-top: 0.025in; font-size: 17px; line-height: 1; font-weight: 800; overflow-wrap: anywhere; }
            .customer-label { margin-top: 0.05in; }
            .recipient-name { margin-top: 0.03in; line-height: 1.12; font-weight: 800; text-transform: uppercase; letter-spacing: 0.01em; overflow-wrap: anywhere; }
            .name-size-normal { font-size: 22px; }
            .name-size-compact { font-size: 18px; }
            .name-size-small { font-size: 15px; }
            .name-size-tight { font-size: 13px; }
            .recipient-phone { margin-top: 0.035in; font-size: 22px; line-height: 1; font-weight: 800; letter-spacing: 0.04em; white-space: nowrap; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 0.06in; font-size: 9.5px; line-height: 1.15; }
            th, td { border: 1px solid #000; padding: 0.03in 0.03in; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
            th { background: #000; color: #fff; text-transform: uppercase; font-size: 7.5px; letter-spacing: 0.25px; }
            tbody tr { height: 0.25in; }
            th:nth-child(1) { width: 52%; }
            th:nth-child(2) { width: 32%; }
            th:nth-child(3) { width: 16%; }
            td.product { text-align: left; font-weight: 700; }
            td.weight { text-align: left; }
            td.weight, td.quantity { white-space: nowrap; }
            td.quantity { font-size: 11px; font-weight: 800; }
            .label-footer { margin-top: auto; padding-top: 0.04in; border-top: 1px solid #000; display: flex; align-items: baseline; justify-content: space-between; }
            .label-footer span { font-size: 7px; font-weight: 700; letter-spacing: 0.14em; }
            .label-footer strong { font-size: 15px; font-weight: 800; line-height: 1; }
            /* Four or more products: shrink the header so every row and the total still fit. */
            .many-items .brand-header { height: 0.28in; }
            .many-items .brand-header img { max-height: 0.24in; }
            .many-items .barcode-wrap { height: 0.48in; }
            .many-items .barcode { height: 0.42in; }
            .many-items .recipient-phone { font-size: 18px; }
            .many-items .name-size-normal { font-size: 18px; }
            .many-items .name-size-compact { font-size: 16px; }
            .many-items tbody tr { height: 0.2in; }
            tr.more-items td { font-weight: 800; text-align: left; background: #eee; }
            tr.more-items td.quantity { text-align: center; }
            .many-items th, .many-items td { padding: 0.02in 0.03in; }
            @media print {
              html, body { width: 3in; }
              .shipping-label { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>${labels}</body>
      </html>`,
  };
}

function waitForImages(doc: Document) {
  return Promise.all(
    Array.from(doc.images).map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }),
  );
}

export function printShippingLabels(
  orders: ShippingLabelOrder[],
  businessName?: string,
): ShippingLabelResult {
  const result = buildShippingLabelHtml(orders, businessName);
  if (!result.ok) return result;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.setAttribute("title", "Shipping label print frame");
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    throw new Error("Unable to prepare shipping labels for printing");
  }

  iframeDoc.open();
  iframeDoc.write(result.html);
  iframeDoc.close();

  void waitForImages(iframeDoc).then(() => {
    window.setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 5000);
    }, 150);
  });

  return { ok: true };
}
