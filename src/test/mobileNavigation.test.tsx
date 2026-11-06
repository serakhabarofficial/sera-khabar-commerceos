import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";

const state = vi.hoisted(() => ({ unread: 0, isAdmin: true }));
vi.mock("@/lib/teamChat", () => ({ useTeamChatUnread: () => ({ data: { unread: state.unread } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: state.isAdmin }) }));

function renderNavigation(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SidebarProvider>
        <MobileBottomNav />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => { state.unread = 0; state.isAdmin = true; });

describe("MobileBottomNav", () => {
  it("floats as a frosted pill on phones only", () => {
    renderNavigation();

    const navigation = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(navigation).toHaveClass("fixed", "inset-x-3", "md:hidden");
    expect(navigation.firstElementChild).toHaveClass("rounded-full", "backdrop-blur-2xl");
  });

  it("gives an admin the five destinations in order, with Inbox as the raised centre", () => {
    renderNavigation();

    const items = Array.from(screen.getByRole("navigation", { name: "Mobile navigation" }).querySelectorAll("a, button")).map((item) => item.getAttribute("aria-label") ?? item.textContent);
    expect(items).toEqual(["Home", "Orders", "Inbox", "Products", "More"]);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/orders");
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("href", "/team-inbox");
    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("href", "/products");
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("marks the current destination", () => {
    renderNavigation("/products");
    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");

    renderNavigation("/team-inbox");
    expect(screen.getAllByRole("link", { name: "Inbox" }).at(-1)).toHaveAttribute("aria-current", "page");
  });

  it("shows the unread count on Inbox, announced to screen readers, and caps it at 99+", () => {
    state.unread = 3;
    const { unmount } = renderNavigation();
    expect(screen.getByRole("link", { name: "Inbox, 3 unread" })).toHaveTextContent("3");
    unmount();

    state.unread = 240;
    renderNavigation();
    expect(screen.getByRole("link", { name: "Inbox, 240 unread" })).toHaveTextContent("99+");
  });

  it("draws Home with the supplied house-and-smile icon, solid with the smile cut out when current", () => {
    renderNavigation("/orders");
    const idle = screen.getByRole("link", { name: "Home" }).querySelector("svg");
    expect(idle).toHaveAttribute("viewBox", "0 0 24 24");
    expect(idle?.querySelectorAll("path")).toHaveLength(2);
    expect(idle?.querySelector("path")?.getAttribute("d")).toMatch(/^M9\.44661 15\.3975/);
    expect(idle?.querySelectorAll("path")[1].getAttribute("d")).toMatch(/^M12 1\.25C11\.2919/);

    renderNavigation("/");
    const current = screen.getAllByRole("link", { name: "Home" }).at(-1)!.querySelector("svg");
    expect(current?.querySelectorAll("path")).toHaveLength(1);
    expect(current?.querySelector("path")?.getAttribute("d")).toContain("M9.44661 15.3975");
  });

  it("gives a team member only Orders and Inbox: no Home, Products or More", () => {
    state.isAdmin = false;
    renderNavigation();

    const navigation = screen.getByRole("navigation", { name: "Mobile navigation" });
    const items = Array.from(navigation.querySelectorAll("a, button")).map((item) => item.getAttribute("aria-label") ?? item.textContent);
    expect(items).toEqual(["Orders", "Inbox"]);
    expect(screen.queryByRole("link", { name: "Home" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Products" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("href", "/team-inbox");
    expect(navigation.firstElementChild).toHaveClass("grid-cols-2");
  });

  it("shows no badge when nothing is unread", () => {
    renderNavigation();
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveTextContent("");
  });
});
