# Current to Production

## Current state

The application is ready for a staging deployment:

- Responsive bilingual Next.js storefront
- Internal product catalog, inventory, images, tags, prices, and discounts
- Persistent cart and bank payment handoff
- PostgreSQL persistence through Prisma migrations
- Review submission, moderation history, audit logs, and webhook replay
- Backend health checks, rate limiting, structured logs, and payment webhook idempotency
- CI gates for lint, build, database migrations, backend tests, and Playwright tests
- Backend coverage gate at 80% lines; current coverage is 82.56%

Production is not yet live. Infrastructure, production credentials, payment-provider configuration, monitoring, and a staging acceptance pass remain.

## 1. Provision staging

- Provision managed PostgreSQL with automated backups, point-in-time recovery, TLS, and restricted network access.
- Deploy the Node backend to a runtime that supports long-lived Node processes and direct PostgreSQL connectivity.
- Deploy the Next.js frontend through the configured OpenNext Cloudflare Worker path.
- Use separate staging domains, for example `staging.slowfitcr.com` and `api-staging.slowfitcr.com`.
- Keep staging payment-provider credentials and webhook endpoints separate from production.

Exit criteria:

- `GET /health/live` returns 200.
- `GET /health/ready` returns 200 and confirms database readiness.
- Frontend API proxy reaches the staging backend.
- CI passes on the deployed commit.

## 2. Configure secrets

Backend secrets:

- `DATABASE_URL`
- `REVIEW_MODERATION_TOKEN`
- `REVIEW_MODERATION_SESSION_SECRET`
- `CUSTOMER_SESSION_SECRET`
- `PAYMENT_PROVIDER_URL`
- `PAYMENT_PROVIDER_TOKEN`
- `PAYMENT_WEBHOOK_SECRET`
- `STORE_CURRENCY`
- `DELIVERY_PICKUP_NAME`
- `DELIVERY_PICKUP_PHONE`
- `DELIVERY_PICKUP_ADDRESS`
- `DELIVERY_PICKUP_CITY`
- `DELIVERY_PICKUP_STATE`
- `DELIVERY_PICKUP_COUNTRY`
- `DELIVERY_PICKUP_LATITUDE`
- `DELIVERY_PICKUP_LONGITUDE`
- `DELIVERY_PICKUP_NOTES`
- `UBER_DIRECT_CLIENT_ID`
- `UBER_DIRECT_CLIENT_SECRET`
- `UBER_DIRECT_CUSTOMER_ID`
- `UBER_DIRECT_WEBHOOK_SIGNING_KEY`
- `DIDI_DELIVERY_GATEWAY_URL`
- `DIDI_DELIVERY_GATEWAY_TOKEN`
- `DIDI_DELIVERY_WEBHOOK_SECRET`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`
- `OUTBOUND_WEBHOOK_SECRET`
- `ORDER_EVENTS_WEBHOOK_URL`
- `CRM_ORDER_WEBHOOK_URL`
- `CONTACT_WEBHOOK_URL`
- `ANALYTICS_WEBHOOK_URL`
- `REVIEWS_MODERATION_WEBHOOK_URL`
- `RESEND_API_KEY`
- `ORDER_CONFIRM_FROM`
- `ACCOUNT_RESET_FROM`
- `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` (one-time operator provisioning)
- `ADMIN_BOOTSTRAP_TOTP_SECRET` (optional Base32 TOTP secret; store in the secret manager)

Backend delivery and request limits:

- `WEBHOOK_TIMEOUT_MS` (default `2000`)
- `WEBHOOK_MAX_ATTEMPTS` (default `2`, maximum `3`)
- `OUTBOX_MAX_ATTEMPTS` (default `8`, maximum `12`)
- `INVENTORY_RESERVATION_MAX_AGE_MS` (default `900000`)
- `PRESIGNED_URL_EXPIRY_SECONDS` (default `300`, range `60-3600`)
- `PASSWORD_RESET_RATE_LIMIT_MAX` (default `3` per email)
- `PASSWORD_RESET_RATE_LIMIT_WINDOW_MS` (default `3600000`)
- `MAX_REQUEST_BODY_BYTES` (default `1048576`)
- `PASSWORD_RESET_MAX_AGE_MS` (default `1800000`)

Frontend configuration:

- `NEXT_PUBLIC_BACKEND_URL`
- `NEXT_PUBLIC_GA_ID`

Requirements:

- Generate unique high-entropy moderation secrets for each environment.
- Ensure `REVIEW_MODERATION_TOKEN`, `REVIEW_MODERATION_SESSION_SECRET`, and `CUSTOMER_SESSION_SECRET` are distinct and at least 32 characters before deployment; the backend refuses to start otherwise.
- Configure downstream systems to verify `X-Slowfit-Timestamp` and `X-Slowfit-Signature` before enabling outbound signing.
- Set `APP_ORIGINS` to the comma-separated production storefront origins.
- Set `APP_ORIGIN` to the canonical storefront origin used in password recovery links.
- Review `LOGIN_FAILURE_LIMIT` and `LOGIN_LOCKOUT_MS` with customer support before launch.
- Request and complete a password reset in each locale to verify Resend delivery and link routing.
- Confirm Uber Direct availability in Costa Rica, complete its pilot, and register `/api/webhooks/deliveries/uber` before enabling production credentials.
- Obtain DiDi's private merchant API contract and implement its field mapping behind the documented gateway before setting `DIDI_DELIVERY_GATEWAY_URL`.
- Geocode the Barva pickup address, verify its map pin, and define pickup hours and courier instructions.
- Exercise quote expiry, provider unavailability, dispatch retry, cancellation, and completed-delivery tracking in staging.
- Store secrets in platform secret managers, never committed files.
- Restrict production database credentials to the backend runtime.
- Document secret rotation ownership and cadence.

## 3. Apply database migrations

For a new database:

```bash
cd backend
npm ci
npx prisma generate
npm run db:migrate
```

For an existing database previously created with `prisma db push`, verify that its schema matches the initial migration and baseline it once:

```bash
npx prisma migrate resolve --applied 20260815004500_init
npm run db:migrate
```

Before every production migration:

- Confirm a recent restorable backup.
- Review generated SQL and expected lock duration.
- Test the migration against a staging copy of production-like data.
- Define the rollback or forward-fix procedure.

## 4. Configure payments and product media

- Configure the BAC or bank session endpoint and provider token.
- Register provider callbacks against `POST /api/webhooks/payments` on the backend origin.
- Configure the same `PAYMENT_WEBHOOK_SECRET` in the provider and backend.
- Confirm `payment.paid` callbacks preserve the checkout `reference` plus every item's `variantId` and `quantity`; inventory deduction rejects incomplete paid events.
- Configure the R2 bucket, public media domain, and CORS for the admin origin.
- Verify duplicate deliveries return success without duplicating downstream processing.
- Verify failed deliveries appear in Admin Operations and can be replayed.

## 5. Staging acceptance

Run automated gates:

```bash
npm ci
npm --prefix backend ci
npm run lint
npm run build
npm run test:backend
npx playwright install chromium
npm run test:e2e
```

Perform manual acceptance on desktop and mobile:

- Spanish and English navigation
- Collection and product routes
- Variant selection, cart persistence, quantity changes, and checkout redirect
- Contact submission
- Review submission, approval/rejection, history search, and pagination
- Admin login, refresh persistence, logout, audit filters, and webhook replay
- Policy pages, sitemap, robots, analytics, transactional email, and CRM forwarding
- Keyboard navigation, focus visibility, readable errors, and responsive layouts

Exit criteria:

- No critical or high-severity defects.
- Real bank sandbox checkout succeeds with a test product.
- Order webhook reaches every configured downstream integration.
- Monitoring captures a controlled backend error and a readiness failure.

## 6. Production observability and operations

Before launch:

- Centralize backend JSON logs with request ID, status, duration, and environment.
- Add uptime checks for frontend, `/health/live`, and `/health/ready`.
- Add a protected dashboard check for `/health/metrics` and alert on failed outbox jobs or active reservation growth.
- Alert on elevated 5xx rates, readiness failures, webhook failures, and database saturation.
- Configure error tracking for frontend and backend exceptions.
- Define log retention without storing unnecessary customer data.
- Verify database backup restoration, not only backup creation.
- Create an incident runbook with owners, escalation contacts, and rollback commands.

## 7. Production release

Recommended release order:

1. Freeze the release commit after CI passes.
2. Back up the production database.
3. Deploy the backend and run `prisma migrate deploy`.
4. Verify backend liveness and readiness.
5. Deploy the frontend with the production backend URL.
6. Register or enable payment-provider production webhooks.
7. Run checkout, review moderation, and webhook smoke tests.
8. Monitor logs, errors, webhook failures, and conversion events during the launch window.

Rollback triggers:

- Checkout creation failure
- Database migration or readiness failure
- Repeated webhook processing failures
- Authentication/session regression
- Sustained elevated 5xx rate

Rollback actions:

- Restore the previous frontend and backend artifacts.
- Disable new webhook subscriptions if they amplify failures.
- Prefer a forward database fix; restore only from a verified backup when required.
- Preserve logs and failed webhook records for investigation and replay.

## 8. Post-launch follow-up

Within 24 hours:

- Review errors, latency, checkout conversion, contact delivery, and webhook processing.
- Confirm backups and alerts are operating.
- Replay any safe failed webhook events.

Within 7 days:

- Review accessibility and mobile analytics.
- Rotate any temporary launch credentials.
- Prioritize production findings and add regression tests.
- Reassess the coverage threshold and raise it as new modules receive direct tests.

## 9. Open feature work before launch

Status of the customer database, barcode labels, POS link, shipping guides, and electronic invoicing. The first group is built and needs a database to verify; the second and third are blocked on third-party access.

### Built, not yet verified against a database

The new backend tests were written but never run: the machine used for development had no PostgreSQL. Do this on staging or in CI:

- [ ] Apply the migrations `20261021120000_add_customer_contact` and `20261021140000_add_cabys_and_invoice_request` (see section 3) and run `npm run test:backend`.
- [ ] Place a staging order with an email and the consent box checked. Confirm one `CustomerContact` row (name, phone, consent, orders count) and that a second order raises the count without clearing the phone or consent.
- [ ] Confirm `/admin/customers` lists, searches, and exports the contact to CSV.
- [ ] Print a sheet of barcode labels (roll 50 x 25 mm and A4 3 x 7) on the real printer and scan them with the real scanner. The Code 128 encoding was checked against a reference library, but print quality and label stock were not.
- [ ] Confirm Uber Direct and DiDi still quote and dispatch with the new province, canton, and district fields (the district is now part of the courier street address).
- [ ] Add a Playwright test for the delivery form (location selects, email, invoice block). There is none today.
- [ ] Give every variant a SKU. Labels and the Loyverse sync skip variants without one.
- [ ] Update the privacy policy for the stored contact data and consent, and confirm with a lawyer whether the customer database must be registered under Costa Rica's data protection law (Ley 8968).
- [ ] Decide how consented contacts will be used. Consent is stored but nothing sends marketing email yet.

### Loyverse point of sale

- [ ] Loyverse cannot be embedded in an iframe (its login sends `X-Frame-Options: sameorigin`), so `/admin/pos` opens it in a new tab. Decide whether that is enough or whether an in-house POS screen is needed.

### Correos de Costa Rica (Pymexpress) — not started

Blocked on access. Needed from Correos:

- [ ] Web service documentation, sandbox and production credentials, and the contract or account number.

Then build:

- [ ] A `correos` provider in `backend/delivery-providers.mjs` (quote, dispatch, cancel) and its tests. The district code from the location selects gives the province, canton, and district Correos requires.
- [ ] Weight per product, or a default weight in settings, for the rate.
- [ ] Migration for tracking number, label PDF, weight, and service on `Delivery`.
- [ ] A "Generate guide" button and label print in `app/delivery-ops-panel.tsx`, and the tracking number shown to the customer.
- [ ] Add `"correos"` to the provider types in `app/cart/cart-context.tsx` and `app/delivery-ops-panel.tsx`, and to the webhook route if Correos sends status updates.
- [ ] Define the provider environment variables and add them to section 2.

### Electronic invoicing with Hacienda (TRIBU-CR, v4.4) — requests captured, issuing not started

Done: product `cabys` field, the checkout "I want an electronic invoice" block, the `InvoiceRequest` table, and `/admin/invoices`. Requests stay in status `REQUESTED`.

Blocked on access. Needed from Hacienda and the business:

- [ ] Registration as an invoice issuer in TRIBU-CR, with an API user, the cryptographic key (`.p12`) and its PIN, and sandbox credentials.
- [ ] The current v4.4 technical annex. Confirm the API and authentication endpoints from official documentation; the portal domain is `ovitribucr.hacienda.go.cr`, not the one first mentioned.
- [ ] A CABYS code on every product (the field is optional today) and the tax treatment for each, including 13% IVA.

Then build:

- [ ] `backend/hacienda-invoice.mjs`: build the v4.4 XML, sign it, send it through the outbox queue with retries, and poll for acceptance or rejection.
- [ ] Consecutive numbering and the 50-digit key, with a safeguard against numbering gaps and duplicates.
- [ ] Move `InvoiceRequest` through `ISSUED`, `FAILED`, and `CANCELLED`, and store the sent XML and Hacienda's response.
- [ ] PDF representation, email delivery with Resend, and download of the XML and PDF from the customer account and the admin.
- [ ] Credit notes for cancelled orders (`backend/order-admin.mjs` cancellation path).
- [ ] Let preorders and logged-in customers request an invoice after payment. Preorders skip the delivery form today, so they cannot ask for one.
- [ ] Keep the key, PIN, and API credentials only in backend secrets and validate them in `validateProductionConfiguration`. Test everything in the Hacienda sandbox before any production invoice.
