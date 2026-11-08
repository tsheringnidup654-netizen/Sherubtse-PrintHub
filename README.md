# Sherubtse PrintHub – Online Printing & Photocopy E-Store

A web app for Sherubtse College, Bhutan, where students upload documents, customise print jobs,
see an automatic price, choose a collection deadline and track the order until pick-up.
Admins (print shop staff) manage orders, deadlines, services, payments and reports.

**Stack:** Node.js 18+ · Express · EJS · PostgreSQL · Bootstrap 5 · Chart.js · SweetAlert2
(sessions via express-session + connect-pg-simple, bcrypt, Multer, PDFKit, QRCode, Helmet).
All times use **Asia/Thimphu (UTC+6)**.

## Quick start

```bash
# 1. PostgreSQL must be running. Then:
cp .env.example .env          # edit DB_* and SESSION_SECRET if needed
npm install
npm run db:setup              # creates role/database, schema and sample data
npm start                     # http://localhost:3000
```

`npm run db:setup` is safe to re-run: it resets the data to the sample set.
If the `printhub` role / database do not exist yet, set `PG_ADMIN_USER` / `PG_ADMIN_PASSWORD`
in `.env` to a PostgreSQL superuser so the script can create them.

Other commands: `npm run dev` (auto-reload), `npm test` (96 end-to-end checks against the real DB).

## Demo accounts

| Role    | Email                              | Password     |
|---------|------------------------------------|--------------|
| Admin   | admin@sherubtse.edu.bt             | Admin@123    |
| Student | 02230001.sherubtse@rub.edu.bt      | Student@123  |

Students 02230002–02230004 use the same password. **Change these before any real deployment.**

## Folder structure

```
app.js, server.js        Express app and server start
config/                  env, constants, PostgreSQL pool (timezone Asia/Thimphu)
routes/                  public, auth, student, admin routes
controllers/             request handling (MVC "C")
models/                  SQL access (MVC "M"): User, Order, Cart, Document, Payment, ...
views/                   EJS templates (MVC "V"): public/, student/, admin/, partials/
middleware/              auth + roles, CSRF, locals, error handling
utils/                   pricing, time (Bhutan), validators, invoice PDF, scheduler, file checks
public/                  css, js, img (college logo)
database/                schema.sql, seed.sql, setup.js
uploads/                 private documents (never served statically)
test/smoke.js            end-to-end test suite
```

## How the main features work

- **Pricing** – `utils/pricing.js`: service base price × paper size (A3 multiplier) × quality ×
  copies, double-sided discount, binding, urgent surcharge. Rates live in the `services` and
  `settings` tables and are editable by the admin.
- **Countdown** – the collection deadline is stored as a TIMESTAMPTZ. The browser ticks a live
  countdown from it: green > 24 h, yellow < 24 h, red < 3 h, grey when expired.
  The system **never** changes an order's status automatically – only the admin does. A background
  scan sends a deadline notification once per order.
- **Order flow** – Pending → Accepted → Printing in Progress → Ready for Collection → Collected
  (or Rejected / Cancelled). Every change is written to the status history shown as a timeline.
  The estimated completion time is shown only after the admin confirms it.
- **Collection** – each order has a QR code; admins scan it (or type the order number) at
  *Collect order* to hand over and record the collection.
- **Security** – bcrypt hashes, server sessions, CSRF tokens, role checks (students get 403 on
  `/admin`), ownership checks (other students' orders/documents return 404), magic-byte file
  validation, parameterised SQL, Helmet CSP, secrets in `.env`.

## Database

Tables: `users, categories, services, documents, cart_items, orders, order_items, payments,
order_status_history, collection_records, notifications, feedback, contact_messages, settings,
session`. Orders → order_items → services/documents; payments, history and collection records
reference orders; notifications and feedback reference users and orders.

## Notes

- The pages load Bootstrap, Bootstrap Icons, Chart.js and SweetAlert2 from jsDelivr, so the
  browser needs internet access.
- Uploaded documents are stored in `uploads/` and only streamed to their owner or an admin.
