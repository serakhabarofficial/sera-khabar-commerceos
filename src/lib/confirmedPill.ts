// One app-wide pill for confirming a pending order. It lives outside the
// editor so it stays on screen when saving navigates back to the orders list.

export type ConfirmedPillState =
  | { phase: "saving" }
  | { phase: "confirmed"; orderLabel: string }
  | null;

export const CONFIRMED_PILL_DURATION_MS = 3000;

let state: ConfirmedPillState = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(next: ConfirmedPillState) {
  clearTimeout(hideTimer);
  state = next;
  listeners.forEach((listener) => listener());
}

export const confirmedPill = {
  saving() {
    set({ phase: "saving" });
  },
  confirmed(orderLabel: string) {
    set({ phase: "confirmed", orderLabel });
    hideTimer = setTimeout(() => set(null), CONFIRMED_PILL_DURATION_MS);
  },
  dismiss() {
    set(null);
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getSnapshot(): ConfirmedPillState {
    return state;
  },
};
