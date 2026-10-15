import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { describe, expect, it } from "vitest";
import { DateRangePicker } from "@/components/DateRangePicker";

const initialRange: DateRange = {
  from: new Date(2026, 8, 1),
  to: new Date(2026, 8, 18),
};

function ControlledPicker() {
  const [range, setRange] = useState<DateRange | null>(initialRange);

  return (
    <DateRangePicker value={range} onChange={setRange} />
  );
}

describe("DateRangePicker", () => {
  it("seeds the date fields from the committed value and clears it after All time is applied", async () => {
    const user = userEvent.setup();
    render(<ControlledPicker />);

    await user.click(screen.getByTestId("button-date-range-picker"));
    expect(await screen.findByLabelText("Start date")).toHaveValue("September 1, 2026");
    expect(screen.getByLabelText("End date")).toHaveValue("September 18, 2026");
    expect(screen.getByRole("button", { name: "Custom range" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "All time" }));
    // Presets only change the pending range.
    expect(screen.getByTestId("button-date-range-picker")).toHaveTextContent("Sep 1 – Sep 18, 2026");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(screen.getByTestId("button-date-range-picker")).toHaveTextContent("All time");
    });
  });

  it("only commits a manually picked range once Apply is pressed, and Cancel discards it", async () => {
    const user = userEvent.setup();
    render(<ControlledPicker />);

    await user.click(screen.getByTestId("button-date-range-picker"));
    await screen.findByLabelText("Start date");

    await user.click(screen.getByRole("button", { name: /September 15, 2026/ }));
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /September 20, 2026/ }));
    expect(screen.getByLabelText("Start date")).toHaveValue("September 15, 2026");
    expect(screen.getByLabelText("End date")).toHaveValue("September 20, 2026");
    // Not yet committed — the trigger still shows the original range.
    expect(screen.getByTestId("button-date-range-picker")).toHaveTextContent("Sep 1 – Sep 18, 2026");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.getByTestId("button-date-range-picker")).toHaveTextContent("Sep 1 – Sep 18, 2026");
    });

    await user.click(screen.getByTestId("button-date-range-picker"));
    await user.click(await screen.findByRole("button", { name: /September 15, 2026/ }));
    await user.click(screen.getByRole("button", { name: /September 20, 2026/ }));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(screen.getByTestId("button-date-range-picker")).toHaveTextContent("Sep 15 – Sep 20, 2026");
    });
  });

  it("opens the Last list in place and goes back to the main list", async () => {
    const user = userEvent.setup();
    render(<ControlledPicker />);

    await user.click(screen.getByTestId("button-date-range-picker"));
    await user.click(await screen.findByRole("button", { name: "Last" }));

    const ninety = screen.getByRole("button", { name: "Last 90 days" });
    await user.click(ninety);
    expect(ninety).toHaveAttribute("aria-pressed", "true");

    const [opener] = screen.getAllByRole("button", { name: "Last", expanded: true });
    const back = screen.getAllByRole("button", { name: "Last" }).find((button) => !button.hasAttribute("aria-haspopup"));
    await user.click(back!);

    expect(opener).toHaveAttribute("aria-expanded", "false");
    // The row stays marked because its submenu holds the picked preset.
    expect(opener).toHaveAttribute("aria-pressed", "true");
  });

  it("accepts a typed start date", async () => {
    const user = userEvent.setup();
    render(<ControlledPicker />);

    await user.click(screen.getByTestId("button-date-range-picker"));
    const start = await screen.findByLabelText("Start date");
    await user.clear(start);
    await user.type(start, "Sep 5, 2026{Enter}");

    expect(start).toHaveValue("September 5, 2026");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => {
      expect(screen.getByTestId("button-date-range-picker")).toHaveTextContent("Sep 5 – Sep 18, 2026");
    });
  });
});
