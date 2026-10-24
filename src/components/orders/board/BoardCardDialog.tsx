import { useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "@phosphor-icons/react";
import type { BoardCard, BoardList } from "@/lib/orderBoard";
import { BoardCardDetail, type BoardCardActions } from "./BoardCardDetail";

// Opens with a quick ease-out; closes a little faster than it opens.
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const OPEN = { duration: 0.24, ease: EASE_OUT };
const CLOSE = { duration: 0.16, ease: EASE_OUT };

/** The card detail as a dialog, for screens too narrow for the Split Inbox's detail pane. */
export function BoardCardDialog({
  card: incomingCard,
  lists,
  today,
  onClose,
  ...actions
}: {
  card: BoardCard | null;
  lists: BoardList[];
  today: string;
  onClose: () => void;
} & BoardCardActions) {
  const reduceMotion = useReducedMotion();
  // Keep showing the last card while the dialog animates closed.
  const lastCard = useRef<BoardCard | null>(null);
  if (incomingCard) lastCard.current = incomingCard;
  const card = incomingCard ?? lastCard.current;
  const open = Boolean(incomingCard);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <AnimatePresence>
        {open && card && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay forceMount asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/30"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: OPEN }}
                exit={{ opacity: 0, transition: CLOSE }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content forceMount asChild aria-describedby={undefined}>
              <motion.div
                className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(760px,calc(100dvh-32px))] w-[min(560px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_16px_40px_rgba(0,0,0,0.16)] outline-none"
                style={{ x: "-50%", y: "-50%" }}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1, transition: OPEN }}
                exit={reduceMotion ? { opacity: 0, transition: CLOSE } : { opacity: 0, scale: 0.97, transition: CLOSE }}
              >
                <DialogPrimitive.Close
                  aria-label="Close"
                  className="absolute right-3.5 top-3.5 z-10 grid h-8 w-8 place-items-center rounded-lg text-black/45 transition-[background-color,color,transform] duration-150 hover:bg-black/[0.05] hover:text-black active:scale-[0.96]"
                >
                  <X weight="light" className="h-4 w-4" />
                </DialogPrimitive.Close>
                <BoardCardDetail card={card} lists={lists} today={today} Title={DialogPrimitive.Title} className="max-h-[inherit] min-h-0" {...actions} />
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
