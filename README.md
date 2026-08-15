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

## Environment variables

Create a `.env.local` file and configure:

```bash
# Shopify storefront
SHOPIFY_STORE_DOMAIN=your-shop.myshopify.com
SHOPIFY_STOREFRONT_ACCESS_TOKEN=your_storefront_token

# Shopify order webhook signature verification
SHOPIFY_WEBHOOK_SECRET=your_shopify_webhook_secret

# Analytics
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
ANALYTICS_WEBHOOK_URL=https://your-analytics-endpoint.example.com/events

# Checkout and order forwarding
ORDER_EVENTS_WEBHOOK_URL=https://your-backoffice-endpoint.example.com/orders
CRM_ORDER_WEBHOOK_URL=https://your-crm-endpoint.example.com/orders

# Transactional email
RESEND_API_KEY=your_resend_api_key
ORDER_CONFIRM_FROM=Slow Fit <orders@yourdomain.com>

# Contact capture
CONTACT_WEBHOOK_URL=https://your-crm-endpoint.example.com/contact

# Reviews and moderation
JUDGEME_SHOP_DOMAIN=your-shop.myshopify.com
JUDGEME_PRIVATE_API_TOKEN=your_judgeme_token
REVIEWS_MODERATION_WEBHOOK_URL=https://your-moderation-endpoint.example.com/reviews
REVIEW_MODERATION_TOKEN=set-a-strong-shared-token
REVIEW_MODERATION_SESSION_SECRET=set-a-long-random-secret

# Prisma / PostgreSQL
DATABASE_URL=postgresql://slowfit:slowfit@postgres:5432/slowfit?schema=public
```

If Shopify credentials are not set, the storefront uses fallback catalog data so UI routes still work.

## Production deployment checklist

Split the production deployment into two runtimes:

- Frontend runtime: Next.js / OpenNext worker
- Backend runtime: Node service with direct PostgreSQL access

Required backend secrets:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB?schema=public
REVIEW_MODERATION_TOKEN=set-a-strong-shared-token
REVIEW_MODERATION_SESSION_SECRET=set-a-long-random-secret
SHOPIFY_WEBHOOK_SECRET=your_shopify_webhook_secret
```

Optional but recommended backend integrations:

```bash
ORDER_EVENTS_WEBHOOK_URL=https://your-backoffice-endpoint.example.com/orders
CRM_ORDER_WEBHOOK_URL=https://your-crm-endpoint.example.com/orders
CONTACT_WEBHOOK_URL=https://your-crm-endpoint.example.com/contact
ANALYTICS_WEBHOOK_URL=https://your-analytics-endpoint.example.com/events
REVIEWS_MODERATION_WEBHOOK_URL=https://your-moderation-endpoint.example.com/reviews
RESEND_API_KEY=your_resend_api_key
ORDER_CONFIRM_FROM=Slow Fit <orders@yourdomain.com>
```

Required frontend secrets:

```bash
NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
SHOPIFY_STORE_DOMAIN=your-shop.myshopify.com
SHOPIFY_STOREFRONT_ACCESS_TOKEN=your_storefront_token
```

Production rollout steps:

1. Provision PostgreSQL and run Prisma against the production `DATABASE_URL`.
2. Deploy the backend with the secrets above and verify `/health/live` and `/health/ready`.
3. Deploy the frontend with `NEXT_PUBLIC_BACKEND_URL` pointed at the backend origin.
4. Register the Shopify order webhook against `POST /api/webhooks/shopify/orders` on the backend.
5. Verify admin login, review moderation, checkout handoff, and webhook replay after deploy.

## New API endpoints

- `POST /api/cart/checkout` creates a Shopify cart and returns checkout URL.
- `POST /api/cart/checkout` also reuses `cartId` and syncs line items when provided.
- `POST /api/events` ingests conversion and UX events server-side.
- `POST /api/webhooks/shopify/orders` receives verified Shopify order webhooks.
- `GET /api/reviews?productHandle=...&locale=...` reads approved reviews.
- `GET /api/reviews/pending` returns pending reviews for authenticated moderators.
- `POST /api/reviews/submit` submits a review for moderation.
- `POST /api/reviews/moderate` approves/rejects pending reviews (admin session cookie or `x-moderation-token`).
- `POST /api/admin/login` and `POST /api/admin/logout` manage moderation sessions.
- `GET /api/admin/audit-logs` returns audit log entries.
- `GET /api/admin/webhooks/orders` lists persisted order webhook deliveries.
- `POST /api/admin/webhooks/orders/replay` replays a previously processed order webhook event.
- `GET /health/live` and `GET /health/ready` provide liveness and readiness checks.

## Backend implementation phases (completed)

Phase 1: PostgreSQL persistence (Prisma ORM)

- Reviews, audit logs, and webhook deliveries now persist in PostgreSQL via Prisma models.

Phase 2: Webhook idempotency and replay operations

- Shopify order webhook handler stores idempotency keys and ignores duplicate deliveries.
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
