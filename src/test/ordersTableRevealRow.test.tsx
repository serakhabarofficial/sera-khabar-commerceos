import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OrdersTable, type Order } from "@/components/OrdersTable";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/hooks/useOrgName", () => ({ useOrgName: () => ({ orgName: "Sera Khabar" }) }));
vi.mock("@/hooks/useWarehouses", () => ({ useWarehouses: () => ({ warehouses: [] }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/ui/sonner", () => ({ toast: { custom: vi.fn(), error: vi.fn(), success: vi.fn() }, DarkToast: () => null }));

const orders: Order[] = Array.from({ length: 50 }, (_, index) => ({
  id: `order-${index + 1}`,
  shopify_order_id: index + 1,
  order_number: `#${index + 1}`,
  customer_name: `Customer ${index + 1}`,
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
}));

function renderTable(revealOrderId?: string) {
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <MemoryRouter>
          <OrdersTable orders={orders} loading={false} onStatusUpdate={vi.fn()} revealOrderId={revealOrderId} />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return container.querySelectorAll("[data-order-row]");
}

describe("OrdersTable first render", () => {
  it("renders the first 20 rows, the rest following later", () => {
    expect(renderTable()).toHaveLength(20);
  });

  it("renders down past the order being returned to, so it can be scrolled to at once", () => {
    const rows = renderTable("order-31");
    expect([...rows].some((row) => row.getAttribute("data-order-row") === "order-31")).toBe(true);
    expect(rows).toHaveLength(43);
  });
});
