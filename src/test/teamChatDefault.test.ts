import { describe, expect, it } from "vitest";
import { defaultTeamConversation, type TeamChatChannel } from "@/lib/teamChat";

const convo = (id: string, kind: "channel" | "dm", last_at: string | null): TeamChatChannel =>
  ({ id, kind, name: kind === "channel" ? id : null, topic: null, other_user_id: kind === "dm" ? "u" : null, unread: 0, last_body: null, last_author: null, last_at });

describe("team inbox opening conversation", () => {
  it("opens the latest direct message, even when a channel is newer", () => {
    expect(defaultTeamConversation([
      convo("general", "channel", "2026-10-24T10:00:00Z"),
      convo("old-dm", "dm", "2026-10-23T09:00:00Z"),
      convo("new-dm", "dm", "2026-10-24T08:00:00Z"),
    ])).toBe("new-dm");
  });

  it("falls back to the latest conversation, then the first channel", () => {
    expect(defaultTeamConversation([convo("general", "channel", null), convo("dispatch", "channel", "2026-10-24T08:00:00Z"), convo("quiet-dm", "dm", null)])).toBe("dispatch");
    expect(defaultTeamConversation([convo("quiet-dm", "dm", null), convo("general", "channel", null)])).toBe("general");
    expect(defaultTeamConversation([])).toBeNull();
  });
});
