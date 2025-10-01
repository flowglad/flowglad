BEGIN;

-- (Optional) Keep the locks reasonable for big tables
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

-- Preflight: fail if any column would drift by ~4–5 hours
DO $$
DECLARE
  tz text := current_setting('TimeZone');  -- what the implicit cast would assume
  r  record;
  drift_rows bigint;
  -- We'll treat 3h59m..5h1m as "about 4–5 hours" to be robust to oddities
  lo int := 4*3600 - 60;
  hi int := 5*3600 + 60;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('billing_periods','start_date'),
      ('billing_periods','end_date'),
      ('billing_runs','scheduled_for'),
      ('billing_runs','started_at'),
      ('billing_runs','completed_at'),
      ('billing_runs','last_stripe_payment_intent_event_timestamp'),
      ('checkout_sessions','expires'),
      ('events','occurred_at'),
      ('events','submitted_at'),
      ('events','processed_at'),
      ('invoices','invoice_date'),
      ('invoices','due_date'),
      ('invoices','billing_period_start_date'),
      ('invoices','billing_period_end_date'),
      ('messages','message_sent_at'),
      ('payments','charge_date'),
      ('payments','settlement_date'),
      ('payments','refunded_at'),
      ('purchase_access_sessions','expires'),
      ('purchases','billing_cycle_anchor'),
      ('purchases','purchase_date'),
      ('purchases','end_date'),
      ('subscription_items','added_date'),
      ('subscription_items','expired_at'),
      ('subscriptions','start_date'),
      ('subscriptions','trial_end'),
      ('subscriptions','current_billing_period_start'),
      ('subscriptions','current_billing_period_end'),
      ('subscriptions','canceled_at'),
      ('subscriptions','cancel_scheduled_at'),
      ('subscriptions','billing_cycle_anchor_date'),
      ('usage_events','usage_date')
    ) AS t(tbl, col)
  LOOP
    -- Count rows where interpreting the naive value as session TZ vs UTC differs by ~4–5h
    EXECUTE format($f$
      SELECT count(*)
      FROM %I
      WHERE %I IS NOT NULL
        AND abs(extract(epoch from (
              (%I AT TIME ZONE %L)       -- implicit cast assumption (session TimeZone)
            - (%I AT TIME ZONE 'UTC')    -- intended assumption (UTC); change if needed
        ))) BETWEEN %s AND %s
    $f$, r.tbl, r.col, r.col, tz, r.col, lo, hi)
    INTO drift_rows;

    IF drift_rows > 0 THEN
      RAISE EXCEPTION
        'Timezone drift (~4–5h) detected on %.% for % rows (session TimeZone=%). Aborting. Use USING %I AT TIME ZONE ''UTC''.',
        r.tbl, r.col, drift_rows, tz, r.col;
    END IF;
  END LOOP;
END$$;

-- If we got here, no ~4–5h drift risk. Perform explicit, safe conversions.
-- Replace 'UTC' below if your intended baseline zone is different.

ALTER TABLE "usage_credit_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_credit_balance_adjustments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "billing_periods" ALTER COLUMN "start_date" TYPE timestamptz USING "start_date" AT TIME ZONE 'UTC';
ALTER TABLE "billing_periods" ALTER COLUMN "end_date"   TYPE timestamptz USING "end_date"   AT TIME ZONE 'UTC';

ALTER TABLE "billing_runs" ALTER COLUMN "scheduled_for"                           TYPE timestamptz USING "scheduled_for" AT TIME ZONE 'UTC';
ALTER TABLE "billing_runs" ALTER COLUMN "started_at"                              TYPE timestamptz USING "started_at" AT TIME ZONE 'UTC';
ALTER TABLE "billing_runs" ALTER COLUMN "completed_at"                            TYPE timestamptz USING "completed_at" AT TIME ZONE 'UTC';
ALTER TABLE "billing_runs" ALTER COLUMN "last_stripe_payment_intent_event_timestamp" TYPE timestamptz USING "last_stripe_payment_intent_event_timestamp" AT TIME ZONE 'UTC';

ALTER TABLE "checkout_sessions" ALTER COLUMN "expires" TYPE timestamptz USING "expires" AT TIME ZONE 'UTC';

ALTER TABLE "events" ALTER COLUMN "occurred_at"  TYPE timestamptz USING "occurred_at"  AT TIME ZONE 'UTC';
ALTER TABLE "events" ALTER COLUMN "submitted_at" TYPE timestamptz USING "submitted_at" AT TIME ZONE 'UTC';
ALTER TABLE "events" ALTER COLUMN "processed_at" TYPE timestamptz USING "processed_at" AT TIME ZONE 'UTC';

ALTER TABLE "invoices" ALTER COLUMN "invoice_date"              TYPE timestamptz USING "invoice_date" AT TIME ZONE 'UTC';
ALTER TABLE "invoices" ALTER COLUMN "due_date"                   TYPE timestamptz USING "due_date" AT TIME ZONE 'UTC';
ALTER TABLE "invoices" ALTER COLUMN "billing_period_start_date"  TYPE timestamptz USING "billing_period_start_date" AT TIME ZONE 'UTC';
ALTER TABLE "invoices" ALTER COLUMN "billing_period_end_date"    TYPE timestamptz USING "billing_period_end_date" AT TIME ZONE 'UTC';

ALTER TABLE "messages" ALTER COLUMN "message_sent_at" TYPE timestamptz USING "message_sent_at" AT TIME ZONE 'UTC';

ALTER TABLE "payments" ALTER COLUMN "charge_date"     TYPE timestamptz USING "charge_date" AT TIME ZONE 'UTC';
ALTER TABLE "payments" ALTER COLUMN "settlement_date" TYPE timestamptz USING "settlement_date" AT TIME ZONE 'UTC';
ALTER TABLE "payments" ALTER COLUMN "refunded_at"     TYPE timestamptz USING "refunded_at" AT TIME ZONE 'UTC';

ALTER TABLE "purchase_access_sessions" ALTER COLUMN "expires" TYPE timestamptz USING "expires" AT TIME ZONE 'UTC';

ALTER TABLE "purchases" ALTER COLUMN "billing_cycle_anchor" TYPE timestamptz USING "billing_cycle_anchor" AT TIME ZONE 'UTC';
ALTER TABLE "purchases" ALTER COLUMN "purchase_date"        TYPE timestamptz USING "purchase_date" AT TIME ZONE 'UTC';
ALTER TABLE "purchases" ALTER COLUMN "end_date"             TYPE timestamptz USING "end_date" AT TIME ZONE 'UTC';

ALTER TABLE "subscription_items" ALTER COLUMN "added_date" TYPE timestamptz USING "added_date" AT TIME ZONE 'UTC';
ALTER TABLE "subscription_items" ALTER COLUMN "expired_at" TYPE timestamptz USING "expired_at" AT TIME ZONE 'UTC';

ALTER TABLE "subscriptions" ALTER COLUMN "start_date"                  TYPE timestamptz USING "start_date" AT TIME ZONE 'UTC';
ALTER TABLE "subscriptions" ALTER COLUMN "trial_end"                   TYPE timestamptz USING "trial_end" AT TIME ZONE 'UTC';
ALTER TABLE "subscriptions" ALTER COLUMN "current_billing_period_start" TYPE timestamptz USING "current_billing_period_start" AT TIME ZONE 'UTC';
ALTER TABLE "subscriptions" ALTER COLUMN "current_billing_period_end"   TYPE timestamptz USING "current_billing_period_end" AT TIME ZONE 'UTC';
ALTER TABLE "subscriptions" ALTER COLUMN "canceled_at"                 TYPE timestamptz USING "canceled_at" AT TIME ZONE 'UTC';
ALTER TABLE "subscriptions" ALTER COLUMN "cancel_scheduled_at"         TYPE timestamptz USING "cancel_scheduled_at" AT TIME ZONE 'UTC';
ALTER TABLE "subscriptions" ALTER COLUMN "billing_cycle_anchor_date"   TYPE timestamptz USING "billing_cycle_anchor_date" AT TIME ZONE 'UTC';

ALTER TABLE "usage_events" ALTER COLUMN "usage_date" TYPE timestamptz USING "usage_date" AT TIME ZONE 'UTC';

COMMIT;
