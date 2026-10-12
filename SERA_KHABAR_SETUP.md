# Sera Khabar — New Merchant Setup Handoff

> **For the AI agent:** Read this whole file before doing anything. It is the
> source of truth for this repo. It overrides any Mango Lover BD text in
> `CLAUDE.md`, `AGENTS.md` or `README.md` until Step 4 updates those files.
> Work through the steps in order, tick boxes as you go, and confirm with the
> user before any outward-facing action (pushing, deploying, DNS, production
> database changes).

Written 2026-10-12. Status at the time of writing: code copied and pushed;
nothing else has been set up yet.

---

## 0. What this is

This repo is a **copy of Merchant-Suite**, the order-management dashboard
originally built for the merchant **Mango Lover BD**. It is now being set up for
a **new, separate merchant: Sera Khabar**.

| | Mango Lover BD (DO NOT TOUCH) | Sera Khabar (this project) |
|---|---|---|
| Merchant Suite repo | `mangoloverbd/mangoloverbd_commerceos` | `serakhabarofficial/sera-khabar-commerceos` |
| Storefront repo | `mangoloverbd/mangoloverbd_storefront` | `serakhabarofficial/sera-khabar-storefront` |
| Local folder | `~/conductor/repos/mangoloverbd_commerceos` | `~/merchant-b/sera-khabar-commerceos` and `~/merchant-b/sera-khabar-storefront` |
| GitHub account | `noorkarimmehedi` / `mangoloverbd` | `serakhabarofficial` |
| Supabase | project `ldiktvcavyabivpxfwpn` | **new account + new project (not created yet)** |
| Vercel | Mango Lover's account | **new account (not created yet)** |
| Cloudflare | Mango Lover's account | **new account (not created yet)** |
| Suite domain | `admin.mangolover.com.bd` | TBD |
| Storefront domain | `www.mangolover.com.bd` | TBD |
| Storefront handle | `mangoloverbd` | TBD (e.g. `serakhabar`) |
| Order number prefix | `ML-` | TBD (e.g. `SK-`) |

Both repos were pushed from Mango Lover's latest code:
- Suite at commit `39c1899` (passed the lint/build pre-push hook)
- Storefront at commit `5c06ac6` (pushed with `--no-verify`, because the build
  needs `VITE_MERCHANT_SUITE_URL`, which doesn't exist yet)

## 1. Hard safety rules (Mango Lover is a live merchant)

1. **Never** read, edit, commit, or push anything in
   `~/conductor/repos/mangoloverbd_commerceos` or in any `mangoloverbd/*` repo.
2. **Never** use Mango Lover's Supabase project `ldiktvcavyabivpxfwpn`. The MCP
   configs in this copy have been changed to a placeholder
   (`SERA_KHABAR_SUPABASE_REF`), so the Supabase MCP will not connect until Step 3.
   Don't authenticate the Supabase MCP until the real Sera Khabar ref is in place.
3. **Never** copy any value from Mango Lover's `.env` or Vercel. Every key,
   token and secret for Sera Khabar must be new.
4. **GitHub account:** this machine has two `gh` accounts. Before any
   `git push` here, run `gh auth status`. The active account must be
   `serakhabarofficial` (`gh auth switch -u serakhabarofficial`). Check that
   `git remote -v` shows only `serakhabarofficial/...`.
5. **Vercel / Cloudflare / Supabase CLIs:** before any `vercel`, `wrangler` or
   `supabase` command, confirm the logged-in account is Sera Khabar's
   (`vercel whoami`, `wrangler whoami`, `supabase projects list`). If it
   shows Mango Lover's projects, stop and ask the user to log in to the new account.
6. A global pre-push hook (`ECC pre-push`) runs lint and build. Don't bypass it
   with `--no-verify` without the user's explicit OK.

## 2. Decisions to get from the user first

Ask the user for these before Step 3, and write the answers into the table above:

- [ ] Storefront **handle** (lowercase, no spaces), e.g. `serakhabar`
- [ ] **Order number prefix**, e.g. `SK-`
- [ ] **Brand name** (English + Bangla if used), logo files, brand colors
- [ ] **Domains**: storefront (e.g. `www.serakhabar.com`) and admin (e.g. `admin.serakhabar.com`)
- [ ] Facebook page URL, and whether Instagram/WhatsApp are used
- [ ] Courier: Steadfast and/or Pathao
- [ ] Google Tag Manager / GA4 IDs (or none for now)
- [ ] AI provider (OpenAI / OpenRouter / compatible)

---

## 3. Create the Sera Khabar Supabase project

The user does this in the browser with the **new** Supabase account:

- [ ] Create a project, region **Southeast Asia (Singapore)** (Vercel runs in `sin1`).
- [ ] Collect: Project URL, anon/publishable key, service_role key, pooler
      connection string (`*.pooler.supabase.com`), 20-character project ref.
- [ ] Auth → Providers → Email: turn **off** "Confirm email" (the app expects
      sign-up to log the user in straight away).

The agent then does this in this repo:

- [ ] Replace the placeholder `SERA_KHABAR_SUPABASE_REF` with the new ref in
      `.mcp.json`, `.codex/config.toml` and `opencode.json`, and replace
      `ldiktvcavyabivpxfwpn` in `supabase/config.toml`.
- [ ] Edit the order-number prefix **before** pushing the schema:
      `supabase/migrations/20260910170052_ml_order_numbering.sql`
      (and `20260910170607_harden_ml_order_number_allocator.sql`) use `ML-`.
      Change to the agreed prefix. Also grep `server/` and `src/` for `ML-`.
- [ ] `supabase login` (new account) → `supabase link --project-ref <NEW_REF>`
      → `supabase db push`. Apply **only** `supabase/migrations/`. Never
      apply `supabase/legacy-migrations/`.
- [ ] Create a local `.env` from `.env.example` with Sera Khabar values (never commit it).
- [ ] `npm run verify:supabase-project` passes.
- [ ] `supabase/functions/` has 11 edge functions. Check with the user whether
      any are still used before deploying them; the main backend is `server/index.js`.

## 4. Replace Mango Lover values in the Merchant Suite code

Hardcoded in this repo (found 2026-10-12). Replace each one with Sera Khabar's value:

| File | Mango Lover value | Replace with |
|---|---|---|
| `server/campaignLinks.js:4` | `https://www.mangolover.com.bd` | Sera Khabar storefront URL |
| `server/index.js` (~line 7034) | `https://www.mangolover.com.bd/go/_refresh` | Sera Khabar storefront URL |
| `server/index.js` (~lines 7246, 7279) | handle `"mangoloverbd"` | Sera Khabar handle |
| `server/campaignEvents.js:28` | handle `"mangoloverbd"` | Sera Khabar handle |
| `server/index.js` (~3122, 3164 and others) | "Mango Lover BD" in error text/comments | Sera Khabar |
| `index.html` | title, author, OG/Twitter tags, `admin.mangolover.com.bd` | Sera Khabar name + admin URL |
| `public/` | logos, favicon, `opengraph.png` | Sera Khabar branding |
| `CLAUDE.md`, `AGENTS.md`, `README.md`, `replit.md` | Mango Lover text, Supabase ref, repo names | Sera Khabar |
| `src/test/supabaseProjectPreflight.test.ts`, `src/test/productImagePipeline.test.ts` | Mango Lover ref / workspace id | update so tests pass |

Then:
- [ ] Final sweep: `grep -rniE "mangolover|mango lover|ldiktvcavyabivpxfwpn|3cd26e57" . --exclude-dir={node_modules,dist,.git}`
      Only historical `docs/`, `progress/` and `CHANGELOG.md` entries may remain.
- [ ] Also search the `src/` UI for hardcoded Mango Lover wording and brand copy.
- [ ] `npm run lint`, `npm test`, `npm run build` all pass.
- [ ] Commit (`chore: rebrand Merchant Suite for Sera Khabar`) and push as `serakhabarofficial`.

## 5. Deploy the Merchant Suite on Vercel (new Vercel account)

- [ ] Import `serakhabarofficial/sera-khabar-commerceos` into the **new** Vercel
      account. `vercel.json` already sets region `sin1`, the rewrites, and 3 crons.
- [ ] Set Production env vars (all new values; generate secrets with `openssl rand -hex 32`):
  - Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
    `SUPABASE_DB_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  - AI: `OPENAI_API_KEY` (or `AI_PROVIDER` + `OPENROUTER_API_KEY` / `AI_BASE_URL` + `AI_API_KEY`), `AI_MODEL`
  - Secrets (new, 32+ characters): `ORDER_PROTECTION_HASH_SECRET`, `STOREFRONT_CONTEXT_SECRET`,
    `CAMPAIGN_EDGE_SECRET`, `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`
  - `ORDER_PROTECTION_MODE=active`
  - Storefront provisioning: `VERCEL_ACCESS_TOKEN` (new Vercel account),
    `STOREFRONT_GIT_REPO=serakhabarofficial/sera-khabar-storefront`,
    `MERCHANT_SUITE_PUBLIC_URL`, `STOREFRONT_VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`
  - Optional: `TURNSTILE_SECRET_KEY`/`TURNSTILE_SITE_KEY`, `POSTHOG_*` (new PostHog project),
    `META_*`, `FIRECRAWL_API_KEY`, `FRAUDSHIELD_API_KEY`,
    `CLOUDFLARE_ZONE_ID`/`CLOUDFLARE_API_TOKEN`/`PUBLIC_DOMAIN`, `ADMIN_EMAIL(S)`
  - **Do not** set `UPSTASH_*` (not used).
- [ ] Deploy, open the URL and sign up. **The first account becomes admin.**
- [ ] Look up the new workspace id: `select org_id from user_roles;` (Sera Khabar
      Supabase only). The storefront needs it as `VITE_STOREFRONT_ID`.

## 6. Storefront: rebrand the code

Work in `~/merchant-b/sera-khabar-storefront` and follow
`SERA_KHABAR_SETUP.md` in that folder. In short, it hardcodes the Mango Lover
admin URL, storefront handle, workspace id, Supabase image host, GTM ID,
Bangla brand name and a generated Mango Lover product snapshot. Without these
changes **the Sera Khabar storefront would show Mango Lover's products and send
orders to Mango Lover**.

## 7. Provision and deploy the storefront

- [ ] In the Sera Khabar Suite, add or publish a few products.
- [ ] Settings → **Provision Storefront** (`POST /api/storefront/provision`).
      This creates a Vercel project from `STOREFRONT_GIT_REPO` and sets its env vars.
- [ ] In the storefront Vercel project, make sure these are set:
      `VITE_MERCHANT_SUITE_URL`, `MERCHANT_SUITE_URL`, `VITE_STOREFRONT_ID` (new
      org_id), `STOREFRONT_HANDLE`, `CUSTOM_ORDERS_API_KEY` (server-only),
      and **the same** `STOREFRONT_CONTEXT_SECRET`, `CAMPAIGN_EDGE_SECRET` and
      `CRON_SECRET` as the Suite. Add `VITE_TURNSTILE_SITE_KEY` if Turnstile is used.
- [ ] Place a test order on the storefront and confirm it shows up in the Suite.

## 8. Domains and Cloudflare (new Cloudflare account)

- [ ] Add the Sera Khabar domain to the new Cloudflare account and change the
      nameservers at the registrar.
- [ ] In Vercel: `admin.<domain>` → Suite project; `www.<domain>` and the bare
      domain → storefront project.
- [ ] In Cloudflare, add the DNS records Vercel shows, as **DNS only (grey cloud)**.
      **Never proxy `www` through Cloudflare**: the `/go` campaign redirects use
      Vercel middleware.
- [ ] Update `MERCHANT_SUITE_PUBLIC_URL`, `VITE_MERCHANT_SUITE_URL` and the
      storefront URLs to the final domains, then redeploy both projects.

## 9. Integrations (Suite → Settings, with Sera Khabar's own credentials)

- [ ] Steadfast and/or Pathao
- [ ] FraudShield
- [ ] Facebook / Instagram / WhatsApp (Sera Khabar page; new Meta app or webhook → new Suite URL)
- [ ] Shopify (if used)
- [ ] SMS (if used)
- [ ] Invite staff via Assign role

## 10. Final checklist

- [ ] `git remote -v` in both folders shows only `serakhabarofficial/...`
- [ ] No Mango Lover URL, handle, workspace id or Supabase ref is left in the runtime code of either repo
- [ ] Test order: storefront → Suite → courier works
- [ ] Changing a product price in the Suite updates the storefront without a redeploy
- [ ] Mango Lover's dashboard and storefront are still working and unchanged
- [ ] `gh auth switch -u noorkarimmehedi` when finished, if the user also works on Mango Lover
