import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChatThread } from "@/components/arc/chat-thread/chat-thread";

// A microphone and recorder that hand back one chunk of sound when stopped.
class FakeRecorder {
  static isTypeSupported = (type: string) => type === "audio/mp4";
  state = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: unknown, options?: { mimeType?: string }) { this.mimeType = options?.mimeType ?? ""; }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["sound"], { type: this.mimeType }) }); this.onstop?.(); }
}
const stopTrack = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); stopTrack.mockReset(); });

const thread = (onSend = vi.fn(), onVoiceError = vi.fn()) => {
  render(<ChatThread currentUserId="me" participants={[{ id: "me", name: "Me" }]} messages={[]} onSend={onSend} allowVoice onVoiceError={onVoiceError} />);
  return { onSend, onVoiceError };
};

it("records a voice message from the microphone button and sends it with its length", async () => {
  const { onSend } = thread();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Record a voice message" })); });
  expect(screen.getByRole("timer")).toHaveTextContent("0:00");
  act(() => { vi.advanceTimersByTime(4200); });
  expect(screen.getByRole("timer")).toHaveTextContent("0:04");
  fireEvent.click(screen.getByRole("button", { name: "Send voice message" }));
  expect(onSend).toHaveBeenCalledTimes(1);
  const { voice, text, files } = onSend.mock.calls[0][0];
  expect({ text, files }).toEqual({ text: "", files: [] });
  expect(voice.file).toMatchObject({ name: "Voice message.m4a", type: "audio/mp4" });
  expect(voice.durationMs).toBeGreaterThanOrEqual(4200);
  expect(stopTrack).toHaveBeenCalled();
});

it("throws a cancelled recording away and frees the microphone", async () => {
  const { onSend } = thread();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Record a voice message" })); });
  act(() => { vi.advanceTimersByTime(3000); });
  fireEvent.click(screen.getByRole("button", { name: "Cancel recording" }));
  expect(onSend).not.toHaveBeenCalled();
  expect(stopTrack).toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Record a voice message" })).toBeInTheDocument();
});

it("turns the microphone back into send once something is typed", () => {
  thread();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "hi" } });
  expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Record a voice message" })).toBeNull();
});

it("reports a refused microphone instead of recording", async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new DOMException("denied", "NotAllowedError"));
  const { onVoiceError } = thread();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Record a voice message" })); });
  expect(onVoiceError).toHaveBeenCalledWith(expect.objectContaining({ name: "NotAllowedError" }));
  expect(screen.queryByRole("timer")).toBeNull();
});

it("keeps the voice bar moving forward when the file clock snaps back", () => {
  render(<ChatThread currentUserId="me" participants={[{ id: "me", name: "Me" }, { id: "rafi", name: "Rafi" }]} composer={false} messages={[
    { id: "m1", authorId: "rafi", createdAt: "2026-10-24T00:00:00Z", attachments: [{ id: "a1", kind: "audio", name: "Voice message", url: "blob:voice", duration: 8_000 }] },
  ]} />);
  const audio = document.querySelector("audio") as HTMLAudioElement;
  let mediaTime = 0.4;
  let paused = true;
  let now = 0;
  const frames: FrameRequestCallback[] = [];
  Object.defineProperty(audio, "currentTime", { configurable: true, get: () => mediaTime, set: (value: number) => { mediaTime = value; } });
  Object.defineProperty(audio, "paused", { configurable: true, get: () => paused });
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(audio, "pause").mockImplementation(() => { paused = true; audio.dispatchEvent(new Event("pause")); });
  vi.spyOn(audio, "play").mockImplementation(() => { paused = false; audio.dispatchEvent(new Event("play")); return Promise.resolve(); });
  const flush = () => { const pending = frames.splice(0, frames.length); pending.forEach((callback) => callback(now)); };
  fireEvent.click(screen.getByRole("button", { name: "Play" }));
  act(() => { now = 200; flush(); });
  const fill = () => Number(/scaleX\(([\d.]+)\)/.exec(screen.getByRole("slider", { name: "Voice message" }).querySelector("span")?.getAttribute("style") ?? "")?.[1] ?? 0);
  const started = fill();
  expect(started).toBeGreaterThan(0);
  mediaTime = 0;
  act(() => { audio.dispatchEvent(new Event("pause")); });
  act(() => { audio.dispatchEvent(new Event("play")); });
  act(() => { now = 300; flush(); });
  expect(fill()).toBeGreaterThan(started);
});

it("plays a voice message with its recorded length", () => {
  render(<ChatThread currentUserId="me" participants={[{ id: "me", name: "Me" }, { id: "rafi", name: "Rafi" }]} composer={false} messages={[
    { id: "m1", authorId: "rafi", createdAt: "2026-10-24T00:00:00Z", attachments: [{ id: "a1", kind: "audio", name: "Voice message", url: "blob:voice", duration: 65_000 }] },
  ]} />);
  expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  expect(screen.getByText("1:05")).toBeInTheDocument();
  expect(screen.getByRole("slider", { name: "Voice message" })).toHaveAttribute("aria-valuemax", "65");
});
