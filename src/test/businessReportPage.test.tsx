import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/components/DateRangePicker", () => ({
  DateRangePicker: ({ onChange }: { onChange: (range: { from: Date; to: Date } | null) => void }) => (
    <button type="button" onClick={() => onChange(null)}>All time</button>
  ),
}));
vi.mock("@/components/business-report/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));

import { apiFetch } from "@/lib/api";
import type { BusinessReportResponse, Metrics, ProductWeight, SeriesBucket } from "@/components/business-report/types";
import BusinessReport from "@/pages/BusinessReport";

const apiFetchMock = vi.mocked(apiFetch);

function metrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    intake_count: 0,
    order_value: 0,
    approved_count: 0,
    approved_value: 0,
    cancelled_count: 0,
    cancelled_value: 0,
    returned_count: 0,
    returned_value: 0,
    pending_count: 0,
    pending_value: 0,
    delivery_charged: 0,
    courier_fees_recorded: 0,
    net_delivery_position: 0,
    courier_fee_order_count: 0,
    order_kg: 0,
    approved_kg: 0,
    cancelled_kg: 0,
    returned_kg: 0,
    pending_kg: 0,
    weight_order_count: 0,
    ...overrides,
  };
}

function hourlyBuckets(): SeriesBucket[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const label = `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`;
    return {
      key: `2026-09-20-${hour}`,
      label,
      intake_count: hour === 9 ? 2 : 0,
      order_value: hour === 9 ? 1400 : 0,
      website_value: 0,
      order_kg: 0,
      approved_count: 0,
      cancelled_count: 0,
      cancelled_value: 0,
    };
  });
}

function dailyBuckets(): SeriesBucket[] {
  return Array.from({ length: 7 }, (_, index) => ({
    key: `2026-09-${14 + index}`,
    label: `Sep ${14 + index}`,
    intake_count: 80 + index * 5,
    order_value: (80 + index * 5) * 100,
    website_value: 0,
    order_kg: 0,
    approved_count: 0,
    cancelled_count: 0,
    cancelled_value: 0,
  }));
}

function reportResponse(overrides: Partial<BusinessReportResponse> = {}): BusinessReportResponse {
  return {
    range: { from: "2026-09-20", to: "2026-09-20" },
    summary: metrics({
      intake_count: 4,
      order_value: 2400,
      approved_count: 1,
      approved_value: 1000,
      cancelled_count: 1,
      cancelled_value: 400,
      returned_count: 1,
      returned_value: 700,
      pending_count: 1,
      pending_value: 300,
      delivery_charged: 120,
      courier_fees_recorded: 130,
      net_delivery_position: -10,
      courier_fee_order_count: 3,
    }),
    series: {
      granularity: "hour",
      label: "Intake by hour",
      buckets: hourlyBuckets(),
    },
    sources: [
      {
        source: "website",
        label: "Website",
        ...metrics({
          intake_count: 2,
          order_value: 1400,
          approved_count: 1,
          approved_value: 1000,
          cancelled_count: 1,
          cancelled_value: 400,
          delivery_charged: 120,
          courier_fees_recorded: 80,
          net_delivery_position: 40,
          courier_fee_order_count: 1,
        }),
        products: [],
        landing_pages: [
          {
            path: "/step/katimon-mango",
            label: "/step/katimon-mango",
            intake_count: 1,
            order_value: 1000,
            approved_count: 1,
            cancelled_count: 0,
            returned_count: 0,
            pending_count: 0,
            order_kg: 0,
          },
          {
            path: null,
            label: "Other website",
            intake_count: 1,
            order_value: 400,
            approved_count: 0,
            cancelled_count: 1,
            returned_count: 0,
            pending_count: 0,
            order_kg: 0,
          },
        ],
      },
      {
        source: "manual_other",
        label: "Manual / Other",
        ...metrics({
          intake_count: 2,
          order_value: 1000,
          returned_count: 1,
          returned_value: 700,
          pending_count: 1,
          pending_value: 300,
          courier_fees_recorded: 50,
          net_delivery_position: -50,
          courier_fee_order_count: 2,
        }),
        products: [],
        landing_pages: [],
      },
    ],
    products: [],
    order_facts: [
      { source: "website", products: ["Ghee"], courier: "Steadfast", payment: "cod", outcome: "approved", held: false },
      { source: "website", products: ["Honey"], courier: null, payment: "cod", outcome: "cancelled", held: false },
      { source: "manual_other", products: ["Ghee"], courier: "Pathao", payment: "bkash", outcome: "returned", held: false },
      { source: "manual_other", products: ["Honey"], courier: null, payment: "cod", outcome: "pending", held: true },
    ],
    abandoned_facts: [
      { status: "confirmed", products: ["Ghee"] },
      { status: "dismissed", products: ["Honey"] },
      { status: "open", products: ["Honey"] },
    ],
    missing_weight_products: [],
    previous: null,
    hourly_profile: hourlyBuckets().map((bucket, hour) => ({ ...bucket, key: `hour-${hour}` })),
    ...overrides,
  };
}

function jsonResponse(body: BusinessReportResponse) {
  return { ok: true, json: async () => body } as unknown as Response;
}

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BusinessReport />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("BusinessReport", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-20T06:00:00.000Z"));
    apiFetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a centered loading state while the report is pending", () => {
    apiFetchMock.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText("Loading business report")).toBeInTheDocument();
  });

  it("loads today by default and renders operational totals", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/reports/business?from=2026-09-20&to=2026-09-20");
    });

    expect(await screen.findByRole("heading", { name: "Business Report" })).toBeInTheDocument();
    expect(screen.getByTestId("business-report-summary-intake")).toHaveTextContent("4");
    // Order value leaves out the ৳400 cancelled order.
    expect(screen.getByTestId("business-report-summary-order-value")).toHaveTextContent("৳2,000");
    expect(screen.getByTestId("business-report-summary-order-value")).toHaveTextContent("Excludes cancelled");
    expect(screen.getByTestId("business-report-summary-approved")).toHaveTextContent("1");
    expect(screen.getByTestId("business-report-summary-cancelled")).toHaveTextContent("1");
    expect(screen.getByText("Delivery charged")).toBeInTheDocument();
    expect(screen.getByText("Courier fees recorded")).toBeInTheDocument();
    expect(screen.getByText("Net delivery position")).toBeInTheDocument();
    expect(screen.getByText("Courier fee coverage: 3 of 4 orders")).toBeInTheDocument();
  });

  it("renders the intake rhythm with its peak hour and the outcome panels", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    const rhythm = await screen.findByRole("region", { name: "When orders arrive" });
    expect(within(rhythm).getByText("9a")).toBeInTheDocument(); // peak label
    expect(within(rhythm).getByRole("img", { name: /Orders by hour of day, peak 9a with 2 orders/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Where each channel's orders end up" })).toBeInTheDocument();
    const mix = screen.getByRole("region", { name: "Order value by channel" });
    expect(within(mix).getByText("Website")).toBeInTheDocument();
    expect(within(mix).getByText("৳1,400")).toBeInTheDocument();
    const gauge = screen.getByRole("region", { name: "Approval rate" });
    expect(within(gauge).getByText("25%", { selector: "p" })).toBeInTheDocument();
    expect(within(gauge).getByText("Needs attention")).toBeInTheDocument();
  });

  it("breaks approval down by outcome and shows per-order delivery figures with coverage", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse({
      summary: { ...reportResponse().summary, approved_count: 2, pending_count: 0, weight_order_count: 3 },
    })));

    renderPage();

    const gauge = await screen.findByRole("region", { name: "Approval rate" });
    const outcomes = within(gauge).getByRole("list", { name: "Order outcomes" });
    expect(within(outcomes).getAllByRole("listitem")).toHaveLength(4);
    expect(within(outcomes).getByText("Approved").closest("li")).toHaveTextContent("250%");
    expect(within(outcomes).getByText("Pending").closest("li")).toHaveTextContent("00%");
    expect(within(outcomes).getByText("RTO").closest("li")).toHaveTextContent("125%");

    const delivery = screen.getByRole("region", { name: "Charges vs courier fees" });
    expect(within(delivery).getByText("Net delivery position")).toBeInTheDocument();
    expect(within(delivery).getByText("−৳10")).toBeInTheDocument();
    const perOrder = within(delivery).getByRole("list", { name: "Per-order figures" });
    expect(within(perOrder).getByText("Avg charge per approved order").closest("li")).toHaveTextContent("৳60");
    expect(within(perOrder).getByText("Avg courier fee per recorded order").closest("li")).toHaveTextContent("৳43");
    expect(within(perOrder).getByText("Net per order").closest("li")).toHaveTextContent("−৳3");
    expect(within(delivery).getByText("Courier fee coverage: 3 of 4 orders")).toBeInTheDocument();
    expect(within(delivery).getByText("Weight recorded on 3 of 4 orders")).toBeInTheDocument();
  });

  it("hides Best day for a single-day range and shows it with the best day for a multi-day range", async () => {
    apiFetchMock.mockResolvedValueOnce(jsonResponse(reportResponse()));
    const first = renderPage();
    await screen.findByRole("region", { name: "When orders arrive" });
    expect(screen.queryByRole("region", { name: "Best day" })).not.toBeInTheDocument();
    first.unmount();

    const days = dailyBuckets().map((bucket, index) => ({ ...bucket, website_value: index === 6 ? 5000 : 0 }));
    apiFetchMock.mockResolvedValueOnce(jsonResponse(reportResponse({
      range: { from: "2026-09-14", to: "2026-09-20" },
      series: { granularity: "day", label: "Intake by day", buckets: days },
    })));
    renderPage();

    const best = await screen.findByRole("region", { name: "Best day" });
    expect(within(best).getByText("৳11,000")).toBeInTheDocument(); // Sep 20: (80 + 6*5) * 100
    expect(within(best).getByText(/Sep 20/)).toBeInTheDocument();
    expect(within(best).getByText(/45% website/)).toBeInTheDocument();
  });

  it("hides Best day for All time because the series only covers recent active days", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse({
      range: { from: null, to: null },
      series: { granularity: "day", label: "Recent intake activity", buckets: dailyBuckets() },
    })));

    renderPage();

    expect(await screen.findByRole("region", { name: "When orders arrive" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Best day" })).not.toBeInTheDocument();
  });

  it("lists overall product weight with approved kg and packs", async () => {
    const outcomeDefaults = { cancelled_packs: 0, cancelled_kg: 0, returned_packs: 0, returned_kg: 0, pending_packs: 0, pending_kg: 0 };
    const himsagar = { ...outcomeDefaults, product_id: "p-1", product_name: "Himsagar", packs: 4, kg: 25, approved_packs: 3, approved_kg: 20, cancelled_packs: 1, cancelled_kg: 5, order_count: 2 };
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse({ products: [himsagar], missing_weight_products: [{ id: "p-2", name: "Langra" }] })));

    renderPage();

    const overall = await screen.findByRole("region", { name: "Product weight" });
    expect(within(overall).getAllByText("Himsagar")).toHaveLength(2); // ring label + list row
    expect(within(within(overall).getByRole("list")).getByText("Himsagar")).toBeInTheDocument();
    expect(within(overall).getByText("20 kg approved of 25 kg ordered · 1 product")).toBeInTheDocument();
    const row = within(within(overall).getByRole("list", { name: "Weight by product" })).getByRole("listitem");
    expect(within(row).getByTestId("product-weight-approved")).toHaveTextContent(/^20 kg3 packs$/);
    const [orderedCell] = within(row).getAllByTestId(/^product-weight-(ordered|approved)$/);
    expect(orderedCell).toHaveAttribute("data-testid", "product-weight-ordered"); // Ordered sits left of Approved
    expect(within(row).getByTestId("product-weight-ordered")).toHaveTextContent(/^25 kg4 packs$/);
    expect(within(row).getByRole("img", { name: "Approved 80%, Pending 0%, Cancelled 20%, RTO 0%" })).toBeInTheDocument();
    expect(within(overall).getByText("Approved = confirmed, processing, shipped or delivered. Ordered = every order placed in this range, including pending, cancelled and returned.")).toBeInTheDocument();
    expect(screen.getByText(/1 product is missing a catalog weight: Langra/)).toBeInTheDocument();
  });

  it("shows previous-period changes on the summary tiles for a bounded range", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse({
      previous: {
        range: { from: "2026-09-19", to: "2026-09-19" },
        summary: metrics({ intake_count: 2, order_value: 1600, approved_count: 1, cancelled_count: 0 }),
      },
    })));

    renderPage();

    expect(await screen.findByTestId("business-report-summary-intake")).toHaveTextContent("+100% vs previous period");
    // order value without cancelled: ৳2,000 now vs ৳1,600 before
    expect(screen.getByTestId("business-report-summary-order-value")).toHaveTextContent("+25% vs previous period");
    // approved 1 of 4 = 25% now vs 1 of 2 = 50% before
    expect(screen.getByTestId("business-report-summary-approved")).toHaveTextContent("−25 pts");
    // cancelled 1 of 4 = 25% now vs 0% before
    expect(screen.getByTestId("business-report-summary-cancelled")).toHaveTextContent("+25 pts");
  });

  it("omits previous-period changes when the previous period had no orders", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse({
      previous: {
        range: { from: "2026-09-19", to: "2026-09-19" },
        summary: metrics({ intake_count: 0 }),
      },
    })));

    renderPage();

    expect(await screen.findByTestId("business-report-summary-intake")).not.toHaveTextContent("vs previous period");
    expect(screen.getByTestId("business-report-summary-approved")).not.toHaveTextContent("pts");
    expect(screen.getByTestId("business-report-summary-cancelled")).not.toHaveTextContent("pts");
  });

  it("omits previous-period changes when there is no previous period", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    expect(await screen.findByTestId("business-report-summary-intake")).not.toHaveTextContent("vs previous period");
  });

  it("shows kg totals in the summary", async () => {
    const base = reportResponse();
    apiFetchMock.mockResolvedValue(jsonResponse({
      ...base,
      summary: { ...base.summary, order_kg: 12.5, approved_kg: 5, cancelled_kg: 2.5, weight_order_count: 3 },
    }));

    renderPage();

    const weight = await screen.findByTestId("business-report-summary-weight");
    expect(weight).toHaveTextContent("12.5 kg");
    expect(weight).toHaveTextContent("Recorded on 3 of 4 orders");
    expect(screen.getByTestId("business-report-summary-approved")).toHaveTextContent("5 kg");
  });

  it("shows got, confirmed, hold and cancelled per source with RTO folded into cancelled", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    const table = await screen.findByRole("grid", { name: "Source performance" });
    const cells = (name: string) => within(within(table).getByRole("row", { name: new RegExp(`^${name}`) })).getAllByRole("gridcell").map((cell) => cell.textContent);
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Source", "Got", "Confirmed", "Hold", "Cancelled"]);
    expect(cells("Website")).toEqual(["2", "150%", "00%", "150%"]);
    expect(cells("Manual / Other")).toEqual(["2", "00%", "150%", "150%"]);
    expect(cells("All sources")).toEqual(["4", "125%", "125%", "250%"]);
  });

  it("switches to a product view and filters by product", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    await screen.findByRole("grid", { name: "Source performance" });
    await user.click(screen.getByRole("button", { name: "By product" }));
    const products = screen.getByRole("grid", { name: "Product performance" });
    expect(within(products).getByRole("row", { name: /^Ghee/ })).toBeInTheDocument();
    expect(within(products).getByRole("row", { name: /^Honey/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Product:/ }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /Honey/ }));
    await user.keyboard("{Escape}");

    const filtered = screen.getByRole("grid", { name: "Product performance" });
    expect(within(filtered).queryByRole("row", { name: /^Ghee/ })).not.toBeInTheDocument();
    const abandoned = screen.getByRole("grid", { name: "Abandoned orders" });
    expect(within(abandoned).getByRole("row", { name: /^Abandoned/ })).toHaveTextContent("2");

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(within(screen.getByRole("grid", { name: "Product performance" })).getByRole("row", { name: /^Ghee/ })).toBeInTheDocument();
  });

  it("counts abandoned checkouts by confirmed, dismissed and still open", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    const table = await screen.findByRole("grid", { name: "Abandoned orders" });
    const cells = (name: string) => within(within(table).getByRole("row", { name: new RegExp(`^${name}`) })).getAllByRole("gridcell").map((cell) => cell.textContent);
    expect(cells("Abandoned")).toEqual(["3", "100%"]);
    expect(cells("Confirmed")).toEqual(["1", "33%"]);
    expect(cells("Dismissed")).toEqual(["1", "33%"]);
    expect(cells("Still open")).toEqual(["1", "33%"]);
  });

  it("counts only sources and outcomes that carry order value in the outcome badge", async () => {
    const base = reportResponse();
    apiFetchMock.mockResolvedValueOnce(jsonResponse(base));
    const first = renderPage();
    const flow = await screen.findByRole("region", { name: "Where each channel's orders end up" });
    expect(within(flow).getByText("2 sources · 4 outcomes")).toBeInTheDocument();
    first.unmount();

    const empty = { ...base.sources[1], source: "facebook", label: "Facebook", ...metrics({}) };
    const approvedOnly = { ...base.sources[0], ...metrics({ intake_count: 1, order_value: 500, approved_count: 1, approved_value: 500 }) };
    apiFetchMock.mockResolvedValueOnce(jsonResponse({ ...base, sources: [approvedOnly, empty] }));
    renderPage();
    const single = await screen.findByRole("region", { name: "Where each channel's orders end up" });
    expect(within(single).getByText("1 source · 1 outcome")).toBeInTheDocument();
  });

  it("removes date parameters when the user chooses All Time", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    await screen.findByRole("heading", { name: "Business Report" });
    await user.click(screen.getByRole("button", { name: "All time" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenLastCalledWith("/api/reports/business");
    });
  });

  it("keeps controls available and explains when no regular orders exist in the selected range", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse({
      summary: metrics(),
      sources: [],
      series: { granularity: "hour", label: "Intake by hour", buckets: hourlyBuckets().map((bucket) => ({ ...bucket, intake_count: 0, order_value: 0 })) },
    })));

    renderPage();

    expect(await screen.findByRole("heading", { name: "Business Report" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All time" })).toBeInTheDocument();
    expect(screen.getByText("No regular orders were created in this range.")).toBeInTheDocument();
    expect(screen.queryByText("Delivery charged")).not.toBeInTheDocument();
    expect(screen.queryByTestId("business-report-source-website")).not.toBeInTheDocument();
  });

  it("offers a retry after a report request fails", async () => {
    const user = userEvent.setup();
    apiFetchMock
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce(jsonResponse(reportResponse()));

    renderPage();

    expect(await screen.findByText("Could not load business report")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Business Report" })).toBeInTheDocument();
  });
});
