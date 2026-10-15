"use client";

import { useEffect, useState, useContext } from "react";
import {
  Button as RACButton,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarStateContext,
  RangeCalendarStateContext,
} from "react-aria-components";
import type { CalendarCellRenderProps } from "react-aria-components";
import { CalendarDate, getLocalTimeZone } from "@internationalized/date";
import { format, isValid, parse } from "date-fns";
import { cx } from "@/utils/cx";
import { getBangladeshDateKey } from "../../../../shared/orderHold.js";

/**
 * Shared building blocks for the date-picker family: `DateRangePicker`
 * (preset rail + two months) and `DatePicker` (one month) render the same
 * month panel, day cell, date field and footer buttons around two different
 * react-aria-components roots (`RangeCalendar` vs `Calendar`).
 */

export function ChevronLeft16({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path d="M10 3.5L5.5 8L10 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRight16({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function toNativeDate(date: CalendarDate) {
  return new Date(date.year, date.month - 1, date.day);
}

/** "October 14, 2026" — the date field format. */
export function formatFieldDate(date: CalendarDate) {
  return format(toNativeDate(date), "MMMM d, yyyy");
}

const FIELD_FORMATS = ["MMMM d, yyyy", "MMMM d yyyy", "MMM d, yyyy", "MMM d yyyy", "d/M/yyyy", "d-M-yyyy", "yyyy-MM-dd"];

/** Parses what someone types into a date field ("Oct 3, 2026", "3/10/2026", "2026-10-03"), or null. */
export function parseFieldDate(text: string): CalendarDate | null {
  const trimmed = text.trim();
  for (const pattern of FIELD_FORMATS) {
    const parsed = parse(trimmed, pattern, new Date(2000, 0, 1));
    if (isValid(parsed) && parsed.getFullYear() > 1900) {
      return new CalendarDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
    }
  }
  return null;
}

export function DayCell(props: CalendarCellRenderProps & { isRange: boolean }) {
  const { date, formattedDate, isSelected, isSelectionStart, isSelectionEnd, isHovered, isFocusVisible, isDisabled, isUnavailable, isOutsideMonth, isRange } = props;

  if (isOutsideMonth) return <div className="size-8" />;

  // A plain Calendar never sets isSelectionStart/End, so the single selected
  // day is its own edge there.
  const isSingleDay = isRange ? isSelectionStart && isSelectionEnd : isSelected;
  const isEdge = isRange ? isSelectionStart || isSelectionEnd : isSelected;
  const inBand = isRange && isSelected && !isSingleDay;
  const isToday = date.toString() === getBangladeshDateKey();
  const muted = isDisabled || isUnavailable;

  return (
    <div className="relative size-8">
      {inBand && (
        <span
          aria-hidden
          className={cx(
            "absolute inset-y-0 bg-[#F1F1F1]",
            isSelectionStart ? "left-1/2" : "left-0",
            isSelectionEnd ? "right-1/2" : "right-0",
          )}
        />
      )}
      <div
        className={cx(
          "relative flex size-8 items-center justify-center rounded-lg border text-[13px] tabular-nums outline-none",
          isEdge
            ? "border-transparent bg-[#1A1A1A] font-semibold text-white"
            : cx(
                "text-[#1A1A1A]",
                isToday || (isHovered && !muted) ? "border-[#E3E3E3]" : "border-transparent",
                muted && "text-[#B5B5B5]",
              ),
          isFocusVisible && "ring-2 ring-[#005BD3] ring-offset-1",
        )}
      >
        {formattedDate}
      </div>
    </div>
  );
}

export function MonthPanel({ offset, showPrev, showNext }: { offset: number; showPrev?: boolean; showNext?: boolean }) {
  // Works inside either a RangeCalendar or a plain Calendar; exactly one of
  // these contexts is set, and both expose the same `visibleRange`.
  const rangeState = useContext(RangeCalendarStateContext);
  const singleState = useContext(CalendarStateContext);
  const state = rangeState ?? singleState;
  const isRange = rangeState != null;
  const panelDate = state ? state.visibleRange.start.add({ months: offset }) : null;
  const navClass =
    "flex size-7 cursor-pointer items-center justify-center rounded-lg text-[#616161] outline-none transition-[background-color,scale] duration-150 ease-out hover:bg-[#F1F1F1] hover:text-[#1A1A1A] data-[pressed]:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#005BD3]";

  return (
    <div className="flex w-[224px] shrink-0 flex-col">
      <div className="flex h-11 items-center justify-between">
        {showPrev ? (
          <RACButton slot="previous" className={navClass}>
            <ChevronLeft16 />
          </RACButton>
        ) : (
          <span className="size-7" aria-hidden />
        )}
        <span className="flex-1 text-center text-[13px] font-semibold text-[#1A1A1A] [word-spacing:6px]">
          {panelDate ? format(toNativeDate(panelDate), "MMMM yyyy") : ""}
        </span>
        {showNext ? (
          <RACButton slot="next" className={navClass}>
            <ChevronRight16 />
          </RACButton>
        ) : (
          <span className="size-7" aria-hidden />
        )}
      </div>
      <CalendarGrid
        offset={{ months: offset }}
        weekdayStyle="short"
        className="border-separate outline-none"
        style={{ borderSpacing: "0 4px" }}
      >
        <CalendarGridHeader>
          {(day) => (
            <CalendarHeaderCell className="h-[22px] w-8 p-0 text-center text-[11.5px] font-normal text-[#616161]">
              {day}
            </CalendarHeaderCell>
          )}
        </CalendarGridHeader>
        <CalendarGridBody>
          {(date) => (
            <CalendarCell date={date} className="p-0 outline-none">
              {(cellProps) => <DayCell {...cellProps} isRange={isRange} />}
            </CalendarCell>
          )}
        </CalendarGridBody>
      </CalendarGrid>
    </div>
  );
}

/** A rounded date field showing "October 14, 2026". It keeps its own draft
 *  while typing and commits on blur or Enter, reverting if the text isn't a date. */
export function DateField({
  date,
  label,
  placeholder,
  active = false,
  onCommit,
}: {
  date: CalendarDate | null;
  label: string;
  placeholder: string;
  active?: boolean;
  /** Return false to reject the date (for example, one after the latest allowed day). */
  onCommit: (date: CalendarDate) => boolean | void;
}) {
  const formatted = date ? formatFieldDate(date) : "";
  const [text, setText] = useState(formatted);

  useEffect(() => {
    setText(formatted);
  }, [formatted]);

  const commit = () => {
    const parsed = parseFieldDate(text);
    setText(parsed && onCommit(parsed) !== false ? formatFieldDate(parsed) : formatted);
  };

  return (
    <input
      type="text"
      value={text}
      placeholder={placeholder}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        // Commit in place: blurring would move focus out of the popover and close it.
        if (event.key === "Enter") commit();
        if (event.key === "Escape") setText(formatted);
      }}
      aria-label={label}
      className={cx(
        "h-8 min-w-0 flex-1 rounded-[11px] border bg-[#FDFDFD] px-3 text-[13.5px] tabular-nums text-[#1A1A1A] outline-none placeholder:text-[#B5B5B5]",
        "transition-[border-color,box-shadow] duration-150 ease-out focus:border-[#1A1A1A] focus:shadow-[0_0_0_1px_#1A1A1A]",
        active ? "border-[#1A1A1A] shadow-[0_0_0_1px_#1A1A1A]" : "border-[#C9C9C9] border-t-[#898F94]",
      )}
    />
  );
}

const pickerButtonBase =
  "h-7 cursor-pointer rounded-[10px] px-3 text-[13px] font-medium outline-none transition-[background-color,scale] duration-150 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#005BD3] focus-visible:ring-offset-1 disabled:cursor-default disabled:opacity-50 disabled:active:scale-100";

/** Grey secondary footer button ("Cancel"). */
export const pickerSecondaryButtonClassName = cx(pickerButtonBase, "bg-[#E3E3E3] text-[#1A1A1A] hover:bg-[#D4D4D4]");

/** Glossy black primary footer button ("Apply"). */
export const pickerPrimaryButtonClassName = cx(
  pickerButtonBase,
  "bg-[linear-gradient(180deg,#303030_0%,#1A1A1A_100%)] text-white",
  "shadow-[inset_0_-1px_0_1px_rgba(0,0,0,0.8),inset_0_0_0_1px_#303030,inset_0_0.5px_0_1.5px_rgba(255,255,255,0.25),0_2px_4px_rgba(0,0,0,0.25)]",
  "hover:bg-[linear-gradient(180deg,#3a3a3a_0%,#222_100%)]",
);

/** Popover card shared by both pickers: white, 12px radius, scales in from the trigger. */
export const popoverClassName = cx(
  "overflow-hidden rounded-xl bg-white outline-none",
  "shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_4px_6px_-2px_rgba(26,26,26,0.2),0_12px_24px_-4px_rgba(26,26,26,0.12)]",
  // Tailwind v4 scale-*/translate-* set the CSS `scale`/`translate` properties, not `transform`.
  "origin-[var(--trigger-anchor-point)] transition-[opacity,scale,translate] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
  "data-[entering]:scale-[0.96] data-[entering]:-translate-y-1 data-[entering]:opacity-0",
  "data-[exiting]:scale-[0.98] data-[exiting]:opacity-0 data-[exiting]:duration-150",
  "motion-reduce:data-[entering]:scale-100 motion-reduce:data-[entering]:translate-y-0 motion-reduce:data-[exiting]:scale-100",
);
