ALTER TABLE "billing_periods" ADD COLUMN "prorated_period" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD COLUMN "preserve_billing_cycle_anchor" boolean DEFAULT false NOT NULL;
-- Add missing country codes to the "CountryCode" enum
ALTER TYPE "CountryCode" ADD VALUE 'AX'; -- Åland Islands
ALTER TYPE "CountryCode" ADD VALUE 'BL'; -- Saint Barthélemy
ALTER TYPE "CountryCode" ADD VALUE 'BQ'; -- Caribbean Netherlands
ALTER TYPE "CountryCode" ADD VALUE 'CW'; -- Curaçao
ALTER TYPE "CountryCode" ADD VALUE 'GG'; -- Guernsey
ALTER TYPE "CountryCode" ADD VALUE 'IM'; -- Isle of Man
ALTER TYPE "CountryCode" ADD VALUE 'JE'; -- Jersey
ALTER TYPE "CountryCode" ADD VALUE 'ME'; -- Montenegro
ALTER TYPE "CountryCode" ADD VALUE 'MF'; -- Saint Martin (French part)
ALTER TYPE "CountryCode" ADD VALUE 'SS'; -- South Sudan
ALTER TYPE "CountryCode" ADD VALUE 'SX'; -- Sint Maarten (Dutch part)
ALTER TYPE "CountryCode" ADD VALUE 'XK'; -- Kosovo