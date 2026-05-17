# cal

Cloudflare deployment scaffold for running `cal.diy`-style workloads on Workers with:

- D1
- R2
- KV
- Vectorize
- AI Gateway (plus Workers AI binding)

## Prerequisites

- Node.js 22+ (required by recent `wrangler`)
- A Cloudflare account
- `npm install`

## Create Cloudflare resources

Run these once, then copy returned IDs into `/home/runner/work/cal/cal/wrangler.toml`.

```bash
npx wrangler d1 create cal-db
npx wrangler r2 bucket create cal-assets
npx wrangler kv namespace create CAL_CACHE
npx wrangler vectorize create cal-embeddings --dimensions=1536 --metric=cosine
```

Create an AI Gateway in the Cloudflare dashboard, then set:

- `AI_GATEWAY_ACCOUNT_ID`
- `AI_GATEWAY_NAME`

in `[vars]` inside `wrangler.toml`.

## Local dev and deploy

```bash
npm run dev
npm run deploy
```

This project deploys to the custom domain `cal.fly.pm` via Wrangler route configuration.

## Health endpoints

- `GET /health` → basic health check
- `GET /cloudflare/status` → shows configured Cloudflare bindings and the derived AI Gateway URL
