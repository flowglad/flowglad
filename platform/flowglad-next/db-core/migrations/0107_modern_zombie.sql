CREATE TABLE IF NOT EXISTS "ProperNouns" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"handle" text NOT NULL,
	"name" text NOT NULL,
	"EntityId" text NOT NULL,
	"entityType" text NOT NULL,
	"OrganizationId" text NOT NULL,
	CONSTRAINT "ProperNouns_id_unique" UNIQUE("id"),
	CONSTRAINT "ProperNouns_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "ProperNouns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProperNouns" ADD CONSTRAINT "ProperNouns_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProperNouns_OrganizationId_idx" ON "ProperNouns" USING btree ("OrganizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProperNouns_EntityId_entityType_idx" ON "ProperNouns" USING btree ("EntityId","entityType");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProperNouns_entityType_EntityId_OrganizationId_idx" ON "ProperNouns" USING btree ("entityType","EntityId","OrganizationId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProperNouns_handle_OrganizationId_unique_idx" ON "ProperNouns" USING btree ("handle","OrganizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proper_noun_name_search_index" ON "ProperNouns" USING gin (to_tsvector('english', "name"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proper_noun_handle_search_index" ON "ProperNouns" USING gin (to_tsvector('english', "handle"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProperNouns_EntityId_idx" ON "ProperNouns" USING btree ("EntityId");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "ProperNouns" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("OrganizationId" in (select "OrganizationId" from "Memberships" where "UserId" = requesting_user_id()));