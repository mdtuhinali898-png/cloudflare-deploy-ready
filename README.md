# Cloudflare Deploy Ready

EduSmart SMS runs as a Cloudflare Worker, serves the frontend from Cloudflare Assets, and uses Supabase for its database.

## Deployment

The `main` branch deploys to the existing Worker named `edusmart-sms`, keeping the current `workers.dev` address. GitHub Actions deploys the Worker after the repository secrets below are configured.

In GitHub, open **Settings → Secrets and variables → Actions** and add:

- `CLOUDFLARE_API_TOKEN` — a newly created token with permission to edit Workers Scripts for this account. Revoke any token shared in chat.
- `SUPABASE_SERVICE_ROLE_KEY` — a newly rotated Supabase server-side key. Never use this value in frontend code or commit it.
- `JWT_SECRET` — a new random secret used to sign student portal sessions.

Generate a JWT secret locally with Node.js:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

After saving the three values as GitHub Actions secrets, push to `main` or run **Deploy Cloudflare Worker** from the Actions tab. The workflow uploads the application secrets directly to Cloudflare and does not print their values.

For local development, put `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `JWT_SECRET` in `backend/.env`. Start the local server with `npm start`, or run the Worker emulator with `npm run dev:worker`.

## Source layout

- `frontend/` — HTML, styles, and browser-side scripts served as static assets.
- `backend/routes/` — API routes.
- `backend/app.js` — Express application shared by local Node.js and the Worker.
- `backend/worker.mjs` — Cloudflare Worker entry point.
- `wrangler.toml` — Cloudflare Worker and asset configuration.

Database schema changes in `backend/migrations/` must be applied to the Supabase project before using features that depend on them.
