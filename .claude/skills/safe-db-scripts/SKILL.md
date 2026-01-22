---
name: safe-db-scripts
description: Run scripts safely against databases with local-only protection. Prevents accidental execution against production databases. Use when running database scripts, migrations, or data manipulation scripts.
---

# Safe Database Scripts

**NEVER run database scripts directly.** Always use `bun run safely`:

```bash
bun run safely <script-path> --db <database-url> [--danger-mode]
```

## Rules

1. **Local databases only** - The script blocks non-local URLs by default
2. **Ask before --danger-mode** - If user needs non-local, get explicit confirmation first
3. **Mask credentials** - Never show full database URLs with passwords

## Examples

```bash
# Local (allowed)
bun run safely src/scripts/migrate.ts --db "postgresql://test:test@localhost:5432/test_db"

# Non-local (requires explicit flag + user confirmation)
bun run safely src/scripts/migrate.ts --db "postgresql://user:pass@prod.example.com:5432/db" --danger-mode
```

## Recognized Local Hosts

`localhost`, `127.0.0.1`, `0.0.0.0`, `::1`, `host.docker.internal`
