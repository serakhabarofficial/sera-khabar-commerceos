export type FraudLevel = "safe" | "caution" | "high" | "unknown";

type FraudSummary = { success_rate?: number | null; fraud_risk?: string | null; total_parcels?: number | null } | null;
type FraudPayload = {
  courierData?: Record<string, { name?: string; logo?: string; total_parcel?: number; success_parcel?: number; success_ratio?: number; volume_range?: string | null }>;
  reviews?: Array<{ commenter_phone?: string; rating?: number; comment?: string; created_at?: string }>;
  fraudRiskScore?: { score?: number; level?: string; label?: string; breakdown?: Record<string, number> };
} | null;

// FraudShield's own level wins. The fallback mirrors the server's derivation
// so a payload predating fraudRiskScore still lands somewhere sensible.
export function resolveFraudLevel(payload: FraudPayload, summary: FraudSummary): FraudLevel {
  const raw = (payload?.fraudRiskScore?.level ?? summary?.fraud_risk ?? "").toLowerCase();
  if (raw === "safe" || raw === "low") return "safe";
  if (raw === "caution" || raw === "medium" || raw === "moderate") return "caution";
  if (raw === "high" || raw === "risky") return "high";

  const rate = summary?.success_rate;
  if (typeof rate !== "number") return "unknown";
  if (rate >= 70) return "safe";
  if (rate >= 50) return "caution";
  return "high";
}

// Reuses the order-status pill palette already in CustomerPanel.tsx — no new tokens.
export const RISK_STYLES: Record<FraudLevel, { pill: string; strip: string; accent: string; label: string }> = {
  safe:    { pill: "bg-[#e3f5e9] text-[#2e9e5b]", strip: "",                accent: "text-[#2e9e5b]", label: "Safe" },
  caution: { pill: "bg-[#fdf3e3] text-[#b97f1f]", strip: "bg-[#fdf3e3]",    accent: "text-[#b97f1f]", label: "Caution" },
  high:    { pill: "bg-[#fdecec] text-[#d05555]", strip: "bg-[#fdecec]",    accent: "text-[#d05555]", label: "High risk" },
  unknown: { pill: "bg-black/[0.05] text-black/60", strip: "",              accent: "text-black",     label: "Unknown" },
};

export type DeliveryTier = "excellent" | "good" | "caution" | "poor" | "new";

// Orders table Risk column. `rate` is the delivered share of past parcels;
// null means the phone has no courier history at all.
export function deliveryTier(rate: number | null): DeliveryTier {
  if (rate === null) return "new";
  if (rate >= 90) return "excellent";
  if (rate >= 70) return "good";
  if (rate >= 50) return "caution";
  return "poor";
}

export const DELIVERY_TIER_STYLES: Record<DeliveryTier, { label: string; range: string; text: string; bg: string; border: string; dot: string }> = {
  excellent: { label: "Excellent",    range: "90–100%",    text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-700" },
  good:      { label: "Good",         range: "70–89%",     text: "text-lime-700",    bg: "bg-lime-50",    border: "border-lime-200",    dot: "bg-lime-700" },
  caution:   { label: "Caution",      range: "50–69%",     text: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200",   dot: "bg-amber-700" },
  poor:      { label: "Poor record",  range: "below 50%",  text: "text-red-700",     bg: "bg-red-50",     border: "border-red-200",     dot: "bg-red-700" },
  new:       { label: "New customer", range: "no history", text: "text-zinc-500",    bg: "bg-zinc-100",   border: "border-zinc-200",    dot: "bg-zinc-400" },
};

export function maskPhone(phone: string | null | undefined): string {
  const clean = String(phone || "").replace(/\D/g, "");
  return clean.length === 11 ? `${clean.slice(0, 3)}****${clean.slice(7)}` : "—";
}

export function relativeAge(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function courierRows(payload: FraudPayload) {
  return Object.entries(payload?.courierData || {})
    .filter(([key]) => key !== "summary")
    .map(([key, courier]) => {
      const total = courier.total_parcel ?? 0;
      const success = courier.success_parcel ?? 0;
      return {
        key,
        name: courier.name ?? key,
        // The API recently started sending logo files from a host that does
        // not resolve (fraudshieldbd.site); the same paths work on the live
        // host, so rewrite it instead of showing a broken image.
        logo: courier.logo?.replace("fraudshieldbd.site", "fraudshield.bd") ?? null,
        total,
        success,
        // Steadfast reports a volume range rather than an exact count.
        countLabel: courier.volume_range ?? `${success}/${total}`,
        ratio: courier.success_ratio ?? (total > 0 ? Math.round((success / total) * 100) : 0),
      };
    });
}

// Mirrors FRAUD_QUOTA_RESERVE in server/fraudShield.js — the request budget
// held back from automated warming for interactive re-checks.
export const FRAUD_QUOTA_RESERVE = 100;
