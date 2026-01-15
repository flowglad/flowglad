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

## Local Database Development

You can clone staging or production databases to a local Supabase instance for development and testing migrations.

### Prerequisites

- **Docker** must be running
- **Supabase CLI** installed: `brew install supabase/tap/supabase`
- **PostgreSQL client tools** (`psql`) installed:
  - macOS: `brew install libpq && brew link --force libpq`
  - Ubuntu: `sudo apt-get install postgresql-client`
- **Supabase initialized**: Run `supabase init` once in `platform/flowglad-next` if not already done
- **Environment variables**: `STAGING_DATABASE_URL` and `PROD_DATABASE_URL` must be set in your `.env.local` file
  - Get connection strings from Supabase Dashboard > Connect > Connection string

### Database Cloning Commands

```bash
# Clone staging database (with data)
bun run db:clone:staging

# Clone production database (with data)
bun run db:clone:prod

# Clone schema only (faster, no data)
bun run db:clone:staging:schema
bun run db:clone:prod:schema

# Clone and run pending migrations (for testing migrations)
bun run db:clone:staging:migrate
bun run db:clone:prod:migrate
```

### How It Works

1. **Stops any existing local Supabase** and starts a fresh instance
2. **Dumps roles, schema, and data** from the remote database using `supabase db dump`
3. **Restores to local Supabase** with triggers disabled during data restore
4. **Runs pending migrations** (if using `:migrate` variant)
5. **Leaves the database running** for local development

### Using the Local Database

After cloning, the local Supabase instance stays running. You can:

1. **Connect directly**:
   ```bash
   psql "postgresql://postgres:postgres@localhost:54322/postgres"
   ```

2. **Run the app against the local database**:
   ```bash
   DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres" bun run dev
   ```

3. **Check Supabase status**:
   ```bash
   bun run db:local:status
   ```

4. **Stop the local instance**:
   ```bash
   bun run db:local:stop
   ```

### Testing Migrations

The `:migrate` variants are ideal for testing migrations before applying them to real databases:

```bash
# Test migrations against a staging clone
bun run db:clone:staging:migrate

# Test migrations against a production clone
bun run db:clone:prod:migrate

# Keep dump files for inspection (--inspect mode)
bun run migrations:test:inspect
```

If migrations fail, you'll see the error before affecting real databases. The local database remains available for debugging.

### Best Practices

- Always test migrations against staging before production
- Use schema-only clones for faster iteration when you don't need data
- The local database persists until you stop it or run another clone command

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
