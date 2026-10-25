import { Chip } from "@/components/base/badges/chip";
import { Switch } from "@/components/base/switch/switch";
import { CartDiscountEditor } from "./CartDiscountEditor";
import { AdvancePaymentProof } from "./AdvancePaymentProof";
import { formatTaka, formatWeight, roundTaka, type CartTotals, type DiscountType, type OrderEditorItem } from "@/lib/orderEditor";
import { blurOnWheel } from "@/lib/numberInput";

type OrderPaymentPanelProps = {
  items: OrderEditorItem[];
  totals: CartTotals;
  canEdit: boolean;
  overallDiscountType: DiscountType | null;
  overallDiscountValue: number;
  onOverallDiscount: (discountType: DiscountType, discountValue: number) => void;
  onRemoveOverallDiscount: () => void;
  deliveryOn: boolean;
  onToggleDelivery: (enabled: boolean) => void;
  advance: number;
  onAdvanceChange: (value: number) => void;
  advanceMethod: string;
  advanceReference: string;
  onAdvanceMethodChange: (method: string) => void;
  onAdvanceReferenceChange: (reference: string) => void;
  /** Incomplete checkouts have no order discount, so they hide the row. */
  showOrderDiscount?: boolean;
};

/** Money for the order: discounts, delivery, advance, and what the courier collects. */
export function OrderPaymentPanel({ items, totals, canEdit, overallDiscountType, overallDiscountValue, onOverallDiscount, onRemoveOverallDiscount, deliveryOn, onToggleDelivery, advance, onAdvanceChange, advanceMethod, advanceReference, onAdvanceMethodChange, onAdvanceReferenceChange, showOrderDiscount = true }: OrderPaymentPanelProps) {
  const overallBase = roundTaka(totals.grossSubtotal - totals.itemDiscount);
  const totalWeight = formatWeight(items.reduce((sum, item) => sum + (Number(item.weight_kg) || 0) * item.quantity, 0));

  return (
    <section aria-label="Payment" className="min-w-0">
      <p className="mb-2.5 text-[8px] font-medium uppercase tracking-[0.3em] text-black">Payment</p>
      <dl className="grid gap-1 text-[12.5px] leading-snug">
        <div className="flex min-h-9 items-center justify-between gap-3"><dt className="text-black/60">Subtotal{totalWeight ? ` · ${totals.quantity} pcs · ${totalWeight}` : ""}</dt><dd className="font-mono tabular-nums">{formatTaka(totals.grossSubtotal)}</dd></div>
        {totals.itemDiscount > 0 && <div className="flex min-h-9 items-center justify-between gap-3"><dt className="text-black/60">Item discounts</dt><dd className="font-mono tabular-nums text-emerald-700">−{formatTaka(totals.itemDiscount)}</dd></div>}
        {showOrderDiscount && <div className="flex min-h-9 items-center justify-between gap-3">
          <dt className="text-black/60">Order discount</dt>
          <dd className="flex items-center gap-2">
            {totals.legacyDiscount > 0 && <span className="font-mono tabular-nums text-emerald-700">−{formatTaka(totals.legacyDiscount)}</span>}
            <CartDiscountEditor base={overallBase} discountType={overallDiscountType} discountValue={overallDiscountValue} disabled={!canEdit} onApply={onOverallDiscount} onRemove={onRemoveOverallDiscount} />
          </dd>
        </div>}
        <div className="flex min-h-9 items-center justify-between gap-3">
          <dt className="flex items-center gap-2.5 text-black/60"><Switch size="sm" aria-label="Toggle delivery charge" isSelected={deliveryOn} onChange={onToggleDelivery} isDisabled={!canEdit} />Delivery</dt>
          <dd className="font-mono tabular-nums">{totals.deliveryFee > 0 ? formatTaka(totals.deliveryFee) : "Free"}</dd>
        </div>
        <div className="flex min-h-9 items-center justify-between gap-3">
          <dt className="text-black/60">Advance / partial</dt>
          <dd className="flex items-center">
            <span className="flex shrink-0 items-center gap-1 rounded-lg bg-black/[0.04] py-1 pl-2.5 pr-1 ring-1 ring-inset ring-black/[0.06] transition focus-within:bg-white focus-within:ring-black/20">
              <span className="font-mono text-[12px] text-black/40">৳</span>
              <input aria-label="Advance payment" type="number" onWheel={blurOnWheel} min={0} max={totals.finalTotal} value={advance > 0 ? advance : ""} placeholder="0" onChange={(event) => onAdvanceChange(Math.min(totals.finalTotal, Math.max(0, Number(event.target.value) || 0)))} disabled={!canEdit} className="w-20 bg-transparent text-right font-mono text-[12px] font-medium tabular-nums outline-none placeholder:text-black/30 disabled:opacity-40" />
            </span>
          </dd>
        </div>
        {advance > 0 && <div className="flex min-h-9 items-center justify-between gap-3"><dt className="text-black/60">Paid via</dt><dd><AdvancePaymentProof hideLabel method={advanceMethod} reference={advanceReference} onMethodChange={onAdvanceMethodChange} onReferenceChange={onAdvanceReferenceChange} disabled={!canEdit} /></dd></div>}
        <div className="mt-1 flex min-h-9 items-center justify-between border-t border-black/[0.07] pt-1"><dt className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Final total</dt><dd className="font-mono text-[20px] font-light tabular-nums">{formatTaka(totals.finalTotal)}</dd></div>
      </dl>
    </section>
  );
}

/** What the courier collects; sits on the same row as Save so the two always line up. */
export function CollectOnDeliveryBar({ total, advance }: { total: number; advance: number }) {
  const due = Math.max(0, roundTaka(total - advance));
  return (
    <dl className="min-w-0">
      <div data-testid="collect-on-delivery" className="flex h-full items-center justify-between gap-3 whitespace-nowrap rounded-[20px] bg-black px-[1.5em] py-[0.6em] text-[17px] text-white">
        <dt>{advance > 0 ? "Due after advance" : "Collect on delivery"}</dt>
        <dd>{advance > 0 && due === 0 ? <Chip variant="subtle" color="lime" className="font-medium">Paid</Chip> : <span className="font-mono tabular-nums">{formatTaka(due)}</span>}</dd>
      </div>
    </dl>
  );
}
