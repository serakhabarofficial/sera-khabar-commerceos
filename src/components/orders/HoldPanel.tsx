import { Select as BuiSelect, SelectItem as BuiSelectItem } from "@/components/base/select/select";
import { cn } from "@/lib/utils";
import { HOLD_ATTEMPTS, type HoldAttempt } from "@/lib/orderHoldFilters";
import { ORDER_HOLD_REASONS } from "../../../shared/orderHold.js";

const ATTEMPT_TONES: Record<HoldAttempt, { dot: string; number: string; hint: string }> = {
  1: { dot: "bg-emerald-500", number: "text-emerald-700", hint: "No answer on the 1st call" },
  2: { dot: "bg-amber-400", number: "text-amber-700", hint: "No answer on the 2nd call" },
  3: { dot: "bg-red-500", number: "text-red-600", hint: "Final call. Confirm or cancel." },
};

const ALL_REASONS = "all";

export type HoldPanelProps = {
  /** Held orders per call attempt, before the attempt filter. */
  attemptCounts: Record<HoldAttempt, number>;
  /** Held orders per hold reason code, before the reason filter. */
  reasonCounts: Record<string, number>;
  /** Orders shown after both filters. */
  listCount: number;
  attempt: HoldAttempt | null;
  reason: string | null;
  onAttemptChange: (attempt: HoldAttempt | null) => void;
  onReasonChange: (reason: string | null) => void;
};

// The Hold tab's filters: one card per call attempt (click to filter)
// and a hold reason picker with the same reasons as the order editor.
export function HoldPanel({ attemptCounts, reasonCounts, listCount, attempt, reason, onAttemptChange, onReasonChange }: HoldPanelProps) {
  const filtered = Boolean(attempt || reason);

  return (
    <div className="space-y-2.5 border-b border-black/[0.07] bg-[#FAFAF8] px-3 py-3 sm:px-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {HOLD_ATTEMPTS.map(({ attempt: key, label }) => {
          const count = attemptCounts[key];
          const active = attempt === key;
          const tone = ATTEMPT_TONES[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              data-testid={`hold-attempt-${key}`}
              onClick={() => onAttemptChange(active ? null : key)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3.5 text-left ring-1 transition-[box-shadow,opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98]",
                active ? "ring-2 ring-black" : "ring-black/[0.06] hover:ring-black/[0.15]",
                attempt && !active && "opacity-60 hover:opacity-100",
              )}
            >
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-black/75">
                  <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
                  {label}
                </span>
                <span className="truncate text-[11.5px] text-black/45">{tone.hint}</span>
              </span>
              <span className={cn("shrink-0 text-[28px] font-medium leading-none tabular-nums tracking-[-0.02em]", count ? tone.number : "text-black/25")}>
                {count.toLocaleString("en-BD")}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-[12.5px] text-black/60">
          <span>{listCount.toLocaleString("en-BD")} held {listCount === 1 ? "order" : "orders"}</span>
          {filtered && (
            <button type="button" onClick={() => { onAttemptChange(null); onReasonChange(null); }} className="text-[12px] text-[#0262B8] underline-offset-2 hover:underline">
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
