ALTER TABLE "CustomerProfiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "Customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "Check mode" ON "ApiKeys" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Communities" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "CommunityMembershipClaims" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "CommunityMemberships" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "CustomerProfiles" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Customers" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "DiscountRedemptions" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Discounts" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Events" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "FeeCalculations" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Files" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Flows" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "FormFields" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Forms" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Enable all for own forms" ON "FormSubmissions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("FormId" in (select "id" from "Forms"));--> statement-breakpoint
CREATE POLICY "Check mode" ON "FormSubmissions" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Integrations" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "InvoiceLineItems" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Invoices" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Links" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Memberships" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Messages" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Offerings" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Organizations" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Payments" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Products" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "ProperNouns" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "PurchaseAccessSessions" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Purchases" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "PurchaseSessions" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Testimonials" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);--> statement-breakpoint
CREATE POLICY "Check mode" ON "Variants" AS RESTRICTIVE FOR ALL TO "authenticated" USING (current_setting('app.livemode')::boolean = livemode);