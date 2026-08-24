# Slow Fit CR

Responsive Next.js + Ant Design rebuild of the Slow Fit CR landing page, with locale routes for Spanish and English.

## Architecture

This repository now runs with a split architecture:

- Frontend: Next.js app (this repository root)
- Backend: Node service in `backend/server.mjs`
- Contract: Frontend routes under `/api/*` proxy to backend `/api/*` via `app/api/[...path]/route.ts`

This keeps UI delivery and business/data workflows separated while preserving same-origin API URLs for the browser.

## Local development

Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000/es` or `http://localhost:3000/en`.

## Docker run (frontend + backend + postgres)

1. Copy `.env.docker.example` to `.env.docker` and fill required values.
2. Start both services:

```bash
npm run docker:up
```

3. Stop services:

```bash
npm run docker:down
```

4. Follow logs:

```bash
npm run docker:logs
```

Compose services:

- `frontend` at `http://localhost:3000`
- `backend` at `http://localhost:8080`
- `postgres` at `localhost:5433` on the host and `postgres:5432` inside Docker

PostgreSQL durable state is persisted in Docker volume `slowfit-postgres-data`.

If you run the backend outside Docker, install backend dependencies first:

```bash
cd backend
npm install
npx prisma generate
```

Database changes are committed under `backend/prisma/migrations` and applied at backend startup with `prisma migrate deploy`. For a database that was previously created with `prisma db push`, baseline it once before the first migrated deployment:

```bash
cd backend
npx prisma migrate resolve --applied 20260815004500_init
```

Do not baseline a new empty database; `npm run db:migrate` will create its schema from the migration history.

## Tests

The backend test command enforces a minimum of 80% line coverage with Node's native test runner. The current measured coverage is 82.56% lines and 88.24% functions across `backend/server.mjs`.

Backend integration tests require PostgreSQL and a migrated test database:

```bash
cd backend
DATABASE_URL=postgresql://slowfit:slowfit@localhost:5433/slowfit_migration_test?schema=public npm run db:migrate
DATABASE_URL=postgresql://slowfit:slowfit@localhost:5433/slowfit_migration_test?schema=public npm test
```

Playwright starts isolated frontend and backend servers and uses `TEST_DATABASE_URL` when provided:

```bash
npx playwright install chromium
TEST_DATABASE_URL=postgresql://slowfit:slowfit@localhost:5433/slowfit_migration_test?schema=public npm run test:e2e
```

The GitHub Actions workflow runs migrations, lint, build, backend integration tests, and browser tests against PostgreSQL on every pull request and push to `master`.

See [CURRENT_TO_PROD.md](CURRENT_TO_PROD.md) for the remaining staging and production rollout work.

## Environment variables

Create a `.env.local` file and configure:

```bash
# External bank payment adapter (BAC or another supported bank)
PAYMENT_PROVIDER_URL=https://payments.example.com/session
PAYMENT_PROVIDER_TOKEN=set-a-provider-token
PAYMENT_WEBHOOK_SECRET=set-a-long-random-secret
STORE_CURRENCY=CRC

# Internal product media (Cloudflare R2)
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret
R2_BUCKET_NAME=slowfit-products
R2_PUBLIC_URL=https://media.slowfitcr.com

# Analytics
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
ANALYTICS_WEBHOOK_URL=https://your-analytics-endpoint.example.com/events

# Checkout and order forwarding
ORDER_EVENTS_WEBHOOK_URL=https://your-backoffice-endpoint.example.com/orders
CRM_ORDER_WEBHOOK_URL=https://your-crm-endpoint.example.com/orders
OUTBOUND_WEBHOOK_SECRET=set-a-long-random-secret
WEBHOOK_TIMEOUT_MS=2000
WEBHOOK_MAX_ATTEMPTS=2

# Transactional email
RESEND_API_KEY=your_resend_api_key
ORDER_CONFIRM_FROM=Slow Fit <orders@yourdomain.com>
ACCOUNT_RESET_FROM=Slow Fit <accounts@yourdomain.com>

# Contact capture
CONTACT_WEBHOOK_URL=https://your-crm-endpoint.example.com/contact

# Reviews and moderation
REVIEWS_MODERATION_WEBHOOK_URL=https://your-moderation-endpoint.example.com/reviews
REVIEW_MODERATION_TOKEN=set-a-strong-shared-token
REVIEW_MODERATION_SESSION_SECRET=set-a-long-random-secret
CUSTOMER_SESSION_SECRET=set-a-different-long-random-secret

# Prisma / PostgreSQL
DATABASE_URL=postgresql://slowfit:slowfit@postgres:5432/slowfit?schema=public
MAX_REQUEST_BODY_BYTES=1048576
APP_ORIGINS=https://slowfitcr.com,https://www.slowfitcr.com
APP_ORIGIN=https://slowfitcr.com
LOGIN_FAILURE_LIMIT=5
LOGIN_LOCKOUT_MS=900000
PASSWORD_RESET_MAX_AGE_MS=1800000
```

Products, variants, stock, tags, prices, sale prices, and image metadata are stored in PostgreSQL. Product files are uploaded directly to Cloudflare R2 using five-minute signed URLs. Configure bucket CORS to allow `PUT` from the admin site origin.

## Production deployment checklist

Split the production deployment into two runtimes:

- Frontend runtime: Next.js / OpenNext worker
- Backend runtime: Node service with direct PostgreSQL access

Required backend secrets:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB?schema=public
REVIEW_MODERATION_TOKEN=set-a-strong-shared-token
REVIEW_MODERATION_SESSION_SECRET=set-a-long-random-secret
CUSTOMER_SESSION_SECRET=set-a-different-long-random-secret
OUTBOUND_WEBHOOK_SECRET=set-a-long-random-secret
PAYMENT_PROVIDER_URL=https://payments.example.com/session
PAYMENT_PROVIDER_TOKEN=set-a-provider-token
PAYMENT_WEBHOOK_SECRET=set-a-long-random-secret
STORE_CURRENCY=CRC
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret
R2_BUCKET_NAME=slowfit-products
R2_PUBLIC_URL=https://media.slowfitcr.com
```

Production startup requires the moderation token and both session secrets to contain at least 32 characters and to be distinct.

Optional but recommended backend integrations:

```bash
ORDER_EVENTS_WEBHOOK_URL=https://your-backoffice-endpoint.example.com/orders
CRM_ORDER_WEBHOOK_URL=https://your-crm-endpoint.example.com/orders
CONTACT_WEBHOOK_URL=https://your-crm-endpoint.example.com/contact
ANALYTICS_WEBHOOK_URL=https://your-analytics-endpoint.example.com/events
REVIEWS_MODERATION_WEBHOOK_URL=https://your-moderation-endpoint.example.com/reviews
RESEND_API_KEY=your_resend_api_key
ORDER_CONFIRM_FROM=Slow Fit <orders@yourdomain.com>
WEBHOOK_TIMEOUT_MS=2000
WEBHOOK_MAX_ATTEMPTS=2
MAX_REQUEST_BODY_BYTES=1048576
```

When `OUTBOUND_WEBHOOK_SECRET` is configured, deliveries include `X-Slowfit-Timestamp` and an
`X-Slowfit-Signature` containing the Base64-encoded HMAC-SHA256 of `<timestamp>.<raw-body>`.

Payment providers must return the checkout `reference` and preserve each item's `variantId` and
`quantity` in `payment.paid` webhooks. The backend deducts inventory and records the order in one
serializable transaction. Repeated paid events for the same reference do not deduct stock again.

`CONTACT_WEBHOOK_URL` must accept an HTTPS `POST` with `Content-Type: application/json` and this body:

```json
{
	"source": "slowfit-backend",
	"name": "Customer name",
	"email": "customer@example.com",
	"message": "Contact message",
	"locale": "es",
	"createdAt": "2026-08-21T12:00:00.000Z"
}
```

The receiver must return a 2xx response. Slow Fit retries transient failures according to
`WEBHOOK_MAX_ATTEMPTS`. When `OUTBOUND_WEBHOOK_SECRET` is set, the receiver must verify the
`X-Slowfit-Timestamp` and `X-Slowfit-Signature` headers before accepting the lead.

Customer logins are locked for 15 minutes after five consecutive failures by default. Password recovery links are stored as hashes, expire after 30 minutes, and can only be used once. Reset email delivery uses `ACCOUNT_RESET_FROM` when set, otherwise `ORDER_CONFIRM_FROM`.

Required frontend secrets:

```bash
NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

Production rollout steps:

1. Provision PostgreSQL and run Prisma against the production `DATABASE_URL`.
2. Deploy the backend with the secrets above and verify `/health/live` and `/health/ready`.
3. Deploy the frontend with `NEXT_PUBLIC_BACKEND_URL` pointed at the backend origin.
4. Configure R2 CORS and verify image uploads from the admin origin.
5. Configure the BAC or bank adapter and verify a signed checkout handoff.
6. Verify admin login, catalog management, review moderation, and checkout after deploy.

## New API endpoints

- `GET /api/catalog/products` lists active internal products and supports tag/search filters.
- `GET /api/catalog/products/:handle` returns an active internal product.
- `GET|POST /api/admin/catalog/products` lists or creates products for authenticated admins.
- `PUT|DELETE /api/admin/catalog/products/:id` updates or deletes an internal product.
- `POST /api/admin/catalog/images/presign` creates a temporary Cloudflare R2 upload URL.
- `POST /api/cart/checkout` validates internal prices and stock, then creates a bank payment session.
- `POST /api/events` ingests conversion and UX events server-side.
- `POST /api/webhooks/payments` receives signed payment-provider webhooks.
- `GET /api/reviews?productHandle=...&locale=...` reads approved reviews.
- `GET /api/reviews/pending` returns pending reviews for authenticated moderators.
- `POST /api/reviews/submit` submits a review for moderation.
- `POST /api/reviews/moderate` approves/rejects pending reviews (admin session cookie or `x-moderation-token`).
- `POST /api/admin/login` and `POST /api/admin/logout` manage moderation sessions.
- `GET /api/admin/audit-logs` returns audit log entries.
- `GET /api/admin/webhooks/payments` lists persisted payment webhook deliveries.
- `POST /api/admin/webhooks/payments/replay` replays a previously processed payment webhook event.
- `GET /health/live` and `GET /health/ready` provide liveness and readiness checks.

## Backend implementation phases (completed)

Phase 1: PostgreSQL persistence (Prisma ORM)

- Reviews, audit logs, and webhook deliveries now persist in PostgreSQL via Prisma models.

Phase 2: Webhook idempotency and replay operations

- Payment webhook handling stores idempotency keys and ignores duplicate deliveries.
- Webhook deliveries are queryable from admin ops and can be replayed manually.

Phase 3: Operational hardening

- Backend includes request rate limiting and structured JSON logging.
- Backend readiness depends on live database connectivity.

## Project notes

- App Router with locale deep links at `/es` and `/en`
- Root route redirects by browser language preference
- Ant Design UI with local image assets under `public/slowfit`
- Cloudflare Workers deployment via OpenNext

## Cloudflare deployment

This app is configured for Cloudflare Workers, not static Pages, because it uses server-side locale routing.

### Required repo files

- `wrangler.jsonc`
- `open-next.config.ts`
- Cloudflare scripts in `package.json`

### Local Cloudflare validation

```bash
npm run preview
```

This builds the app with the OpenNext Cloudflare adapter and runs it in the Workers runtime locally.

### Deploy from local machine

```bash
npm run deploy
```

### Deploy from Cloudflare dashboard

If your repository is already linked in Cloudflare:

1. Create a Workers project from the Git repo, or use Workers Builds rather than static Pages.
2. Build command: `npm run deploy`
3. Install command: `npm install`
4. Production branch: your default branch

If Cloudflare only allows a build step in the dashboard and handles deploy itself, use:

1. Build command: `npx opennextjs-cloudflare build`
2. Build output directory: `.open-next/assets`
3. Worker entrypoint: `.open-next/worker.js`

### Domain

Once the deployment succeeds, attach your DNS/custom domain in the Cloudflare dashboard to the Worker project.
