ALTER TABLE "Payments" ALTER COLUMN "chargeDate" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "Payments" ALTER COLUMN "settlementDate" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "Payments" ALTER COLUMN "refundedAt" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "Invoices" ADD COLUMN "OrganizationId" integer;--> statement-breakpoint
ALTER TABLE "Payments" ADD COLUMN "PurchaseId" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_OrganizationId_Organizations_id_fk" FOREIGN KEY ("OrganizationId") REFERENCES "public"."Organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Payments" ADD CONSTRAINT "Payments_PurchaseId_Purchases_id_fk" FOREIGN KEY ("PurchaseId") REFERENCES "public"."Purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
