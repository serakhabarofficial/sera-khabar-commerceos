import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import OrderDetail from "@/pages/OrderDetail";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/components/order-editor/ProductPicker", () => ({ ProductPicker: () => null }));
vi.mock("@/components/order-editor/OrderItemsTable", () => ({ OrderItemsTable: () => null }));
vi.mock("@/components/order-editor/OrderPaymentPanel", () => ({ OrderPaymentPanel: () => null, CollectOnDeliveryBar: () => null }));
vi.mock("@/components/order-editor/CustomerDossier", () => ({
  CustomerDossier: (props: {
    order: { customer_name?: string };
    customer: { customerName: string; phone: string; address: string };
    onApply: (customer: { customerName: string; phone: string; address: string }) => void;
    note?: string;
    onNoteChange?: (note: string) => void;
  }) =>
    createElement(
      "div",
      null,
      createElement("span", { "data-testid": "customer-name" }, props.order.customer_name || ""),
      createElement(
        "button",
        { onClick: () => props.onApply({ ...props.customer, phone: "01799999999" }) },
        "Change phone",
      ),
      createElement("span", { "data-testid": "order-note" }, props.note ?? ""),
      createElement("button", { onClick: () => props.onNoteChange?.("Call after 5pm") }, "Write note"),
    ),
}));
vi.mock("@/components/order-editor/OrderSavePanel", () => ({
  OrderSavePanel: (props: { onStatusChange: (status: string) => void }) =>
    createElement("button", { onClick: () => props.onStatusChange("confirmed") }, "Mark confirmed"),
  OrderSaveActions: (props: { onSave: () => void }) => createElement("button", { onClick: props.onSave }, "Save"),
}));

const orderOne = {
  id: "order-1", order_number: "ML-1001", customer_name: "Ayesha Rahman", phone: "01711111111",
  address: "Dhanmondi, Dhaka", status: "confirmed", delivery_rate: 80, price: 580,
  discount: 0, sent_to_courier: false, created_at: "2026-09-03T09:00:00Z", updated_at: "2026-09-03T10:00:00Z",
};
const orderTwo = {
  id: "order-2", order_number: "ML-1002", customer_name: "Karim Hossain", phone: "01722222222",
  address: "Gulshan, Dhaka", status: "confirmed", delivery_rate: 80, price: 400,
  discount: 0, sent_to_courier: false, created_at: "2026-09-02T09:00:00Z", updated_at: "2026-09-02T10:00:00Z",
};

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function renderOrderDetail(pendingOrderIds: string[], startId = "order-1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        {
          initialEntries: [
            {
              pathname: `/orders/${startId}`,
              state: { fulfillmentTab: "pending", pendingOrderIds },
            },
          ],
        },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/orders/:id", element: createElement(OrderDetail) }),
          createElement(Route, { path: "/orders", element: createElement("div", { "data-testid": "dashboard-stub" }) }),
        ),
      ),
    ),
  );
}

function renderNewTabOrderDetail(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        { initialEntries: [entry] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/orders/:id", element: createElement(OrderDetail) }),
          createElement(Route, { path: "/orders", element: createElement("div", { "data-testid": "dashboard-stub" }) }),
        ),
      ),
    ),
  );
}

describe("pending order prev/next navigation", () => {
  it("shows the queue position and disables Previous on the first pending order", async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/order-handling/")) return Promise.resolve(response({ status: "handling", holder: { name: "Sadia" }, expires_at: new Date(Date.now() + 300_000).toISOString() }));
      if (url === "/api/orders/order-1") return Promise.resolve(response({ order: orderOne, items: [], canEditItems: true }));
      if (url === "/api/products") return Promise.resolve(response({ products: [] }));
      if (url === "/api/orders") return Promise.resolve(response({ orders: [orderOne, orderTwo] }));
      return Promise.resolve(response({}));
    });

    renderOrderDetail(["order-1", "order-2"]);

    const nav = await screen.findByTestId("order-editor-pending-nav");
    expect(nav).toHaveTextContent("1 of 2 pending");
    expect(screen.getByRole("button", { name: "Previous pending order" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next pending order" })).toBeEnabled();
    // No chip for Previous (disabled/boundary); the Next chip previews order-2's number.
    await waitFor(() => expect(nav).toHaveTextContent("#ML-1002"));
  });

  it("navigates to the next pending order and disables Next at the end of the queue", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/order-handling/")) return Promise.resolve(response({ status: "handling", holder: { name: "Sadia" }, expires_at: new Date(Date.now() + 300_000).toISOString() }));
      if (url === "/api/orders/order-1") return Promise.resolve(response({ order: orderOne, items: [], canEditItems: true }));
      if (url === "/api/orders/order-2") return Promise.resolve(response({ order: orderTwo, items: [], canEditItems: true }));
      if (url === "/api/products") return Promise.resolve(response({ products: [] }));
      if (url === "/api/orders") return Promise.resolve(response({ orders: [orderOne, orderTwo] }));
      return Promise.resolve(response({}));
    });

    renderOrderDetail(["order-1", "order-2"]);

    await screen.findByTestId("order-editor-pending-nav");
    expect(await screen.findByTestId("customer-name")).toHaveTextContent("Ayesha Rahman");

    await user.click(screen.getByRole("button", { name: "Next pending order" }));

    await waitFor(() => expect(screen.getByTestId("customer-name")).toHaveTextContent("Karim Hossain"));
    expect(screen.getByTestId("order-editor-pending-nav")).toHaveTextContent("2 of 2 pending");
    expect(screen.getByRole("button", { name: "Next pending order" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous pending order" })).toBeEnabled();
  });

  it("stays on the page and does not bounce back to the dashboard after saving", async () => {
    const user = userEvent.setup();
    const { toast } = await import("@/components/ui/sonner");
    const successSpy = vi.spyOn(toast, "success");
    try {
      apiFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.startsWith("/api/order-handling/")) return Promise.resolve(response({ status: "handling", holder: { name: "Sadia" }, expires_at: new Date(Date.now() + 300_000).toISOString() }));
        if (url === "/api/orders/order-1" && (!init || init.method === undefined)) {
          return Promise.resolve(response({ order: orderOne, items: [], canEditItems: true }));
        }
        if (url === "/api/orders/order-1" && init?.method === "PATCH") {
          return Promise.resolve(response({ order: { ...orderOne, phone: "01799999999" } }));
        }
        if (url === "/api/products") return Promise.resolve(response({ products: [] }));
        if (url === "/api/orders") return Promise.resolve(response({ orders: [orderOne, orderTwo] }));
        return Promise.resolve(response({}));
      });

      renderOrderDetail(["order-1", "order-2"]);

      await screen.findByTestId("order-editor-pending-nav");
      await screen.findByTestId("customer-name");
      await waitFor(() => expect(screen.getByRole("button", { name: "Change phone" })).toBeEnabled());
      await user.click(screen.getByRole("button", { name: "Change phone" }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(successSpy).toHaveBeenCalledWith("Order saved"));
      expect(screen.queryByTestId("dashboard-stub")).not.toBeInTheDocument();
      expect(screen.getByTestId("order-editor-pending-nav")).toHaveTextContent("1 of 2 pending");
      expect(apiFetch).toHaveBeenCalledWith("/api/orders/order-1", expect.objectContaining({ method: "PATCH" }));
    } finally {
      successSpy.mockRestore();
    }
  });

  it("loads the order note and saves an edited note with the order", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith("/api/order-handling/")) return Promise.resolve(response({ status: "handling", holder: { name: "Sadia" }, expires_at: new Date(Date.now() + 300_000).toISOString() }));
      if (url === "/api/orders/order-1" && init?.method === "PATCH") return Promise.resolve(response({ order: { ...orderOne, notes: "Call after 5pm" } }));
      if (url === "/api/orders/order-1") return Promise.resolve(response({ order: { ...orderOne, notes: "Gift wrap" }, items: [], canEditItems: true }));
      if (url === "/api/products") return Promise.resolve(response({ products: [] }));
      if (url === "/api/orders") return Promise.resolve(response({ orders: [orderOne, orderTwo] }));
      return Promise.resolve(response({}));
    });

    renderOrderDetail(["order-1", "order-2"]);

    expect(await screen.findByTestId("order-note")).toHaveTextContent("Gift wrap");
    await waitFor(() => expect(screen.getByRole("button", { name: "Write note" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Write note" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const call = apiFetch.mock.calls.filter(([url, init]) => url === "/api/orders/order-1" && init?.method === "PATCH").at(-1);
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ notes: "Call after 5pm" });
    });
    await waitFor(() => expect(screen.getByTestId("order-note")).toHaveTextContent("Call after 5pm"));
  });

  it("shows the confirmed pill instead of the saved toast when a pending order is confirmed", async () => {
    const user = userEvent.setup();
    const { toast } = await import("@/components/ui/sonner");
    const { confirmedPill } = await import("@/lib/confirmedPill");
    const successSpy = vi.spyOn(toast, "success");
    const savingSpy = vi.spyOn(confirmedPill, "saving");
    const confirmedSpy = vi.spyOn(confirmedPill, "confirmed");
    const pendingOrder = { ...orderOne, status: "pending" };
    try {
      apiFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.startsWith("/api/order-handling/")) return Promise.resolve(response({ status: "handling", holder: { name: "Sadia" }, expires_at: new Date(Date.now() + 300_000).toISOString() }));
        if (url === "/api/orders/order-1" && init?.method === "PATCH") return Promise.resolve(response({ order: { ...pendingOrder, status: "confirmed" } }));
        if (url === "/api/orders/order-1") return Promise.resolve(response({ order: pendingOrder, items: [], canEditItems: true }));
        if (url === "/api/products") return Promise.resolve(response({ products: [] }));
        if (url === "/api/orders") return Promise.resolve(response({ orders: [pendingOrder, orderTwo] }));
        return Promise.resolve(response({}));
      });

      renderOrderDetail(["order-1", "order-2"]);

      await screen.findByTestId("order-editor-pending-nav");
      await waitFor(() => expect(screen.getByRole("button", { name: "Mark confirmed" })).toBeEnabled());
      await user.click(screen.getByRole("button", { name: "Mark confirmed" }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(confirmedSpy).toHaveBeenCalledWith("#ML-1001"));
      expect(savingSpy).toHaveBeenCalled();
      expect(successSpy).not.toHaveBeenCalledWith("Order saved");
    } finally {
      successSpy.mockRestore(); savingSpy.mockRestore(); confirmedSpy.mockRestore();
      confirmedPill.dismiss();
    }
  });

  it("shows pending nav in a new tab from the stored snapshot", async () => {
    localStorage.clear();
    localStorage.setItem(
      "ml:pending-order-queue",
      JSON.stringify({ ids: ["order-1", "order-2"], savedAt: Date.now() }),
    );
    apiFetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/order-handling/")) return Promise.resolve(response({ status: "handling", holder: { name: "Sadia" }, expires_at: new Date(Date.now() + 300_000).toISOString() }));
      if (url === "/api/orders/order-1") return Promise.resolve(response({ order: orderOne, items: [], canEditItems: true }));
      if (url === "/api/products") return Promise.resolve(response({ products: [] }));
      if (url === "/api/orders") return Promise.resolve(response({ orders: [orderOne, orderTwo] }));
      return Promise.resolve(response({}));
    });

    renderNewTabOrderDetail("/orders/order-1?fulfillmentTab=pending");

    const nav = await screen.findByTestId("order-editor-pending-nav");
    expect(nav).toHaveTextContent("1 of 2 pending");
    expect(screen.getByRole("button", { name: "Next pending order" })).toBeEnabled();
    localStorage.clear();
  });

  it("keeps pending nav after Next in a new tab", async () => {
    localStorage.clear();
    localStorage.setItem(
      "ml:pending-order-queue",
      JSON.stringify({ ids: ["order-1", "order-2"], savedAt: Date.now() }),
    );
    apiFetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/order-handling/")) return Promise.resolve(response({ status: "handling", holder: { name: "Sadia" }, expires_at: new Date(Date.now() + 300_000).toISOString() }));
      if (url === "/api/orders/order-1") return Promise.resolve(response({ order: orderOne, items: [], canEditItems: true }));
      if (url === "/api/orders/order-2") return Promise.resolve(response({ order: orderTwo, items: [], canEditItems: true }));
      if (url === "/api/products") return Promise.resolve(response({ products: [] }));
      if (url === "/api/orders") return Promise.resolve(response({ orders: [orderOne, orderTwo] }));
      return Promise.resolve(response({}));
    });

    renderNewTabOrderDetail("/orders/order-1?fulfillmentTab=pending");

    await screen.findByTestId("order-editor-pending-nav");
    await userEvent.click(screen.getByRole("button", { name: "Next pending order" }));

    await waitFor(() => expect(screen.getByTestId("customer-name")).toHaveTextContent("Karim Hossain"));
    expect(screen.getByTestId("order-editor-pending-nav")).toHaveTextContent("2 of 2 pending");
    localStorage.clear();
  });

  it("hides pending nav in a new tab without pending context", async () => {
    localStorage.clear();
    localStorage.setItem(
      "ml:pending-order-queue",
      JSON.stringify({ ids: ["order-1", "order-2"], savedAt: Date.now() }),
    );
    apiFetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/order-handling/")) return Promise.resolve(response({ status: "handling", holder: { name: "Sadia" }, expires_at: new Date(Date.now() + 300_000).toISOString() }));
      if (url === "/api/orders/order-1") return Promise.resolve(response({ order: orderOne, items: [], canEditItems: true }));
      if (url === "/api/products") return Promise.resolve(response({ products: [] }));
      if (url === "/api/orders") return Promise.resolve(response({ orders: [orderOne, orderTwo] }));
      return Promise.resolve(response({}));
    });

    renderNewTabOrderDetail("/orders/order-1");

    await screen.findByTestId("customer-name");
    expect(screen.queryByTestId("order-editor-pending-nav")).not.toBeInTheDocument();
    localStorage.clear();
  });
});

describe("order editor cancellation reason", () => {
  it('links the server campaign summary to its campaign detail', async () => {
    apiFetch.mockImplementation((url: string) => Promise.resolve(response(url === '/api/orders/order-1'
      ? { order: { ...orderOne, campaign_link_id: 'link-1' }, items: [], canEditItems: true, campaign: { name: 'Mango reel', slug: 'mango-reel', channel: 'facebook' } }
      : { products: [] })));
    renderNewTabOrderDetail('/orders/order-1');
    expect(await screen.findByRole('link', { name: 'Campaign: Mango reel' })).toHaveAttribute('href', '/campaign-links/link-1');
  });
  function mockOrder(order: Record<string, unknown>) {
    apiFetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/order-handling/")) return Promise.resolve(response({ status: "handling", holder: { name: "Sadia" }, expires_at: new Date(Date.now() + 300_000).toISOString() }));
      if (url === "/api/orders/order-1") return Promise.resolve(response({ order, items: [], canEditItems: true }));
      if (url === "/api/products") return Promise.resolve(response({ products: [] }));
      return Promise.resolve(response({}));
    });
  }

  it("shows the staff cancellation reason beside the order number", async () => {
    mockOrder({ ...orderOne, status: "cancelled", cancellation_reason_code: "customer_unreachable", cancellation_reason_note: "Phone off for 2 days" });

    renderNewTabOrderDetail("/orders/order-1");

    const reason = await screen.findByTestId("order-editor-cancellation-reason");
    expect(reason).toHaveTextContent(/^Cancelled: গ্রাহকের সাথে যোগাযোগ করা যায়নি$/);
    expect(reason).toHaveClass("bg-status-yellow-background");
  });

  it("hides the reason when the order is not cancelled", async () => {
    mockOrder({ ...orderOne, status: "confirmed", cancellation_reason_code: "customer_unreachable" });

    renderNewTabOrderDetail("/orders/order-1");

    await screen.findByTestId("customer-name");
    expect(screen.queryByTestId("order-editor-cancellation-reason")).not.toBeInTheDocument();
  });
});
