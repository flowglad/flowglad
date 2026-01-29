CREATE TABLE IF NOT EXISTS "Prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"externalId" text,
	"interval" interval,
	"intervalCount" integer,
	"priceMode" "priceMode",
	"isProjectPrice" boolean DEFAULT false,
	"isDefault" boolean,
	"unitAmount" integer,
	"ProductId" integer NOT NULL,
	"stripePriceId" text,
	CONSTRAINT "Prices_externalId_unique" UNIQUE("externalId"),
	CONSTRAINT "Prices_stripePriceId_unique" UNIQUE("stripePriceId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Prices" ADD CONSTRAINT "Prices_ProductId_Products_id_fk" FOREIGN KEY ("ProductId") REFERENCES "public"."Products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Prices_priceMode_idx" ON "Prices" USING btree ("priceMode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Prices_ProductId_idx" ON "Prices" USING btree ("ProductId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Prices_stripePriceId_idx" ON "Prices" USING btree ("stripePriceId");