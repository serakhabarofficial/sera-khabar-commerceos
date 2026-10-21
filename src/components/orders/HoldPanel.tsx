import { Select as BuiSelect, SelectItem as BuiSelectItem } from "@/components/base/select/select";
import { cn } from "@/lib/utils";
import { HOLD_AGE_GROUPS, type HoldAgeKey } from "@/lib/orderHoldFilters";
import { ORDER_HOLD_REASONS } from "../../../shared/orderHold.js";

const AGE_TONES: Record<HoldAgeKey, { dot: string; number: string; hint: string }> = {
  new: { dot: "bg-emerald-500", number: "text-emerald-700", hint: "New holds" },
  soon: { dot: "bg-amber-400", number: "text-amber-700", hint: "Follow up soon" },
  long: { dot: "bg-red-500", number: "text-red-600", hint: "Held too long. Call now." },
};

const ALL_REASONS = "all";

export type HoldPanelProps = {
  /** Held orders per age group, before the age filter. */
  ageCounts: Record<HoldAgeKey, number>;
  /** Held orders per hold reason code, before the reason filter. */
  reasonCounts: Record<string, number>;
  /** Orders shown after both filters. */
  listCount: number;
  age: HoldAgeKey | null;
  reason: string | null;
  onAgeChange: (age: HoldAgeKey | null) => void;
  onReasonChange: (reason: string | null) => void;
};

// The Hold tab's filters: one card per "On hold for" range (click to filter)
// and a hold reason picker with the same reasons as the order editor.
export function HoldPanel({ ageCounts, reasonCounts, listCount, age, reason, onAgeChange, onReasonChange }: HoldPanelProps) {
  const filtered = Boolean(age || reason);

  return (
    <div className="space-y-2.5 border-b border-black/[0.07] bg-[#FAFAF8] px-3 py-3 sm:px-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {HOLD_AGE_GROUPS.map(({ key, label }) => {
          const count = ageCounts[key];
          const active = age === key;
          const tone = AGE_TONES[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              data-testid={`hold-age-${key}`}
              onClick={() => onAgeChange(active ? null : key)}
              className={cn(
                "flex flex-col gap-2.5 rounded-2xl bg-white p-4 text-left ring-1 transition-[box-shadow,opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98]",
                active ? "ring-2 ring-black" : "ring-black/[0.06] hover:ring-black/[0.15]",
                age && !active && "opacity-60 hover:opacity-100",
              )}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-black/60">
                <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
                On hold {label}
              </span>
              <span className={cn("text-[30px] font-medium leading-none tabular-nums tracking-[-0.02em]", count ? tone.number : "text-black/25")}>
                {count.toLocaleString("en-BD")}
              </span>
              <span className="text-[11.5px] text-black/45">{tone.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-[12.5px] text-black/60">
          <span>{listCount.toLocaleString("en-BD")} held {listCount === 1 ? "order" : "orders"}</span>
          {filtered && (
            <button type="button" onClick={() => { onAgeChange(null); onReasonChange(null); }} className="text-[12px] text-[#0262B8] underline-offset-2 hover:underline">
              Show all
            </button>
          )}
        </div>
        <BuiSelect
          aria-label="Hold reason"
          selectedKey={reason ?? ALL_REASONS}
          onSelectionChange={(key) => onReasonChange(key == null || String(key) === ALL_REASONS ? null : String(key))}
          size="sm"
          className="w-full sm:w-auto"
          triggerClassName="h-9 w-full min-w-[240px] rounded-xl text-[13px] sm:max-w-[340px]"
          popoverClassName="w-[var(--trigger-width)] max-h-[min(360px,50vh)]"
        >
          {[
            <BuiSelectItem key={ALL_REASONS} id={ALL_REASONS} textValue="All hold orders">All hold orders</BuiSelectItem>,
            ...ORDER_HOLD_REASONS.map((option) => (
              <BuiSelectItem key={option.code} id={option.code} textValue={option.label}>
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="truncate">{option.label}</span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-black/40">{reasonCounts[option.code] || 0}</span>
                </span>
              </BuiSelectItem>
            )),
          ]}
        </BuiSelect>
      </div>
    </div>
  );
}
