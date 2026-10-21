import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "@/pages/Dashboard";
import { TooltipProvider } from "@/components/ui/tooltip";

const apiFetch = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true, loading: false }) }));
vi.mock("@/hooks/useLiveVisitors", () => ({
  useLiveVisitors: () => ({ count: 0, details: { activeCarts: 0, checkingOut: 0, purchased: 0 }, visitors: [] }),
}));
vi.mock("@/hooks/useMe", () => ({
  useMe: () => ({ data: { orgName: "Sera Khabar" }, isLoading: false }),
}));
vi.mock("@/hooks/useWarehouses", () => ({
  useWarehouses: () => ({ warehouses: [{ id: "main", name: "Main Warehouse" }] }),
}));
vi.mock("@/components/home/DottedGlobe", () => ({ DottedGlobe: () => null }));
vi.mock("@/components/ui/glyph-matrix", () => ({ default: () => null }));
vi.mock("@/components/ui/sonner", () => ({
  toast: { success: toastSuccess, error: toastError, custom: vi.fn() },
  DarkToast: () => null,
}));
vi.mock("recharts", () => ({
  BarChart: () => null,
  Bar: () => null,
  Cell: () => null,
  ResponsiveContainer: () => null,
  Tooltip: () => null,
}));

function baseOrder(overrides: Record<string, unknown>) {
  return {
    shopify_order_id: 1,
    order_number: "#101",
    customer_name: "Test Customer",
    phone: "01700000001",
    address: "Dhaka",
    product: "Honey",
    quantity: 1,
    price: 800,
    created_at: "2026-09-05T00:00:00.000Z",
    fraud_checked: false,
    fraud_data: null,
    delivery_rate: 60,
    fulfillment_status: null,
    courier_status: null,
    sent_to_courier: false,
    warehouse_id: "main",
    ...overrides,
  };
}

const baseOrders = [
  baseOrder({ id: "pending-1", shopify_order_id: 1, order_number: "#101", status: "pending" }),
  baseOrder({ id: "approved-1", shopify_order_id: 2, order_number: "#102", status: "confirmed" }),
];
let orders = baseOrders;

let bulkResponse: unknown | ((orderIds: string[]) => unknown) = null;
let bulkStatusResponse: { body: unknown; ok?: boolean } | null = null;

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function bulkStatusCalls() {
  return apiFetch.mock.calls.filter(([url, init]) => url === "/api/orders/bulk-status" && init?.method === "POST");
}

function patchCalls() {
  return apiFetch.mock.calls.filter(([, init]) => init?.method === "PATCH");
}

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("dashboard bulk status button", () => {
  beforeEach(() => {
    sessionStorage.setItem("autosync_done_user-1", "1");
    sessionStorage.removeItem("dashboard-fulfillment-tab");
    localStorage.clear();
    toastSuccess.mockClear();
    toastError.mockClear();
    apiFetch.mockReset();
    orders = baseOrders;
    bulkResponse = null;
    bulkStatusResponse = null;
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders" && !init?.method) return jsonResponse({ orders });
      if (url === "/api/orders/bulk-status" && init?.method === "POST") {
        if (bulkStatusResponse) return jsonResponse(bulkStatusResponse.body, bulkStatusResponse.ok ?? true);
        const body = JSON.parse(String(init.body));
        const updated = orders.filter((o) => body.orderIds.includes(o.id)).map((o) => ({ ...o, status: body.status }));
        return jsonResponse({ success: true, processed: updated.length, failed: 0, updated, failures: [] });
      }
      if (url === "/api/products") return jsonResponse({ products: [] });
      if (url === "/api/send-to-courier/bulk") {
        const { orderIds } = JSON.parse(String(init?.body));
        const reply = typeof bulkResponse === "function" ? await bulkResponse(orderIds) : bulkResponse;
        return jsonResponse(reply || { success: true, processed: 0, failed: 0, succeeded: [], failures: [] });
      }
      if (url.startsWith("/api/analytics")) {
        return jsonResponse({
          revenue: 0, shipping: 0, adSpend: 0, totalCog: 0, cogCoverage: { set: 0, total: 0 },
          profit: 0, fbConfigured: false, usdToBdt: 120, fbError: null,
        });
      }
      if (url.startsWith("/api/orders/") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        const order = orders.find((o) => `/api/orders/${o.id}` === url);
        return jsonResponse({ success: true, order: { ...order, ...body } });
      }
      return jsonResponse({ updated: 0 });
    });
  });

  it("opens a dashboard order ID in a new tab", async () => {
    renderDashboard();

    const orderLink = await screen.findByRole("link", { name: "Open order 101 in a new tab" });
    expect(orderLink).toHaveAttribute("href", "/orders/pending-1");
    expect(orderLink).toHaveAttribute("target", "_blank");
    expect(orderLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("stays disabled without selection and moves approved orders to print in bulk", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const trigger = await screen.findByRole("button", { name: "Update Status" });
    expect(trigger).toBeDisabled();

    await user.click(screen.getByTestId("checkbox-order-approved-1"));
    expect(trigger).not.toBeDisabled();

    await user.click(trigger);
    await user.click(within(screen.getByTestId("bulk-status-menu")).getByRole("button", { name: "Print" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("1 order moved to Print"));
    const calls = bulkStatusCalls();
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({
      orderIds: ["approved-1"],
      status: "print",
      activity_group_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(patchCalls()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Update Status" })).toBeDisabled();
    expect(await screen.findByRole("radio", { name: /Print.*1/ })).toBeInTheDocument();
  });

  it("does not offer Cancelled as a bulk status", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByRole("button", { name: "Update Status" });
    await user.click(screen.getByTestId("checkbox-order-pending-1"));
    await user.click(screen.getByRole("button", { name: "Update Status" }));

    const menu = screen.getByTestId("bulk-status-menu");
    expect(within(menu).getByRole("button", { name: "On Hold" })).toBeInTheDocument();
    expect(within(menu).queryByRole("button", { name: "Cancelled" })).not.toBeInTheDocument();
  });

  it("keeps only failed orders selected and shows the server's reason when nothing moved", async () => {
    const user = userEvent.setup();
    bulkStatusResponse = {
      body: {
        success: false, processed: 0, failed: 1, updated: [],
        failures: [{ orderId: "pending-1", orderNumber: "#101", reason: "Add the phone number before approving this order." }],
      },
    };
    renderDashboard();

    await screen.findByRole("button", { name: "Update Status" });
    await user.click(screen.getByTestId("checkbox-order-pending-1"));
    await user.click(screen.getByRole("button", { name: "Update Status" }));
    await user.click(within(screen.getByTestId("bulk-status-menu")).getByRole("button", { name: "Confirmed" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Add the phone number before approving this order."));
    expect(bulkStatusCalls()).toHaveLength(1);
    expect(screen.getByTestId("checkbox-order-pending-1")).toHaveClass("bg-[#0285F7]");
  });

  it("reports moved and skipped orders and drops moved ones from the selection", async () => {
    const user = userEvent.setup();
    orders = [...baseOrders, baseOrder({ id: "approved-2", shopify_order_id: 4, order_number: "#104", status: "confirmed" })];
    bulkStatusResponse = {
      body: {
        success: false, processed: 1, failed: 1,
        updated: [{ ...orders[1], status: "print" }],
        failures: [{ orderId: "approved-2", orderNumber: "#104", reason: "Order changed before it could be saved. Refresh and try again." }],
      },
    };
    renderDashboard();

    await screen.findByRole("button", { name: "Update Status" });
    await user.click(screen.getByTestId("checkbox-order-approved-1"));
    await user.click(screen.getByTestId("checkbox-order-approved-2"));
    await user.click(screen.getByRole("button", { name: "Update Status" }));
    await user.click(within(screen.getByTestId("bulk-status-menu")).getByRole("button", { name: "Print" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("1 order moved to Print, 1 skipped"));
    expect(JSON.parse(String(bulkStatusCalls()[0][1]?.body)).orderIds).toEqual(["approved-1", "approved-2"]);
    expect(await screen.findByRole("radio", { name: /Print.*1/ })).toBeInTheDocument();
    expect(screen.getByTestId("checkbox-order-approved-2")).toHaveClass("bg-[#0285F7]");
  });

  it("skips selected orders that cannot take the target status", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByRole("button", { name: "Update Status" });
    await user.click(screen.getByTestId("checkbox-order-pending-1"));

    await user.click(screen.getByRole("button", { name: "Update Status" }));
    await user.click(within(screen.getByTestId("bulk-status-menu")).getByRole("button", { name: "Print" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Selected orders can't move to Print"));
    expect(bulkStatusCalls()).toHaveLength(0);
    expect(patchCalls()).toHaveLength(0);
  });

  it("moves a Print order to Processing when selected manually", async () => {
    const user = userEvent.setup();
    orders = [...baseOrders, baseOrder({ id: "print-1", shopify_order_id: 3, order_number: "#103", status: "print" })];
    renderDashboard();

    await user.click(await screen.findByRole("radio", { name: /Print.*1/ }));
    await user.click(screen.getByTestId("checkbox-order-print-1"));
    await user.click(screen.getByRole("button", { name: "Update Status" }));
    await user.click(within(screen.getByTestId("bulk-status-menu")).getByRole("button", { name: "Ready to Transit" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("1 order moved to Ready to Transit"));
    const calls = bulkStatusCalls();
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0][1]?.body))).toMatchObject({ orderIds: ["print-1"], status: "processing" });
    expect(patchCalls()).toHaveLength(0);
  });

  it("requires one valid hold reason before sending bulk On Hold updates", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Update Status" }));
    await user.click(screen.getByTestId("checkbox-order-pending-1"));
    await user.click(screen.getByTestId("checkbox-order-approved-1"));
    await user.click(screen.getByRole("button", { name: "Update Status" }));
    await user.click(within(screen.getByTestId("bulk-status-menu")).getByRole("button", { name: "On Hold" }));

    expect(await screen.findByRole("heading", { name: "অর্ডার হোল্ড করুন" })).toBeInTheDocument();
    expect(bulkStatusCalls()).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Hold orders" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a hold reason");
    expect(bulkStatusCalls()).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /Hold reason/ }));
    await user.click(await screen.findByRole("option", { name: "অগ্রিম পেমেন্টের জন্য অর্ডার হোল্ডে রাখা হয়েছে" }));
    await user.click(screen.getByRole("button", { name: "Hold orders" }));

    await waitFor(() => expect(bulkStatusCalls()).toHaveLength(1));
    expect(JSON.parse(String(bulkStatusCalls()[0][1]?.body))).toMatchObject({
      orderIds: ["pending-1", "approved-1"],
      status: "on_hold",
      hold_reason_code: "advance_payment_pending",
      hold_reason_detail: null,
      hold_until_date: null,
    });
    expect(patchCalls()).toHaveLength(0);
  });

  it("shows a dropdown chevron that rotates open", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByRole("button", { name: "Update Status" });
    await user.click(screen.getByTestId("checkbox-order-approved-1"));
    expect(screen.getByRole("button", { name: "Update Status" }).innerHTML).not.toContain("rotate-180");

    await user.click(screen.getByRole("button", { name: "Update Status" }));
    expect(await screen.findByTestId("bulk-status-menu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update Status" }).innerHTML).toContain("rotate-180");
  });

  it("shows only the requested actions in the Print selection bar", async () => {
    const user = userEvent.setup();
    orders = [...baseOrders, baseOrder({ id: "print-1", shopify_order_id: 3, order_number: "#103", status: "print" })];
    renderDashboard();

    await user.click(await screen.findByRole("radio", { name: /Print.*1/ }));
    await user.click(screen.getByTestId("checkbox-order-print-1"));

    expect(screen.getByTestId("button-bulk-send-steadfast")).toBeInTheDocument();
    expect(screen.queryByTestId("button-bulk-fraud-check")).not.toBeInTheDocument();
    expect(screen.getByTestId("button-generate-invoice")).toBeInTheDocument();
    expect(screen.getByTestId("button-print-invoice")).toBeInTheDocument();
    expect(screen.getByTestId("button-delete-orders")).toBeInTheDocument();
    expect(screen.getByTestId("button-clear-selection")).toBeInTheDocument();
  });

  it("sends selected Print orders through Steadfast bulk dispatch and counts them", async () => {
    const user = userEvent.setup();
    orders = [...baseOrders, baseOrder({ id: "print-1", shopify_order_id: 3, order_number: "#103", status: "print" })];
    const printOrder = orders[2];
    let answer: (value: unknown) => void = () => {};
    bulkResponse = () => new Promise((resolve) => { answer = resolve; });
    renderDashboard();

    await user.click(await screen.findByRole("radio", { name: /Print.*1/ }));
    await user.click(screen.getByTestId("checkbox-order-print-1"));
    await user.click(screen.getByTestId("button-bulk-send-steadfast"));

    // While the batch is out, the button and the banner both count.
    expect(await screen.findByTestId("steadfast-send-progress")).toHaveTextContent("Sending 0/1");
    expect(screen.getByTestId("button-bulk-send-steadfast")).toHaveTextContent("Sending 0/1");
    const calls = apiFetch.mock.calls.filter(([url, init]) => url === "/api/send-to-courier/bulk" && init?.method === "POST");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ orderIds: ["print-1"] });

    answer({
      success: true,
      processed: 1,
      failed: 0,
      succeeded: [{ orderId: printOrder.id, orderNumber: printOrder.order_number, order: { ...printOrder, status: "print", sent_to_courier: true } }],
      failures: [],
    });

    await waitFor(() => expect(screen.getByTestId("steadfast-send-banner")).toHaveTextContent("1 of 1 sent"));
    expect(await screen.findByRole("radio", { name: /Print.*1/ })).toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: /Ready to Transit.*0/ })).toBeInTheDocument();
    expect(screen.getByText(printOrder.order_number)).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("keeps failed Print orders selected and shows the reason with a fix", async () => {
    const user = userEvent.setup();
    const wrongPhone = "Wrong phone: Steadfast needs 11 digits that start with 01.";
    orders = [...baseOrders, baseOrder({ id: "print-1", shopify_order_id: 3, order_number: "#103", status: "print", phone: "01712" })];
    const printOrder = orders[2];
    bulkResponse = (orderIds: string[]) => (orderIds.length && patchCalls().length === 0
      ? {
        success: false,
        processed: 0,
        failed: 1,
        succeeded: [],
        failures: [{ orderId: "print-1", orderNumber: "#103", reason: wrongPhone, code: "phone", order: { ...printOrder, courier_message: wrongPhone } }],
      }
      : {
        success: true,
        processed: 1,
        failed: 0,
        succeeded: [{ orderId: "print-1", orderNumber: "#103", order: { ...printOrder, phone: "01712345678", sent_to_courier: true, courier_message: "Sent to Steadfast successfully" } }],
        failures: [],
      });
    renderDashboard();

    await user.click(await screen.findByRole("radio", { name: /Print.*1/ }));
    await user.click(screen.getByTestId("checkbox-order-print-1"));
    await user.click(screen.getByTestId("button-bulk-send-steadfast"));

    const banner = await screen.findByTestId("steadfast-send-banner");
    await waitFor(() => expect(banner).toHaveTextContent("0 of 1 sent"));
    expect(within(banner).getByTestId("steadfast-chip-phone")).toHaveTextContent("Wrong phone1");
    const note = screen.getByTestId("steadfast-issue-print-1");
    expect(note).toHaveTextContent("Wrong phone");
    expect(note).toHaveTextContent("Steadfast needs 11 digits that start with 01.");
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.getByTestId("checkbox-order-print-1")).toHaveClass("bg-[#0285F7]");

    await user.click(within(note).getByRole("button", { name: "Fix phone" }));
    const input = screen.getByRole("textbox", { name: "Phone number" });
    await user.clear(input);
    await user.type(input, "01712345678{Enter}");

    await waitFor(() => expect(screen.getByTestId("steadfast-issue-print-1")).toHaveTextContent("Fixed · ready to send again"));
    expect(JSON.parse(String(patchCalls().at(-1)?.[1]?.body))).toEqual({ phone: "01712345678", courier_message: null });

    await user.click(screen.getByTestId("button-steadfast-send-again"));
    await waitFor(() => expect(screen.getByTestId("steadfast-send-banner")).toHaveTextContent("1 of 1 sent"));
    const sends = apiFetch.mock.calls.filter(([url]) => url === "/api/send-to-courier/bulk");
    expect(JSON.parse(String(sends.at(-1)?.[1]?.body))).toEqual({ orderIds: ["print-1"] });
  });

  it("filters the table to one reason from its chip", async () => {
    const user = userEvent.setup();
    const noAddress = "No address: Add the delivery address, then send again.";
    orders = [
      ...baseOrders,
      baseOrder({ id: "print-1", shopify_order_id: 3, order_number: "#103", status: "print" }),
      baseOrder({ id: "print-2", shopify_order_id: 4, order_number: "#104", status: "print", address: "" }),
    ];
    bulkResponse = {
      success: false,
      processed: 1,
      failed: 1,
      succeeded: [{ orderId: "print-1", orderNumber: "#103", order: { ...orders[2], sent_to_courier: true } }],
      failures: [{ orderId: "print-2", orderNumber: "#104", reason: noAddress, code: "address", order: { ...orders[3], courier_message: noAddress } }],
    };
    renderDashboard();

    await user.click(await screen.findByRole("radio", { name: /Print.*2/ }));
    await user.click(screen.getByTestId("checkbox-orders-all"));
    await user.click(screen.getByTestId("button-bulk-send-steadfast"));
    await user.click(await screen.findByTestId("steadfast-chip-address"));

    expect(screen.getByText("#104")).toBeInTheDocument();
    expect(screen.queryByText("#103")).not.toBeInTheDocument();
    expect(screen.getByTestId("steadfast-issue-print-2")).toHaveTextContent("Add address");

    await user.click(screen.getByRole("button", { name: "All orders" }));
    expect(screen.getByText("#103")).toBeInTheDocument();
  });
});
