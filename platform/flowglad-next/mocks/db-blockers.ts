/**
 * External Service Configuration for DB Tests
 *
 * All external services are routed to mock server containers via URL configuration.
 * No module-level mocking is required.
 *
 * Services and their mock server configuration:
 * - Stripe (stripe) → stripe-mock container (localhost:12111) via STRIPE_MOCK_HOST
 * - Svix (svix) → flowglad-mock-server (localhost:9001) via SVIX_MOCK_HOST
 * - Unkey (@unkey/api) → flowglad-mock-server (localhost:9002) via UNKEY_MOCK_HOST
 * - Trigger.dev (@trigger.dev/sdk) → flowglad-mock-server (localhost:9003) via TRIGGER_API_URL
 * - Redis (@upstash/redis) → flowglad-mock-server (localhost:9004) via UPSTASH_REDIS_REST_URL
 * - Resend (resend) → flowglad-mock-server (localhost:9005) via RESEND_BASE_URL
 *
 * If a test legitimately needs real external services, use *.integration.test.ts instead.
 */

// This file is intentionally empty of mocks.
// All services are configured to use mock server containers via environment variables.
// See .env.test for the URL configuration.
