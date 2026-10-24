import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Hash, Package, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Avatar } from "@/components/arc/avatar/avatar";
import { ChatThread, type ChatAttachment, type ChatDraft, type ChatMessage, type ChatParticipant } from "@/components/arc/chat-thread/chat-thread";
import { TeamOrderPanel } from "@/components/team-inbox/TeamOrderPanel";
import { TeamOrderCard, TeamOrderCardPlaceholder } from "@/components/team-inbox/TeamOrderCard";
import { TeamChannelMembers } from "@/components/team-inbox/TeamChannelMembers";
import { TeamNewChannelDialog } from "@/components/team-inbox/TeamNewChannelDialog";
import { useOrderMention } from "@/components/team-inbox/TeamOrderMention";
import "@/components/team-inbox/team-inbox.css";
import { cn } from "@/lib/utils";
import { formatTaka } from "@/lib/orderEditor";
import {
  TEAM_CHAT_ACCEPT, TEAM_CHAT_ATTACHMENTS_PER_MESSAGE, TEAM_CHAT_CHANNELS_KEY, TEAM_CHAT_REACTIONS, TEAM_CHAT_UNREAD_KEY, TEAM_CHAT_VOICE_MAX_MS, channelTitle, defaultTeamConversation,
  extractOrderNumbers, getTeamChatThread, postTeamChat, splitOrderMentions, stableAttachmentUrl, teamChatFileProblem, teamChatThreadKey, uploadTeamChatFile, useTeamChatChannels, useTeamChatThread,
  type TeamChatAttachment, type TeamChatMessage, type TeamChatOrder, type TeamChatStaff, type TeamChatThread, type TeamChatUploaded,
} from "@/lib/teamChat";

const label = "text-[8px] font-medium uppercase tracking-[0.3em] text-black/45";
// Typing is reported at most this often while someone keeps typing.
const TYPING_EVERY_MS = 3000;

// A file waiting to send shows from its local copy; once uploaded it is not uploaded again on retry.
type PendingFile = { file: File; url: string; kind: ChatAttachment["kind"]; durationMs?: number; uploaded?: TeamChatUploaded };
type Pending = { id: string; channelId: string; body: string; files: PendingFile[]; createdAt: string; failed: boolean };

const shownAttachment = (attachment: TeamChatAttachment, url: string | undefined): ChatAttachment => ({
  id: attachment.id, name: attachment.name, kind: attachment.kind === "voice" ? "audio" : attachment.kind, url, size: attachment.size,
  width: attachment.width ?? undefined, height: attachment.height ?? undefined, duration: attachment.duration_ms ?? undefined,
});

// Placeholders hold the page's shape while it loads, so content fades in
// where it will stay instead of popping into an empty pane.
function ListPlaceholder() {
  return (
    <div aria-hidden="true" className="team-skeleton space-y-0.5">
      {[0.9, 0.7, 0.8, 0.6, 0.75].map((width, index) => (
        <div key={index} className="flex items-center gap-3 px-2.5 py-2">
          <span className={cn("h-9 w-9 shrink-0 bg-black/[0.05]", index < 2 ? "rounded-[11px]" : "rounded-full")} />
          <span className="flex-1 space-y-1.5">
            <span className="block h-2.5 rounded-full bg-black/[0.06]" style={{ width: `${width * 60}%` }} />
            <span className="block h-2 rounded-full bg-black/[0.04]" style={{ width: `${width * 90}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

// Mirrors a real thread: the day divider, grouped bubbles with the author's
// avatar on their last one, your replies on the right, and the message box.
const SKELETON_GROUPS: { mine: boolean; widths: number[] }[] = [
  { mine: false, widths: [148, 212] },
  { mine: true, widths: [96] },
  { mine: false, widths: [236] },
  { mine: true, widths: [180, 120] },
];

function ThreadPlaceholder() {
  return (
    <div aria-hidden="true" className="team-skeleton flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-4 pb-3.5 pt-3">
        <div className="flex items-center gap-3 px-1 pb-1">
          <span className="h-px flex-1 bg-[#efeee9]" />
          <span className="h-2.5 w-10 rounded-full bg-black/[0.05]" />
          <span className="h-px flex-1 bg-[#efeee9]" />
        </div>
        {SKELETON_GROUPS.map((group, index) => (
          <div key={index} className={cn("mt-3.5 flex items-end gap-2", group.mine && "justify-end")}>
            {!group.mine && <span className="h-7 w-7 shrink-0 rounded-full bg-black/[0.05]" />}
            <div className={cn("flex flex-col gap-0.5", group.mine ? "items-end" : "items-start")}>
              {!group.mine && <span className="mb-1 ml-3 h-2 w-16 rounded-full bg-black/[0.045]" />}
              {group.widths.map((width, line) => (
                <span key={line} className={cn("h-9 max-w-[60vw] rounded-[18px]", group.mine ? "bg-black/[0.08]" : "bg-black/[0.05]")} style={{ width }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-[#efeee9] px-3 pb-3 pt-2.5">
        <div className="h-[42px] rounded-[21px] border border-[#e6e5e0] bg-white" />
      </div>
    </div>
  );
}

// A conversation with no messages yet: who or what it is, and how to start.
function EmptyConversation({ avatar, title, line }: { avatar: ReactNode; title: string; line: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 bottom-[66px] flex flex-col items-center justify-center gap-3 px-6 text-center">
      {avatar}
      <div>
        <p className="text-[14px] font-semibold">{title}</p>
        <p className="mt-1 max-w-[300px] text-[12px] leading-relaxed text-black/45">{line}</p>
      </div>
      <p className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] text-black/50">Type @ to tag an order</p>
    </div>
  );
}

// A message that is nothing but order numbers shows only its cards.
const onlyOrders = (text: string) => splitOrderMentions(text).every((part) => part.type === "order" || !part.value.trim());

// "10:07" today, "Mon" this week, "12 Oct" before that.
function shortTime(iso: string) {
  const date = new Date(iso);
  const days = (Date.now() - date.getTime()) / 86_400_000;
  if (date.toDateString() === new Date().toDateString()) return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days < 6) return date.toLocaleDateString("en-GB", { weekday: "short" });
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function TeamInbox() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data: list, error: listError } = useTeamChatChannels();
  // Opens on the latest direct message. The choice is kept, so a message
  // arriving elsewhere never switches the open conversation.
  // Orders picked from the @ menu or returned with a sent message, so a card
  // can show while its message is still sending.
  const [extraOrders, setExtraOrders] = useState<Record<string, TeamChatOrder>>({});
  const rememberOrders = useCallback((more: Record<string, TeamChatOrder>) => setExtraOrders((all) => ({ ...all, ...more })), []);
  const orderMention = useOrderMention((order) => rememberOrders({ [order.order_number]: order }));
  const [opening, setOpening] = useState<string | null>(null);
  const fallbackId = opening && (!list || list.channels.some((item) => item.id === opening))
    ? opening : list ? defaultTeamConversation(list.channels) : null;
  useEffect(() => { if (opening !== fallbackId) setOpening(fallbackId); }, [opening, fallbackId]);
  const channelId = params.get("c") || fallbackId;
  const { data: thread, error: threadError } = useTeamChatThread(channelId);
  const [pending, setPending] = useState<Pending[]>([]);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  // Kept apart from the id so the drawer keeps its content while it slides out.
  const [orderOpen, setOrderOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const showOrder = useCallback((id: string) => { setOpenOrderId(id); setOrderOpen(true); }, []);
  const lastTyped = useRef(0);
  const lastRead = useRef<string | null>(null);
  const threadPane = useRef<HTMLElement>(null);
  // A sent message keeps the id it had while sending, so the thread sees the
  // same row settle from Sending to Sent instead of one row swapped for another.
  const shownIds = useRef(new Map<string, string>());
  const shown = useCallback((id: string) => shownIds.current.get(id) ?? id, []);
  // Attachment links stay the same across polls; local copies of sent files are freed on leaving.
  const attachmentUrls = useRef(new Map<string, { url: string; expiresAt: number }>());
  const localUrls = useRef<string[]>([]);
  useEffect(() => () => localUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const staff = useMemo(() => list?.staff ?? [], [list?.staff]);
  const viewerId = list?.viewer_id ?? "";
  const channel = list?.channels.find((item) => item.id === channelId);
  const currentThread = thread && thread.channel.id === channelId ? thread : undefined;

  const participants = useMemo<ChatParticipant[]>(() => {
    const people = staff.map((member) => ({ id: member.user_id, name: member.display_name }));
    const known = new Set(people.map((person) => person.id));
    for (const message of currentThread?.messages ?? []) {
      if (!known.has(message.author_id)) { known.add(message.author_id); people.push({ id: message.author_id, name: "Former teammate" }); }
    }
    return people;
  }, [staff, currentThread?.messages]);

  const orders = useMemo(() => ({ ...extraOrders, ...currentThread?.orders }), [extraOrders, currentThread?.orders]);

  // A message that is only order numbers drops its bubble once every order has a card (or, while
  // sending, a placeholder card), so the row never sits empty.
  const messages = useMemo<(ChatMessage & { orderNumbers: string[]; waiting?: boolean })[]>(() => [
    ...(currentThread?.messages ?? []).map((message) => ({
      id: shown(message.id), authorId: message.author_id, createdAt: message.created_at,
      text: onlyOrders(message.body) && message.order_numbers.every((number) => orders[number]) ? undefined : message.body,
      orderNumbers: message.order_numbers,
      attachments: (message.attachments ?? []).map((attachment) => shownAttachment(attachment, stableAttachmentUrl(attachmentUrls.current, attachment))),
      reactions: message.reactions, status: message.author_id === viewerId ? "sent" as const : undefined,
    })),
    ...pending.filter((item) => item.channelId === channelId).map((item) => ({
      id: item.id, authorId: viewerId, text: onlyOrders(item.body) && !item.failed ? undefined : item.body || undefined, createdAt: item.createdAt, status: item.failed ? "failed" as const : "sending" as const,
      orderNumbers: extractOrderNumbers(item.body), waiting: !item.failed,
      attachments: item.files.map((entry, index) => ({ id: `${item.id}-file-${index}`, name: entry.file.name, kind: entry.kind, url: entry.url, size: entry.file.size, duration: entry.durationMs })),
    })),
  ], [currentThread?.messages, pending, channelId, viewerId, shown, orders]);

  const readBy = useMemo(() => Object.fromEntries(Object.entries(currentThread?.read_by ?? {}).map(([user, id]) => [user, shown(id)])), [currentThread?.read_by, shown]);

  const select = useCallback((id: string) => {
    setParams((current) => { const next = new URLSearchParams(current); next.set("c", id); return next; }, { replace: true });
    setOrderOpen(false);
  }, [setParams]);

  const leaveChannel = useCallback(() => {
    setParams((current) => { const next = new URLSearchParams(current); next.delete("c"); return next; }, { replace: true });
  }, [setParams]);

  // A conversation you were removed from (or a stale link) falls back to the first channel.
  useEffect(() => {
    if (threadError && "status" in threadError && threadError.status === 404 && params.get("c")) leaveChannel();
  }, [threadError, params, leaveChannel]);

  // Mark the newest message from someone else as read once it is on screen.
  const markVisibleRead = useCallback(() => {
    const newest = currentThread?.messages.at(-1);
    if (!channelId || !newest || newest.author_id === viewerId || lastRead.current === newest.id || document.hidden) return;
    const pane = threadPane.current;
    if (!pane?.getClientRects().length) return;
    const scroller = pane.querySelector("[data-chat-scroller]");
    const row = pane.querySelector(`[data-chat-message-id="${shown(newest.id)}"]`);
    if (!scroller || !row) return;
    const viewport = scroller.getBoundingClientRect();
    const message = row.getBoundingClientRect();
    if (message.bottom <= viewport.top || message.top >= viewport.bottom) return;
    lastRead.current = newest.id;
    postTeamChat(`/api/team-chat/channels/${channelId}/read`, { message_id: newest.id })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: TEAM_CHAT_CHANNELS_KEY });
        void queryClient.invalidateQueries({ queryKey: TEAM_CHAT_UNREAD_KEY });
      })
      .catch(() => { lastRead.current = null; });
  }, [currentThread?.messages, channelId, viewerId, queryClient, shown]);
  useEffect(() => {
    markVisibleRead();
    document.addEventListener("visibilitychange", markVisibleRead);
    window.addEventListener("resize", markVisibleRead);
    return () => {
      document.removeEventListener("visibilitychange", markVisibleRead);
      window.removeEventListener("resize", markVisibleRead);
    };
  }, [markVisibleRead, params]);

  const deliver = useCallback(async (item: Pending) => {
    try {
      const uploaded = await Promise.all(item.files.map((entry) => entry.uploaded ?? uploadTeamChatFile(item.channelId, entry.file, { durationMs: entry.durationMs })));
      setPending((all) => all.map((entry) => entry.id === item.id ? { ...entry, files: entry.files.map((file, index) => ({ ...file, uploaded: uploaded[index] })) } : entry));
      const { message, orders: sentOrders } = await postTeamChat<{ message: TeamChatMessage; orders: Record<string, TeamChatOrder> }>(`/api/team-chat/channels/${item.channelId}/messages`, {
        body: item.body, client_message_id: item.id.replace(/^pending-/, ""), ...(uploaded.length ? { attachments: uploaded } : {}),
      });
      shownIds.current.set(message.id, item.id);
      // The sent files keep showing from their local copies, so nothing reloads as the message settles.
      (message.attachments ?? []).forEach((attachment, index) => {
        const local = item.files[index];
        if (local) attachmentUrls.current.set(attachment.id, { url: local.url, expiresAt: Date.now() + 6 * 60 * 60_000 });
      });
      rememberOrders(sentOrders ?? {});
      queryClient.setQueryData<TeamChatThread>(teamChatThreadKey(item.channelId), (current) =>
        current && !current.messages.some((existing) => existing.id === message.id)
          ? { ...current, messages: [...current.messages, message], orders: { ...current.orders, ...sentOrders } } : current);
      setPending((all) => all.filter((entry) => entry.id !== item.id));
      void queryClient.invalidateQueries({ queryKey: teamChatThreadKey(item.channelId) });
      void queryClient.invalidateQueries({ queryKey: TEAM_CHAT_CHANNELS_KEY });
    } catch (error) {
      setPending((all) => all.map((entry) => entry.id === item.id ? { ...entry, failed: true } : entry));
      toast.error(error instanceof Error ? error.message : "Message not sent");
    }
  }, [queryClient, rememberOrders]);

  const onSend = useCallback((draft: ChatDraft) => {
    if (!channelId) return;
    const picked = draft.files.filter((file) => {
      const problem = teamChatFileProblem(file);
      if (problem) toast.error(problem);
      return !problem;
    });
    if (picked.length > TEAM_CHAT_ATTACHMENTS_PER_MESSAGE) toast.error(`Send up to ${TEAM_CHAT_ATTACHMENTS_PER_MESSAGE} files at a time`);
    const files: PendingFile[] = picked.slice(0, TEAM_CHAT_ATTACHMENTS_PER_MESSAGE).map((file) => ({ file, url: URL.createObjectURL(file), kind: file.type.startsWith("image/") ? "image" : "file" }));
    if (draft.voice) files.push({ file: draft.voice.file, url: URL.createObjectURL(draft.voice.file), kind: "audio", durationMs: draft.voice.durationMs });
    localUrls.current.push(...files.map((entry) => entry.url));
    if (!draft.text.trim() && !files.length) return;
    const item: Pending = { id: `pending-${crypto.randomUUID()}`, channelId, body: draft.text.trim(), files, createdAt: new Date().toISOString(), failed: false };
    setPending((all) => [...all, item]);
    lastTyped.current = 0;
    void deliver(item);
  }, [channelId, deliver]);

  const onRetry = useCallback((id: string) => {
    const item = pending.find((entry) => entry.id === id);
    if (!item) return;
    setPending((all) => all.map((entry) => entry.id === id ? { ...entry, failed: false } : entry));
    void deliver({ ...item, failed: false });
  }, [pending, deliver]);

  const onReact = useCallback((shownId: string, emoji: string) => {
    const messageId = [...shownIds.current].find(([, id]) => id === shownId)?.[0] ?? shownId;
    if (!channelId || messageId.startsWith("pending-")) return;
    const key = teamChatThreadKey(channelId);
    queryClient.setQueryData<TeamChatThread>(key, (current) => current && {
      ...current,
      messages: current.messages.map((message) => {
        if (message.id !== messageId) return message;
        const had = message.reactions.find((reaction) => reaction.emoji === emoji);
        const reactions = had
          ? message.reactions.map((reaction) => reaction.emoji === emoji ? { ...reaction, count: reaction.count + (reaction.mine ? -1 : 1), mine: !reaction.mine } : reaction).filter((reaction) => reaction.count > 0)
          : [...message.reactions, { emoji, count: 1, mine: true }];
        return { ...message, reactions };
      }),
    });
    postTeamChat(`/api/team-chat/messages/${messageId}/reactions`, { emoji })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Reaction not saved"))
      .finally(() => void queryClient.invalidateQueries({ queryKey: key }));
  }, [channelId, queryClient]);

  const onVoiceError = useCallback((error: unknown) => {
    const refused = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
    toast.error(refused ? "Allow microphone access in your browser to record a voice message" : "Could not start recording. Check your microphone.");
  }, []);

  const onTyping = useCallback(() => {
    if (!channelId || Date.now() - lastTyped.current < TYPING_EVERY_MS) return;
    lastTyped.current = Date.now();
    postTeamChat(`/api/team-chat/channels/${channelId}/typing`, {}).catch(() => undefined);
  }, [channelId]);

  const openDm = useCallback(async (member: TeamChatStaff) => {
    const existing = list?.channels.find((item) => item.kind === "dm" && item.other_user_id === member.user_id);
    if (existing) return select(existing.id);
    try {
      const { channel: created } = await postTeamChat<{ channel: { id: string } }>("/api/team-chat/dms", { user_id: member.user_id });
      await queryClient.invalidateQueries({ queryKey: TEAM_CHAT_CHANNELS_KEY });
      select(created.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the conversation");
    }
  }, [list?.channels, queryClient, select]);

  const createChannel = useCallback(async ({ name, topic, memberIds }: { name: string; topic: string; memberIds: string[] }) => {
    try {
      const { channel: created } = await postTeamChat<{ channel: { id: string } }>("/api/team-chat/channels", { name, topic, member_ids: memberIds });
      await queryClient.invalidateQueries({ queryKey: TEAM_CHAT_CHANNELS_KEY });
      select(created.id);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the channel");
      return false;
    }
  }, [queryClient, select]);

  // Order numbers stay in the text as links; the orders themselves show as cards under the bubble.
  const renderText = useCallback((message: ChatMessage) =>
    splitOrderMentions(message.text).map((part, index) => {
      if (part.type === "text") return <span key={index}>{part.value}</span>;
      const order = orders[part.value];
      return order
        ? <button key={index} type="button" onClick={() => showOrder(order.id)} className="font-semibold underline decoration-current/30 underline-offset-2 hover:decoration-current">{part.raw}</button>
        : <span key={index} title="No order with this number">{part.raw}</span>;
    }), [orders, showOrder]);
  const renderAfter = useCallback((message: ChatMessage) => {
    const { orderNumbers = [], waiting } = message as ChatMessage & { orderNumbers?: string[]; waiting?: boolean };
    return orderNumbers.map((number) => {
      const order = orders[number];
      if (order) return <TeamOrderCard key={number} order={order} onOpen={() => showOrder(order.id)} />;
      return waiting ? <TeamOrderCardPlaceholder key={number} orderNumber={number} /> : null;
    });
  }, [orders, showOrder]);

  const channels = list?.channels.filter((item) => item.kind === "channel") ?? [];
  const dms = new Map(list?.channels.filter((item) => item.kind === "dm").map((item) => [item.other_user_id, item]) ?? []);
  // Recent conversations first, then whoever is online, then by name.
  const teammates = staff.filter((member) => member.user_id !== viewerId).sort((a, b) =>
    (dms.get(b.user_id)?.last_at || "").localeCompare(dms.get(a.user_id)?.last_at || "")
    || Number(b.online) - Number(a.online) || a.display_name.localeCompare(b.display_name));
  const title = channel ? channelTitle(channel, staff) : currentThread ? channelTitle({ ...currentThread.channel, other_user_id: null }, staff) : "";
  const dmPerson = channel?.kind === "dm" ? staff.find((member) => member.user_id === channel.other_user_id) : undefined;
  const showThreadOnMobile = !!params.get("c");
  const nameOf = (id: string | null) => id === viewerId ? "You" : staff.find((member) => member.user_id === id)?.display_name.split(/\s+/)[0] || "Someone";

  // Resting on a conversation loads it, so clicking switches without waiting.
  const preload = (id: string | null | undefined) => {
    if (!id) return;
    void queryClient.prefetchQuery({ queryKey: teamChatThreadKey(id), queryFn: () => getTeamChatThread(id), staleTime: 10_000 });
  };

  const conversation = ({ key, active, unread, avatar, name, preview, at, onClick, preloadId }: {
    key: string; active: boolean; unread: number; avatar: ReactNode; name: string; preview: string | null; at: string | null; onClick: () => void; preloadId?: string | null;
  }) => (
    <button key={key} type="button" onClick={onClick} onPointerEnter={() => preload(preloadId)} onFocus={() => preload(preloadId)} aria-current={active || undefined}
      className={cn("group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-150 ease-out",
        active ? "bg-white shadow-[0_0_0_1px_#ecebe7,0_1px_2px_rgba(0,0,0,0.03)]" : "hover:bg-black/[0.035]")}>
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-[13px]", unread && !active ? "font-semibold" : "font-medium")}>{name}</span>
          {at && <span className={cn("shrink-0 text-[10.5px] tabular-nums", unread && !active ? "font-medium text-black" : "text-black/40")}>{shortTime(at)}</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-[11.5px]", unread && !active ? "text-black/70" : "text-black/45")}>{preview || "No messages yet"}</span>
          {unread > 0 && !active && <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#0b0b0a] px-1.5 text-[10px] font-semibold tabular-nums text-white">{unread > 99 ? "99+" : unread}</span>}
        </span>
      </span>
    </button>
  );

  return (
    <div data-testid="team-inbox" className="relative flex h-[calc(100dvh-4.5rem)] max-h-[calc(100dvh-4.5rem)] min-h-0 overflow-hidden bg-[#FAFAF8] text-[#0b0b0a] max-md:h-[calc(100dvh-8rem)] max-md:max-h-[calc(100dvh-8rem)]">
      <nav aria-label="Conversations" className={cn("team-chat-theme w-[272px] shrink-0 overflow-y-auto border-r border-[#ecebe7] px-2 py-4 max-md:w-full max-md:border-r-0", showThreadOnMobile && "max-md:hidden")}>
        <div className="flex items-center justify-between px-2.5 pb-2">
          <p className={label}>Channels</p>
          {list?.can_create_channels && (
            <button type="button" aria-label="New channel" onClick={() => setCreating(true)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-black/50 transition-[background-color,transform] duration-150 ease-out hover:bg-black/[0.05] hover:text-black active:scale-[0.92]">
              <Plus weight="light" size={13} />
            </button>
          )}
        </div>
        {!list && !listError && <ListPlaceholder />}
        <div className="space-y-0.5">
          {channels.map((item) => conversation({
            key: item.id, active: item.id === channelId, unread: item.unread, name: item.name || "",
            avatar: <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-[#e6e5e0] bg-[#efeee9] text-black/60"><Hash weight="light" size={16} /></span>,
            preview: item.last_body ? `${nameOf(item.last_author)}: ${item.last_body}` : item.topic, at: item.last_at,
            onClick: () => select(item.id), preloadId: item.id,
          }))}
        </div>
        <p className={cn(label, "px-2.5 pb-2 pt-6")}>Direct messages</p>
        <div className="space-y-0.5">
          {teammates.map((member) => {
            const dm = dms.get(member.user_id);
            return conversation({
              key: member.user_id, active: !!dm && dm.id === channelId, unread: dm?.unread || 0, name: member.display_name,
              avatar: <Avatar name={member.display_name} status={member.online ? "online" : "offline"} />,
              preview: dm?.last_body ? `${dm.last_author === viewerId ? "You: " : ""}${dm.last_body}` : member.online ? "Online" : null,
              at: dm?.last_at || null, onClick: () => void openDm(member), preloadId: dm?.id,
            });
          })}
        </div>
        {list && !teammates.length && <p className="px-2.5 text-[11px] text-black/40">Invite teammates in Staff to message them.</p>}
        {listError && <p className="px-2.5 pt-3 text-[11px] text-[#c2410c]">{listError.message}</p>}
      </nav>

      <section ref={threadPane} onScrollCapture={markVisibleRead} className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col", !showThreadOnMobile && "max-md:hidden")}
        onInput={(event) => { onTyping(); orderMention.onInput(event); }} onKeyDownCapture={orderMention.onKeyDownCapture}>
        <header className="team-chat-theme flex items-center gap-3 border-b border-[#ecebe7] px-4 py-3">
          <button type="button" aria-label="Back to conversations" className="md:hidden -ml-1 inline-flex h-7 w-7 items-center justify-center rounded-lg text-black/60"
            onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.delete("c"); return next; })}>
            <ArrowLeft weight="light" size={16} />
          </button>
          {dmPerson
            ? <Avatar name={dmPerson.display_name} size="sm" status={dmPerson.online ? "online" : "offline"} />
            : channel && <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border border-[#e6e5e0] bg-[#efeee9] text-black/60"><Hash weight="light" size={13} /></span>}
          <div className="min-w-0">
            {title
              ? <h1 className="truncate text-[13.5px] font-semibold">{channel?.kind === "channel" ? channel.name : title}</h1>
              : <span aria-hidden="true" className="my-[3px] block h-3 w-28 rounded-full bg-black/[0.06]" />}
            <p className="truncate text-[11px] text-black/45">
              {dmPerson ? (dmPerson.online ? "Online" : "Offline") : channel?.topic || "Type @ to tag an order by name, phone or number"}
            </p>
          </div>
          {channel?.kind === "channel" && currentThread?.members && (
            <TeamChannelMembers channelId={channel.id} channelName={channel.name || ""} memberIds={currentThread.members}
              staff={staff} viewerId={viewerId} canManage={!!list?.can_create_channels} onLeft={leaveChannel} />
          )}
        </header>
        <div className="team-chat-theme relative min-h-0 flex-1">
          {/* Ready conversations replace loading content immediately. Reintroducing an outgoing
              skeleton here flashes it even when the delayed placeholder never became visible. */}
          {channelId && currentThread ? (
            <div key={channelId} className="absolute inset-0">
              <ChatThread
                participants={participants}
                currentUserId={viewerId}
                messages={messages}
                typing={currentThread.typing}
                readBy={readBy}
                onSend={onSend}
                onReact={onReact}
                onRetry={onRetry}
                reactions={[...TEAM_CHAT_REACTIONS]}
                allowAttachments
                accept={TEAM_CHAT_ACCEPT}
                allowVoice
                maxVoiceMs={TEAM_CHAT_VOICE_MAX_MS}
                onVoiceError={onVoiceError}
                placeholder={channel?.kind === "channel" ? `Message #${channel.name}` : `Message ${title}`}
                label={title}
                renderText={renderText}
                renderAfter={renderAfter}
              />
              {!messages.length && (
                dmPerson
                  ? <EmptyConversation avatar={<Avatar name={dmPerson.display_name} size="lg" status={dmPerson.online ? "online" : "offline"} />}
                      title={dmPerson.display_name} line={`This is the start of your messages with ${dmPerson.display_name.split(/\s+/)[0]}. Only the two of you can see them.`} />
                  : <EmptyConversation avatar={<span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] border border-[#e6e5e0] bg-[#efeee9] text-black/60"><Hash weight="light" size={20} /></span>}
                      title={`#${channel?.name ?? ""}`} line={channel?.topic ? `${channel.topic}. Be the first to post.` : "No messages yet. Be the first to post."} />
              )}
            </div>
          ) : !listError ? (
            <div className="team-placeholder-in absolute inset-0">
              <ThreadPlaceholder />
            </div>
          ) : null}
        </div>
        {orderMention.menu}
      </section>

      <TeamOrderPanel orderId={openOrderId} open={orderOpen} onOpenChange={setOrderOpen} />
      {list?.can_create_channels && (
        <TeamNewChannelDialog open={creating} onOpenChange={setCreating} staff={staff} viewerId={viewerId} onCreate={createChannel} />
      )}
    </div>
  );
}
