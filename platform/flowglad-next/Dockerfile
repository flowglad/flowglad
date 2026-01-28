###############################################
# Build stage
###############################################
FROM node:20-bookworm-slim AS builder

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system deps that are commonly needed by Next.js tooling and node-gyp
RUN apt-get update && \
  apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  unzip \
  git \
  python3 \
  build-essential && \
  rm -rf /var/lib/apt/lists/*

# Install Bun
ENV BUN_INSTALL=/root/.bun
RUN curl -fsSL https://bun.sh/install | bash && \
  ln -sf /root/.bun/bin/bun /usr/local/bin/bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

# Increase Node.js heap for build to avoid OOM
ARG NODE_OPTIONS=--max-old-space-size=6144
ENV NODE_OPTIONS=${NODE_OPTIONS}

# Pre-copy manifest and config files to maximize cache
# Note: Build context should be repo root to access biome.json
COPY platform/flowglad-next/package.json platform/flowglad-next/bun.lock platform/flowglad-next/next.config.mjs platform/flowglad-next/bunfig.toml ./

# Copy Biome config files from root (needed for bun run check)
COPY biome.json .biomeignore ./
COPY plugins/ ./plugins/

# Prepare a minimal env file so prebuild step using dotenvx doesn't fail
RUN touch .env.local

# Install dependencies (full deps for build)
RUN /root/.bun/bin/bun install --frozen-lockfile

# Copy the rest of the source
COPY platform/flowglad-next/ .

# Set VERCEL_ENV=production so removeDevRoutes.ts removes dev routes during prebuild
ARG VERCEL_ENV=production
ENV VERCEL_ENV=${VERCEL_ENV}

# Disable Sentry source map upload - Vercel handles this during deployment
ENV SENTRY_AUTH_TOKEN=""

# Set CI=true to skip env file validation in preload scripts
ENV CI=true

# Run prebuild (removeDevRoutes + build:preview-css) then build:docker (next build --no-lint)
# We skip `bun run check` in Docker since CI already runs lint/typecheck separately.
# We use --no-lint to also skip Next.js's built-in linting phase, saving ~2-3 minutes.
RUN --mount=type=cache,id=bun-install-cache,target=/root/.bun/install/cache \
  --mount=type=cache,id=tool-cache,target=/app/node_modules/.cache \
  --mount=type=cache,id=vite-cache,target=/app/node_modules/.vite \
  --mount=type=cache,id=next-cache,target=/app/.next/cache \
  bun run prebuild && bun run build:docker

###############################################
# Runtime stage
###############################################
FROM node:20-bookworm-slim AS runtime

ENV VERCEL_ENV=production \
  NODE_ENV=production \
  PORT=3000 \
  HOSTNAME=0.0.0.0

WORKDIR /app

# Create a non-root user for security
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

# Copy standalone server and required assets from the builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Optional: copy any additional files your app needs at runtime
# COPY --from=builder /app/next.config.mjs ./next.config.mjs

# Drop privileges
USER nodejs

EXPOSE 3000

CMD ["node", "server.js"]
