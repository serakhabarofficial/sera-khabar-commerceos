# Order handling presence

## Approved behavior

Opening an order's details reserves it for that teammate. Another teammate opening the same record sees a smooth warning with the handler's name and can continue in view-only mode or return to the list. Editing, calling, messaging, conversion, approval, rejection, courier dispatch, and other staff processing actions are unavailable to the viewer. Copying and reading remain available. There is no administrator takeover.

Apply this to Orders, Abandoned Checkouts, and individual Order Protection reviews. Merely showing rows in a table never claims them. Protection currently displays full reviews inline, so an explicit individual review workspace starts handling; it must not reserve the entire queue. Linked reviews and abandoned checkouts share reservations. Converted checkouts resolve to their resulting order.

Leaving details releases handling. Five minutes without user input also releases it. Heartbeats alone do not count as activity. A disconnected or closed browser expires after a short heartbeat grace period, without requiring successful unload delivery. Returning to an expired page does not automatically take ownership: staff explicitly start handling again. If another teammate owns it, the old page stays view-only. Retain unsaved drafts when ownership is lost; do not overwrite them through background refresh. Existing order version checks still protect against stale saves.

## Persistence and enforcement

Use a service-role-only PostgreSQL reservation table and atomic RPC. Never use process memory as the authority: production runs across Vercel instances. Requests resolve user and fixed workspace server-side; clients cannot select an organization or impersonate a handler. Per-tab session UUIDs distinguish the same user's multiple tabs. Return only a display name, status, and expiration to the frontend.

    Details open -> authenticated acquire RPC -> handling OR view-only
    User input -> heartbeat with activity -> renew idle deadline
    Poll / passive heartbeat -> observe / maintain connectivity only
    Navigation / idle -> release -> explicit next handler
    Mutation -> atomic begin_write -> existing handler -> end_write

Mutation reservations also protect table/bulk actions and side effects. Atomically reserve the complete target set before running any handler; reject a conflicted batch before any side effect. A write in flight cannot be released by navigation or superseded by a new handler. Operation reservations have a bounded crash timeout and token-matched cleanup. Automated storefront capture, integrations, and webhook updates are outside staff ownership and keep their current correctness checks.

Missing migration or unavailable persistence fails closed for protected staff operations. No startup DDL, automatic production migration, deployment, push, or PR creation is authorized by implementation approval. Ship the additive migration and document the deployment order.

## Interface

POST `/api/order-handling/:kind/:id`, kind `order`, `abandoned`, or `review`.
Body: `{action: 'acquire'|'heartbeat'|'status'|'release', session_id: UUID, active?: boolean}`.
Response: `{status: 'handling'|'view_only'|'available', holder: null|{name: string}, expires_at: string|null}`.
All `apiFetch` calls attach `X-Order-Handling-Session` for matching mutation ownership. Conflicts return HTTP 409 and `ORDER_HANDLING_CONFLICT`; unavailable persistence returns HTTP 503. Viewer status polling never acquires ownership. Poll status about every ten seconds and renew handler connectivity every fifteen seconds; use a local idle deadline for immediate demotion.

## Presentation and verification

Use Geist, warm off-white, Phosphor light icons, and Framer Motion with a short ease-out opacity/transform transition, reduced-motion support, and accessible dialog focus. Use the approved mockup's one-time warning followed by a persistent status banner. Availability alone does not enable editing.

Test actual SQL concurrency, idle and heartbeat expiry, stale release, multi-resource atomicity, grants, canonical links, and in-flight writes. Test HTTP authorization, scoped resource selection, batch rejection, calls/SMS/courier/AI entry points, and failure behavior. Test browser lifecycle, inactivity, network failures, retained drafts, disabled controls, and explicit handoff. Run the migration baseline, Vitest, lint, TypeScript, build, and local browser QA before reporting completion.
