import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowCounterClockwise, ArrowLeft, CheckCircle, PencilSimple, Phone, Plus, UserPlus } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { syncOrders } from "@/lib/ordersSync";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { Spinner } from "@/components/ui/ios-spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DarkToast, toast } from "@/components/ui/sonner";
import {
  calculateCartTotals,
  calculateUnitDiscount,
  changeCartItemVariant,
  formatTaka,
  roundTaka,
  upsertCartItem,
  type CatalogProduct,
  type CatalogVariant,
  type DiscountType,
  type OrderEditorItem,
} from "@/lib/orderEditor";
import { ProductPicker } from "@/components/order-editor/ProductPicker";
import { OrderItemsTable } from "@/components/order-editor/OrderItemsTable";
import { CollectOnDeliveryBar, OrderPaymentPanel } from "@/components/order-editor/OrderPaymentPanel";
import { LastOrdersCard } from "@/components/order-editor/CustomerDossier";
import type { HistoryEntry } from "@/components/order-editor/CustomerPanel";
import { OrderSourceSelect } from "@/components/order-editor/OrderSourceSelect";
import { FraudPanel } from "@/components/order-editor/FraudPanel";
import { useFraudCheckMutation } from "@/hooks/useFraudCheck";
import { bdWhatsAppHref, normalizeBdMobileInput, normalizeBdPhone, toEnglishDigits } from "@/lib/bdPhone";
import WhatsappLogo from "@/components/WhatsappLogo";
import { StaffSelect } from "@/components/order-editor/StaffSelect";
import { useAuth } from "@/hooks/useAuth";
import type { OrderSource } from "@/lib/orderSource";
import { blurOnWheel } from "@/lib/numberInput";
import { customerPrefillFromState } from "@/lib/customerProfile";

type Line = OrderEditorItem;

type ProductsResponse = { products: CatalogProduct[] };
type HistoryOrder = HistoryEntry & { phone?: string | null };
type CustomerLookupResponse = {
  customer: {
    customerName: string;
    address: string;
    lastOrderAt: string | null;
  } | null;
};

const PAYMENT_METHODS = [
  { value: "cod", label: "Cash on Delivery" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "card", label: "Card" },
];

const DEFAULT_DELIVERY_FEE = 100;

function catalogUnitPrice(line: Line, products: CatalogProduct[]): number | null {
  const product = products.find((item) => item.id === line.product_id);
  if (!product) return null;
  const variant = line.variant_id ? product.variants?.find((item) => item.id === line.variant_id) : null;
  return (product.selling_price || 0) + (variant?.price_adjustment || 0);
}

// Keeps its own text so the field can be cleared mid-edit without
// snapping back to 0; only valid numbers are committed to the cart.
function UnitPriceInput({ value, label, disabled, onCommit }: { value: number; label: string; disabled: boolean; onCommit: (price: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft((current) => (Number(current) === value && current.trim() !== "" ? current : String(value)));
  }, [value]);
  return (
    <label
      title="Click to edit the price for this order"
      className="group flex h-8 w-full cursor-text items-center gap-1 rounded-lg border border-dashed border-black/25 bg-white px-2 transition-colors hover:border-black/50 focus-within:border-solid focus-within:border-black focus-within:ring-2 focus-within:ring-black/10"
    >
      <span aria-hidden="true" className="font-mono text-[12px] text-black/45">৳</span>
      <input
        aria-label={label}
        type="number" onWheel={blurOnWheel}
        inputMode="decimal"
        min={0}
        step="any"
        value={draft}
        disabled={disabled}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = Number(event.target.value);
          if (event.target.value.trim() !== "" && Number.isFinite(next) && next >= 0) onCommit(roundTaka(next));
        }}
        onBlur={() => setDraft(String(value))}
        className="w-full min-w-0 bg-transparent font-mono text-[13px] tabular-nums text-black outline-none [appearance:textfield] disabled:opacity-40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <PencilSimple aria-hidden="true" weight="light" size={13} className="shrink-0 text-black/40 group-hover:text-black/70 group-focus-within:text-black" />
    </label>
  );
}

export default function NewOrder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const returnTo = typeof location.state?.from === "string" ? location.state.from : "/";
  const customerPrefill = customerPrefillFromState(location.state);
  const [creating, setCreating] = useState(false);
  const [customerName, setCustomerName] = useState(customerPrefill.customerName);
  const [phone, setPhone] = useState(toEnglishDigits(customerPrefill.phone));
  const [address, setAddress] = useState(customerPrefill.address);
  const [matchedCustomerPhone, setMatchedCustomerPhone] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [deliveryOn, setDeliveryOn] = useState(true);
  const [overallType, setOverallType] = useState<DiscountType | null>(null);
  const [overallValue, setOverallValue] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [advanceMethod, setAdvanceMethod] = useState("");
  const [advanceReference, setAdvanceReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<OrderSource>("manual_other");
  const [assignedTo, setAssignedTo] = useState<string | null>(null);

  useEffect(() => {
    if (!assignedTo && user?.id) setAssignedTo(user.id);
  }, [assignedTo, user?.id]);

  const productsQuery = useQuery<ProductsResponse>({
    queryKey: ["/api/products"],
    staleTime: 60_000,
    queryFn: async () => {
      const response = await apiFetch("/api/products");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to load products");
      return { products: (data.products || []).map((product: CatalogProduct) => ({ ...product, variants: product.variants || [] })) };
    },
  });

  const products = productsQuery.data?.products || [];
  const deliveryCharge = deliveryOn ? DEFAULT_DELIVERY_FEE : 0;
  const draftBase = useMemo(() => {
    const withoutOverall = calculateCartTotals(lines, 0, 0);
    return roundTaka(withoutOverall.grossSubtotal - withoutOverall.itemDiscount);
  }, [lines]);
  const overallAmount = calculateUnitDiscount(draftBase, overallType, overallValue);
  const totals = useMemo(
    () => calculateCartTotals(lines, deliveryCharge, overallAmount),
    [lines, deliveryCharge, overallAmount],
  );
  const total = totals.finalTotal;

  function addCatalogItem(product: CatalogProduct, variant?: CatalogVariant) {
    setLines((current) => upsertCartItem(current, product, variant));
  }

  function changeLineVariant(lineId: string, product: CatalogProduct, variant: CatalogVariant) {
    setLines((current) => changeCartItemVariant(current, lineId, product, variant));
  }

  function setLineQty(lineId: string, qty: number) {
    setLines((current) => current.map((line) => {
      if (line.id !== lineId) return line;
      const max = line.available_stock ?? Number.MAX_SAFE_INTEGER;
      const next = Number.isFinite(qty) ? Math.trunc(qty) : line.quantity;
      return { ...line, quantity: Math.max(1, Math.min(max, next || 1)) };
    }));
  }

  function updateLineDiscount(lineId: string, discountType: DiscountType | null, discountValue: number) {
    setLines((current) => current.map((line) => line.id === lineId ? {
      ...line,
      discount_type: discountType,
      discount_value: discountType ? discountValue : 0,
      unit_discount: calculateUnitDiscount(line.unit_price, discountType, discountValue),
    } : line));
  }

  function updateLinePrice(lineId: string, price: number) {
    setLines((current) => current.map((line) => {
      if (line.id !== lineId) return line;
      const discountValue = line.discount_type === "fixed" ? Math.min(line.discount_value, price) : line.discount_value;
      return {
        ...line,
        unit_price: price,
        discount_value: discountValue,
        unit_discount: calculateUnitDiscount(price, line.discount_type, discountValue),
      };
    }));
  }

  function removeLine(lineId: string) {
    setLines((current) => current.filter((line) => line.id !== lineId));
  }

  function resetCustomer() {
    setCustomerName("");
    setPhone("");
    setAddress("");
    setMatchedCustomerPhone(null);
  }

  const normalizedPhone = normalizeBdMobileInput(phone);
  const customerLookup = useQuery<CustomerLookupResponse>({
    queryKey: ["/api/customers/lookup", normalizedPhone],
    enabled: Boolean(normalizedPhone),
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      if (!normalizedPhone) return { customer: null };
      const response = await apiFetch(`/api/customers/lookup?phone=${encodeURIComponent(normalizedPhone)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to look up customer");
      return { customer: data.customer || null };
    },
  });
  // The customer's previous orders with this store, from the shared orders list.
  const ordersQuery = useQuery<HistoryOrder[]>({
    queryKey: ["/api/orders"],
    staleTime: 30_000,
    enabled: Boolean(normalizedPhone),
    queryFn: () => syncOrders<HistoryOrder>(queryClient),
  });
  const history = useMemo(() => {
    if (!normalizedPhone) return [];
    const key = normalizedPhone.slice(-11);
    return (ordersQuery.data || [])
      .filter((order) => (order.phone || "").replace(/\D/g, "").slice(-11) === key)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 5);
  }, [normalizedPhone, ordersQuery.data]);
  const fraudCheck = useFraudCheckMutation(phone);
  const autoCheckedPhone = useRef<string | null>(null);
  const cartScrollRef = useRef<HTMLDivElement>(null);
  const prevLineCount = useRef(0);

  // Keep the newest cart item in view so the operator can preview it
  // right after adding. Only fires when a new line appears (length
  // increase) — quantity bumps on existing lines don't move the scroll.
  useEffect(() => {
    if (lines.length > prevLineCount.current) {
      const scroller = cartScrollRef.current;
      if (scroller && typeof scroller.scrollTo === "function") {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
      }
    }
    prevLineCount.current = lines.length;
  }, [lines.length]);

  // Check the number in the background as soon as it becomes a valid BD
  // phone. resolveFraudCheck returns fresh cache without spending a request,
  // so re-typing a known number costs nothing.
  useEffect(() => {
    if (normalizedPhone && autoCheckedPhone.current !== normalizedPhone) {
      autoCheckedPhone.current = normalizedPhone;
      fraudCheck.mutate({ force: false });
    }
  }, [normalizedPhone, fraudCheck]);

  useEffect(() => {
    if (!normalizedPhone) {
      setMatchedCustomerPhone(null);
      return;
    }

    const customer = customerLookup.data?.customer;
    if (!customer) {
      if (customerLookup.isSuccess) setMatchedCustomerPhone(null);
      return;
    }

    setCustomerName((current) => current.trim() ? current : customer.customerName || "");
    setAddress((current) => current.trim() ? current : customer.address || "");
    setMatchedCustomerPhone(normalizedPhone);
  }, [customerLookup.data, customerLookup.isSuccess, normalizedPhone]);

  async function createOrder() {
    if (!phone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    if (!normalizedPhone) {
      toast.error("Enter a mobile number in English digits, like 01712345678 or +8801712345678");
      return;
    }
    if (!customerName.trim()) {
      toast.error("Add a customer name");
      return;
    }
    if (!address.trim()) {
      toast.error("Add a delivery address");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one product");
      return;
    }
    const missingVariant = lines.find((line) => {
      if (!line.product_id || line.variant_id) return false;
      const product = products.find((item) => item.id === line.product_id);
      return (product?.variants?.length || 0) > 0;
    });
    if (missingVariant) {
      toast.error(`Select a variant for ${missingVariant.product_name || "product"}`);
      return;
    }

    setCreating(true);
    try {
      const response = await apiFetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          phone: normalizedPhone,
          address: address.trim(),
          product: lines.map((line) => line.product_name || "Product").join(", "),
          quantity: totals.quantity,
          price: totals.netMerchandiseTotal,
          items: lines.map((line) => ({ product_id: line.product_id, variant_id: line.variant_id, product_name: line.product_name, variant_name: line.variant_name, unit_price: line.unit_price, quantity: line.quantity, discount_type: line.discount_type, discount_value: line.discount_value, unit_discount: line.unit_discount })),
          delivery_rate: deliveryCharge,
          status: "confirmed",
          fraud_checked: false,
          fulfillment_status: "unfulfilled",
          notes: notes.trim() || null,
          payment_method: paymentMethod,
          discount: totals.aggregateDiscount,
          advanced_payment: Math.min(advance, total),
          // Proof is optional and only sent alongside an advance.
          advance_payment_method: advance > 0 && advanceMethod ? advanceMethod : undefined,
          advance_payment_reference: advance > 0 && advanceReference.trim() ? advanceReference.trim() : undefined,
          source,
          assigned_to: assignedTo,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to create order");

      await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast.custom(() => <DarkToast className="flex items-center gap-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15"><CheckCircle weight="light" size={20} className="text-emerald-400" /></div><div><span className="block text-[10px] font-semibold uppercase tracking-widest text-white/50">Order created</span><span className="text-sm font-semibold text-white">{customerName || "Order"}</span></div></DarkToast>, { fit: true });
      navigate(returnTo, { replace: true, state: location.state?.profileNavigationState });
    } catch (error) {
      console.error("Error creating order:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create order");
    } finally {
      setCreating(false);
    }
  }

  const fieldClass = "h-10 w-full rounded-lg bg-white px-3 text-[13px] normal-case tracking-normal text-black outline-none ring-1 ring-inset ring-black/[0.08] transition placeholder:text-black/35 focus:ring-black/25 disabled:opacity-50";
  const labelClass = "grid gap-1.5 text-[8px] font-medium uppercase tracking-[0.3em] text-black";
  const contactClass = "grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-black/70 ring-1 ring-inset ring-black/[0.08] transition hover:bg-black/[0.03] hover:text-black active:scale-[0.97]";
  const isReturning = Boolean(normalizedPhone && matchedCustomerPhone === normalizedPhone);
  const initial = Array.from(customerName.trim())[0];

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-3 bg-[#FAFAF8] px-2 pb-3 pt-0 lg:px-3 lg:pt-1">
      <div data-testid="new-order-toolbar" className="sticky top-0 z-30 flex shrink-0 flex-wrap items-center gap-3 bg-[#FAFAF8]/95 py-2 backdrop-blur-sm">
        <BuiButton variant="ghost" size="small" iconOnly leadingIcon={ArrowLeft} aria-label="Back" onClick={() => navigate(returnTo, { state: location.state?.profileNavigationState })} />
        <h1 className="truncate text-[28px] font-medium tracking-tight text-black">New order</h1>
        <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-medium text-black/60">Created as Confirmed</span>
      </div>

      <div data-testid="new-order-workspace" className="grid min-h-0 grid-cols-1 gap-3 xl:h-[calc(100dvh-8.75rem)] xl:min-h-[600px] xl:grid-cols-[380px_minmax(0,1fr)]">
        <section aria-label="Customer and order" className="flex min-h-0 flex-col gap-4 rounded-2xl bg-[#F3F2EE] p-4 ring-1 ring-black/[0.07] sm:p-5 xl:overflow-y-auto xl:overscroll-contain">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className={initial ? "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#F6D78A] to-[#E3A33B] text-[15px] font-medium text-[#5A3A0A]" : "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/[0.06] text-[15px] text-black/30"}>{initial || "?"}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-medium tracking-[-0.01em] text-black">{customerName.trim() || "New customer"}</p>
              <p className="text-[11.5px] text-black/50">{isReturning ? "Found from the phone number. Details filled in." : "Type the phone first to find a returning customer."}</p>
            </div>
            <button type="button" onClick={resetCustomer} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-medium text-black ring-1 ring-inset ring-black/[0.07] transition hover:bg-black/[0.03] active:scale-[0.97]">
              <UserPlus weight="light" size={14} />
              New customer
            </button>
          </div>

          <label className={labelClass}>
            Phone
            <div className="flex items-center gap-1.5">
              <input aria-label="Phone" type="tel" required value={phone} onChange={(event) => setPhone(toEnglishDigits(event.target.value))} placeholder="01712345678" className={`${fieldClass} font-mono`} />
              {normalizedPhone && (
                <>
                  <a href={`tel:${normalizedPhone}`} aria-label="Call customer" className={contactClass}><Phone weight="light" size={16} /></a>
                  <a href={bdWhatsAppHref(normalizedPhone) ?? undefined} target="_blank" rel="noreferrer" aria-label="Open WhatsApp chat" className={`${contactClass} text-[#128C4A]`}><WhatsappLogo size={16} /></a>
                </>
              )}
            </div>
            {isReturning && <span className="text-[11px] font-normal normal-case tracking-normal text-[#2e9e5b]">Previous customer found</span>}
          </label>
          <label className={labelClass}>
            Customer name
            <input aria-label="Customer name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Rahim Uddin" className={fieldClass} />
          </label>
          <label className={labelClass}>
            Delivery address
            <textarea aria-label="Delivery address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="House 12, Road 5, Dhanmondi, Dhaka" rows={3} className={`${fieldClass} h-auto resize-none py-2 leading-relaxed`} />
          </label>

          {normalizeBdPhone(phone) && (
            <div className="rounded-[14px] bg-white p-3.5 ring-1 ring-inset ring-black/[0.06]">
              <FraudPanel phone={phone} defaultExpanded compact alignHeader="left" showReviews={false} />
            </div>
          )}
          {normalizedPhone && <LastOrdersCard history={history} loading={ordersQuery.isPending} />}
        </section>

        <section aria-label="Order cart" className="flex min-h-0 min-w-0 flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-black/[0.07] sm:p-5 xl:overflow-y-auto">
          <ProductPicker products={products} search={catalogSearch} loading={productsQuery.isPending} error={productsQuery.isError} canEdit={!creating} locked={false} onSearch={setCatalogSearch} onRetry={() => { void productsQuery.refetch(); }} onAdd={addCatalogItem} cartItems={lines} />
          <div ref={cartScrollRef} data-testid="new-order-items" className="min-h-[160px] min-w-0 flex-1 xl:overflow-y-auto xl:overscroll-contain">
            <OrderItemsTable
              items={lines}
              products={products}
              canEdit={!creating}
              saving={creating}
              onQuantity={setLineQty}
              onRemove={removeLine}
              onDiscount={updateLineDiscount}
              onChangeVariant={changeLineVariant}
              renderUnitPrice={(line) => {
                const lineName = line.product_name || "Product";
                const catalogPrice = catalogUnitPrice(line, products);
                const priceEdited = catalogPrice !== null && roundTaka(catalogPrice) !== roundTaka(line.unit_price);
                const unitDiscount = calculateUnitDiscount(line.unit_price, line.discount_type, line.discount_value);
                return (
                  <div className="flex flex-col gap-1">
                    <UnitPriceInput value={line.unit_price} label={`Unit price for ${lineName}`} disabled={creating} onCommit={(price) => updateLinePrice(line.id, price)} />
                    {priceEdited ? (
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="font-mono tabular-nums text-amber-700">Catalog {formatTaka(catalogPrice)}</span>
                        <button type="button" aria-label={`Reset ${lineName} to catalog price`} onClick={() => updateLinePrice(line.id, roundTaka(catalogPrice))} disabled={creating} className="inline-flex items-center gap-0.5 rounded px-1 text-black/55 hover:bg-black/[0.05] hover:text-black disabled:opacity-40"><ArrowCounterClockwise weight="light" size={11} />Reset</button>
                      </div>
                    ) : <span className="text-[10px] text-black/45">Tap to edit price</span>}
                    {unitDiscount > 0 && <span className="font-mono text-[10px] tabular-nums text-black/60">Net {formatTaka(line.unit_price - unitDiscount)} after discount</span>}
                  </div>
                );
              }}
            />
          </div>

          {/* Two rows: payment and settings on top, then Collect and Create side by side so they never drift apart. */}
          <div className="grid shrink-0 gap-x-5 gap-y-4 border-t border-black/[0.07] pt-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <OrderPaymentPanel items={lines} totals={totals} canEdit={!creating} overallDiscountType={overallType} overallDiscountValue={overallValue} onOverallDiscount={(type, value) => { setOverallType(type); setOverallValue(value); }} onRemoveOverallDiscount={() => { setOverallType(null); setOverallValue(0); }} deliveryOn={deliveryOn} onToggleDelivery={setDeliveryOn} advance={Math.min(advance, total)} onAdvanceChange={setAdvance} advanceMethod={advanceMethod} advanceReference={advanceReference} onAdvanceMethodChange={setAdvanceMethod} onAdvanceReferenceChange={setAdvanceReference} />
            <section aria-label="Order settings" className="grid min-w-0 content-start gap-3">
              <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Order settings</p>
              <label className={labelClass}>Order source<OrderSourceSelect value={source} onChange={setSource} disabled={creating} /></label>
              <label className={labelClass}>Telesales staff<StaffSelect value={assignedTo} onChange={setAssignedTo} disabled={creating} /></label>
              <label className={labelClass}>
                Payment method
                <Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger aria-label="Payment method" className="h-10 rounded-lg border-0 bg-white text-[13px] normal-case tracking-normal shadow-none ring-1 ring-inset ring-black/[0.08]"><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map((method) => <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>)}</SelectContent></Select>
              </label>
              <label className={labelClass}>
                Internal note
                <input aria-label="Internal note" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional, for the team" className={fieldClass} />
              </label>
            </section>
            <CollectOnDeliveryBar total={total} advance={Math.min(advance, total)} />
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" onClick={() => void createOrder()} disabled={creating} className="save-pill inline-flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[20px] bg-black px-[1.5em] py-[0.6em] text-[17px] text-white transition-[background-color,transform] duration-150 hover:bg-[#262626] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40">
                {creating ? <Spinner size="sm" /> : <Plus weight="light" size={17} />}{creating ? "Creating…" : "Create order"}
              </button>
              <button type="button" onClick={() => navigate(returnTo, { state: location.state?.profileNavigationState })} disabled={creating} className="shrink-0 whitespace-nowrap rounded-[20px] bg-black/[0.075] px-[1.3em] py-[0.6em] text-[17px] text-black transition-[background-color,transform] duration-150 hover:bg-black/[0.12] active:scale-[0.97] disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
