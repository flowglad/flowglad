ALTER TABLE "resources" DROP COLUMN IF EXISTS "description";

-- Grant sequence permissions for resources and resource_claims tables to merchant role.
-- These tables were created in migration 0266 with bigserial position columns,
-- but that migration ran after 0233 which granted sequence permissions to existing sequences.
-- Without these grants, merchant role gets "permission denied for sequence" errors.
GRANT USAGE, UPDATE ON SEQUENCE public.resources_position_seq TO merchant;
GRANT USAGE, UPDATE ON SEQUENCE public.resource_claims_position_seq TO merchant;

-- Also update default privileges so any future sequences are automatically granted to merchant
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, UPDATE ON SEQUENCES TO merchant;