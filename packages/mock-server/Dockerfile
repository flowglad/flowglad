FROM oven/bun:1.3.6-alpine

# Link package to repository for GHCR permissions
LABEL org.opencontainers.image.source=https://github.com/flowglad/flowglad

# wget is included in alpine, no additional packages needed for health checks
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production
COPY src ./src
EXPOSE 9001 9002 9003 9004 9005 9006
CMD ["bun", "run", "src/index.ts"]
