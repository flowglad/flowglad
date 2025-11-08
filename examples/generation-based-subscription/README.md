# Flowglad Example Project

An example of how to integrate Flowglad into a Next.js project with BetterAuth. 
This project demonstrates the "Generation-Based Subscription Template Pricing Model".

## Tech Stack

- **[Next.js 16](https://nextjs.org)** - React framework with App Router
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
- Bun >= 1.2.14
- PostgreSQL database

## Getting Started

### 1. Install Dependencies

```bash
bun install
```

### 2. Set Up Environment Variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Fill in the required values in `.env.local`:

- **`DATABASE_URL`** - PostgreSQL connection string
  - Example: `postgresql://user:password@localhost:5432/dbname`
  
- **`BETTER_AUTH_SECRET`** - Secret key for BetterAuth session encryption
  - Generate with: `openssl rand -base64 32`
  
- **`FLOWGLAD_SECRET_KEY`** - Secret key for Flowglad billing
  - Get your secret key from: [https://flowglad.com](https://flowglad.com)

### 3. Set Up Database

Generate and run database migrations:

```bash
bun db:generate
bun db:migrate
```

### 4. Start Development Server

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
- `bun test` - Run tests with Vitest
- `bun db:generate` - Generate database migrations
- `bun db:migrate` - Run database migrations
- `bun db:studio` - Open Drizzle Studio (database GUI)

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
