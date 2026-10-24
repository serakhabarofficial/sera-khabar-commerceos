export type OrderHandlingKind = "order" | "abandoned" | "review";
export type OrderHandlingResponse = {
  status: "handling" | "view_only" | "available";
  holder: { name: string } | null;
  expires_at: string | null;
};
export const ORDER_HANDLING_CONFLICT_EVENT = "order-handling-conflict";
export const ORDER_HANDLING_IDLE_MS = 5 * 60_000;

// A document owns its session: independent tabs (including duplicated tabs) must
// never inherit one another's handling authority through cloned sessionStorage.
let sessionId: string | undefined;
export function getOrderHandlingSession(): string {
  sessionId ??= typeof crypto.randomUUID === "function" ? crypto.randomUUID() :
    "10000000-1000-4000-8000-100000000000".replace(/[018]/g, value =>
      (Number(value) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(value) / 4)))).toString(16));
  return sessionId;
}

// Each mounted detail workspace gets a new generation. A release left over
// from a previous visit must never release a later visit's reservation.
export function beginOrderHandlingSession(): string {
  sessionId = undefined;
  return getOrderHandlingSession();
}

const queues = new Map<string, Promise<unknown>>();
// Cleanup queues release before a later mount can acquire the same resource.
export function serializeOrderHandling<T>(key: string, action: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(action);
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
  return next;
}
