import { Select as BuiSelect, SelectItem as BuiSelectItem } from "@/components/base/select/select";
import { Spinner } from "@/components/ui/ios-spinner";
import { OrderHoldFields, type OrderHoldMetadata } from "@/components/orders/OrderHoldFields";
import { CANCELLATION_DIALOG_REASON_OPTIONS, type CancellationReason } from "@/lib/orderActivity";
import { displayStatusLabel, isOnHoldStatus, normalizeBusinessStatus, statusOptionsFor } from "@/lib/orderTransitions";

type OrderSavePanelProps = {
  status: string | null | undefined;
  /** The status the server has now; it decides which moves are allowed. */
  savedStatus?: string | null;
  onStatusChange: (status: string) => void;
  holdDetails: OrderHoldMetadata;
  onHoldDetailsChange: (details: OrderHoldMetadata) => void;
  cancellationRequired: boolean;
  cancellationReasonCode: CancellationReason | "";
  cancellationReasonNote: string;
  onCancellationReasonChange: (reason: CancellationReason) => void;
  onCancellationReasonNoteChange: (note: string) => void;
  saving: boolean;
  saveDisabled?: boolean;
  error?: string;
};

// The editor offers the review decisions only; Print and Ready to Transit are
// driven from the fulfillment tabs. An order already past review keeps its
// current step visible so it is never shown without a selected status.
const EDITOR_STEPS = ["pending", "confirmed"];
const LATER_STEPS = ["print", "processing"];
const isCancelled = (status: string | null | undefined) => ["cancelled", "canceled"].includes(normalizeBusinessStatus(status));

function statusLabel(status: string): string {
  const label = displayStatusLabel(status);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Where the order goes next, plus the reason fields a hold or cancellation needs. */
export function OrderSavePanel({ status, savedStatus, onStatusChange, holdDetails, onHoldDetailsChange, cancellationRequired, cancellationReasonCode, cancellationReasonNote, onCancellationReasonChange, onCancellationReasonNoteChange, saving, saveDisabled = false, error }: OrderSavePanelProps) {
  // The saved status decides which moves the server will accept.
  const allowed = new Set(statusOptionsFor(savedStatus === undefined ? status : savedStatus).map(normalizeBusinessStatus));
  const current = normalizeBusinessStatus(status);
  const saved = normalizeBusinessStatus(savedStatus);
  allowed.add(current);
  const steps = [...EDITOR_STEPS, ...LATER_STEPS.filter((step) => step === current || step === saved)];
  const locked = saving || saveDisabled;
  const onHold = isOnHoldStatus(status);
  const cancelled = isCancelled(status);

  return (
    <section aria-label="Status and save" className="flex min-w-0 flex-col gap-1">
      <p className="mb-2.5 text-[8px] font-medium uppercase tracking-[0.3em] text-black">Status</p>
      {/* One radio row per status, each as tall as a payment row, so both columns end on the same line. */}
      <div role="radiogroup" aria-label="Order status" className="grid gap-1">
        {[...steps, "on_hold", "cancelled"].map((option) => {
          const hold = option === "on_hold";
          const cancel = option === "cancelled";
          const checked = hold ? onHold : cancel ? cancelled : option === current;
          const unavailable = !hold && !cancel && !allowed.has(option);
          const tone = checked ? (hold ? "bg-amber-50 font-medium text-amber-800" : cancel ? "bg-red-50 font-medium text-red-700" : "bg-black/[0.07] font-medium text-black") : unavailable ? "text-black/25" : "text-black/60 hover:bg-black/[0.04] hover:text-black";
          const dot = checked ? (hold ? "shadow-[inset_0_0_0_5px_#D97706]" : cancel ? "shadow-[inset_0_0_0_5px_#B91C1C]" : "shadow-[inset_0_0_0_5px_#0A0A0A]") : "shadow-[inset_0_0_0_1.5px_rgba(10,10,10,0.3)]";
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={locked || unavailable}
              title={unavailable ? "Not available from the current status" : undefined}
              onClick={() => onStatusChange(option)}
              className={`flex h-9 min-w-0 items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[13px] transition-[background-color,color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed ${tone}`}
            >
              <span aria-hidden="true" className={`h-4 w-4 shrink-0 rounded-full transition-shadow duration-150 ${dot}`} />
              <span className="truncate">{hold ? "On Hold" : cancel ? "Cancel order" : statusLabel(option)}</span>
            </button>
          );
        })}
      </div>

      {onHold && <div className="mt-2 min-w-0"><OrderHoldFields value={holdDetails} onChange={onHoldDetailsChange} disabled={locked} /></div>}

      {cancellationRequired && (
        <div data-testid="cancellation-fields" className="mt-2 grid min-w-0 grid-cols-1 gap-1.5 rounded-xl bg-red-50/70 p-1.5 ring-1 ring-inset ring-red-100">
          <BuiSelect aria-label="Cancellation reason" placeholder="বাতিলের কারণ" selectedKey={cancellationReasonCode || null} onSelectionChange={(key) => { if (key != null) onCancellationReasonChange(String(key) as CancellationReason); }} className="w-full min-w-0" triggerClassName="h-9 w-full min-w-0 rounded-lg bg-white px-2.5 text-[12px]" popoverClassName="w-[var(--trigger-width)] min-w-64" popoverPlacement="top" popoverShouldFlip={false}>
            {CANCELLATION_DIALOG_REASON_OPTIONS.map((option) => <BuiSelectItem key={option.value} id={option.value} textValue={option.label}>{option.label}</BuiSelectItem>)}
          </BuiSelect>
          <input aria-label="Cancellation note" value={cancellationReasonNote} onChange={(event) => onCancellationReasonNoteChange(event.target.value)} placeholder={cancellationReasonCode === "other" ? "Note (required)" : "Note (optional)"} className="h-9 w-full min-w-0 rounded-lg bg-white px-2.5 text-[12px] outline-none ring-1 ring-inset ring-black/[0.06] focus:ring-black/20" />
        </div>
      )}

      {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] leading-snug text-red-700">{error}</p>}
    </section>
  );
}

/** Save and Cancel; sits beside the Collect bar so both stay put while the status fields change. */
export function OrderSaveActions({ saving, saveDisabled = false, onSave, onCancel }: { saving: boolean; saveDisabled?: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button type="button" onClick={onSave} disabled={saving || saveDisabled} className="save-pill inline-flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[20px] bg-black px-[1.5em] py-[0.6em] text-[17px] text-white transition-[background-color,transform] duration-150 hover:bg-[#262626] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40">
        {saving && <Spinner size="sm" />}{saving ? "Saving…" : "Save changes"}
      </button>
      <button type="button" onClick={onCancel} disabled={saving} className="shrink-0 whitespace-nowrap rounded-[20px] bg-black/[0.075] px-[1.3em] py-[0.6em] text-[17px] text-black transition-[background-color,transform] duration-150 hover:bg-[#e2e2e0] active:scale-[0.97] disabled:opacity-40">
        Cancel
      </button>
    </div>
  );
}
