import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { TEAM_CHAT_ATTACHMENT_MAX_BYTES, TEAM_CHAT_ATTACHMENT_TYPES, teamChatAttachmentKind, teamChatBaseMime } from "../../shared/teamChat.js";

export { TEAM_CHAT_ATTACHMENTS_PER_MESSAGE, TEAM_CHAT_MESSAGE_MAX, TEAM_CHAT_REACTIONS, TEAM_CHAT_VOICE_MAX_MS, extractOrderNumbers, splitOrderMentions } from "../../shared/teamChat.js";

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

export type TeamChatAttachment = {
  id: string;
  kind: "image" | "file" | "voice";
  name: string;
  mime_type: string;
  size: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  /** Signed link, or null when it could not be signed this time. */
  url: string | null;
  url_expires_at: string | null;
};

export type TeamChatMessage = {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  order_numbers: string[];
  created_at: string;
  reactions: { emoji: string; count: number; mine: boolean }[];
  attachments: TeamChatAttachment[];
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

// The inbox polls while the tab is visible: the open thread every 5s, the
// conversation list every 30s.
export function useTeamChatChannels() {
  return useQuery({
    queryKey: TEAM_CHAT_CHANNELS_KEY,
    queryFn: () => getJson<TeamChatChannels>("/api/team-chat/channels"),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export const getTeamChatThread = (channelId: string) => getJson<TeamChatThread>(`/api/team-chat/channels/${channelId}/messages`);

export function useTeamChatThread(channelId: string | null) {
  return useQuery({
    queryKey: teamChatThreadKey(channelId ?? ""),
    queryFn: () => getTeamChatThread(channelId!),
    enabled: !!channelId,
    refetchInterval: 5_000,
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

// Photos, documents and voice messages.

const TYPES = TEAM_CHAT_ATTACHMENT_TYPES as Record<string, [string, string]>;
const TYPE_BY_EXTENSION: Record<string, string> = Object.fromEntries(Object.entries(TYPES).map(([type, [, extension]]) => [extension, type]));
Object.assign(TYPE_BY_EXTENSION, { jpeg: "image/jpeg", mp4: "audio/mp4" });

/** What the paperclip offers. Voice messages are recorded, not picked. */
export const TEAM_CHAT_ACCEPT = Object.entries(TYPES).filter(([, [kind]]) => kind !== "voice")
  .flatMap(([type, [, extension]]) => [type, `.${extension}`]).join(",");

/** The file's type, read from its name when the browser leaves it blank (common for CSV and Office files). */
export function teamChatFileType(file: File) {
  const type = teamChatBaseMime(file.type);
  if (type) return type;
  return TYPE_BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "";
}

/** Why this file cannot be sent, or null when it can. */
export function teamChatFileProblem(file: File) {
  if (!teamChatAttachmentKind(teamChatFileType(file))) return `${file.name} can't be sent. Send photos, PDFs, Word, Excel or text files.`;
  if (!file.size) return `${file.name} is empty`;
  if (file.size > TEAM_CHAT_ATTACHMENT_MAX_BYTES) return `${file.name} is over 20 MB`;
  return null;
}

export type TeamChatUploaded = { path: string; name: string; width: number | null; height: number | null; duration_ms: number | null };

async function imageSize(file: File) {
  if (!file.type.startsWith("image/") || typeof createImageBitmap === "undefined") return { width: null, height: null };
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: null, height: null };
  }
}

/** Uploads one file straight to storage with a one-time link from the server, ready to attach to a message. */
export async function uploadTeamChatFile(channelId: string, file: File, extra: { durationMs?: number } = {}): Promise<TeamChatUploaded> {
  const type = teamChatFileType(file);
  const [link, size] = await Promise.all([
    postTeamChat<{ path: string; upload_url: string; content_type: string }>(`/api/team-chat/channels/${channelId}/uploads`, { type, size: file.size }),
    imageSize(file),
  ]);
  // The link carries its own one-time token; storage is not our API, so no session goes with it.
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("file", new Blob([file], { type: link.content_type }), file.name);
  const response = await fetch(link.upload_url, { method: "PUT", body, headers: { "x-upsert": "false" } });
  if (!response.ok) throw new Error(`${file.name} did not upload. Try again.`);
  return { path: link.path, name: file.name, ...size, duration_ms: extra.durationMs ?? null };
}

// Survives leaving Team Inbox, so a photo or PDF opened again does not wait on
// a new link and does not disappear when a poll arrives without one.
const rememberedAttachmentUrls = new Map<string, { url: string; expiresAt: number }>();

/**
 * The link to show for an attachment. The first link seen is kept until half
 * an hour before it expires, so a poll that brings a freshly signed link does
 * not make the image or recording load again.
 */
export function stableAttachmentUrl(cache: Map<string, { url: string; expiresAt: number }>, attachment: TeamChatAttachment, now = Date.now()) {
  const remembered = rememberedAttachmentUrls.get(attachment.id);
  const kept = cache.get(attachment.id) ?? remembered;
  if (kept && kept.expiresAt - now > 30 * 60_000) {
    cache.set(attachment.id, kept);
    return kept.url;
  }
  if (!attachment.url) return kept?.url;
  const parsed = attachment.url_expires_at ? Date.parse(attachment.url_expires_at) : NaN;
  const next = { url: attachment.url, expiresAt: Number.isFinite(parsed) ? parsed : now + 60 * 60_000 };
  cache.set(attachment.id, next);
  if (!attachment.url.startsWith("blob:")) rememberedAttachmentUrls.set(attachment.id, next);
  return attachment.url;
}
