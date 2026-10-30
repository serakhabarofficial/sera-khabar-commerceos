import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HoldPanel } from "@/components/orders/HoldPanel";

function setup(overrides: Partial<Parameters<typeof HoldPanel>[0]> = {}) {
  const props = {
    attemptCounts: { 1: 2, 2: 4, 3: 1 },
    reasonCounts: { contact_later: 3 },
    listCount: 7,
    attempt: null,
    reason: null,
    onAttemptChange: vi.fn(),
    onReasonChange: vi.fn(),
    ...overrides,
  };
  render(<HoldPanel {...props} />);
  return props;
}

describe("HoldPanel", () => {
  it("shows one card per call attempt with its count", () => {
    setup();
    expect(screen.getByTestId("hold-attempt-1")).toHaveTextContent("1st attemptNo answer on the 1st call2");
    expect(screen.getByTestId("hold-attempt-2")).toHaveTextContent("No answer on the 2nd call4");
    expect(screen.getByTestId("hold-attempt-3")).toHaveTextContent("Final call. Confirm or cancel.");
    expect(screen.getByText("7 held orders")).toBeInTheDocument();
  });

  it("filters by a card and clears it on a second click", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByTestId("hold-attempt-3"));
    expect(props.onAttemptChange).toHaveBeenCalledWith(3);

    const active = setup({ attempt: 3 });
    await user.click(screen.getAllByTestId("hold-attempt-3")[1]);
    expect(active.onAttemptChange).toHaveBeenCalledWith(null);
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
    expect(props.onAttemptChange).toHaveBeenCalledWith(null);
    expect(props.onReasonChange).toHaveBeenCalledWith(null);
  });
});
