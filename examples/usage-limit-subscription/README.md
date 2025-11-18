# Flowglad Example Project

An example of how to integrate Flowglad into a Next.js project with BetterAuth. 
This project demonstrates the "Usage-Limit Subscription Template Pricing Model".

## Tech Stack

- **[Next.js 15.5.6](https://nextjs.org)** - React framework with App Router
- **[BetterAuth](https://www.better-auth.com)** - Modern authentication and user management
- **[Flowglad](https://flowglad.com)** - Billing and subscription management
- **[Drizzle ORM](https://orm.drizzle.team)** - PostgreSQL database with type-safe queries
- **[TypeScript](https://www.typescriptlang.org)** - Type safety throughout
- **[Tailwind CSS](https://tailwindcss.com)** - Utility-first CSS framework
- **[shadcn/ui](https://ui.shadcn.com)** - Beautiful UI component library

## Features

- ✅ **Authentication** - Email/password authentication with BetterAuth
- ✅ **Billing** - Subscription management with Flowglad
- ✅ **Database** - PostgreSQL with Drizzle ORM migrations
- ✅ **UI Components** - Pre-built shadcn/ui components
- ✅ **TypeScript** - Full type safety across the stack

## Prerequisites

- Node.js >= 18.18.0
- Bun >= 1.3.1
- PostgreSQL database
- `yalc` (for linking local Flowglad packages) - Install globally with `npm install -g yalc` or `bun install -g yalc`

## Getting Started

### 1. Set Up Your Pricing Model

To use this example project, you'll need to upload the `pricing.yaml` file to your Flowglad dashboard and set it as your default pricing model:

1. Log in to your [Flowglad dashboard](https://flowglad.com)
2. Navigate to the Pricing Models section [Flowglad pricing models page](https://app.flowglad.com/store/pricing-models)
3. Click on Create Pricing Model
4. Import the `pricing.yaml` file from the root of this project
5. Once uploaded, set it as your default pricing model in the dashboard settings

This will enable all the subscription plans, usage meters, and features defined in the pricing configuration for your application.

### 2. Install Dependencies

**Important:** This project is part of a monorepo. You must install dependencies from the root of the monorepo first, then navigate into this example directory.

From the root of the monorepo:

```bash
bun install
```

Then navigate into this example directory:

```bash
cd examples/usage-limit-subscription
```

### 3. Link Flowglad Packages

This example project uses `yalc` to link local Flowglad packages for development. You must link the packages before running the project:

```bash
bun run link:packages
```

This command will:
- Add Flowglad packages to yalc's local registry
- Link them into this project's `node_modules`
- Update dependencies

**Note:** If you need to unlink packages later (e.g., to use published npm packages), run:
```bash
bun run unlink:packages
```

### 4. Set Up Environment Variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Fill in the required values in `.env.local`:

- **`DATABASE_URL`** - PostgreSQL connection string
  - Example: `postgresql://user:password@localhost:5432/dbname`
  
- **`BETTER_AUTH_SECRET`** - Secret key for BetterAuth session encryption
  - Generate with: `openssl rand -base64 32`
  
- **`FLOWGLAD_SECRET_KEY`** - Secret key for Flowglad API calls
  - Get your secret key from: [https://flowglad.com](https://flowglad.com)

### 5. Set Up Database

Generate and run database migrations:

```bash
bun db:generate
bun db:migrate
```

### 6. Start Development Server

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Available Scripts

- `bun dev` - Start development server
- `bun build` - Build for production
- `bun start` - Start production server
- `bun lint` - Run ESLint
- `bun lint:fix` - Fix ESLint errors automatically
- `bun type-check` - Run TypeScript type checking
- `bun db:generate` - Generate database migrations
- `bun db:migrate` - Run database migrations
- `bun db:studio` - Open Drizzle Studio (database GUI)
- `bun link:packages` - Link local Flowglad packages using yalc (required before first run)
- `bun unlink:packages` - Unlink Flowglad packages and restore to npm registry versions

## Project Structure

```
├── src/
│   ├── app/                 # Next.js App Router pages and routes
│   │   ├── api/            # API routes (BetterAuth, Flowglad)
│   │   ├── sign-in/        # Sign in page
│   │   └── sign-up/        # Sign up page
│   ├── components/         # React components
│   │   └── ui/            # shadcn/ui components
│   ├── lib/               # Utility functions and configurations
│   │   ├── auth.ts        # BetterAuth configuration
│   │   ├── auth-client.ts # BetterAuth client
│   │   └── flowglad.ts    # Flowglad configuration
│   └── server/            # Server-side code
│       └── db/           # Database schema and client
├── drizzle/              # Generated database migrations
├── pricing.yaml          # Flowglad pricing model configuration
└── public/               # Static assets
```

## Authentication

This project uses BetterAuth for authentication. Users can sign up and sign in with email/password. The authentication state is managed server-side with secure cookies.

## Billing

Flowglad is integrated for subscription and billing management. The Flowglad provider is configured to work with BetterAuth sessions. The pricing model is defined in `pricing.yaml` at the root of the project, which includes subscription plans, usage meters, and features.

## Database

The project uses Drizzle ORM with PostgreSQL. The schema includes the necessary tables for BetterAuth (users, sessions, accounts, verifications). You can extend the schema in `src/server/db/schema.ts`.
