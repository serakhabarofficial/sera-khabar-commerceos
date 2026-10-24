import { AsyncLocalStorage } from "node:async_hooks";

const scope = new AsyncLocalStorage();
export const withOrderHandlingOperation = (signal, work) => scope.run({ signal }, work);
export const withoutOrderHandlingOperation = work => scope.run(undefined, work);

// Protected handlers use this for both Supabase and external requests. Losing
// the operation aborts pending work and forbids later requests from that handler.
// Unrelated public/webhook/system requests retain their existing behavior.
export function orderHandlingFetch(input, options = {}) {
  const context = scope.getStore();
  if (!context) return globalThis.fetch(input, options);
  context.signal.throwIfAborted();
  const signals = [context.signal, AbortSignal.timeout(30_000)];
  if (options.signal) signals.push(options.signal);
  return globalThis.fetch(input, { ...options, signal: AbortSignal.any(signals) });
}
