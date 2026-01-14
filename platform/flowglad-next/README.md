This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

### Prerequisites

- PostgreSQL database (local or remote)
- Node.js (v22.0.0) and Bun

### Setup Steps

1. **Install dependencies**:
   ```bash
   bun install
   ```

2. **Set up environment variables**:
   ```bash
   # Copy the example environment file
   cp .env.example .env
   
   # Edit .env and add your database URL
   DATABASE_URL=postgresql://username:password@localhost:5432/flowglad_dev
   ```

3. **Set up the database**:
   ```bash
   # Run database migrations
   bun run migrations:push
   
   # Seed the countries table (required for local development)
   bun run seed:countries
   ```

4. **Start the development server**:
   ```bash
   bun run dev
   ```

### For Core Team Members

If you're part of the core Flowglad team:

1. `vercel link` to link the repo to an existing Vercel project.
2. Ask Agree to get you into the Trigger project.
3. `bun run vercel:env-pull` to pull the latest environment variables.
4. `bun run dev` to start the development server.

```bash
bun install
bun run vercel:env-pull
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Database Setup Notes

- **Countries Table**: The `countries` table must be populated with ISO 3166-1 alpha-2 country codes for the application to function properly. This is required for organization setup, billing addresses, and tax calculations.
- **Fresh Database**: When setting up a fresh database, always run `bun run seed:countries` after migrations to populate the countries table.
- **Idempotent**: The countries seeding script is safe to run multiple times - it won't duplicate data.

## Testing Database Migrations

Before applying migrations to staging or production, you can test them against clones of those databases using Docker.

### Prerequisites

- **Docker** must be running
- **PostgreSQL client tools** (`pg_dump` and `psql`) must be installed:
  - macOS: `brew install libpq && brew link --force libpq`
  - Ubuntu: `sudo apt-get install postgresql-client`
- **Environment variables**: `STAGING_DATABASE_URL` and `PROD_DATABASE_URL` must be set in your `.env.local` file
  - Get connection strings from Supabase project > Connect > Connection string
  - Type: URI, Source: Primary Database, Method: Session pooler > View parameters
  - Format: `postgresql://[user]:[password]@[host]:5432/[database]`

### Usage

```bash
# Test against staging database (keeps container running for inspection)
bun run migrations:test:staging

# Test against production database (keeps container running for inspection)
bun run migrations:test:prod

# Test against both (staging first, then prod if staging passes)
bun run migrations:test
```

### How It Works

1. **Creates a Docker container** with a fresh PostgreSQL instance
2. **Clones the target database** using `pg_dump` from staging or production
3. **Runs pending migrations** against the clone
4. **Reports success or failure** - if migrations fail, you'll see the error before affecting real databases

### Inspecting the Database After Migration

When using `migrations:test:staging` or `migrations:test:prod`, the container stays running after the test completes. This allows you to:

1. **Connect directly to inspect the migrated state**:
   ```bash
   # Staging clone (port 5433)
   psql "postgresql://test:test@localhost:5433/test_db"

   # Production clone (port 5434)
   psql "postgresql://test:test@localhost:5434/test_db"
   ```

2. **Point your local app to the cloned database** to test application behavior:
   ```bash
   # Run the app against the staging clone
   DATABASE_URL="postgresql://test:test@localhost:5433/test_db" bun run dev
   ```

3. **Press 'e'** to save migration output to a file for further debugging

4. **Press Enter** in the terminal when done to clean up the containers

> **Note:** The `migrations:test:staging` and `migrations:test:prod` scripts automatically enable inspect mode. If running `migrations:test` directly, add `--inspect` to keep containers running for inspection.

### Best Practices

- Always test migrations against staging before production
- Use `--inspect` mode to verify the database state looks correct after migration
- If a migration fails, fix the issue and re-run the test before applying to real databases

## How to Read the Codebase

### Folders

1. `src/app` is the main entry point for the app.
2. `src/server` is the main entry point for the trpc router. All client-side mutations run through the procedures defined here.
3. `src/trigger` is the main entry point for trigger workflows.
4. `src/db` is the main entry point for database ORMs.

### Database Access

All access happens through database transactions. This ensures atomicity and consistency across multiple database operations.

We access the database through either `adminTransaction` or `authenticatedTransaction` functions. It takes a callback that receives a `transaction` object. These help us ensure that we can always tell what type of access we have to the database. `authenticatedTransaction` is restricted by RLS and should be used for all operations unless we know for sure that the client will not be authenticated.

For workflows in trigger.dev we can use `adminTransaction`.

### Types, Tables, and Schema

We use zod heavily to define our schema. Every table in `db/schema` has the following:

- A schema declaration using drizzle-orm
- Zod schema for `select`, `insert`, and `update` operations. And corresponding types for those operations. Those schema are used to validate all objects right before they hit the database, and right after they come out of the database. This way, no application logic touches database data unless it has been validated.
- A `*.Methods` file that contains all the functions we will use to interact with that table.

You can see the details of this pattern in `/llm-prompts/new-db-table.txt`

### Application Logic

All of the most important flows in the app are documented in a [Figma Figjam file here](https://www.figma.com/board/inAfvPrVyBbHaWQ3BBN4HV/Flowglad-Flows?node-id=0-1&node-type=canvas&t=2nnuROk6RhLFJo4S-0).
