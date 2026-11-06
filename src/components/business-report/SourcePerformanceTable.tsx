import { useMemo, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/base/table/table";
import type { BusinessReportResponse } from "@/components/business-report/types";
import {
  EMPTY_FILTERS,
  NOT_SET,
  filterOptions,
  summarizeAbandoned,
  summarizeOrders,
  type GroupBy,
  type OrderFilterKey,
  type OrderFilters,
  type OutcomeCounts,
} from "@/lib/sourceOutcomeSummary";
import { rate } from "@/lib/businessReportMetrics";

const COLORS = { confirmed: "#1F9D63", hold: "#4F7BD9", cancelled: "#D9483B", open: "#9AA0A6" };

const formatNumber = (value: number) => Number(value || 0).toLocaleString("en-BD");
const formatPct = (part: number, whole: number) => `${Math.round(rate(part, whole))}%`;

const PAYMENT_LABELS: Record<string, string> = { cod: "Cash on delivery" };
const titleCase = (value: string) => value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const FILTERS: Array<{ key: OrderFilterKey; label: string }> = [
  { key: "product", label: "Product" },
  { key: "source", label: "Source" },
  { key: "courier", label: "Courier" },
  { key: "payment", label: "Payment" },
];

// BoardUI table (.bui-table). The last column shrinks to its content so the
// table has no dead space on the right. Columns whose header carries a status
// dot indent their values by the dot's width, so numbers start under the word.
const LAST = "w-px whitespace-nowrap";
// .bui-table cell rules outrank plain utilities, so cell overrides use "!".
const UNDER_DOT = "pl-[25px]!";
const ROW = "cursor-default!";
const TOTAL_CELL = "font-semibold!";
const TABLE_CONTAINER = "overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)]";

function Dot({ color }: { color: string }) {
  return <span aria-hidden className="mr-1.5 inline-block size-[7px] rounded-[2px] align-[1px]" style={{ background: color }} />;
}

function Count({ value, of }: { value: number; of: number }) {
  return (
    <>
      {formatNumber(value)}
      <span className="ml-1.5 text-[11px] text-black/60">{formatPct(value, of)}</span>
    </>
  );
}

function FilterMenu({
  label,
  selected,
  options,
  display,
  onChange,
}: {
  label: string;
  selected: string[];
  options: Array<{ value: string; count: number }>;
  display: (value: string) => string;
  onChange: (next: string[]) => void;
}) {
  const summary = selected.length === 0 ? "All" : selected.length === 1 ? display(selected[0]) : `${selected.length} selected`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-[12px] text-black shadow-[0_0_0_1px_rgba(0,0,0,0.09)] transition-[transform,box-shadow] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 ${selected.length ? "shadow-[0_0_0_1px_rgba(0,0,0,0.3)]" : ""}`}
      >
        <span className={selected.length ? "text-black" : "text-black/60"}>{label}:</span>
        <span className="max-w-[160px] truncate">{summary}</span>
        <CaretDown weight="light" size={11} className="text-black/50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[320px] min-w-[220px] overflow-y-auto">
        {options.length === 0 && <p className="px-2 py-1.5 text-[12px] text-black/60">No options in this range</p>}
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => onChange(checked ? [...selected, option.value] : selected.filter((value) => value !== option.value))}
            className="text-[12px]"
          >
            <span className="truncate">{display(option.value)}</span>
            <span className="ml-auto pl-3 tabular-nums text-black/60">{formatNumber(option.count)}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])} className="text-[12px] text-black/70">Clear {label.toLowerCase()}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// React Aria collections need <TableRow> directly in <TableBody>, so this is a
// render function rather than a component.
function outcomeRow(id: string, name: string, counts: OutcomeCounts, total = false) {
  const cell = total ? TOTAL_CELL : "";
  return (
    <TableRow id={id} key={id} className={ROW}>
      <TableCell className={total ? TOTAL_CELL : "font-medium!"}>{name}</TableCell>
      <TableCell className="text-[15px]! font-semibold!">{formatNumber(counts.got)}</TableCell>
      <TableCell className={`${UNDER_DOT} ${cell}`}><Count value={counts.confirmed} of={counts.got} /></TableCell>
      <TableCell className={`${UNDER_DOT} ${cell}`}><Count value={counts.hold} of={counts.got} /></TableCell>
      <TableCell className={`${UNDER_DOT} ${LAST} ${cell}`}><Count value={counts.cancelled} of={counts.got} /></TableCell>
    </TableRow>
  );
}

export function SourcePerformanceTable({ report }: { report: BusinessReportResponse }) {
  const [groupBy, setGroupBy] = useState<GroupBy>("source");
  const [filters, setFilters] = useState<OrderFilters>(EMPTY_FILTERS);
  const facts = useMemo(() => report.order_facts ?? [], [report.order_facts]);

  const sourceLabels = useMemo(() => new Map(report.sources.map((source) => [source.source, source.label])), [report.sources]);
  const display: Record<OrderFilterKey, (value: string) => string> = {
    product: (value) => value,
    source: (value) => sourceLabels.get(value) ?? titleCase(value),
    courier: (value) => (value === NOT_SET ? "Not sent" : value),
    payment: (value) => (value === NOT_SET ? NOT_SET : PAYMENT_LABELS[value.toLowerCase()] ?? titleCase(value)),
  };

  const { rows, total } = useMemo(() => summarizeOrders(facts, filters, groupBy), [facts, filters, groupBy]);
  const abandoned = useMemo(() => summarizeAbandoned(report.abandoned_facts ?? [], filters), [report.abandoned_facts, filters]);
  const filtered = Object.values(filters).some((values) => values.length > 0);
  const noun = groupBy === "source" ? "Source" : "Product";

  return (
    <div className="flex flex-col gap-3">
      <section aria-labelledby="source-performance-heading" className="flex flex-col gap-3 rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 id="source-performance-heading" className="font-sf-display text-[15px] font-semibold text-black">{noun} performance</h2>
          <div className="h-3.5 w-px self-center bg-black/10" />
          <span className="text-[13px] tabular-nums text-black/60">{formatNumber(total.got)} {total.got === 1 ? "order" : "orders"}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-black/[0.08] pb-3">
          <div role="group" aria-label="View by" className="mr-1.5 inline-flex rounded-lg bg-black/[0.05] p-0.5">
            {(["source", "product"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={groupBy === value}
                onClick={() => setGroupBy(value)}
                className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 ${groupBy === value ? "bg-white text-black shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-black/60"}`}
              >
                By {value}
              </button>
            ))}
          </div>
          {FILTERS.map(({ key, label }) => (
            <FilterMenu
              key={key}
              label={label}
              selected={filters[key]}
              options={filterOptions(facts, filters, key)}
              display={display[key]}
              onChange={(next) => setFilters((current) => ({ ...current, [key]: next }))}
            />
          ))}
          {filtered && (
            <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="px-1.5 py-1 text-[12px] text-black/60 underline underline-offset-2 hover:text-black">
              Clear filters
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-black/60">No orders match these filters.</p>
        ) : (
          <Table aria-label={`${noun} performance`} containerClassName={TABLE_CONTAINER} className="min-w-[560px] tabular-nums">
            <TableHeader>
              <TableColumn id="name" isRowHeader>{noun}</TableColumn>
              <TableColumn id="got">Got</TableColumn>
              <TableColumn id="confirmed"><Dot color={COLORS.confirmed} />Confirmed</TableColumn>
              <TableColumn id="hold"><Dot color={COLORS.hold} />Hold</TableColumn>
              <TableColumn id="cancelled" className={LAST}><Dot color={COLORS.cancelled} />Cancelled</TableColumn>
            </TableHeader>
            <TableBody>
              {rows.map((row) => outcomeRow(row.key, groupBy === "source" ? display.source(row.key) : row.key, row))}
              {rows.length > 1 && outcomeRow("__total", groupBy === "source" ? "All sources" : "All orders", total, true)}
            </TableBody>
          </Table>
        )}
        <p className="text-[12px] text-black/60">
          Got = every order received, including pending. Confirmed = approved. Hold = on hold. Cancelled includes RTO.
          {groupBy === "product" && " An order with several products counts under each one."}
        </p>
      </section>

      <section aria-labelledby="abandoned-orders-heading" className="flex flex-col gap-3 rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 id="abandoned-orders-heading" className="font-sf-display text-[15px] font-semibold text-black">Abandoned orders</h2>
          <div className="h-3.5 w-px self-center bg-black/10" />
          <span className="text-[13px] text-black/60">Website checkouts</span>
        </div>
        {abandoned === null ? (
          <p className="py-4 text-center text-[13px] text-black/60">Abandoned checkouts only come from the website. Add Website to the Source filter to see them.</p>
        ) : abandoned.abandoned === 0 ? (
          <p className="py-4 text-center text-[13px] text-black/60">No abandoned checkouts in this range.</p>
        ) : (
          <Table aria-label="Abandoned orders" containerClassName={TABLE_CONTAINER} className="tabular-nums">
            <TableHeader>
              <TableColumn id="status" isRowHeader><Dot color="transparent" />Status</TableColumn>
              <TableColumn id="count">Count</TableColumn>
              <TableColumn id="share" className={LAST}>Share</TableColumn>
            </TableHeader>
            <TableBody>
              {([
                ["Abandoned", abandoned.abandoned, null],
                ["Confirmed", abandoned.confirmed, COLORS.confirmed],
                ["Dismissed", abandoned.dismissed, COLORS.cancelled],
                ["Still open", abandoned.open, COLORS.open],
              ] as const).map(([label, value, color]) => (
                <TableRow id={label} key={label} className={ROW}>
                  <TableCell className="font-medium!"><Dot color={color ?? "transparent"} />{label}</TableCell>
                  <TableCell className={color ? "" : "text-[15px]! font-semibold!"}>{formatNumber(value)}</TableCell>
                  <TableCell className={LAST}>{formatPct(value, abandoned.abandoned)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-[12px] text-black/60">Follows the Product filter. Confirmed = turned into a real order. Dismissed includes expired checkouts.</p>
      </section>
    </div>
  );
}
