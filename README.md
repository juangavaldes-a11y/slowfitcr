# Slow Fit CR

Responsive Next.js + Ant Design rebuild of the Slow Fit CR landing page, with locale routes for Spanish and English.

## Local development

Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000/es` or `http://localhost:3000/en`.

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
