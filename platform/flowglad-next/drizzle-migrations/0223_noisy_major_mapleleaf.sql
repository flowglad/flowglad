ALTER TABLE "prices" ADD COLUMN "overage_price_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prices" ADD CONSTRAINT "prices_overage_price_id_prices_id_fk" FOREIGN KEY ("overage_price_id") REFERENCES "public"."prices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
