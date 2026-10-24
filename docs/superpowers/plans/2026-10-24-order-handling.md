# Order Handling Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Backend persistence and frontend work have separate ownership; review their combined behavior before completion.

**Goal:** Prevent simultaneous staff processing while keeping orders readable across the three approved workflows.

**Architecture:** An atomic service-role PostgreSQL RPC owns reservations. Express guards existing mutation handlers, and a shared React hook coordinates per-tab ownership, inactivity, and view-only UI.

**Tech Stack:** PostgreSQL, Supabase RPC, Express, React, TanStack Query, Framer Motion, Vitest.

## Global Constraints

- Fixed Sera Khabar workspace; resolve organization and user from authenticated server helpers.
- Five minutes without user activity releases ownership; no administrator override.
- Preserve unsaved drafts after ownership loss. Status polling never claims.
- All authenticated frontend calls use apiFetch; no new dependencies required.
- No production migration, external resource changes, push, PR, or deployment without explicit approval.
- Preserve unrelated `2026-10-24-fraudshield-auto-check.md` work.

## Task 1: Atomic reservation persistence

Files: additive `supabase/migrations/*_order_handling.sql`, `scripts/verify-supabase-baseline.mjs`, executable disposable-Postgres tests.

- [ ] Write failing SQL tests for two owners, same-user different-tab conflicts, five-minute idle expiry, heartbeat disconnect expiry, stale release, review/checkout/order identity, and workspace isolation.
- [ ] Implement `order_handling(p_org,p_user,p_session,p_resources,p_action,p_active,p_operation)` with acquire/heartbeat/status/release and begin_write/end_write actions. Use sorted locking and all-or-nothing multi-resource claims. Token-matched operation cleanup must survive source-record deletion/conversion.
- [ ] Run SQL tests including concurrent connections and privilege checks. Register new tables in the baseline contract and run `PG_BINDIR=/opt/homebrew/opt/postgresql@18/bin npm run verify:supabase-baseline`.

## Task 2: Server API and mutation guard

Files: `server/orderHandling.js`, `server/index.js`, `src/test/orderHandlingServer.test.ts`.

- [ ] Write failing behavioral HTTP tests with real Express, injected auth and RPC boundaries: unauthenticated denied; invalid UUID/action denied; arbitrary org ignored; conflict blocks handler; successful operation releases token; cleanup failure does not erase response; unknown resources fail closed.
- [ ] Implement validated status endpoint inside server/index.js and standalone domain helpers/middleware. Mutation target resolver covers existing order/abandoned/review edits, bulk status/delete/follow-up, order calls, SMS, courier and AI actions. Activity-view and printing observations do not reserve.
- [ ] Use `X-Order-Handling-Session`, authenticated user, fixed org, and server-generated operation UUID; reject complete conflicted batches before handler invocation. Keep operation claims until handler completion and clean up on finish, not client disconnect.
- [ ] Run `npx vitest run src/test/orderHandlingServer.test.ts` and related route suites. Review all write-entry coverage against route audit.

## Task 3: Detail presence and view-only interface

Files: `src/lib/orderHandling.ts`, `src/hooks/useOrderHandling.ts`, `src/components/orders/OrderHandlingNotice.tsx`, `src/lib/api.ts`, Orders/Abandoned detail and Protection queue components, behavioral React tests.

- [ ] Write failing hook/component tests: initial acquisition, busy warning, explicit viewing, idle demotion, expiry with retained draft, unavailable API, clean unmount/StrictMode, and late async responses.
- [ ] Implement per-tab session header, lifecycle-safe handling actions, actual-user-input activity, heartbeat/status intervals, and conflict demotion. Require explicit restart after losing ownership.
- [ ] Add accessible animated dialog and persistent banner. Disable all mutation and external contact controls while checking/view-only/error. Keep reading/copy/navigation available. Refetch before clean handoff; keep dirty drafts with visible warning and optimistic concurrency protection.
- [ ] Open only one Protection review workspace at a time. Do not acquire all queue rows. Release on close/entry switch.
- [ ] Run focused React tests and inspect desktop/mobile browser behavior.

## Task 4: Review and verification

- [ ] Review combined implementation for authorization, org guards, stale ownership, linked conversion, operation lifetime, and bypass paths. Address findings with regression tests.
- [ ] Run full `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`; distinguish baseline failures from regressions.
- [ ] Complete local browser QA using mock API fixtures rather than production writes. Record deployment requirement: reviewed additive DB migration before application rollout.
- [ ] Report final changes, evidence, and remaining deployment approval; leave all work local.

## GSTACK REVIEW REPORT

| Runs | Status | Findings |
| --- | --- | --- |
| Architecture | Reviewed | Database authority and write reservations required for multi-instance correctness. |
| Code quality | Reviewed | Keep routes in index.js; isolate reusable domain enforcement and shared frontend state. |
| Tests | Planned | Real disposable PostgreSQL tests plus HTTP/React behavior and browser QA. |
| Performance | Reviewed | Poll only active detail/review; batch guard uses one atomic multi-resource call. |

VERDICT: Proceed within the approved design; no remote mutation is authorized.

NO UNRESOLVED DECISIONS
