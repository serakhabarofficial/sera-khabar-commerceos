import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import TeamInbox from "@/pages/TeamInbox";

const state = vi.hoisted(() => ({ ready: false, removed: false, incoming: false, post: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/teamChat", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/teamChat")>(),
  useTeamChatChannels: () => ({ data: {
    viewer_id: "me", can_create_channels: false, staff: [],
    channels: (state.removed ? ["dispatch"] : ["general", "dispatch"]).map((id) => ({ id, kind: "channel", name: id, unread: 0 })),
  } }),
  useTeamChatThread: (id: string) => ({ data: state.ready ? {
    channel: { id, kind: "channel", name: id }, messages: state.incoming ? [{ id: "incoming", author_id: "other", body: "Hi", order_numbers: [], created_at: "2026-10-24T00:00:00Z", reactions: [] }] : [], orders: {}, typing: [], read_by: {},
  } : undefined }),
  getTeamChatThread: vi.fn(),
  postTeamChat: state.post,
}));
vi.mock("@/components/arc/chat-thread/chat-thread", () => ({ ChatThread: ({ label }: { label: string }) => <div role="log" aria-label={label} /> }));
vi.mock("@/components/team-inbox/TeamOrderPanel", () => ({ TeamOrderPanel: () => null }));
vi.mock("@/components/team-inbox/TeamChannelMembers", () => ({ TeamChannelMembers: () => null }));
vi.mock("@/components/team-inbox/TeamNewChannelDialog", () => ({ TeamNewChannelDialog: () => null }));
vi.mock("@/components/team-inbox/TeamOrderMention", () => ({ useOrderMention: () => ({}) }));

describe("team inbox transitions", () => {
  it("shows ready conversations immediately without bringing a loading skeleton back on cached returns", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const page = <QueryClientProvider client={client}><MemoryRouter><TeamInbox /></MemoryRouter></QueryClientProvider>;
    state.ready = false;
    state.removed = false;
    const { container, rerender } = render(page);
    expect(screen.queryByRole("log")).toBeNull();

    state.ready = true;
    rerender(<QueryClientProvider client={client}><MemoryRouter><TeamInbox /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByTestId("team-inbox")).toHaveClass("h-[calc(100dvh-3.5rem-2px)]", "overflow-hidden");
    expect(screen.getByRole("log", { name: "# general" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /dispatch/ }));
    expect(screen.getByRole("log", { name: "# dispatch" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /general/ }));
    expect(screen.getByRole("log", { name: "# general" })).toBeVisible();
    expect(container.querySelector(".team-skeleton")).toBeNull();
    expect(container.querySelector(".team-thread-in")).toBeNull();
    client.clear();
  });

  it("falls back to an accessible conversation when the opening channel is removed", () => {
    const client = new QueryClient();
    const page = () => <QueryClientProvider client={client}><MemoryRouter><TeamInbox /></MemoryRouter></QueryClientProvider>;
    state.ready = true;
    state.removed = false;
    const { rerender } = render(page());
    expect(screen.getByRole("log", { name: "# general" })).toBeVisible();
    state.removed = true;
    rerender(page());
    expect(screen.getByRole("log", { name: "# dispatch" })).toBeVisible();
    expect(screen.queryByRole("log", { name: "# general" })).toBeNull();
    client.clear();
  });

  it("does not mark messages read while the thread is hidden behind the mobile conversation list", () => {
    state.ready = true;
    state.removed = false;
    state.incoming = true;
    state.post.mockClear();
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><MemoryRouter><TeamInbox /></MemoryRouter></QueryClientProvider>);
    // jsdom has no layout: the hidden section has no rendered rectangles, like display:none on mobile.
    expect(state.post).not.toHaveBeenCalled();
    state.incoming = false;
    client.clear();
  });
});

describe("team inbox on a phone", () => {
  const open = (entry: string) => render(
    <QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[entry]}><TeamInbox /></MemoryRouter></QueryClientProvider>,
  );

  it("takes the whole screen once a conversation is open, so no tab bar can cover the message box", () => {
    state.ready = true;
    state.removed = false;
    state.incoming = false;
    open("/team-inbox?c=general");
    expect(screen.getByRole("log", { name: "# general" }).closest("section")).toHaveClass("max-md:fixed", "max-md:inset-x-0", "max-md:z-50");
  });

  it("keeps the conversation list in the normal page flow", () => {
    state.ready = true;
    state.removed = false;
    state.incoming = false;
    open("/team-inbox");
    expect(screen.getByRole("log", { name: "# general" }).closest("section")).not.toHaveClass("max-md:fixed");
  });
});
