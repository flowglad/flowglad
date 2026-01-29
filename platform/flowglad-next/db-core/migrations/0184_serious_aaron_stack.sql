CREATE TABLE IF NOT EXISTS "usage_meters" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"livemode" boolean NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"catalog_id" text NOT NULL,
	CONSTRAINT "usage_meters_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "usage_meters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_meters" ADD CONSTRAINT "usage_meters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_meters_organization_id_idx" ON "usage_meters" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_meters_catalog_id_idx" ON "usage_meters" USING btree ("catalog_id");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "usage_meters" AS PERMISSIVE FOR ALL TO "authenticated" USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
CREATE POLICY "Check mode" ON "usage_meters" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);