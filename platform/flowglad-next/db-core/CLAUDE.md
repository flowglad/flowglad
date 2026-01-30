# db-core

Self-contained database schema package for sharing between repositories via git subtree.

## Purpose

This directory contains all Drizzle ORM schema definitions, migrations, and related utilities. It's designed to be:
- **Self-contained**: No imports from `@/` paths, only relative imports within db-core
- **Portable**: Can be extracted via `git subtree split` for use in other repos
- **Sync-ready**: Changes here automatically sync to `flowglad/flowglad-internal`

## Directory Structure

```
db-core/
├── package.json          # Declares dependencies (drizzle-orm, zod, etc.)
├── tsconfig.json         # Standalone TypeScript config
├── drizzle.config.ts     # Drizzle Kit configuration
├── schema/               # Table definitions (*.ts)
├── migrations/           # Auto-generated SQL migrations
├── enums.ts              # Shared enums used by schemas
├── schemaTypes.ts        # Pure DB types (DbTransaction, PgColumn types, etc.)
├── tableUtils.ts         # RLS policies, column builders
├── createZodSchemas.ts   # Zod schema generation from Drizzle
├── timestampMs.ts        # Custom timestamp column type
├── commonZodSchema.ts    # Shared Zod schemas
└── utils.ts              # Minimal utilities (nanoid, IS_TEST, etc.)
```

## Important Rules

1. **No `@/` imports**: All imports must be relative (e.g., `./enums`, `../tableUtils`)
2. **No app-specific dependencies**: Don't import from `@/utils/cache`, `@/services/`, etc.
3. **Test files stay in src/**: Schema tests remain in `src/db/schema/*.test.ts`
4. **Migrations are auto-generated**: Run `bun run migrations:generate` from the parent directory

## Adding a New Schema

1. Create `db-core/schema/newTable.ts`
2. Use relative imports:
   ```typescript
   import { buildSchemas } from '../createZodSchemas'
   import { createTable, primaryKeyCol, timestampColumns } from '../tableUtils'
   import { SomeEnum } from '../enums'
   ```
3. Run `bun run migrations:generate` to create migration
4. Add tests in `src/db/schema/newTable.test.ts` (using `@db-core/schema/newTable`)

## Subtree Workflow

This directory is exported to a `schema-export` branch via CI when changes are pushed to main. The internal repo pulls from this branch:

```bash
# In flowglad-internal (one-time setup)
git subtree add --prefix=packages/db-core https://github.com/flowglad/flowglad.git schema-export --squash

# To pull updates
git subtree pull --prefix=packages/db-core https://github.com/flowglad/flowglad.git schema-export --squash
```

## Path Alias

In the main repo, use `@db-core/*` to import:
```typescript
import { Customer } from '@db-core/schema/customers'
import { CurrencyCode } from '@db-core/enums'
```
