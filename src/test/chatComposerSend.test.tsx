import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatThread } from "@/components/arc/chat-thread/chat-thread";

// A microphone the composer can see, so the voice button is offered.
beforeEach(() => {
  vi.stubGlobal("MediaRecorder", class { static isTypeSupported = () => true; });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn() } });
});

const thread = (onSend = vi.fn(), props: { allowVoice?: boolean } = {}) => {
  render(<ChatThread currentUserId="me" participants={[{ id: "me", name: "Me" }]} messages={[]} onSend={onSend} {...props} />);
  return { onSend, box: screen.getByRole("textbox") as HTMLTextAreaElement, send: () => screen.getByRole("button", { name: "Send" }) };
};

describe("sending from the message box", () => {
  it("adds a new line on Enter, on every device, and never sends", async () => {
    const user = userEvent.setup();
    const { onSend, box } = thread();
    await user.type(box, "first line{Enter}second line");
    expect(box.value).toBe("first line\nsecond line");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("keeps Shift+Enter as a new line too", async () => {
    const user = userEvent.setup();
    const { onSend, box } = thread();
    await user.type(box, "a{Shift>}{Enter}{/Shift}b");
    expect(box.value).toBe("a\nb");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends only from the Send button, with every line intact", async () => {
    const user = userEvent.setup();
    const { onSend, box, send } = thread();
    await user.type(box, "Rahim{Enter}House 12, Mirpur{Enter}01712-345678");
    await user.click(send());
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ text: "Rahim\nHouse 12, Mirpur\n01712-345678" }));
    expect(box.value).toBe("");
  });

  it("always shows Send, dimmed and inert while there is nothing to send", () => {
    const { onSend, send } = thread();
    expect(send()).toHaveAttribute("aria-disabled", "true");
    expect(send()).not.toHaveAttribute("data-ready");
    fireEvent.click(send());
    expect(onSend).not.toHaveBeenCalled();
  });

  it("lights Send up as soon as there is text", async () => {
    const user = userEvent.setup();
    const { box, send } = thread();
    await user.type(box, "hi");
    expect(send()).toHaveAttribute("aria-disabled", "false");
    expect(send()).toHaveAttribute("data-ready");
  });

  it("keeps the microphone on the left, separate from Send, and only while the box is empty", async () => {
    const user = userEvent.setup();
    const { box, send } = thread(vi.fn(), { allowVoice: true });
    const mic = await screen.findByRole("button", { name: "Record a voice message" });
    expect(mic).not.toBe(send());
    expect(mic.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box.compareDocumentPosition(send()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.type(box, "x");
    expect(screen.queryByRole("button", { name: "Record a voice message" })).toBeNull();
    expect(send()).toBeInTheDocument();
  });
});
