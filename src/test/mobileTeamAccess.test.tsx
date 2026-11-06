import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileTeamGate } from "@/components/MobileTeamGate";
import { isHiddenFromTeamOnPhone } from "@/lib/mobileAccess";

const state = vi.hoisted(() => ({ role: "team_member" as "admin" | "team_member" | null, loading: false }));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ role: state.role, isAdmin: state.role === "admin", isTeamMember: state.role === "team_member", loading: state.loading }),
}));

const phone = (matches: boolean) => vi.stubGlobal("matchMedia", (query: string) => ({
  matches, media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
}));

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

const open = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Where />
    <Routes>
      <Route path="*" element={<MobileTeamGate><p>page body</p></MobileTeamGate>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => { state.role = "team_member"; state.loading = false; phone(true); });
afterEach(() => vi.unstubAllGlobals());

describe("isHiddenFromTeamOnPhone", () => {
  it("covers Home and every Products page, and nothing else", () => {
    for (const path of ["/", "/products", "/products/new", "/products/abc/edit"]) expect(isHiddenFromTeamOnPhone(path)).toBe(true);
    for (const path of ["/orders", "/orders/new", "/team-inbox", "/customers", "/productsx", "/settings"]) expect(isHiddenFromTeamOnPhone(path)).toBe(false);
  });
});

describe("MobileTeamGate", () => {
  it("sends a team member on a phone from Home and Products to Orders", () => {
    open("/");
    expect(screen.getByTestId("where")).toHaveTextContent("/orders");
    expect(screen.getByText("page body")).toBeInTheDocument();
  });

  it("covers Products' own pages too", () => {
    open("/products/123/edit");
    expect(screen.getByTestId("where")).toHaveTextContent("/orders");
  });

  it("lets a team member on a phone use Orders and Team Inbox", () => {
    open("/team-inbox");
    expect(screen.getByTestId("where")).toHaveTextContent("/team-inbox");
    expect(screen.getByText("page body")).toBeInTheDocument();
  });

  it("gives an admin every page on a phone", () => {
    state.role = "admin";
    open("/products");
    expect(screen.getByTestId("where")).toHaveTextContent("/products");
    expect(screen.getByText("page body")).toBeInTheDocument();
  });

  it("leaves a team member's desktop alone", () => {
    phone(false);
    open("/");
    expect(screen.getByTestId("where")).toHaveTextContent("/");
    expect(screen.getByText("page body")).toBeInTheDocument();
  });

  it("holds the page back while the role is still loading, instead of flashing it", () => {
    state.role = null;
    state.loading = true;
    open("/");
    expect(screen.queryByText("page body")).toBeNull();
    expect(screen.getByTestId("where")).toHaveTextContent("/");
  });
});
