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
│   └── shared/          @aurafit/shared: domain logic (ranks, aura, quests, sync, permissions)
│       ├── src/         TypeScript source, compiled to dist/ (CommonJS + .d.ts)
│       ├── test/        Vitest unit tests
│       └── schema.sql   Reference Postgres/Supabase schema
├── apps/
│   ├── web/             Next.js 15 App Router PWA (standalone output, Dockerfile)
│   │   ├── src/app/     Pages and route handlers (/api/health, /api/sync)
│   │   └── public/      manifest.json, sw.js (service worker), icons
│   └── mobile/          Expo app (app.json, eas.json)
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
  there and all are currently optional. Never put secrets in `NEXT_PUBLIC_*` or
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
  `'unsafe-eval'` is allowed in development only. If you add a third-party
  origin (analytics, Supabase, Sentry), add it to `connect-src` and the other
  relevant directives.
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
