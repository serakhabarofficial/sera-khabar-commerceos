import { useState, type ComponentType, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Drawer as DrawerPrimitive } from "vaul";
import { toast } from "sonner";
import {
  ArrowUpRight, CalendarBlank, CaretDown, CreditCard, Hash, LinkSimple, MapPin, Package, Phone, Storefront, Tag, Truck, User, X,
  type IconProps,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { formatTaka } from "@/lib/orderEditor";
import { teamOrderStatusTone } from "@/lib/teamChat";

type OrderDetailResponse = {
  order: {
    id: string; order_number: string; customer_name: string | null; phone: string | null; address: string | null;
    price: number | null; status: string; courier_name: string | null; consignment_id: string | null; notes: string | null;
    payment_method: string | null; source: string | null; created_at: string;
  };
  items: { id?: string; product_name: string | null; variant_name?: string | null; quantity: number }[];
};

const iconButton = "inline-flex h-8 w-8 items-center justify-center rounded-lg text-black/55 transition-[background-color,color,transform] duration-150 ease-out hover:bg-black/[0.05] hover:text-black active:scale-[0.94]";

function Property({ icon: Icon, label, children }: { icon: ComponentType<IconProps>; label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-6 items-start gap-3">
      <dt className="flex w-28 shrink-0 items-center gap-2 pt-px text-black/45"><Icon weight="light" size={15} />{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}

const muted = (value: ReactNode) => <span className="text-black/40">{value}</span>;

// The mentioned order, in a drawer that slides in from the right and can be
// swiped or clicked away. Reuses the order detail API.
export function TeamOrderPanel({ orderId, open, onOpenChange }: { orderId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/orders", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const response = await apiFetch(`/api/orders/${orderId}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load the order");
      return body as OrderDetailResponse;
    },
  });
  const order = data?.order;

  const copyLink = async () => {
    if (!order) return;
    await navigator.clipboard.writeText(`${window.location.origin}/orders/${order.id}`).catch(() => undefined);
    toast.success("Order link copied");
  };

  return (
    <DrawerPrimitive.Root direction="right" open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20" />
        <DrawerPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-2 right-2 z-50 flex w-[400px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[18px] border border-black/[0.08] bg-[#FAFAF8] text-[13px] text-[#0b0b0a] shadow-[0_30px_80px_-30px_rgba(11,11,10,0.45)] outline-none"
        >
          <header className="flex items-center justify-between gap-3 border-b border-[#ecebe7] px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#F4EFE6]"><Package weight="light" size={13} /></span>
              <DrawerPrimitive.Title className="truncate text-[13px] font-medium">{order ? `#${order.order_number}` : "Order"}</DrawerPrimitive.Title>
            </div>
            <div className="flex items-center gap-0.5">
              <button type="button" className={iconButton} aria-label="Copy link" onClick={() => void copyLink()} disabled={!order}><LinkSimple weight="light" size={16} /></button>
              {order && <Link to={`/orders/${order.id}`} className={iconButton} aria-label="Open as page"><ArrowUpRight weight="light" size={16} /></Link>}
              <DrawerPrimitive.Close className={iconButton} aria-label="Close"><X weight="light" size={16} /></DrawerPrimitive.Close>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
            {isLoading && <p className="text-black/45">Loading order…</p>}
            {error && <p className="text-[#c2410c]">{error instanceof Error ? error.message : "Could not load the order"}</p>}
            {order && (
              <>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F4EFE6]"><Package weight="light" size={22} /></span>
                  <div className="min-w-0">
                    <h2 className="truncate text-2xl font-light">{formatTaka(order.price)}</h2>
                    <p className="truncate text-black/45">{order.customer_name || "No name"}</p>
                  </div>
                </div>

                <dl className="flex flex-col gap-3">
                  <Property icon={User} label="Customer">{order.customer_name || muted("Not given")}</Property>
                  <Property icon={Phone} label="Phone">{order.phone ? <a href={`tel:${order.phone}`} className="hover:underline">{order.phone}</a> : muted("Not given")}</Property>
                  <Property icon={MapPin} label="Address">{order.address || muted("Not given")}</Property>
                  <Property icon={Tag} label="Status">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", teamOrderStatusTone(order.status))}>{order.status.replace(/_/g, " ")}</span>
                  </Property>
                  <Property icon={Truck} label="Courier">{order.courier_name || muted("Not sent")}</Property>
                  {expanded && (
                    <>
                      <Property icon={Hash} label="Consignment">{order.consignment_id || muted("None")}</Property>
                      <Property icon={CreditCard} label="Payment">{order.payment_method || muted("Cash on delivery")}</Property>
                      <Property icon={Storefront} label="Source">{order.source ? <span className="capitalize">{order.source.replace(/_/g, " ")}</span> : muted("Unknown")}</Property>
                      <Property icon={CalendarBlank} label="Placed">{new Date(order.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</Property>
                    </>
                  )}
                </dl>
                <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}
                  className="-mt-3 flex w-fit items-center gap-1 rounded font-medium outline-none focus-visible:ring-2 focus-visible:ring-black/15">
                  {expanded ? "See less" : "See more"}
                  <CaretDown weight="light" size={14} className={cn("transition-transform duration-200 ease-out", expanded && "rotate-180")} />
                </button>

                <div className="h-px bg-[#ecebe7]" />

                <section className="flex flex-col gap-2">
                  <h3 className="text-black/45">Items</h3>
                  {data.items.length ? (
                    <ul className="flex flex-col gap-1.5">
                      {data.items.map((item, index) => (
                        <li key={item.id || index} className="flex justify-between gap-3">
                          <span className="min-w-0 truncate">{item.product_name || "Item"}{item.variant_name ? ` · ${item.variant_name}` : ""}</span>
                          <span className="shrink-0 tabular-nums text-black/45">×{item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  ) : muted("No items")}
                </section>
                <section className="flex flex-col gap-1.5">
                  <h3 className="text-black/45">Notes</h3>
                  <p className="whitespace-pre-wrap">{order.notes || muted("No notes")}</p>
                </section>
              </>
            )}
          </div>

          {order && (
            <div className="border-t border-[#ecebe7] p-3">
              <Link to={`/orders/${order.id}`}
                className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#0b0b0a] text-[12px] font-medium text-white transition-transform duration-150 ease-out active:scale-[0.97]">
                Open order <ArrowUpRight weight="light" size={14} />
              </Link>
            </div>
          )}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
