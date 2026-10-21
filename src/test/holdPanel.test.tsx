import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HoldPanel } from "@/components/orders/HoldPanel";

function setup(overrides: Partial<Parameters<typeof HoldPanel>[0]> = {}) {
  const props = {
    ageCounts: { new: 2, soon: 4, long: 1 },
    reasonCounts: { contact_later: 3 },
    listCount: 7,
    age: null,
    reason: null,
    onAgeChange: vi.fn(),
    onReasonChange: vi.fn(),
    ...overrides,
  };
  render(<HoldPanel {...props} />);
  return props;
}

describe("HoldPanel", () => {
  it("shows one card per hold age with its count", () => {
    setup();
    expect(screen.getByTestId("hold-age-new")).toHaveTextContent("On hold 0–1 days2New holds");
    expect(screen.getByTestId("hold-age-soon")).toHaveTextContent("4");
    expect(screen.getByTestId("hold-age-long")).toHaveTextContent("Held too long. Call now.");
    expect(screen.getByText("7 held orders")).toBeInTheDocument();
  });

  it("filters by a card and clears it on a second click", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByTestId("hold-age-long"));
    expect(props.onAgeChange).toHaveBeenCalledWith("long");

    const active = setup({ age: "long" });
    await user.click(screen.getAllByTestId("hold-age-long")[1]);
    expect(active.onAgeChange).toHaveBeenCalledWith(null);
  });

  it("picks a hold reason from the same list as the order editor", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole("button", { name: /Hold reason/ }));
    await user.click(await screen.findByRole("option", { name: /গ্রাহক পরে যোগাযোগ করতে বলেছেন/ }));
    expect(props.onReasonChange).toHaveBeenCalledWith("contact_later");
  });

  it("offers Show all only while a filter is active", async () => {
    const user = userEvent.setup();
    expect(setup() && screen.queryByRole("button", { name: "Show all" })).toBeNull();
    const props = setup({ reason: "contact_later" });
    await user.click(screen.getByRole("button", { name: "Show all" }));
    expect(props.onAgeChange).toHaveBeenCalledWith(null);
    expect(props.onReasonChange).toHaveBeenCalledWith(null);
  });
});
