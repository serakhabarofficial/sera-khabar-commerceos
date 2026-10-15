import * as React from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = false, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("px-[15px] pt-1 pb-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col",
        caption: "relative flex h-11 items-center justify-center",
        caption_label: "text-[13px] font-semibold text-[#1A1A1A] [word-spacing:6px]",
        nav: "flex items-center",
        nav_button:
          "flex size-7 items-center justify-center rounded-lg text-[#616161] transition-[background-color,scale] duration-150 ease-out hover:bg-[#F1F1F1] hover:text-[#1A1A1A] active:scale-[0.97] disabled:opacity-30",
        nav_button_previous: "absolute left-0",
        nav_button_next: "absolute right-0",
        table: "border-separate [border-spacing:0_4px]",
        head_row: "flex",
        head_cell: "w-8 text-center text-[11.5px] font-normal text-[#616161]",
        row: "flex w-full",
        cell: "relative size-8 p-0 text-center",
        day: "size-8 rounded-lg border border-transparent p-0 text-[13px] font-normal tabular-nums text-[#1A1A1A] outline-none hover:border-[#E3E3E3] focus-visible:ring-2 focus-visible:ring-[#005BD3] aria-selected:opacity-100",
        day_range_end: "day-range-end",
        day_selected:
          "border-transparent bg-[#1A1A1A] font-semibold text-white hover:border-transparent hover:bg-[#1A1A1A] focus:bg-[#1A1A1A] focus:text-white",
        day_today: "border-[#E3E3E3]",
        day_outside: "day-outside text-[#B5B5B5] aria-selected:bg-[#F1F1F1] aria-selected:text-[#B5B5B5]",
        day_disabled: "text-[#B5B5B5] hover:border-transparent",
        day_range_middle: "aria-selected:rounded-none aria-selected:bg-[#F1F1F1] aria-selected:font-normal aria-selected:text-[#1A1A1A]",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <CaretLeft weight="light" className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <CaretRight weight="light" className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
