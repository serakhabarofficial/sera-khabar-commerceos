import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardCard, BoardList } from "@/lib/orderBoard";

const board = vi.hoisted(() => ({
  data: { lists: [] as BoardList[], cards: [] as BoardCard[] },
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  addCard: vi.fn(),
  updateCard: vi.fn(),
  removeCard: vi.fn(),
  addList: vi.fn(),
  updateList: vi.fn(),
  removeList: vi.fn(),
}));

vi.mock("@/hooks/useOrderBoard", () => ({ useOrderBoard: () => board }));
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn(async () => new Response(JSON.stringify({ updates: [] }))) }));

import { OrderBoard } from "@/components/orders/board/OrderBoard";

const order = (id: string, name: string) => ({
  id, order_number: id, customer_name: name, phone: "01711234567", address: "Mirpur", status: "pending",
  courier_status: null, price: 1250, items: [],
});
const card = (id: string, listId: string, name: string, note = ""): BoardCard => ({
  id, list_id: listId, order_id: `o-${id}`, note, remind_on: null, position: Number(id.slice(1)), updated_at: "2026-10-25T00:00:00Z", order: order(`o-${id}`, name),
});

function renderBoard() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <OrderBoard orders={[]} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Order Board split inbox", () => {
  beforeEach(() => {
    board.data = {
      lists: [
        { id: "l1", name: "ফোন ধরছে না", color: "rose", position: 0 },
        { id: "l2", name: "VIP customer", color: "violet", position: 1 },
      ],
      cards: [card("c1", "l1", "Rahim Uddin", "দুপুরে আবার কল"), card("c2", "l1", "Sumaiya Akter"), card("c3", "l2", "Farhana Rahman")],
    };
    board.addList.mockReset();
  });
  afterEach(cleanup);

  it("shows the lists, the first list's orders and the first order's detail together", () => {
    renderBoard();
    const rail = screen.getByRole("navigation", { name: "Board lists" });
    expect(within(rail).getByText("ফোন ধরছে না")).toBeInTheDocument();
    expect(within(rail).getByText("VIP customer")).toBeInTheDocument();
    expect(screen.getAllByText("Rahim Uddin").length).toBeGreaterThan(1);
    expect(screen.getByRole("heading", { name: "Rahim Uddin" })).toBeInTheDocument();
    expect(screen.queryByText("Farhana Rahman")).not.toBeInTheDocument();
  });

  it("switches list from the rail and opens an order from the middle column", async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.click(screen.getByRole("button", { name: /Sumaiya Akter/ }));
    expect(screen.getByRole("heading", { name: "Sumaiya Akter" })).toBeInTheDocument();

    await user.click(within(screen.getByRole("navigation", { name: "Board lists" })).getByText("VIP customer"));
    expect(screen.getByRole("heading", { name: "Farhana Rahman" })).toBeInTheDocument();
    expect(screen.queryByText("Sumaiya Akter")).not.toBeInTheDocument();
  });

  it("creates a list with the name and colour picked in the New list popover", async () => {
    const user = userEvent.setup();
    board.addList.mockResolvedValue({ id: "l3", name: "Gift wrap", color: "green", position: 2 });
    renderBoard();
    await user.click(screen.getByRole("button", { name: /New list/ }));
    const create = screen.getByRole("button", { name: "Create list" });
    expect(create).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "New list name" }), "Gift wrap");
    await user.click(screen.getByRole("radio", { name: "green" }));
    await user.click(create);
    expect(board.addList).toHaveBeenCalledWith("Gift wrap", "green");
  });
});
