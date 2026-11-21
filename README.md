# HackrLife Agent Lab

A catalogue of small-business automation solutions — built with **Next.js 14 (App Router)**, **TypeScript** and **Tailwind CSS**, deployed on **Vercel**.

Every card opens a product page with a definition, a real business situation, an **interactive simulation** (customer side, business result, event trace), a product-specific **workflow and harness schematic** that highlights only the steps a run actually reached, delivery, deployment and measurement sections, and a product-aware **Book a demo for my business** form.

> Demos are deterministic state machines running in the browser on fictional data. No messages are sent, no payments taken and no real systems written. Each demo states exactly what is simulated.
>
> Some agents also have a **live agent** panel that calls the real n8n workflow (see [How the live agents work](#how-the-live-agents-work)).

## Where things live

| Path | What |
|---|---|
| `src/lib/catalogue/products/<slug>.ts` | One product: copy, schematic (nodes/edges) and demo state machine |
| `src/lib/catalogue/index.ts` | Catalogue order |
| `src/lib/catalogue/types.ts`, `sim.ts` | Shared contracts and the simulation helper |
| `src/components/product/` | Demo panel, schematic viewer, page experience |
| `src/components/BookingForm.tsx` | Sales request → n8n webhook `book-demo` (never claims a booked call unless the scheduler confirms) |
| `tests/` | Path tests per product + invariant fuzzing (`npx tsx tests/run.ts`) |

## Quick start

```bash
# 1. Install dependencies (Node 18.17+ recommended)
npm install

# 2. Run the dev server
npm run dev
# → http://localhost:3000

# 3. Production build / preview
npm run build
npm run start
```

Other scripts: `npm run lint` (ESLint) and `npm run typecheck` (`tsc --noEmit`).

---

## Deploying to Vercel

1. Push this repo to GitHub (see below).
2. In Vercel, **Add New → Project** and import the repo.
3. Framework preset auto-detects as **Next.js** — no build settings to change.
4. (Optional) Add the environment variable `NEXT_PUBLIC_N8N_WEBHOOK_BASE` (see [Configuration](#configuration)).
5. **Deploy.**

### Pushing to GitHub

```bash
git init
git add .
git commit -m "HackrLife Agent Lab"
git branch -M main
git remote add origin https://github.com/HackrLife/agent-lab.git   # adjust to your repo
git push -u origin main
```

---

## Configuration

### Webhook base URL

Live demos POST to `{N8N_WEBHOOK_BASE}/{agent-slug}`. The base is defined in **`src/lib/webhook.ts`**:

```ts
export const N8N_WEBHOOK_BASE =
  process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE?.replace(/\/$/, "") ||
  "https://n8n.hackrlife.com/webhook";
```

- To point the demos at a **different n8n instance without editing code**, set
  `NEXT_PUBLIC_N8N_WEBHOOK_BASE` in Vercel → *Project → Settings → Environment Variables*
  (e.g. `https://n8n.example.com/webhook`). Trailing slashes are stripped automatically.
- If the variable is unset, the fallback above is used.

> Because the variable is prefixed `NEXT_PUBLIC_`, it is exposed to the browser **by design** — the demo POST happens client-side. Only put the *webhook base* here. Never put secrets, API keys, or admin URLs in a `NEXT_PUBLIC_` variable.

### Site constants

Brand name, consult email, canonical URL, and external links (newsletter, CV, GitHub) live in **`src/lib/site.ts`**. Update the `url` field if you deploy under a different domain so SEO metadata stays correct.

---

## Project structure

```
src/
├── app/                        # App Router pages and routes
│   ├── page.tsx                # Home
│   ├── agents/page.tsx         # Catalogue with sector and outcome filters
│   ├── agents/[slug]/page.tsx  # Product page (live panel, demo, schematic, delivery)
│   ├── book/                   # Book a demo form
│   └── robots.ts, sitemap.ts
├── components/
│   ├── product/                # Demo panel, schematic viewer, page experience
│   └── live/                   # Panels that call a real n8n workflow
├── lib/
│   ├── catalogue/              # Products, shared types and the simulation helper
│   ├── webhook.ts              # Webhook base and URL builder
│   └── site.ts                 # Brand, nav, external links
└── styles/globals.css
samples/                        # Fictional test data for the agents (e.g. samples/invoices)
tests/                          # Path tests and fuzzing for every product
```

---

## How the live agents work

A product with `liveDemo` set shows a **Try the real agent** panel above the simulation.

1. The panel POSTs one fictional record as JSON to `webhookUrl(<slug>)`. For the invoice chaser there are two modes: **send** (the visitor picks one of the fixed sample invoices in `samples/invoices` and the reminder is emailed to the visitor's own address, once per address per day) and **draft** (the visitor types an invoice and the draft is shown on the page).
2. A dedicated public n8n workflow validates the input, applies the same rules as the production workflow and, where needed, asks a model to write the output. It is limited to 25 runs a day (3 per email), blocks bots with a hidden field and a minimum time on the form, and returns JSON to the page.
3. Visitors must give an email and tick a box to join the HackrLife newsletter. The workflow adds them to beehiiv and also saves each sign-up to the n8n data table "Agent Lab newsletter sign-ups".
4. The public workflow never writes to a calendar or sheet and never emails anyone except the visitor who asked, and only with a fixed sample invoice.

Live today: `invoice-chaser` (agent 21).

---

## Adding or editing an agent

1. Add `src/lib/catalogue/products/<slug>.ts` exporting a `Product` (copy an existing one, e.g. `invoice-chaser.ts`).
2. Import it in `src/lib/catalogue/index.ts` and add it to `products`. Order follows the `no` field.
3. Add `tests/<slug>.cases.ts` with at least three path cases.
4. If it needs a new sector or outcome, add it to `Sector`/`Outcome` and `SECTORS`/`OUTCOMES` in `types.ts`, and a colour in `components/Badge.tsx`.
5. Run `npx tsx tests/run.ts`, `npm run typecheck`, `npm run lint` and `npm run build`.

The product then appears on the home page, in the catalogue, in the filters and in the sitemap.

---

## Tech notes

- **Dark & light mode.** The site defaults to **dark**, with a sun/moon toggle in the header (`src/components/ThemeToggle.tsx`). It uses Tailwind's class-based dark mode (`darkMode: "class"`); a tiny inline script in `layout.tsx` applies the saved choice before first paint to avoid a flash. The brand accent is **blaugrana claret** (`#a50044`), defined once in `tailwind.config.ts` as both `signal` (the existing accent name) and `brand` (with a `brand-light` `#ff5c93` for legible accents on dark surfaces).
- **Next.js 14 App Router**, fully static-friendly: agent detail pages use `generateStaticParams` + `generateMetadata`.
- **Tailwind** theme tokens (colors, fonts, animations, shadows) are in `tailwind.config.ts`; reusable component classes (`.btn`, `.card`, `.field`, etc.) are in `src/styles/globals.css`.
- **No client secrets.** The only browser-exposed config is the public webhook base.
- TypeScript runs in `strict` mode.

---

Built by **Dev Das** · [hackrlife.com](https://hackrlife.com) · consult: `dev@hackrlife.com`
