# Gameplan: upstash-ratelimit-combinator

## Problem Statement

The codebase currently lacks a unified rate limiting solution for tRPC procedures. While Unkey provides rate limiting for API key-authenticated requests, public procedures (like the new AI support chat) have no protection against abuse. We need a composable rate limiting system that follows existing patterns (`cached()`, `traced()`) and integrates cleanly with tRPC.

## Solution Summary

Create a `rateLimited()` combinator function that wraps async functions with Upstash Ratelimit protection. The combinator will follow the same pattern as `cached()` and `traced()`, accepting a configuration object and returning a wrapped function. We'll also provide a tRPC middleware factory for easy integration with procedures. The implementation will include observability (tracing, logging) and fail-open semantics consistent with other utilities.

## Current State Analysis

1. **Redis Infrastructure**: Already configured with Upstash Redis (`src/utils/redis.ts`)
   - Environment variables: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
   - Proper test stubbing infrastructure exists
   - Namespace system for key isolation (`RedisKeyNamespace` enum)

2. **Existing Patterns**:
   - `traced()` in `src/utils/tracing.ts` - combinator that adds OpenTelemetry spans
   - `cached()` in `src/utils/cache.ts` - combinator that adds Redis caching with dependency tracking

3. **Current Rate Limiting**:
   - Unkey provides upstream rate limiting for API key requests only
   - In-memory tracking for suspicious auth patterns (`securityTelemetry.ts`)
   - No rate limiting for public procedures

## Required Changes

### Patch 1: Core Rate Limiting Utility

**File: `platform/flowglad-next/src/utils/ratelimit.ts`** (new file)

Create the core rate limiting combinator with the following exports:

```ts
// Configuration types
interface RateLimitConfig<TArgs extends unknown[]> {
  /** Unique name for this rate limiter (used in Redis keys and observability) */
  name: string
  /** Rate limiting algorithm configuration */
  limiter: ReturnType<typeof Ratelimit.slidingWindow> | ReturnType<typeof Ratelimit.fixedWindow> | ReturnType<typeof Ratelimit.tokenBucket>
  /** Extract identifier from function arguments (e.g., userId, IP, sessionId) */
  identifierFn: (...args: TArgs) => string
  /** Whether to fail open (allow request) if Redis is unavailable. Defaults to true. */
  failOpen?: boolean
}

// Main combinator - wraps any async function with rate limiting
function rateLimited<TArgs extends unknown[], TResult>(
  config: RateLimitConfig<TArgs>,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult>

// Pre-configured rate limiters for common use cases
const RateLimiters = {
  /** 20 requests per minute - suitable for AI/LLM endpoints */
  ai: (name: string) => Ratelimit.slidingWindow(20, '1m'),
}

// Helper to create identifier from IP + user agent
function createFingerprint(ip: string, userAgent: string): string

// Error class for rate limit exceeded
class RateLimitExceededError extends Error {
  constructor(
    public readonly identifier: string,
    public readonly resetAt: Date,
    public readonly limit: number,
    public readonly remaining: number
  ) {
    super(`Rate limit exceeded for ${identifier}`)
    this.name = 'RateLimitExceededError'
  }
}
```

**Implementation details:**
- Use existing `redis()` function from `src/utils/redis.ts`
- Add tracing via `traced()` combinator for observability
- Log rate limit events at info level
- Add `RateLimit` to `RedisKeyNamespace` enum in `src/utils/redis.ts`

### Patch 2: tRPC Middleware Integration

**File: `platform/flowglad-next/src/server/rateLimitMiddleware.ts`** (new file)

Create tRPC middleware factory:

```ts
import { TRPCError } from '@trpc/server'
import type { Ratelimit } from '@upstash/ratelimit'

interface RateLimitMiddlewareConfig {
  /** Rate limiter configuration */
  limiter: ReturnType<typeof Ratelimit.slidingWindow>
  /** Extract identifier from tRPC context (e.g., user ID, IP address) */
  getIdentifier: (ctx: TRPCContext) => string
  /** Custom error message. Defaults to "Too many requests" */
  message?: string
}

// Factory function to create rate limit middleware
function createRateLimitMiddleware(config: RateLimitMiddlewareConfig): TRPCMiddleware

// Pre-built middleware using IP + user agent fingerprint
const rateLimitByFingerprint: (limiter: ReturnType<typeof Ratelimit.slidingWindow>) => TRPCMiddleware
```

### Patch 3: Apply to Support Chat

**File: `platform/flowglad-next/src/server/routers/supportChatRouter.ts`**

Modify the `sendMessage` mutation to use rate limiting:

```ts
import { rateLimitByFingerprint, RateLimiters } from '@/server/rateLimitMiddleware'

// Add rate limiting middleware to the procedure (20 req/min using IP + user agent fingerprint)
export const sendMessage = publicProcedure
  .use(rateLimitByFingerprint(RateLimiters.ai('supportChat')))
  .input(sendMessageInputSchema)
  .output(sendMessageOutputSchema)
  .mutation(async ({ input }) => {
    // ... existing implementation
  })
```

## Acceptance Criteria

- [ ] `rateLimited()` combinator exists and follows the pattern of `cached()` and `traced()`
- [ ] tRPC middleware factory exists for easy procedure integration
- [ ] Support chat endpoint is protected with rate limiting (20 req/min per IP+UA fingerprint)
- [ ] Rate limit errors return appropriate HTTP 429 status via tRPC
- [ ] Observability: rate limit events are traced and logged
- [ ] Fail-open behavior: if Redis is unavailable, requests are allowed (with warning log)
- [ ] Test coverage for rate limiting logic
- [ ] `RateLimit` namespace added to `RedisKeyNamespace` enum

## Decisions Made

1. **Identifier for public endpoints**: Use combination of IP address + user agent fingerprint. This provides better protection against distributed abuse while still being practical.

2. **Support chat rate limit**: 20 requests per minute - moderate limit that allows normal conversation flow while preventing abuse.

## Explicit Opinions

1. **Use sliding window algorithm as default** - More forgiving than fixed window, prevents burst-at-boundary issues. This matches industry best practices (Stripe, GitHub, etc.).

2. **Fail-open by default** - Consistent with `cached()` which fails open on Redis errors. Availability is prioritized over strict rate limiting. Security-critical endpoints can override this.

3. **IP + User Agent fingerprint for public endpoints** - Combining IP with user agent provides better protection against distributed abuse. The fingerprint is a hash of `${ip}:${userAgent}` to create a unique identifier.

4. **Separate middleware from combinator** - The `rateLimited()` combinator is for general async functions. The tRPC middleware is a separate concern that uses the combinator internally. This separation allows reuse outside tRPC.

5. **Use existing Redis connection** - No new dependencies needed. Upstash Ratelimit works with the existing `@upstash/redis` client.

## Patches

### Patch 1: Core Rate Limiting Utility

**Files to modify:**
- `platform/flowglad-next/src/utils/redis.ts` - Add `RateLimit` to `RedisKeyNamespace` enum
- `platform/flowglad-next/src/utils/ratelimit.ts` - Create new file with combinator

**Test cases:**
```ts
describe('rateLimited', () => {
  describe('basic functionality', () => {
    it('allows requests within the rate limit', async () => {
      // setup: create a rateLimited function with 5 req/min limit
      // action: call the function 3 times
      // expect: all calls succeed without throwing
    })

    it('throws RateLimitExceededError when limit is exceeded', async () => {
      // setup: create a rateLimited function with 2 req/min limit
      // action: call the function 3 times rapidly
      // expect: third call throws RateLimitExceededError with correct properties
    })

    it('resets the limit after the window expires', async () => {
      // setup: create a rateLimited function with 1 req/10s limit
      // action: call once (succeeds), call again (fails), wait 10s, call again
      // expect: first and third calls succeed, second throws
    })
  })

  describe('fail-open behavior', () => {
    it('allows requests when Redis is unavailable and failOpen is true', async () => {
      // setup: mock Redis to throw error, create rateLimited fn with failOpen: true
      // action: call the function
      // expect: function executes successfully, warning is logged
    })

    it('throws when Redis is unavailable and failOpen is false', async () => {
      // setup: mock Redis to throw error, create rateLimited fn with failOpen: false
      // action: call the function
      // expect: throws error (not RateLimitExceededError, but the Redis error)
    })
  })

  describe('identifier extraction', () => {
    it('uses identifierFn to extract rate limit key from arguments', async () => {
      // setup: create rateLimited fn with identifierFn that extracts userId
      // action: call with different userIds
      // expect: each userId has independent rate limit counter
    })
  })
})
```

### Patch 2: tRPC Middleware

**Files to create:**
- `platform/flowglad-next/src/server/rateLimitMiddleware.ts`

**Test cases:**
```ts
describe('createRateLimitMiddleware', () => {
  it('allows requests within the rate limit', async () => {
    // setup: create middleware with 5 req/min, mock tRPC context
    // action: process 3 requests through middleware
    // expect: all requests pass through to next()
  })

  it('throws TRPCError with TOO_MANY_REQUESTS code when limit exceeded', async () => {
    // setup: create middleware with 1 req/min
    // action: process 2 requests
    // expect: second request throws TRPCError with code 'TOO_MANY_REQUESTS'
  })

  it('extracts identifier using getIdentifier function', async () => {
    // setup: create middleware with custom getIdentifier
    // action: process requests with different contexts
    // expect: identifier is correctly extracted and used for rate limiting
  })
})

describe('rateLimitByFingerprint', () => {
  it('creates unique identifier from IP + user agent combination', async () => {
    // setup: create rateLimitByFingerprint middleware
    // action: process requests with same IP but different user agents
    // expect: each IP+UA combination has independent rate limit
  })

  it('rate limits same fingerprint across requests', async () => {
    // setup: create rateLimitByFingerprint middleware with 2 req/min limit
    // action: process 3 requests with same IP and user agent
    // expect: first 2 succeed, third throws TOO_MANY_REQUESTS
  })
})
```

### Patch 3: Apply to Support Chat

**Files to modify:**
- `platform/flowglad-next/src/server/routers/supportChatRouter.ts`

**Test cases:**
```ts
describe('supportChat.sendMessage rate limiting', () => {
  it('allows normal usage within rate limits', async () => {
    // setup: call sendMessage mutation a few times
    // expect: all calls succeed
  })

  it('returns TOO_MANY_REQUESTS error when rate limit exceeded', async () => {
    // setup: exhaust rate limit by calling many times
    // action: call one more time
    // expect: TRPCError with TOO_MANY_REQUESTS code
  })
})
```

## Dependency Graph

```
- Patch 1 -> []
- Patch 2 -> [1]
- Patch 3 -> [2]
```

## Verification

1. **Unit tests**: Run `bun test ratelimit` to verify combinator logic
2. **Integration test**: Start dev server, open support chat, send 21+ messages rapidly - should see rate limit error on the 21st
3. **Observability**: Check logs for `rate_limit` events and traces for `ratelimit.*` spans
4. **Type check**: Run `bun run check` to verify no type errors

## Critical Files

- `platform/flowglad-next/src/utils/ratelimit.ts` (new)
- `platform/flowglad-next/src/utils/redis.ts` (modify - add namespace)
- `platform/flowglad-next/src/server/rateLimitMiddleware.ts` (new)
- `platform/flowglad-next/src/server/routers/supportChatRouter.ts` (modify)
