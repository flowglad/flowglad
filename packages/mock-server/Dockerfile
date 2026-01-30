FROM oven/bun:1.3.6-slim

# Link package to repository for GHCR permissions
LABEL org.opencontainers.image.source=https://github.com/flowglad/flowglad

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production
COPY src ./src
EXPOSE 9001 9002 9003
CMD ["bun", "run", "src/index.ts"]
