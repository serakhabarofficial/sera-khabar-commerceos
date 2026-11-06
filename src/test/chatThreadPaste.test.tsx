import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChatThread } from "@/components/arc/chat-thread/chat-thread";

const readText = vi.fn();
const withClipboard = () => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText } });
afterEach(() => { readText.mockReset(); Reflect.deleteProperty(navigator, "clipboard"); });

const thread = (props: { allowClipboardPaste?: boolean } = {}, onSend = vi.fn()) => {
  render(<ChatThread currentUserId="me" participants={[{ id: "me", name: "Me" }]} messages={[]} onSend={onSend} {...props} />);
  return { onSend, box: screen.getByRole("textbox") as HTMLTextAreaElement };
};

it("pastes the clipboard's text into the message box with one tap, ready to send", async () => {
  withClipboard();
  readText.mockResolvedValue("[6/11, 9:10 pm] Rahim: ২ কেজি গুড়\r\n01712-345678");
  const { onSend, box } = thread({ allowClipboardPaste: true });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Paste from clipboard" })); });
  expect(box.value).toBe("[6/11, 9:10 pm] Rahim: ২ কেজি গুড়\n01712-345678");
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ text: "[6/11, 9:10 pm] Rahim: ২ কেজি গুড়\n01712-345678" }));
});

it("adds a second paste under the first so several customers' messages can go out together", async () => {
  withClipboard();
  readText.mockResolvedValueOnce("first customer").mockResolvedValueOnce("second customer");
  const { box } = thread({ allowClipboardPaste: true });
  const paste = screen.getByRole("button", { name: "Paste from clipboard" });
  await act(async () => { fireEvent.click(paste); });
  await act(async () => { fireEvent.click(paste); });
  expect(box.value).toBe("first customer\nsecond customer");
});

it("leaves the box alone and focused when the browser refuses to share the clipboard", async () => {
  withClipboard();
  readText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
  const { box } = thread({ allowClipboardPaste: true });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Paste from clipboard" })); });
  expect(box.value).toBe("");
  expect(box).toHaveFocus();
});

it("shows no paste button unless asked for, or where the browser cannot read the clipboard", () => {
  withClipboard();
  thread();
  expect(screen.queryByRole("button", { name: "Paste from clipboard" })).toBeNull();
});

it("hides the paste button when the browser has no clipboard reading", () => {
  thread({ allowClipboardPaste: true });
  expect(screen.queryByRole("button", { name: "Paste from clipboard" })).toBeNull();
});
