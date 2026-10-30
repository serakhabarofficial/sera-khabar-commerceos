import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "@/pages/Dashboard";
import { Toaster } from "@/components/ui/sonner";

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true, loading: false }) }));
vi.mock("@/hooks/useLiveVisitors", () => ({
  useLiveVisitors: () => ({ count: 0, details: { activeCarts: 0, checkingOut: 0, purchased: 0 }, visitors: [] }),
}));
vi.mock("@/hooks/useWarehouses", () => ({
  useWarehouses: () => ({ warehouses: [{ id: "main", name: "Main Warehouse" }] }),
}));
vi.mock("@/components/home/DottedGlobe", () => ({ DottedGlobe: () => null }));
vi.mock("@/components/ui/glyph-matrix", () => ({ default: () => null }));
vi.mock("recharts", () => ({
  BarChart: () => null,
  Bar: () => null,
  Cell: () => null,
  ResponsiveContainer: () => null,
  Tooltip: () => null,
}));
vi.mock("@/components/OrdersTable", () => ({ OrdersTable: () => null }));

const checkout = (id: string, name: string, phone: string) => ({
  id,
  status: "open",
  customer_name: name,
  phone,
  address: "House 1, Road 2, Dhaka",
  cart: [{ productName: "Sundarbans Honey", variantName: "1 kg", quantity: 1, unitPrice: 750 }],
  subtotal: 750,
  delivery_rate: 100,
  total: 850,
  source: "sundarbans_honey",
  source_path: "/step/sundarbans-natural-honey",
  campaign: {},
  contacted_at: null,
  created_at: "2026-10-30T08:00:00.000Z",
  updated_at: "2026-10-30T08:00:00.000Z",
});

const ACTIVE_ID = "7cb13b8e-b576-4faa-b238-cc8b73059772";
const DISMISSED_ID = "2f4c9a1e-3b7d-4e8f-9a6b-1c2d3e4f5a6b";
let active = [checkout(ACTIVE_ID, "Active Customer", "01812345678")];
const dismissed = [{
  ...checkout(DISMISSED_ID, "Rahim Uddin", "01711234567"),
  status: "dismissed",
  resolved_at: "2026-10-30T08:40:00.000Z",
  resolution: "dismissed",
  dismissed_by: "Nadia",
}];

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function patchCalls() {
  return apiFetch.mock.calls.filter(([, init]) => init?.method === "PATCH");
}

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Dashboard />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openIncompleteTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("radio", { name: /^Incomplete orders/ }));
}

describe("dismissed incomplete orders", () => {
  beforeEach(() => {
    sessionStorage.setItem("autosync_done_user-1", "1");
    sessionStorage.removeItem("dashboard-fulfillment-tab");
    localStorage.clear();
    active = [checkout(ACTIVE_ID, "Active Customer", "01812345678")];
    apiFetch.mockReset();
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders") return jsonResponse({ orders: [] });
      if (url === "/api/abandoned-checkouts") return jsonResponse({ checkouts: active, activeCount: active.length });
      if (url === "/api/abandoned-checkouts/dismissed") return jsonResponse({ checkouts: dismissed });
      if (init?.method === "PATCH" && url.startsWith("/api/abandoned-checkouts/")) {
        const id = url.split("/").pop();
        const action = JSON.parse(String(init.body)).action;
        return jsonResponse({ checkout: { ...checkout(id!, "Customer", "01700000000"), status: action } });
      }
      if (url === "/api/products") return jsonResponse({ products: [] });
      if (url.startsWith("/api/analytics")) {
        return jsonResponse({
          revenue: 0, shipping: 0, adSpend: 0, totalCog: 0, cogCoverage: { set: 0, total: 0 },
          profit: 0, fbConfigured: false, usdToBdt: 120, fbError: null,
        });
      }
      return jsonResponse({ updated: 0 });
    });
  });

  it("lists dismissed checkouts with who dismissed them and restores one", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await openIncompleteTab(user);

    await user.click(await screen.findByRole("tab", { name: /Dismissed/ }));
    const list = await screen.findByTestId("dismissed-checkout-list");
    expect(list).toHaveTextContent("Rahim Uddin");
    expect(list).toHaveTextContent("by Nadia");

    await user.click(within(list).getByRole("button", { name: /Restore checkout from Rahim Uddin/ }));
    await waitFor(() => expect(patchCalls()).toContainEqual([
      `/api/abandoned-checkouts/${DISMISSED_ID}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open" }) },
    ]));
  });

  it("finds a dismissed checkout by phone from the Active view", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await openIncompleteTab(user);

    await user.type(await screen.findByTestId("input-search-abandoned"), "01711");
    const matches = await screen.findByTestId("dismissed-search-matches", {}, { timeout: 2000 });
    expect(matches).toHaveTextContent("Rahim Uddin");
  });

  it("copies a dismissed checkout's phone number", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderDashboard();
    await openIncompleteTab(user);
    await user.click(await screen.findByRole("tab", { name: /Dismissed/ }));

    await user.click(await screen.findByTestId(`copy-dismissed-phone-${DISMISSED_ID}`));
    expect(writeText).toHaveBeenCalledWith("01711234567");
    expect(await screen.findByText("Phone number copied")).toBeInTheDocument();
  });

  it("offers Undo right after a dismiss", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await openIncompleteTab(user);

    await user.click(await screen.findByRole("button", { name: "Dismiss checkout" }));
    await user.click(await screen.findByRole("button", { name: "Confirm dismiss" }));
    await user.click(await screen.findByTestId("undo-dismiss"));

    await waitFor(() => expect(patchCalls().map(([url, init]) => [url, JSON.parse(String(init.body)).action])).toEqual([
      [`/api/abandoned-checkouts/${ACTIVE_ID}`, "dismissed"],
      [`/api/abandoned-checkouts/${ACTIVE_ID}`, "open"],
    ]));
  });
});
