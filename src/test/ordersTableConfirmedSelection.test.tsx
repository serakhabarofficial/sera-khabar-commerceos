import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OrdersTable, type Order } from "@/components/OrdersTable";
import { OrderTablePagination } from "@/components/orders/OrderTablePagination";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/hooks/useOrgName", () => ({ useOrgName: () => ({ orgName: "Sera Khabar" }) }));
vi.mock("@/hooks/useWarehouses", () => ({ useWarehouses: () => ({ warehouses: [] }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/ui/sonner", () => ({
  toast: { custom: vi.fn(), error: vi.fn(), success: vi.fn() },
  DarkToast: () => null,
}));

const makeOrder = (n: number): Order => ({
  id: `order-${n}`,
  shopify_order_id: n,
  order_number: `#${n}`,
  customer_name: `Customer ${n}`,
  phone: `0170000000${n}`,
  address: "Mirpur 2, Dhaka",
  product: "Mango",
  quantity: 1,
  price: 800,
  status: "confirmed",
  created_at: "2026-09-25T10:00:00.000Z",
  fraud_checked: false,
  fraud_data: null,
  delivery_rate: 60,
});

const pageOne = [makeOrder(1), makeOrder(2)];
const pageTwo = [makeOrder(3)];

function Harness({ initialSelected = [] as string[] }) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(new Set(initialSelected));
  return (
    <>
      <OrdersTable
        orders={page === 0 ? pageOne : pageTwo}
        loading={false}
        onStatusUpdate={vi.fn()}
        selectedIds={selected}
        onSelectionChange={setSelected}
        rowClickSelects
      />
      <p data-testid="selected">{[...selected].sort().join(",")}</p>
      <OrderTablePagination page={page} pageSize={2} totalItems={3} onPageChange={setPage} />
    </>
  );
}

function renderHarness(initialSelected: string[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/orders"]}>
          <Routes>
            <Route path="/orders" element={<Harness initialSelected={initialSelected} />} />
            <Route path="/orders/:id" element={<p>Order editor</p>} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("Confirmed tab selection", () => {
  it("selects a row when the row is clicked instead of opening it", () => {
    renderHarness();
    fireEvent.click(screen.getByText("Customer 1"));
    expect(screen.getByTestId("selected")).toHaveTextContent("order-1");
    expect(screen.queryByText("Order editor")).toBeNull();
  });

  it("opens the order from the Open button", () => {
    renderHarness();
    fireEvent.click(screen.getByTestId("button-open-order-order-1"));
    expect(screen.getByText("Order editor")).toBeInTheDocument();
  });

  it("adds this page to orders already selected on another page", () => {
    renderHarness(["order-3"]);
    fireEvent.click(screen.getByTestId("checkbox-orders-all"));
    expect(screen.getByTestId("selected")).toHaveTextContent("order-1,order-2,order-3");
    fireEvent.click(screen.getByTestId("checkbox-orders-all"));
    expect(screen.getByTestId("selected")).toHaveTextContent(/^order-3$/);
  });

  it("jumps to a typed page number", () => {
    renderHarness();
    const input = screen.getByTestId("order-pagination-page-input");
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.submit(input.closest("form")!);
    expect(screen.getByText("Customer 3")).toBeInTheDocument();
    expect(input).toHaveValue("2");
  });
});
