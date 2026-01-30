CREATE TABLE IF NOT EXISTS "IntegrationSessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"IntegrationId" integer NOT NULL,
	"state" text NOT NULL,
	"codeVerifier" text,
	"redirectUrl" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "IntegrationSessions_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
ALTER TABLE "Integrations" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "Integrations" ADD COLUMN "tokenExpiresAt" timestamp;--> statement-breakpoint
ALTER TABLE "Integrations" ADD COLUMN "lastTokenRefresh" timestamp;--> statement-breakpoint
ALTER TABLE "Integrations" ADD COLUMN "providerConfig" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "IntegrationSessions" ADD CONSTRAINT "IntegrationSessions_IntegrationId_Integrations_id_fk" FOREIGN KEY ("IntegrationId") REFERENCES "public"."Integrations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IntegrationSessions_IntegrationId_idx" ON "IntegrationSessions" USING btree ("IntegrationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IntegrationSessions_state_idx" ON "IntegrationSessions" USING btree ("state");