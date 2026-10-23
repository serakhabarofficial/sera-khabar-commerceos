import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export { TEAM_CHAT_MESSAGE_MAX, TEAM_CHAT_REACTIONS, extractOrderNumbers, splitOrderMentions } from "../../shared/teamChat.js";

export type TeamChatChannel = {
  id: string;
  kind: "channel" | "dm";
  name: string | null;
  topic: string | null;
  other_user_id: string | null;
  unread: number;
  last_body: string | null;
  last_author: string | null;
  last_at: string | null;
};

export type TeamChatStaff = { user_id: string; display_name: string; online: boolean };

export type TeamChatChannels = {
  viewer_id: string;
  can_create_channels: boolean;
  staff: TeamChatStaff[];
  channels: TeamChatChannel[];
};

export type TeamChatOrder = {
  id: string;
  order_number: string;
  customer_name: string | null;
  price: number | null;
  status: string;
  courier_name: string | null;
};

export type TeamChatMessage = {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  order_numbers: string[];
  created_at: string;
  reactions: { emoji: string; count: number; mine: boolean }[];
};

export type TeamChatThread = {
  viewer_id: string;
  channel: { id: string; kind: "channel" | "dm"; name: string | null; topic: string | null };
  members: string[] | null;
  messages: TeamChatMessage[];
  read_by: Record<string, string>;
  typing: string[];
  orders: Record<string, TeamChatOrder>;
};

export const TEAM_CHAT_CHANNELS_KEY = ["/api/team-chat/channels"] as const;
export const TEAM_CHAT_UNREAD_KEY = ["/api/team-chat/unread"] as const;
export const teamChatThreadKey = (channelId: string) => ["/api/team-chat/channels", channelId, "messages"] as const;

async function getJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || "Something went wrong"), { status: response.status });
  return body as T;
}

export async function postTeamChat<T = unknown>(path: string, body: unknown): Promise<T> {
  const response = await apiFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "Something went wrong");
  return json as T;
}

// The inbox polls while the tab is visible: the open thread every few
// seconds, the conversation list a little slower.
export function useTeamChatChannels() {
  return useQuery({
    queryKey: TEAM_CHAT_CHANNELS_KEY,
    queryFn: () => getJson<TeamChatChannels>("/api/team-chat/channels"),
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
  });
}

export const getTeamChatThread = (channelId: string) => getJson<TeamChatThread>(`/api/team-chat/channels/${channelId}/messages`);

export function useTeamChatThread(channelId: string | null) {
  return useQuery({
    queryKey: teamChatThreadKey(channelId ?? ""),
    queryFn: () => getTeamChatThread(channelId!),
    enabled: !!channelId,
    refetchInterval: 2_500,
    refetchIntervalInBackground: false,
  });
}

// Sidebar badge.
export function useTeamChatUnread() {
  return useQuery({
    queryKey: TEAM_CHAT_UNREAD_KEY,
    queryFn: () => getJson<{ unread: number }>("/api/team-chat/unread"),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function channelTitle(channel: Pick<TeamChatChannel, "kind" | "name" | "other_user_id">, staff: TeamChatStaff[]) {
  if (channel.kind === "channel") return `# ${channel.name}`;
  return staff.find((member) => member.user_id === channel.other_user_id)?.display_name || "Former teammate";
}

// Status words vary by source; the tone only needs the broad stage.
export function teamOrderStatusTone(status: string) {
  const value = status.toLowerCase();
  if (/(cancel|return|refus|fail|reject)/.test(value)) return "bg-[#FDECEC] text-[#a12c2c]";
  if (/(deliver|complete|paid)/.test(value)) return "bg-[#E3F4EA] text-[#1d6b3e]";
  if (/(ship|transit|courier|dispatch|pick|print|approv|confirm)/.test(value)) return "bg-[#E6F0FF] text-[#1f4fa8]";
  return "bg-[#FFF4DB] text-[#8a5a00]";
}

// The conversation the inbox opens with: the latest direct message, else the
// latest conversation of any kind, else the first channel.
export function defaultTeamConversation(channels: TeamChatChannel[]): string | null {
  const latest = (items: TeamChatChannel[]) => items.filter((item) => item.last_at)
    .sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)))[0];
  return (latest(channels.filter((item) => item.kind === "dm")) ?? latest(channels)
    ?? channels.find((item) => item.kind === "channel") ?? channels[0])?.id ?? null;
}
