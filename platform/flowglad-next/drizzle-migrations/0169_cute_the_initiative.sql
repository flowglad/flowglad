ALTER TABLE "customer_profiles" ADD COLUMN "user_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_user_id_idx" ON "customer_profiles" USING btree ("user_id");

UPDATE "customer_profiles" 
SET "user_id" = customers."user_id" 
FROM "customers" 
WHERE "customers"."id" = "customer_profiles"."customer_id";
