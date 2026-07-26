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
# it at zolto.ch — so nothing here collides with the Kalakosh-ch stack.
EXPOSE 3000

CMD ["node", "dist/index.js"]
