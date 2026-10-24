import { useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "framer-motion";
import { Eye, LockSimple } from "@phosphor-icons/react";
import type { OrderHandlingState } from "@/hooks/useOrderHandling";

const buttonClass = "rounded-lg px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 disabled:opacity-40";
export function OrderHandlingNotice({ handling, dirty = false, onBack }: { handling: OrderHandlingState; dirty?: boolean; onBack: () => void }) {
  const [dismissed, setDismissed] = useState("");
  const reduced = useReducedMotion();
  const signature = `${handling.resourceKey}:${handling.holder?.name ?? ""}`;
  const occupied = handling.status === "view_only" && Boolean(handling.holder?.name);
  const message = occupied ? `${handling.holder!.name} is working on this order` : handling.status === "checking" ? "Checking who is handling this order…" : handling.status === "error" ? (handling.error || "Handling status is unavailable. You can only view this order.") : "You are viewing this order. Start handling to make changes.";
  if (handling.canEdit) return null;
  return <>
    <motion.div role="status" initial={{ opacity: 0, y: reduced ? 0 : -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.18 }} className="flex flex-wrap items-center gap-3 rounded-lg bg-black/[0.04] px-4 py-3 text-[13px] text-black">
      <Eye weight="light" size={18} aria-hidden />
      <div className="flex-1"><p>{message}</p>{dirty && <p className="mt-1 text-xs text-black/65">Your unsaved draft is retained. Starting again keeps your draft; saving still checks for changes made by others.</p>}</div>
      {handling.status === "error" && <button className={buttonClass} onClick={() => void handling.retryStatus()}>Retry status</button>}
      {handling.status === "available" && <button className={`${buttonClass} bg-black text-white`} onClick={() => void handling.startHandling()}>Start handling</button>}
    </motion.div>
    <Dialog.Root open={occupied && dismissed !== signature} onOpenChange={open => { if (!open) setDismissed(signature); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25" />
        <Dialog.Content data-order-handling-notice className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-[#FAFAF8] p-6 outline-none">
          <motion.div initial={{ opacity: 0, y: reduced ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.18 }}>
            <LockSimple weight="light" size={24} aria-hidden className="mb-4" />
            <Dialog.Title className="text-xl font-light">{handling.holder?.name} is working on this order</Dialog.Title>
            <Dialog.Description className="mt-3 text-sm text-black/65">You can read and copy the details. Editing, calling and messaging are paused while they handle it.</Dialog.Description>
            <div className="mt-6 flex justify-end gap-2"><button className={buttonClass} onClick={onBack}>Back to orders</button><Dialog.Close className={`${buttonClass} bg-black text-white`}>View only</Dialog.Close></div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}

function allowedRead(element: Element) {
  const label = element.getAttribute("aria-label") || element.textContent || "";
  return /^copy\b|\bcopied\b|^open order\b|^back\b|^cancel$|^close$|^logs$|^order details$|^risk$/i.test(label.trim()) || element.getAttribute("role") === "radio";
}
function contactLink(element: Element) {
  return element.matches('a[href^="tel:"],a[href*="wa.me"],a[href*="whatsapp.com"],a[data-order-handling-contact]');
}
// Child editors include native controls, custom buttons and portal dialogs.
// Capture also guards already-open portals on owner loss; the DOM gate gives
// native controls real disabled semantics without blocking copy/read actions.
export function OrderHandlingWorkspace({ canEdit, children, onDraftChange }: { canEdit: boolean; children: ReactNode; onDraftChange?: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (canEdit || !root.current) return;
    const previous = new Map<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement, boolean>();
    const links = new Map<HTMLAnchorElement, { href: string | null; tabIndex: string | null }>();
    const disable = () => {
      const scopes: Element[] = [root.current!, ...document.querySelectorAll<HTMLElement>('[role="dialog"]:not([data-order-handling-notice])')];
      for (const scope of scopes) {
      scope.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>("button,input,select,textarea").forEach(element => {
        if (allowedRead(element)) return;
        if (!element.disabled) {
          if (!previous.has(element)) previous.set(element, false);
          element.disabled = true;
        }
      });
      scope.querySelectorAll<HTMLAnchorElement>("a").forEach(element => {
        if (!contactLink(element)) return;
        if (!links.has(element)) links.set(element, { href: element.getAttribute("href"), tabIndex: element.getAttribute("tabindex") });
        element.setAttribute("data-order-handling-contact", "");
        if (element.hasAttribute("href")) element.removeAttribute("href");
        element.setAttribute("aria-disabled", "true"); element.setAttribute("tabindex", "-1");
      });
      }
    };
    disable();
    const observer = new MutationObserver(disable);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "href"] });
    return () => {
      observer.disconnect(); previous.forEach((disabled, element) => { element.disabled = disabled; });
      links.forEach((value, element) => { element.removeAttribute("data-order-handling-contact"); if (value.href !== null) element.setAttribute("href", value.href); element.removeAttribute("aria-disabled"); if (value.tabIndex === null) element.removeAttribute("tabindex"); else element.setAttribute("tabindex", value.tabIndex); });
    };
  }, [canEdit, children]);
  const guard = (event: SyntheticEvent) => {
    if (canEdit || !(event.target instanceof Element)) return;
    const control = event.target.closest("button,input,select,textarea,a,[role=button],[role=menuitem],[role=option],[role=checkbox]");
    if (control && !allowedRead(control) && (control.tagName !== "A" || contactLink(control))) { event.preventDefault(); event.stopPropagation(); }
  };
  return <div ref={root} className="contents" onClickCapture={guard} onChangeCapture={event => { guard(event); if (canEdit) onDraftChange?.(); }} onKeyDownCapture={event => { if (event.key === "Enter" || event.key === " ") guard(event); }}>{children}</div>;
}
