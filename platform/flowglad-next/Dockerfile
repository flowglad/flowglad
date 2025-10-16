###############################################
# Build stage
###############################################
FROM node:20-bookworm-slim AS builder

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=development

WORKDIR /app

# Enable corepack and ensure pnpm is available (uses version from package.json)
RUN corepack enable

# Increase Node.js heap for build to avoid OOM
ARG NODE_OPTIONS=--max-old-space-size=6144
ENV NODE_OPTIONS=${NODE_OPTIONS}

# Install system deps that are commonly needed by Next.js tooling and node-gyp
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      git \
      python3 \
      build-essential && \
    rm -rf /var/lib/apt/lists/*

# Pre-copy only manifest files to maximize cache
COPY package.json pnpm-lock.yaml ./

# Prepare a minimal env file so prebuild step using dotenvx doesn't fail
RUN touch .env.local

# Install dependencies (full deps for build)
RUN pnpm install --frozen-lockfile

# Copy the rest of the source
COPY . .

# Ensure production build path
ENV VERCEL_ENV=production

# Build the Next.js app (runs prebuild + next build)
RUN pnpm build

###############################################
# Runtime stage
###############################################
FROM node:20-bookworm-slim AS runner

ENV NODE_ENV=production \
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


