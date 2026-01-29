CREATE TABLE IF NOT EXISTS "Messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text NOT NULL,
	"CustomerProfileId" integer,
	"messageSentAt" timestamp NOT NULL,
	"OrganizationMemberId" integer,
	"rawText" text NOT NULL,
	"platform" text NOT NULL,
	"platformThreadId" text,
	"platformChannelId" text,
	"platformId" text NOT NULL,
	"platformUserId" text NOT NULL,
	"payload" jsonb,
	CONSTRAINT "Messages_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
ALTER TABLE "CustomerProfiles" ADD COLUMN "slackId" text;--> statement-breakpoint
ALTER TABLE "Memberships" ADD COLUMN "slackUserId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Messages" ADD CONSTRAINT "Messages_CustomerProfileId_CustomerProfiles_id_fk" FOREIGN KEY ("CustomerProfileId") REFERENCES "public"."CustomerProfiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Messages" ADD CONSTRAINT "Messages_OrganizationMemberId_Memberships_id_fk" FOREIGN KEY ("OrganizationMemberId") REFERENCES "public"."Memberships"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Messages_platformId_idx" ON "Messages" USING btree ("platformId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Messages_platformThreadId_idx" ON "Messages" USING btree ("platformThreadId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Messages_platformId_platform_unique_idx" ON "Messages" USING btree ("platformId","platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CustomerProfiles_slackId_idx" ON "CustomerProfiles" USING btree ("slackId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Memberships_slackUserId_idx" ON "Memberships" USING btree ("slackUserId");