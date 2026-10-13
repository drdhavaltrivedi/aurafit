# AuraFit

AuraFit is a gamified fitness platform for Gen Z and Gen Alpha. Workouts earn
Aura points, daily quests and "movement snacks" build streaks, and users climb
Solo Leveling-style hunter ranks with their squads.

It ships as two clients that share one domain package:

- **Web**: an installable Next.js 15 / React 19 Progressive Web App.
- **Mobile**: an Expo (React Native) app for iOS and Android.

## Repository layout

```
.
├── packages/
│   └── shared/          @aurafit/shared: domain logic (ranks, aura, streaks, drops, permissions)
│       ├── src/         TypeScript source, compiled to dist/ (CommonJS + .d.ts)
│       │   └── api.ts   HTTP API v1 request/response types (used by web + mobile)
│       ├── test/        Vitest unit tests (+ PGlite tests that execute schema.sql)
│       └── schema.sql   Postgres/Supabase schema — single source of truth
├── apps/
│   ├── web/             Next.js 15 App Router PWA (standalone output, Dockerfile)
│   │   ├── src/app/     Pages (/, /demo, /arena, /login, …) and route handlers (/api/v1/*)
│   │   └── public/      manifest.json, sw.js (service worker), icons
│   └── mobile/          Expo app (app.json, eas.json)
├── supabase/
│   ├── migrations/      Generated copy of schema.sql (apply to the project)
│   └── seed/            Optional demo data (workout drops + seed creators)
├── scripts/db-sync.mjs  Regenerates supabase/* from schema.sql and shared seeds
├── .github/workflows/   CI
└── .env.example         Documented environment variables
```

This is an npm workspaces monorepo. `@aurafit/shared` is consumed from its
**built** `dist/` output (`main: dist/index.js`), so **build it before running
or building the apps**. `dist/` is gitignored.

## Prerequisites

- Node.js **22** (see `.nvmrc`; run `nvm use`)
- npm 10 or newer (bundled with Node 22)
- For mobile: the Expo Go app on a device, or Xcode / Android Studio simulators
- Optional: Docker, to build the production web image

## Setup

```bash
nvm use
npm ci                      # installs every workspace from package-lock.json
npm run build:shared        # compiles packages/shared to dist/
cp .env.example apps/web/.env.local   # optional, every variable is optional
```

## Scripts (repository root)

| Command | What it does |
| --- | --- |
| `npm run build:shared` | Compile `packages/shared` to `dist/` |
| `npm run dev:web` | Next.js dev server on http://localhost:3000 |
| `npm run dev:mobile` | Expo dev server (`expo start`) |
| `npm run build:web` | Production build of the web app (`.next/standalone`) |
| `npm run typecheck` | `tsc --noEmit` for shared, web and mobile |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint --workspace=apps/web` | ESLint (flat config, `eslint-config-next`) |
| `npm run db:sync` | Rebuild shared, copy `schema.sql` → migration, regenerate the demo drop seed |

## Running the web app

```bash
npm run build:shared
npm run dev:web             # http://localhost:3000
```

Production build and run without Docker:

```bash
npm run build:shared
npm run build:web
# Standalone output does not include static assets, so copy them in:
cp -R apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static
cp -R apps/web/public      apps/web/.next/standalone/apps/web/public
PORT=3000 node apps/web/.next/standalone/apps/web/server.js
```

Health check: `GET /api/health` returns JSON with status, version and uptime.

## Running the mobile app

```bash
npm run build:shared
npm run dev:mobile          # then scan the QR code with Expo Go, or press i / a
```

`npm run doctor --workspace=apps/mobile` runs `expo-doctor` to check that
dependency versions match the Expo SDK.

## Testing and quality

```bash
npm test                    # unit tests (packages/shared/test)
npm run typecheck
npm run lint --workspace=apps/web
```

CI (`.github/workflows/ci.yml`) runs on every push to `main` and on every pull
request. It runs `npm ci`, builds shared, then runs typecheck, tests, web lint
and the web build. It also builds the Docker image and smoke-tests
`/api/health`. A separate, non-blocking job runs `expo-doctor`.

`next build` skips ESLint (`eslint.ignoreDuringBuilds`) because lint runs as its
own CI step. Type errors still fail the build.

## Accounts, auth and the API (Supabase)

The web app uses **Supabase Auth** via `@supabase/ssr` (cookie sessions) and a
server-side business API at `/api/v1`. Without Supabase env vars everything
still builds and runs: `/login` explains that accounts are not configured and
links to the **local demo** at `/demo` (localStorage, persona switcher).

| Route | |
| --- | --- |
| `/` | Landing page (header shows Log in / Sign up, or the account menu) |
| `/demo` | Demo arena, no account; "Demo mode" badge + role switcher |
| `/arena` | Signed-in arena (redirects to `/login?next=/arena` when signed out) |
| `/login`, `/signup` | Email + password (min 8 chars, confirm field), Google button when enabled |
| `/forgot-password`, `/reset-password` | Recovery email → `/auth/callback` → choose a new password |
| `/auth/callback` | Exchanges `code` (OAuth/PKCE, email links) or `token_hash` for a session |

How it fits together:

- `apps/web/src/middleware.ts` refreshes the session on every request
  (`auth.getClaims()`, never `getSession()`), guards `/arena`, and sends
  signed-in users away from `/login` / `/signup`.
- Roles live in `profiles.role` (default `MEMBER`). `user_metadata` is never
  used for authorization. Change roles with SQL as the service role, or the
  server-only `public.admin_set_role(actor, target, role)` function.
- All game writes go through one Postgres function per action
  (`public.complete_quest`, `public.complete_workout`), called by the Next.js
  server with the secret key. They lock the profile row, are idempotent per
  user/item/UTC day, clamp stats to 0–100, cap aura at 5000 and apply the
  streak rule (`applyDailyStreak` in `packages/shared/src/streak.ts`, mirrored
  in SQL). EXECUTE is granted to `service_role` only.

### API v1 (contract types: `packages/shared/src/api.ts`)

Auth: the Supabase session cookie (web) **or** `Authorization: Bearer <access
token>` (mobile). Every response is JSON with `Cache-Control: no-store`; errors
are `{ "error": string, "code": ApiErrorCode }`.

| Method & path | Auth / permission | Success | Errors |
| --- | --- | --- | --- |
| `GET /api/v1/me` | signed in | `{ profile, quests }` (quests carry today's `completed`) | 401, 404 `PROFILE_NOT_FOUND` |
| `POST /api/v1/quests/{questId}/complete` | `DO_QUESTS` | `{ status: 'completed', auraEarned, statGain: { stat, amount }, profile }` | 401, 403, 404, 409 `ALREADY_COMPLETED`, 429 |
| `POST /api/v1/workouts/{dropId}/complete` | `START_WORKOUT` | `{ status: 'completed', auraEarned, profile }` | 401, 403, 404, 409, 429 |
| `GET /api/v1/drops` | public | `WorkoutDrop[]` (newest first) | 503 |
| `POST /api/v1/drops` | `PUBLISH_WORKOUT_DROP` | `201 { drop }` — body `{ title, vibe, category, duration, multiplier }` | 400 `VALIDATION_FAILED` (+`fieldErrors`), 401, 403, 413, 415, 429 |
| `GET /api/v1/leaderboard` | public | `{ hunters (top 50, public fields), squads }` | 503 |

Mutating endpoints are rate limited with an **in-memory, per-instance** token
bucket (burst 10, then 1 request / 2 s per user; `429` + `Retry-After`). With
several instances the effective limit multiplies; use a shared store for a
strict global limit. `/api/sync` is deprecated (sends `Deprecation`/`Sunset`
headers) and never persists anything.

### Setting up a Supabase project

1. **Env vars** (see `.env.example`) in `apps/web/.env.local` or your host:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (a legacy
   anon key also works), `SUPABASE_SECRET_KEY` (server only). `NEXT_PUBLIC_*`
   are inlined at build time, so **rebuild** after setting them.
2. **Apply the migration** `supabase/migrations/20261013120000_aurafit_init.sql`
   (tables, RLS, grants, signup trigger, game functions, quest seeds), e.g.
   with the Supabase MCP `apply_migration` tool, the SQL editor, or
   `supabase db push` in a linked project. It is idempotent.
   `packages/shared/schema.sql` is the source of truth: edit it, then run
   `npm run db:sync` (a test fails if the migration drifts).
3. **Optional demo drops**: run `supabase/seed/demo_workout_drops.sql` (creates
   three sign-in-less creator profiles and the seed workout drops).
4. **Auth → URL configuration**: set *Site URL* to your app origin and add
   redirect URLs for every environment, e.g.
   `http://localhost:3000/auth/callback`, `https://<your-domain>/auth/callback`
   (wildcards such as `https://*-yourteam.vercel.app/auth/callback` work for previews).
5. **Google sign-in** (optional): create an OAuth client (Web application) in
   Google Cloud Console with the authorized redirect URI
   `https://<project-ref>.supabase.co/auth/v1/callback`, then enable
   *Auth → Providers → Google* with its client ID/secret. The button appears
   automatically once the provider is enabled.
6. Keep **`private`** out of the Data API's exposed schemas (it holds the
   SECURITY DEFINER helpers), and run the security advisors after migrating.

## Docker (web)

The image uses Next.js `output: 'standalone'`. It installs only the web and
shared workspaces (no Expo/React Native dependencies), runs as a non-root user
and has a `HEALTHCHECK` on `/api/health`. Build it from the **repository
root**:

```bash
docker build -f apps/web/Dockerfile -t aurafit-web .
docker run --rm -p 3000:3000 --env-file apps/web/.env.local aurafit-web
curl http://localhost:3000/api/health
```

`NEXT_PUBLIC_*` variables are inlined at build time. Pass them with
`--build-arg` (for example `--build-arg NEXT_PUBLIC_APP_URL=https://aurafit.app`).
Server-only secrets such as `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
read at runtime, so pass them with `--env-file` or `-e`.

## Deployment notes

- **Environment variables**: see `.env.example`. Every variable is documented
  there and all are optional (without Supabase the app runs in demo mode). Never put secrets in `NEXT_PUBLIC_*` or
  `EXPO_PUBLIC_*` variables, because they ship to clients. Do not set
  `NODE_ENV` manually.
- **Web hosting**: the Docker image works on any container platform (Fly.io,
  Render, Cloud Run, ECS, Kubernetes). It listens on `PORT` (default 3000) and
  binds `0.0.0.0`. Terminate TLS at the proxy or load balancer. The app sends
  `Strict-Transport-Security`, so serve it over HTTPS only. Vercel also works
  with no changes.
- **Security headers** are set in `apps/web/next.config.mjs`: CSP,
  `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy,
  Permissions-Policy and HSTS. The CSP allows `'unsafe-inline'` scripts, which
  Next.js needs for inline RSC payloads unless nonce middleware is added.
  `'unsafe-eval'` is allowed in development only. `connect-src` allows
  `https://*.supabase.co` / `wss://*.supabase.co` (plus a custom
  `NEXT_PUBLIC_SUPABASE_URL` origin at build time); `form-action` allows the
  Supabase/Google OAuth redirect. If you add another third-party origin
  (analytics, Sentry), add it to `connect-src` and the other relevant directives.
- **Mobile (EAS)**: build profiles `development`, `preview` and `production`
  are defined in `apps/mobile/eas.json`.
  ```bash
  npm i -g eas-cli && eas login
  cd apps/mobile
  eas build --platform all --profile production
  eas submit --platform ios --profile production
  ```
  Set `EXPO_PUBLIC_*` values as EAS environment variables or secrets. Build
  `packages/shared` before bundling, because EAS runs from the monorepo root.
  Native `ios/` and `android/` directories are generated (prebuild) and are
  gitignored.

## PWA notes

- `public/manifest.json` makes the app installable. `public/sw.js` is
  registered from the root layout.
- `sw.js` is served with `Cache-Control: no-cache` and
  `Service-Worker-Allowed: /`, so browsers always check for a new worker.
- **When you deploy changes to cached assets, bump `CACHE_NAME` in
  `public/sw.js`.** The `activate` handler then purges old caches.
- Service workers require HTTPS. `localhost` is exempt during development.
- Test installability with Chrome DevTools: Application, then Manifest and
  Service Workers, or run a Lighthouse PWA audit.

## License

MIT
