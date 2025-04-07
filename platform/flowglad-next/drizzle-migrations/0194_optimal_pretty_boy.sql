ALTER TABLE "subscriptions" ADD COLUMN "start_date" timestamp;

UPDATE "subscriptions" SET "start_date" = "created_at";

ALTER TABLE "subscriptions" ALTER COLUMN "start_date" SET NOT NULL;

