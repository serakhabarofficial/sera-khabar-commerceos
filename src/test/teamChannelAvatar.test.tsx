import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TeamChannelAvatar } from "@/components/team-inbox/TeamChannelAvatar";
import { channelMembersLine, isTeamChatThreadOpen } from "@/lib/teamChat";

const staff = ["Anika Rahman", "Tanvir Hasan", "Mim Akter", "Rafi", "Nusrat"].map((display_name, i) => ({ user_id: `u${i}`, display_name, online: false }));

describe("channelMembersLine", () => {
  it("names the other people by first name and counts the rest", () => {
    expect(channelMembersLine(["u0", "u1"], staff, "u0")).toBe("Tanvir");
    expect(channelMembersLine(["u0", "u1", "u2"], staff, "u9")).toBe("Anika, Tanvir, Mim");
    expect(channelMembersLine(["u0", "u1", "u2", "u3", "u4"], staff, "u4")).toBe("Anika, Tanvir, Mim +1");
  });
  it("says Only you when nobody else is in, and nothing until members are known", () => {
    expect(channelMembersLine(["u0"], staff, "u0")).toBe("Only you");
    expect(channelMembersLine(null, staff, "u0")).toBeNull();
    expect(channelMembersLine(undefined, staff, "u0")).toBeNull();
  });
  it("skips people who left the team", () => {
    expect(channelMembersLine(["u0", "gone"], staff, "u0")).toBe("Only you");
  });
});

describe("TeamChannelAvatar", () => {
  const faces = (container: HTMLElement) => [...container.querySelectorAll("span > span")].map((face) => face.textContent);

  it("draws two overlapping faces from the other members, the last speaker first", () => {
    const { container } = render(<TeamChannelAvatar members={["u0", "u1", "u2", "u3"]} staff={staff} viewerId="u0" lastAuthor="u3" size={48} />);
    expect(faces(container)).toEqual(["R", "M"]);
  });
  it("shows a single face when only one other person is in", () => {
    const { container } = render(<TeamChannelAvatar members={["u0", "u1"]} staff={staff} viewerId="u0" size={48} />);
    expect(faces(container)).toEqual(["T"]);
  });
  it("falls back to a # until members are known", () => {
    const { container } = render(<TeamChannelAvatar members={undefined} staff={staff} viewerId="u0" size={48} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(faces(container)).toEqual([]);
  });
});

describe("isTeamChatThreadOpen", () => {
  it("is true only for an open Team Inbox conversation", () => {
    expect(isTeamChatThreadOpen("/team-inbox", "?c=abc")).toBe(true);
    expect(isTeamChatThreadOpen("/team-inbox", "")).toBe(false);
    expect(isTeamChatThreadOpen("/orders", "?c=abc")).toBe(false);
  });
});
