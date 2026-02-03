# Sign In → Log In Terminology Refactor

## Objective

Replace user-facing occurrences of "sign in" with "log in" throughout the codebase.

## TL;DR — Key Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| User-facing text | ✅ Change | Primary goal, improves UX consistency |
| Code identifiers | ❌ Keep as-is | Library constraint, not user-facing |
| URL paths | ❌ Keep as-is | URL stability, SEO, link breakage risk |
| "Sign up" terminology | ❌ Keep as-is | Industry standard pairing |
| "Sign in with Google" | ❌ Keep as-is | OAuth provider branding |

**Estimated scope:** ~15 files, ~30 string replacements  
**Risk level:** Low (user-facing strings only, no breaking changes)

## Recommendations Summary

### Do Now (Phase 1)
1. **Change user-facing strings only** — Email templates, UI buttons, page headings, error messages
2. **Keep "Sign in with Google"** — Follows Google branding guidelines
3. **Keep "Sign up"** — "Log in" + "Sign up" is the industry standard pattern

### Do Later (Phase 2)
4. **Update documentation** — README files, MDX docs, code comments

### Do Not Do
5. **Do NOT rename code identifiers** — `signIn`, `SignIn`, `signInSchema` stay as-is (library constraint)
6. **Do NOT rename URL paths** — `/sign-in/` stays as-is (high risk, low benefit)
7. **Do NOT change "sign up" to "register"** — Scope creep, industry standard is "sign up"

### Key Insight
UI terminology and code identifiers serve different audiences. Decoupling them is the correct long-term architecture. Users see "Log in" while developers work with `signIn` — this is normal and matches industry practice.

---

## Outstanding Questions for Stakeholders

Before implementation, the following should be confirmed:

### 1. Business Driver (Required)

**Question:** What is the rationale for preferring "log in" over "sign in"?

- [ ] Brand/style guideline mandate
- [ ] User research indicating confusion
- [ ] Consistency with partner/ecosystem products
- [ ] Other: _________________

**Why this matters:** The rationale determines edge case decisions. If it's a strict brand mandate, every instance must change. If it's user clarity, only high-visibility UI matters.

### 2. Google OAuth Button Text

**Question:** Should "Sign in with Google" remain unchanged?

**Recommendation:** Yes, keep as "Sign in with Google" — this follows Google's [branding guidelines](https://developers.google.com/identity/branding-guidelines).

- [ ] Confirmed: Keep "Sign in with Google"
- [ ] Override: Change to "Log in with Google"

### 3. i18n/Translation Workflow

**Question:** Are translations managed externally (Crowdin, Lokalise) or inline in code?

- [ ] No translations (English only)
- [ ] Inline in code
- [ ] External system: _________________

**Action needed:** If external, notify translation team of terminology change.

---

## Discovery Summary

A codebase search was performed for the following patterns:
- `sign in` (case-insensitive)
- `Sign In`
- `signIn`
- `SignIn`
- `signin`

### Raw Findings

#### Pattern: "sign in" / "Sign In" (space-separated)

| File | Line | Content |
|------|------|---------|
| `platform/flowglad-next/src/utils/email/registry.ts` | 547 | `` `Sign in to your ${props.organizationName} billing portal` `` |
| `platform/flowglad-next/src/utils/email.ts` | 454 | `` `Sign in to your ${organizationName} billing portal` `` |
| `platform/flowglad-next/src/test/behaviorTest/behaviors/authBehaviors.ts` | 10 | `* database hooks when users sign up or sign in.` |
| `platform/flowglad-next/src/app/sign-up/page.tsx` | 239 | `Sign in` |
| `platform/flowglad-next/src/app/sign-in/page.tsx` | 171 | `Sign in to Flowglad` |
| `platform/flowglad-next/src/app/sign-in/page.tsx` | 190 | `Sign in with Google` |
| `platform/flowglad-next/src/app/sign-in/page.tsx` | 249 | `'Sign in'` |
| `skills/skills/setup/SKILL.md` | 782 | `if (!customer) return <div>Please sign in</div>` |
| `platform/docs/sdks/better-auth.mdx` | 135 | `if (!billing.customer) return <div>Please sign in</div>` |
| `platform/flowglad-next/src/email-templates/customer-billing-portal-otp.tsx` | 26 | `` previewText={`Sign in to your billing portal for ${organizationName}`} `` |
| `platform/flowglad-next/src/email-templates/customer-billing-portal-otp.tsx` | 38 | `title={'Sign In to Billing Portal'}` |
| `platform/flowglad-next/src/email-templates/customer-billing-portal-otp.tsx` | 43 | `You requested a verification code to sign in to your billing` |
| `platform/flowglad-next/src/email-templates/customer-billing-portal-magic-link.tsx` | 27 | `` previewText={`Sign in to your billing portal for ${organizationName}`} `` |
| `platform/flowglad-next/src/email-templates/customer-billing-portal-magic-link.tsx` | 38 | `<Header title="Sign In to Billing Portal" variant="customer" />` |
| `platform/flowglad-next/src/email-templates/customer-billing-portal-magic-link.tsx` | 41 | `You requested a magic link to sign in to your billing portal` |
| `platform/flowglad-next/src/email-templates/customer-billing-portal-magic-link.tsx` | 49 | `Sign In to Billing Portal` |
| `platform/flowglad-next/src/app/demo-route/SubscriptionEmailPreviews.tsx` | 294-295 | `subject="Sign In to Billing Portal"` / `previewText` |
| `platform/flowglad-next/src/app/demo-route/SubscriptionEmailPreviews.tsx` | 325-326 | `subject="Sign In to Billing Portal"` / `previewText` |
| `playground/seat-based-billing/src/app/sign-up/page.tsx` | 74 | `to sign in` |
| `playground/seat-based-billing/src/app/sign-in/page.tsx` | 33 | `<h1 className="mb-6 text-xl font-semibold">Sign in</h1>` |
| `playground/seat-based-billing/src/app/sign-in/page.tsx` | 55 | `{loading ? 'Signing in…' : 'Sign in'}` |
| `playground/seat-based-billing/README.md` | 119 | `│   │   ├── sign-in/        # Sign in page` |
| `playground/seat-based-billing/README.md` | 136 | `Users can sign up and sign in with email/password.` |
| `playground/react-native/app/(auth)/sign-in.tsx` | 31 | `Sign In` |
| `playground/react-native/app/(auth)/sign-in.tsx` | 48 | `<Button title="Sign in" onPress={handleLogin} />` |
| `playground/generation-based-subscription/src/app/sign-up/page.tsx` | 74 | `to sign in` |
| `playground/generation-based-subscription/src/app/sign-in/page.tsx` | 33 | `<h1 className="mb-6 text-xl font-semibold">Sign in</h1>` |
| `playground/generation-based-subscription/src/app/sign-in/page.tsx` | 55 | `{loading ? 'Signing in…' : 'Sign in'}` |
| `playground/generation-based-subscription/README.md` | 119 | `│   │   ├── sign-in/        # Sign in page` |
| `playground/generation-based-subscription/README.md` | 136 | `Users can sign up and sign in with email/password.` |
| `platform/flowglad-next/src/app/sign-in/reset-password/page.tsx` | 135 | `Back to Sign In` |
| `platform/flowglad-next/src/app/sign-in/reset-password/page.tsx` | 232 | `Back to Sign In` |
| `platform/flowglad-next/src/app/billing-portal/[organizationId]/[customerId]/sign-in/page.tsx` | 223 | `Sign In to Billing Portal` |
| `platform/flowglad-next/src/app/billing-portal/[organizationId]/[customerId]/sign-in/page.tsx` | 281 | `Sign In to Billing Portal` |
| `platform/flowglad-next/src/app/billing-portal/[organizationId]/sign-in/page.tsx` | 73 | `Sign In to Billing Portal` |
| `platform/flowglad-next/ERROR_HANDLING.md` | 128 | `sign in to your existing account` |

#### Pattern: `signIn` / `SignIn` (camelCase/PascalCase identifiers)

| File | Line | Content |
|------|------|---------|
| `platform/flowglad-next/src/utils/authClient.ts` | 13 | `export const { signIn, signOut, signUp, useSession } = authClient` |
| `platform/flowglad-next/src/server/routers/customerBillingPortalRouter.ts` | 515 | `await auth.api.signInMagicLink({` |
| `platform/flowglad-next/src/lib/schemas.ts` | 25 | `export const signInSchema = z.object({` |
| `platform/flowglad-next/src/lib/schema.unit.test.ts` | 5+ | Multiple references to `signInSchema` |
| `platform/flowglad-next/src/app/sign-up/page.tsx` | 17 | `import { signIn, signUp } from '@/utils/authClient'` |
| `platform/flowglad-next/src/app/sign-in/page.tsx` | 17-19 | `import { signInSchema }`, `import { signIn }` |
| `platform/flowglad-next/src/app/sign-in/page.tsx` | 80 | `export default function SignIn()` |
| `platform/flowglad-next/src/app/sign-in/page.tsx` | 81+ | `SigninValues`, `signinFetchOptions` |
| `platform/flowglad-next/src/app/sign-in/page.test.tsx` | 13+ | `describe('SignIn Page...`, `signInSchema` references |
| `platform/flowglad-next/mocks/module-mocks.ts` | 26 | `signInMagicLink: mock(async () => ({ success: true })),` |
| `playground/seat-based-billing/src/app/sign-in/page.tsx` | 9 | `export default function SignInPage()` |
| `playground/seat-based-billing/src/app/sign-in/page.tsx` | 20 | `await authClient.signIn.email(` |
| `playground/react-native/app/(auth)/sign-in.tsx` | 13 | `export default function SignIn()` |
| `playground/react-native/app/(auth)/sign-in.tsx` | 18 | `const signInResponse = await authClient.signIn.email({` |
| `playground/generation-based-subscription/src/app/sign-in/page.tsx` | 9 | `export default function SignInPage()` |
| `playground/generation-based-subscription/src/app/sign-in/page.tsx` | 20 | `await authClient.signIn.email(` |
| `platform/flowglad-next/src/app/billing-portal/[organizationId]/[customerId]/sign-in/page.tsx` | 22 | `export default function CustomerBillingPortalOTPSignIn()` |
| `platform/flowglad-next/src/app/billing-portal/[organizationId]/sign-in/page.tsx` | 22 | `export default function BillingPortalSignIn()` |
| `packages/react/src/FlowgladContext.tsx` | 932 | `if (!billing.customer) return <SignInPrompt />` |

#### Directory/File Paths Containing "sign-in"

```
platform/flowglad-next/src/app/sign-in/
├── layout.tsx
├── page.tsx
├── page.test.tsx
└── reset-password/
    ├── page.tsx
    └── page.test.tsx

platform/flowglad-next/src/app/billing-portal/[organizationId]/sign-in/
└── page.tsx

platform/flowglad-next/src/app/billing-portal/[organizationId]/[customerId]/sign-in/
└── page.tsx

playground/seat-based-billing/src/app/sign-in/
└── page.tsx

playground/generation-based-subscription/src/app/sign-in/
└── page.tsx

playground/react-native/app/(auth)/sign-in.tsx
```

#### Related Pattern: "signing secret" / `signingSecret`

Multiple occurrences found related to webhook cryptographic signing (not authentication):
- `platform/flowglad-next/src/utils/svix.ts` - `getSvixSigningSecret`
- `platform/flowglad-next/src/utils/stripe.ts` - `signingSecret`
- `platform/flowglad-next/src/components/settings/webhooks/` - "Webhook Signing Secret"
- Various test files and documentation

---

## Decisions & Rationale

This section documents decisions based on long-term maintainability, industry best practices, and risk assessment.

### Scope Decisions

#### 1. User-facing text: Change from "sign in" to "log in"

**Decision:** ✅ Yes, change all user-facing text.

**Rationale:** "Log in" is slightly more common in modern web applications and is grammatically clearer ("log in" as verb, "login" as noun/adjective). Major platforms like Facebook, Twitter/X, and LinkedIn use "Log in." This change improves consistency with user expectations.

**Exception:** Preserve "sign in" only where it appears in third-party branding (e.g., "Sign in with Google" if Google's brand guidelines require it—though they actually use "Sign in," so this may remain).

#### 2. Code identifiers: DO NOT rename

**Decision:** ❌ Do not rename code identifiers (`signIn`, `SignIn`, `signInSchema`, etc.)

**Rationale:**
- The `better-auth` library exports `signIn` as its API—this cannot be changed
- Aliasing (`import { signIn as logIn }`) creates confusion, makes grep unreliable, and increases onboarding friction
- Code identifiers are developer-facing, not user-facing; the cost/benefit ratio is unfavorable
- Renaming would require updating all tests, type definitions, and imports across the codebase
- Industry standard: Code terminology often differs from UI terminology (e.g., many codebases use `auth` internally but display "Account" to users)

**Best practice:** UI strings and code identifiers serve different audiences. Keep them decoupled.

#### 3. Directory and file paths: DO NOT rename (for now)

**Decision:** ❌ Do not rename `/sign-in/` paths to `/log-in/`

**Rationale:**
- **URL stability is critical.** Changing URLs breaks:
  - Existing bookmarks and shared links
  - Magic link emails already sent to users
  - External documentation and tutorials
  - SEO rankings (even with 301 redirects, there's a temporary impact)
  - Analytics dashboards filtering by path
- The user sees the button text ("Log in"), not the URL path
- `/sign-in` as a URL path is well-understood and doesn't cause user confusion
- Redirect infrastructure adds complexity and maintenance burden

**If paths must change in the future:**
1. Implement 301 redirects in `middleware.ts` FIRST
2. Keep redirects active for minimum 12 months
3. Update all internal documentation and links
4. Notify users of URL changes in changelog

#### 4. better-auth library exports: Leave as-is

**Decision:** Keep `signIn` export unchanged.

```typescript
// Keep this exactly as-is
export const { signIn, signOut, signUp, useSession } = authClient
```

**Rationale:** Fighting the library's naming convention creates friction for developers familiar with `better-auth` documentation. The code is not user-facing.

### Categorization Decisions

#### 5. Cryptographic signing exclusions: Confirmed correct

**Decision:** ✅ Exclusion is correct.

`signingSecret`, `getSvixSigningSecret`, "Webhook Signing Secret" refer to cryptographic operations, not authentication. These must remain unchanged.

#### 6. Test file comments: Update

**Decision:** ✅ Update for consistency.

Comments like "when users sign up or sign in" should become "when users sign up or log in" for documentation consistency. Low effort, low risk.

#### 7. JSDoc/documentation examples: Update user-facing strings only

**Decision:** Partial update.

- Update example UI strings: `"Please sign in"` → `"Please log in"`
- Keep example code identifiers: `<SignInPrompt />` remains unchanged (per Decision #2)

### Consistency Decisions

#### 8. "Sign up" terminology: Keep as-is

**Decision:** ❌ Do not change "sign up" to "register"

**Rationale:**
- "Log in" + "Sign up" is the dominant industry pattern (used by GitHub, Stripe, Vercel, etc.)
- "Register" is more formal and less common in modern SaaS
- Changing "sign up" would double the scope of this refactor
- Users understand "Sign up" universally

#### 9. Brand/style guidelines

**Decision:** Establish guideline.

**Recommended terminology:**
| Term | Usage | Example |
|------|-------|---------|
| Log in | Verb (action) | "Log in to your account" |
| Login | Noun/adjective | "Your login credentials" |
| Sign up | Verb (action) | "Sign up for free" |
| Sign-up | Noun/adjective | "The sign-up process" |

Add this to a `STYLE_GUIDE.md` or similar documentation.

#### 10. Rationale for "log in" preference

**Documented rationale:**
- "Log in" is etymologically connected to "log" (recording entry), which aligns with authentication
- Clearer grammatical distinction: "log in" (verb) vs "login" (noun)
- Matches majority of modern SaaS products
- User research (if available) should be referenced here

### Technical Decisions

#### 11. Impact assessment

| Area | Impact | Mitigation |
|------|--------|------------|
| Existing user sessions | None | Sessions are token-based, not tied to terminology |
| Analytics/tracking | None | Paths unchanged (per Decision #3) |
| External documentation | Low | Update docs as part of rollout |
| API responses/errors | Low | Update error message strings |

#### 12. Rollout strategy: Phased

**Decision:** Phased rollout over 2 releases.

**Phase 1 (this PR):** User-facing strings only
- Email templates
- UI button/heading text
- Error messages

**Phase 2 (follow-up PR):** Documentation & examples
- README files
- MDX documentation
- SKILL.md files
- Code comments

**Not planned:** URL paths, code identifiers

#### 13. i18n/Localization

**Decision:** Changes apply to English source strings only.

- If using a translation management system, source string changes will trigger translation workflows
- Translators should be notified of the terminology change rationale
- **Action needed:** Verify whether translations are managed externally or inline

### Risk Assessment Matrix

| Change Category | Risk Level | Reversibility | User Impact | Recommendation |
|-----------------|------------|---------------|-------------|----------------|
| Email template text | 🟢 Low | Easy (code revert) | Cosmetic | ✅ Proceed |
| UI button/heading text | 🟢 Low | Easy (code revert) | Cosmetic | ✅ Proceed |
| Error message text | 🟢 Low | Easy (code revert) | Cosmetic | ✅ Proceed |
| Documentation | 🟢 Low | Easy (code revert) | None | ✅ Proceed (Phase 2) |
| Code identifiers | 🟡 Medium | Medium (test updates) | None (dev-only) | ❌ Skip |
| URL paths (`/sign-in/`) | 🔴 High | Hard (redirects, SEO) | Broken links | ❌ Skip |

### Why URL Path Changes Are High Risk

Changing `/sign-in/` to `/log-in/` would break:

1. **Magic link emails already in transit** — Emails sent before deployment contain `/sign-in` URLs. If the path changes without redirects, users clicking those links get 404s.

2. **Bookmarked URLs** — Users who bookmarked the login page lose access.

3. **External documentation** — Tutorials, partner docs, and support articles linking to `/sign-in` break.

4. **SEO rankings** — Even with 301 redirects, there's temporary ranking impact and link equity loss.

5. **Analytics continuity** — Dashboards filtering by `/sign-in` path lose historical continuity.

**Conclusion:** The user sees "Log in" button text, not the URL. Changing the URL provides minimal user benefit for significant risk.

### Risk Mitigation

#### 14. Testing requirements

**Required testing:**
- [ ] Visual regression: Verify all "Log in" buttons/headings render correctly
- [ ] Email preview: Verify email templates render correctly
- [ ] E2E auth flow: Complete login flow works end-to-end
- [ ] Grep audit: Verify no "Sign in" remains in user-facing strings (except Google OAuth branding)

#### 15. Database/external storage

**Verified:** No database records store "sign in" terminology.
- Audit logs store event types (e.g., `user.authenticated`), not display strings
- Notification templates are in code, not database

**Action if this changes:** Query database for any stored strings before deployment.

#### 16. URL redirects

**Decision:** Not required (paths are not changing per Decision #3).

If paths change in the future, implement in `middleware.ts`:
```typescript
// Example redirect (NOT IMPLEMENTING NOW)
if (request.nextUrl.pathname.startsWith('/sign-in')) {
  return NextResponse.redirect(
    new URL(request.nextUrl.pathname.replace('/sign-in', '/log-in'), request.url),
    { status: 301 }
  )
}
```

---

## Files Summary by Category

### Category A: User-facing text (strings shown to users)

- Email templates (4 files)
- UI page components (8 files)
- Error messages (1 file)

### Category B: Documentation

- README files (2 files)
- MDX documentation (1 file)
- SKILL.md files (1 file)
- Inline code comments (1 file)

### Category C: Code identifiers

- Schema definitions (1 file)
- Function/component names (6+ files)
- Test descriptions (2 files)
- Type definitions (2 files)

### Category D: File/directory paths

- 6 directories containing "sign-in"
- 1 standalone file with "sign-in" in name

### Category E: Excluded (cryptographic signing)

- Webhook signing secret references (10+ files)

### Category F: Explicitly out of scope

- Code identifiers (`signIn`, `SignIn`, `signInSchema`, etc.)
- File/directory paths (`/sign-in/`)
- better-auth library re-exports

---

## Implementation Plan

### Phase 1: Core User-Facing Strings (This PR)

**Scope:** Email templates, UI components, error messages

**Files to modify:**

#### Email Templates (4 files)
| File | Change |
|------|--------|
| `src/email-templates/customer-billing-portal-otp.tsx` | "Sign in" → "Log in" (3 occurrences) |
| `src/email-templates/customer-billing-portal-magic-link.tsx` | "Sign in" → "Log in" (4 occurrences) |
| `src/utils/email/registry.ts` | "Sign in" → "Log in" (1 occurrence) |
| `src/utils/email.ts` | "Sign in" → "Log in" (1 occurrence) |

#### UI Pages (5 files)
| File | Change |
|------|--------|
| `src/app/sign-in/page.tsx` | "Sign in" → "Log in" (3 occurrences) |
| `src/app/sign-in/reset-password/page.tsx` | "Back to Sign In" → "Back to Log In" (2 occurrences) |
| `src/app/sign-up/page.tsx` | "Sign in" link text → "Log in" (1 occurrence) |
| `src/app/billing-portal/[organizationId]/sign-in/page.tsx` | "Sign In to Billing Portal" → "Log In to Billing Portal" |
| `src/app/billing-portal/[organizationId]/[customerId]/sign-in/page.tsx` | "Sign In to Billing Portal" → "Log In to Billing Portal" |

#### Error Messages (1 file)
| File | Change |
|------|--------|
| `ERROR_HANDLING.md` | "sign in to your existing account" → "log in to your existing account" |

#### Demo/Preview Components (1 file)
| File | Change |
|------|--------|
| `src/app/demo-route/SubscriptionEmailPreviews.tsx` | Update subject/preview text props |

**Exception - Keep "Sign in with Google":**
The OAuth button text "Sign in with Google" follows Google's branding guidelines and should remain unchanged.

#### Test File Updates (if needed)
If any tests assert on "Sign in" text content (e.g., `expect(screen.getByText('Sign in'))`), update those assertions to "Log in". Check:
- `src/app/sign-in/page.test.tsx`
- Any E2E tests that check for button/heading text

### Phase 2: Documentation & Examples (Follow-up PR)

**Scope:** README files, MDX docs, SKILL.md, code comments

| File | Change |
|------|--------|
| `platform/docs/sdks/better-auth.mdx` | Update example string |
| `skills/skills/setup/SKILL.md` | Update example string |
| `src/test/behaviorTest/behaviors/authBehaviors.ts` | Update comment |

### Phase 3: Playground Apps (Optional, separate PRs)

**Consideration:** Playground apps are example code that users may have copied. Changes should be:
- Mentioned in release notes
- Coordinated with any tutorial/documentation updates

| Directory | Files |
|-----------|-------|
| `playground/seat-based-billing/` | `sign-in/page.tsx`, `sign-up/page.tsx`, `README.md` |
| `playground/generation-based-subscription/` | `sign-in/page.tsx`, `sign-up/page.tsx`, `README.md` |
| `playground/react-native/` | `sign-in.tsx` |

### Not Planned (Explicitly Deferred)

| Item | Reason |
|------|--------|
| Rename `/sign-in/` paths to `/log-in/` | URL stability, SEO, link breakage risk |
| Rename `signIn` code identifiers | Library constraint, developer friction |
| Change "Sign up" to "Register" | Industry standard, scope creep |

---

## Pre-Implementation Checklist

**Stakeholder sign-off:**
- [ ] Business driver documented (see Outstanding Questions §1)
- [ ] Google OAuth button text decision confirmed (see Outstanding Questions §2)
- [ ] i18n workflow identified (see Outstanding Questions §3)

**Technical verification:**
- [ ] Confirm no database tables store "sign in" display strings
- [ ] Check if analytics dashboards reference these strings
- [ ] Identify any tests asserting on "Sign in" text that need updates

## Post-Implementation Checklist

- [ ] Visual review: All "Log in" buttons render correctly
- [ ] Email preview: Templates display correctly
- [ ] E2E test: Complete authentication flow works
- [ ] Grep audit: `rg -i "sign in" --type tsx --type ts` shows only:
  - "Sign in with Google" (OAuth branding)
  - Code comments (Phase 2)
  - Playground apps (Phase 3)
- [ ] Update style guide with terminology decisions

---

## Notes

- Total approximate occurrences: ~40 user-facing strings (in scope), ~50 code identifiers (out of scope)
- The playground apps duplicate patterns across `seat-based-billing` and `generation-based-subscription`
- Some occurrences are in test files that mirror production code
- Test file string assertions may need updates if they check for "Sign in" text

## Industry Reference

Common terminology patterns in major platforms:

| Platform | Login Term | Registration Term |
|----------|------------|-------------------|
| GitHub | Sign in | Sign up |
| Stripe | Log in | Sign up |
| Vercel | Log in | Sign up |
| Google | Sign in | Create account |
| Microsoft | Sign in | Create account |

The "Log in" + "Sign up" pattern chosen here aligns with Stripe and Vercel, which are common developer tools.

---

---

## AI Agent Implementation Plan

This section provides step-by-step instructions for AI agent execution. Each task is atomic and includes verification steps.

### Prerequisites

Before starting, run:
```bash
cd platform/flowglad-next
bun run init:flowglad-next
```

### Execution Order

Tasks are grouped into batches. **Complete all tasks in a batch before moving to the next batch.** Tasks within a batch can be executed in parallel.

---

### Batch 1: Email Templates (4 files)

#### Task 1.1: Update `customer-billing-portal-otp.tsx`

**File:** `platform/flowglad-next/src/email-templates/customer-billing-portal-otp.tsx`

**Changes:**
| Line (approx) | Old | New |
|---------------|-----|-----|
| 26 | `Sign in to your billing portal` | `Log in to your billing portal` |
| 38 | `Sign In to Billing Portal` | `Log In to Billing Portal` |
| 43 | `to sign in to your billing` | `to log in to your billing` |

**Verification:**
```bash
rg -i "sign in" platform/flowglad-next/src/email-templates/customer-billing-portal-otp.tsx
# Expected: No matches
```

#### Task 1.2: Update `customer-billing-portal-magic-link.tsx`

**File:** `platform/flowglad-next/src/email-templates/customer-billing-portal-magic-link.tsx`

**Changes:**
| Line (approx) | Old | New |
|---------------|-----|-----|
| 27 | `Sign in to your billing portal` | `Log in to your billing portal` |
| 38 | `Sign In to Billing Portal` | `Log In to Billing Portal` |
| 41 | `to sign in to your billing portal` | `to log in to your billing portal` |
| 49 | `Sign In to Billing Portal` | `Log In to Billing Portal` |

**Verification:**
```bash
rg -i "sign in" platform/flowglad-next/src/email-templates/customer-billing-portal-magic-link.tsx
# Expected: No matches
```

#### Task 1.3: Update `email/registry.ts`

**File:** `platform/flowglad-next/src/utils/email/registry.ts`

**Changes:**
| Line (approx) | Old | New |
|---------------|-----|-----|
| 547 | `Sign in to your ${props.organizationName} billing portal` | `Log in to your ${props.organizationName} billing portal` |

**Verification:**
```bash
rg -i "sign in" platform/flowglad-next/src/utils/email/registry.ts
# Expected: No matches
```

#### Task 1.4: Update `email.ts`

**File:** `platform/flowglad-next/src/utils/email.ts`

**Changes:**
| Line (approx) | Old | New |
|---------------|-----|-----|
| 454 | `Sign in to your ${organizationName} billing portal` | `Log in to your ${organizationName} billing portal` |

**Verification:**
```bash
rg -i "sign in" platform/flowglad-next/src/utils/email.ts
# Expected: No matches
```

#### Batch 1 Verification

```bash
rg -i "sign in" platform/flowglad-next/src/email-templates/ platform/flowglad-next/src/utils/email.ts platform/flowglad-next/src/utils/email/
# Expected: No matches
```

---

### Batch 2: Main App UI Pages (3 files)

#### Task 2.1: Update `sign-in/page.tsx`

**File:** `platform/flowglad-next/src/app/sign-in/page.tsx`

**Changes:**
| Line (approx) | Old | New |
|---------------|-----|-----|
| 171 | `Sign in to Flowglad` | `Log in to Flowglad` |
| 249 | `'Sign in'` | `'Log in'` |

**DO NOT CHANGE:**
- Line 190: `Sign in with Google` — Keep as-is (Google branding)
- Any code identifiers (`signIn`, `SignIn`, `signInSchema`)

**Verification:**
```bash
rg "Sign in" platform/flowglad-next/src/app/sign-in/page.tsx
# Expected: Only "Sign in with Google" remains
```

#### Task 2.2: Update `sign-in/reset-password/page.tsx`

**File:** `platform/flowglad-next/src/app/sign-in/reset-password/page.tsx`

**Changes:**
| Line (approx) | Old | New |
|---------------|-----|-----|
| 135 | `Back to Sign In` | `Back to Log In` |
| 232 | `Back to Sign In` | `Back to Log In` |

**Verification:**
```bash
rg -i "sign in" platform/flowglad-next/src/app/sign-in/reset-password/page.tsx
# Expected: No matches
```

#### Task 2.3: Update `sign-up/page.tsx`

**File:** `platform/flowglad-next/src/app/sign-up/page.tsx`

**Changes:**
| Line (approx) | Old | New |
|---------------|-----|-----|
| 239 | `Sign in` (link text) | `Log in` |

**DO NOT CHANGE:**
- Any code identifiers (`signIn`, `signUp`)

**Verification:**
```bash
rg "Sign in" platform/flowglad-next/src/app/sign-up/page.tsx
# Expected: No matches (the link text should now be "Log in")
```

---

### Batch 3: Billing Portal UI Pages (2 files)

#### Task 3.1: Update `billing-portal/[organizationId]/sign-in/page.tsx`

**File:** `platform/flowglad-next/src/app/billing-portal/[organizationId]/sign-in/page.tsx`

**Changes:**
| Line (approx) | Old | New |
|---------------|-----|-----|
| 73 | `Sign In to Billing Portal` | `Log In to Billing Portal` |

**DO NOT CHANGE:**
- Function name `BillingPortalSignIn`

**Verification:**
```bash
rg "Sign In" platform/flowglad-next/src/app/billing-portal/\[organizationId\]/sign-in/page.tsx
# Expected: No matches
```

#### Task 3.2: Update `billing-portal/[organizationId]/[customerId]/sign-in/page.tsx`

**File:** `platform/flowglad-next/src/app/billing-portal/[organizationId]/[customerId]/sign-in/page.tsx`

**Changes:**
| Line (approx) | Old | New |
|---------------|-----|-----|
| 223 | `Sign In to Billing Portal` | `Log In to Billing Portal` |
| 281 | `Sign In to Billing Portal` | `Log In to Billing Portal` |

**DO NOT CHANGE:**
- Function name `CustomerBillingPortalOTPSignIn`

**Verification:**
```bash
rg "Sign In" platform/flowglad-next/src/app/billing-portal/\[organizationId\]/\[customerId\]/sign-in/page.tsx
# Expected: No matches
```

---

### Batch 4: Demo/Preview Components (1 file)

#### Task 4.1: Update `SubscriptionEmailPreviews.tsx`

**File:** `platform/flowglad-next/src/app/demo-route/SubscriptionEmailPreviews.tsx`

**Changes:**
| Line (approx) | Old | New |
|---------------|-----|-----|
| 294-295 | `subject="Sign In to Billing Portal"` | `subject="Log In to Billing Portal"` |
| 325-326 | `subject="Sign In to Billing Portal"` | `subject="Log In to Billing Portal"` |

Also update any `previewText` props containing "Sign in".

**Verification:**
```bash
rg -i "sign in" platform/flowglad-next/src/app/demo-route/SubscriptionEmailPreviews.tsx
# Expected: No matches
```

---

### Batch 5: Error Documentation (1 file)

#### Task 5.1: Update `ERROR_HANDLING.md`

**File:** `platform/flowglad-next/ERROR_HANDLING.md`

**Changes:**
| Line (approx) | Old | New |
|---------------|-----|-----|
| 128 | `sign in to your existing account` | `log in to your existing account` |

**Verification:**
```bash
rg -i "sign in" platform/flowglad-next/ERROR_HANDLING.md
# Expected: No matches
```

---

### Batch 6: Test File Updates (if needed)

#### Task 6.1: Check and update `sign-in/page.test.tsx`

**File:** `platform/flowglad-next/src/app/sign-in/page.test.tsx`

**Action:** Search for test assertions checking for "Sign in" text:
```bash
rg "Sign in" platform/flowglad-next/src/app/sign-in/page.test.tsx
```

**If matches found:** Update test assertions from `'Sign in'` to `'Log in'` where they test user-facing text (not code identifiers).

**DO NOT CHANGE:**
- Test descriptions mentioning `SignIn` component name
- References to `signInSchema`

---

### Final Verification

After all batches complete, run:

```bash
# 1. Check for remaining "Sign in" in platform/flowglad-next (excluding code identifiers)
rg "Sign in" platform/flowglad-next/src --type tsx --type ts | grep -v "signIn" | grep -v "SignIn" | grep -v "with Google"

# 2. Run type check
cd platform/flowglad-next && bun run check

# 3. Run tests
cd platform/flowglad-next && bun run test

# 4. Verify email templates render (manual or screenshot test)
```

**Expected results:**
- Step 1: Only "Sign in with Google" should remain
- Step 2: No type errors
- Step 3: All tests pass

---

### Excluded from Implementation (Reminder)

The following are **explicitly excluded** — do NOT modify:

| Pattern | Reason |
|---------|--------|
| `signIn`, `SignIn` (code identifiers) | Library constraint |
| `signInSchema`, `SigninValues` | Internal types |
| `/sign-in/` (directory paths) | URL stability |
| `Sign in with Google` | Google branding |
| `signingSecret`, `signing secret` | Cryptographic signing, not auth |
| Playground apps | Phase 3 (separate PR) |
| Documentation files | Phase 2 (separate PR) |

---

### Rollback Command

If issues are discovered:
```bash
git revert HEAD
```

All changes are string replacements with no schema or migration dependencies.

---

## Appendix: Full Search Commands Used

```bash
rg -i "sign in" 
rg "Sign In"
rg "signIn"
rg "SignIn"
rg -i "signin"
fd -t d "sign-in"
```

## Appendix: Rollback Plan

If issues are discovered post-deployment:

1. **Immediate:** Revert the PR (all changes are string replacements, no schema/migration)
2. **Communication:** No user communication needed (terminology change is minor)
3. **Re-evaluate:** Document the issue and reassess the approach

The changes are fully reversible with a single PR revert.

---

## Appendix: Agent Execution Checklist

Copy this checklist to track progress during implementation:

```markdown
## Phase 1 Execution Tracker

### Batch 1: Email Templates
- [ ] 1.1 customer-billing-portal-otp.tsx (3 changes)
- [ ] 1.2 customer-billing-portal-magic-link.tsx (4 changes)
- [ ] 1.3 email/registry.ts (1 change)
- [ ] 1.4 email.ts (1 change)
- [ ] Batch 1 verification passed

### Batch 2: Main App UI Pages
- [ ] 2.1 sign-in/page.tsx (2 changes, keep "Sign in with Google")
- [ ] 2.2 sign-in/reset-password/page.tsx (2 changes)
- [ ] 2.3 sign-up/page.tsx (1 change)
- [ ] Batch 2 verification passed

### Batch 3: Billing Portal UI Pages
- [ ] 3.1 billing-portal/[organizationId]/sign-in/page.tsx (1 change)
- [ ] 3.2 billing-portal/[organizationId]/[customerId]/sign-in/page.tsx (2 changes)
- [ ] Batch 3 verification passed

### Batch 4: Demo Components
- [ ] 4.1 SubscriptionEmailPreviews.tsx (2+ changes)
- [ ] Batch 4 verification passed

### Batch 5: Documentation
- [ ] 5.1 ERROR_HANDLING.md (1 change)
- [ ] Batch 5 verification passed

### Batch 6: Tests
- [ ] 6.1 sign-in/page.test.tsx checked/updated
- [ ] Batch 6 verification passed

### Final Verification
- [ ] `bun run check` passes
- [ ] `bun run test` passes
- [ ] Only "Sign in with Google" remains in grep results
```
