ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

CREATE TABLE IF NOT EXISTS "subscription_item_features" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by_commit" text,
	"updated_by_commit" text,
	"livemode" boolean NOT NULL,
	"position" bigserial NOT NULL,
	"subscription_item_id" text NOT NULL,
	"feature_id" text NOT NULL,
	"product_feature_id" text NOT NULL,
	"type" "FeatureType" NOT NULL,
	"amount" integer,
	"usage_meter_id" text,
	"renewal_frequency" "FeatureUsageGrantFrequency",
	"expired_at" timestamp with time zone,
	CONSTRAINT "subscription_item_features_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "subscription_item_features" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_features" ADD COLUMN "expired_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_item_features" ADD CONSTRAINT "subscription_item_features_subscription_item_id_subscription_items_id_fk" FOREIGN KEY ("subscription_item_id") REFERENCES "public"."subscription_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_item_features" ADD CONSTRAINT "subscription_item_features_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_item_features" ADD CONSTRAINT "subscription_item_features_product_feature_id_product_features_id_fk" FOREIGN KEY ("product_feature_id") REFERENCES "public"."product_features"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_item_features" ADD CONSTRAINT "subscription_item_features_usage_meter_id_usage_meters_id_fk" FOREIGN KEY ("usage_meter_id") REFERENCES "public"."usage_meters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_item_features_subscription_item_id_idx" ON "subscription_item_features" USING btree ("subscription_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_item_features_feature_id_idx" ON "subscription_item_features" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_item_features_product_feature_id_idx" ON "subscription_item_features" USING btree ("product_feature_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_item_features_type_idx" ON "subscription_item_features" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_item_features_product_feature_id_subscription_item_id_unique_idx" ON "subscription_item_features" USING btree ("product_feature_id","subscription_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_features_product_id_idx" ON "product_features" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_features_organization_id_idx" ON "product_features" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "Ensure organization integrity with products parent table" ON "product_features" AS PERMISSIVE FOR ALL TO "authenticated" USING ("product_id" in (select "id" from "products"));--> statement-breakpoint
CREATE POLICY "Ensure organization integrity with features parent table" ON "product_features" AS PERMISSIVE FOR ALL TO "authenticated" USING ("feature_id" in (select "id" from "features"));--> statement-breakpoint
CREATE POLICY "Ensure organization integrity with subscription_items parent table" ON "subscription_item_features" AS PERMISSIVE FOR ALL TO "authenticated" USING ("subscription_item_id" in (select "id" from "subscription_items"));--> statement-breakpoint
CREATE POLICY "Ensure organization integrity with product_features parent table" ON "subscription_item_features" AS PERMISSIVE FOR ALL TO "authenticated" USING ("product_feature_id" in (select "id" from "product_features"));--> statement-breakpoint
CREATE POLICY "Ensure organization integrity with features parent table" ON "subscription_item_features" AS PERMISSIVE FOR ALL TO "authenticated" USING ("feature_id" in (select "id" from "features"));--> statement-breakpoint
CREATE POLICY "Ensure organization integrity with usage_meters parent table" ON "subscription_item_features" AS PERMISSIVE FOR ALL TO "authenticated" USING ("usage_meter_id" in (select "id" from "usage_meters"));--> statement-breakpoint
CREATE POLICY "Check mode" ON "subscription_item_features" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);