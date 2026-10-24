import { describe, expect, it } from "vitest";
import { TEAM_CHAT_ATTACHMENTS_PER_MESSAGE, TEAM_CHAT_ATTACHMENT_MAX_BYTES, TEAM_CHAT_ATTACHMENT_NAME_MAX, cleanAttachmentName, extractOrderNumbers, normalizeChannelName, splitOrderMentions, teamChatAttachmentKind, teamChatBaseMime, teamChatDmKey } from "../../shared/teamChat.js";

describe("team chat order mentions", () => {
  it("finds order numbers written with or without the hash and dash", () => {
    expect(extractOrderNumbers("Push #SK-1042 and sk1043 first, then SK-1042 again")).toEqual(["SK-1042", "SK-1043"]);
  });

  it("ignores lookalikes inside other words and codes", () => {
    expect(extractOrderNumbers("TASK-1042 or SK-12 or SK-1042x or ASK-1050")).toEqual([]);
  });

  it("keeps at most ten orders per message", () => {
    const text = Array.from({ length: 12 }, (_, i) => `SK-${1000 + i}`).join(" ");
    expect(extractOrderNumbers(text)).toHaveLength(10);
  });

  it("splits text around mentions so they can render as cards", () => {
    expect(splitOrderMentions("Call #SK-1042 now")).toEqual([
      { type: "text", value: "Call " },
      { type: "order", value: "SK-1042", raw: "#SK-1042" },
      { type: "text", value: " now" },
    ]);
  });
});

describe("team chat channels", () => {
  it("turns a typed name into a channel name", () => {
    expect(normalizeChannelName("#Eid Stock!")).toBe("eid-stock");
    expect(normalizeChannelName("  --Dhaka__Riders--  ")).toBe("dhaka-riders");
    expect(normalizeChannelName("!!!")).toBeNull();
    expect(normalizeChannelName("a".repeat(60))).toHaveLength(40);
  });

  it("gives a pair of people one DM key in either order", () => {
    expect(teamChatDmKey("b", "a")).toBe(teamChatDmKey("a", "b"));
  });
});

describe("team chat attachments", () => {
  it("knows photos, documents and voice by their type", () => {
    expect(teamChatAttachmentKind("image/jpeg")).toBe("image");
    expect(teamChatAttachmentKind("application/pdf")).toBe("file");
    expect(teamChatAttachmentKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("file");
    expect(teamChatAttachmentKind("audio/webm;codecs=opus")).toBe("voice");
    expect(teamChatAttachmentKind("AUDIO/MP4")).toBe("voice");
  });

  it("turns away types a browser could run or not show", () => {
    expect(teamChatAttachmentKind("text/html")).toBeNull();
    expect(teamChatAttachmentKind("image/svg+xml")).toBeNull();
    expect(teamChatAttachmentKind("application/x-msdownload")).toBeNull();
    expect(teamChatAttachmentKind("")).toBeNull();
  });

  it("strips the codec from a recorder's type", () => {
    expect(teamChatBaseMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(teamChatBaseMime(" Image/PNG ")).toBe("image/png");
  });

  it("keeps file names readable and safe to show", () => {
    expect(cleanAttachmentName("../../invoice\u0000 Oct.pdf", "file")).toBe("invoice Oct.pdf");
    expect(cleanAttachmentName("   ", "image")).toBe("Photo");
    expect(cleanAttachmentName(undefined, "voice")).toBe("Voice message");
    expect(cleanAttachmentName(`${"a".repeat(300)}.pdf`, "file")).toHaveLength(TEAM_CHAT_ATTACHMENT_NAME_MAX);
  });

  it("allows at most ten files of twenty megabytes", () => {
    expect(TEAM_CHAT_ATTACHMENTS_PER_MESSAGE).toBe(10);
    expect(TEAM_CHAT_ATTACHMENT_MAX_BYTES).toBe(20 * 1024 * 1024);
  });
});
