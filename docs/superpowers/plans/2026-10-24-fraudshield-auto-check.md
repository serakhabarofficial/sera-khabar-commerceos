# FraudShield automatic checks — plan

Date: 2026-10-24 · Status: agreed, not started

## In simple words

Every new order from the **website**, a **converted incomplete order**, or an
**approved Order Protection order** gets its risk shown automatically. Orders
made on the **Create New Order** page keep the check that page already did.

FraudShield requests are spent carefully:

- A customer checked in the last 30 days → reuse that result. **Free.**
- A new customer → **1 request**. The same customer ordering again → free.
- No fixed daily number. Spending follows how many new orders arrive.
- Automatic checks stop while **100 or fewer** requests are left today, so staff
  can always check by hand.
- If we can't read how many requests are left → **don't** check automatically.
- If FraudShield is down → wait **1 hour** before trying that customer again
  (already how the cache works).
- No timer or background job spends requests. The fraud-warm cron stays off.

## What happens today (the gaps)

| Where the order comes from | Today | After |
|---|---|---|
| Website (storefront) | Checked in background, but ignores the 100 reserve | Checked, respects the reserve |
| Incomplete order → converted | Saved with `fraud_checked:false`, never checked | Checked automatically |
| Order Protection → approved | Never checked | Checked automatically |
| Create New Order page | Checked while typing, but result **not saved** on the order; every valid number typed spends a request | Saved result copied on create (free); check waits until typing stops |
| Manual orders from elsewhere / webhook | Not checked | Unchanged (free cache copy only) |
| Order editor "check" | Result written to cache only, not the order | Also written onto the order |
| Orders table single "Check" | Always forces a new request | Uses fresh cache first; **Retry** still forces |

## Tasks

### 1. One shared server helper — `ensureOrderFraudCheck`

File: `server/index.js`, next to `checkStorefrontOrderFraud` (~line 12551).

```
ensureOrderFraudCheck(supabase, orgId, orderId, phone, { allowSpend })
```

1. `normalizeBdPhone(phone)`; bail if invalid.
2. Read `fraud_checks` cache (`readFraudCache`). If fresh (`cacheState` is
   fresh, or an error younger than 1 hour) → copy `summary` onto the order and
   stop. **No request.**
3. If `allowSpend` is false → stop (order shows "Check").
4. Read `readFraudUsage(orgId)` (already memoised for 5 min). If
   `!shouldWarm(usage, FRAUD_QUOTA_RESERVE)` → stop. Fails closed when unknown.
5. `runFraudCheck(..., force=false)`; on `spentRequest` call
   `incrementUsage`. If the row has a `summary`, update the order
   (`fraud_checked:true, fraud_data: summary`) filtered by `id` **and**
   `org_id`.
6. Fire-and-forget: never throws, never delays the response; log a warning on
   failure.

Replace `checkStorefrontOrderFraud`'s body with a call to this helper
(`allowSpend: true`) so the website path gains the reserve guard.

Note: two orders from the same new phone at the same moment could both spend.
`resolveFraudCheck` already has a pending-claim (`FRAUD_PENDING_CLAIM_SECONDS`);
confirm it covers this, and add a test.

### 2. Call it from every automatic order path

| Path | Location | Call |
|---|---|---|
| Website order | `checkStorefrontOrderFraud` call ~line 16760 | `allowSpend: true` (via task 1) |
| Incomplete order converted | `POST /api/abandoned-checkouts/:id/convert` (~line 8015), after the order insert succeeds | `allowSpend: true` |
| Order Protection approved | `approveHeldProtectionReview` (~line 15925), after the order insert at ~16047 succeeds (not on rollback) | `allowSpend: true` |
| `POST /api/orders` (Create New Order page, other manual) | after insert (~line 10817) | `allowSpend: false` — cache copy only |
| Custom webhook orders | after insert | `allowSpend: false` |

### 3. Create New Order page

- Server: `POST /api/orders` must **stop trusting** `fraud_checked` /
  `fraud_data` from the client (remove them from the allowed field list) and
  rely on the task-2 cache copy instead. The workspace guard and auth stay as
  they are.
- `src/pages/NewOrder.tsx` (~line 252): debounce the auto-check by ~800 ms
  after the phone becomes valid, so a typo that briefly forms a valid number
  doesn't spend a request. Keep `force:false`.
- Remove `fraud_checked: false` from the create payload (~line 323).

### 4. Orders table single "Check" uses the cache first

- `POST /api/check-fraud` (~line 12665): change the default to
  `req.body?.force === true` (matches `/api/fraud/check`).
- `src/components/OrdersTable.tsx` (~line 946): the "Check" button sends
  `force:false`; the **Retry** button (shown after an error) sends `force:true`.

### 5. Order editor check also updates its order

`POST /api/fraud/check` only writes the cache. Accept an optional `orderId`;
when given and the check returns a `summary`, update that order filtered by
`id` and `org_id`. Pass `orderId` from the order editor's FraudPanel re-check.
(Without `orderId`, behaviour is unchanged — e.g. the New Order page.)

### 6. One-off backfill (free)

A script (or a guarded internal route) that, for the Sera Khabar `org_id`
only, finds orders with `fraud_checked = false` whose normalised phone has a
fresh `ok` row in `fraud_checks`, and copies the `summary` on. No FraudShield
calls. Run once; report how many were filled (about 19 expected).

### 7. Leave alone

- `/api/internal/fraud-warm` stays disabled (410).
- Order Protection's own risk assessment stays cache-only.
- No new tables or migrations.

## Tests

- Helper: fresh cache → copies, no spend; stale + `allowSpend:false` → no
  spend; usage unknown → no spend; usage ≤ 100 remaining → no spend;
  usage > 100 → spends once, updates the order; error row < 1 h → no spend.
- Wiring tests (source-section style, like `fraudRouteWiring.test.ts`): each
  path from task 2 calls the helper with the right `allowSpend`; every order
  update keeps `.eq("org_id", orgId)`.
- `/api/orders` ignores client `fraud_data`.
- `/api/check-fraud` defaults to no force; OrdersTable Check vs Retry send the
  right flag.
- NewOrder debounce: typing two valid numbers quickly fires one check.
- Run `npm test`, `npm run lint`, `npm run build`.

## Done when

- A new website, converted-incomplete, or approved-protection order shows its
  Risk pill without anyone clicking, for a repeat customer instantly and for
  a new customer within seconds (if more than 100 requests remain).
- An order made on Create New Order shows the Risk pill immediately.
- No path spends a request for a phone that has a fresh cached result.
