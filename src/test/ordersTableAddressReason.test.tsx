import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OrdersTable, type Order } from "@/components/OrdersTable";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
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
  address: "Mirpur 2, Dhaka",
  product: "Mango",
  quantity: 1,
  price: 800,
  status: "pending",
  created_at: "2026-09-25T10:00:00.000Z",
  fraud_checked: false,
  fraud_data: null,
  delivery_rate: 60,
};

function renderRow(row: Order, props: { showCancellationReason?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <OrdersTable orders={[row]} loading={false} onStatusUpdate={vi.fn()} {...props} />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("OrdersTable address bar reason", () => {
  it("shows no reason for active orders", () => {
    renderRow(order);
    expect(screen.queryByTestId("order-address-reason-order-1")).toBeNull();
  });

  it("shows the hold reason and hold-until date", () => {
    renderRow({ ...order, status: "on_hold", hold_reason_code: "customer_requested_after_date", hold_until_date: "2026-11-02" });
    const reason = screen.getByTestId("order-address-reason-order-1");
    expect(reason).toHaveTextContent("Hold");
    expect(reason).toHaveTextContent("গ্রাহক নির্দিষ্ট তারিখের পরে পার্সেল নিতে চান");
    expect(reason).toHaveTextContent("until 2 Nov");
  });

  it("shows how many days an order without a return date has been on hold", () => {
    renderRow({ ...order, status: "on_hold", hold_reason_code: "contact_later", hold_started_at: new Date().toISOString() });
    expect(screen.getByTestId("order-address-reason-order-1")).toHaveTextContent("0d");
  });

  it("shows the cancellation reason and staff note", () => {
    renderRow({ ...order, status: "cancelled", cancellation_reason_code: "duplicate_order", cancellation_reason_note: "Same order twice" });
    const reason = screen.getByTestId("order-address-reason-order-1");
    expect(reason).toHaveTextContent("Cancelled");
    expect(reason).toHaveTextContent("ডুপ্লিকেট অর্ডার — Same order twice");
  });

  it("leaves the reason out of the bar in the cancelled view, which has its own Reason column", () => {
    renderRow({ ...order, status: "cancelled", cancellation_reason_code: "duplicate_order" }, { showCancellationReason: true });
    expect(screen.queryByTestId("order-address-reason-order-1")).toBeNull();
  });
});
