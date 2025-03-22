CREATE TABLE IF NOT EXISTS "catalogs" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now(),
	"livemode" boolean NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "catalogs_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "catalogs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalogs_organization_id_idx" ON "catalogs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalogs_name_idx" ON "catalogs" USING btree ("name");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "catalogs" AS PERMISSIVE FOR ALL TO "authenticated" USING ("organization_id" in (select "organization_id" from "memberships"));