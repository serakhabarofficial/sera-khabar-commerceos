import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

// Every open admin tab polls these, so their pace sets most of the database
// traffic. Background tabs stay quiet and refresh when they are opened again.
describe("dashboard polling pace", () => {
  it("checks for incoming calls every 10s, only in the visible tab", () => {
    const watcher = read("src/components/IncomingCallWatcher.tsx");
    expect(watcher).toContain("const POLL_MS = 10_000;");
    expect(watcher).toContain("refetchIntervalInBackground: false");
    expect(watcher).not.toContain("refetchIntervalInBackground: true");
  });

  it("refreshes team chat every 30s (list) and 5s (open thread) while visible", () => {
    const chat = read("src/lib/teamChat.ts");
    expect(chat).toMatch(/team-chat\/channels"\),\s*refetchInterval: 30_000,\s*refetchIntervalInBackground: false/);
    expect(chat).toMatch(/enabled: !!channelId,\s*refetchInterval: 5_000,\s*refetchIntervalInBackground: false/);
  });

  it("refreshes the social inbox every 10s (list) and 5s (open thread) while visible", () => {
    const inbox = read("src/pages/SocialInbox.tsx");
    expect(inbox).toContain("useVisibleInterval(() => void loadConversations(), 10_000);");
    expect(inbox).toContain("}, 5_000, Boolean(selectedId));");
  });

  it("refreshes P&L every 5 minutes, Home every minute, Returns every 2 minutes, website health every minute", () => {
    expect(read("src/pages/Dashboard.tsx")).toContain("useVisibleInterval(() => fetchAnalytics(dateRange, true), 5 * 60_000);");
    const home = read("src/pages/Home.tsx");
    expect(home).toContain("const REFRESH_MS = 60_000;");
    expect(home).toContain("refetchIntervalInBackground: false");
    expect(read("src/pages/Returns.tsx")).toMatch(/refetchInterval: 120_000,\s*refetchIntervalInBackground: false/);
    expect(read("src/pages/Analytics.tsx")).toContain("const WEBSITE_BEHAVIOR_REFETCH_MS = 60 * 1000;");
  });

  it("keeps new orders arriving every 60s", () => {
    expect(read("src/pages/Dashboard.tsx")).toContain("useVisibleInterval(() => fetchOrders(), 60000");
  });
});
