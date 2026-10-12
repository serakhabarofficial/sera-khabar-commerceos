# Handoff — Sera Khabar setup

Last updated: 2026-10-12. Full step-by-step plan and safety rules: `SERA_KHABAR_SETUP.md` (read it first).
Never put secrets in this file. They live in the local `.env` files (git-ignored) and in Vercel.

## Where things are

| Part | URL | Vercel project | GitHub repo |
|---|---|---|---|
| Merchant Suite (dashboard) | https://sera-khabar-commerceos.vercel.app | `sera-khabar-commerceos` (`prj_ucCq5RoMVsLYHbubFbeAZRFSLnZu`) | `serakhabarofficial/sera-khabar-commerceos` |
| Storefront (shop) | https://serakhabar-storefront.vercel.app (also `storefront-690aa8b3.vercel.app`) | `storefront-690aa8b3` (`prj_6LwMpprczqsb1GbmSRZeZzblu76C`) | `serakhabarofficial/sera-khabar-storefront` |
| Database | Supabase project `xnuiaxygeoydtopvcmli` (Singapore) | — | — |

Vercel team `serakhabarofficial-6832` (`team_d5c0Y4idD8xCTKpDyV5WgLmk`). Cloudflare account `serakhabarofficial@gmail.com`.
Workspace `org_id` `690aa8b3-6657-46c4-8df5-addcc1f96035`, handle `serakhabar`, order prefix `SK-` (first `SK-1001`).
Pushes to `main` in either repo deploy automatically. Push only as the `serakhabarofficial` GitHub account.

## Implemented (2026-10-12)

**Accounts and MCP**
- Supabase, Vercel and Cloudflare MCPs verified on the Sera Khabar accounts (never Mango Lover's).

**Database**
- All 43 files in `supabase/migrations/` applied (via psql over the session pooler) and recorded in `supabase_migrations.schema_migrations`. 43 tables, RLS on, `product-images` bucket. Security advisor: only the expected INFO "RLS enabled, no policy".
- Order numbers changed to `SK-`, starting at 1001 (`20260910170052_ml_order_numbering.sql`, `server/index.js` check). The function name `next_ml_order_number` was kept on purpose.
- Main admin `serakhabarofficial@gmail.com` created (email pre-confirmed, `user_roles` admin, `org_id` = user id). Default warehouse "Sera Khabar" inserted.

**Merchant Suite**
- Rebranded for Sera Khabar: storefront URL/handle, UI text, Bangla SMS templates, invoice/label print logo, share image, agent docs. Lint has 0 errors; 2336 tests pass; build OK.
- Deployed on Vercel with 19 env vars (Supabase, 5 generated secrets, Vercel token, storefront repo/team, public URL, admin email, `VERCEL_PROJECT_ID` = storefront project). No runtime errors.
- Storefront handle set to `serakhabar`. Store name set. 2 products added and published by the user (আমসত্ত্ব আচার, হোমমেড কুমড়ো বড়ি).

**Storefront**
- Safety rebrand: Suite URL, handle and workspace id point at Sera Khabar; Mango Lover GTM/Pixel, reels, product snapshot, comparison image, phone/address/email/social links removed or replaced; contact details, logo, favicons, share image and green-poster hero added.
- Header uses the full leaf logo (`attached_assets/sera-khabar-leaf-logo.webp`).
- Provisioned via the Suite (`POST /api/storefront/provision`). The shared secrets `STOREFRONT_CONTEXT_SECRET`, `CAMPAIGN_EDGE_SECRET` and `CRON_SECRET` were added and match the Suite.
- SEO works: publishing a product makes the Suite redeploy the storefront, which builds per-product meta, Product JSON-LD and the sitemap. Canonical URLs point at `www.serakhabar.com`.
- **Pre-launch gate is ON.** `server/site-access.ts` + `server/coming-soon-page.ts`, run from `middleware.ts` (matcher `/:path*`). While the storefront env var `SITE_ACCESS_PASSWORD` is set:
  - every visitor sees the founder's letter (logo, short bold Bangla text, underlined call/WhatsApp links, "Jahidul Islam" signature, designer credit), served as 503 + `noindex`, with `robots.txt` disallowing all;
  - shop APIs return 401;
  - the team password (ask the owner; it is not written here) sets a signed 30-day cookie that opens the full shop.

  7 gate tests pass (`npx tsx --test server/site-access.test.ts`).
- Storefront tests: 45 of 379 fail with plain `node --test`; all 45 already failed in the copied Mango Lover code (many only because Node can't resolve the `.js` import style; `npx tsx --test` handles it). No new failures.

## Left to do

**Owner actions (dashboard / accounts)**
1. Supabase → Authentication: turn off **Confirm email**; set **Site URL** to `https://sera-khabar-commerceos.vercel.app` (later `https://admin.serakhabar.com`). Not verified yet.
2. Rotate the secrets that were pasted in chat before go-live: Supabase DB password, service-role key, Vercel access token, admin password. After rotating, update the local `.env` and the Vercel env vars.
3. Move `serakhabar.com` into the Sera Khabar Cloudflare account. It is in another Cloudflare account and still serves the old WordPress shop.
4. Provide later: AI key (OpenAI/OpenRouter), Google Analytics/GTM ID, SMS provider, full street address (the shop shows only "Rajshahi, Bangladesh"), Instagram (if any).
5. Settings page: shipping charges (inside/outside Dhaka) and other store info.

**Agent work**
6. **Phase 9 — domains:** add `www.serakhabar.com` + apex to the storefront project and `admin.serakhabar.com` to the Suite; add the DNS records in Cloudflare (DNS-only/grey cloud for Vercel). Then replace the hardcoded Suite URL `https://sera-khabar-commerceos.vercel.app` in the storefront code (`script/build.ts`, `middleware.ts`, `server/order-service.ts`, `server/abandoned-cart-service.ts`, `server/campaign-links.ts`, `api/orders.ts`, `api/abandoned-carts.ts`, `client/src/lib/tracker.ts`, `client/src/lib/storefront-products.ts`), and update `MERCHANT_SUITE_PUBLIC_URL`/`APP_URL` (Suite) and `VITE_MERCHANT_SUITE_URL`/`MERCHANT_SUITE_URL` (storefront). Supabase Site URL too.
7. **Phase 7 — storefront design:** still Mango Lover's layout and colours (yellow highlights), some Mango Lover homepage/category pictures, and the copied campaign pages `/step/*` (honey, kalojira, honey-nut are Mango Lover products; katimon and pumpkin bori could be reused). The homepage hero crops the logo under its fade. **Homepage direction approved 2026-10-13, not built yet:** the full spec and the approved mockup are in the storefront repo at `docs/design/2026-10-13-homepage/` (`README.md` + `homepage-mockup.html`, variant ক · রঙিন কার্ড). Summary: "Market Poster" layout, palette তেঁতুল + হলুদ (`#5B2D17` / `#F6B826` / `#E2547A` on `#FAF4EA`), Noto Serif Bengali titles, Atma for every digit, categories ফ্রেশ আম/হোমমেড/গুড় only as coloured cut-out cards (one per row on phone), product photos blended with no colour behind them, cash-memo footer with the designer credit emblem as the signature.
8. **Phase 10 — integrations:** Steadfast keys + webhook, FraudShield, Meta (Facebook page/WhatsApp), AI brand doc, SMS, team invites.
9. **Phase 11 — go-live:** test order (lands as `SK-1001`, then cancel), courier send/cancel, live price/stock update without redeploy, image upload, crons. Then **launch by deleting `SITE_ACCESS_PASSWORD`** from the storefront Vercel project and redeploying, and submit `https://www.serakhabar.com/sitemap.xml` in Google Search Console.
10. Optional: the storefront middleware now runs on every request; after launch its matcher could be narrowed back to `/go/:path*` if the gate is no longer needed.
11. At the end of a session: `gh auth switch -u noorkarimmehedi` (the owner's other account).

## Gotchas learned this session
- The Supabase pooler host is `aws-0-ap-southeast-1.pooler.supabase.com` (not `aws-1`). Use port 5432 (session mode) for DDL via psql.
- The Vercel MCP couldn't link GitHub when creating a project ("install the GitHub integration first"); the REST API with the Sera Khabar access token worked.
- `src/test/productBranding.test.ts` in the Suite fails if any file in the repo folder (tracked or not) contains the old product brand string defined in that test (the designer credit on the letter mockups triggered it). Keep scratch/mockup files outside the repo folder.
- Bangla text animations must split per word, never per character (it breaks conjuncts).
- The storefront `npm run build` rewrites `client/src/lib/generated-storefront-products.ts` from the live Suite; don't commit that change by accident.
