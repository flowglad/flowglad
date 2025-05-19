CREATE TABLE IF NOT EXISTS "product_features" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by_commit" text,
	"updated_by_commit" text,
	"livemode" boolean NOT NULL,
	"position" bigserial NOT NULL,
	"product_id" text NOT NULL,
	"feature_id" text NOT NULL,
	"organization_id" text NOT NULL,
	CONSTRAINT "product_features_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "product_features" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_features" ADD CONSTRAINT "product_features_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_features" ADD CONSTRAINT "product_features_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_features" ADD CONSTRAINT "product_features_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_features_product_id_feature_id_unique_idx" ON "product_features" USING btree ("product_id","feature_id");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "product_features" AS PERMISSIVE FOR ALL TO "authenticated" USING ("organization_id" in (select "organization_id" from "memberships"));--> statement-breakpoint
CREATE POLICY "Check mode" ON "product_features" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);