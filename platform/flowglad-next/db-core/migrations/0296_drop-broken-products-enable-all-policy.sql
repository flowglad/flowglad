-- Drop the orphaned "Enable All" policy on products table
-- This policy was created in migration 0101 with column reference "OrganizationId"
-- but the column was renamed to "organization_id" in migration 0156.
-- The broken column reference causes the policy to malfunction, allowing
-- cross-organization inserts that should be blocked by RLS.

DROP POLICY IF EXISTS "Enable All" ON "products";
