import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/base/segmented-control/segmented-control";
import {
  ORDER_STATUS_FILTERS,
  type OrderStatusFilter,
} from "@/lib/orderStatusFilters";

type StatusPresentation = {
  label: string;
  dotClassName: string;
};

export type FulfillmentQueueTab = OrderStatusFilter | "abandoned";

const STATUS_PRESENTATION: Record<FulfillmentQueueTab, StatusPresentation> = {
  all: {
    label: "All Orders",
    dotClassName: "bg-black/60",
  },
  abandoned: {
    label: "Incomplete orders",
    dotClassName: "bg-rose-400",
  },
  pending: {
    label: "Pending",
    dotClassName: "bg-amber-400",
  },
  on_hold: {
    label: "On Hold",
    dotClassName: "bg-orange-400",
  },
  approved: {
    label: "Confirmed",
    dotClassName: "bg-sky-500",
  },
  print: {
    label: "Print",
    dotClassName: "bg-lime-500",
  },
  processing: {
    label: "Ready to Transit",
    dotClassName: "bg-violet-500",
  },
  ready_to_ship: {
    label: "Ready To Ship",
    dotClassName: "bg-cyan-500",
  },
  in_transit: {
    label: "In-Transit",
    dotClassName: "bg-indigo-500",
  },
  delivered: {
    label: "Delivered",
    dotClassName: "bg-emerald-500",
  },
  stuck: {
    label: "Follow up",
    dotClassName: "bg-rose-500",
  },
  cancelled: {
    label: "Cancelled",
    dotClassName: "bg-zinc-400",
  },
};

export const FULFILLMENT_QUEUE_TABS: FulfillmentQueueTab[] = [
  "all",
  "pending",
  "abandoned",
  ...ORDER_STATUS_FILTERS.filter((status) => status !== "all" && status !== "pending"),
];

export type OrderStatusSegmentedControlProps = {
  counts: Record<OrderStatusFilter, number>;
  abandonedCount?: number;
  value: FulfillmentQueueTab;
  onChange: (value: FulfillmentQueueTab) => void;
  loading?: boolean;
  hiddenStatuses?: OrderStatusFilter[];
};

export function OrderStatusSegmentedControl({
  counts,
  abandonedCount = 0,
  value,
  onChange,
  loading = false,
  hiddenStatuses = [],
}: OrderStatusSegmentedControlProps) {
  return (
    <div
      data-testid="order-status-scroll-container"
      className="w-full overflow-x-auto border-b border-black/[0.07] bg-[#F2F2F0] px-1 py-2.5 [scrollbar-width:thin] sm:px-2"
    >
      <SegmentedControl
        data-testid="order-status-control"
        aria-label="Filter orders by status"
        selectedKeys={new Set([value])}
        onSelectionChange={(keys) => {
          const selected = [...keys][0];
          if (selected) onChange(String(selected) as FulfillmentQueueTab);
        }}
        // Strong ease-out over 240ms so the thumb glides into place instead of easing in.
        thumbClassName="rounded-[9px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.05)] duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
        className="w-max min-w-full rounded-xl bg-black/[0.045] p-1 ring-1 ring-black/[0.03] xl:flex xl:w-full"
      >
        {FULFILLMENT_QUEUE_TABS.filter((status) => status === "abandoned" || !hiddenStatuses.includes(status)).map((status) => {
          const presentation = STATUS_PRESENTATION[status];
          const count = status === "abandoned" ? abandonedCount : counts[status];
          const formattedCount = count.toLocaleString("en-BD");

          return (
            <SegmentedControlItem
              key={status}
              id={status}
              aria-label={`${presentation.label}: ${loading ? "loading" : formattedCount}`}
              className={({ isSelected }) => [
                "group min-w-[96px] flex-auto flex-col items-center justify-start rounded-[9px] px-3.5 pb-[11px] pt-3 text-center",
                "transition-[background-color,color] duration-150 ease-out data-[pressed]:scale-[0.98]",
                isSelected ? "text-black" : "text-black/60 hover:bg-white/40",
              ].join(" ")}
            >
              <span
                data-testid={`order-status-count-${status}`}
                className={[
                  "block text-[22px] font-medium leading-none tabular-nums tracking-[-0.02em] transition-colors duration-150 ease-out",
                  "group-data-[selected]:text-black",
                  count === 0 && !loading ? "text-black/[0.28]" : "text-black/55",
                ].join(" ")}
              >
                {loading ? "—" : formattedCount}
              </span>
              <span className="mt-[9px] flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium leading-none text-black/60 transition-colors duration-150 ease-out group-data-[selected]:text-black/60">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${presentation.dotClassName}`}
                />
                {presentation.label}
              </span>
            </SegmentedControlItem>
          );
        })}
      </SegmentedControl>
    </div>
  );
}
