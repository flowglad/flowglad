/**
 * DB Test Mocks
 *
 * This file provides configuration for external services in db.test.ts files.
 *
 * IMPORTANT: This file must be imported AFTER bun.mocks.ts in db test setup.
 *
 * All services passthrough to mock server containers via URL configuration:
 * - Stripe SDK → stripe-mock (localhost:12111) via STRIPE_MOCK_HOST
 * - Svix SDK → flowglad-mock-server (localhost:9001) via SVIX_MOCK_HOST
 * - Unkey SDK → flowglad-mock-server (localhost:9002) via UNKEY_MOCK_HOST
 * - Trigger.dev SDK → flowglad-mock-server (localhost:9003) via TRIGGER_API_URL
 * - Redis SDK → flowglad-mock-server (localhost:9004) via UPSTASH_REDIS_REST_URL
 * - Resend SDK → flowglad-mock-server (localhost:9005) via RESEND_BASE_URL
 *
 * If a test legitimately needs real external services, use *.integration.test.ts instead.
 */

// Import service configuration documentation (no actual mocks - all services use mock servers)
import './mocks/db-blockers'

// NOTE: All external services use mock server containers in db tests:
// - Stripe → stripe-mock (localhost:12111)
// - Svix → flowglad-mock-server (localhost:9001)
// - Unkey → flowglad-mock-server (localhost:9002)
// - Trigger.dev → flowglad-mock-server (localhost:9003)
// - Redis → flowglad-mock-server (localhost:9004)
// - Resend → flowglad-mock-server (localhost:9005)
//
// Tests that need to mock specific functions should use *.stripe.test.ts pattern.
