import { useEffect, useState } from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { CaretDown, Package, ShieldWarning } from "@phosphor-icons/react";
import { useFraudCheckMutation, useFraudLookup } from "@/hooks/useFraudCheck";
import { Chip } from "@/components/base/badges/chip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { RISK_STYLES, courierRows, maskPhone, relativeAge, resolveFraudLevel, type FraudLevel } from "@/lib/fraudRisk";
import { normalizeBdPhone } from "@/lib/bdPhone";

const QUOTA_RE = /daily FraudShield limit/i;

// The ring, header tile and risk score all take the FraudShield level's colour.
const LEVEL_TONE: Record<FraudLevel, { ring: string; tile: string; icon: string; text: string }> = {
  safe:    { ring: "#10b981", tile: "bg-emerald-50", icon: "text-emerald-600", text: "text-emerald-700" },
  caution: { ring: "#f59e0b", tile: "bg-amber-50",   icon: "text-amber-600",   text: "text-amber-700" },
  high:    { ring: "#ef4444", tile: "bg-red-50",     icon: "text-red-600",     text: "text-red-700" },
  unknown: { ring: "#a1a1aa", tile: "bg-zinc-100",   icon: "text-zinc-500",    text: "text-zinc-600" },
};

function RefreshIcon({ size = 14 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.01001 14.5101C8.19001 14.8101 8.41 15.0901 8.66 15.3401C10.5 17.1801 13.49 17.1801 15.34 15.3401C16.09 14.5901 16.52 13.64 16.66 12.67" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.33997 11.3301C7.47997 10.3501 7.90997 9.41003 8.65997 8.66003C10.5 6.82003 13.49 6.82003 15.34 8.66003C15.6 8.92003 15.81 9.20005 15.99 9.49005" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.81995 17.18V14.51H10.4899" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.18 6.82007V9.49005H13.51" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CourierLogo({ src, className = "h-5 w-16" }: { src: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <span className={`${className} shrink-0 rounded bg-black/[0.06]`} />;
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} shrink-0 object-contain object-left mix-blend-multiply`}
    />
  );
}

export function FraudPanel({ phone, className = "", defaultExpanded = false, compact = false, alignHeader = "center", showReviews = true }: { phone?: string | null; className?: string; defaultExpanded?: boolean; compact?: boolean; alignHeader?: "left" | "center"; showReviews?: boolean }) {
  const normalized = normalizeBdPhone(phone);
  const lookup = useFraudLookup(phone);
  const check = useFraudCheckMutation(phone);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const data = lookup.data;
  const payload = (data?.payload ?? null) as Parameters<typeof courierRows>[0];
  const summary = (data?.summary ?? null) as { total_parcels?: number; total_delivered?: number; total_cancel?: number; success_rate?: number; fraud_risk?: string } | null;
  const level = resolveFraudLevel(payload, summary);
  const styles = RISK_STYLES[level];
  const tone = LEVEL_TONE[level];

  const hasData = Boolean(payload && summary);
  const isNewCustomer = hasData && (summary?.total_parcels ?? 0) === 0;
  const quotaBlocked = QUOTA_RE.test(data?.errorMessage || "");
  // A quota error is not a failed check — it is a blocked one. The cached
  // message can also be stale (quota resets daily), so the Check affordance
  // stays enabled: an explicit click spends at most one request and is the
  // only way to discover the quota is back.
  const failed = data?.status === "error" && !hasData && !quotaBlocked;
  const busy = lookup.isPending || check.isPending || data?.status === "pending";

  // The state that needs attention presents itself; safe stays one quiet row.
  useEffect(() => {
    if (level === "high" && hasData) setExpanded(true);
  }, [level, hasData]);

  if (!normalized) return null;

  const reviews = payload?.reviews;
  const couriers = courierRows(payload);
  const hasReviews = showReviews && Array.isArray(reviews) && reviews.length > 0;
  // Only couriers that have carried a parcel get a tile. The empty ones fold
  // into one "+N no parcels" tile and are listed on hover, so a red 0% never
  // reads as a warning for a courier the customer simply hasn't used.
  const isEmpty = (courier: (typeof couriers)[number]) => courier.total === 0 && courier.ratio === 0;
  const activeCouriers = couriers.filter((courier) => !isEmpty(courier)).sort((a, b) => b.total - a.total);
  const emptyCouriers = couriers.filter(isEmpty);
  const rate = Math.max(0, Math.min(100, summary?.success_rate ?? 0));
  const showDetails = hasData && !isNewCustomer && !expanded;

  return (
    <section aria-label="Customer risk" className={className}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${hasData ? tone.tile : "bg-[#eaf7ef]"}`}>
            <Package weight="light" size={17} className={hasData ? tone.icon : "text-[#2e9e5b]"} />
          </span>
          <p className="truncate text-[14px] font-semibold text-black">Courier Delivery</p>
        </div>

        {hasData && data?.checkedAt && (
          <button
            type="button"
            aria-label="Re-check"
            title="Last updated — click to re-check"
            disabled={busy}
            onClick={() => check.mutate({ force: true })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] text-black/50 transition hover:bg-black/[0.07] active:scale-[0.97] disabled:opacity-40"
          >
            <RefreshIcon size={12} />
            <span className="font-semibold tabular-nums text-black">{relativeAge(data.checkedAt)}</span>
          </button>
        )}
      </div>

      <div className="mt-3">
        {busy ? (
          <span className={`block text-[12px] text-black/50 ${alignHeader === "center" ? "text-center" : "text-left"}`}>Loading…</span>
        ) : quotaBlocked && !hasData ? (
          <span className={`block text-[12px] text-black/50 ${alignHeader === "center" ? "text-center" : "text-left"}`}>Daily limit reached</span>
        ) : failed ? (
          <div className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 ${alignHeader === "center" ? "justify-center" : "justify-start"}`}>
            <span className="text-[12px] text-[#d05555]">Check failed</span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-black/50">{data?.errorMessage}</span>
          </div>
        ) : !hasData ? (
          <span className={`block text-[12px] text-black/50 ${alignHeader === "center" ? "text-center" : "text-left"}`}>Not checked yet</span>
        ) : isNewCustomer ? (
          <div className="flex min-w-0 items-start gap-2 rounded-lg bg-zinc-100 px-2.5 py-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white">
              <ShieldWarning weight="light" size={14} className="text-black/55" />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold leading-snug text-black">New customer</p>
              <p className="text-[10px] leading-snug text-black/45">No delivery history yet</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3.5">
            <div role="img" aria-label={`${rate}% success rate`} className="relative h-[76px] w-[76px] shrink-0">
              <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90" aria-hidden="true">
                <circle cx="38" cy="38" r="33" fill="none" stroke="#f1f1ef" strokeWidth="6" />
                <circle
                  cx="38"
                  cy="38"
                  r="33"
                  fill="none"
                  stroke={tone.ring}
                  strokeWidth="6"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={`${rate} 100`}
                />
              </svg>
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                <span className="text-[15px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-black">{summary?.success_rate ?? 0}%</span>
                <span className="text-[7.5px] font-medium uppercase leading-none tracking-[0.14em] text-black/45">success</span>
              </span>
            </div>
            <dl className="grid min-w-0 flex-1 gap-1.5 text-[12px] leading-none">
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-black/70"><span className="h-[7px] w-[7px] rounded-full bg-emerald-500" />Delivered</dt>
                <dd className="font-semibold tabular-nums text-black">{summary?.total_delivered ?? 0}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-black/70"><span className="h-[7px] w-[7px] rounded-full bg-red-500" />Cancelled</dt>
                <dd className={`font-semibold tabular-nums ${(summary?.total_cancel ?? 0) > 0 ? "text-red-600" : "text-black"}`}>{summary?.total_cancel ?? 0}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-black/70"><span className="h-[7px] w-[7px] rounded-full bg-indigo-500" />Total orders</dt>
                <dd className="font-semibold tabular-nums text-black">{summary?.total_parcels ?? 0}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-black/70"><span className="h-[7px] w-[7px] rounded-full" style={{ background: tone.ring }} />Risk</dt>
                <dd className={`flex items-baseline gap-1 font-semibold ${tone.text}`} title={payload?.fraudRiskScore?.label || undefined}>
                  {payload?.fraudRiskScore && <span className="tabular-nums">{payload.fraudRiskScore.score}/100</span>}
                  <span>{styles.label}</span>
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      {expanded && hasData && (
        <div className={`mt-3 grid gap-7 border-t border-black/[0.08] pt-3 ${hasReviews ? "sm:grid-cols-2" : ""}`}>
          <div className="min-w-0">
            <p className="text-[8px] font-medium uppercase tracking-[0.2em] text-black/55">By courier</p>
            <ul className={`mt-2 grid gap-1.5 ${compact ? "grid-cols-2" : "grid-cols-3"}`}>
              {activeCouriers.map((courier) => (
                <li key={courier.key} className="min-w-0 rounded-[9px] border border-black/[0.07] px-2 py-1.5">
                  <CourierLogo key={`${courier.key}-${data?.checkedAt ?? "none"}`} src={courier.logo} />
                  <div className="mt-1 flex items-center justify-between gap-1.5">
                    <span className="min-w-0 truncate text-[11px] text-black/55">
                      <span className="text-black">{courier.name}</span> · <span className="tabular-nums">{courier.countLabel}</span>
                    </span>
                    <Chip variant="caption" color={courier.ratio >= 70 ? "lime" : courier.ratio >= 50 ? "yellow" : "rose"} className="shrink-0 tabular-nums">
                      {courier.ratio}%
                    </Chip>
                  </div>
                </li>
              ))}
              {emptyCouriers.length > 0 && (
                // Alone on its row, the tile spans the row instead of leaving a gap.
                <li className={`min-w-0 ${activeCouriers.length % (compact ? 2 : 3) === 0 ? "col-span-full" : ""}`}>
                  <HoverCard openDelay={100} closeDelay={80}>
                    <HoverCardTrigger asChild>
                      <span
                        tabIndex={0}
                        className={`flex h-full ${activeCouriers.length % (compact ? 2 : 3) === 0 ? "min-h-[36px]" : "min-h-[50px]"} cursor-default items-center justify-center gap-1.5 rounded-[9px] border border-dashed border-black/[0.14] px-2 text-[11px] text-black/55 outline-none transition hover:border-solid hover:bg-black/[0.03] hover:text-black focus-visible:ring-2 focus-visible:ring-black/20`}
                      >
                        <span className="flex">
                          {emptyCouriers.slice(0, 3).map((courier) => (
                            <span key={courier.key} className="-ml-1.5 grid h-4 w-4 place-items-center overflow-hidden rounded-full border border-black/[0.08] bg-white first:ml-0">
                              {courier.logo && <img src={courier.logo} alt="" referrerPolicy="no-referrer" className="h-3 w-3 object-contain" />}
                            </span>
                          ))}
                        </span>
                        +{emptyCouriers.length} no parcels
                      </span>
                    </HoverCardTrigger>
                    <HoverCardPrimitive.Portal>
                      <HoverCardContent
                        side="bottom"
                        align="start"
                        className="w-60 rounded-[10px] border-black/[0.08] bg-white p-2.5 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.18)] duration-150 origin-[--radix-hover-card-content-transform-origin]"
                      >
                        <p className="mb-1.5 text-[8px] font-medium uppercase tracking-[0.2em] text-black/45">No parcels yet</p>
                        <ul className="grid gap-1.5">
                          {emptyCouriers.map((courier) => (
                            <li key={courier.key} className="flex items-center gap-2">
                              <CourierLogo src={courier.logo} className="h-[18px] w-14" />
                              <span className="min-w-0 flex-1 truncate text-[12px] text-black">{courier.name}</span>
                              <span className="rounded-full bg-zinc-100 px-1.5 py-px text-[10px] text-zinc-500">0 parcels</span>
                            </li>
                          ))}
                        </ul>
                      </HoverCardContent>
                    </HoverCardPrimitive.Portal>
                  </HoverCard>
                </li>
              )}
            </ul>
          </div>

          {hasReviews && (
            <div className="min-w-0">
              <p className="text-[8px] font-medium uppercase tracking-[0.2em] text-black/55">Reviews from other merchants</p>
              <ul className="mt-2 divide-y divide-black/[0.07]">
                {reviews.map((review, index) => (
                  <li key={`${review.commenter_phone}-${index}`} className="flex gap-2.5 py-2.5">
                    <span className={`shrink-0 text-[11px] ${(review.rating ?? 0) >= 4 ? "text-[#2e9e5b]" : "text-[#d05555]"}`}>
                      {"★".repeat(review.rating ?? 0)}{"☆".repeat(Math.max(0, 5 - (review.rating ?? 0)))}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12.5px] leading-snug text-black">{review.comment}</p>
                      <p className="mt-1 text-[11px] text-black/45">
                        {maskPhone(review.commenter_phone)}
                        {review.created_at ? ` · ${new Date(review.created_at).toLocaleDateString("en-BD")}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {(failed || !hasData || showDetails) && (
        <div className="mt-3 flex items-center justify-end gap-1.5">
          {failed || (quotaBlocked && !hasData) ? (
            <button
              type="button"
              aria-label="Retry"
              disabled={busy}
              onClick={() => check.mutate({ force: true })}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-black/[0.04] px-2.5 text-black transition hover:bg-black/[0.08] disabled:opacity-40"
            >
              <RefreshIcon size={18} />
              Retry
            </button>
          ) : !hasData ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => check.mutate({ force: false })}
              className="inline-flex h-7 items-center rounded-lg bg-black px-3 text-[12px] font-medium text-white transition hover:bg-black/90 disabled:opacity-40"
            >
              Check
            </button>
          ) : null}

          {showDetails && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex h-6 items-center gap-1 rounded-md bg-black/[0.04] px-2 py-1 text-[12px] font-medium text-black transition hover:bg-black/[0.08]"
            >
              Details
              <CaretDown weight="light" size={12} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
