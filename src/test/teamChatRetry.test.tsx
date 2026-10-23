import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ChatThread } from "@/components/arc/chat-thread/chat-thread";

it("offers retry for every failed outgoing message, including earlier sends", () => {
  const retry = vi.fn();
  render(<ChatThread currentUserId="me" participants={[{ id: "me", name: "Me" }]} messages={[
    { id: "first", authorId: "me", text: "SK-1042", createdAt: "2026-10-24T00:00:00Z", status: "failed" },
    { id: "second", authorId: "me", text: "Please check", createdAt: "2026-10-24T00:01:00Z", status: "failed" },
  ]} onRetry={retry} />);
  const buttons = screen.getAllByRole("button", { name: "Retry" });
  expect(buttons).toHaveLength(2);
  fireEvent.click(buttons[0]);
  expect(retry).toHaveBeenCalledWith("first");
});
