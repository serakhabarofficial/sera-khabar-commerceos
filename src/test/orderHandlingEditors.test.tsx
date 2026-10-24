import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import OrderDetail from "@/pages/OrderDetail";
import AbandonedDetail from "@/pages/AbandonedDetail";
import { OrderProtectionReviewQueue } from "@/components/OrderProtectionReviewQueue";
import { ORDER_HANDLING_CONFLICT_EVENT } from "@/lib/orderHandling";
const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));
const order = { id: "one", order_number: "SK-1", customer_name: "Customer", phone: "01711111111", address: "Dhaka", status: "pending", source: "manual", updated_at: "v1", price: 100, delivery_rate: 100 };
const checkout = { id: "one", customer_name: "Customer", phone: "01711111111", address: "Dhaka", status: "open", updated_at: "v1", created_at: "2026-10-24T00:00:00Z", cart: [], delivery_rate: 100, campaign: {} };
const review = { id: "one", customer_name: "Customer", phone: "01711111111", address: "Dhaka", created_at: "2026-10-24T00:00:00Z", items: [], score: 2, reason_codes: [], source_route: "/checkout" };
let owner = true;
const acquisitions: string[] = [];
function reply(value: unknown) { return { ok: true, status: 200, json: async () => value } as Response; }
beforeEach(() => {
  owner = true; acquisitions.length = 0;
  apiFetch.mockReset().mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.startsWith("/api/order-handling")) {
      if (JSON.parse(String(options?.body)).action === "acquire") acquisitions.push(url);
      return reply({ status: owner ? "handling" : "view_only", holder: owner ? null : { name: "Sadia" }, expires_at: null });
    }
    if (url === "/api/orders/one") return reply({ order, items: [], canEditItems: true });
    if (url === "/api/products") return reply({ products: [] });
    if (url === "/api/abandoned-checkouts") return reply({ checkouts: [checkout], activeCount: 1 });
    if (url.includes("order-protection/reviews")) return reply({ reviews: [review, { ...review, id: "two", customer_name: "Second" }] });
    if (url === "/api/orders") return reply({ orders: [order] });
    return reply({ events: [], calls: [] });
  });
});
afterEach(cleanup);
function mount(page: "order" | "abandoned" | "review", client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return { client, ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/${page}/one`]}><Routes><Route path="/order/:id" element={<OrderDetail />} /><Route path="/abandoned/:id" element={<AbandonedDetail />} /><Route path="/review/:id" element={<OrderProtectionReviewQueue />} /><Route path="/orders" element={<div>Orders home</div>} /></Routes></MemoryRouter></QueryClientProvider>) };
}
it("order actions fail closed for another handler, including call links, and copying remains available", async () => {
  owner = false; mount("order");
  await screen.findByRole("dialog"); fireEvent.click(screen.getByRole("button", { name: "View only" }));
  expect(screen.getByRole("button", { name: "Edit customer" })).toBeDisabled();
  expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
  expect(screen.getByLabelText("Call customer")).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByLabelText("Call customer")).not.toHaveAttribute("href");
  expect(screen.getByRole("button", { name: "Copy phone number" })).toBeEnabled();
});
it("abandoned actions cannot submit or dismiss while status is unavailable", async () => {
  apiFetch.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/order-handling")) return { ok: false, status: 503, json: async () => ({}) };
    if (url === "/api/abandoned-checkouts") return reply({ checkouts: [checkout] });
    if (url === "/api/products") return reply({ products: [] });
    return reply({ events: [] });
  });
  mount("abandoned"); await screen.findByRole("button", { name: "Retry status" });
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Dismiss" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
});
it("keeps an unapplied customer draft on owner loss and cache refresh", async () => {
  const { client } = mount("order");
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit customer" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Edit customer" }));
  fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "Retained draft" } });
  act(() => window.dispatchEvent(new CustomEvent(ORDER_HANDLING_CONFLICT_EVENT, { detail: { holder: { name: "Sadia" } } })));
  fireEvent.click(screen.getByRole("button", { name: "View only" }));
  act(() => client.setQueryData(["/api/orders/one"], { order: { ...order, customer_name: "Other edit", updated_at: "v2" }, items: [], canEditItems: true }));
  expect(screen.getByLabelText("Customer name")).toHaveValue("Retained draft");
  expect(screen.getByRole("status")).toHaveTextContent(/draft.*retained/i);
});
it("approves protection reviews without reserving them", async () => {
  mount("review");
  await screen.findByText("Second");
  expect(acquisitions).toEqual([]);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /open review/i })).not.toBeInTheDocument();
  const articles = screen.getAllByRole("article");
  expect(within(articles[0]).getByRole("button", { name: /approve order/i })).toBeEnabled();
  expect(within(articles[1]).getByRole("button", { name: /approve order/i })).toBeEnabled();
});

it("refreshes a cached abandoned checkout after initial acquisition before editing", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["/api/abandoned-checkouts"], { checkouts: [checkout], activeCount: 1 });
  const original = apiFetch.getMockImplementation()!;
  let finish: (value: Response) => void = () => {};
  apiFetch.mockImplementation((url: string, options?: RequestInit) => url === "/api/abandoned-checkouts"
    ? new Promise<Response>(resolve => { finish = resolve; }) : original(url, options));
  mount("abandoned", client);
  await waitFor(() => expect(acquisitions).toHaveLength(1));
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await act(async () => { finish(reply({ checkouts: [{ ...checkout, customer_name: "Latest customer", updated_at: "v2" }], activeCount: 1 })); });
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit customer" })).toBeEnabled());
  expect(screen.getByRole("heading", { name: "Latest customer" })).toBeInTheDocument();
});
it("retains abandoned local inputs and baseline across ownership loss, refresh and a stale save", async () => {
  const savedCheckout = { ...checkout, cart: [{ productName: "Mango", variantName: null, quantity: 1, unitPrice: 100 }] };
  const original = apiFetch.getMockImplementation()!;
  let latestCheckout = savedCheckout;
  apiFetch.mockImplementation((url: string, options?: RequestInit) => {
    if (url === "/api/abandoned-checkouts") return Promise.resolve(reply({ checkouts: [latestCheckout], activeCount: 1 }));
    if (url === "/api/abandoned-checkouts/one" && options?.method === "PATCH") return Promise.resolve({ ok: false, status: 409, json: async () => ({ code: "stale_write", error: "Checkout changed before it could be saved" }) });
    return original(url, options);
  });
  const { client } = mount("abandoned");
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit customer" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Edit customer" }));
  fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "Retained draft" } });
  act(() => window.dispatchEvent(new CustomEvent(ORDER_HANDLING_CONFLICT_EVENT, { detail: { holder: { name: "Sadia" } } })));
  fireEvent.click(screen.getByRole("button", { name: "View only" }));
  act(() => client.setQueryData(["/api/abandoned-checkouts"], { checkouts: [{ ...savedCheckout, customer_name: "Other edit", updated_at: "v2" }], activeCount: 1 }));
  expect(screen.getByLabelText("Customer name")).toHaveValue("Retained draft");
  latestCheckout = { ...savedCheckout, customer_name: "Other edit", updated_at: "v2" };
  // BFCache restoration offers a deliberate new acquisition without wiping the open customer panel.
  fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
  fireEvent.click(screen.getByRole("button", { name: "Start handling" }));
  await waitFor(() => expect(screen.getByLabelText("Customer name")).toBeEnabled());
  expect(screen.getByLabelText("Customer name")).toHaveValue("Retained draft");
  fireEvent.click(screen.getByRole("button", { name: "Apply customer changes" }));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("alert");
  const patch = apiFetch.mock.calls.find(([url, options]) => url === "/api/abandoned-checkouts/one" && options?.method === "PATCH");
  expect(JSON.parse(String(patch?.[1].body))).toMatchObject({ customerName: "Retained draft", expected_updated_at: "v1" });
  expect(screen.queryByText("Orders home")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Retained draft" })).toBeInTheDocument();
});

// Execute just the owned route, with the database boundary controlled to reproduce a racing write.
it.each(["stale baseline", "race after read"])("abandoned PATCH rejects %s without overwriting or recording activity", async (scenario) => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(`${process.cwd()}/server/index.js`, "utf8");
  const start = source.indexOf('app.patch("/api/abandoned-checkouts/:id",');
  const route = source.slice(start, source.indexOf("async function resolveAbandonedCatalogIds", start));
  type Reply = { status: (code: number) => Reply; json: (body: unknown) => Reply };
  let handler!: (req: unknown, res: Reply) => Promise<unknown>;
  let row = { ...checkout, updated_at: scenario === "stale baseline" ? "v2" : "v1" };
  let patch: Record<string, unknown> | undefined;
  const filters: Record<string, unknown> = {};
  const query = {
    select: () => query, in: () => query, gt: () => query,
    eq: (key: string, value: unknown) => { filters[key] = value; return query; },
    update: (value: Record<string, unknown>) => { patch = value; return query; },
    maybeSingle: async () => {
      if (!patch) {
        const snapshot = { ...row };
        if (scenario === "race after read") row = { ...row, updated_at: "v2" };
        return { data: snapshot, error: null };
      }
      if (filters.updated_at && filters.updated_at !== row.updated_at) return { data: null, error: null };
      row = { ...row, ...patch };
      return { data: row, error: null };
    },
  };
  const activity = vi.fn();
  const deps = {
    app: { patch: (_path: string, callback: typeof handler) => { handler = callback; } },
    getToken: () => "token", getUser: async () => ({ user: { id: "user" } }),
    isAbandonedCheckoutDraftKey: () => true, getServiceSupabase: () => ({ from: () => query }),
    getUserOrg: async () => ({ orgId: "workspace" }), normalizeActivityGroupId: () => "group",
    ACTIVE_ABANDONED_CHECKOUT_STATUSES: ["open", "contacted"], ABANDONED_CHECKOUT_DASHBOARD_FIELDS: "*",
    parseAbandonedCheckoutStaffEdit: () => ({ customer_name: "Overwrite", updated_at: "v3" }),
    validateAdditionReasons: () => {}, buildOrderChanges: () => [], recordOrderActivity: activity,
    sendError: (res: Reply) => res.status(500).json({ error: "Unexpected error" }),
  };
  new Function(...Object.keys(deps), route)(...Object.values(deps));
  let status = 200;
  let body: unknown;
  const res: Reply = { status: code => { status = code; return res; }, json: value => { body = value; return res; } };
  await handler({ params: { id: "one" }, body: { expected_updated_at: "v1", customerName: "Overwrite" } }, res);
  expect(status).toBe(409);
  expect(body).toMatchObject({ code: "stale_write" });
  expect(row.customer_name).toBe("Customer");
  expect(activity).not.toHaveBeenCalled();
});
