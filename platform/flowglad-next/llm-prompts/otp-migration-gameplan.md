# OTP Migration for Billing Portal - Gameplan

## Current State Analysis

The billing portal currently uses a magic link authentication flow:

1. **Entry Point**: `platform/flowglad-next/src/app/billing-portal/[organizationId]/[customerId]/page.tsx` (lines 1-5) - Currently just renders `Internal.tsx` without session check
2. **Sign-In Flow**: Users visit `/billing-portal/[organizationId]/sign-in`, enter email manually, receive magic link via email, click link, then redirected to customer selection or portal
3. **Magic Link Handler**: `platform/flowglad-next/src/server/routers/customerBillingPortalRouter.ts` (lines 384-504) - `requestMagicLinkProcedure` sends magic link via Better Auth
4. **Better Auth Config**: `platform/flowglad-next/src/utils/auth.ts` (lines 72-154) - Uses `magicLink` plugin, OTP plugin not configured
5. **Client Auth**: `platform/flowglad-next/src/utils/authClient.ts` (lines 1-10) - Already has `emailOTPClient()` plugin configured
6. **Email Templates**: Several templates use `organizationBillingPortalURL` instead of customer-specific URLs:
   - `customer-subscription-upgraded.tsx` (line 135)
   - `customer-subscription-created.tsx` (line 105)
   - `customer-subscription-adjusted.tsx` (line 257)

**Current Flow Issues:**
- No automatic OTP sending - users must manually enter email
- Magic link flow requires email click, which is less convenient
- Some email templates don't use customer-specific URLs

## Required Changes

### 1. Update Entry Point with Session Check

**File**: `platform/flowglad-next/src/app/billing-portal/[organizationId]/[customerId]/page.tsx`

Add server-side session check before rendering `Internal.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { getSession } from '@/utils/auth'
import InternalBillingPortalPage from './Internal'

export default async function BillingPortalPage({
  params,
}: {
  params: Promise<{ organizationId: string; customerId: string }>
}) {
  const { organizationId, customerId } = await params
  const session = await getSession()
  
  if (!session) {
    redirect(`/billing-portal/${organizationId}/${customerId}/sign-in`)
  }
  
  return <InternalBillingPortalPage />
}
```

### 2. Create OTP Sign-In Page

**New File**: `platform/flowglad-next/src/app/billing-portal/[organizationId]/[customerId]/sign-in/page.tsx`

Create client component with:
- Auto-send OTP on mount via `sendOTPToCustomer` mutation
- OTP input form (6-digit code)
- Resend OTP button with cooldown (60 seconds)
- Error handling for invalid OTP
- Loading states
- Masked email display
- On success, redirect to `/billing-portal/${organizationId}/${customerId}`

### 3. Add OTP Procedures to Router

**File**: `platform/flowglad-next/src/server/routers/customerBillingPortalRouter.ts`

Add two new procedures after `requestMagicLinkProcedure` (around line 504):

#### 3a. `sendOTPToCustomer` Procedure

```typescript
const sendOTPToCustomerProcedure = publicProcedure
  .input(
    z.object({
      customerId: z.string(),
      organizationId: z.string(),
    })
  )
  .output(
    z.object({
      success: z.boolean(),
      email: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    // Implementation details in PR section
  })
```

#### 3b. `verifyOTPForCustomer` Procedure

```typescript
const verifyOTPForCustomerProcedure = publicProcedure
  .input(
    z.object({
      customerId: z.string(),
      organizationId: z.string(),
      code: z.string(),
    })
  )
  .output(
    z.object({
      success: z.boolean(),
    })
  )
  .mutation(async ({ input }) => {
    // Implementation details in PR section
  })
```

Add to router export (line 672):
```typescript
export const customerBillingPortalRouter = router({
  // ... existing procedures
  sendOTPToCustomer: sendOTPToCustomerProcedure,
  verifyOTPForCustomer: verifyOTPForCustomerProcedure,
})
```

### 4. Configure Better Auth OTP Plugin

**File**: `platform/flowglad-next/src/utils/auth.ts`

- Import `emailOTP` plugin from `better-auth/plugins` (line 3)
- Add `emailOTP()` to plugins array (after line 92, before `magicLink`)
- Configure OTP settings: 6 digits, 10 minute expiry

### 5. Create Email Helper Utilities

**New File**: `platform/flowglad-next/src/utils/emailHelpers.ts`

```typescript
export const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@')
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`
  }
  const visibleChars = Math.min(2, Math.floor(local.length / 3))
  const masked = local.slice(0, visibleChars) + '***' + local.slice(-1)
  return `${masked}@${domain}`
}
```

### 6. Update Email Templates to Use Customer-Specific URLs

**Files to update:**
- `platform/flowglad-next/src/email-templates/customer-subscription-upgraded.tsx` (line 135)
- `platform/flowglad-next/src/email-templates/customer-subscription-created.tsx` (line 105)
- `platform/flowglad-next/src/email-templates/customer-subscription-adjusted.tsx` (line 257)

Change from `organizationBillingPortalURL` to `customerBillingPortalURL` with `customerId` parameter.

### 7. Update Organization-Level Sign-In Page (Optional Enhancement)

**File**: `platform/flowglad-next/src/app/billing-portal/[organizationId]/sign-in/page.tsx`

Add informational message recommending customer-specific URLs (keep existing magic link flow as fallback).

## Acceptance Criteria

- [ ] Users visiting `/billing-portal/[organizationId]/[customerId]` without session are redirected to OTP sign-in page
- [ ] OTP is automatically sent to customer's email when sign-in page loads
- [ ] Users can enter OTP code and successfully authenticate
- [ ] Users with valid sessions bypass sign-in and see portal directly
- [ ] OTP verification creates valid session via Better Auth
- [ ] Resend OTP button works with 60-second cooldown
- [ ] Email masking displays correctly (e.g., "jo***n@example.com")
- [ ] Error handling prevents email enumeration (generic error messages)
- [ ] Customer validation ensures customer belongs to organization before sending OTP
- [ ] All email templates use customer-specific URLs where customerId is available
- [ ] Magic link flow remains functional as fallback for organization-level sign-in

## Open Questions

1. **Rate Limiting**: Should we implement rate limiting for OTP sends/verifications in this PR, or defer to future enhancement?
   - **Decision**: Defer to future enhancement. Basic OTP flow first, then add rate limiting.

2. **OTP Expiry**: What should the OTP expiry time be?
   - **Decision**: 10 minutes (standard for OTP flows)

3. **OTP Length**: How many digits should the OTP be?
   - **Decision**: 6 digits (standard and user-friendly)

4. **Magic Link Coexistence**: Should we keep magic link flow alongside OTP?
   - **Decision**: Yes, keep magic link for organization-level sign-in as fallback. OTP is primary for customer-specific URLs.

5. **Email Template Updates**: Should we update all email templates in this PR or separate PR?
   - **Decision**: Include in this PR since it's related to the customer-specific URL requirement.

## Explicit Opinions

1. **Re-use existing user creation/linking logic**: The `sendOTPToCustomer` procedure should follow the same user account creation and customer linking logic as `requestMagicLinkProcedure` (lines 418-477). This ensures consistency and avoids duplicating business logic.

2. **Keep magic link flow for organization-level sign-in**: The organization-level sign-in page (`/billing-portal/[organizationId]/sign-in`) should continue to support magic link flow. This provides a fallback for users who don't have customer-specific links and helps with gradual migration.

3. **Session creation handled by Better Auth**: After successful OTP verification, Better Auth automatically creates the session. We don't need to manually create sessions - just verify the OTP and let Better Auth handle session management.

4. **Customer validation before OTP send**: Always verify that the customer belongs to the specified organization before sending OTP. This prevents information leakage and ensures security.

5. **Generic error messages**: Use generic error messages (e.g., "Invalid OTP code") to prevent email enumeration attacks. Don't reveal whether a customer exists or not.

6. **Email masking for security**: Display masked email addresses to users for confirmation without revealing the full email address, improving security posture.

7. **Auto-send OTP on page load**: Automatically send OTP when the sign-in page loads (via useEffect). This provides a seamless experience - users don't need to click a button to request OTP.

## PRs

### PR 1: Configure Better Auth OTP Plugin and Create Email Helper

**Files to modify:**
- `platform/flowglad-next/src/utils/auth.ts` - Add emailOTP plugin
- `platform/flowglad-next/src/utils/emailHelpers.ts` - Create new file with `maskEmail` function

**Changes:**
- Import `emailOTP` from `better-auth/plugins`
- Add `emailOTP()` plugin to Better Auth config with 6-digit code and 10-minute expiry
- Create `maskEmail` utility function

**Test Cases:**

```typescript
describe('maskEmail', () => {
  it('should mask short email addresses correctly', () => {
    // setup: email with 2 or fewer characters before @
    // expectation: returns format "a***@domain.com"
  })
  
  it('should mask normal email addresses correctly', () => {
    // setup: email like "john@example.com"
    // expectation: returns format "jo***n@example.com"
  })
  
  it('should handle edge cases', () => {
    // setup: various edge cases (very long local part, special characters, etc.)
    // expectation: handles gracefully without errors
  })
})
```

### PR 2: Add OTP Procedures to Customer Billing Portal Router

**Files to modify:**
- `platform/flowglad-next/src/server/routers/customerBillingPortalRouter.ts` - Add `sendOTPToCustomer` and `verifyOTPForCustomer` procedures

**Changes:**
- Implement `sendOTPToCustomerProcedure`:
  - Fetch customer by ID using `selectCustomerById` (from `@/db/tableMethods/customerMethods`)
  - Verify customer belongs to organization
  - Verify organization exists
  - Set organization ID for billing portal session
  - Create/link user account if needed (reuse logic from `requestMagicLinkProcedure` lines 418-477)
  - Send OTP using `auth.api.sendOtp({ body: { email: customer.email }, headers: await headers() })`
  - Return success with masked email
- Implement `verifyOTPForCustomerProcedure`:
  - Fetch customer by ID
  - Verify customer belongs to organization
  - Verify OTP using `auth.api.verifyOtp({ body: { email: customer.email, code: input.code }, headers: await headers() })`
  - Return success
- Add both procedures to router export

**Test Cases:**

```typescript
describe('sendOTPToCustomer', () => {
  it('should fail if customer does not exist', async () => {
    // setup: call with non-existent customerId
    // expectation: throws TRPCError with code 'NOT_FOUND'
  })
  
  it('should fail if customer does not belong to organization', async () => {
    // setup: call with customerId from different organization
    // expectation: throws TRPCError with code 'FORBIDDEN'
  })
  
  it('should fail if organization does not exist', async () => {
    // setup: call with non-existent organizationId
    // expectation: throws TRPCError with code 'NOT_FOUND'
  })
  
  it('should create user account if customer has no user', async () => {
    // setup: customer with no userId
    // expectation: 
    // - creates Better Auth user
    // - links customer to user
    // - sends OTP email
    // - returns success with masked email
  })
  
  it('should link existing user if customer has no user but user exists', async () => {
    // setup: customer with no userId, but user with matching email exists
    // expectation:
    // - links customer to existing user
    // - sends OTP email
    // - returns success with masked email
  })
  
  it('should send OTP successfully for valid customer', async () => {
    // setup: valid customerId and organizationId
    // expectation:
    // - sets organization ID for billing portal session
    // - sends OTP email to customer email
    // - returns success with masked email
  })
})

describe('verifyOTPForCustomer', () => {
  it('should fail if customer does not exist', async () => {
    // setup: call with non-existent customerId
    // expectation: throws TRPCError with code 'NOT_FOUND'
  })
  
  it('should fail if customer does not belong to organization', async () => {
    // setup: call with customerId from different organization
    // expectation: throws TRPCError with code 'FORBIDDEN'
  })
  
  it('should fail if OTP code is invalid', async () => {
    // setup: call with invalid OTP code
    // expectation: throws TRPCError with code 'BAD_REQUEST' and message 'Invalid OTP code'
  })
  
  it('should fail if OTP code is expired', async () => {
    // setup: call with expired OTP code
    // expectation: throws TRPCError with code 'BAD_REQUEST'
  })
  
  it('should successfully verify valid OTP and create session', async () => {
    // setup: 
    // - send OTP first
    // - get valid OTP code (may need to mock or use test utilities)
    // expectation:
    // - verifies OTP successfully
    // - creates session via Better Auth
    // - returns success
  })
})
```

### PR 3: Create OTP Sign-In Page Component

**Files to create:**
- `platform/flowglad-next/src/app/billing-portal/[organizationId]/[customerId]/sign-in/page.tsx`

**Changes:**
- Create client component that:
  - Extracts `organizationId` and `customerId` from URL params
  - On mount (useEffect), calls `sendOTPToCustomer` mutation
  - Displays masked email address
  - Shows OTP input form (6 digits)
  - Handles OTP submission via `verifyOTPForCustomer` mutation
  - Shows loading states during send/verify
  - Displays error messages for invalid OTP
  - Implements resend OTP button with 60-second cooldown timer
  - Redirects to billing portal on successful verification

**Test Cases:**

```typescript
describe('OTP Sign-In Page', () => {
  it('should automatically send OTP on page load', async () => {
    // setup: render page with valid organizationId and customerId
    // expectation: 
    // - sendOTPToCustomer mutation is called automatically
    // - loading state is shown during send
  })
  
  it('should display masked email address', async () => {
    // setup: render page, wait for OTP send to complete
    // expectation: masked email is displayed (e.g., "jo***n@example.com")
  })
  
  it('should show error if OTP send fails', async () => {
    // setup: mock sendOTPToCustomer to fail
    // expectation: error message is displayed
  })
  
  it('should allow user to enter OTP code', async () => {
    // setup: render page, wait for OTP send
    // expectation: OTP input field is enabled and accepts 6 digits
  })
  
  it('should verify OTP and redirect on success', async () => {
    // setup: 
    // - render page
    // - wait for OTP send
    // - enter valid OTP code
    // - submit form
    // expectation:
    // - verifyOTPForCustomer mutation is called
    // - on success, redirects to /billing-portal/[organizationId]/[customerId]
  })
  
  it('should show error for invalid OTP', async () => {
    // setup:
    // - render page
    // - wait for OTP send
    // - enter invalid OTP code
    // - submit form
    // expectation:
    // - error message displayed
    // - user can retry
  })
  
  it('should implement resend OTP with cooldown', async () => {
    // setup: render page, wait for initial OTP send
    // expectation:
    // - resend button is disabled for 60 seconds after initial send
    // - cooldown timer is displayed
    // - after cooldown, clicking resend sends new OTP
  })
  
  it('should handle loading states correctly', async () => {
    // setup: render page
    // expectation:
    // - loading indicator shown during OTP send
    // - loading indicator shown during OTP verification
    // - inputs disabled during loading
  })
})
```

### PR 4: Update Entry Point with Session Check

**Files to modify:**
- `platform/flowglad-next/src/app/billing-portal/[organizationId]/[customerId]/page.tsx`

**Changes:**
- Add server-side session check using `getSession()`
- Redirect to sign-in page if no session
- Render `Internal.tsx` if session exists

**Test Cases:**

```typescript
describe('Billing Portal Entry Point', () => {
  it('should redirect to sign-in if no session', async () => {
    // setup: request page without session
    // expectation: redirects to /billing-portal/[organizationId]/[customerId]/sign-in
  })
  
  it('should render Internal component if session exists', async () => {
    // setup: request page with valid session
    // expectation: Internal component is rendered
  })
})
```

### PR 5: Update Email Templates to Use Customer-Specific URLs

**Files to modify:**
- `platform/flowglad-next/src/email-templates/customer-subscription-upgraded.tsx` (line 135)
- `platform/flowglad-next/src/email-templates/customer-subscription-created.tsx` (line 105)
- `platform/flowglad-next/src/email-templates/customer-subscription-adjusted.tsx` (line 257)

**Changes:**
- Replace `organizationBillingPortalURL({ organizationId })` with `customerBillingPortalURL({ organizationId, customerId })`
- Ensure `customerId` is available in component props (may need to trace where these templates are called)

**Test Cases:**

```typescript
describe('Email Template URL Updates', () => {
  it('should use customer-specific URL in subscription-upgraded email', () => {
    // setup: render CustomerSubscriptionUpgradedEmail with customerId
    // expectation: button href uses customerBillingPortalURL with customerId
  })
  
  it('should use customer-specific URL in subscription-created email', () => {
    // setup: render CustomerSubscriptionCreatedEmail with customerId
    // expectation: button href uses customerBillingPortalURL with customerId
  })
  
  it('should use customer-specific URL in subscription-adjusted email', () => {
    // setup: render CustomerSubscriptionAdjustedEmail with customerId
    // expectation: button href uses customerBillingPortalURL with customerId
  })
})
```

### PR 6: Update Organization Sign-In Page (Optional Enhancement)

**Files to modify:**
- `platform/flowglad-next/src/app/billing-portal/[organizationId]/sign-in/page.tsx`

**Changes:**
- Add informational message recommending customer-specific URLs
- Keep existing magic link flow functional

**Test Cases:**

```typescript
describe('Organization Sign-In Page', () => {
  it('should display message about customer-specific URLs', () => {
    // setup: render page
    // expectation: informational message is displayed
  })
  
  it('should still allow magic link flow', () => {
    // setup: render page, enter email, submit
    // expectation: magic link is sent (existing functionality preserved)
  })
})
```

## Parallelization

**PR Dependencies:**
- PR 1 (Better Auth config + email helpers) → Blocks PR 2, PR 3
- PR 2 (OTP procedures) → Blocks PR 3
- PR 3 (Sign-in page) → Blocks PR 4
- PR 4 (Entry point) → No dependencies, can run in parallel with PR 5
- PR 5 (Email templates) → No dependencies, can run in parallel with PR 4
- PR 6 (Organization sign-in) → No dependencies, can run anytime

**Parallel Execution Plan:**
1. **Phase 1**: PR 1 (must complete first)
2. **Phase 2**: PR 2 (depends on PR 1)
3. **Phase 3**: PR 3 (depends on PR 1, PR 2) and PR 5 (independent)
4. **Phase 4**: PR 4 (depends on PR 3) and PR 6 (independent)

**Recommended Order:**
1. PR 1 → PR 2 → PR 3 → PR 4 (core OTP flow)
2. PR 5 (can start after PR 1, complete anytime)
3. PR 6 (optional, can be done anytime)







