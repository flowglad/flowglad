ALTER TABLE "Projects" ADD COLUMN "stripeSubscriptionId" text;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "PriceType" AS ENUM ('single_payment', 'subscription', 'installments', 'pay_what_you_want', 'zero_price');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Variants" ADD COLUMN "priceType" "PriceType";--> statement-breakpoint
ALTER TABLE "Projects" ADD CONSTRAINT "Projects_stripeSubscriptionId_unique" UNIQUE("stripeSubscriptionId");