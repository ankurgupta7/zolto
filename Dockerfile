# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependency manifests first (layer cache)
# pnpm-lock.yaml IS committed — use it for reproducible installs.
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Install ALL dependencies (devDeps are needed for the Vite + esbuild build step)
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build frontend (Vite) + backend (esbuild)
RUN pnpm build

# ─── Production stage ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Only production dependencies
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --prod --frozen-lockfile

# Copy built artifacts from builder:
#   dist/index.js  → compiled server
#   dist/public/   → compiled frontend (served as static files in production)
COPY --from=builder /app/dist ./dist

# Drizzle schema reference
COPY drizzle/ ./drizzle/
COPY drizzle.config.ts ./

# The app listens on 3000 inside the container. It is not published to a host
# port by default: on the shared server the Kalakosh-ch Caddy (which owns
# 80/443) reaches the app over the "kalakosh-shared" Docker network and serves
# it at gwinn.ch — so nothing here collides with the Kalakosh-ch stack.
EXPOSE 3000

# Stamp the image with a hash of the source it was built from, so update.sh can
# tell "the running image already IS this source" from "the source moved" and
# skip the rebuild in the first case — see deploy/lib/build.sh.
#
# Deliberately the LAST instruction that touches the image: declared any higher,
# a changed fingerprint would invalidate every layer below it and make each
# build cold again, which is precisely the cost this is here to remove. As the
# final layer, a rebuild whose real inputs are unchanged is a cache hit all the
# way down. deploy/lib/build.test.sh asserts the ordering.
ARG SOURCE_FINGERPRINT=unknown
LABEL ch.gwinn.source-fingerprint=$SOURCE_FINGERPRINT

CMD ["node", "dist/index.js"]
