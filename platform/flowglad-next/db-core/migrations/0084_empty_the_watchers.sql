ALTER POLICY "Enable read for own organizations" ON "Communities" TO authenticated USING ("OrganizationId" in (select "OrganizationId" from "Memberships")) WITH CHECK (
          "OrganizationId" in (select "OrganizationId" from "Memberships")
          AND ("ProductId" IS NULL OR "ProductId" in (select id from "Products"))
          AND (
            "IntegrationId" IS NULL 
            OR 
            EXISTS (
              SELECT 1 FROM "Integrations" i 
              WHERE i.id = "IntegrationId" 
              AND CASE 
                WHEN platform = 'discord' THEN i.provider = 'discord'
                WHEN platform = 'slack' THEN i.provider = 'slack'
              END
            )
          )
        );