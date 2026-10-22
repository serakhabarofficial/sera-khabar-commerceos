import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderCallsCard, useOrderCallLog } from "@/components/order-editor/OrderCallsCard";
import { holdUntilForSendIn, statusForStep, type CallNextStep, type OrderCall } from "@/lib/orderCalls";
import { microsipHelperFile, microsipIniLines } from "@/components/order-editor/MicrosipSetupDialog";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

const ORDER = "11111111-1111-4111-8111-111111111111";
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const call = (overrides: Partial<OrderCall>): OrderCall => ({
  id: "call-1", order_id: ORDER, staff_id: "staff-1", staff_name: "Sadia", direction: "outgoing", phone: "01712345678",
  outcome: "answered", source: "microsip", started_at: minutesAgo(30), answered_at: minutesAgo(29), ended_at: minutesAgo(27),
  duration_seconds: 134, said_code: null, note: null, ...overrides,
});
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

function Harness({ onNextStep, canSetStatus = () => true }: { onNextStep: (step: CallNextStep) => void; canSetStatus?: (status: string) => boolean }) {
  const callLog = useOrderCallLog(ORDER);
  return <OrderCallsCard callLog={callLog} canSetStatus={canSetStatus} onNextStep={onNextStep} onEditAddress={() => {}} />;
}

function renderCard(calls: OrderCall[], props: Partial<Parameters<typeof Harness>[0]> = {}) {
  apiFetch.mockImplementation(async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url === `/api/orders/${ORDER}/calls`) return json({ calls, viewer_id: "staff-1" });
    if (url === "/api/order-calls/helper-key") return json({ configured: true, created_at: null, last_used_at: null });
    if (url.startsWith("/api/order-calls/") && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      return json({ call: { ...calls.find((row) => url.endsWith(row.id)), ...body } });
    }
    return json({});
  });
  const onNextStep = props.onNextStep ?? vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Harness {...props} onNextStep={onNextStep} /></QueryClientProvider>);
  return { onNextStep };
}

describe("Calls card", () => {
  beforeEach(() => apiFetch.mockReset());

  it("shows each call with who called, the result, what was said and the staff member", async () => {
    renderCard([
      call({ id: "c2", outcome: "no_answer", answered_at: null, duration_seconds: null, staff_name: "Rakib", started_at: minutesAgo(5), ended_at: minutesAgo(4) }),
      call({ id: "c1", direction: "incoming", said_code: "send_later", note: "রবিবারের পর" }),
    ]);
    const history = await screen.findByRole("list", { name: "Call history" });
    expect(screen.getByText(/2 calls/)).toBeInTheDocument();
    expect(within(history).getByText("No answer")).toBeInTheDocument();
    expect(within(history).getByText("Answered · 2:14")).toBeInTheDocument();
    expect(within(history).getByText("Customer called")).toBeInTheDocument();
    expect(within(history).getByText("পরে পাঠান · রবিবারের পর")).toBeInTheDocument();
    expect(within(history).getByText("Rakib · saved by MicroSIP")).toBeInTheDocument();
  });

  it("asks what the customer said after an answered call and offers the next step", async () => {
    const user = userEvent.setup();
    const { onNextStep } = renderCard([call({ ended_at: minutesAgo(1) })]);
    await screen.findByText(/What did the customer say/);
    await user.click(screen.getByRole("button", { name: "পরে পাঠান" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/order-calls/call-1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ said_code: "send_later" }) })));
    await user.click(await screen.findByRole("button", { name: "In 3 days" }));
    expect(onNextStep).toHaveBeenCalledWith({ kind: "hold_send_on", days: 3 });
  });

  it("hides status steps the order can't take", async () => {
    const user = userEvent.setup();
    renderCard([call({ ended_at: minutesAgo(1) })], { canSetStatus: () => false });
    await user.click(await screen.findByRole("button", { name: "ক্যান্সেল" }));
    expect(await screen.findByText(/The status can't change now/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument();
  });

  it("warns after two calls in a row with no answer", async () => {
    renderCard([
      call({ id: "c3", outcome: "no_answer", answered_at: null, duration_seconds: null }),
      call({ id: "c2", outcome: "no_answer", answered_at: null, duration_seconds: null }),
    ]);
    expect(await screen.findByText(/2 calls in a row with no answer/)).toBeInTheDocument();
  });

  it("lets staff give a result to a call MicroSIP never reported", async () => {
    const user = userEvent.setup();
    renderCard([call({ outcome: "ringing", source: "click", answered_at: null, ended_at: null, duration_seconds: null, started_at: minutesAgo(10) })]);
    await user.click(await screen.findByRole("button", { name: "No answer" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/order-calls/call-1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ outcome: "no_answer" }) })));
  });
});

describe("call next steps", () => {
  it("holds until the day before the send day, since holds end the day after their date", () => {
    const now = new Date("2026-10-22T06:00:00.000Z");
    expect(holdUntilForSendIn(1, now)).toBe("2026-10-22");
    expect(holdUntilForSendIn(3, now)).toBe("2026-10-24");
    expect(holdUntilForSendIn(7, now)).toBe("2026-10-28");
  });

  it("knows which steps change the status", () => {
    expect(statusForStep({ kind: "confirm" })).toBe("confirmed");
    expect(statusForStep({ kind: "hold_contact_later" })).toBe("on_hold");
    expect(statusForStep({ kind: "cancel", reason: "customer_changed_mind" })).toBe("cancelled");
    expect(statusForStep({ kind: "edit_address" })).toBeNull();
  });
});

describe("MicroSIP setup files", () => {
  it("posts each event with the caller ID and the staff member's key", () => {
    const file = microsipHelperFile("start", "skc_abc", "https://suite.example.com");
    expect(file).toContain('-H "Authorization: Bearer skc_abc"');
    expect(file).toContain('--data-urlencode "event=start" --data-urlencode "number=%~1"');
    expect(file).toContain('"https://suite.example.com/api/webhooks/microsip"');
    expect(microsipIniLines()).toBe([
      "cmdIncomingCall=C:\\SeraKhabar\\sk-incoming.bat",
      "cmdCallAnswer=C:\\SeraKhabar\\sk-answer.bat",
      "cmdCallStart=C:\\SeraKhabar\\sk-start.bat",
      "cmdCallEnd=C:\\SeraKhabar\\sk-end.bat",
    ].join("\n"));
  });
});
