DO $$ BEGIN
    CREATE TYPE "IntegrationStatus" AS ENUM ('live', 'unauthorized', 'expired', 'incomplete');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BusinessOnboardingStatus" AS ENUM ('fully_onboarded', 'partially_onboarded', 'unauthorized', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Integrations" ALTER COLUMN "status" SET DATA TYPE "IntegrationStatus";--> statement-breakpoint
ALTER TABLE "Organizations" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "Organizations" ADD COLUMN "payoutsEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Organizations" ADD COLUMN "onboardingStatus" "BusinessOnboardingStatus";