DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'discord_concierge_channel_id'
  ) THEN
    ALTER TABLE "organizations" ADD COLUMN "discord_concierge_channel_id" text;
  END IF;
END
$$;