import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Popover as AriaPopover,
  RangeCalendar,
  RangeCalendarStateContext,
} from "react-aria-components";
import { CalendarDate } from "@internationalized/date";
import { ChevronDown } from "lucide-react";
import { ArrowRight, CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { SolarCalendarIcon } from "@/components/SolarDateIcons";
import {
  DateField,
  MonthPanel,
  pickerPrimaryButtonClassName,
  pickerSecondaryButtonClassName,
  popoverClassName,
} from "@/components/base/date-picker/shared";
import {
  buildDateRangeMenu,
  flattenDateRangeMenu,
  type DateRangeMenuGroup,
  type DateRangePreset,
} from "@/lib/dateRangePresets";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useDismissOnOutsidePress, useTriggerToggle } from "@/utils/use-dismiss-on-outside-press";

/**
 * The trigger button (icon, date-range text, border) is this app's own. The
 * popover follows the approved reference: a grey preset rail whose "Last",
 * "Period to date" and "Quarters" rows slide in their own list, two editable
 * date fields, two months side by side, and Cancel/Apply. Presets and days
 * only change the pending range; nothing reaches the page until Apply.
 */

type DateRangeValue = { start: CalendarDate; end: CalendarDate };

const CUSTOM = "Custom range";
const ALL_TIME = "All time";

function toYMD(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function fmtRange(range: DateRange | null): string {
  if (!range?.from) return "All time";
  const from = format(range.from, "MMM d");
  if (!range.to || toYMD(range.from) === toYMD(range.to))
    return `${from}, ${format(range.from, "yyyy")}`;
  const to = format(range.to, "MMM d, yyyy");
  return `${from} – ${to}`;
}

/** The current Dhaka calendar day and hour. */
function dhakaNow(): { today: Date; hour: number } {
  const d = new Date(Date.now() + 6 * 60 * 60 * 1000);
  return { today: new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), hour: d.getUTCHours() };
}

function toCalendarDate(date: Date): CalendarDate {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function fromCalendarDate(date: CalendarDate): Date {
  return new Date(date.year, date.month - 1, date.day);
}

function toDateRangeValue(range: DateRange | null): DateRangeValue | null {
  if (!range?.from) return null;
  const start = toCalendarDate(range.from);
  const end = range.to ? toCalendarDate(range.to) : start;
  return { start, end };
}

function toDateRange(value: DateRangeValue): DateRange {
  return { from: fromCalendarDate(value.start), to: fromCalendarDate(value.end) };
}

function sameRange(preset: DateRangePreset, value: DateRange | null) {
  if (!preset.range || !value?.from) return !preset.range && !value?.from;
  const to = value.to ?? value.from;
  return (
    !!preset.range.from && !!preset.range.to &&
    toYMD(preset.range.from) === toYMD(value.from) && toYMD(preset.range.to) === toYMD(to)
  );
}

const railItemClass = (pressed: boolean, tight?: boolean) =>
  cn(
    "flex w-full shrink-0 cursor-pointer items-center justify-between rounded-lg px-1.5 text-left text-[13px] outline-none",
    "transition-[background-color,scale] duration-150 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#005BD3]",
    tight ? "h-[21px]" : "h-[26px]",
    pressed ? "bg-[#EBEBEB] font-semibold text-[#1A1A1A]" : "text-[#303030] hover:bg-[#F1F1F1]",
  );

const slideClass =
  "absolute inset-0 flex flex-col overflow-y-auto transition-[translate,opacity] duration-[280ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-opacity motion-reduce:duration-150";

function PresetRail({
  menu,
  picked,
  onPick,
  onCustom,
}: {
  menu: DateRangeMenuGroup[];
  picked: string;
  onPick: (preset: DateRangePreset) => void;
  onCustom: () => void;
}) {
  const [submenu, setSubmenu] = useState<string | null>(null);
  // Keeps the submenu's rows rendered while it slides back out.
  const [shown, setShown] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const lastOpened = useRef<string | null>(null);

  const submenus = menu.flatMap((group) => group.items).flatMap((item) => (item.kind === "submenu" ? [item] : []));
  const open = submenus.find((item) => item.label === shown);

  useEffect(() => {
    // The off-screen layer must not take focus or be read out.
    if (rootRef.current) rootRef.current.inert = submenu !== null;
    if (subRef.current) subRef.current.inert = submenu === null;
    if (submenu) backRef.current?.focus();
    else if (lastOpened.current) rootRef.current?.querySelector<HTMLButtonElement>(`[data-submenu="${lastOpened.current}"]`)?.focus();
  }, [submenu]);

  return (
    <div className="relative overflow-hidden border-[#EBEBEB] bg-[#F7F7F7] max-md:h-[172px] max-md:border-b md:border-r">
      <div
        ref={rootRef}
        className={cn(slideClass, submenu && "-translate-x-1/4 opacity-0 motion-reduce:translate-x-0")}
      >
        {menu.map((group, index) => (
          <div key={index} className={cn("flex flex-col p-1.5", index > 0 && "border-t border-[#EBEBEB]")}>
            {group.items.map((item) => {
              if (item.kind === "preset") {
                return (
                  <button
                    key={item.preset.label}
                    type="button"
                    aria-pressed={picked === item.preset.label}
                    onClick={() => onPick(item.preset)}
                    className={railItemClass(picked === item.preset.label, group.tight)}
                  >
                    {item.preset.label}
                  </button>
                );
              }
              if (item.kind === "custom") {
                return (
                  <button
                    key={item.label}
                    type="button"
                    aria-pressed={picked === CUSTOM}
                    onClick={onCustom}
                    className={railItemClass(picked === CUSTOM, group.tight)}
                  >
                    {item.label}
                  </button>
                );
              }
              const active = item.presets.some((preset) => preset.label === picked);
              return (
                <button
                  key={item.label}
                  type="button"
                  data-submenu={item.label}
                  aria-haspopup="true"
                  aria-expanded={submenu === item.label}
                  aria-pressed={active}
                  onClick={() => {
                    lastOpened.current = item.label;
                    setShown(item.label);
                    setSubmenu(item.label);
                  }}
                  className={railItemClass(active, group.tight)}
                >
                  {item.label}
                  <CaretRight weight="light" size={13} className="shrink-0 text-[#B5B5B5]" />
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div
        ref={subRef}
        className={cn(slideClass, submenu ? "translate-x-0" : "translate-x-full motion-reduce:translate-x-0 motion-reduce:opacity-0")}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && submenu === null) setShown(null);
        }}
      >
        {open && (
          <>
            <div className="p-1.5">
              <button
                ref={backRef}
                type="button"
                onClick={() => setSubmenu(null)}
                className={cn(railItemClass(false), "justify-start gap-1 pl-0.5 font-semibold text-[#1A1A1A]")}
              >
                <CaretLeft weight="light" size={15} className="shrink-0 text-[#616161]" />
                {open.label}
              </button>
            </div>
            <div className="flex flex-col border-t border-[#EBEBEB] p-1.5">
              {open.presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={picked === preset.label}
                  onClick={() => onPick(preset)}
                  className={railItemClass(picked === preset.label)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Everything inside the RangeCalendar, so it can read the in-progress selection. */
function PickerBody({
  menu,
  maxDate,
  picked,
  setPicked,
  pending,
  setPending,
  showSecondMonth,
  onCancel,
  onApply,
}: {
  menu: DateRangeMenuGroup[];
  maxDate: CalendarDate;
  picked: string;
  setPicked: (label: string) => void;
  pending: DateRangeValue | null;
  setPending: (value: DateRangeValue | null) => void;
  showSecondMonth: boolean;
  onCancel: () => void;
  onApply: () => void;
}) {
  const state = useContext(RangeCalendarStateContext);
  // After the first click of a manual pick, react-aria holds the anchor day
  // until the second click completes the range.
  const anchor = state?.anchorDate ?? null;
  const start = anchor ?? pending?.start ?? null;
  const end = anchor ? null : pending?.end ?? null;

  const select = (value: DateRangeValue | null, label: string) => {
    state?.setAnchorDate(null);
    setPending(value);
    setPicked(label);
    if (value) state?.setFocusedDate(value.end);
  };

  const commitField = (which: "start" | "end", date: CalendarDate) => {
    if (date.compare(maxDate) > 0) return false;
    const other = which === "start" ? pending?.end ?? date : pending?.start ?? date;
    const [a, b] = which === "start" ? [date, other] : [other, date];
    select(a.compare(b) <= 0 ? { start: a, end: b } : { start: b, end: a }, CUSTOM);
    return true;
  };

  return (
    <div className="grid w-[694px] max-w-[calc(100vw-16px)] max-md:w-[calc(100vw-16px)] md:min-h-[384px] md:grid-cols-[166px_1fr]">
      <PresetRail
        menu={menu}
        picked={picked}
        onPick={(preset) => select(toDateRangeValue(preset.range), preset.label)}
        onCustom={() => select(null, CUSTOM)}
      />
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-2 px-[15px] pt-[11px]">
          <DateField date={start} label="Start date" placeholder="Start date" onCommit={(date) => commitField("start", date)} />
          <ArrowRight weight="light" size={16} className="shrink-0 text-[#616161]" aria-hidden />
          <DateField date={end} label="End date" placeholder="End date" active={anchor !== null} onCommit={(date) => commitField("end", date)} />
        </div>
        <div className="flex justify-center gap-4 px-[15px] pt-1 pb-3 md:justify-start">
          <MonthPanel offset={0} showPrev showNext={!showSecondMonth} />
          {showSecondMonth && (
            <>
              <div aria-hidden className="mt-[52px] h-[184px] w-px shrink-0 bg-[#D4D4D4]" />
              <MonthPanel offset={1} showNext />
            </>
          )}
        </div>
        <div className="mt-auto flex h-[50px] items-center justify-end gap-2 border-t border-[#EBEBEB] px-3.5">
          <button type="button" onClick={onCancel} className={pickerSecondaryButtonClassName}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={anchor !== null || (!pending && picked !== ALL_TIME)}
            className={pickerPrimaryButtonClassName}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export function DateRangePicker({
  value,
  onChange,
  children,
  triggerClassName = "",
  placement = "bottom end",
  variant = "beam",
}: {
  value: DateRange | null;
  onChange: (r: DateRange | null) => void;
  children?: ReactNode;
  triggerClassName?: string;
  placement?: "bottom" | "bottom start" | "bottom end";
  /**
   * "toolbar" drops the animated beam ring and matches the h-9 toolbar controls.
   * "plain" is a borderless text trigger showing the preset name (Home's metric strip).
   */
  variant?: "beam" | "toolbar" | "plain" | "segment";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingValue, setPendingValue] = useState<DateRangeValue | null>(toDateRangeValue(value));
  const [picked, setPicked] = useState(CUSTOM);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const isMobile = useIsMobile();
  useDismissOnOutsidePress(isOpen, () => setIsOpen(false), [triggerRef, popoverRef]);
  const allowOpenChange = useTriggerToggle(isOpen, triggerRef);

  // Rebuilt each time the popover opens so "today" stays right past midnight.
  const { menu, maxDate } = useMemo(() => {
    const { today, hour } = dhakaNow();
    return { menu: buildDateRangeMenu(today, hour), maxDate: toCalendarDate(today) };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const matchedPreset = flattenDateRangeMenu(menu).find((preset) => sameRange(preset, value))?.label;

  const trigger = variant === "plain" ? (
    <AriaButton
      ref={triggerRef}
      data-testid="button-date-range-picker"
      className="flex items-center rounded-lg px-2 py-1 text-[14px] font-medium text-[#111110] outline-none transition-colors hover:bg-[#F2F1EC] focus-visible:ring-2 focus-visible:ring-black"
    >
      {matchedPreset ?? fmtRange(value)}
    </AriaButton>
  ) : (
    <AriaButton
      ref={triggerRef}
      data-testid="button-date-range-picker"
      className={cn(
        variant === "segment"
          // A segment of a filter capsule: borderless, full height, tinted while a date is set.
          ? cn("flex h-full items-center gap-2 whitespace-nowrap px-3 text-[12px] font-medium outline-none transition-colors focus-visible:bg-black/[0.05]",
              value?.from ? "bg-[#EEF4FF] pr-9 text-[#1D4ED8] hover:bg-[#E4EDFF]" : "text-black/70 hover:bg-black/[0.035] hover:text-black")
          : "flex items-center gap-2 px-3 text-[11px] font-medium text-foreground/70 hover:text-foreground border border-border hover:border-foreground/30 rounded-lg bg-background transition-all",
        variant === "toolbar" ? "h-9 whitespace-nowrap" : variant === "segment" ? "" : "h-8",
        // Leaves room for the reset × so it sits beside the arrow, not on it.
        variant === "toolbar" && value?.from && "pr-9",
      )}
    >
      <SolarCalendarIcon size={15} className="shrink-0" />
      {fmtRange(value)}
      <ChevronDown className="h-3 w-3 opacity-50" />
    </AriaButton>
  );

  const popover = (
    <AriaPopover ref={popoverRef} offset={4} placement={placement} isNonModal className={popoverClassName}>
      <Dialog aria-label="Date range" className="outline-none">
        {({ close }) => (
          <RangeCalendar
            aria-label="Date range"
            visibleDuration={{ months: isMobile ? 1 : 2 }}
            value={pendingValue}
            onChange={(next) => {
              setPendingValue(next);
              setPicked(CUSTOM);
            }}
            maxValue={maxDate}
          >
            <PickerBody
              menu={menu}
              maxDate={maxDate}
              picked={picked}
              setPicked={setPicked}
              pending={pendingValue}
              setPending={setPendingValue}
              showSecondMonth={!isMobile}
              onCancel={() => {
                setPendingValue(toDateRangeValue(value));
                close();
              }}
              onApply={() => {
                onChange(pendingValue ? toDateRange(pendingValue) : null);
                close();
              }}
            />
          </RangeCalendar>
        )}
      </Dialog>
    </AriaPopover>
  );

  const handleOpenChange = (open: boolean) => {
    if (!allowOpenChange(open)) return;
    if (open) {
      setPendingValue(toDateRangeValue(value));
      setPicked(matchedPreset ?? (value?.from ? CUSTOM : ALL_TIME));
    }
    setIsOpen(open);
  };

  if (!children) {
    return (
      <DialogTrigger isOpen={isOpen} onOpenChange={handleOpenChange}>
        <span className={cn(variant === "segment" ? "relative flex h-full" : variant === "toolbar" || variant === "plain" ? "relative inline-flex" : "uv-beam rounded-full", triggerClassName)}>
          {trigger}
          {(variant === "toolbar" || variant === "segment") && value?.from && (
            <button
              type="button"
              aria-label="Reset date range"
              onClick={() => onChange(null)}
              className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-foreground/50 transition-colors hover:bg-black/[0.05] hover:text-foreground"
            >
              <X weight="light" size={13} />
            </button>
          )}
        </span>
        {popover}
      </DialogTrigger>
    );
  }

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={handleOpenChange}>
      <div className="mt-4 flex flex-row flex-wrap items-center justify-center gap-4 text-center">
        {children}
        <span className={cn("uv-beam rounded-full", triggerClassName)}>{trigger}</span>
      </div>
      {popover}
    </DialogTrigger>
  );
}
