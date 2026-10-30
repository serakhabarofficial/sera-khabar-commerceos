import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OrdersTable, type Order } from "@/components/OrdersTable";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/useOrgName", () => ({ useOrgName: () => ({ orgName: "Sera Khabar" }) }));
vi.mock("@/hooks/useWarehouses", () => ({ useWarehouses: () => ({ warehouses: [] }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/ui/sonner", () => ({
  toast: { custom: vi.fn(), error: vi.fn(), success: vi.fn() },
  DarkToast: () => null,
}));

const order: Order = {
  id: "order-1",
  shopify_order_id: 101,
  order_number: "#101",
  customer_name: "Test Customer",
  phone: "01700000001",
  address: "Dhaka",
  product: "Mango",
  quantity: 1,
  price: 800,
  status: "pending",
  created_at: "2026-09-25T10:00:00.000Z",
  fraud_checked: false,
  fraud_data: null,
  delivery_rate: 60,
};

function renderOrdersTable(onStatusUpdate = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <OrdersTable orders={[order]} loading={false} onStatusUpdate={onStatusUpdate} />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { onStatusUpdate };
}

describe("OrdersTable individual hold action", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, order: { ...order, status: "on_hold" } }) });
  });

  it("requires a hold reason before PATCHing the selected row", async () => {
    const user = userEvent.setup();
    const { onStatusUpdate } = renderOrdersTable();
    const row = screen.getByRole("row", { name: /Open order #101/ });

    await user.click(within(row).getByRole("button", { name: /pending/i }));
    await user.click(await screen.findByRole("button", { name: /On Hold/ }));

    expect(await screen.findByRole("heading", { name: "অর্ডার হোল্ড করুন" })).toBeInTheDocument();
    expect(apiFetch.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
    expect(onStatusUpdate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "অর্ডার হোল্ডে রাখুন" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a hold reason");
    expect(apiFetch.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /Hold reason/ }));
    await user.click(await screen.findByRole("option", { name: "অগ্রিম পেমেন্টের জন্য অর্ডার হোল্ডে রাখা হয়েছে" }));
    await user.click(screen.getByRole("button", { name: "অর্ডার হোল্ডে রাখুন" }));

    await waitFor(() => {
      const patches = apiFetch.mock.calls.filter(([, init]) => init?.method === "PATCH");
      expect(patches).toHaveLength(1);
      expect(JSON.parse(String(patches[0]?.[1]?.body))).toMatchObject({
        status: "on_hold",
        hold_reason_code: "advance_payment_pending",
        hold_reason_detail: null,
        hold_until_date: null,
      });
    });
    expect(onStatusUpdate).toHaveBeenCalledWith("order-1", "on_hold");
  });
});

describe("OrdersTable hold call attempts", () => {
  const held = (attempt: number | null): Order => ({ ...order, status: "on_hold", hold_reason_code: "contact_later", hold_call_attempt: attempt });

  function renderHeld(heldOrder: Order) {
    const onOrderUpdate = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <MemoryRouter>
            <OrdersTable orders={[heldOrder]} loading={false} onStatusUpdate={vi.fn()} onOrderUpdate={onOrderUpdate} showHoldDetails />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );
    return { onOrderUpdate };
  }

  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  });

  it("moves an order from the 1st to the 2nd attempt", async () => {
    const user = userEvent.setup();
    const { onOrderUpdate } = renderHeld(held(null));
    const attempt = screen.getByTestId("hold-attempt");
    expect(attempt).toHaveTextContent("1st attempt");

    await user.click(within(attempt).getByRole("button", { name: "Move to 2nd" }));

    expect(onOrderUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: "order-1", hold_call_attempt: 2 }));
    const patch = apiFetch.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patch?.[0]).toBe("/api/orders/order-1");
    expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({ hold_call_attempt: 2 });
  });

  it("offers Confirm and Cancel on the final attempt", async () => {
    const user = userEvent.setup();
    renderHeld(held(3));
    const attempt = screen.getByTestId("hold-attempt");
    expect(attempt).toHaveTextContent("3rd attempt");
    expect(within(attempt).queryByRole("button", { name: /Move to/ })).toBeNull();

    await user.click(within(attempt).getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      const patch = apiFetch.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({ status: "confirmed" });
    });
  });
});
