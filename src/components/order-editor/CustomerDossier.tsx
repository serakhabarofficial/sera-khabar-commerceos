import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy, LinkSimple, PencilSimple, Phone, X } from "@phosphor-icons/react";
import { Chip } from "@/components/base/badges/chip";
import { bdWhatsAppHref, normalizeBdPhone } from "@/lib/bdPhone";
import { formatTaka } from "@/lib/orderEditor";
import { normalizeOrderSource, orderSourceDisplayLabel, type OrderSource } from "@/lib/orderSource";
import WhatsappLogo from "@/components/WhatsappLogo";
import { IndividualSmsDialog } from "@/components/order-editor/IndividualSmsDialog";
import { FraudPanel } from "@/components/order-editor/FraudPanel";
import { useStorefrontUrl } from "@/hooks/useStorefrontUrl";
import { OrderSourceSelect } from "./OrderSourceSelect";
import {
  ORDER_SOURCE_ICONS,
  copyTextToClipboard,
  courierStatusChipColor,
  formatLandingPageLabel,
  historyDateTime,
  historyStatusLabel,
  historyStatusPill,
  humanizeCourierStatus,
  landingPageHref,
  type CustomerDraft,
  type HistoryEntry,
} from "./CustomerPanel";

type DossierOrder = {
  id?: string;
  order_number?: string | number | null;
  payment_method?: string | null;
  landing_page_path?: string | null;
  price?: number | null;
  consignment_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CustomerDossierProps = {
  order: DossierOrder;
  customer: CustomerDraft;
  disabled?: boolean;
  history?: HistoryEntry[];
  historyLoading?: boolean;
  onOpenOrder?: (orderId: string) => void;
  onApply: (customer: CustomerDraft) => void;
  source?: OrderSource;
  originSource?: string | null;
  /** Set only for orders made with Create order; turns the source chip into a picker. */
  onSourceChange?: (source: OrderSource) => void;
  smsAmount?: number | null;
  smsAdvancePaid?: number | null;
  className?: string;
};

const inputClass = "h-10 w-full rounded-lg bg-white px-3 text-[13px] text-black outline-none ring-1 ring-inset ring-black/[0.08] transition focus:ring-black/25 disabled:opacity-50";
const actionClass = "inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-[10px] bg-white text-[12.5px] text-black ring-1 ring-inset ring-black/[0.07] transition hover:bg-black/[0.03] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";
const labelClass = "text-[8px] font-medium uppercase tracking-[0.3em] text-black";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "–";
  return parts.length === 1 ? Array.from(parts[0]).slice(0, 2).join("") : `${Array.from(parts[0])[0]}${Array.from(parts[parts.length - 1])[0]}`;
}

// Duoicons "message" (fernandcf, MIT), drawn in the button's text color.
function SmsIcon({ size = 15 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" data-testid="sms-icon">
      <path fill="currentColor" opacity=".3" d="M19 10a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3v.966c0 1.06-1.236 1.639-2.05.96L14.638 19H12a3 3 0 0 1-3-3v-3a3 3 0 0 1 3-3z" />
      <path fill="currentColor" d="M16 4a3 3 0 0 1 3 3v1h-8a4 4 0 0 0-4 4v4c0 1.044.4 1.996 1.056 2.708L7 19.5c-.824.618-2 .03-2-1V17a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" />
    </svg>
  );
}

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("en-BD") : null;
}

/** The customer's previous orders with this store, newest first. */
export function LastOrdersCard({ history, loading = false, onOpenOrder }: { history: HistoryEntry[]; loading?: boolean; onOpenOrder?: (orderId: string) => void }) {
  return (
    <div className="min-w-0 rounded-[14px] bg-white p-3.5 ring-1 ring-inset ring-black/[0.06]">
      <div className="flex items-center gap-2">
        <h3 className="text-[14px] font-semibold text-black">Last orders</h3>
        {history.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#FBBB14] px-1.5 text-[11px] font-bold tabular-nums text-black">{history.length}</span>}
      </div>
      {loading ? (
        <p className="mt-2 text-[12px] text-black/55">Loading…</p>
      ) : history.length === 0 ? (
        <p className="mt-2 text-[12px] text-black/55">No previous orders.</p>
      ) : (
        <ul className="mt-1.5 divide-y divide-black/[0.06]">
          {history.map((entry) => {
            const number = String(entry.order_number ?? "").replace(/^#+/, "");
            const body = (
              <div className="flex min-w-0 items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-1 font-mono text-[12.5px] font-medium text-black">{number}{onOpenOrder && <ArrowUpRight weight="light" size={12} className="text-black/30" />}</p>
                  <p className="mt-0.5 truncate text-[11.5px] text-black/55"><span className="font-medium tabular-nums text-black">{formatTaka(entry.price)}</span> · {historyDateTime(entry.created_at) || "—"}</p>
                  {entry.product && <p className="mt-0.5 truncate text-[11.5px] text-black/45" title={entry.product}>{entry.product}</p>}
                  {(entry.consignment_id || entry.courier_name || entry.courier_status) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {entry.courier_name && <Chip variant="caption" color="cyan">{humanizeCourierStatus(entry.courier_name)}</Chip>}
                      {entry.consignment_id && <Chip variant="caption" color="blue" title={`CN No:${entry.consignment_id}`}>CN {entry.consignment_id}</Chip>}
                      {entry.courier_status && <Chip variant="caption" color={courierStatusChipColor(entry.courier_status)}>{humanizeCourierStatus(entry.courier_status)}</Chip>}
                    </div>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${historyStatusPill(entry.status)}`}>{historyStatusLabel(entry.status)}</span>
              </div>
            );
            return (
              <li key={entry.id} className="min-w-0">
                {onOpenOrder ? (
                  <button type="button" onClick={() => onOpenOrder(entry.id)} aria-label={`Open order ${number} in the order editor`} className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 text-left transition hover:bg-black/[0.03]">{body}</button>
                ) : body}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The customer file: who this is, whether they can be trusted, and what they ordered before. */
export function CustomerDossier({ order, customer, disabled = false, history = [], historyLoading = false, onOpenOrder, onApply, source, originSource, onSourceChange, smsAmount, smsAdvancePaid, className = "" }: CustomerDossierProps) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(customer);
  const [copied, setCopied] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);

  useEffect(() => {
    if (!editing) setLocal(customer);
  }, [customer, editing]);

  function applyEditing() {
    onApply({ customerName: local.customerName.trim(), phone: local.phone.trim(), address: local.address.trim() });
    setEditing(false);
  }

  async function copyPhone() {
    const value = customer.phone.trim();
    if (!value || copied) return;
    if (await copyTextToClipboard(value)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  const whatsappHref = bdWhatsAppHref(customer.phone);
  const telPhone = normalizeBdPhone(customer.phone);
  const landingHref = landingPageHref(order.landing_page_path);
  const storefrontUrl = useStorefrontUrl();
  // Landing pages live on the storefront, not on this dashboard's domain.
  const landingUrl = landingHref && storefrontUrl ? `${storefrontUrl}${landingHref}` : landingHref;
  const SourceIcon = ORDER_SOURCE_ICONS[normalizeOrderSource(source)];
  const messagingAvailable = Boolean(order.id && whatsappHref && !disabled && !editing);

  return (
    <section aria-label="Customer and order" className={`flex min-h-0 flex-col gap-4 bg-[#F3F2EE] p-4 sm:p-5 ${className}`}>
      <div data-testid="customer-order-header" className="grid gap-4">
        <div data-testid="customer-order-identity" className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#F6D78A] to-[#E3A33B] text-[15px] font-medium text-[#5A3A0A]">{initials(customer.customerName)}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-medium tracking-[-0.01em] text-black">{customer.customerName || "Customer details"}</h2>
            <p className="mt-0.5 flex items-center gap-1 font-mono text-[12.5px] tabular-nums text-black/60">
              <span className="truncate">{customer.phone || "—"}</span>
              {customer.phone.trim() && !editing && (
                <button type="button" aria-label={copied ? "Phone number copied" : "Copy phone number"} onClick={() => { void copyPhone(); }} className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-black/50 transition hover:bg-black/[0.06] hover:text-black">
                  {copied ? <Check weight="light" size={13} /> : <Copy weight="light" size={13} />}
                </button>
              )}
            </p>
          </div>
          {!editing && (
            <button type="button" aria-label="Edit customer" onClick={() => { setLocal(customer); setEditing(true); }} disabled={disabled} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-black/55 transition hover:bg-black/[0.06] hover:text-black active:scale-[0.97] disabled:opacity-40">
              <PencilSimple weight="light" size={16} />
            </button>
          )}
        </div>

        {editing ? (
          <div className="grid gap-3">
            <label className={`grid gap-1.5 ${labelClass}`}>Customer name<input aria-label="Customer name" value={local.customerName} onChange={(event) => setLocal((current) => ({ ...current, customerName: event.target.value }))} disabled={disabled} className={`${inputClass} normal-case tracking-normal`} /></label>
            <label className={`grid gap-1.5 ${labelClass}`}>Phone<input aria-label="Phone" type="tel" value={local.phone} onChange={(event) => setLocal((current) => ({ ...current, phone: event.target.value }))} disabled={disabled} className={`${inputClass} font-mono normal-case tracking-normal`} /></label>
            <label className={`grid gap-1.5 ${labelClass}`}>Delivery address<textarea aria-label="Delivery address" value={local.address} onChange={(event) => setLocal((current) => ({ ...current, address: event.target.value }))} disabled={disabled} rows={3} className={`${inputClass} h-auto py-2 normal-case leading-relaxed tracking-normal`} /></label>
            <div className="flex gap-2">
              <button type="button" aria-label="Apply customer changes" onClick={applyEditing} disabled={disabled} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-black px-4 text-[12.5px] text-white active:scale-[0.97] disabled:opacity-40"><Check weight="light" size={15} /> Apply</button>
              <button type="button" aria-label="Cancel customer edit" onClick={() => { setLocal(customer); setEditing(false); }} disabled={disabled} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-black/[0.05] px-4 text-[12.5px] text-black hover:bg-black/[0.08] disabled:opacity-40"><X weight="light" size={15} /> Cancel</button>
            </div>
          </div>
        ) : (
          <p className="break-words text-[12.5px] leading-relaxed text-black/60">{customer.address || "No delivery address"}</p>
        )}

        <div className="grid grid-cols-3 gap-1.5">
          {telPhone ? <a href={`tel:${telPhone}`} aria-label="Call customer" className={actionClass}><Phone weight="light" size={15} /> Call</a> : <span className={`${actionClass} opacity-40`}><Phone weight="light" size={15} /> Call</span>}
          <button type="button" aria-label="Send SMS" onClick={() => setSmsOpen(true)} disabled={!messagingAvailable} className={actionClass}><SmsIcon size={15} /> SMS</button>
          {messagingAvailable && whatsappHref
            ? <a href={whatsappHref} target="_blank" rel="noreferrer" aria-label="Open WhatsApp chat" className={`${actionClass} text-[#128C4A]`}><WhatsappLogo size={15} /> WhatsApp</a>
            : <span className={`${actionClass} opacity-40`}><WhatsappLogo size={15} /> WhatsApp</span>}
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-2">
          {source && (
            <div className="grid min-w-0 gap-1.5">
              <span className={labelClass}>Order source</span>
              {onSourceChange ? (
                <div data-testid="order-source-control" className="flex min-w-0 items-center"><OrderSourceSelect value={source} onChange={onSourceChange} disabled={disabled} compact /></div>
              ) : (
                <div data-testid="order-source-control" className="flex h-9 min-w-0 items-center gap-2 rounded-lg bg-white px-3 text-[12.5px] text-black ring-1 ring-inset ring-black/[0.07]">
                  <SourceIcon weight="light" size={14} aria-hidden="true" className="shrink-0" />
                  <span className="sr-only">Order source</span>
                  <span className="min-w-0 truncate" title={orderSourceDisplayLabel(source, originSource)}>{orderSourceDisplayLabel(source, originSource)}</span>
                </div>
              )}
            </div>
          )}
          {landingHref && (
            <div className="grid min-w-0 gap-1.5">
              <span aria-hidden="true" className={labelClass}>Landing page</span>
              <a data-testid="landing-page-attribution" href={landingUrl} target="_blank" rel="noreferrer" title={landingUrl} aria-label={`Landing page: ${formatLandingPageLabel(landingHref)}`} className="group flex h-9 min-w-0 items-center gap-1.5 rounded-lg bg-white px-3 text-[12.5px] text-black ring-1 ring-inset ring-black/[0.07] transition hover:bg-black/[0.03]">
                <LinkSimple weight="light" size={14} aria-hidden="true" className="shrink-0" />
                <span className="sr-only">Landing page</span>
                <span className="min-w-0 truncate">{formatLandingPageLabel(landingHref)}</span>
                <ArrowUpRight weight="light" size={12} aria-hidden="true" className="ml-auto shrink-0 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[14px] bg-white p-3.5 ring-1 ring-inset ring-black/[0.06]">
        <FraudPanel phone={customer.phone} defaultExpanded compact alignHeader="left" showReviews={false} />
      </div>

      <LastOrdersCard history={history} loading={historyLoading} onOpenOrder={onOpenOrder} />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[14px] bg-white p-3.5 text-[12px] ring-1 ring-inset ring-black/[0.06]">
        {([["Payment", order.payment_method], ["Consignment", order.consignment_id], ["Created", dateTime(order.created_at)], ["Updated", dateTime(order.updated_at)]] as const).map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[8px] font-medium uppercase tracking-[0.2em] text-black/55">{label}</dt>
            <dd className="mt-1 truncate text-black" title={value || undefined}>{value || "—"}</dd>
          </div>
        ))}
      </dl>

      {order.id && whatsappHref && (
        <IndividualSmsDialog
          open={smsOpen}
          onOpenChange={setSmsOpen}
          orderId={order.id}
          orderNumber={order.order_number}
          customerName={customer.customerName}
          phone={customer.phone}
          price={smsAmount ?? order.price}
          advancePaid={smsAdvancePaid}
          address={customer.address}
        />
      )}
    </section>
  );
}
