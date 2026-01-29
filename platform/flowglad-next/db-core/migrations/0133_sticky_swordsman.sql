CREATE POLICY "Only allow one active subscription per customer profile" ON "Subscriptions" AS RESTRICTIVE FOR INSERT TO "authenticated" USING (NOT EXISTS (
        SELECT 1 FROM "subscriptions" 
        WHERE "CustomerProfileId" = NEW."CustomerProfileId" 
        AND "status" = 'active'
      ));