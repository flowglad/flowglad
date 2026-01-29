ALTER TABLE "Communities" ADD COLUMN "inviteURL" text;--> statement-breakpoint
ALTER TABLE "Forms" ADD COLUMN "ProductId" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Forms" ADD CONSTRAINT "Forms_ProductId_Products_id_fk" FOREIGN KEY ("ProductId") REFERENCES "public"."Products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Forms_ProductId_unique_idx" ON "Forms" USING btree ("ProductId");--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "Forms" AS PERMISSIVE FOR ALL TO "authenticated" USING ("OrganizationId" in (select "OrganizationId" from "Memberships")) WITH CHECK ("ProductId" is null OR "ProductId" in (select "id" from "Products"));--> statement-breakpoint
CREATE POLICY "Enable read for own organizations" ON "Integrations" AS PERMISSIVE FOR ALL TO "authenticated" USING ("OrganizationId" in (select "OrganizationId" from "Memberships") OR "UserId" = requesting_user_id());