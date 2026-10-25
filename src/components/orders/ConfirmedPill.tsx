import { useCallback, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { confirmedPill } from "@/lib/confirmedPill";

const spring = { type: "spring", stiffness: 400, damping: 32, mass: 0.62 } as const;
const fade = { duration: 0.2 } as const;

/** Floating black pill: "Saving order…" morphs into "Order confirmed". Mounted once in the dashboard layout. */
export function ConfirmedPill() {
  const state = useSyncExternalStore(confirmedPill.subscribe, confirmedPill.getSnapshot, confirmedPill.getSnapshot);
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState<number | null>(null);
  // The pill's width follows whichever content is current, so it morphs between them.
  const measure = useCallback((element: HTMLDivElement | null) => {
    if (element) setWidth(element.offsetWidth || null);
  }, []);
  const contentKey = state?.phase === "confirmed" ? `confirmed:${state.orderLabel}` : "saving";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4">
      <AnimatePresence>
        {state && (
          <motion.div
            key="confirmed-pill"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="overflow-hidden rounded-[20px] bg-black text-white shadow-[0_10px_30px_rgba(0,0,0,0.22)]"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.96, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)", width: width ?? "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96, filter: "blur(4px)", transition: { duration: 0.2, ease: "easeOut" } }}
            transition={reduceMotion ? fade : spring}
          >
            <div className="relative h-11">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                  key={contentKey}
                  ref={measure}
                  className="flex h-11 w-max items-center gap-[11px] whitespace-nowrap px-5"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -6, filter: "blur(4px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 6, filter: "blur(4px)" }}
                  transition={reduceMotion ? fade : spring}
                >
                  {state.phase === "saving" ? (
                    <>
                      <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      <span className="text-[14px] font-semibold">Saving order…</span>
                    </>
                  ) : (
                    <>
                      <motion.span
                        aria-hidden="true"
                        className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#34c26f]"
                        initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={spring}
                      >
                        <svg viewBox="0 0 12 12" fill="none" className="h-[11px] w-[11px]">
                          <motion.path
                            d="M2.5 6.3l2.3 2.3 4.7-5"
                            stroke="#fff"
                            strokeWidth={1.9}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            initial={reduceMotion ? false : { pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
                          />
                        </svg>
                      </motion.span>
                      <span className="text-[14px] font-semibold">Order confirmed</span>
                      {state.orderLabel && (
                        <>
                          <span aria-hidden="true" className="h-[3px] w-[3px] rounded-full bg-white/35" />
                          <span className="text-[12.5px] font-medium text-white/55">{state.orderLabel}</span>
                        </>
                      )}
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
