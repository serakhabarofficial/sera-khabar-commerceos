import { useState } from "react";
import { CaretRight } from "@phosphor-icons/react";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { formatTaka } from "@/lib/orderEditor";
import { teamOrderStatusTone, type TeamChatOrder } from "@/lib/teamChat";

// A mentioned order, collapsible like a ReUI frame. The header toggles the
// details; "View order" opens the full order beside the thread.
export function TeamOrderCard({ order, onOpen }: { order: TeamChatOrder; onOpen: () => void }) {
  const [open, setOpen] = useState(true);
  // Cards arrive already open; only a click animates, so a thread never grows while it settles.
  const [toggled, setToggled] = useState(false);
  return (
    <div className="w-[264px] max-w-full text-left">
      <Frame stacked dense spacing="sm"
        className="w-full bg-[#f4f3ef] text-[#0b0b0a] [--frame-border-color:#e6e5e0] [--frame-panel-bg:#ffffff] [--frame-panel-border-color:#e6e5e0]">
        <Collapsible open={open} onOpenChange={(next) => { setToggled(true); setOpen(next); }} className="group/order">
          <CollapsibleTrigger className="flex w-full rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-black/15">
            <FrameHeader className="flex grow flex-row items-center justify-between gap-2">
              <FrameTitle className="min-w-0 truncate text-[13px] font-medium">
                #{order.order_number} <span className="font-normal text-black/45">·</span> {formatTaka(order.price)}
              </FrameTitle>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize", teamOrderStatusTone(order.status))}>{order.status.replace(/_/g, " ")}</span>
                <CaretRight weight="light" size={13} aria-hidden="true" className="text-black/45 transition-transform duration-200 ease-out group-data-[state=open]/order:rotate-90" />
              </span>
            </FrameHeader>
          </CollapsibleTrigger>
          <CollapsibleContent className={cn("overflow-hidden", toggled && "team-order-collapse")}>
            <FramePanel>
              <dl className="space-y-1.5 text-[12px]">
                <div className="flex justify-between gap-3"><dt className="text-black/45">Customer</dt><dd className="min-w-0 truncate font-medium">{order.customer_name || "—"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-black/45">Courier</dt><dd className="min-w-0 truncate font-medium">{order.courier_name || "Not sent"}</dd></div>
              </dl>
              <button type="button" onClick={onOpen}
                className="mt-3 flex h-8 w-full items-center justify-center rounded-lg bg-[#0b0b0a] text-[12px] font-medium text-white transition-transform duration-150 ease-out active:scale-[0.97]">
                View order
              </button>
            </FramePanel>
          </CollapsibleContent>
        </Collapsible>
      </Frame>
    </div>
  );
}

// Stands in for a card while its order loads, at the same size, so the real
// card replaces it without moving the thread.
export function TeamOrderCardPlaceholder({ orderNumber }: { orderNumber: string }) {
  return (
    <div className="w-[264px] max-w-full text-left" aria-label={`Loading order ${orderNumber}`}>
      <Frame stacked dense spacing="sm"
        className="w-full bg-[#f4f3ef] text-[#0b0b0a] [--frame-border-color:#e6e5e0] [--frame-panel-bg:#ffffff] [--frame-panel-border-color:#e6e5e0]">
        <div>
          <div className="flex w-full">
            <FrameHeader className="flex grow flex-row items-center justify-between gap-2">
              <FrameTitle className="min-w-0 truncate text-[13px] font-medium">#{orderNumber}</FrameTitle>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="h-[18px] w-14 rounded-full bg-black/[0.06]" />
                <CaretRight weight="light" size={13} aria-hidden="true" className="rotate-90 text-black/25" />
              </span>
            </FrameHeader>
          </div>
          <div className="overflow-hidden">
            <FramePanel>
              <div className="space-y-1.5 text-[12px]">
                <div className="flex justify-between gap-3"><span className="text-black/45">Customer</span><span className="my-[3px] h-3 w-20 rounded-full bg-black/[0.06]" /></div>
                <div className="flex justify-between gap-3"><span className="text-black/45">Courier</span><span className="my-[3px] h-3 w-14 rounded-full bg-black/[0.06]" /></div>
              </div>
              <div className="mt-3 h-8 w-full rounded-lg bg-black/[0.08]" />
            </FramePanel>
          </div>
        </div>
      </Frame>
    </div>
  );
}
