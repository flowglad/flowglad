DROP POLICY "On update, ensure usage meter belongs to same pricing model" ON "prices" CASCADE;--> statement-breakpoint
ALTER POLICY "Merchant access via product or usage meter FK" ON "prices" TO merchant USING ((
            ("type" = 'usage' AND "usage_meter_id" IN (SELECT "id" FROM "usage_meters"))
            OR ("type" != 'usage' AND "product_id" IN (SELECT "id" FROM "products"))
          )) WITH CHECK ((
            ("type" = 'usage' AND "usage_meter_id" IN (
              SELECT "id" FROM "usage_meters"
              WHERE "usage_meters"."pricing_model_id" = "prices"."pricing_model_id"
            ))
            OR ("type" != 'usage' AND "product_id" IN (
              SELECT "id" FROM "products"
              WHERE "products"."pricing_model_id" = "prices"."pricing_model_id"
            ))
          ));