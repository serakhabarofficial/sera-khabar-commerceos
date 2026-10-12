# Sera Khabar (সেরা খাবার) — Complete New-Merchant Setup Guide

> ## 🤖 Instructions for the AI agent (read first)
>
> 1. This file is the **source of truth** for this project. It overrides any
>    Mango Lover BD text in `CLAUDE.md`, `AGENTS.md`, `README.md` or `replit.md`
>    until Phase 4 rewrites those files.
> 2. Work **one phase at a time, in order**. At the start of every session, look
>    at the **Progress tracker** below to see where you are.
> 3. Before each phase, tell the user in plain, simple English what you are about
>    to do and what you need from them. The user isn't deeply technical. Keep
>    explanations short and clear.
> 4. **Ask before** any outward-facing or hard-to-undo action: `git push`,
>    deploying, `supabase db push`, changing DNS, creating cloud projects, or
>    setting production env vars.
> 5. After finishing a phase, tick its boxes in this file and update the Progress
>    tracker. Commit with `docs: update Sera Khabar setup progress` (push only
>    after the account check in Rule S4).
> 6. **Never** put secrets (keys, tokens, passwords) in this file or in any
>    committed file. Secrets go only in `.env` (git-ignored) and in the Vercel dashboard.
> 7. Follow the safety rules (S1–S8) at every step. Mango Lover BD is a **live
>    business** that runs on the same original code.

---

## Progress tracker

| Phase | Name | Status |
|---|---|---|
| 0 | Code copied to Sera Khabar GitHub | ✅ Done (2026-10-12) |
| 1 | Local setup and account checks | ✅ Done (2026-10-12) |
| 2 | Collect decisions from the user | 🟡 In progress (2.1–2.8 done) |
| 3 | Create the Sera Khabar Supabase project and database | ⬜ Not started |
| 4 | Rebrand the Merchant Suite code | ⬜ Not started |
| 5 | Deploy the Merchant Suite on Vercel | ⬜ Not started |
| 6 | First admin login and workspace setup | ⬜ Not started |
| 7 | Rebrand the storefront code | ⬜ Not started |
| 8 | Provision and deploy the storefront | ⬜ Not started |
| 9 | Domains and Cloudflare | ⬜ Not started |
| 10 | Integrations (courier, fraud, Meta, SMS…) | ⬜ Not started |
| 11 | End-to-end testing and go-live | ⬜ Not started |

---

## Key facts

| | Mango Lover BD — ⛔ DO NOT TOUCH | Sera Khabar — ✅ this project |
|---|---|---|
| Merchant Suite repo | `mangoloverbd/mangoloverbd_commerceos` | `serakhabarofficial/sera-khabar-commerceos` |
| Storefront repo | `mangoloverbd/mangoloverbd_storefront` | `serakhabarofficial/sera-khabar-storefront` |
| Local folder | `~/conductor/repos/mangoloverbd_commerceos` | `/Users/noorkarimmehedi/Sera Khabar - সেরা খাবার/` (contains `sera-khabar-commerceos/` and `sera-khabar-storefront/`) |
| GitHub account | `noorkarimmehedi` / `mangoloverbd` | `serakhabarofficial` |
| Supabase | project `ldiktvcavyabivpxfwpn` | new account and new project — ref: `xnuiaxygeoydtopvcmli` |
| Vercel | Mango Lover's account | new account — team `serakhabarofficial-6832` (`team_d5c0Y4idD8xCTKpDyV5WgLmk`) |
| Cloudflare | Mango Lover's account | new account — `serakhabarofficial@gmail.com` |
| Admin (Suite) domain | `admin.mangolover.com.bd` | `admin.serakhabar.com` |
| Storefront domain | `www.mangolover.com.bd` | `www.serakhabar.com` — domain already owned (registrar Cloudflare, expires 2027-11-29) but in a different Cloudflare account; currently runs the old WordPress/WooCommerce shop. User will move it later (Phase 9). |
| Storefront handle | `mangoloverbd` | `serakhabar` |
| Order number prefix | `ML-` | `SK-` (first order `SK-1001`) |
| Contact | — | phone `01310-980289`, WhatsApp `+8801303103540`, email `serakhabar518@gmail.com`, Rajshahi |
| Facebook page | `WeAreMangoLover` | `https://www.facebook.com/profile.php?id=100068711778004` |
| Courier | — | Steadfast only |
| Workspace id (`org_id`) | `3cd26e57-85ef-4970-94a4-cd99c0f1b554` | `________` (created in Phase 6) |

Origin of the code: Suite copied from Mango Lover commit `39c1899`, storefront from
`5c06ac6`. The storefront was pushed with `--no-verify` because its build needs
`VITE_MERCHANT_SUITE_URL`, which doesn't exist yet.

The path contains spaces and Bangla characters. **Always quote it** in shell commands:
```bash
BASE="/Users/noorkarimmehedi/Sera Khabar - সেরা খাবার"
cd "$BASE/sera-khabar-commerceos"
```

---

## Safety rules (apply to every phase)

- **S1. Never touch Mango Lover.** Don't read, edit, commit or push anything in
  `~/conductor/repos/mangoloverbd_commerceos`, `~/merchant-b` (old temporary copy;
  may already be deleted), or any `mangoloverbd/*` GitHub repo.
- **S2. Never use Mango Lover's Supabase** (`ldiktvcavyabivpxfwpn`). The MCP configs
  here use the placeholder `SERA_KHABAR_SUPABASE_REF`. Don't authenticate the
  Supabase MCP until Phase 3 has put the real Sera Khabar ref in.
- **S3. Never reuse Mango Lover secrets.** Every key, token and secret for Sera
  Khabar must be newly created. Never read Mango Lover's `.env` or Vercel env vars.
- **S4. GitHub account check before every push:**
  ```bash
  gh auth status                              # active account must be serakhabarofficial
  gh auth switch -u serakhabarofficial        # if not
  git remote -v                               # must show only serakhabarofficial/...
  ```
  This Mac has two `gh` accounts. When you finish a session, switch back with
  `gh auth switch -u noorkarimmehedi` (the user's Mango Lover account).
- **S5. Cloud CLI account check before any command:**
  - `vercel whoami` → must be the Sera Khabar Vercel account
  - `supabase projects list` → must show only Sera Khabar projects, not `ldiktvcavyabivpxfwpn`
  - `wrangler whoami` → must be the Sera Khabar Cloudflare account

  If any of them shows Mango Lover, **stop** and ask the user to log in to the
  new account (`! vercel login`, `! supabase login`, `! wrangler login`).
- **S6. Don't bypass the pre-push hook** (`ECC pre-push` runs lint, test and build)
  with `--no-verify` unless the user explicitly says OK for that push.
- **S7. Never commit `.env`.** It's in `.gitignore`; keep it that way.
- **S8. Single merchant.** Sera Khabar is its own separate single-tenant deployment.
  Don't add multi-merchant features. Keep the existing `org_id` guards in the code.

---

## Phase 1 — Local setup and account checks

Goal: both folders ready to work in, with the right accounts logged in.

- [x] 1.1 Confirm the folder and remotes:
  ```bash
  BASE="/Users/noorkarimmehedi/Sera Khabar - সেরা খাবার"
  git -C "$BASE/sera-khabar-commerceos" remote -v
  git -C "$BASE/sera-khabar-storefront" remote -v
  ```
  Both must show `serakhabarofficial/...` only.
- [x] 1.2 Check the Node version (`.nvmrc`); Node 20+ is required.
- [x] 1.3 Install dependencies in both folders (the pre-push hook needs them):
  ```bash
  cd "$BASE/sera-khabar-commerceos" && npm ci
  cd "$BASE/sera-khabar-storefront" && npm ci
  ```
- [x] 1.4 GitHub: `gh auth status`. Both accounts should be listed. Switch to
      `serakhabarofficial` only when pushing (Rule S4).
- [x] 1.5 Ask the user whether they've **created** the new Supabase, Vercel and
      Cloudflare accounts yet. If not, list what to create:
  - Supabase: https://supabase.com (sign up with Sera Khabar's email)
  - Vercel: https://vercel.com (connect it to the `serakhabarofficial` GitHub account)
  - Cloudflare: https://dash.cloudflare.com
- [x] 1.6 (Done via MCP: Supabase, Vercel and Cloudflare MCPs verified on Sera Khabar accounts 2026-10-12; `supabase`/`wrangler` CLIs not installed — use MCP instead.) Check whether the CLIs are installed (`supabase --version`, `vercel --version`,
      `wrangler --version`) and logged in to the **new** accounts (Rule S5).
      The browser dashboards are fine too; CLIs are optional except `supabase`.

✅ Done when: both folders have `node_modules`, remotes are correct, and the user has the 3 new accounts.

---

## Phase 2 — Collect decisions from the user

Ask in simple English, one small group at a time. Write the answers into the
**Key facts** table above (no secrets).

- [x] 2.1 **Brand name**: English (`Sera Khabar`) and Bangla (`সেরা খাবার`), and the exact spelling to show customers.
- [x] 2.2 **Storefront handle**: lowercase letters, numbers and hyphens, e.g. `serakhabar`.
      It appears in API URLs (`/api/public/v1/<handle>/...`) and can't easily change later.
- [x] 2.3 **Order number prefix**, e.g. `SK-` (Mango Lover uses `ML-`).
- [x] 2.4 **Domains**: storefront (e.g. `www.serakhabar.com`) and admin (e.g.
      `admin.serakhabar.com`). Is the domain already bought? At which registrar?
- [x] 2.5 (Full logo `brand-assets/Sera Khabar Leaf Logo.webp`, 1774×887; leaf mark already in Suite `public/brand/sera-khabar-mark.webp`; colours green `#015128`, orange `#FD8300`.) **Logo and branding**: logo files (SVG/PNG), favicon, brand colors, OG
      share image. Ask the user to put them in `$BASE/brand-assets/`.
- [x] 2.6 (Rajshahi seasonal foods, from the old serakhabar.com: mangoes — Katimon, Fazli, Gourmoti, Haribhanga, Gobindovog, BARI-11 — in 6/10/12/20/22/24 kg boxes; aam-shotto/achar; kumro bori; khejur gur combos and patali; taler gur. Most items seasonal/out of stock.) **What they sell**: product types. Mango Lover's storefront has
      Mango-Lover-specific product pages and landing pages that must be removed or replaced (Phase 7).
- [x] 2.7 (Steadfast) **Courier**: Steadfast, Pathao, or both.
- [x] 2.8 (Facebook page above; WhatsApp +8801303103540; Instagram unknown) **Social**: Facebook page URL; whether Instagram and/or WhatsApp Business are used.
- [ ] 2.9 **Analytics**: Google Tag Manager / GA4 IDs (or none for now); PostHog (optional).
- [ ] 2.10 **AI provider**: OpenAI (simplest), OpenRouter, or another compatible provider.
- [ ] 2.11 **Shopify**: used or not (usually not; products are added in the Suite).
- [ ] 2.12 **SMS provider** if they want order SMS.

✅ Done when: the Key facts table is filled in (except the Supabase ref, Vercel and workspace id).

---

## Phase 3 — Create the Supabase project and database

### 3A. The user creates the project (browser, NEW Supabase account)
- [ ] 3.1 New project. Name: `sera-khabar`. Region: **Southeast Asia (Singapore)**
      (Vercel functions run in `sin1`). Save the database password in a password manager.
- [ ] 3.2 From **Project Settings → API / Data API**, collect (the user pastes them
      into `.env` themselves, or gives them privately; never commit them):
  - Project URL `https://<ref>.supabase.co`
  - anon / publishable key
  - service_role / secret key
  - Project ref (20 characters) → write it in the Key facts table (not a secret)
- [ ] 3.3 From **Connect → Connection string → Transaction pooler**: the URI with
      host `*.pooler.supabase.com` (**not** `.co`) → `SUPABASE_DB_URL`.
- [ ] 3.4 **Authentication → Sign In / Providers → Email**: turn **off** "Confirm email"
      (the app expects sign-up to log the user in straight away).
- [ ] 3.5 **Authentication → URL Configuration**: Site URL = the Suite URL
      (update again after Phases 5 and 9).

### 3B. The agent wires this repo to the new project
- [x] 3.6 Replace the placeholder with the real ref:
  ```bash
  cd "$BASE/sera-khabar-commerceos"
  NEW_REF=<ref>
  sed -i '' "s/SERA_KHABAR_SUPABASE_REF/$NEW_REF/g" .mcp.json .codex/config.toml opencode.json
  sed -i '' "s/ldiktvcavyabivpxfwpn/$NEW_REF/g" supabase/config.toml
  ```
  Do the same in the storefront's `.mcp.json` and `.codex/config.toml`.
- [ ] 3.7 Create `.env` from `.env.example` with the Sera Khabar values from 3.2–3.3
      (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
      `SUPABASE_DB_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- [ ] 3.8 `npm run verify:supabase-project` must pass (it checks every config file
      points at the same ref as `SUPABASE_URL`).
- [ ] 3.9 **Order number prefix, before pushing the schema.** These migrations use `ML-`:
  - `supabase/migrations/20260910170052_ml_order_numbering.sql`
  - `supabase/migrations/20260910170607_harden_ml_order_number_allocator.sql`

  Replace `ML-` with the chosen prefix (keep the regex shapes intact, e.g.
  `'^SK-([0-9]+)$'`). Then `grep -rn "ML-" server src shared` and update any code
  or tests that build or parse `ML-` numbers. Ask the user what the first order number
  should be (check the sequence start value in the migration).
- [ ] 3.10 Link and push the schema (ask the user first; Rule S5 check first):
  ```bash
  supabase login                      # NEW Supabase account
  supabase projects list              # must NOT show ldiktvcavyabivpxfwpn
  supabase link --project-ref $NEW_REF
  npm run verify:supabase-baseline    # optional pre-check, if it works locally
  supabase db push                    # applies supabase/migrations/* only
  ```
  **Never** apply `supabase/legacy-migrations/`.
- [ ] 3.11 Verify: in the Supabase table editor, the tables `orders`, `products`,
      `app_settings`, `user_roles`, `social_conversations` etc. exist, and the
      Storage bucket `product-images` exists (created by the canonical migration).
- [ ] 3.12 Authenticate the Supabase MCP (`/mcp` → supabase → Authenticate) with the
      **new** Supabase account, and check it lists the Sera Khabar project.
- [ ] 3.13 Run the Supabase security advisor (MCP `get_advisors`) and report any issues.
- [ ] 3.14 `supabase/functions/` has 11 legacy edge functions (`ai-alerts`,
      `analyze-orders`, `check-fraud`, …). The main backend is `server/index.js`.
      **Don't deploy them** unless the user confirms they're needed.

✅ Done when: schema pushed, `verify:supabase-project` passes, the MCP points at Sera Khabar.

---

## Phase 4 — Rebrand the Merchant Suite code

Work in `$BASE/sera-khabar-commerceos`. Make a branch: `git checkout -b chore/sera-khabar-rebrand`.

### 4A. Runtime values (these must change, or features break or point at Mango Lover)
| File | Mango Lover value | Change to |
|---|---|---|
| `server/campaignLinks.js:4` | `STOREFRONT_ORIGIN = "https://www.mangolover.com.bd"` | Sera Khabar storefront URL |
| `server/index.js` (~line 7034) | `fetch("https://www.mangolover.com.bd/go/_refresh"` | Sera Khabar storefront URL |
| `server/index.js` (~lines 7246, 7279) | `receipt.handle === "mangoloverbd"` | Sera Khabar handle |
| `server/campaignEvents.js:28` | `value.handle !== "mangoloverbd"` | Sera Khabar handle |
| `server/index.js` (~3122, 3164, 9845) | "Mango Lover BD" in error text/comments | "Sera Khabar" |
| `index.html` | `<title>`, author, OG/Twitter tags, `https://admin.mangolover.com.bd/` | Sera Khabar name and admin URL |
| `public/` | logo, favicon, `opengraph.png` | Sera Khabar assets from `$BASE/brand-assets/` |

Tip: for the handle and storefront URL, a single constant or env var is cleaner
than many literals, but keep the change small (CLAUDE.md §13.3 "Surgical changes").

### 4B. UI text
- [ ] 4.1 `grep -rniE "mango ?lover|ম্যাংগো" src` and replace user-visible text
      (sidebar, login page, headers, emails, SMS templates, AI prompts).
- [ ] 4.2 Check server-side AI prompts, SMS and message templates in `server/` for the brand name.

### 4C. Docs and agent instructions
- [ ] 4.3 Rewrite `CLAUDE.md`, `AGENTS.md`, `README.md` and `replit.md` for Sera Khabar:
      brand name, repos, Supabase ref, Facebook page, domains. Keep the technical rules
      (auth, `apiFetch`, `org_id` guard, design rules). Keep the top banner pointing to
      this file until Phase 11 is done.

### 4D. Tests
- [ ] 4.4 Update tests that hardcode Mango Lover values:
      `src/test/supabaseProjectPreflight.test.ts`, `src/test/productImagePipeline.test.ts`,
      and any that fail after the changes.

### 4E. Verify and push
- [ ] 4.5 Sweep. Only historical `docs/`, `progress/` and `CHANGELOG.md` may still match:
  ```bash
  grep -rniE "mangolover|mango lover|ম্যাংগো|ldiktvcavyabivpxfwpn|3cd26e57" . \
    --exclude-dir={node_modules,dist,.git,docs,progress} --exclude=CHANGELOG.md
  ```
- [ ] 4.6 `npm run lint`, `npm test`, `npm run build` all pass.
- [ ] 4.7 Commit `chore: rebrand Merchant Suite for Sera Khabar`. Rule S4 check, then
      push the branch and merge to `main` (ask the user: PR or direct merge).

✅ Done when: the sweep is clean, checks pass, and `main` on GitHub has the rebrand.

---

## Phase 5 — Deploy the Merchant Suite on Vercel (new account)

- [ ] 5.1 The user connects the new Vercel account to the `serakhabarofficial` GitHub
      (Vercel → Settings → Git → GitHub app → allow both Sera Khabar repos).
- [ ] 5.2 Vercel → **Add New → Project** → import `serakhabarofficial/sera-khabar-commerceos`.
      Framework preset: **Other / Vite** (`vercel.json` controls rewrites, region `sin1`
      and 3 crons: SEO refresh, abandoned checkouts, analytics rollup).
- [ ] 5.3 Create a Vercel **access token** (Account Settings → Tokens) for
      `VERCEL_ACCESS_TOKEN`, and note the **Team ID** (Team Settings → General) for
      `STOREFRONT_VERCEL_TEAM_ID` (leave empty on a personal Hobby account).
- [ ] 5.4 Generate secrets locally. The agent can run this; the user copies the output into Vercel:
  ```bash
  for k in ORDER_PROTECTION_HASH_SECRET STOREFRONT_CONTEXT_SECRET CAMPAIGN_EDGE_SECRET CRON_SECRET TOKEN_ENCRYPTION_KEY; do echo "$k=$(openssl rand -hex 32)"; done
  ```
  **Save `STOREFRONT_CONTEXT_SECRET`, `CAMPAIGN_EDGE_SECRET` and `CRON_SECRET`.** The
  storefront project needs the same values (Phase 8).
- [ ] 5.5 Set Production (and Preview) env vars in the Suite Vercel project:

  | Variable | Value |
  |---|---|
  | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` | from Phase 3 |
  | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | same URL and anon key |
  | `OPENAI_API_KEY` (or `AI_PROVIDER` + `OPENROUTER_API_KEY`, or `AI_BASE_URL` + `AI_API_KEY`) and `AI_MODEL` | Sera Khabar's own AI key |
  | `ORDER_PROTECTION_MODE` | `active` |
  | `ORDER_PROTECTION_HASH_SECRET`, `STOREFRONT_CONTEXT_SECRET`, `CAMPAIGN_EDGE_SECRET`, `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY` | from 5.4 |
  | `VERCEL_ACCESS_TOKEN` | from 5.3 |
  | `STOREFRONT_GIT_REPO` | `serakhabarofficial/sera-khabar-storefront` |
  | `STOREFRONT_VERCEL_TEAM_ID` | from 5.3 (or empty) |
  | `MERCHANT_SUITE_PUBLIC_URL` | the Suite's Vercel URL for now (e.g. `https://sera-khabar-commerceos.vercel.app`); change to the admin domain in Phase 9 |
  | `APP_URL` | same as `MERCHANT_SUITE_PUBLIC_URL` |
  | `VERCEL_PROJECT_ID` | the **storefront's** Vercel project id, used for automatic SEO redeploys (fill in after Phase 8) |
  | `ADMIN_EMAIL` / `ADMIN_EMAILS` | Sera Khabar owner's email(s) |
  | `ALLOWED_ORIGINS` | storefront URL(s), if CORS is needed (check its use in `server/index.js`) |
  | Optional: `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY` | from Cloudflare Turnstile (Phase 9) |
  | Optional: `POSTHOG_PROJECT_API_KEY`, `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` | a new PostHog project for Sera Khabar |
  | Optional: `FRAUDSHIELD_API_KEY`, `FIRECRAWL_API_KEY` | Sera Khabar's own keys |
  | Optional: `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_REDIRECT_URI`, `META_GRAPH_VERSION`, `META_WHATSAPP_CONFIG_ID`, `META_SYSTEM_USER_TOKEN`, `WA_VERIFY_TOKEN` | Phase 10 |
  | Optional: `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN`, `PUBLIC_DOMAIN` | Phase 9 |
  | **Do NOT set** | `UPSTASH_REDIS_*` (not used), `STRIPE_*` (unless the user wants billing), `DATABASE_URL` (legacy) |

  Before relying on any optional variable, confirm what it does with `grep -n "process.env.<NAME>" server/*.js`.
- [ ] 5.6 Deploy. Open `https://<suite>.vercel.app`, check the login page loads and
      `GET /api/config` responds. Check Vercel function logs for startup errors
      (e.g. the read-only schema readiness check).

✅ Done when: the Suite loads on its Vercel URL with no errors in the logs.

---

## Phase 6 — First admin login and workspace setup

- [ ] 6.1 The owner **signs up** in the Suite. **The first account becomes admin**
      (`getUser()` auto-assigns the admin role). Use the owner's real email.
- [ ] 6.2 Get the new workspace id (Supabase MCP or SQL editor, Sera Khabar project only):
  ```sql
  select user_id, role, org_id from public.user_roles;
  ```
  Write the `org_id` into the Key facts table. It's the storefront's `VITE_STOREFRONT_ID`.
- [ ] 6.3 **Set the storefront handle.** There's no UI for it; use the API as the
      logged-in admin. In the browser console on the Suite (or with curl and the admin's JWT):
  ```
  POST /api/storefront/handle   body: { "handle": "<sera-khabar-handle>" }
  GET  /api/storefront/handle   → must return the handle
  ```
  (Backed by `app_settings` keys `storefront_handle:<handle>` and `<orgId>:public_storefront_handle`;
  see `server/index.js` ~line 1503 and ~2496.)
- [ ] 6.4 Settings page: set the store name, store info and shipping charges
      (inside/outside Dhaka), and anything else the Settings page shows for branding.
- [ ] 6.5 Add 2–3 real products (name, price, images, stock) and **publish** them.
      Images upload to the `product-images` bucket.
- [ ] 6.6 Check `GET <suite>/api/public/v1/<handle>/products` returns those products.

✅ Done when: the admin works, the handle is set, and the public products API returns Sera Khabar products.

---

## Phase 7 — Rebrand the storefront code

Work in `$BASE/sera-khabar-storefront` and follow its `SERA_KHABAR_SETUP.md` (full
file-by-file list). Summary of what's critical:
- `script/build.ts` hardcodes the **Mango Lover production Suite URL** and a **Mango
  Lover storefront id**. Without this change, the Sera Khabar storefront shows Mango
  Lover's products.
- `middleware.ts`, `server/order-service.ts`, `server/abandoned-cart-service.ts` and
  `server/campaign-*.ts` hardcode the Mango Lover admin URL, domain and handle, so
  orders would go to Mango Lover.
- `client/index.html` has Mango Lover's **GTM ID**, so analytics would go to Mango Lover.
- `client/src/lib/generated-storefront-products.ts` is a snapshot of Mango Lover's products.
- `vercel.json` allows images from Mango Lover's Supabase host.
- Bangla brand name ম্যাংগো লাভার in `App.tsx`, `layout.tsx`, `api/legacy-gone.ts`.
- Mango-Lover-specific product, landing and feature pages in `client/src/features/`.
- Ask the user about the **design**: colors, fonts, hero images, homepage sections.

✅ Done when: the storefront sweep is clean, and `npm run build` passes with Sera Khabar env vars (set them in a local `.env`), so the pre-push hook passes **without** `--no-verify`.

---

## Phase 8 — Provision and deploy the storefront

- [ ] 8.1 Make sure the storefront rebrand is on `main` on GitHub (Phase 7).
- [ ] 8.2 In the Suite: **Settings → Provision Storefront** (`POST /api/storefront/provision`).
      The server (`provisionStorefrontProject`, `server/index.js` ~line 3297):
  - creates the Vercel project `storefront-<first 8 chars of org_id>` from `STOREFRONT_GIT_REPO`
  - sets `VITE_MERCHANT_SUITE_URL`, `VITE_STOREFRONT_ID` (= org_id), `VITE_STOREFRONT_HANDLE`,
    `VITE_TURNSTILE_SITE_KEY`, `MERCHANT_SUITE_URL`, `STOREFRONT_HANDLE`, `CUSTOM_ORDERS_API_KEY`
  - triggers a production deploy from `main`

  If it fails, read the error: missing `VERCEL_ACCESS_TOKEN`, `STOREFRONT_GIT_REPO`,
  `MERCHANT_SUITE_PUBLIC_URL`, handle not set (Phase 6.3), or the Vercel GitHub app
  can't access the storefront repo (5.1).
- [ ] 8.3 In the new storefront Vercel project, **add manually** (provisioning doesn't set these):
  `STOREFRONT_CONTEXT_SECRET`, `CAMPAIGN_EDGE_SECRET`, `CRON_SECRET`, each **identical**
  to the Suite's values from 5.4. Then redeploy.
- [ ] 8.4 Copy the storefront project's id into the Suite's `VERCEL_PROJECT_ID`, then redeploy the Suite.
- [ ] 8.5 Open the storefront URL: Sera Khabar branding, Sera Khabar products, no Mango Lover anywhere.

✅ Done when: the storefront is live on its `*.vercel.app` URL showing only Sera Khabar.

---

## Phase 9 — Domains and Cloudflare (new Cloudflare account)

- [ ] 9.1 The user adds the Sera Khabar domain to the **new** Cloudflare account and
      changes the nameservers at the registrar to Cloudflare's. Wait for "Active".
- [ ] 9.2 Vercel, Suite project → Domains → add `admin.<domain>`.
- [ ] 9.3 Vercel, storefront project → Domains → add `www.<domain>` and the apex `<domain>`
      (redirect apex → www, or the other way; match what the code expects; Mango Lover uses `www`).
- [ ] 9.4 Cloudflare DNS: add exactly the records Vercel shows (CNAME/A), all
      **DNS only (grey cloud)**. ⚠️ **Never proxy `www` (orange cloud)**: the `/go`
      campaign redirects run in Vercel middleware, and proxying breaks them.
- [ ] 9.5 Optional: a Cloudflare **Turnstile** widget for the storefront domain →
      `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` in the Suite, `VITE_TURNSTILE_SITE_KEY` in the storefront.
- [ ] 9.6 Optional cache purge: an API token with Zone → Cache Purge →
      `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN`, `PUBLIC_DOMAIN` in the Suite.
- [ ] 9.7 Update to the final domains: Suite `MERCHANT_SUITE_PUBLIC_URL` and `APP_URL` →
      `https://admin.<domain>`; storefront `VITE_MERCHANT_SUITE_URL` and `MERCHANT_SUITE_URL` →
      `https://admin.<domain>`; Supabase Auth Site URL → `https://admin.<domain>`.
      Make sure the hardcoded URLs from Phases 4 and 7 match the final domains. Redeploy both.

✅ Done when: `https://admin.<domain>` and `https://www.<domain>` load over HTTPS.

---

## Phase 10 — Integrations (Suite → Settings, Sera Khabar's own credentials)

- [ ] 10.1 **Steadfast**: API key and secret in Settings. Set Steadfast's webhook to
      `https://admin.<domain>/api/webhooks/steadfast`.
- [ ] 10.2 **Pathao**: client id, secret, username, password, store id in Settings.
- [ ] 10.3 **FraudShield**: API key (Settings or the `FRAUDSHIELD_API_KEY` env var).
- [ ] 10.4 **Meta (Facebook/Instagram/WhatsApp)**: Sera Khabar's own Meta app (or the
      existing app approach; ask the user). Env: `META_APP_ID`, `META_APP_SECRET`,
      `META_REDIRECT_URI = https://admin.<domain>/api/meta/oauth/callback`,
      `META_WEBHOOK_VERIFY_TOKEN` (new random). Webhooks:
      `https://admin.<domain>/api/webhooks/facebook` and `/api/webhooks/whatsapp`.
      Then connect the page in Settings.
- [ ] 10.5 **Brand doc** for the AI social bot: Settings / Social → Brand doc (describe Sera Khabar products, prices, tone).
- [ ] 10.6 **Shopify** (only if used): `SHOPIFY_REDIRECT_URI` and store settings.
- [ ] 10.7 **SMS** (if used): configure the provider and templates in Settings.
- [ ] 10.8 **Team**: the admin invites staff (`POST /api/admin/assign-role` via the UI).

✅ Done when: each integration's "test" button (where there is one) succeeds.

---

## Phase 11 — End-to-end testing and go-live

- [ ] 11.1 Place a test order on `https://www.<domain>` → it appears in the Suite with the right prefix (e.g. `SK-1001`).
- [ ] 11.2 Order protection / fraud check runs on it.
- [ ] 11.3 Send the test order to the courier, then cancel it with the courier.
- [ ] 11.4 Change a product price or stock in the Suite → the storefront updates **without** a redeploy.
- [ ] 11.5 Upload a product image → it shows on the storefront.
- [ ] 11.6 Social inbox receives a test message (if Meta is set up).
- [ ] 11.7 Crons: check Vercel → Suite project → Cron Jobs ran without errors after a day.
- [ ] 11.8 Final sweep in **both** repos: no `mangolover`, `ldiktvcavyabivpxfwpn`, `3cd26e57`,
      `2a155750` or `GTM-5KKTRHFD` in runtime code.
- [ ] 11.9 Confirm with the user that **Mango Lover still works** (admin.mangolover.com.bd and
      www.mangolover.com.bd load; no changes were made there).
- [ ] 11.10 Delete test orders, remove the top banner from both `CLAUDE.md` files, mark all phases ✅.
- [ ] 11.11 `gh auth switch -u noorkarimmehedi` if the user also works on Mango Lover.

🎉 Sera Khabar is live.
