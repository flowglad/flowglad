# @flowglad/mock-server

A lightweight HTTP mock server that stubs external service APIs for testing. Used by CI and local development to avoid hitting real external services during tests.

## Mocked Services

| Service     | Port | Purpose                          |
|-------------|------|----------------------------------|
| Svix        | 9001 | Webhook delivery                 |
| Unkey       | 9002 | API key management               |
| Trigger.dev | 9003 | Background job orchestration     |

## Quick Start

### Running Locally

```bash
# Development mode (hot reload)
bun run dev

# Production mode
bun run start
```

### Running with Docker

```bash
# Build the image
bun run docker:build

# Run the container
docker run -p 9001:9001 -p 9002:9002 -p 9003:9003 ghcr.io/flowglad/flowglad/mock-server:latest
```

## Environment Variables

Configure your test environment to use the mock server:

```bash
# In .env.test or test setup
SVIX_MOCK_HOST=http://localhost:9001
UNKEY_MOCK_HOST=http://localhost:9002
TRIGGER_API_URL=http://localhost:9003
```

## Docker Image Management

The Docker image is hosted on GitHub Container Registry (GHCR).

### Prerequisites

- Docker installed and running
- `gh` CLI installed and authenticated: `gh auth login`
- For pushing: `write:packages` scope: `gh auth refresh --scopes write:packages`

### Commands

```bash
# Build only (local testing)
bun run docker:build                  # Tag: latest
bun run docker:build --tag v1.0.0     # Custom tag

# Build and push to GHCR
bun run docker:push                   # Tag: latest
bun run docker:push --tag v1.0.0      # Custom tag

# Manual GHCR login
bun run ghcr:login

# Help
bun run docker:build --help
```

### Image Location

```
ghcr.io/flowglad/flowglad/mock-server:latest
```

## CI Integration

The mock server runs as a service container in GitHub Actions:

```yaml
services:
  flowglad-mock-server:
    image: ghcr.io/flowglad/flowglad/mock-server:latest
    ports:
      - 9001:9001
      - 9002:9002
      - 9003:9003
```

A separate workflow (`.github/workflows/build-mock-server.yml`) automatically builds and pushes the image when changes are made to `packages/mock-server/**`.

## Development

```bash
# Type checking
bun run typecheck

# Linting and formatting
bun run check

# Run tests
bun test
```

## Adding New Mock Endpoints

1. Add the route handler in `src/index.ts`
2. Follow existing patterns for request/response handling
3. Update this README if adding a new service
4. Push a new Docker image after changes
