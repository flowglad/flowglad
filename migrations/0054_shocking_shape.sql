DO $$ BEGIN
    CREATE TYPE "IntegrationStatus" AS ENUM ('live', 'unauthorized', 'expired', 'incomplete');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "IntegrationMethod" AS ENUM ('oauth', 'api_key');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "Integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"UserId" text,
	"OrganizationId" integer NOT NULL,
	"service" text NOT NULL,
	"method" "IntegrationMethod" NOT NULL,
	"encryptedAccessToken" text,
	"encryptedRefreshToken" text,
	"encryptedApiKey" text,
	"status" "IntegrationStatus" NOT NULL,
	CONSTRAINT "Integrations_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
ALTER TABLE "Variants" ADD COLUMN "name" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Integrations" ADD CONSTRAINT "Integrations_UserId_Users_id_fk" FOREIGN KEY ("UserId") REFERENCES "public"."Users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Integrations" ADD CONSTRAINT "Integrations_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Integrations_UserId_idx" ON "Integrations" USING btree ("UserId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Integrations_OrganizationId_idx" ON "Integrations" USING btree ("OrganizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Integrations_service_idx" ON "Integrations" USING btree ("service");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Integrations_status_idx" ON "Integrations" USING btree ("status");