# Team Inbox: photos, documents and voice messages

Staff can send photos, documents and recorded voice messages in Team Inbox
channels and DMs. In-app calling was considered and dropped.

## What staff get

- **Photos** (JPEG, PNG, WebP, GIF) shown inline, opened full size in a new tab.
- **Documents** (PDF, Word, Excel, CSV, plain text) shown as a file card that
  downloads with its original name.
- **Voice messages** recorded in the composer (tap the mic, tap send), up to
  five minutes, played back in the bubble.
- Up to 10 files per message, 20 MB each. A caption is optional.
- Files arrive by the paperclip, paste, or drag and drop (already built into
  the Arc chat thread, previously switched off).
- The conversation list previews attachment-only messages as "Photo",
  "Voice message" or the file name.

## Design

- **Private bucket `team-attachments`**, created by migration with a 20 MB
  limit and an allow-list of MIME types. Nothing in it is public.
- **Browser uploads straight to Storage.** Vercel functions accept about
  4.5 MB per request, so the server hands out a signed upload URL instead of
  receiving the bytes: `POST /api/team-chat/channels/:id/uploads` checks
  membership, type and size and returns a path under
  `{org}/{channel}/{user}/{uuid}.{ext}` with a one-time upload URL.
- **Sending** posts the paths with the message. The server only accepts paths
  in the sender's own folder for that channel, reads each object's real size
  and type from Storage, derives the kind (image / file / voice) from that
  type, and saves the message and its attachments in one transaction through
  `team_chat_post_message`. Retried sends stay idempotent by client message id.
- **Reading** signs attachment URLs for six hours. Signed URLs are cached on
  the server and the client keeps the first URL it saw until it nears expiry,
  so the 2.5 s thread poll never reloads images.
- `team_messages.body` may now be empty when the message has attachments.
- Workspace guard: every query filters by the resolved `org_id`; paths are
  prefixed by it; the client never names an org.

## Steps

1. Shared rules (`shared/teamChat.js`): limits, MIME → kind, file name
   cleanup → unit tests.
2. Migration: bucket, `team_message_attachments`, relaxed body check,
   `team_chat_post_message`, summaries preview → `verify:supabase-baseline`.
3. Server routes: upload URL, send with attachments, attachments in thread →
   route tests in `teamChatRoute.test.ts`.
4. Chat thread: audio attachment player, voice recorder in the composer.
5. Team Inbox page: upload then send, optimistic previews, stable URLs.
6. `npm test`, `npm run lint`, `npm run build`, then browser QA.

## Not included

- Deleting messages or attachments (messages cannot be deleted today).
- Cleaning up files that were uploaded but never sent.
- In-app calling.
