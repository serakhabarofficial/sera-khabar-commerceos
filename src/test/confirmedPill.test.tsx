import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmedPill } from "@/components/orders/ConfirmedPill";
import { CONFIRMED_PILL_DURATION_MS, confirmedPill } from "@/lib/confirmedPill";

afterEach(() => {
  act(() => confirmedPill.dismiss());
  vi.useRealTimers();
});

describe("confirmed pill", () => {
  it("shows saving, then the confirmed order, then hides itself", () => {
    vi.useFakeTimers();
    render(<ConfirmedPill />);
    expect(screen.queryByRole("status")).toBeNull();

    act(() => confirmedPill.saving());
    expect(screen.getByRole("status")).toHaveTextContent("Saving order…");

    act(() => confirmedPill.confirmed("#ML-1001"));
    expect(screen.getByRole("status")).toHaveTextContent("Order confirmed");
    expect(screen.getByRole("status")).toHaveTextContent("#ML-1001");

    act(() => vi.advanceTimersByTime(CONFIRMED_PILL_DURATION_MS));
    expect(confirmedPill.getSnapshot()).toBeNull();
  });

  it("clears when the save fails", () => {
    act(() => confirmedPill.saving());
    act(() => confirmedPill.dismiss());
    expect(confirmedPill.getSnapshot()).toBeNull();
  });
});
