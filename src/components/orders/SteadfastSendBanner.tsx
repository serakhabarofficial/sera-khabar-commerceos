import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle, Truck, WarningCircle, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import {
  STEADFAST_ISSUE_GROUPS,
  countSteadfastIssues,
  describeSteadfastFailure,
  steadfastCheckingIds,
  steadfastRetryIds,
  type SteadfastFailureCode,
  type SteadfastIssueGroup,
  type SteadfastRun,
} from "@/lib/steadfastBulkSend";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const CHIP_TONE: Record<SteadfastIssueGroup, string> = {
  phone: "bg-rose-50 text-rose-700 ring-rose-200",
  address: "bg-orange-50 text-orange-700 ring-orange-200",
  rejected: "bg-violet-50 text-violet-700 ring-violet-200",
  not_sent: "bg-black/[0.03] text-black/70 ring-black/10",
  no_code: "bg-sky-50 text-sky-700 ring-sky-200",
  checking: "bg-amber-50 text-amber-700 ring-amber-200",
};

/** IonIcons "refresh-circle" (MIT, Ben Sperry). */
export function RetryIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M256 48C141.31 48 48 141.32 48 256c0 114.86 93.14 208 208 208c114.69 0 208-93.31 208-208c0-114.87-93.13-208-208-208m0 313a94 94 0 0 1 0-188h4.21l-14.11-14.1a14 14 0 0 1 19.8-19.8l40 40a14 14 0 0 1 0 19.8l-40 40a14 14 0 0 1-19.8-19.8l18-18c-2.38-.1-5.1-.1-8.1-.1a66 66 0 1 0 66 66a14 14 0 0 1 28 0a94.11 94.11 0 0 1-94 94"
      />
    </svg>
  );
}

function SendProgress({ run }: { run: SteadfastRun }) {
  const { done, total } = run.progress;
  return (
    <div data-testid="steadfast-send-progress">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Steadfast</p>
          <p className="mt-1 text-2xl font-light tabular-nums">
            Sending {done}
            <span className="text-base text-black/35">/{total}</span>
          </p>
        </div>
        <p className="text-[11px] text-black/45">Keep this tab open</p>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/[0.06]">
        <div
          className="h-full origin-left rounded-full bg-black transition-transform duration-300 ease-out"
          style={{ transform: `scaleX(${total > 0 ? done / total : 0})` }}
        />
      </div>
    </div>
  );
}

export function SteadfastSendBanner({
  run,
  filter,
  onFilter,
  onRetry,
  onCheckAgain,
  onDismiss,
}: {
  run: SteadfastRun;
  filter: SteadfastIssueGroup | null;
  onFilter: (group: SteadfastIssueGroup | null) => void;
  onRetry: (orderIds: string[]) => void;
  onCheckAgain: () => void;
  onDismiss: () => void;
}) {
  const reduce = useReducedMotion();
  const counts = countSteadfastIssues(run);
  const retryIds = steadfastRetryIds(run);
  const checkingCount = steadfastCheckingIds(run).length;
  const problemCount = Object.keys(run.failures).length;
  const allGood = run.phase === "done" && problemCount === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
      className="mx-4 mb-3 mt-1 rounded-lg bg-white px-5 py-4 ring-1 ring-black/[0.06]"
      data-testid="steadfast-send-banner"
    >
      {run.phase === "sending" ? (
        <SendProgress run={run} />
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", allGood ? "bg-emerald-50" : "bg-black/[0.04]")}>
              {allGood ? <CheckCircle weight="light" className="h-5 w-5 text-emerald-600" /> : <Truck weight="light" className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Steadfast</p>
              <p className="text-[15px] font-light">
                <span className="tabular-nums">{run.sentIds.length}</span> of <span className="tabular-nums">{run.total}</span> sent
                {problemCount > 0 && <span className="text-black/45"> · {problemCount} not sent yet</span>}
              </p>
              {run.stoppedReason && <p className="mt-0.5 text-[11px] text-rose-600">Stopped: {run.stoppedReason}</p>}
            </div>
          </div>

          {problemCount > 0 && (
            <div className="flex flex-1 flex-wrap items-center gap-1.5" role="group" aria-label="Show orders by reason">
              <button
                type="button"
                onClick={() => onFilter(null)}
                aria-pressed={filter === null}
                className={cn(
                  "h-7 rounded-full px-3 text-[11px] font-medium ring-1 transition-colors duration-150 active:scale-[0.97]",
                  filter === null ? "bg-black text-white ring-black" : "bg-white text-black/60 ring-black/10 hover:ring-black/25",
                )}
              >
                All orders
              </button>
              {STEADFAST_ISSUE_GROUPS.filter((group) => counts[group.id] > 0 || filter === group.id).map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => onFilter(group.id)}
                  aria-pressed={filter === group.id}
                  data-testid={`steadfast-chip-${group.id}`}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium ring-1 transition-colors duration-150 active:scale-[0.97]",
                    filter === group.id ? "bg-black text-white ring-black" : CHIP_TONE[group.id],
                  )}
                >
                  {group.id === "checking" && run.checking && <Spinner size="sm" />}
                  {group.label}
                  <span className="tabular-nums opacity-60">{counts[group.id]}</span>
                </button>
              ))}
            </div>
          )}

          <div className={cn("flex items-center gap-1.5", problemCount === 0 && "ml-auto")}>
            {checkingCount > 0 && !run.checking && (
              <button
                type="button"
                onClick={onCheckAgain}
                className="flex h-8 items-center rounded-xl px-3 text-[11px] font-medium ring-1 ring-black/10 transition-colors duration-150 hover:ring-black/25 active:scale-[0.97]"
              >
                Check again
              </button>
            )}
            {retryIds.length > 0 && (
              <button
                type="button"
                onClick={() => onRetry(retryIds)}
                className="flex h-8 items-center gap-1.5 rounded-xl bg-black px-3.5 text-[11px] font-medium text-white active:scale-[0.97]"
                data-testid="button-steadfast-send-again"
              >
                <RetryIcon className="h-3.5 w-3.5" />
                Send {retryIds.length} again
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close Steadfast summary"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-black/40 transition-colors duration-150 hover:bg-black/[0.04] hover:text-black"
            >
              <X weight="light" className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function isValidBdPhone(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^88(?=01)/, "");
  return digits.length === 11 && digits.startsWith("01");
}

function FixField({
  kind,
  initialValue,
  onSave,
  onCancel,
}: {
  kind: "phone" | "address";
  initialValue: string;
  onSave: (value: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const save = async () => {
    if (kind === "phone" && !isValidBdPhone(value)) return setError("Use 11 digits that start with 01");
    if (kind === "address" && value.trim().length < 8) return setError("Write the full address");
    setSaving(true);
    const saveError = await onSave(value.trim());
    setSaving(false);
    if (saveError) setError(saveError);
  };

  return (
    <form
      className="flex flex-col items-center gap-1"
      data-row-interactive="true"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex items-center gap-1">
        <input
          ref={input}
          value={value}
          aria-label={kind === "phone" ? "Phone number" : "Delivery address"}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onCancel();
          }}
          placeholder={kind === "phone" ? "01XXXXXXXXX" : "House, road, area"}
          inputMode={kind === "phone" ? "tel" : "text"}
          className={cn(
            "h-7 rounded-lg border bg-white px-2 text-[12px] outline-none transition-colors duration-150 focus:border-black/40",
            kind === "phone" ? "w-[130px] font-mono" : "w-[180px]",
            error ? "border-rose-400" : "border-black/15",
          )}
        />
        <button type="submit" disabled={saving} className="flex h-7 items-center rounded-lg bg-black px-2.5 text-[11px] font-medium text-white active:scale-[0.97] disabled:opacity-50">
          {saving ? <Spinner size="sm" className="[&_.spinner-blade]:bg-white" /> : "Save"}
        </button>
      </div>
      {error ? <span className="text-[10px] text-rose-600">{error}</span> : <span className="text-[10px] text-black/35">Enter to save · Esc to cancel</span>}
    </form>
  );
}

const FIX_LABEL: Partial<Record<SteadfastFailureCode, string>> = { phone: "Fix phone", address: "Add address" };

/** The reason under a row's Fulfillment cell, with an inline fix for phone and address. */
export function SteadfastIssueNote({
  orderId,
  failure,
  fixed,
  phone,
  address,
  onFix,
}: {
  orderId: string;
  failure: { code: SteadfastFailureCode; reason: string };
  fixed: boolean;
  phone: string;
  address: string;
  onFix: (kind: "phone" | "address", value: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const { kind, title, detail } = describeSteadfastFailure(failure);

  if (fixed) {
    return (
      <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700" data-testid={`steadfast-issue-${orderId}`}>
        <CheckCircle weight="fill" className="h-3.5 w-3.5" /> Fixed · ready to send again
      </p>
    );
  }

  if (kind === "checking") {
    return (
      <div className="mx-auto mt-1.5 flex max-w-[230px] flex-col items-center gap-0.5" data-testid={`steadfast-issue-${orderId}`}>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
          <Spinner size="sm" /> {title}
        </span>
        <span className="text-center text-[10px] leading-snug text-black/45">{detail}</span>
      </div>
    );
  }

  const fixKind = kind === "phone" || kind === "address" ? kind : null;
  return (
    <AnimatePresence initial={false} mode="wait">
      {editing && fixKind ? (
        <motion.div key="fix" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="mt-1.5">
          <FixField
            kind={fixKind}
            initialValue={fixKind === "phone" ? phone : address}
            onCancel={() => setEditing(false)}
            onSave={async (value) => {
              const error = await onFix(fixKind, value);
              if (!error) setEditing(false);
              return error;
            }}
          />
        </motion.div>
      ) : (
        <motion.div
          key="note"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="mx-auto mt-1.5 flex max-w-[230px] flex-col items-center gap-0.5"
          data-testid={`steadfast-issue-${orderId}`}
        >
          <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold", kind === "no_code" ? "text-sky-700" : "text-rose-600")}>
            <WarningCircle weight="fill" className="h-3.5 w-3.5" /> {title}
          </span>
          <span className="text-center text-[10px] leading-snug text-black/45">{detail}</span>
          {fixKind && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-0.5 text-[11px] font-medium text-black underline decoration-black/20 underline-offset-4 transition-colors duration-150 hover:decoration-black"
            >
              {FIX_LABEL[fixKind]}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
