This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

### Prerequisites

- PostgreSQL database (local or remote)
- Node.js and pnpm

### Setup Steps

1. **Install dependencies**:
   ```bash
   pnpm install
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
   pnpm migrations:push
   
   # Seed the countries table (required for local development)
   pnpm seed:countries
   ```

4. **Start the development server**:
   ```bash
   pnpm dev
   ```

### For Core Team Members

If you're part of the core Flowglad team:

1. `vercel link` to link the repo to an existing Vercel project.
2. Ask Agree to get you into the Trigger project.
3. `pnpm vercel:env-pull` to pull the latest environment variables.
4. `pnpm dev` to start the development server.

```bash
pnpm install
pnpm vercel:env-pull
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Database Setup Notes

- **Countries Table**: The `countries` table must be populated with ISO 3166-1 alpha-2 country codes for the application to function properly. This is required for organization setup, billing addresses, and tax calculations.
- **Fresh Database**: When setting up a fresh database, always run `pnpm seed:countries` after migrations to populate the countries table.
- **Idempotent**: The countries seeding script is safe to run multiple times - it won't duplicate data.

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
