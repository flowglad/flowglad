# @flowglad/db-core

Self-contained Drizzle schema definitions for git subtree export.

## Purpose

This directory contains all database schema definitions, enums, and related utilities needed for the Flowglad application. It is designed to be fully self-contained with no dependencies on application-specific code, enabling it to be shared with other repositories via `git subtree`.

The primary use case is synchronizing schema definitions from this open-source repository (`flowglad/flowglad`) to the closed-source internal repository (`flowglad/flowglad-internal`).

## Structure

```
db-core/
├── schema/           # Drizzle table definitions
├── enums.ts          # Shared enum definitions
├── tableUtils.ts     # Table creation utilities
├── schemaTypes.ts    # Pure database types (no application types)
├── createZodSchemas.ts # Zod schema generation utilities
├── timestampMs.ts    # Timestamp column utilities
├── commonZodSchema.ts # Common Zod schemas
├── utils.ts          # General utilities
├── package.json      # Package manifest
├── tsconfig.json     # TypeScript configuration
└── README.md         # This file
```

## Design Principles

1. **Self-contained**: All dependencies (enums, utils) are included within this directory. No imports from outside `db-core/`.

2. **Relative imports**: Files within `db-core/` use relative imports (`./enums`, `./tableUtils`) rather than path aliases, ensuring portability without requiring tsconfig changes in consuming repositories.

3. **No re-exports**: The main codebase updates imports directly to point to `db-core/` rather than using re-export layers.

## Usage in Open-Source Repo

The open-source repository uses a tsconfig path alias to reference this directory:

```json
{
  "compilerOptions": {
    "paths": {
      "@db-core/*": ["./db-core/*"]
    }
  }
}
```

Import schema definitions using the path alias:

```typescript
import { users } from '@db-core/schema/users'
import { PaymentStatus } from '@db-core/enums'
```

## Usage in Internal Repo (via git subtree)

The internal repository pulls this directory via `git subtree`:

### Initial Setup (one-time)

```bash
# Add the remote
git remote add flowglad-oss git@github.com:flowglad/flowglad.git

# Pull the subtree into a local directory
git subtree add --prefix=packages/db-core flowglad-oss db-core-export --squash
```

### Pulling Updates

When schema changes are made in the open-source repo:

```bash
# In the open-source repo: export the subtree branch
git subtree split --prefix=platform/flowglad-next/db-core -b db-core-export
git push origin db-core-export

# In the internal repo: pull the updates
git subtree pull --prefix=packages/db-core flowglad-oss db-core-export --squash
```

## Workflow

Schema changes flow **unidirectionally** from open-source to internal:

```
flowglad/flowglad (open-source)
    │
    │  git subtree split
    ▼
db-core-export branch
    │
    │  git subtree pull
    ▼
flowglad/flowglad-internal (closed-source)
```

**Important**: Schema definitions should only be modified in the open-source repository. The internal repository consumes these definitions but should not modify them directly.

## Adding New Schema Files

1. Create the new schema file in `db-core/schema/`
2. Use relative imports for any dependencies within `db-core/`
3. Update exports in `package.json` if adding new top-level modules
4. Run `bun run check` to verify types
5. Commit and push to trigger the subtree export workflow
