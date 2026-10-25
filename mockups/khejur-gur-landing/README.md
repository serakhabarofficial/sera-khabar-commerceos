# খেজুরের গুড় — landing page mockups (static)

Plain HTML/CSS/JS. No build step, no dependencies. Everything is included exactly as designed.

## Pages
- `/` (index.html) — shapes design: ক খেলাঘর and খ রোদের পথ (switch with the pill at the top, or open `/#a` / `/#b`).
- `/poster` — poster mockup with variants ১–৯ (switch with the pill at the top, or `/poster#k` etc.).
- `/mockup-1` — the first mockup (A/B/C).

## Deploy on Vercel
Drag this folder into vercel.com/new, or run `npx vercel` inside it.
Framework preset: **Other** · Build command: none · Output directory: `.`

## Reusing for another brand
- Logo: `sera-khabar-logo.webp`
- Products / prices / copy: the `P` array in each page's `<script>`, plus section text.
- Phone / WhatsApp: search `tel:+880` and `wa.me/`.
- Colours (index.html): `--blue --yellow --coral --green --lilac --navy --bg` in `.sp { … }`.

## Notes
- The order forms are mockups: submitting shows a toast and sends nothing. Connect your order API before real use.
- Some product images in `poster.html` / `mockup-1.html` load from the Sera Khabar Supabase storage URL.
