-- Migration: Add scope field and contextOrganizationId to session table
-- This enables dual-scope authentication (merchant vs customer sessions)

-- Part 1: Create session_scope enum type
DO $$ BEGIN
  CREATE TYPE "session_scope" AS ENUM ('merchant', 'customer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Part 2: Add scope column with default 'merchant' for backward compatibility
ALTER TABLE "better_auth_session" ADD COLUMN IF NOT EXISTS "scope" "session_scope" DEFAULT 'merchant' NOT NULL;

-- Part 3: Add contextOrganizationId column (nullable, for customer session org context)
ALTER TABLE "better_auth_session" ADD COLUMN IF NOT EXISTS "context_organization_id" text;
