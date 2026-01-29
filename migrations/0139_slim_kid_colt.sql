ALTER TABLE "Subscriptions" RENAME COLUMN "endedAt" TO "canceledAt";--> statement-breakpoint
ALTER TABLE "Subscriptions" RENAME COLUMN "endScheduledAt" TO "cancelScheduledAt";
ALTER TYPE "FlowgladEventType" ADD VALUE IF NOT EXISTS 'payment.failed';
ALTER TYPE "FlowgladEventType" ADD VALUE IF NOT EXISTS 'payment.succeeded';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'failed';
