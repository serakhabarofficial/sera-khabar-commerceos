import { afterEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

import { stableAttachmentUrl, teamChatFileProblem, teamChatFileType, uploadTeamChatFile, type TeamChatAttachment } from "@/lib/teamChat";

const attachment = (url: string, expiresAt: string): TeamChatAttachment => ({
  id: "a1", kind: "image", name: "Photo", mime_type: "image/png", size: 10, width: null, height: null, duration_ms: null, url, url_expires_at: expiresAt,
});

afterEach(() => { vi.unstubAllGlobals(); apiFetch.mockReset(); });

describe("team chat files", () => {
  it("reads a file's type from its name when the browser leaves it blank", () => {
    expect(teamChatFileType(new File(["x"], "stock.CSV", { type: "" }))).toBe("text/csv");
    expect(teamChatFileType(new File(["x"], "invoice.pdf", { type: "application/pdf" }))).toBe("application/pdf");
    expect(teamChatFileType(new File(["x"], "notes", { type: "" }))).toBe("");
  });

  it("says why a file cannot be sent", () => {
    expect(teamChatFileProblem(new File(["x"], "page.html", { type: "text/html" }))).toMatch(/page\.html/);
    expect(teamChatFileProblem(new File([new Uint8Array(21 * 1024 * 1024)], "big.pdf", { type: "application/pdf" }))).toMatch(/20 MB/);
    expect(teamChatFileProblem(new File([], "empty.pdf", { type: "application/pdf" }))).toMatch(/empty/);
    expect(teamChatFileProblem(new File(["x"], "ok.png", { type: "image/png" }))).toBeNull();
  });

  it("keeps the first link for an attachment until it nears expiry, so images do not reload", () => {
    const cache = new Map();
    const now = Date.parse("2026-10-24T10:00:00Z");
    expect(stableAttachmentUrl(cache, attachment("https://s/1", "2026-10-24T16:00:00Z"), now)).toBe("https://s/1");
    expect(stableAttachmentUrl(cache, attachment("https://s/2", "2026-10-24T16:00:05Z"), now + 1000)).toBe("https://s/1");
    // Within half an hour of expiry the newer link takes over.
    expect(stableAttachmentUrl(cache, attachment("https://s/3", "2026-10-24T22:00:00Z"), Date.parse("2026-10-24T15:45:00Z"))).toBe("https://s/3");
  });

  it("shows a photo again after leaving the inbox when the next payload has no link yet", () => {
    const now = Date.parse("2026-10-24T10:00:00Z");
    const photo = attachment("https://s/kept", "2026-10-24T16:00:00Z");
    photo.id = "photo-kept";
    stableAttachmentUrl(new Map(), photo, now);
    const again = { ...photo, url: "" };
    expect(stableAttachmentUrl(new Map(), again, now + 1000)).toBe("https://s/kept");
  });

  it("uploads straight to storage with the link the server issued, under the stored type", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ path: "org/ch/me/f.csv", upload_url: "https://storage.test/upload?token=t", content_type: "text/csv" }), { status: 201 }));
    const put = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", put);
    const file = new File(["a,b"], "stock.csv", { type: "" });
    const uploaded = await uploadTeamChatFile("ch", file, { durationMs: 1200 });
    expect(apiFetch).toHaveBeenCalledWith("/api/team-chat/channels/ch/uploads", expect.objectContaining({ method: "POST", body: JSON.stringify({ type: "text/csv", size: 3 }) }));
    expect(put).toHaveBeenCalledWith("https://storage.test/upload?token=t", expect.objectContaining({ method: "PUT" }));
    const sent = (put.mock.calls[0][1] as RequestInit).body as FormData;
    expect((sent.get("file") as File).type).toBe("text/csv");
    expect(uploaded).toEqual({ path: "org/ch/me/f.csv", name: "stock.csv", width: null, height: null, duration_ms: 1200 });
  });

  it("reports a failed upload", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ path: "p", upload_url: "https://storage.test/u", content_type: "image/png" }), { status: 201 }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 413 })));
    await expect(uploadTeamChatFile("ch", new File(["x"], "a.png", { type: "image/png" }))).rejects.toThrow(/upload/i);
  });
});
