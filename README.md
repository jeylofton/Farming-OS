# Farm Business OS — Produce Farm & Agricultural Education (Stage 1 demo)

Reusable vertical template for a vegetable farm that also teaches growing classes. Built from
`Produce_Farm_Agricultural_Education_Business_OS_Template.docx`. A separate derivative of the Vertical Business OS
lineage (same stack as `dry-cleaning-business-os`; the dry-cleaning and Next.js master projects are untouched).

**Stack:** HTML5 → Bootstrap 5 / Flexbox / Grid → vanilla JS → EJS (one admin layout, one public layout, partials)
→ Node + Express → routes → controllers → services → repositories → SQLite adapter (node-sqlite3-wasm). No React or Next.js.

## Run it

```bash
npm install
cp .env.example .env      # already present after setup
npm start                 # http://localhost:3000   (admin: /login, admin / demo1234)
npm test                  # end-to-end smoke test on a throwaway database
npm run reset:demo        # deliberate, manual: delete the demo DB so it re-seeds
```

The first start seeds **fictional** data (plots, tomatoes/peppers/lettuce/cucumbers, batches, harvests, classes,
students, registrations, orders). The seed marker lives inside the database, so restarts and redeploys never overwrite
the owner's changes. Set `DEMO_DB_PATH` and `UPLOAD_PATH` to a persistent folder on Hostinger.

## What is in Stage 1

| Area | Where |
|---|---|
| Overview dashboard, alerts, quick actions | `/admin` |
| Crops, plots/beds/greenhouses, planting batches (stages, yield vs. estimate, photos) | `/admin/crops`, `/plots`, `/plantings` |
| Farm calendar (tasks, sowing, harvest windows, classes, maintenance) | `/admin/calendar` |
| Tasks, harvest log → produce inventory lots, spoilage/correction adjustments | `/admin/tasks`, `/harvests`, `/inventory` |
| Produce orders (stock reserved, tax, payments, refunds, cancel restores stock) | `/admin/orders`, `/customers` |
| Courses, scheduled sessions, roster, attendance, waitlist, refunds, complete/cancel | `/admin/courses`, `/classes`, `/enrollments`, `/students` |
| Supplies (low-stock alerts), equipment (maintenance due), expenses, staff | `/admin/supplies`, `/equipment`, `/expenses`, `/staff` |
| Finances: monthly revenue vs. expenses, yield, top produce, class fill | `/admin/reports` |
| Website content, farm updates/gallery, inquiries, settings | `/admin/content`, `/updates`, `/inquiries`, `/settings` |
| Public site: Home, About, Our Produce, Classes (`/classes/:slug` + registration), Updates, Contact | `/` |

**First client demonstration (spec §15):** open planting `TOM-A` → *Record harvest* → *Produce Inventory* → *New order*
→ record payment → *Reports*; then *Course Catalog* → *Schedule session* → register a student → open the class roster.

## How it is organised

- `config/resources.js` — registry that **generates** list/form/detail/archive/delete for crops, plots, plantings,
  tasks, harvests, customers, courses, class sessions, students, supplies, equipment, expenses, staff, updates and
  livestock. To add a module: add a table to `data/adapters/sqlite.js` and an entry here. Never hand-code a page per
  crop, student or class.
- `services/` — business rules (`enrollmentService` capacity/waitlist, `orderService` stock, `paymentService`
  ledger, `harvestService`, `inventoryService`, `resourceService` validation) run inside SQL transactions.
- `data/repositories/` — all SQL. `data/adapters/` — the only place that knows about SQLite.
- `config/features.js` — feature flags (`FEATURE_LIVESTOCK=true`, etc.). Disabled modules stay dormant, not deleted.

## Online payments: demo checkout now, Stripe later

Classes and produce are paid online through one flow with two interchangeable providers:

- **Demo checkout (default, no env vars needed):** a simulated hosted checkout at `/demo-pay/...`, clearly labelled DEMO.
  It has no card field: you pick a demo card that succeeds or one that is declined, so no real card number is ever typed.
  Seat/stock holds, 30-minute expiry, recording, confirmation pages and refunds all run through the same code as Stripe.
  Ledger rows read "card (DEMO, simulated)". Disable it with `DEMO_PAYMENTS=false`.
- **Stripe Checkout:** used automatically as soon as `STRIPE_SECRET_KEY` is set (demo checkout then turns off).

### Switching to Stripe

1. In Stripe (start in **test mode**) copy the secret key (`sk_test_...`).
2. Stripe Dashboard -> Developers -> Webhooks -> add endpoint `https://YOUR-SITE/webhooks/stripe` with events
   `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`. Copy its signing secret (`whsec_...`).
3. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Hostinger's Environment variables and restart.
   Admin -> Settings shows the mode (test / LIVE) and whether the webhook secret is set.
4. Try it with card `4242 4242 4242 4242`, any future date, any CVC. Switch to live keys only after owner approval.

How it behaves:
- **Classes:** paid sessions send the student to checkout after registering; the seat is held 30 minutes and released if unpaid.
  Free classes and waitlist entries never open Stripe.
- **Produce:** a public `/order` page (pickup only). Stock is reserved during checkout and returned if it expires.
- **Safe by design:** prices and amounts come from the database; payments are recorded only from signed webhooks (or by
  re-reading the session from Stripe), idempotently; card numbers never reach this server.
- **Refunds:** an admin refund (or "Cancel + refund") of a card payment goes back to the card via Stripe; cash/check
  payments are still refunded manually. Refunds made directly in the Stripe Dashboard are not synced into the ledger yet.
- Demo payments and refunds are never sent to Stripe: after switching, old demo payments stay in the ledger as DEMO rows.
  Clear them with `npm run reset:demo` before real use.
- If two checkout tabs for the same registration are both paid, both are recorded (the record shows overpaid): refund one.

## Guardrails honored

- Stage 1 is a demo only: no real emails (confirmations are logged as *simulated*), demo login only, no Supabase
  requirement. Payments are manual ledger entries unless Stripe is configured (test mode first, see above).
- Class capacity, stock levels, dates, non-negative prices and unique registration/order numbers are validated
  **server-side** in transactions; owner-entered text is stored as text and always escaped on output.
- Photos: JPEG/PNG/WebP, 3 MB, random file names. POSTs from other origins are rejected.
- Livestock is disabled by default (`/admin/livestock` returns 404 until the flag is on). Customer/student portal, CSA
  boxes and sensors from spec §14 are **not built**.

## Stage 2 swap points (after approval)

1. `data/adapters/` → add `postgres.js` (Supabase PostgreSQL) and select it with `DB_PROVIDER`; repositories keep their
   contracts (note: they use SQLite date functions in a few queries and `?` placeholders, to translate).
2. `services/authService.js` → Supabase Auth (callers only use `authenticate()`).
3. `lib/upload.js` → Supabase Storage.
4. Replace simulated confirmation emails in `enrollmentService` with a real mailer.
5. Stage 3: server-side authorization per role (`staff.role`), RLS, indexes, connection pooling, production ENV.
