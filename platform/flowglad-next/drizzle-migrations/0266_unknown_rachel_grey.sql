CREATE TABLE IF NOT EXISTS "resource_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	"created_by_commit" text,
	"updated_by_commit" text,
	"livemode" boolean NOT NULL,
	"position" bigserial NOT NULL,
	"organization_id" text NOT NULL,
	"subscription_item_feature_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"pricing_model_id" text NOT NULL,
	"external_id" text,
	"claimed_at" timestamptz DEFAULT now() NOT NULL,
	"released_at" timestamptz,
	"release_reason" text,
	"metadata" jsonb,
	CONSTRAINT "resource_claims_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "resource_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resources" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	"created_by_commit" text,
	"updated_by_commit" text,
	"livemode" boolean NOT NULL,
	"position" bigserial NOT NULL,
	"organization_id" text NOT NULL,
	"pricing_model_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "resources_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "resources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "features" ADD COLUMN "resource_id" text;--> statement-breakpoint
ALTER TABLE "subscription_item_features" ADD COLUMN "resource_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resource_claims" ADD CONSTRAINT "resource_claims_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resource_claims" ADD CONSTRAINT "resource_claims_subscription_item_feature_id_subscription_item_features_id_fk" FOREIGN KEY ("subscription_item_feature_id") REFERENCES "public"."subscription_item_features"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resource_claims" ADD CONSTRAINT "resource_claims_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resource_claims" ADD CONSTRAINT "resource_claims_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resource_claims" ADD CONSTRAINT "resource_claims_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resources" ADD CONSTRAINT "resources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resources" ADD CONSTRAINT "resources_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resource_claims_subscription_id_idx" ON "resource_claims" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resource_claims_resource_id_idx" ON "resource_claims" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resource_claims_subscription_item_feature_id_idx" ON "resource_claims" USING btree ("subscription_item_feature_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resource_claims_organization_id_idx" ON "resource_claims" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resource_claims_pricing_model_id_idx" ON "resource_claims" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resource_claims_active_idx" ON "resource_claims" USING btree ("resource_id","subscription_id") WHERE "resource_claims"."released_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "resource_claims_active_external_id_unique_idx" ON "resource_claims" USING btree ("resource_id","subscription_id","external_id") WHERE "resource_claims"."released_at" IS NULL AND "resource_claims"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resources_organization_id_idx" ON "resources" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resources_pricing_model_id_idx" ON "resources" USING btree ("pricing_model_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "resources_organization_id_slug_pricing_model_id_unique_idx" ON "resources" USING btree ("organization_id","slug","pricing_model_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "features" ADD CONSTRAINT "features_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_item_features" ADD CONSTRAINT "subscription_item_features_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE POLICY "Enable read for own organizations (resource_claims)" ON "resource_claims" AS PERMISSIVE FOR ALL TO "merchant" USING ("subscription_id" in (select "id" from "subscriptions"));--> statement-breakpoint
CREATE POLICY "Enable read for customers (resource_claims)" ON "resource_claims" AS PERMISSIVE FOR SELECT TO "customer" USING ("subscription_id" in (select "id" from "subscriptions"));--> statement-breakpoint
CREATE POLICY "Check mode (resource_claims)" ON "resource_claims" AS RESTRICTIVE FOR ALL TO "merchant" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Enable read for own organizations (resources)" ON "resources" AS PERMISSIVE FOR ALL TO "merchant" USING ("organization_id" = current_organization_id());--> statement-breakpoint
CREATE POLICY "Enable read for customers (resources)" ON "resources" AS PERMISSIVE FOR SELECT TO "customer" USING ("organization_id" = current_organization_id() and "active" = true);--> statement-breakpoint
CREATE POLICY "Check mode (resources)" ON "resources" AS RESTRICTIVE FOR ALL TO "merchant" USING (current_setting('app.livemode')::boolean = livemode);