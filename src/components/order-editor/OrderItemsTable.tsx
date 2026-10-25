import type { ReactNode } from "react";
import { Minus, Package, Plus, Trash } from "@phosphor-icons/react";
import { Select as BuiSelect, SelectItem as BuiSelectItem } from "@/components/base/select/select";
import { DiscountEditor } from "./DiscountEditor";
import { ChangeReasonSelect } from "./ChangeReasonSelect";
import {
  calculateUnitDiscount,
  catalogOptionLabel,
  catalogOptionPrice,
  catalogOptionStock,
  formatTaka,
  formatWeight,
  type CatalogProduct,
  type CatalogVariant,
  type DiscountType,
  type OrderEditorItem,
} from "@/lib/orderEditor";
import { orderItemActivityKey, type AdditionReason } from "@/lib/orderActivity";
import { blurOnWheel } from "@/lib/numberInput";

type OrderItemsTableProps = {
  items: OrderEditorItem[];
  products: CatalogProduct[];
  canEdit: boolean;
  saving: boolean;
  onQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onDiscount: (id: string, discountType: DiscountType | null, discountValue: number) => void;
  onChangeVariant: (id: string, product: CatalogProduct, variant: CatalogVariant) => void;
  requiredAdditionReasonKeys?: string[];
  additionReasons?: Record<string, AdditionReason | "">;
  onAdditionReasonChange?: (itemKey: string, reason: AdditionReason) => void;
  /** Replaces the read-only unit price, e.g. New Order's editable price. */
  renderUnitPrice?: (item: OrderEditorItem) => ReactNode;
  /** Incomplete checkouts have no discounts, so they hide the column. */
  showDiscount?: boolean;
};

const COLUMNS = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.6fr)_minmax(128px,0.9fr)_88px_auto_auto_92px_32px]";
const COLUMNS_EDITABLE_PRICE = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.4fr)_minmax(120px,0.8fr)_136px_auto_auto_92px_32px]";
const COLUMNS_NO_DISCOUNT = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.6fr)_minmax(128px,0.9fr)_88px_auto_92px_32px]";
const RIGHT_ALIGNED_HEADINGS = new Set(["Unit", "Qty", "Line"]);

/** The order lines as an editable table: weight, discount, quantity and line total per row. */
export function OrderItemsTable({ items, products, canEdit, saving, onQuantity, onRemove, onDiscount, onChangeVariant, requiredAdditionReasonKeys = [], additionReasons = {}, onAdditionReasonChange, renderUnitPrice, showDiscount = true }: OrderItemsTableProps) {
  const columns = renderUnitPrice ? COLUMNS_EDITABLE_PRICE : showDiscount ? COLUMNS : COLUMNS_NO_DISCOUNT;
  const headings = ["Product", "Weight", "Unit", ...(showDiscount ? ["Discount"] : []), "Qty", "Line", ""];
  if (items.length === 0) {
    return (
      <div className="grid place-items-center gap-2 py-14 text-center">
        <Package weight="light" size={26} className="text-black/20" />
        <p className="text-[13px] text-black">Your cart is empty.</p>
      </div>
    );
  }

  return (
    <div role="table" aria-label="Order items" className="min-w-0">
      <div role="row" className={`sticky top-0 z-10 hidden gap-3 bg-white pb-2.5 md:grid ${columns}`}>
        {headings.map((heading, index) => (
          <span key={index} role="columnheader" className={`text-[8px] font-medium uppercase tracking-[0.3em] text-black ${RIGHT_ALIGNED_HEADINGS.has(heading) ? "text-right" : ""}`}>{heading}</span>
        ))}
      </div>
      {items.map((item) => {
        const name = item.product_name || "Legacy item";
        const product = products.find((candidate) => candidate.id === item.product_id);
        const unitDiscount = calculateUnitDiscount(item.unit_price, item.discount_type, item.discount_value);
        const netUnit = item.unit_price - unitDiscount;
        const isLegacy = !item.product_id && !item.variant_id;
        const maxQuantity = item.available_stock ?? undefined;
        const activityKey = orderItemActivityKey(item);
        const weightText = item.variant_name || formatWeight(item.weight_kg) || (isLegacy ? "Detached legacy item" : "Standard");
        const canPickWeight = Boolean(product && item.variant_id && product.variants.length > 1);
        return (
          <div key={item.id} role="row" data-testid={`order-item-${item.id}`} className="border-t border-black/[0.06] py-3">
            <div className={`grid items-center gap-x-3 gap-y-2.5 ${columns}`}>
              <div role="cell" className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/[0.04]">{item.image_url ? <img src={item.image_url} alt={name} className="h-full w-full object-cover" /> : <Package weight="light" size={16} className="text-black/25" />}</div>
                <div className="min-w-0 leading-snug">
                  <h3 className="truncate text-[13px] font-medium text-black">{name}</h3>
                  {item.product_slug && <p className="truncate font-mono text-[10px] text-black/45">{item.product_slug}</p>}
                </div>
              </div>
              <div role="cell" className="col-span-2 min-w-0 md:col-span-1">
                {canPickWeight && product ? (
                  <BuiSelect
                    aria-label={`Weight for ${name}`}
                    selectedKey={item.variant_id}
                    onSelectionChange={(key) => {
                      const variant = product.variants.find((candidate) => candidate.id === String(key));
                      if (variant && variant.id !== item.variant_id) onChangeVariant(item.id, product, variant);
                    }}
                    disabledKeys={product.variants.filter((variant) => variant.id !== item.variant_id && catalogOptionStock(product, variant) <= 0).map((variant) => variant.id)}
                    isDisabled={!canEdit || saving}
                    size="sm"
                    triggerClassName="h-8 w-full min-w-0 text-[12px]"
                  >
                    {product.variants.map((variant) => {
                      const label = catalogOptionLabel(product, variant);
                      const stock = catalogOptionStock(product, variant);
                      return <BuiSelectItem key={variant.id} id={variant.id} textValue={label}>{label} · {formatTaka(catalogOptionPrice(product, variant))}{stock <= 0 ? " · out" : ""}</BuiSelectItem>;
                    })}
                  </BuiSelect>
                ) : (
                  <span className="inline-flex h-8 items-center rounded-lg bg-black/[0.04] px-2.5 text-[12px] text-black">{weightText}</span>
                )}
              </div>
              {renderUnitPrice ? (
                <div role="cell" className="col-span-2 min-w-0 md:col-span-1">{renderUnitPrice(item)}</div>
              ) : (
                <div role="cell" className="hidden text-right md:block">
                  <p className="font-mono text-[12.5px] tabular-nums text-black">{formatTaka(netUnit)}</p>
                  {unitDiscount > 0 && <p className="font-mono text-[10px] tabular-nums text-black/35 line-through">{formatTaka(item.unit_price)}</p>}
                </div>
              )}
              {showDiscount && (
                <div role="cell" className="min-w-0">
                  <DiscountEditor item={item} disabled={!canEdit || isLegacy} onApply={(type, value) => onDiscount(item.id, type, value)} onRemove={() => onDiscount(item.id, null, 0)} />
                </div>
              )}
              <div role="cell" className="flex justify-end">
                <div className="flex items-center rounded-full bg-black/[0.04] p-0.5">
                  <button type="button" aria-label={`Decrease ${name} quantity`} onClick={() => onQuantity(item.id, Math.max(1, item.quantity - 1))} disabled={!canEdit || item.quantity <= 1} className="grid h-7 w-7 place-items-center rounded-full text-black transition hover:bg-white disabled:opacity-20"><Minus weight="light" size={13} /></button>
                  <input aria-label={`Quantity for ${name}`} type="number" onWheel={blurOnWheel} min={1} max={maxQuantity} value={item.quantity} onChange={(event) => onQuantity(item.id, Math.max(1, Math.min(maxQuantity ?? Number.MAX_SAFE_INTEGER, Number.parseInt(event.target.value, 10) || 1)))} disabled={!canEdit} className="h-7 w-9 bg-transparent text-center font-mono text-[12.5px] font-medium outline-none [appearance:textfield] disabled:opacity-40 [&::-webkit-inner-spin-button]:appearance-none" />
                  <button type="button" aria-label={`Increase ${name} quantity`} onClick={() => onQuantity(item.id, item.quantity + 1)} disabled={!canEdit || (maxQuantity != null && item.quantity >= maxQuantity)} className="grid h-7 w-7 place-items-center rounded-full text-black transition hover:bg-white disabled:opacity-20"><Plus weight="light" size={13} /></button>
                </div>
              </div>
              <div role="cell" className="text-right font-mono text-[13px] font-medium tabular-nums text-black">{formatTaka(netUnit * item.quantity)}</div>
              <div role="cell" className="flex justify-end">
                <button type="button" aria-label={`Remove ${name}`} onClick={() => onRemove(item.id)} disabled={!canEdit} className="grid h-8 w-8 place-items-center rounded-lg text-black/35 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-25"><Trash weight="light" size={15} /></button>
              </div>
            </div>
            {isLegacy && <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">Remove or replace this detached legacy item before saving cart changes.</p>}
            {requiredAdditionReasonKeys.includes(activityKey) && onAdditionReasonChange && <div className="max-w-sm"><ChangeReasonSelect itemName={name} value={additionReasons[activityKey] || ""} disabled={!canEdit || saving} onChange={(reason) => onAdditionReasonChange(activityKey, reason)} /></div>}
          </div>
        );
      })}
    </div>
  );
}
