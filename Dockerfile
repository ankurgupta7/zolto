# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependency manifests first (layer cache)
# Note: pnpm-lock.yaml is not committed to git, so we generate it during build
COPY package.json ./
COPY patches/ ./patches/

# Install ALL dependencies (devDeps are needed for the Vite + esbuild build step)
RUN pnpm install

# Copy source
COPY . .

# Build frontend (Vite) + backend (esbuild)
RUN pnpm build

# ─── Production stage ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Only production dependencies
COPY package.json ./
COPY patches/ ./patches/
RUN pnpm install --prod

# Copy built artifacts from builder:
#   dist/index.js  → compiled server
#   dist/public/   → compiled frontend (served as static files in production)
COPY --from=builder /app/dist ./dist

# Drizzle schema reference
COPY drizzle/ ./drizzle/
COPY drizzle.config.ts ./

EXPOSE 3000

CMD ["node", "dist/index.js"]
