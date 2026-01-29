CREATE TABLE IF NOT EXISTS "ApiKeys" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"OrganizationId" text NOT NULL,
	"name" text NOT NULL,
	"encryptedKey" text NOT NULL,
	"lastUsedAt" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"test" boolean DEFAULT false NOT NULL,
	CONSTRAINT "ApiKeys_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "ApiKeys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ApiKeys" ADD CONSTRAINT "ApiKeys_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ApiKeys_OrganizationId_idx" ON "ApiKeys" USING btree ("OrganizationId");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "ApiKeys" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("OrganizationId" in (select "OrganizationId" from "Memberships"));