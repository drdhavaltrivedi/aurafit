# syntax=docker/dockerfile:1
#
# Production image for the AuraFit web PWA (Next.js standalone output).
#
# Build from the REPOSITORY ROOT so the workspace lockfile and packages/shared
# are part of the build context:
#
#   docker build -f apps/web/Dockerfile -t aurafit-web .
#   docker run --rm -p 3000:3000 aurafit-web
#
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: install only the workspaces the web app needs (skips Expo/React Native)
# ---------------------------------------------------------------------------
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
# The mobile manifest must exist so the lockfile's workspace graph resolves,
# but its dependencies are not installed.
COPY apps/mobile/package.json ./apps/mobile/
RUN --mount=type=cache,target=/root/.npm \
    npm ci \
      --workspace=packages/shared \
      --workspace=apps/web \
      --include-workspace-root \
      --no-audit --no-fund \
 && mkdir -p apps/web/node_modules packages/shared/node_modules

# ---------------------------------------------------------------------------
# builder: compile the shared package, then the Next.js app
# ---------------------------------------------------------------------------
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# NEXT_PUBLIC_* values are inlined at build time; pass them as build args.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

RUN npm run build --workspace=packages/shared \
 && npm run build --workspace=apps/web

# ---------------------------------------------------------------------------
# runner: minimal image with the standalone server only
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs \
 && adduser -S -u 1001 -G nodejs nextjs

# Standalone output is rooted at the monorepo root (outputFileTracingRoot),
# so the server lives at apps/web/server.js.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "apps/web/server.js"]
