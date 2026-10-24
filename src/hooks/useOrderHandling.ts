import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { beginOrderHandlingSession, ORDER_HANDLING_CONFLICT_EVENT, ORDER_HANDLING_IDLE_MS, serializeOrderHandling, type OrderHandlingKind, type OrderHandlingResponse } from "@/lib/orderHandling";

type Status = OrderHandlingResponse["status"] | "checking" | "error";
type State = { error?: string; status: Status; holder: OrderHandlingResponse["holder"]; expires_at: string | null };
const checking: State = { status: "checking", holder: null, expires_at: null };
const available: State = { status: "available", holder: null, expires_at: null };
type Options = { beforeStart?: () => Promise<void> };

export function useOrderHandling(kind: OrderHandlingKind, id?: string | null, options: Options = {}) {
  const key = id ? `${kind}/${id}` : "";
  const [state, setState] = useState<State & { key: string }>({ ...checking, key });
  const beforeStart = useRef(options.beforeStart);
  beforeStart.current = options.beforeStart;
  const controls = useRef({ start: async () => {}, status: async () => {} });

  useEffect(() => {
    if (!id) { setState({ ...available, key }); return; }
    let session = beginOrderHandlingSession();
    let disposed = false;
    let stopped = false;
    let revision = 0;
    let current: Status = "checking";
    let lastActivity = Date.now();
    let activity = false;
    let pending = false;
    let confirmedExpiry: number | null = null;
    const update = (next: State) => {
      current = next.status;
      if (!disposed) setState({ ...next, key });
    };
    const endpoint = `/api/order-handling/${kind}/${encodeURIComponent(id)}`;
    const request = async (action: "acquire" | "heartbeat" | "status" | "release", active?: boolean, requestSession = session) => {
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout>;
      try {
        const response = await Promise.race([
          apiFetch(endpoint, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, session_id: requestSession, ...(active === undefined ? {} : { active }) }),
            signal: controller.signal,
            ...(action === "release" ? { keepalive: true } : {}),
          }),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => {
            controller.abort(); reject(new Error("Handling status timed out"));
          }, 12_000); }),
        ]);
        if (!response.ok) throw new Error("Handling status unavailable");
        const value = await response.json() as OrderHandlingResponse;
        if (!["handling", "view_only", "available"].includes(value.status)) throw new Error("Invalid handling status");
        return value;
      } finally { clearTimeout(timeout!); }
    };
    const release = () => {
      const releasedSession = session;
      return serializeOrderHandling(key, () => request("release", undefined, releasedSession)).catch(() => {});
    };
    const run = async (action: "acquire" | "heartbeat" | "status", explicit = false) => {
      if (disposed || stopped || pending) return;
      pending = true;
      if (action === "acquire" && explicit) session = beginOrderHandlingSession();
      const generation = revision;
      if (action === "acquire") update(checking);
      try {
        await serializeOrderHandling(key, async () => {
          if (disposed || stopped || generation !== revision) return;
          const active = activity;
          if (action === "heartbeat") activity = false;
          const value = await request(action, action === "heartbeat" ? active : undefined);
          if (disposed || stopped || generation !== revision) return;
          if (action === "acquire" && value.status === "handling") await beforeStart.current?.();
          if (disposed || stopped || generation !== revision) return;
          // Status is read-only. Returning availability always requires a deliberate start.
          if (value.status === "handling") {
            const expires = value.expires_at ? Date.parse(value.expires_at) : NaN;
            confirmedExpiry = Number.isFinite(expires) ? expires : null;
          }
          if (value.status === "handling" && confirmedExpiry !== null && confirmedExpiry <= Date.now()) { expire(); return; }
          if (action === "status" && value.status === "handling" && current !== "handling") update(available);
          else update(value);
          if (action === "acquire" && value.status === "handling") { lastActivity = Date.now(); activity = false; }
        });
      } catch (error) {
        if (!disposed && !stopped && generation === revision) {
          update({ ...available, status: "error", error: error instanceof Error ? error.message : "Handling status unavailable" });
          void release();
        }
      } finally { pending = false; }
    };
    controls.current = { start: () => run("acquire", true), status: () => run("status") };
    update(checking);
    void run("acquire");
    const onActivity = () => {
      if (current !== "handling" || stopped) return;
      // A throttled/background timer must not let a late event revive an idle lease.
      if (Date.now() - lastActivity >= ORDER_HANDLING_IDLE_MS || (confirmedExpiry !== null && Date.now() >= confirmedExpiry)) { expire(); return; }
      lastActivity = Date.now(); activity = true;
    };
    const expire = () => { revision++; update(available); void release(); };
    const onConflict = (event: Event) => {
      revision++;
      const holder = (event as CustomEvent<Partial<OrderHandlingResponse>>).detail?.holder ?? null;
      update({ status: "view_only", holder, expires_at: null });
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      stopped = false; revision++; confirmedExpiry = null; update(available);
    };
    const onPageHide = () => { stopped = true; revision++; update(available); void release(); };
    const activityEvents = ["pointerdown", "keydown", "input", "wheel", "touchstart"] as const;
    activityEvents.forEach(event => window.addEventListener(event, onActivity, { passive: true, capture: true }));
    window.addEventListener(ORDER_HANDLING_CONFLICT_EVENT, onConflict);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    const idleTimer = window.setInterval(() => {
      if (current === "handling" && (Date.now() - lastActivity >= ORDER_HANDLING_IDLE_MS || (confirmedExpiry !== null && Date.now() >= confirmedExpiry))) expire();
    }, 1000);
    const heartbeat = window.setInterval(() => {
      if (current !== "handling") return;
      if (Date.now() - lastActivity >= ORDER_HANDLING_IDLE_MS) expire();
      else void run("heartbeat");
    }, 15_000);
    const poll = window.setInterval(() => { if (current === "view_only" || current === "available") void run("status"); }, 10_000);
    return () => {
      disposed = true; revision++;
      window.clearInterval(idleTimer); window.clearInterval(heartbeat); window.clearInterval(poll);
      activityEvents.forEach(event => window.removeEventListener(event, onActivity, true));
      window.removeEventListener(ORDER_HANDLING_CONFLICT_EVENT, onConflict);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      void release();
    };
  }, [id, key, kind]);

  const visible = state.key === key ? state : checking;
  return { ...visible, canEdit: Boolean(id) && visible.status === "handling", resourceKey: key,
    startHandling: () => controls.current.start(), retryStatus: () => controls.current.status() };
}
export type OrderHandlingState = ReturnType<typeof useOrderHandling>;
