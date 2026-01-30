DROP POLICY "Enable read for own organizations" ON "Offerings" CASCADE;--> statement-breakpoint
DROP POLICY "Check mode" ON "Offerings" CASCADE;--> statement-breakpoint
DROP TABLE "Offerings" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "Check mode" ON "Memberships" CASCADE;--> statement-breakpoint
CREATE POLICY "Enable all actions for discounts in own organization" ON "PurchaseSessions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("OrganizationId" in (select "OrganizationId" from "Memberships"));