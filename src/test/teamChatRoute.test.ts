import { describe, expect, it } from "vitest";
import { database, foreignOrg, handlers, http, orgId, uuid } from "./campaignHandlerHarness";
import * as teamChat from "../../shared/teamChat.js";

const ME = uuid(1), RAFI = uuid(2), NUSRAT = uuid(3);
const as = (who: string) => ({ authorization: `Bearer ${who}` });
const DISPATCH = uuid(60), DM_RAFI_NUSRAT = uuid(61), GENERAL = uuid(62), RETURNS = uuid(63);
const member = (channel_id: string, user_id: string) => ({ channel_id, org_id: orgId, user_id });

// The real Team Inbox routes, run against the in-memory database.
function fixture(seed: Record<string, Record<string, unknown>[]> = {}, role = "admin") {
  const db = database({
    user_roles: [
      { user_id: ME, org_id: orgId, display_name: "Noor", deleted_at: null, suspended_at: null, created_at: "1" },
      { user_id: RAFI, org_id: orgId, display_name: "Rafi", deleted_at: null, suspended_at: null, created_at: "2" },
      { user_id: NUSRAT, org_id: orgId, display_name: "Nusrat", deleted_at: null, suspended_at: null, created_at: "3" },
      { user_id: uuid(9), org_id: foreignOrg, display_name: "Elsewhere", deleted_at: null, suspended_at: null, created_at: "4" },
    ],
    orders: [
      { id: uuid(50), org_id: orgId, order_number: "SK-1042", customer_name: "Fahim", phone: "+880 1712345678", price: 1250, status: "pending", courier_name: null, created_at: "2026-10-20T10:00:00Z" },
      { id: uuid(51), org_id: foreignOrg, order_number: "SK-1043", customer_name: "Not ours", phone: "01712345678", price: 999, status: "pending", courier_name: null, created_at: "2026-10-22T10:00:00Z" },
      { id: uuid(52), org_id: orgId, order_number: "SK-1130", customer_name: "Lingkon", phone: "01898765432", price: 350, status: "pending", courier_name: null, created_at: "2026-10-23T10:00:00Z" },
    ],
    team_channels: [
      { id: DISPATCH, org_id: orgId, kind: "channel", name: "dispatch", topic: null, dm_key: null, created_at: "1" },
      { id: DM_RAFI_NUSRAT, org_id: orgId, kind: "dm", name: null, topic: null, dm_key: teamChat.teamChatDmKey(RAFI, NUSRAT), created_at: "2" },
      { id: GENERAL, org_id: orgId, kind: "channel", name: "general", topic: null, dm_key: null, created_at: "0" },
      { id: RETURNS, org_id: orgId, kind: "channel", name: "returns", topic: null, dm_key: null, created_at: "3" },
    ],
    team_channel_members: [member(DISPATCH, ME), member(DISPATCH, RAFI), member(DISPATCH, NUSRAT), member(DM_RAFI_NUSRAT, RAFI), member(DM_RAFI_NUSRAT, NUSRAT), member(RETURNS, RAFI)],
    team_messages: [],
    team_message_reactions: [],
    team_presence: [],
    team_message_attachments: [],
    ...seed,
  });
  // Files in the team-attachments bucket, by path, as the browser left them.
  const objects = new Map<string, { size: number; contentType: string }>();
  const signed: string[][] = [];
  const bucket = {
    createSignedUploadUrl: async (path: string) => ({ data: { signedUrl: `https://storage.test/upload/${path}?token=t`, token: "t", path }, error: null }),
    info: async (path: string) => objects.has(path) ? { data: objects.get(path), error: null } : { data: null, error: { message: "Object not found", statusCode: "404" } },
    createSignedUrls: async (paths: string[]) => { signed.push(paths); return { data: paths.map((path) => ({ path, signedUrl: `https://storage.test/sign/${path}`, error: null })), error: null }; },
    createSignedUrl: async (path: string, _ttl: number, options: { download?: string }) => { signed.push([path]); return { data: { signedUrl: `https://storage.test/sign/${path}?download=${encodeURIComponent(options?.download ?? "")}` }, error: null }; },
  };
  // team_chat_post_message saves a message and its attachments together, as the SQL function does.
  const postMessage = (args: Record<string, unknown>) => {
    const t = db.tables;
    const id = (args.p_id as string) || uuid(20000 + (t.team_messages || []).length);
    if ((t.team_messages || []).some((m) => m.id === id)) return { data: null, error: { code: "23505", message: "duplicate key" } };
    const files = (args.p_attachments as Record<string, unknown>[]) || [];
    if (!args.p_body && !files.length) return { data: null, error: { code: "23514", message: "empty" } };
    const message = { id, org_id: args.p_org, channel_id: args.p_channel, author_id: args.p_author, body: args.p_body, order_numbers: args.p_order_numbers, created_at: new Date().toISOString() };
    t.team_messages = [...(t.team_messages || []), message];
    t.team_message_attachments = [...(t.team_message_attachments || []), ...files.map((file, position) => ({ id: uuid(30000 + (t.team_message_attachments || []).length + position), org_id: args.p_org, message_id: id, position, ...file }))];
    const { org_id: _org, ...row } = message;
    return { data: row, error: null };
  };
  Object.assign(db, {
    storage: { from: (name: string) => { if (name !== "team-attachments") throw new Error(`Unexpected bucket ${name}`); return bucket; } },
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === "team_chat_post_message") {
        const result = Promise.resolve(postMessage(args));
        const chain = Object.assign(result, { select: () => chain, single: () => chain });
        return chain;
      }
      return summaries(name, args as { p_org: string; p_user: string });
    },
  });
  // team_chat_summaries, computed the way the SQL function does.
  const summaries = async (name: string, args: { p_org: string; p_user: string }) => {
      if (name !== "team_chat_summaries") throw new Error(`Unexpected RPC ${name}`);
      const t = db.tables;
      const rows = (t.team_channels || []).filter((c) => c.org_id === args.p_org).flatMap((c) => {
        const me = (t.team_channel_members || []).find((m) => m.channel_id === c.id && m.user_id === args.p_user);
        if (!me) return [];
        const messages = (t.team_messages || []).filter((m) => m.channel_id === c.id);
        const unread = messages.filter((m) => m.author_id !== args.p_user && String(m.created_at) > String(me?.last_read_at ?? "")).length;
        return [{ channel_id: c.id, unread }];
      });
      return { data: rows, error: null };
  };
  const harness = handlers(db, {
    ...teamChat,
    getUser: async (token: string) => ({ user: token ? { id: token.replace("Bearer ", "") } : null }),
    getUserOrg: async () => ({ orgId, role }),
    sendError: (res: { status: (code: number) => { json: (body: unknown) => unknown } }, e: Error & { statusCode?: number }) => res.status(e.statusCode || 500).json({ error: e.message }),
  });
  harness.load(
    ["TEAM_CHAT_ID_RE", "TEAM_CHAT_MESSAGE_FIELDS", "TEAM_CHAT_PAGE", "TEAM_CHAT_TYPING_MS", "TEAM_CHAT_ONLINE_MS", "TEAM_CHAT_EVERYONE_CHANNEL", "TEAM_CHAT_DEFAULT_CHANNELS", "TEAM_CHAT_ORDER_FIELDS", "TEAM_CHAT_ORDER_RESULTS", "errorMessage", "teamChatUser", "teamChatChannel", "touchTeamChatMember", "addTeamChatMembers", "teamChatStaffIds", "teamChatManagedChannel", "markTeamPresence", "teamChatSummaries",
      "TEAM_CHAT_BUCKET", "TEAM_CHAT_FILE_RE", "TEAM_CHAT_ATTACHMENT_FIELDS", "TEAM_CHAT_LINK_SECONDS", "teamChatLinks", "teamChatAttachments", "teamChatUploadedFiles", "teamChatBadFile",
      "staffCache", "getOrgStaff", "getActiveOrgStaff", "getStaffNameMap"],
    ['app.get("/api/team-chat/', 'app.post("/api/team-chat/', 'app.delete("/api/team-chat/'],
  );
  return { ...harness, db, objects, signed };
}

describe("team inbox", () => {
  it("turns away requests without a login", async () => {
    const { app } = fixture();
    expect((await http(app, "GET", "/api/team-chat/channels", undefined, {})).status).toBe(401);
  });

  it("starts an empty workspace with #general, #dispatch and #returns, with everyone in them", async () => {
    const { app } = fixture({ team_channels: [], team_channel_members: [] });
    const result = await http(app, "GET", "/api/team-chat/channels", undefined, as(ME));
    expect(result.status).toBe(200);
    expect(result.body.channels.map((c: { name: string }) => c.name)).toEqual(["general", "dispatch", "returns"]);
    const rafi = await http(app, "GET", "/api/team-chat/channels", undefined, as(RAFI));
    expect(rafi.body.channels).toHaveLength(3);
    expect(result.body.staff.map((s: { display_name: string }) => s.display_name)).toEqual(["Noor", "Rafi", "Nusrat"]);
  });

  it("keeps a DM private to its two people", async () => {
    const { app } = fixture();
    const list = await http(app, "GET", "/api/team-chat/channels", undefined, as(ME));
    expect(list.body.channels.map((c: { id: string }) => c.id)).not.toContain(DM_RAFI_NUSRAT);
    expect((await http(app, "GET", `/api/team-chat/channels/${DM_RAFI_NUSRAT}/messages`, undefined, as(ME))).status).toBe(404);
    expect((await http(app, "POST", `/api/team-chat/channels/${DM_RAFI_NUSRAT}/messages`, { body: "hi" }, as(ME))).status).toBe(404);
    expect((await http(app, "GET", `/api/team-chat/channels/${DM_RAFI_NUSRAT}/messages`, undefined, as(RAFI))).status).toBe(200);
  });

  it("opens one DM per pair, whoever starts it", async () => {
    const { app, db } = fixture();
    const first = await http(app, "POST", "/api/team-chat/dms", { user_id: RAFI }, as(ME));
    const again = await http(app, "POST", "/api/team-chat/dms", { user_id: ME }, as(RAFI));
    expect(first.status).toBe(201);
    expect(again.body.channel.id).toBe(first.body.channel.id);
    expect(db.tables.team_channel_members.filter((m) => m.channel_id === first.body.channel.id).map((m) => m.user_id).sort()).toEqual([ME, RAFI].sort());
    expect((await http(app, "POST", "/api/team-chat/dms", { user_id: uuid(9) }, as(ME))).status).toBe(404);
  });

  it("remembers mentioned orders and shows only this workspace's orders as cards", async () => {
    const { app } = fixture();
    const sent = await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, { body: "  Rush #SK-1042 and SK1043  " }, as(ME));
    expect(sent.status).toBe(201);
    expect(sent.body.message).toMatchObject({ body: "Rush #SK-1042 and SK1043", order_numbers: ["SK-1042", "SK-1043"], author_id: ME });
    expect(Object.keys(sent.body.orders)).toEqual(["SK-1042"]);

    const thread = await http(app, "GET", `/api/team-chat/channels/${DISPATCH}/messages`, undefined, as(RAFI));
    expect(Object.keys(thread.body.orders)).toEqual(["SK-1042"]);
    expect(thread.body.orders["SK-1042"]).toMatchObject({ id: uuid(50), customer_name: "Fahim", price: 1250 });
    expect(thread.body.read_by).toEqual({ [ME]: sent.body.message.id });
  });

  it("rejects empty and oversized messages", async () => {
    const { app } = fixture();
    expect((await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, { body: "   " }, as(ME))).status).toBe(400);
    expect((await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, { body: "x".repeat(4001) }, as(ME))).status).toBe(400);
  });

  it("does not duplicate a message when the client retries the same send", async () => {
    const { app, db } = fixture();
    const body = { body: "Pickup at 2", client_message_id: uuid(75) };
    const first = await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, body, as(ME));
    const retry = await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, body, as(ME));
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body.message.id).toBe(first.body.message.id);
    expect(db.tables.team_messages).toHaveLength(1);
  });

  it("does not move a newer read receipt backward when replaying a send", async () => {
    const { app, db } = fixture();
    const body = { body: "Pickup at 2", client_message_id: uuid(76) };
    await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, body, as(ME));
    const receipt = db.tables.team_channel_members.find((m) => m.channel_id === DISPATCH && m.user_id === ME)!;
    Object.assign(receipt, { last_read_message_id: uuid(77), last_read_at: "2099-01-01T00:00:00Z" });
    await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, body, as(ME));
    expect(receipt.last_read_message_id).toBe(uuid(77));
    expect(receipt.last_read_at).toBe("2099-01-01T00:00:00Z");
  });

  it("reports a saved message as sent even when order enrichment fails", async () => {
    const { app, db } = fixture();
    db.failures.orders = { message: "Orders unavailable" };
    const sent = await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, { body: "SK-1042" }, as(ME));
    expect(sent.status).toBe(201);
    expect(sent.body.message.body).toBe("SK-1042");
    expect(db.tables.team_messages).toHaveLength(1);
  });

  it("repairs a DM whose membership insert was interrupted", async () => {
    const { app, db } = fixture();
    db.failures.team_channel_members = { message: "Membership unavailable" };
    expect((await http(app, "POST", "/api/team-chat/dms", { user_id: RAFI }, as(ME))).status).toBe(500);
    delete db.failures.team_channel_members;
    const retry = await http(app, "POST", "/api/team-chat/dms", { user_id: RAFI }, as(ME));
    expect(retry.status).toBe(200);
    expect(db.tables.team_channel_members.filter((m) => m.channel_id === retry.body.channel.id).map((m) => m.user_id).sort()).toEqual([ME, RAFI].sort());
  });

  it("counts unread messages from others until they are read", async () => {
    const { app } = fixture();
    const sent = await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, { body: "Pickup at 2" }, as(RAFI));
    expect((await http(app, "GET", "/api/team-chat/unread", undefined, as(ME))).body.unread).toBe(1);
    expect((await http(app, "GET", "/api/team-chat/unread", undefined, as(RAFI))).body.unread).toBe(0);
    await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/read`, { message_id: sent.body.message.id }, as(ME));
    expect((await http(app, "GET", "/api/team-chat/unread", undefined, as(ME))).body.unread).toBe(0);
  });

  it("toggles a reaction and only accepts the offered emoji", async () => {
    const { app } = fixture();
    const sent = await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, { body: "Done" }, as(RAFI));
    const path = `/api/team-chat/messages/${sent.body.message.id}/reactions`;
    expect((await http(app, "POST", path, { emoji: "👍" }, as(ME))).body.reacted).toBe(true);
    let thread = await http(app, "GET", `/api/team-chat/channels/${DISPATCH}/messages`, undefined, as(ME));
    expect(thread.body.messages[0].reactions).toEqual([{ emoji: "👍", count: 1, mine: true }]);
    expect((await http(app, "POST", path, { emoji: "👍" }, as(ME))).body.reacted).toBe(false);
    thread = await http(app, "GET", `/api/team-chat/channels/${DISPATCH}/messages`, undefined, as(ME));
    expect(thread.body.messages[0].reactions).toEqual([]);
    expect((await http(app, "POST", path, { emoji: "<script>" }, as(ME))).status).toBe(400);
  });

  it("shows who is typing to everyone else", async () => {
    const { app } = fixture();
    await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/typing`, {}, as(RAFI));
    expect((await http(app, "GET", `/api/team-chat/channels/${DISPATCH}/messages`, undefined, as(ME))).body.typing).toEqual([RAFI]);
    expect((await http(app, "GET", `/api/team-chat/channels/${DISPATCH}/messages`, undefined, as(RAFI))).body.typing).toEqual([]);
  });

  it("shows teammates as online while their dashboard keeps checking in", async () => {
    const { app, db } = fixture({ team_presence: [{ org_id: orgId, user_id: NUSRAT, seen_at: new Date(Date.now() - 10 * 60_000).toISOString() }] });
    await http(app, "GET", "/api/team-chat/unread", undefined, as(RAFI));
    const list = await http(app, "GET", "/api/team-chat/channels", undefined, as(ME));
    const online = Object.fromEntries(list.body.staff.map((s: { display_name: string; online: boolean }) => [s.display_name, s.online]));
    expect(online).toEqual({ Noor: true, Rafi: true, Nusrat: false });
    expect(db.tables.team_presence.filter((row) => row.user_id === RAFI)).toHaveLength(1);
  });

  it("shows a channel only to its members, and puts everyone in #general", async () => {
    const { app } = fixture();
    const list = await http(app, "GET", "/api/team-chat/channels", undefined, as(ME));
    expect(list.body.channels.map((c: { name: string }) => c.name)).toEqual(["general", "dispatch"]);
    expect((await http(app, "GET", `/api/team-chat/channels/${RETURNS}/messages`, undefined, as(ME))).status).toBe(404);
    expect((await http(app, "POST", `/api/team-chat/channels/${RETURNS}/messages`, { body: "hi" }, as(ME))).status).toBe(404);
    const thread = await http(app, "GET", `/api/team-chat/channels/${DISPATCH}/messages`, undefined, as(ME));
    expect(thread.body.members.sort()).toEqual([ME, RAFI, NUSRAT].sort());
  });

  it("lets admins add and remove channel members", async () => {
    const { app } = fixture();
    expect((await http(app, "POST", `/api/team-chat/channels/${RETURNS}/members`, { user_id: NUSRAT }, as(ME))).status).toBe(201);
    expect((await http(app, "GET", `/api/team-chat/channels/${RETURNS}/messages`, undefined, as(NUSRAT))).status).toBe(200);
    expect((await http(app, "DELETE", `/api/team-chat/channels/${RETURNS}/members/${NUSRAT}`, undefined, as(ME))).status).toBe(200);
    expect((await http(app, "GET", `/api/team-chat/channels/${RETURNS}/messages`, undefined, as(NUSRAT))).status).toBe(404);
    expect((await http(app, "POST", `/api/team-chat/channels/${RETURNS}/members`, { user_id: uuid(9) }, as(ME))).status).toBe(404);
  });

  it("keeps #general and DMs out of member changes, and members to admins", async () => {
    const { app } = fixture();
    expect((await http(app, "DELETE", `/api/team-chat/channels/${GENERAL}/members/${RAFI}`, undefined, as(ME))).status).toBe(400);
    expect((await http(app, "POST", `/api/team-chat/channels/${DM_RAFI_NUSRAT}/members`, { user_id: ME }, as(ME))).status).toBe(404);
    const staff = fixture({}, "team_member");
    expect((await http(staff.app, "POST", `/api/team-chat/channels/${DISPATCH}/members`, { user_id: NUSRAT }, as(RAFI))).status).toBe(403);
  });

  it("adds the creator and chosen teammates to a new channel", async () => {
    const { app } = fixture();
    const made = await http(app, "POST", "/api/team-chat/channels", { name: "riders", member_ids: [RAFI, uuid(9)] }, as(ME));
    const thread = await http(app, "GET", `/api/team-chat/channels/${made.body.channel.id}/messages`, undefined, as(ME));
    expect(thread.body.members.sort()).toEqual([ME, RAFI].sort());
  });

  it("finds orders to tag by number, customer name or phone, in this workspace only", async () => {
    const { app } = fixture();
    const find = async (q: string) => (await http(app, "GET", `/api/team-chat/orders?q=${encodeURIComponent(q)}`, undefined, as(ME))).body.orders.map((o: { order_number: string }) => o.order_number);
    expect(await find("")).toEqual(["SK-1130", "SK-1042"]);
    expect(await find("1130")).toEqual(["SK-1130"]);
    expect(await find("#sk-1042")).toEqual(["SK-1042"]);
    expect(await find("ling")).toEqual(["SK-1130"]);
    expect(await find("01712345")).toEqual(["SK-1042"]);
    expect(await find("Not ours")).toEqual([]);
    expect(await find("%")).toEqual(["SK-1130", "SK-1042"]);
  });

  it("lets only admins create channels", async () => {
    const staff = fixture({}, "team_member");
    expect((await http(staff.app, "POST", "/api/team-chat/channels", { name: "eid" }, as(RAFI))).status).toBe(403);
    const admin = fixture();
    const made = await http(admin.app, "POST", "/api/team-chat/channels", { name: "#Eid Stock", topic: " Eid prep " }, as(ME));
    expect(made.status).toBe(201);
    expect(made.body.channel).toMatchObject({ name: "eid-stock", topic: "Eid prep" });
  });
});

describe("team inbox attachments", () => {
  const folder = (channel: string, who: string) => `${orgId}/${channel}/${who}/`;
  // Asks for an upload link, then "uploads" the file the way the browser does.
  async function upload(app: Parameters<typeof http>[0], objects: Map<string, { size: number; contentType: string }>, file: { type: string; size: number }, who = ME, channel = DISPATCH) {
    const link = await http(app, "POST", `/api/team-chat/channels/${channel}/uploads`, file, as(who));
    if (link.status === 201) objects.set(link.body.path, { size: file.size, contentType: link.body.content_type });
    return link;
  }

  it("gives a one-time upload link inside the sender's folder for that conversation", async () => {
    const { app } = fixture();
    const link = await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/uploads`, { type: "audio/webm;codecs=opus", size: 4096 }, as(ME));
    expect(link.status).toBe(201);
    expect(link.body.path).toMatch(new RegExp(`^${folder(DISPATCH, ME)}[0-9a-f-]{36}\\.webm$`));
    expect(link.body.content_type).toBe("audio/webm");
    expect(link.body.upload_url).toContain(link.body.path);
  });

  it("refuses upload links for other people's conversations, unsafe types and big files", async () => {
    const { app } = fixture();
    expect((await http(app, "POST", `/api/team-chat/channels/${DM_RAFI_NUSRAT}/uploads`, { type: "image/png", size: 10 }, as(ME))).status).toBe(404);
    expect((await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/uploads`, { type: "text/html", size: 10 }, as(ME))).status).toBe(400);
    expect((await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/uploads`, { type: "image/svg+xml", size: 10 }, as(ME))).status).toBe(400);
    expect((await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/uploads`, { type: "application/pdf", size: 20 * 1024 * 1024 + 1 }, as(ME))).status).toBe(400);
    expect((await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/uploads`, { type: "application/pdf" }, as(ME))).status).toBe(400);
    expect((await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/uploads`, { type: "image/png", size: 10 }, {})).status).toBe(401);
  });

  it("sends photos, a document and a voice message with no caption", async () => {
    const { app, db, objects } = fixture();
    const photo = await upload(app, objects, { type: "image/jpeg", size: 2048 });
    const pdf = await upload(app, objects, { type: "application/pdf", size: 9000 });
    const voice = await upload(app, objects, { type: "audio/webm", size: 5000 });
    const sent = await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, { body: "", attachments: [
      { path: photo.body.path, name: "IMG_2041.jpg", width: 1200, height: 900 },
      { path: pdf.body.path, name: "../Invoice Oct.pdf", width: 5 },
      { path: voice.body.path, name: "voice.webm", duration_ms: 4200 },
    ] }, as(ME));
    expect(sent.status).toBe(201);
    expect(sent.body.message.body).toBe("");
    expect(sent.body.message.attachments.map((a: { kind: string; name: string }) => [a.kind, a.name])).toEqual([["image", "IMG_2041.jpg"], ["file", "Invoice Oct.pdf"], ["voice", "voice.webm"]]);
    expect(sent.body.message.attachments[0]).toMatchObject({ width: 1200, height: 900, size: 2048, mime_type: "image/jpeg" });
    expect(sent.body.message.attachments[1]).toMatchObject({ width: null, height: null });
    expect(sent.body.message.attachments[2]).toMatchObject({ duration_ms: 4200 });
    expect(sent.body.message.attachments[0].url).toBe(`https://storage.test/sign/${photo.body.path}`);
    // A PDF opens in the app, so the link is not forced to download.
    expect(sent.body.message.attachments[1].url).toBe(`https://storage.test/sign/${pdf.body.path}`);
    expect(sent.body.message.attachments[0]).not.toHaveProperty("storage_path");
    expect(db.tables.team_message_attachments).toHaveLength(3);

    const thread = await http(app, "GET", `/api/team-chat/channels/${DISPATCH}/messages`, undefined, as(RAFI));
    expect(thread.body.messages[0].attachments.map((a: { kind: string }) => a.kind)).toEqual(["image", "file", "voice"]);
    expect(thread.body.messages[0].attachments[0].url_expires_at).toEqual(expect.any(String));
  });

  it("takes the kind and size from the stored file, not from what the browser claims", async () => {
    const { app, objects } = fixture();
    const link = await upload(app, objects, { type: "image/png", size: 100 });
    objects.set(link.body.path, { size: 777, contentType: "image/png" });
    const sent = await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, { body: "x", attachments: [{ path: link.body.path, name: "a.png", duration_ms: 9 }] }, as(ME));
    expect(sent.body.message.attachments[0]).toMatchObject({ kind: "image", size: 777, duration_ms: null });
  });

  it("only attaches files the sender uploaded to this conversation", async () => {
    const { app, db, objects } = fixture();
    const rafis = await upload(app, objects, { type: "image/png", size: 10 }, RAFI);
    const elsewhere = await upload(app, objects, { type: "image/png", size: 10 }, ME, GENERAL);
    const send = (path: string) => http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, { body: "look", attachments: [{ path }] }, as(ME));
    expect((await send(rafis.body.path)).status).toBe(400);
    expect((await send(elsewhere.body.path)).status).toBe(400);
    expect((await send(`${folder(DISPATCH, ME)}../../${foreignOrg}/x.png`)).status).toBe(400);
    expect((await send(`${folder(DISPATCH, ME)}${uuid(5)}.png`)).status).toBe(400);
    expect(db.tables.team_messages).toHaveLength(0);
  });

  it("refuses a file that was never uploaded, repeats and more than ten files", async () => {
    const { app, objects } = fixture();
    const link = await upload(app, objects, { type: "image/png", size: 10 });
    const send = (attachments: unknown) => http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, { body: "", attachments }, as(ME));
    objects.delete(link.body.path);
    expect((await send([{ path: link.body.path }])).body.error).toMatch(/upload/i);
    objects.set(link.body.path, { size: 10, contentType: "image/png" });
    expect((await send([{ path: link.body.path }, { path: link.body.path }])).status).toBe(400);
    expect((await send(Array.from({ length: 11 }, () => ({ path: link.body.path })))).status).toBe(400);
    expect((await send("nope")).status).toBe(400);
    expect((await send([])).status).toBe(400);
  });

  it("does not attach the files twice when a send is retried", async () => {
    const { app, db, objects } = fixture();
    const link = await upload(app, objects, { type: "image/png", size: 10 });
    const body = { body: "", attachments: [{ path: link.body.path }], client_message_id: uuid(80) };
    await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, body, as(ME));
    const retry = await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, body, as(ME));
    expect(retry.status).toBe(201);
    expect(retry.body.message.attachments).toHaveLength(1);
    expect(db.tables.team_message_attachments).toHaveLength(1);
  });

  it("signs each file once while its link is fresh, so polling does not reload images", async () => {
    const { app, objects, signed } = fixture();
    const link = await upload(app, objects, { type: "image/png", size: 10 });
    await http(app, "POST", `/api/team-chat/channels/${DISPATCH}/messages`, { body: "", attachments: [{ path: link.body.path }] }, as(ME));
    const first = await http(app, "GET", `/api/team-chat/channels/${DISPATCH}/messages`, undefined, as(ME));
    const second = await http(app, "GET", `/api/team-chat/channels/${DISPATCH}/messages`, undefined, as(RAFI));
    expect(second.body.messages[0].attachments[0].url).toBe(first.body.messages[0].attachments[0].url);
    expect(signed.flat().filter((path) => path === link.body.path)).toHaveLength(1);
  });
});
