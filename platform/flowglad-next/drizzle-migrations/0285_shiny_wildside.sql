CREATE TABLE IF NOT EXISTS "sync_webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	"created_by_commit" text,
	"updated_by_commit" text,
	"livemode" boolean NOT NULL,
	"position" bigserial NOT NULL,
	"organization_id" text NOT NULL,
	"url" text NOT NULL,
	"signing_secret" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "sync_webhooks_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "sync_webhooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sync_webhooks" ADD CONSTRAINT "sync_webhooks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_webhooks_organization_id_idx" ON "sync_webhooks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_webhooks_active_idx" ON "sync_webhooks" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sync_webhooks_organization_id_livemode_unique_idx" ON "sync_webhooks" USING btree ("organization_id","livemode");--> statement-breakpoint
CREATE POLICY "Enable all for own organizations (sync_webhooks)" ON "sync_webhooks" AS PERMISSIVE FOR ALL TO "merchant" USING ("organization_id" = current_organization_id());--> statement-breakpoint
CREATE POLICY "Check mode (sync_webhooks)" ON "sync_webhooks" AS RESTRICTIVE FOR ALL TO "merchant" USING (current_setting('app.livemode')::boolean = livemode);