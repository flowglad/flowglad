###############################################
# Development environment for Cursor Remote Agent
###############################################
FROM node:20-bookworm-slim

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Create a non-root user
RUN useradd -m -s /bin/bash ubuntu

# Install system deps that are commonly needed by Next.js tooling and node-gyp
# Also includes Docker, Docker Compose, PostgreSQL client tools, and other dev tools
RUN apt-get update && \
  apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  unzip \
  git \
  python3 \
  build-essential \
  postgresql-client \
  gnupg \
  lsb-release && \
  rm -rf /var/lib/apt/lists/*

# Install Docker CLI (for docker-compose and docker commands)
# Note: Docker daemon should be available via socket mount in Cursor Remote
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && \
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \
  apt-get update && \
  apt-get install -y --no-install-recommends docker-ce-cli && \
  rm -rf /var/lib/apt/lists/*

# Install Docker Compose (standalone v2)
# Detect architecture and download appropriate binary
RUN ARCH=$(dpkg --print-architecture) && \
  if [ "$ARCH" = "amd64" ]; then \
    DOCKER_COMPOSE_ARCH="x86_64"; \
  elif [ "$ARCH" = "arm64" ]; then \
    DOCKER_COMPOSE_ARCH="aarch64"; \
  else \
    DOCKER_COMPOSE_ARCH="x86_64"; \
  fi && \
  curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${DOCKER_COMPOSE_ARCH}" -o /usr/local/bin/docker-compose && \
  chmod +x /usr/local/bin/docker-compose

# Install ast-grep (required by development rules)
# Release assets use "app-" prefix instead of "ast-grep-"
RUN ARCH=$(dpkg --print-architecture) && \
  if [ "$ARCH" = "amd64" ]; then \
    AST_GREP_ARCH="x86_64-unknown-linux-gnu"; \
  elif [ "$ARCH" = "arm64" ]; then \
    AST_GREP_ARCH="aarch64-unknown-linux-gnu"; \
  else \
    AST_GREP_ARCH="x86_64-unknown-linux-gnu"; \
  fi && \
  curl -L "https://github.com/ast-grep/ast-grep/releases/latest/download/app-${AST_GREP_ARCH}.zip" -o /tmp/ast-grep.zip && \
  unzip -q /tmp/ast-grep.zip -d /tmp && \
  mv /tmp/ast-grep /usr/local/bin/ast-grep && \
  chmod +x /usr/local/bin/ast-grep && \
  rm /tmp/ast-grep.zip

# Install Bun (install to ubuntu user's home, then symlink to /usr/local/bin for system-wide access)
ENV BUN_INSTALL=/home/ubuntu/.bun
RUN curl -fsSL https://bun.sh/install | bash && \
  ln -sf /home/ubuntu/.bun/bin/bun /usr/local/bin/bun && \
  ln -sf /home/ubuntu/.bun/bin/bunx /usr/local/bin/bunx && \
  chown -R ubuntu:ubuntu /home/ubuntu/.bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

# Increase Node.js heap for build to avoid OOM
ARG NODE_OPTIONS=--max-old-space-size=6144
ENV NODE_OPTIONS=${NODE_OPTIONS}

# Verify installations
RUN bun --version && \
  docker --version && \
  docker-compose --version && \
  ast-grep --version && \
  psql --version

# Switch to non-root user and set working directory to home directory
USER ubuntu
WORKDIR /home/ubuntu

# Default command (can be overridden)
CMD ["/bin/bash"]
