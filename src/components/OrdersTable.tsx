import { Fragment, useEffect, useRef, useState, type ComponentProps } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useProgressiveCount } from "@/hooks/useProgressiveCount";
import SteadfastLogo from "@/components/SteadfastLogo";
import PathaoLogo from "@/components/PathaoLogo";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PlasticButton } from "@/components/ui/plastic-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Chip } from "@/components/base/badges/chip";
import { toast, DarkToast } from "@/components/ui/sonner";
import { AlertTriangle, CheckCircle2, Clock3, ShieldCheck, Truck, Search, StickyNote, Package, Check, FileText, Trash2, Printer, ChevronDown, Copy, MapPin, ShoppingBag, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { classifyOrderStatus, canShowConsignmentCopy, followUpDetails } from "@/lib/orderStatusFilters";
import { formatProductLine } from "@/lib/orderItemDisplay";
import { formatTooltipProductLine } from "@/lib/orderItemDisplay";
import { canEnterPrint, courierSendBlockReason, displayStatusLabel, isOnHoldStatus, isPrintStatus, normalizeBusinessStatus } from "@/lib/orderTransitions";
import { holdDays } from "@/lib/orderHoldFilters";
import { ORDER_HOLD_REASONS } from "../../shared/orderHold.js";
import { useOrgName } from "@/hooks/useOrgName";
import { CANCELLATION_DIALOG_REASON_OPTIONS, createActivityGroupId, type CancellationReason } from "@/lib/orderActivity";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/ios-spinner";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { MagnifyingGlass, Warning } from "@phosphor-icons/react";
import { DELIVERY_TIER_STYLES, KNOWN_COURIER_LOGOS, courierLogoFor, courierRows, deliveryTier } from "@/lib/fraudRisk";
import { fraudLookupQuery, useFraudLookup } from "@/hooks/useFraudCheck";
import { PopButton } from "@/components/ui/pop-button";
import { Select as BuiSelect, SelectItem as BuiSelectItem } from "@/components/base/select/select";
import { useWarehouses } from "@/hooks/useWarehouses";
import { downloadOrderExcel } from "@/lib/orderExcelExport";
import { isAbandonedCheckoutOrder, normalizeOrderSource, orderSourceDisplayLabel, type OrderSource } from "@/lib/orderSource";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileOrderCards } from "@/components/MobileOrderCards";
import { SteadfastIssueNote, SteadfastSendBanner } from "@/components/orders/SteadfastSendBanner";
import {
  STEADFAST_CHECK_DELAY_MS,
  applySteadfastReply,
  checkSteadfastOrders,
  resendSteadfastRun,
  runSteadfastSend,
  startSteadfastRun,
  steadfastGroupIds,
  steadfastRowFailure,
  type SteadfastFailureCode,
  type SteadfastIssueGroup,
  type SteadfastRun,
  type SteadfastSendReply,
} from "@/lib/steadfastBulkSend";
import { OrderIdLink } from "@/components/orders/OrderIdLink";
import { OrderHoldDialog } from "@/components/orders/OrderHoldDialog";
import type { OrderHoldMetadata } from "@/components/orders/OrderHoldFields";
import { CopyButton } from "@/components/ui/copy-button";
import { CancellationReasonCell, CancelledAtCell } from "@/components/orders/CancellationReasonCell";

function copyTextValue(value: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).catch(() => {});
    return;
  }
  const area = document.createElement("textarea");
  area.value = value;
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
  } catch {
    // no-op: clipboard unavailable, still show feedback
  }
  document.body.removeChild(area);
}

/** Blue consignment pill — clicking anywhere on it (icon included) copies the ID. */
function ConsignmentIdButton({ id }: { id: string | number }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    copyTextValue(String(id));
    setCopied(true);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <PopButton
      color="sky"
      size="sm"
      onClick={handleClick}
      aria-label={copied ? `Consignment ${id} copied` : `Copy consignment ${id}`}
      title={String(id)}
      data-row-interactive="true"
      className="cursor-pointer gap-1.5 text-[10px] font-bold tracking-widest uppercase w-36 justify-center"
    >
      <span className="opacity-70">ID</span>
      <span className="font-mono tracking-tight normal-case text-[11px]">{id}</span>
      {copied
        ? <Check className="h-3 w-3 shrink-0" />
        : <Copy className="h-3 w-3 shrink-0 opacity-70" />}
    </PopButton>
  );
}

function splitProductLines(product: string | null): string[] {
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

function OrderStatusIcon({ status }: { status: string }) {
  if (status === "print") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M7.25 7H16.75V5C16.75 3 16 2 13.75 2H10.25C8 2 7.25 3 7.25 5V7Z" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 15V19C16 21 15 22 13 22H11C9 22 8 21 8 19V15H16Z" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 10V15C21 17 20 18 18 18H16V15H8V18H6C4 18 3 17 3 15V10C3 8 4 7 6 7H18C20 7 21 8 21 10Z" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 15H15.79H7" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 11H10" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "confirmed") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
        <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21.897 6.63c.32.898-.13 1.513-.998 2.118c-.702.488-1.595 1.017-2.542 1.922c-.928.887-1.834 1.955-2.639 3.006a39 39 0 0 0-2.71 3.99a1.65 1.65 0 0 1-1.446.834a1.66 1.66 0 0 1-1.426-.873c-.748-1.363-1.326-1.901-1.592-2.094c-.737-.537-1.544-.63-1.544-1.8C7 12.776 7.746 12 8.667 12c.658.027 1.262.309 1.789.693c.342.249.705.578 1.082 1.012c.442-.654.975-1.408 1.573-2.189c.868-1.133 1.892-2.35 2.99-3.399c1.08-1.032 2.33-1.998 3.653-2.508c.863-.333 1.822.124 2.143 1.022M4.44 12.076a2.7 2.7 0 0 0-.6-.125l-.141-.006c-.938 0-1.699.783-1.699 1.748c0 .874.623 1.598 1.437 1.728q.042.02.137.087c.27.195.86.737 1.623 2.111c.298.538.851.873 1.453.88a1.67 1.67 0 0 0 1.112-.407M15 5.5c-1.35.515-2.622 1.489-3.723 2.53c-.384.363-.76.746-1.123 1.139" color="currentColor"/>
      </svg>
    );
  }
  if (status === "cancelled") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" opacity=".2" fill="currentColor" stroke="none"/>
        <path d="M15 9l-6 6M9 9l6 6"/>
      </svg>
    );
  }
  // pending
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><g fill="currentColor"><path d="M18.75 11a7 7 0 1 1-14 0a7 7 0 0 1 14 0Z" opacity=".2"/><path fillRule="evenodd" d="M10 16a6 6 0 1 0 0-12a6 6 0 0 0 0 12Zm0 1a7 7 0 1 0 0-14a7 7 0 0 0 0 14Z" clipRule="evenodd"/><path fillRule="evenodd" d="M10 6.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5Z" clipRule="evenodd"/><path fillRule="evenodd" d="M13.5 10a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1h3a.5.5 0 0 1 .5.5Z" clipRule="evenodd"/></g></svg>
  );
}

function orderStatusClasses(status: string, selected = false) {
  if (status === "confirmed") {
    return selected
      ? "border-emerald-200 bg-emerald-100 text-emerald-700"
      : "border-emerald-200/80 bg-emerald-50 text-emerald-700 shadow-emerald-950/5 hover:border-emerald-300 hover:bg-emerald-100";
  }
  if (status === "cancelled") {
    return selected
      ? "border-red-200 bg-red-100 text-red-600"
      : "border-red-200/80 bg-red-50 text-red-600 shadow-red-950/5 hover:border-red-300 hover:bg-red-100";
  }
  return selected
    ? "border-amber-200 bg-amber-100 text-amber-700"
    : "border-amber-200/80 bg-amber-50 text-amber-700 shadow-amber-950/5 hover:border-amber-300 hover:bg-amber-100";
}

function displayVariant(value: string | null) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") return Object.values(parsed).filter(Boolean).join(" · ");
  } catch {
    // Legacy order items may already contain a display value.
  }
  return value;
}

function productSummary(order: Order): { primary: string; moreCount: number; lines: string[]; names: string[] } {
  if (order.items?.length) {
    const lines = order.items.map((item) => {
      const variant = displayVariant(item.variant_name);
      return `${item.product_name || "Legacy item"}${variant ? ` · ${variant}` : ""} · ×${item.quantity}`;
    });
    return { primary: lines[0], moreCount: Math.max(0, lines.length - 1), lines, names: order.items.map((item) => item.product_name || "Legacy item") };
  }
  const lines = splitProductLines(order.product);
  if (lines.length === 0) {
    return { primary: "—", moreCount: 0, lines: [], names: [] };
  }

  // Legacy single-item rows used to store quantity separately; keep that behavior.
  const primary =
    lines.length === 1
      ? formatProductLine(lines[0], order.quantity)
      : formatProductLine(lines[0], undefined);

  return { primary, moreCount: Math.max(0, lines.length - 1), lines, names: lines.map((line) => line.replace(/^\d+\s*(x|×)\s+/i, "")) };
}

interface FraudData {
  mobile_number: string;
  total_parcels: number;
  total_delivered: number;
  total_cancel: number;
  apis?: Record<string, {
    total_parcels: number;
    total_delivered_parcels: number;
    total_cancelled_parcels: number;
  }>;
}

const ORDER_SOURCE_CHIP_COLORS: Partial<Record<OrderSource, ComponentProps<typeof Chip>["color"]>> = {
  facebook: "blue",
  telesales: "green",
  website: "orange",
  whatsapp: "green",
  upsell: "purple",
};

export interface Order {
  id: string;
  shopify_order_id: number;
  order_number: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  product: string | null;
  quantity: number | null;
  price: number | null;
  status: string;
  created_at: string;
  fraud_checked: boolean | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fraud_data: FraudData | any | null;
  delivery_rate: number | null;
  advanced_payment?: number | null;
  warehouse_id?: string | null;
  warehouse_auto?: boolean | null;
  weight_kg?: number | null;
  sent_to_courier?: boolean | null;
  courier_status?: string | null;
  courier_name?: string | null;
  consignment_id?: number | null;
  tracking_code?: string | null;
  courier_message?: string | null;
  notes?: string | null;
  hold_reason_code?: string | null;
  hold_reason_detail?: string | null;
  hold_until_date?: string | null;
  hold_started_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason_code?: string | null;
  cancellation_reason_note?: string | null;
  fulfillment_status?: string | null;
  landing_page_path?: string | null;
  source?: string | null;
  origin_source?: string | null;
  items?: OrderItemSummary[];
}

interface OrderItemSummary {
  product_name: string | null;
  variant_name: string | null;
  quantity: number;
}

interface OrdersTableProps {
  orders: Order[];
  selectionOrders?: Order[];
  loading: boolean;
  onStatusUpdate: (orderId: string, newStatus: string) => void;
  onOrderUpdate?: (updatedOrder: Order) => void;
  isPrintView?: boolean;
  showRiskColumn?: boolean;
  /** Cancelled tab: show the reason and cancel time in place of warehouse, shipping, state and fulfillment. */
  showCancellationReason?: boolean;
  /** Hold tab: show each held order's reason and days on hold under its status. */
  showHoldDetails?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  orderLinkState?: Record<string, unknown>;
  enableOrderIdLinks?: boolean;
}

// Logos the browser already holds paint at full opacity on the first frame.
const loadedLogos = new Set<string>();
function rememberLogo(src: string) {
  const img = new Image();
  img.onload = () => loadedLogos.add(src);
  img.src = src;
}

// Downloads every courier logo once, the first time a risk pill renders,
// so the first hover card already has them.
let courierLogosWarmed = false;
function warmCourierLogos() {
  if (courierLogosWarmed) return;
  courierLogosWarmed = true;
  KNOWN_COURIER_LOGOS.forEach(rememberLogo);
}

// The slot is always the same size so names never swap for logos mid-hover;
// a logo that is still downloading fades in once it arrives.
function CourierLogo({ src, name }: { src: string | null; name: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">(() => (src && loadedLogos.has(src) ? "loaded" : "loading"));
  if (!src || status === "failed") return <span className="capitalize text-black">{name}</span>;
  return (
    <span className="relative h-5 w-[64px]">
      <img
        src={src}
        alt={name}
        title={name}
        referrerPolicy="no-referrer"
        onLoad={() => { loadedLogos.add(src); setStatus("loaded"); }}
        onError={() => setStatus("failed")}
        className={cn(
          "absolute inset-0 h-full w-full object-contain object-left mix-blend-multiply transition-opacity duration-150 ease-out",
          status === "loaded" ? "opacity-100" : "opacity-0",
        )}
      />
    </span>
  );
}

// Mounts only while the hover card is open. Rows show straight away from the
// order's saved result; the cache-only lookup refreshes them when it lands
// without spending a FraudShield request.
function CourierBreakdown({ phone, fallback }: { phone: string | null; fallback: { name: string; delivered: number; total: number }[] }) {
  const lookup = useFraudLookup(phone);
  const fromCache = courierRows((lookup.data?.payload ?? null) as Parameters<typeof courierRows>[0]).filter((row) => row.total > 0);
  const rows = fromCache.length > 0
    ? fromCache.map((row) => ({ name: row.name, logo: row.logo, delivered: row.success, total: row.total }))
    : fallback.map((row) => ({ ...row, logo: courierLogoFor(row.name) }));

  return (
    <div className="space-y-1.5 border-t border-black/[0.06] pt-2.5 text-xs">
      {rows.map((row) => (
        <div key={row.name} className="flex h-5 items-center justify-between">
          <CourierLogo src={row.logo} name={row.name} />
          <span className="tabular-nums text-black/60">{row.delivered}/{row.total} · {Math.round((row.delivered / row.total) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

// Starts the lookup and logo downloads as soon as the pointer reaches the pill,
// so they are usually ready by the time the hover card opens.
function usePrefetchCourierLogos(phone: string | null) {
  const queryClient = useQueryClient();
  return () => {
    const query = fraudLookupQuery(phone);
    if (!query.enabled) return;
    queryClient.fetchQuery(query).then((data) => {
      for (const row of courierRows((data?.payload ?? null) as Parameters<typeof courierRows>[0])) {
        if (row.logo && !loadedLogos.has(row.logo)) rememberLogo(row.logo);
      }
    }).catch(() => {});
  };
}

function FraudCell({ order, isChecking, onCheck }: {
  order: Order;
  isChecking: boolean;
  onCheck: () => void;
}) {
  const prefetchLogos = usePrefetchCourierLogos(order.phone);
  useEffect(warmCourierLogos, []);
  const rawFraudData = order.fraud_data as (Record<string, unknown> & { _error?: string }) | null;
  const hasError = Boolean(order.fraud_checked && (!rawFraudData || rawFraudData._error));

  if (isChecking) {
    return <span className="inline-flex h-7 items-center"><Spinner className="text-muted-foreground/40" /></span>;
  }

  if (!order.fraud_checked || hasError) {
    return (
      <HoverCard openDelay={150} closeDelay={80}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            onClick={onCheck}
            className={cn(
              "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border border-dashed bg-white px-2 text-[11px] font-medium transition-[transform,background-color] duration-150 ease-out active:scale-[0.97]",
              hasError ? "border-red-200 text-red-700 hover:bg-red-50" : "border-black/15 text-black/50 hover:bg-black/[0.03]",
            )}
            data-testid={`button-fraud-check-${order.id}`}
          >
            {hasError ? <Warning weight="light" size={12} /> : <MagnifyingGlass weight="light" size={12} />}
            {hasError ? "Retry" : "Check"}
          </button>
        </HoverCardTrigger>
        {hasError && (
          <HoverCardPrimitive.Portal>
            <HoverCardContent side="bottom" align="start" className="w-64 space-y-2 rounded-xl p-4 duration-150 origin-[--radix-hover-card-content-transform-origin]">
              <p className="text-[8px] font-medium tracking-[0.3em] text-black uppercase">FraudShield Error</p>
              <p className="text-xs text-muted-foreground break-words">
                {rawFraudData?._error ?? "API couldn't be reached. Check your key in Settings → API Configuration."}
              </p>
            </HoverCardContent>
          </HoverCardPrimitive.Portal>
        )}
      </HoverCard>
    );
  }

  const fd = rawFraudData as { total_parcels?: number; total_delivered?: number; total_cancel?: number; apis?: Record<string, { total_parcels?: number; total_delivered_parcels?: number }> };
  const totalParcels = fd.total_parcels ?? 0;
  const totalDelivered = fd.total_delivered ?? 0;
  const totalCancel = fd.total_cancel ?? 0;
  const rate = totalParcels > 0 ? (totalDelivered / totalParcels) * 100 : null;
  const tier = deliveryTier(rate);
  const style = DELIVERY_TIER_STYLES[tier];
  const couriers = Object.entries(fd.apis ?? {}).filter(([, c]) => (c.total_parcels ?? 0) > 0);

  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span
          tabIndex={0}
          onPointerEnter={prefetchLogos}
          onFocus={prefetchLogos}
          className={cn(
            "inline-flex h-7 cursor-default items-center gap-1.5 whitespace-nowrap rounded-full border pl-2 pr-2.5 text-xs font-semibold tabular-nums outline-none transition-shadow duration-150 ease-out hover:ring-[3px] hover:ring-black/[0.04] focus-visible:ring-[3px] focus-visible:ring-black/10",
            style.bg, style.border, style.text,
          )}
          aria-label={`${style.label}${rate === null ? "" : `, ${Math.round(rate)}% delivered`}`}
          data-testid={`button-fraud-check-${order.id}`}
        >
          {tier === "poor" ? <Warning weight="fill" size={11} /> : <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />}
          {rate === null ? "New" : `${Math.round(rate)}%`}
        </span>
      </HoverCardTrigger>
      <HoverCardPrimitive.Portal>
        <HoverCardContent
          side="bottom"
          align="start"
          className="w-[268px] overflow-hidden rounded-[14px] border-black/[0.08] bg-white p-0 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18),0_2px_6px_rgba(0,0,0,0.05)] duration-150 origin-[--radix-hover-card-content-transform-origin]"
        >
          <div className={cn("border-b px-4 pb-3 pt-3.5", style.bg, style.border)}>
            <p className={cn("flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.28em]", style.text)}>
              {tier === "poor" && <Warning weight="fill" size={10} />}
              {style.label} · {style.range}
            </p>
            <p className="mt-1 text-3xl font-light tracking-tight text-black tabular-nums">
              {rate === null ? "—" : `${Math.round(rate)}%`}
              <span className="ml-1.5 text-xs font-normal tracking-normal text-black/50">
                {rate === null ? "no past parcels" : "delivery success"}
              </span>
            </p>
          </div>
          <div className="space-y-3 px-4 pb-3.5 pt-3">
            {rate === null ? (
              <p className="text-[11px] leading-relaxed text-black/50">
                This phone number has no delivery history with any courier. Treat as unknown, not risky.
              </p>
            ) : (
              <>
                <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
                  <div className={cn("h-full rounded-full", style.dot)} style={{ width: `${rate}%` }} />
                  <div className="h-full flex-1 rounded-full bg-black/[0.08]" />
                </div>
                <div className="grid grid-cols-3">
                  {[
                    { label: "Total", value: totalParcels, className: "text-black" },
                    { label: "Delivered", value: totalDelivered, className: "text-emerald-700" },
                    { label: "Returned", value: totalCancel, className: "text-red-700" },
                  ].map((stat) => (
                    <div key={stat.label} className="flex flex-col items-center gap-0.5 text-center">
                      <span className={cn("text-lg font-light tabular-nums", stat.className)}>{stat.value}</span>
                      <span className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">{stat.label}</span>
                    </div>
                  ))}
                </div>
                {couriers.length > 0 && (
                  <CourierBreakdown
                    phone={order.phone}
                    fallback={couriers.map(([name, c]) => ({ name, delivered: c.total_delivered_parcels ?? 0, total: c.total_parcels ?? 0 }))}
                  />
                )}
              </>
            )}
          </div>
        </HoverCardContent>
      </HoverCardPrimitive.Portal>
    </HoverCard>
  );
}

function EditableTotalCell({ order, onOrderUpdate }: { order: Order; onOrderUpdate?: (updatedOrder: Order) => void }) {
  const [editing, setEditing] = useState(false);
  const advance = Math.max(0, Number(order.advanced_payment) || 0);
  const total = Math.max(0, (order.price || 0) + (order.delivery_rate || 0) - advance);
  const [saving, setSaving] = useState(false);

  const handleBlur = async (e: React.FocusEvent<HTMLSpanElement>) => {
    setEditing(false);
    const raw = e.currentTarget.textContent?.replace(/[^0-9.]/g, "") || "0";
    const newTotal = parseFloat(raw) || 0;
    if (newTotal === total) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: newTotal + advance - (order.delivery_rate || 0) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update total");
      if (onOrderUpdate) onOrderUpdate(data.order || { ...order, price: newTotal + advance - (order.delivery_rate || 0) });
      toast.success("Total updated");
    } catch {
      toast.error("Failed to update total");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
    if (e.key === "Escape") { e.currentTarget.textContent = `৳${total.toLocaleString()}`; setEditing(false); e.currentTarget.blur(); }
  };

  return (
    <span className={cn("font-medium text-sm tabular-nums inline-flex flex-col items-center gap-0.5", saving && "opacity-50 pointer-events-none")}>
      <span className="inline-flex items-center gap-0">
        <span className="select-none">৳</span>
        <span
          contentEditable
          suppressContentEditableWarning
          onFocus={() => setEditing(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={cn(
            "outline-none cursor-text transition-all",
            editing ? "underline underline-offset-4 decoration-black/30" : "hover:underline hover:underline-offset-4 hover:decoration-black/20"
          )}
        >
          {total.toLocaleString()}
        </span>
      </span>
      {advance > 0 && <Chip variant="caption" color="lime" className="font-mono tabular-nums">adv ৳{advance.toLocaleString()}</Chip>}
    </span>
  );
}

function NotesPopover({ order, onOrderUpdate }: { order: Order; onOrderUpdate?: (updatedOrder: Order) => void }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(order.notes || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to save notes");

      if (onOrderUpdate) {
        onOrderUpdate(data.order || { ...order, notes });
      }
      setOpen(false);
      toast.success("Notes saved");
    } catch (error) {
      console.error("Error saving notes:", error);
      toast.error("Failed to save notes");
    } finally {
      setSaving(false);
    }
  };

  const hasNotes = order.notes && order.notes.trim().length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              aria-label="Order notes"
              className={cn(
                "group relative flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-200",
                hasNotes
                  ? "border-violet-200 bg-violet-50 text-violet-700 shadow-sm shadow-violet-950/5 hover:border-violet-300 hover:bg-violet-100"
                  : "border-black/5 bg-black/[0.035] text-muted-foreground/55 hover:border-black/10 hover:bg-black/[0.06] hover:text-foreground"
              )}
            >
              <StickyNote className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-rotate-3 group-hover:scale-110" strokeWidth={1.8} />
              {hasNotes && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-violet-500 ring-2 ring-[#ffffff]">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        {!open && hasNotes && (
          <TooltipContent side="top" className="max-w-[200px] text-sm">
            {order.notes}
          </TooltipContent>
        )}
      </Tooltip>
      <PopoverContent className="w-80 rounded-2xl border border-black/10 bg-white/95 p-0 shadow-2xl shadow-black/10 backdrop-blur-xl" align="end">
        <div className="border-b border-black/10 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <StickyNote className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Order Notes</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Private context for this order</p>
            </div>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add a follow-up, customer preference, delivery detail..."
            className="min-h-[128px] resize-none rounded-xl border-0 bg-black/[0.055] text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-violet-300"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <img src="https://img.icons8.com/material-rounded/24/bard--v2.png" alt="" className="h-3 w-3 object-contain" />
              {notes.trim().length} chars
            </div>
            <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="rounded-xl bg-black px-4 text-white hover:bg-black/85">
              {saving ? <Spinner size="sm" /> : "Save"}
            </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function OrdersTable({ orders, selectionOrders, loading, onStatusUpdate, onOrderUpdate, isPrintView = false, showRiskColumn = true, showCancellationReason = false, showHoldDetails = false, selectedIds: controlledSelectedIds, onSelectionChange, orderLinkState, enableOrderIdLinks = false }: OrdersTableProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const prefetchOrder = (orderId: string) => queryClient.prefetchQuery({
    queryKey: [`/api/orders/${orderId}`],
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiFetch(`/api/orders/${orderId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to load order");
      return json;
    },
  });
  const { orgName } = useOrgName();
  const { warehouses } = useWarehouses();
  // A 100-row page renders its first rows at once and the rest after the page's
  // entrance, so opening Orders doesn't freeze; print renders everything.
  const [steadfastRun, setSteadfastRun] = useState<SteadfastRun | null>(null);
  const [steadfastFilter, setSteadfastFilter] = useState<SteadfastIssueGroup | null>(null);
  const steadfastCheckTimer = useRef<number | null>(null);
  const showSteadfastBanner = isPrintView && steadfastRun !== null;
  const activeSteadfastFilter = showSteadfastBanner ? steadfastFilter : null;
  const bulkSelectionOrders = selectionOrders ?? orders;
  // A reason chip shows that run's orders wherever they are now, even if they left the Print tab.
  const displayOrders = steadfastRun && activeSteadfastFilter
    ? ((ids) => bulkSelectionOrders.filter((order) => ids.has(order.id)))(steadfastGroupIds(steadfastRun, activeSteadfastFilter))
    : orders;
  const renderedRowCount = useProgressiveCount(displayOrders.length, { enabled: !isPrintView });
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [sendingPathaoIds, setSendingPathaoIds] = useState<Set<string>>(new Set());
  const [checkingFraudIds, setCheckingFraudIds] = useState<Set<string>>(new Set());
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());
  const selectedIds = controlledSelectedIds ?? internalSelectedIds;
  const setSelectedIds = (next: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    const resolved = typeof next === "function" ? (next as (prev: Set<string>) => Set<string>)(selectedIds) : next;
    if (onSelectionChange) onSelectionChange(resolved);
    else setInternalSelectedIds(resolved);
  };
  // A bulk send runs across several awaits; read the selection as it is now, not as it was.
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const [isBulkChecking, setIsBulkChecking] = useState(false);
  const isBulkSendingSteadfast = steadfastRun?.phase === "sending";
  const [isDeletingOrders, setIsDeletingOrders] = useState(false);
  const [cancellationTarget, setCancellationTarget] = useState<Order | null>(null);
  const [cancellationDialogContainer, setCancellationDialogContainer] = useState<HTMLDivElement | null>(null);
  const [cancellationReasonCode, setCancellationReasonCode] = useState<CancellationReason | "">("");
  const [cancellationReasonNote, setCancellationReasonNote] = useState("");
  const [holdTarget, setHoldTarget] = useState<Order | null>(null);
  const warehouseNames = Object.fromEntries(warehouses.map((warehouse) => [warehouse.id, warehouse.name]));

  const handleWarehouseChange = async (order: Order, warehouseId: string) => {
    const res = await apiFetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ warehouse_id: warehouseId }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error || "Failed to change warehouse");
    onOrderUpdate?.(data.order || { ...order, warehouse_id: warehouseId, warehouse_auto: false });
    toast.success("Warehouse updated");
  };

  // Build phone frequency map to detect repeat customers
  const phoneOrderCount = new Map<string, number>();
  orders.forEach((order) => {
    if (order.phone) {
      const phone = order.phone.trim();
      phoneOrderCount.set(phone, (phoneOrderCount.get(phone) || 0) + 1);
    }
  });

  const handleStatusChange = async (
    order: Order,
    newStatus: string,
    cancellation?: { code: CancellationReason; note: string },
    holdDetails?: OrderHoldMetadata,
  ): Promise<boolean> => {
    if (order.status === newStatus) return true;
    if (isOnHoldStatus(newStatus) && !holdDetails) {
      setHoldTarget(order);
      return false;
    }
    if (newStatus === "cancelled" && !cancellation) {
      setCancellationTarget(order);
      setCancellationReasonCode("");
      setCancellationReasonNote("");
      return false;
    }

    // Optimistic update - update UI immediately
    onStatusUpdate(order.id, newStatus);

    try {
      const res = await apiFetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          activity_group_id: createActivityGroupId(),
          ...(cancellation ? {
            cancellation_reason_code: cancellation.code,
            cancellation_reason_note: cancellation.note.trim() || null,
          } : {}),
          ...(holdDetails || {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Revert on failure
        onStatusUpdate(order.id, order.status);
        throw new Error(data.error || "Failed to update status");
      }

      if (data?.order && onOrderUpdate) {
        onOrderUpdate(data.order);
      }
      if (newStatus === "cancelled") setCancellationTarget(null);
      return true;
    } catch (error) {
      console.error("Error updating order status:", error);
      console.error("Error updating order status:", error);
      const message = error instanceof Error ? error.message : "Could not save status";
      toast.custom((t) => (
        <DarkToast className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Update Failed</span>
            <span className="text-sm font-bold text-white">{message}</span>
          </div>
        </DarkToast>
      ), { fit: true });
      return false;
    }
  };

  const handleSendToCourier = async (order: Order) => {
    setSendingIds((prev) => new Set(prev).add(order.id));

    try {
      const res = await apiFetch("/api/send-to-courier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        // An order found at Steadfast (409) or not confirmed (503) comes back with its saved reason.
        if (data?.order && onOrderUpdate) onOrderUpdate(data.order);
        throw new Error(data.error || "Failed to send to courier");
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (data?.order && onOrderUpdate) {
        onOrderUpdate(data.order);
      }
      toast.custom((t) => (
        <DarkToast className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-black flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Courier Dispatched</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-white">Order {order.order_number}</span>
              <span className="text-xs text-white/60 font-medium">Sent to Steadfast</span>
            </div>
          </div>
        </DarkToast>
      ), { fit: true });
    } catch (error) {
      console.error("Error sending to courier:", error);
      const errMsg = error?.message || "Failed to send order";
      toast.custom((t) => (
        <DarkToast className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Courier Error</span>
            <span className="text-sm font-bold text-white">{errMsg}</span>
          </div>
        </DarkToast>
      ), { fit: true });
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  const handleSendToPathao = async (order: Order) => {
    setSendingPathaoIds((prev) => new Set(prev).add(order.id));

    try {
      const res = await apiFetch("/api/send-to-pathao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to send to Pathao");

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (data?.order && onOrderUpdate) {
        onOrderUpdate(data.order);
      }
      toast.custom((t) => (
        <DarkToast className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-[#D82128]/15 flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5 text-[#D82128]" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Courier Dispatched</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-white">Order {order.order_number}</span>
              <span className="text-xs text-white/60 font-medium">Sent to Pathao</span>
            </div>
          </div>
        </DarkToast>
      ), { fit: true });
    } catch (error) {
      console.error("Error sending to Pathao:", error);
      const errMsg = error?.message || "Failed to send order";
      toast.custom((t) => (
        <DarkToast className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Pathao Error</span>
            <span className="text-sm font-bold text-white">{errMsg}</span>
          </div>
        </DarkToast>
      ), { fit: true });
    } finally {
      setSendingPathaoIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  const handleCheckFraud = async (order: Order) => {
    setCheckingFraudIds((prev) => new Set(prev).add(order.id));

    try {
      const res = await apiFetch("/api/check-fraud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await res.json();

      if (!res.ok && !data?.order) {
        throw new Error(data.error || "Fraud check failed");
      }

      if (data?.error && !data?.order) {
        toast.error(data.error);
        return;
      }

      if (data?.order && onOrderUpdate) {
        onOrderUpdate(data.order);
      }

      if (data?.fraudError) {
        // Show the real error from the API so the user can diagnose it
        toast.custom(() => (
          <DarkToast className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-red-500/15 border border-red-400/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white">Fraud check failed</p>
              <p className="text-[11px] text-white/50 mt-0.5 break-words leading-snug">{data.fraudError}</p>
            </div>
          </DarkToast>
        ), { duration: 10000, fit: true });
        return;
      }

      toast.custom(() => (
        <DarkToast className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-400/20 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-white">Order #{order.order_number} verified</p>
            <p className="text-[11px] text-white/50 mt-0.5">Fraud analysis complete</p>
          </div>
        </DarkToast>
      ), { fit: true });
    } catch (error) {
      console.error("Error checking fraud:", error);
      toast.custom(() => (
        <DarkToast className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-red-500/15 border border-red-400/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-white">Fraud check failed</p>
            <p className="text-[11px] text-white/50 mt-0.5">Could not verify order</p>
          </div>
        </DarkToast>
      ), { fit: true });
    } finally {
      setCheckingFraudIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  const handleBulkFraudCheck = async () => {
    if (selectedIds.size === 0 || isBulkChecking) return;

    setIsBulkChecking(true);
    const ids = Array.from(selectedIds);
    let successCount = 0;
    let skippedCount = 0;

    try {
      for (const id of ids) {
        setCheckingFraudIds(prev => new Set(prev).add(id));
        try {
          const res = await apiFetch("/api/check-fraud", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Cache-aware: only genuinely new or stale numbers spend a request.
            body: JSON.stringify({ orderId: id, force: false }),
          });
          const data = await res.json();

          if (res.ok && !data?.error && data?.order && onOrderUpdate) {
            onOrderUpdate(data.order);
            if (data?.spentRequest === false) skippedCount++;
            else successCount++;
          }
        } catch (err) {
          console.error(`Fraud check failed for order ${id}:`, err);
        } finally {
          setCheckingFraudIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      }

      if (successCount > 0 || skippedCount > 0) {
        toast.custom(() => (
          <DarkToast className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-400/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white">{successCount > 0 ? `${successCount} orders verified` : "Already up to date"}</p>
              <p className="text-[11px] text-white/50 mt-0.5">{skippedCount > 0 ? `${skippedCount} reused from cache · no credits spent` : "Bulk fraud analysis complete"}</p>
            </div>
          </DarkToast>
        ), { fit: true });
      }
      setSelectedIds(new Set());
    } finally {
      setIsBulkChecking(false);
    }
  };

  const selectedPrintOrders = bulkSelectionOrders.filter(
    (order) => selectedIds.has(order.id) && isPrintStatus(order.status) && !order.sent_to_courier,
  );

  useEffect(() => () => {
    if (steadfastCheckTimer.current !== null) window.clearTimeout(steadfastCheckTimer.current);
  }, []);

  const applySteadfastRows = (reply: SteadfastSendReply<Order>) => {
    if (!onOrderUpdate) return;
    for (const row of [...reply.succeeded, ...reply.failures]) {
      if (row.order) onOrderUpdate(row.order);
    }
  };

  const checkSteadfastRun = async (orderIds: string[]) => {
    if (orderIds.length === 0) return;
    setSteadfastRun((previous) => previous && { ...previous, checking: true });
    try {
      const reply = await checkSteadfastOrders<Order>(orderIds);
      applySteadfastRows(reply);
      setSteadfastRun((previous) => previous && { ...applySteadfastReply(previous, reply), checking: false });
    } catch (error) {
      setSteadfastRun((previous) => previous && { ...previous, checking: false });
      toast.error(error instanceof Error ? error.message : "Couldn't check with Steadfast");
    }
  };

  // One pass sends `orderIds` in batches and folds each answer into the run as it lands.
  const runSteadfastPass = async (orderIds: string[], begin: (previous: SteadfastRun | null) => SteadfastRun) => {
    if (steadfastCheckTimer.current !== null) window.clearTimeout(steadfastCheckTimer.current);
    steadfastCheckTimer.current = null;
    setSteadfastRun(begin);

    const sentIds = new Set<string>();
    const codes = new Map<string, SteadfastFailureCode>();
    const { stoppedReason } = await runSteadfastSend<Order>(orderIds, {
      onBatch: ({ done, reply }) => {
        applySteadfastRows(reply);
        for (const row of reply.succeeded) sentIds.add(row.orderId);
        for (const row of reply.failures) codes.set(row.orderId, row.code);
        setSteadfastRun((previous) => previous && {
          ...applySteadfastReply(previous, reply),
          progress: { done, total: orderIds.length },
        });
      },
    });
    setSteadfastRun((previous) => previous && { ...previous, phase: "done", stoppedReason });
    setSelectedIds(new Set([...selectedIdsRef.current].filter((id) => !sentIds.has(id))));

    const checkingIds = orderIds.filter((id) => codes.get(id) === "checking");
    if (checkingIds.length > 0) {
      steadfastCheckTimer.current = window.setTimeout(() => {
        steadfastCheckTimer.current = null;
        void checkSteadfastRun(checkingIds);
      }, STEADFAST_CHECK_DELAY_MS);
    }
  };

  const handleBulkSendToSteadfast = async () => {
    if (selectedPrintOrders.length === 0 || isBulkSendingSteadfast) return;
    const orderIds = selectedPrintOrders.map((order) => order.id);
    setSteadfastFilter(null);
    await runSteadfastPass(orderIds, () => startSteadfastRun(orderIds.length));
  };

  const handleSteadfastRetry = (orderIds: string[]) => {
    if (orderIds.length === 0 || isBulkSendingSteadfast) return;
    setSteadfastFilter(null);
    void runSteadfastPass(orderIds, (previous) => (previous ? resendSteadfastRun(previous, orderIds.length) : startSteadfastRun(orderIds.length)));
  };

  const handleSteadfastFix = async (order: Order, kind: "phone" | "address", value: string) => {
    try {
      const response = await apiFetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [kind]: value, courier_message: null }),
      });
      const data = await response.json().catch(() => ({})) as { order?: Order; error?: string };
      if (!response.ok) return data.error || "Couldn't save. Try again.";
      if (data.order && onOrderUpdate) onOrderUpdate(data.order);
      setSteadfastRun((previous) => previous && (previous.fixedIds.includes(order.id) ? previous : { ...previous, fixedIds: [...previous.fixedIds, order.id] }));
      return null;
    } catch {
      return "Couldn't save. Check your connection.";
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayOrders.length && displayOrders.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayOrders.map(o => o.id)));
    }
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleGenerateInvoice = async () => {
    const selectedOrders = orders.filter((o) => selectedIds.has(o.id));
    if (selectedOrders.length === 0) return;

    try {
      const { printInvoice } = await import("@/utils/invoiceGenerator");
      printInvoice(selectedOrders, orgName);
      void apiFetch("/api/order-activity/print", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_table: "orders", order_ids: selectedOrders.map((order) => order.id), document_type: "invoice" }) }).catch(() => {});
    } catch (error) {
      console.error("Invoice printing failed:", error);
      toast.error("Failed to prepare invoices for printing");
    }
  };

  const handlePrintInvoice = async () => {
    const selectedOrders = orders.filter((o) => selectedIds.has(o.id));
    if (selectedOrders.length === 0) return;
    try {
      const { printShippingLabels } = await import("@/utils/shippingLabelPrinter");
      const result = printShippingLabels(selectedOrders, orgName);
      if (result.ok === false) {
        toast.error(
          `Send ${result.missingOrderNumbers.join(", ")} to Steadfast before printing the label`,
        );
      } else void apiFetch("/api/order-activity/print", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_table: "orders", order_ids: selectedOrders.map((order) => order.id), document_type: "shipping_label" }) }).catch(() => {});
    } catch (error) {
      console.error("Print failed:", error);
      toast.error("Failed to print shipping labels");
    }
  };

  const handleDeleteOrders = async () => {
    if (selectedIds.size === 0 || isDeletingOrders) return;

    setIsDeletingOrders(true);
    const idsToDelete = Array.from(selectedIds);

    try {
      const res = await apiFetch("/api/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToDelete }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to delete orders");

      toast.custom((t) => (
        <DarkToast className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Deleted</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-white">{idsToDelete.length} Orders</span>
              {data.deleted !== idsToDelete.length && (
                <span className="text-xs text-white/60 font-medium">{data.deleted} deleted</span>
              )}
              <span className="text-xs text-white/60 font-medium">Removed from Dashboard</span>
            </div>
          </div>
        </DarkToast>
      ), { fit: true });

      // Clear selection
      setSelectedIds(new Set());

      // Force a page reload to refresh the orders list
      window.location.reload();
    } catch (error) {
      console.error("Error deleting orders:", error);
      toast.custom((t) => (
        <DarkToast className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Delete Failed</span>
            <span className="text-sm font-bold text-white">Could not delete orders</span>
          </div>
        </DarkToast>
      ), { fit: true });
    } finally {
      setIsDeletingOrders(false);
    }
  };

  const formatPrice = (price: number | null) => {
    if (price === null) return "-";
    return new Intl.NumberFormat("en-BD", {
      style: "currency",
      currency: "BDT",
    }).format(price);
  };

  const getCourierStatusBadge = (order: Order) => {
    if (!order.sent_to_courier) return null;

    const status = (order.courier_status || "").toLowerCase().trim();

    // Stage config — each status maps to a PopButton color + label
    const stageConfig: Record<string, { label: string; color: React.ComponentProps<typeof PopButton>["color"] }> = {
      // Initial
      "":                                   { label: "Tracking ID",       color: "sky" },
      "pending":                            { label: "Pending",           color: "amber" },
      "in_review":                          { label: "In Review",         color: "amber" },
      // Pickup stage
      "pickup requested":                   { label: "Pickup Requested",  color: "blue" },
      "pickup_requested":                   { label: "Pickup Requested",  color: "blue" },
      "processing":                         { label: "Processing",        color: "blue" },
      "picked up":                          { label: "Picked Up",         color: "blue" },
      "picked_up":                          { label: "Picked Up",         color: "blue" },
      // Transit
      "in transit":                         { label: "In Transit",        color: "indigo" },
      "in_transit":                         { label: "In Transit",        color: "indigo" },
      "on the way to delivery hub":          { label: "To Delivery Hub", color: "indigo" },
      "on_the_way_to_delivery_hub":         { label: "To Delivery Hub", color: "indigo" },
      // Out for delivery — Steadfast uses various names for this
      "dispatched":                         { label: "Out for Delivery",  color: "violet" },
      "on_the_way":                         { label: "Out for Delivery",  color: "violet" },
      "on the way":                         { label: "Out for Delivery",  color: "violet" },
      "assigned to rider":                  { label: "Out for Delivery",  color: "violet" },
      "assigned_to_rider":                  { label: "Out for Delivery",  color: "violet" },
      "out for delivery":                   { label: "Out for Delivery",  color: "violet" },
      "out_for_delivery":                   { label: "Out for Delivery",  color: "violet" },
      "ready for delivery":                 { label: "Out for Delivery",  color: "violet" },
      "ready_for_delivery":                 { label: "Out for Delivery",  color: "violet" },
      // Hold
      "hold":                               { label: "On Hold",           color: "orange" },
      // Final — success
      "delivered":                          { label: "Delivered",         color: "green" },
      "partial_delivered":                  { label: "Part. Delivered",   color: "teal" },
      // Final — pending approval
      "delivered_approval_pending":         { label: "Approval Pending",  color: "cyan" },
      "partial_delivered_approval_pending": { label: "Partial Pending",   color: "cyan" },
      "cancelled_approval_pending":         { label: "Cancel Pending",    color: "red" },
      // Final — negative
      "returned":                           { label: "Returned",          color: "red" },
      "return_requested":                   { label: "Return Requested",  color: "red" },
      "cancelled":                          { label: "Cancelled",         color: "slate" },
      // Unknown
      "unknown_approval_pending":           { label: "Unknown Pending",   color: "zinc" },
      "unknown":                            { label: "Unknown",           color: "zinc" },
    };

    const cfg = stageConfig[status] ?? { label: order.courier_status || "Tracking ID", color: "sky" as const };

    return (
      <PopButton
        color={cfg.color}
        size="sm"
        className="cursor-default text-[9px] font-bold tracking-widest uppercase whitespace-nowrap w-36 justify-center"
      >
        {cfg.label}
      </PopButton>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4 p-8">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-12 w-full rounded-2xl bg-black/[0.02]" />
          </div>
        ))}
      </div>
    );
  }

  const steadfastBanner = showSteadfastBanner && steadfastRun && !isMobile ? (
    <SteadfastSendBanner
      run={steadfastRun}
      filter={activeSteadfastFilter}
      onFilter={setSteadfastFilter}
      onRetry={handleSteadfastRetry}
      onCheckAgain={() => void checkSteadfastRun(Object.entries(steadfastRun.failures).filter(([, failure]) => failure.code === "checking").map(([id]) => id))}
      onDismiss={() => {
        setSteadfastRun(null);
        setSteadfastFilter(null);
      }}
    />
  ) : null;

  if (displayOrders.length === 0) {
    return (
      <div>
        {steadfastBanner}
        <div className="text-center py-20 bg-white">
          <Package className="w-12 h-12 text-black mx-auto mb-4" />
          <p className="text-[10px] text-black tracking-[0.2em] font-bold uppercase">
            {activeSteadfastFilter ? "Nothing left in this group" : "No records found"}
          </p>
          {activeSteadfastFilter && (
            <button
              type="button"
              onClick={() => setSteadfastFilter(null)}
              className="mt-3 text-[11px] font-medium text-black underline decoration-black/20 underline-offset-4 hover:decoration-black"
            >
              Show all orders
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <MobileOrderCards
        orders={orders}
        loading={loading}
        selectedIds={selectedIds}
        onToggleSelection={toggleSelectOrder}
        onToggleSelectAll={toggleSelectAll}
        onOpenOrder={(orderId) => navigate(`/orders/${orderId}`, orderLinkState ? { state: orderLinkState } : undefined)}
        enableOrderIdLinks={enableOrderIdLinks}
        showCancellationReason={showCancellationReason}
        orderLinkSearch={((tab) => (tab === "pending" || tab === "print" ? `?fulfillmentTab=${tab}` : undefined))((orderLinkState as { fulfillmentTab?: unknown } | undefined)?.fulfillmentTab)}
        renderActions={(order) => (
          <div className="flex flex-wrap gap-2">
            {!order.fraud_checked && (
              <button type="button" onClick={() => handleCheckFraud(order)} className="min-h-10 rounded-xl border border-black/10 px-3 text-[10px] font-semibold uppercase tracking-wide text-black">
                Check fraud
              </button>
            )}
            {!order.sent_to_courier && (
              <button type="button" onClick={() => handleSendToCourier(order)} className="min-h-10 rounded-xl border border-brand/30 bg-brand-soft px-3 text-[10px] font-semibold uppercase tracking-wide text-brand">
                Send courier
              </button>
            )}
          </div>
        )}
      />
    );
  }

  return (
    <div className="overflow-hidden">
      {steadfastBanner}
      <Table className="[&_td]:px-2.5 [&_th]:px-2.5 [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4">
        <TableHeader>
          <TableRow className="border-b border-black/[0.03] hover:bg-transparent">
            <TableHead className="w-10 py-3 pl-4 h-auto">
              <div
                onClick={toggleSelectAll}
                data-testid="checkbox-orders-all"
                className={cn(
                  "w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center cursor-pointer transition-all duration-200",
                  selectedIds.size === displayOrders.length && displayOrders.length > 0
                    ? "bg-[#0285F7] border-[#0285F7]"
                    : selectedIds.size > 0
                      ? "bg-[#0285F7] border-[#0285F7]"
                      : "border-black/20 bg-white hover:border-black/40"
                )}
              >
                {selectedIds.size === displayOrders.length && displayOrders.length > 0 ? (
                  <Check className="w-3 h-3 text-white" />
                ) : selectedIds.size > 0 ? (
                  <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
                    <path d="M3 6H9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                ) : null}
              </div>
            </TableHead>
            <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto">Order ID</TableHead>
            <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto">Customer</TableHead>
            {showRiskColumn && <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto text-center">Risk</TableHead>}
            {showCancellationReason && <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto text-center">Reason</TableHead>}
            {showCancellationReason && <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto">Cancelled</TableHead>}
            {!showCancellationReason && <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto text-center">Warehouse</TableHead>}
            <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto text-center">Items</TableHead>
            <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto text-center">Total</TableHead>
            {!showCancellationReason && <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto text-center">Order State</TableHead>}
            {!showCancellationReason && <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto text-center pr-4">Fulfillment</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
            {displayOrders.slice(0, renderedRowCount).map((order, idx) => {
              const { primary, lines, names } = productSummary(order);
              const statusOptions = isPrintStatus(order.status)
                ? ["print", "confirmed", "processing", "on_hold", "cancelled"]
                : canEnterPrint(order.status)
                  ? ["pending", "confirmed", "print", "on_hold", "cancelled"]
                  : ["pending", "confirmed", "on_hold", "cancelled"];
              const sendBlockReason = courierSendBlockReason(order.status);
              const openOrder = () => navigate(`/orders/${order.id}`, orderLinkState ? { state: orderLinkState } : undefined);
              const rowBackground = selectedIds.has(order.id) ? "bg-blue-50/60" : "";

              return (
                <Fragment key={order.id}>
                <TableRow
                  tabIndex={0}
                  aria-label={`Open order ${order.order_number}`}
                  onMouseEnter={() => prefetchOrder(order.id)}
                  onFocus={() => prefetchOrder(order.id)}
                  onClick={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("button, a, input, textarea, select, [role='button'], [data-row-interactive='true']")) return;
                    openOrder();
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    const target = event.target as HTMLElement;
                    if (target.closest("button, a, input, textarea, select, [role='button'], [data-row-interactive='true']")) return;
                    event.preventDefault();
                    openOrder();
                  }}
                  className={cn(
                    "border-b-0 transition-all duration-200 group relative cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-inset",
                    rowBackground,
                    selectedIds.has(order.id)
                      ? "hover:bg-blue-50/80 [&:has(+tr:hover)]:bg-blue-50/80"
                      : "hover:bg-black/[0.015] [&:has(+tr:hover)]:bg-black/[0.015]"
                  )}
                >
                  <TableCell className="w-10 py-3 pl-4">
                    <div
                      data-row-interactive="true"
                      data-testid={`checkbox-order-${order.id}`}
                      onClick={() => toggleSelectOrder(order.id)}
                      className={cn(
                        "w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center cursor-pointer transition-all duration-200",
                        selectedIds.has(order.id)
                          ? "bg-[#0285F7] border-[#0285F7] scale-105 shadow-sm"
                          : "border-black/20 bg-white hover:border-black/40 active:scale-95"
                      )}
                    >
                      {selectedIds.has(order.id) && (
                        <motion.svg
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 25 }}
                          viewBox="0 0 12 12"
                          className="w-3 h-3"
                          fill="none"
                        >
                          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </motion.svg>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      {enableOrderIdLinks ? (
                        <OrderIdLink
                          orderId={order.id}
                          orderNumber={order.order_number}
                          className="font-bold text-[13px] tracking-tight"
                          search={((tab) => (tab === "pending" || tab === "print" ? `?fulfillmentTab=${tab}` : undefined))((orderLinkState as { fulfillmentTab?: unknown } | undefined)?.fulfillmentTab)}
                        />
                      ) : (
                        <span className="font-bold text-[13px] tracking-tight">{order.order_number}</span>
                      )}
                      {order.fulfillment_status === "fulfilled" && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[8px] font-bold uppercase tracking-wider">Fulfilled</span>
                      )}
                      {order.fulfillment_status === "partial" && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[8px] font-bold uppercase tracking-wider">Partial</span>
                      )}
                      {order.fulfillment_status === "restocked" && (
                        <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[8px] font-bold uppercase tracking-wider">Restocked</span>
                      )}
                      {order.fulfillment_status === "cancelled" && (
                        <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[8px] font-bold uppercase tracking-wider">Cancelled</span>
                      )}
                    </div>
                    <div className="inline-flex flex-col items-center">
                      <span className="whitespace-nowrap text-[10px] text-black font-semibold uppercase tracking-wider">{format(new Date(order.created_at), "MMM dd, yyyy")}</span>
                      <span className="whitespace-nowrap text-[10px] text-black font-semibold uppercase tracking-wider">{format(new Date(order.created_at), "h:mm a")}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[150px] py-3">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-medium text-sm tracking-tight truncate">{order.customer_name || "Guest User"}</span>
                        {order.phone && (phoneOrderCount.get(order.phone.trim()) || 0) > 1 && (
                          <Tooltip delayDuration={0}>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-[3px] px-1.5 py-[3px] rounded-md bg-gradient-to-r from-orange-500/10 to-rose-500/10 border border-orange-300/60 text-orange-600 cursor-default shrink-0">
                                <Copy className="h-[9px] w-[9px]" strokeWidth={2.5} />
                                <span className="text-[9px] font-bold tabular-nums">{phoneOrderCount.get(order.phone.trim())}</span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs font-medium">
                              <span className="flex items-center gap-1.5">
                                <Copy className="h-3 w-3 text-orange-500" />
                                {phoneOrderCount.get(order.phone.trim())} orders from this number
                              </span>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <div className="flex items-center gap-1 min-w-0" data-row-interactive="true">
                        <span className="font-mono text-[11px] text-black truncate">{order.phone || "No Phone"}</span>
                        {order.phone && (
                          <CopyButton
                            value={order.phone}
                            size="sm"
                            aria-label={`Copy phone number ${order.phone}`}
                            className="h-6 w-6 shrink-0 rounded-md text-black/40 hover:bg-black/[0.06] hover:text-black"
                          />
                        )}
                      </div>
                      {order.source && (
                        <Chip data-testid="order-source-chip" variant="caption" color={isAbandonedCheckoutOrder(order.source, order.origin_source) ? "rose" : ORDER_SOURCE_CHIP_COLORS[normalizeOrderSource(order.source)] ?? "yellow"} className="mt-1 self-start rounded-[4px] py-0.5">
                          {orderSourceDisplayLabel(order.source, order.origin_source)}
                        </Chip>
                      )}
                    </div>
                  </TableCell>
                  {showRiskColumn && (
                    <TableCell className="text-center py-3">
                      <div className="flex items-center justify-center">
                        <FraudCell
                          order={order}
                          isChecking={checkingFraudIds.has(order.id)}
                          onCheck={() => handleCheckFraud(order)}
                        />
                      </div>
                    </TableCell>
                  )}
                  {showCancellationReason && (
                    <TableCell className="max-w-[260px] py-3">
                      <CancellationReasonCell order={order} />
                    </TableCell>
                  )}
                  {showCancellationReason && (
                    <TableCell className="py-3">
                      <CancelledAtCell order={order} />
                    </TableCell>
                  )}
                  {!showCancellationReason && (<>
                  <TableCell className="py-3 text-center" onClick={(event) => event.stopPropagation()}>
                    <BuiSelect aria-label={`Warehouse for ${order.order_number}`} placeholder="Select warehouse" selectedKey={order.warehouse_id || null} onSelectionChange={(key) => handleWarehouseChange(order, String(key))} className="items-center" triggerClassName={`h-8 w-auto max-w-full border-transparent ${order.warehouse_id ? "bg-status-lime-background text-status-lime-text hover:bg-status-lime-background" : "bg-status-yellow-background text-status-yellow-text hover:bg-status-yellow-background"}`} popoverClassName="w-[var(--trigger-width)]">
                      {warehouses.map((warehouse) => <BuiSelectItem key={warehouse.id} id={warehouse.id} textValue={warehouse.name}>{warehouse.name}</BuiSelectItem>)}
                    </BuiSelect>
                  </TableCell>
                  </>)}
                  <TableCell className="max-w-[130px] 2xl:max-w-[160px] py-3">
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                         <div data-testid="order-items-preview" aria-label={`${lines.length || 0} order items`} className="flex items-center gap-1.5 group/prod cursor-default min-w-0">
                           <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-blue-400 group-hover/prod:text-blue-500 transition-colors"><g fill="none" stroke="currentColor" strokeWidth="1.2"><rect width="14" height="17" x="5" y="4" fill="currentColor" fillOpacity=".25" rx="2"/><path strokeLinecap="round" d="M9 9h6m-6 4h6m-6 4h4"/></g></svg>
                           <div className="min-w-0 space-y-0.5 text-xs font-medium leading-tight text-black">{names.length ? names.map((name, index) => <p key={index} className="max-w-[170px] truncate">{name}</p>) : <p>{primary}</p>}</div>
                         </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[300px] p-0 overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl shadow-black/10 backdrop-blur-xl">
                        <div className="border-b border-black/[0.06] px-3.5 py-2.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-50 text-violet-600 shrink-0">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><g fill="none" stroke="currentColor" strokeWidth="1.2"><rect width="14" height="17" x="5" y="4" fill="currentColor" fillOpacity=".25" rx="2"/><path strokeLinecap="round" d="M9 9h6m-6 4h6m-6 4h4"/></g></svg>
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-foreground">Order Items</p>
                              <p className="text-[10px] text-muted-foreground">{lines.length} item{lines.length !== 1 ? "s" : ""}</p>
                            </div>
                          </div>
                        </div>
                        <div className="divide-y divide-black/[0.04]">
                          {lines.length === 0 ? (
                            <p className="px-3.5 py-2.5 text-xs text-muted-foreground">No items</p>
                          ) : (
                            lines.map((line, index) => (
                              <div key={index} className="px-3.5 py-2 flex items-start gap-2.5">
                                <span className="mt-0.5 h-4 w-4 rounded-lg bg-black/[0.05] text-black/40 text-[9px] font-bold flex items-center justify-center shrink-0">{index + 1}</span>
                                <p className="text-xs text-foreground leading-relaxed">
                                  {formatTooltipProductLine(line, Boolean(order.items?.length), order.quantity)}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-center py-3 tabular-nums">
                    <EditableTotalCell order={order} onOrderUpdate={onOrderUpdate} />
                  </TableCell>
                  {!showCancellationReason && (<>
                  <TableCell className="text-center py-3">
                    <div className="flex items-center justify-center gap-2">
                      <div className="flex flex-col items-center gap-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className={cn(
                              "group/status status-pill relative inline-flex h-8 w-[136px] items-center overflow-hidden rounded-full border px-3 font-extrabold text-xs capitalize transition-all duration-200 active:scale-95",
                              orderStatusClasses(order.status)
                            )}
                          >
                            <span className="status-pill-icon absolute left-3 top-1/2 z-10 flex -translate-y-1/2 items-center justify-center transition-all duration-500 ease-out group-hover/status:left-1/2 group-hover/status:-translate-x-1/2 group-hover/status:-translate-y-1/2 group-hover/status:scale-125">
                                <OrderStatusIcon status={order.status} />
                            </span>
                            <span className="status-pill-label ml-6 whitespace-nowrap transition-all duration-500 ease-out group-hover/status:translate-x-[155%] group-hover/status:opacity-0">
                              {/* The table pill uses a compact name for the one status too long to fit. */}
                              {normalizeBusinessStatus(order.status) === "processing" ? "Ready_Transit" : displayStatusLabel(order.status)}
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[180px] rounded-2xl border border-black/10 bg-white/95 p-2 shadow-2xl shadow-black/10 backdrop-blur-xl" align="center">
                          <div className="flex flex-col gap-1">
                            {statusOptions.map((st) => (
                              <button
                                key={st}
                                onClick={() => handleStatusChange(order, st)}
                                className={cn(
                                  "flex h-9 w-full items-center justify-between rounded-xl border px-3 text-left text-xs font-medium capitalize transition-all",
                                  order.status === st
                                    ? orderStatusClasses(st, true)
                                    : "border-transparent text-foreground hover:border-black/10 hover:bg-black/[0.04]"
                                )}
                              >
                                <span className="flex items-center gap-2">
                                  <OrderStatusIcon status={st} />
                                  {displayStatusLabel(st)}
                                </span>
                                {order.status === st && <Check className="h-3.5 w-3.5" />}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      {showHoldDetails && isOnHoldStatus(order.status) && (() => {
                        const days = holdDays(order);
                        const reason = ORDER_HOLD_REASONS.find((option) => option.code === order.hold_reason_code)?.label;
                        return (
                          <p data-testid="hold-details" className="flex max-w-[160px] items-center gap-1 text-[11px] text-black/60" title={reason ?? undefined}>
                            <span className="min-w-0 truncate">{reason ?? "No reason"}</span>
                            <span className={cn("shrink-0", days >= 5 && "font-semibold text-red-600")}>· {days}d</span>
                          </p>
                        );
                      })()}
                      </div>
                      <NotesPopover order={order} onOrderUpdate={onOrderUpdate} />
                    </div>
                  </TableCell>
                  <TableCell className="text-center py-3 pr-4">
                    <div className="flex items-center justify-center">
                      {!order.sent_to_courier ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="send-btn flex items-center rounded-xl bg-white border border-brand text-brand text-[11px] font-medium px-3 py-1.5 overflow-hidden transition-all duration-200 cursor-pointer active:scale-95 hover:bg-brand-soft">
                              <div className="send-btn-svg-wrapper flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={13} height={13} className="send-btn-icon transition-transform duration-300 origin-center">
                                  <path fill="none" d="M0 0h24v24H0z"/>
                                  <path fill="currentColor" d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z"/>
                                </svg>
                              </div>
                              <span className="send-btn-label ml-1.5 transition-transform duration-300">Send</span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[150px] p-2 bg-white border border-black/5 rounded-xl shadow-xl" align="center">
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => handleSendToCourier(order)}
                                disabled={sendingIds.has(order.id) || sendBlockReason !== null}
                                className="flex items-center justify-center gap-2 h-8 w-full text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all hover:bg-blue-50 text-blue-600 disabled:opacity-50"
                              >
                                {sendingIds.has(order.id) && <Spinner size="sm" />}
                                <SteadfastLogo className="h-4 w-auto" />
                              </button>
                              <button
                                onClick={() => handleSendToPathao(order)}
                                disabled={sendingPathaoIds.has(order.id) || sendBlockReason !== null}
                                className="flex items-center justify-center gap-2 h-8 w-full text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all hover:bg-red-50 text-[#D82128] disabled:opacity-50"
                              >
                                {sendingPathaoIds.has(order.id) && <Spinner size="sm" />}
                                <PathaoLogo className="h-5 w-auto" />
                              </button>
                              {sendBlockReason !== null && (
                                <p className="px-2 pb-1 pt-1 text-center text-[10px] font-medium text-muted-foreground">{sendBlockReason}</p>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        (() => {
                          const rawStatus = (order.courier_status || "").toLowerCase().trim();
                          const isInitialState = !rawStatus || rawStatus === "in_review" || rawStatus === "pending";
                          const isSteadfastProcessing = order.courier_name === "steadfast" && classifyOrderStatus(order) === "processing";
                          const id = order.consignment_id || order.tracking_code;

                          if (isInitialState || isSteadfastProcessing) {
                            if (!id) {
                              return (
                                <PopButton color="sky" size="sm" className="cursor-default gap-1.5 text-[10px] font-bold tracking-widest uppercase w-36 justify-center">
                                  <span className="opacity-70">ID</span>
                                  <span className="font-mono tracking-tight normal-case text-[11px]">—</span>
                                </PopButton>
                              );
                            }
                            return <ConsignmentIdButton id={id} />;
                          }
                          return (
                            <div className="flex items-center justify-center gap-1" data-row-interactive="true">
                              {getCourierStatusBadge(order)}
                              {id && canShowConsignmentCopy(order) && (
                                <CopyButton
                                  value={String(id)}
                                  size="sm"
                                  aria-label={`Copy consignment number ${id}`}
                                  title={String(id)}
                                  className="h-6 w-6 shrink-0 rounded-md text-black/40 hover:bg-black/[0.06] hover:text-black"
                                />
                              )}
                            </div>
                          );
                        })()
                      )}
                    </div>
                    {(() => {
                      const failure = steadfastRowFailure(order, steadfastRun);
                      if (!failure) return null;
                      return (
                        <SteadfastIssueNote
                          orderId={order.id}
                          failure={failure}
                          fixed={steadfastRun?.fixedIds.includes(order.id) ?? false}
                          phone={order.phone || ""}
                          address={order.address || ""}
                          onFix={(kind, value) => handleSteadfastFix(order, kind, value)}
                        />
                      );
                    })()}
                    {(() => {
                      const details = followUpDetails(order);
                      if (!details) return null;
                      // The other reasons already say how many days.
                      const waitedDays = (details.key === "delivery_problem" || details.key === "courier_unknown") && details.since
                        ? Math.floor((Date.now() - Date.parse(details.since)) / 86_400_000) : null;
                      return (
                        <>
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="mx-auto mt-1 line-clamp-2 max-w-[220px] text-center text-[10px] font-medium text-rose-600" data-testid={`stuck-reason-${order.id}`}>{details.label}</p>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs whitespace-normal text-[12px] leading-relaxed">{details.label}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {waitedDays !== null && (
                            <p className="mt-0.5 text-center text-[10px] text-black/45">{waitedDays < 1 ? "Reported today" : `Waiting ${waitedDays} ${waitedDays === 1 ? "day" : "days"}`}</p>
                          )}
                        </>
                      );
                    })()}
                  </TableCell>
                  </>)}
                </TableRow>
                <TableRow
                  data-testid={`order-address-row-${order.id}`}
                  onClick={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("button, a, input, textarea, select, [role='button'], [data-row-interactive='true']")) return;
                    openOrder();
                  }}
                  className={cn(
                    "border-b border-[#F1F1F2] cursor-pointer transition-all duration-200",
                    rowBackground,
                    selectedIds.has(order.id)
                      ? "hover:bg-blue-50/80 [tr:hover+&]:bg-blue-50/80"
                      : "hover:bg-black/[0.015] [tr:hover+&]:bg-black/[0.015]"
                  )}
                >
                  <TableCell colSpan={2} className="p-0" />
                  <TableCell colSpan={1 + (showRiskColumn ? 1 : 0) + (showCancellationReason ? 2 : 3) + 2} className="pt-0 pb-3 pr-4">
                    <div className="flex items-start gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-1">
                      <MapPin className="mt-[2px] h-3.5 w-3.5 shrink-0 text-emerald-700" strokeWidth={2} />
                      <p data-testid={`order-address-${order.id}`} className="text-[13px] font-medium leading-snug text-emerald-950">
                        {order.address || "Digital Delivery"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
                </Fragment>
              );
            })}
        
        </TableBody>
      </Table>

      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100]"
          >
            <div className="bg-white border border-black/[0.09] shadow-[0_4px_40px_-8px_rgba(0,0,0,0.14)] flex items-stretch">

              {/* Count */}
              <div className="flex flex-col justify-center px-6 py-3 border-r border-black/[0.06] min-w-[110px]">
                <span className="text-[7px] font-medium tracking-[0.3em] text-black uppercase">Selection</span>
                <span className="text-[22px] font-light tracking-tight text-black tabular-nums leading-none mt-0.5">
                  {selectedIds.size}
                  <span className="text-xs text-black font-normal ml-1">orders</span>
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center px-3 gap-0.5">

                {isPrintView && (selectedPrintOrders.length > 0 || isBulkSendingSteadfast) && (
                  <button
                    onClick={() => void handleBulkSendToSteadfast()}
                    disabled={isBulkSendingSteadfast}
                    className="flex items-center gap-1.5 h-8 px-3 text-[9px] font-medium tracking-[0.18em] uppercase text-black hover:text-black hover:bg-black/[0.03] transition-all disabled:opacity-60"
                    data-testid="button-bulk-send-steadfast"
                  >
                    {isBulkSendingSteadfast ? <Spinner size="sm" /> : <SteadfastLogo className="h-3.5 w-auto" />}
                    {isBulkSendingSteadfast && steadfastRun
                      ? <span className="tabular-nums">Sending {steadfastRun.progress.done}/{steadfastRun.progress.total}</span>
                      : "Send to Steadfast"}
                  </button>
                )}

                {!isPrintView && (
                  <button
                    onClick={handleBulkFraudCheck}
                    disabled={isBulkChecking}
                    className="flex items-center gap-1.5 h-8 px-3 text-[9px] font-medium tracking-[0.18em] uppercase text-black hover:text-black hover:bg-black/[0.03] transition-all disabled:opacity-30"
                    data-testid="button-bulk-fraud-check"
                  >
                    {isBulkChecking
                      ? <Spinner size="sm" />
                      : <ShieldCheck className="h-3 w-3" />}
                    Fraud Check
                  </button>
                )}

                {/* Invoice */}
                <button
                  onClick={handleGenerateInvoice}
                  className="flex items-center gap-1.5 h-8 px-3 text-[9px] font-medium tracking-[0.18em] uppercase text-black hover:text-black hover:bg-black/[0.03] transition-all"
                  data-testid="button-generate-invoice"
                >
                  <FileText className="h-3 w-3" />
                  Invoice
                </button>

                {/* Print */}
                <button
                  onClick={handlePrintInvoice}
                  className="flex items-center gap-1.5 h-8 px-3 text-[9px] font-medium tracking-[0.18em] uppercase text-black hover:text-black hover:bg-black/[0.03] transition-all"
                  data-testid="button-print-invoice"
                >
                  <Printer className="h-3 w-3" />
                  Print
                </button>
                <button onClick={() => downloadOrderExcel(orders.filter((order) => selectedIds.has(order.id)), warehouseNames)} className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-black hover:bg-black/[0.04]" type="button">
                  <FileSpreadsheet className="h-3 w-3" /> Excel
                </button>

                <div className="w-px h-4 bg-black/[0.07] mx-1" />

                {/* Delete */}
                <button
                  onClick={handleDeleteOrders}
                  disabled={isDeletingOrders}
                  className="flex items-center gap-1.5 h-8 px-3 text-[9px] font-medium tracking-[0.18em] uppercase text-red-400 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-30"
                  data-testid="button-delete-orders"
                >
                  {isDeletingOrders
                    ? <Spinner size="sm" />
                    : <Trash2 className="h-3 w-3" />}
                  Delete
                </button>

                <div className="w-px h-4 bg-black/[0.07] mx-1" />

                {/* Clear */}
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="h-8 px-3 text-[9px] font-medium tracking-[0.18em] uppercase text-black hover:text-black transition-colors"
                  data-testid="button-clear-selection"
                >
                  Clear
                </button>

              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AlertDialog open={Boolean(cancellationTarget)} onOpenChange={(open) => { if (!open) setCancellationTarget(null); }}>
        <AlertDialogContent ref={setCancellationDialogContainer}>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel order?</AlertDialogTitle>
            <AlertDialogDescription>
              Select a reason so this cancellation is recorded in the order history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[8px] font-medium uppercase tracking-[0.3em] text-black">Cancellation reason</span>
              <BuiSelect
                aria-label="Cancellation reason"
                placeholder="কারণ নির্বাচন করুন"
                selectedKey={cancellationReasonCode || null}
                onSelectionChange={(key) => setCancellationReasonCode(key ? String(key) as CancellationReason : "")}
                className="w-full"
                triggerClassName="h-10 w-full rounded-lg bg-black/[0.04] px-3 text-sm"
                popoverPlacement="top"
                popoverShouldFlip={false}
                popoverPortalContainer={cancellationDialogContainer ?? undefined}
              >
                {CANCELLATION_DIALOG_REASON_OPTIONS.map((option) => <BuiSelectItem key={option.value} id={option.value} textValue={option.label}>{option.label}</BuiSelectItem>)}
              </BuiSelect>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[8px] font-medium uppercase tracking-[0.3em] text-black">Note</span>
              <Textarea
                aria-label="Cancellation note"
                value={cancellationReasonNote}
                onChange={(event) => setCancellationReasonNote(event.target.value)}
                placeholder={cancellationReasonCode === "other" ? "Required for Other" : "Optional context"}
              />
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              disabled={!cancellationReasonCode || (cancellationReasonCode === "other" && !cancellationReasonNote.trim()) || Boolean(cancellationTarget && updatingIds.has(cancellationTarget.id))}
              onClick={(event) => {
                event.preventDefault();
                if (!cancellationTarget || !cancellationReasonCode) return;
                void handleStatusChange(cancellationTarget, "cancelled", { code: cancellationReasonCode, note: cancellationReasonNote });
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Confirm cancellation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <OrderHoldDialog
        open={Boolean(holdTarget)}
        onOpenChange={(open) => { if (!open) setHoldTarget(null); }}
        title="অর্ডার হোল্ড করুন"
        submitLabel="অর্ডার হোল্ডে রাখুন"
        onSubmit={(metadata) => holdTarget ? handleStatusChange(holdTarget, "on_hold", undefined, metadata) : false}
      />
    </div>
  );
}
