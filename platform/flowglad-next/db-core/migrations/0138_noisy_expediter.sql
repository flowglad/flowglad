ALTER TABLE "BillingPeriods" ADD COLUMN "trialPeriod" boolean DEFAULT false NOT NULL;
ALTER TYPE "FlowgladEventType" ADD VALUE IF NOT EXISTS 'payment.failed';
ALTER TYPE "FlowgladEventType" ADD VALUE IF NOT EXISTS 'payment.succeeded';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'failed';
