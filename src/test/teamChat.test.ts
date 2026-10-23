import { describe, expect, it } from "vitest";
import { extractOrderNumbers, normalizeChannelName, splitOrderMentions, teamChatDmKey } from "../../shared/teamChat.js";

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
