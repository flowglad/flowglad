# Creating New Emails - AI Agent Guide

> **Purpose**: This document provides AI agents with everything needed to create new email templates in the Flowglad codebase. Follow these steps exactly to ensure the email is properly registered, type-safe, and appears in the email-preview page.

---

## Quick Reference: Required Files to Modify

When creating a new email, you **must** modify these files in order:

| Step | File | What to Add |
|------|------|-------------|
| 1 | `src/email-templates/{template-name}.tsx` | The React Email component |
| 2 | `src/utils/email/registry.ts` | Props interface + EmailTypeMap entry + EMAIL_REGISTRY entry |
| 3 | `src/email-templates/previews/mockData.ts` | Preview mock data in EMAIL_PREVIEWS |
| 4 | (Optional) `src/utils/email/validation.ts` | Zod validation schema |

---

## Step 1: Create the Email Template Component

### File Location
- Customer emails: `src/email-templates/customer-{action}.tsx`
- Organization emails: `src/email-templates/organization/organization-{action}.tsx`

### Naming Convention
- Use kebab-case for file names
- Match the email type key (e.g., `customer.trial.ending-soon` → `customer-trial-ending-soon.tsx`)

### Template Structure

```typescript
// src/email-templates/customer-{action}.tsx
import { Link } from '@react-email/components'
import * as React from 'react'
import { type CurrencyCode, IntervalUnit } from '@/types'
import core, { formatDate } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import {
  DetailRow,
  DetailTable,
  EmailLayout,
  Footer,
  Header,
  Paragraph,
  Signature,
} from './components/themed'

// Define props interface inline (also add to registry.ts)
export interface YourEmailProps {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  // ... other props
}

export const YourEmail = ({
  customerName,
  organizationName,
  organizationLogoUrl,
  organizationId,
  // ... other props
}: YourEmailProps) => {
  const previewText = `Your preview text here`
  
  // Build billing portal URL for customer emails
  const billingPortalUrl = core.organizationBillingPortalURL({
    organizationId,
  })

  return (
    <EmailLayout previewText={previewText}>
      <Header
        title="Your Email Title"
        organizationLogoUrl={organizationLogoUrl}
      />
      
      <Paragraph>
        Hi {customerName},
      </Paragraph>
      
      <Paragraph>
        Your email body content here.
      </Paragraph>
      
      {/* Use DetailTable for key-value data */}
      <DetailTable>
        <DetailRow label="Plan" value="Pro Plan" />
        <DetailRow label="Price" value="$29.00/month" />
      </DetailTable>
      
      <Signature
        greeting="Thanks,"
        name={organizationName}
      />
      
      <Footer
        organizationName={organizationName}
        variant="customer"
        billingPortalUrl={billingPortalUrl}
      />
    </EmailLayout>
  )
}

export default YourEmail
```

### Key Requirements

1. **Use `EmailLayout`** - This handles `<Html>`, `<Head>`, `<Preview>`, `<Body>`, and `<Container>` for you
2. **Import themed components** - Use components from `./components/themed`
3. **Include Footer** - All emails must have a Footer component with appropriate variant
4. **Export default** - Export both named and default for flexibility
5. **Inline props** - Define props interface in the file AND in registry.ts

### Available Themed Components

Import from `./components/themed`:

| Component | Purpose |
|-----------|---------|
| `EmailLayout` | Wrapper handling Html, Head, Preview, Body, Container with consistent styling |
| `Header` | Email title and optional organization logo |
| `Paragraph` | Body text with consistent typography |
| `DetailTable` | Container for key-value detail rows (Apple-style two-column layout) |
| `DetailRow` | Single key-value row inside DetailTable |
| `DetailSection` | Alternative container with title for key-value data |
| `DetailItem` | Single key-value row inside DetailSection |
| `DetailValue` | Standalone value display |
| `LineItem` | Line item row for invoices/receipts |
| `TotalSection` | Subtotal/tax/total display for invoices |
| `Signature` | Sign-off with greeting and name (e.g., "Thanks, Acme Corp") |
| `Footer` | Attribution text and links ("Powered by Flowglad") |
| `Alert` | Info/warning/error banner messages |
| `Divider` | Horizontal rule separator |

Import from `./components`:

| Component | Purpose |
|-----------|---------|
| `EmailButton` | CTA button with consistent styling |
| `TestBanner` | [TEST MODE] banner for non-production emails |

---

## Step 2: Register the Email in registry.ts

### File: `src/utils/email/registry.ts`

You need to add **three things** to this file:

### 2a. Add Props Interface

Add your props interface in the appropriate section (around line 50-340):

```typescript
// Find the section for your email category and add:
export interface YourNewEmailProps {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerId: string
  // Add all required and optional props
  planName: string
  price: number
  currency: CurrencyCode
  livemode: boolean
}
```

### 2b. Add to EmailTypeMap Interface

Find the `EmailTypeMap` interface (around line 348) and add your entry:

```typescript
export interface EmailTypeMap {
  // ... existing entries ...
  
  // Add your new email type
  'customer.category.action': YourNewEmailProps
}
```

### 2c. Add to EMAIL_REGISTRY Object

Find the `EMAIL_REGISTRY` object (around line 417) and add your entry:

```typescript
export const EMAIL_REGISTRY: { /* ... */ } = {
  // ... existing entries ...
  
  'customer.category.action': {
    getTemplate: async () => {
      const mod = await import('@/email-templates/your-template-file')
      return mod.YourEmail
    },
    defaultSubject: 'Your Subject Line',
    // OR for dynamic subjects:
    // defaultSubject: (props) => `${props.organizationName}: Your Subject`,
    recipientType: 'customer', // or 'organization' or 'internal'
    category: 'subscription', // or 'payment', 'auth', 'notification', 'export', 'trial'
    description: 'Sent when [describe trigger condition]',
    requiresAwait: true, // Always true for React Email templates
  },
}
```

### Important: Update Test Count

After adding a new email, update the email count in test files:
- `src/utils/email/registry.test.ts` - Update `expect(count).toBe(X)` 
- `src/email-templates/previews/mockData.test.ts` - Update `expect(types.length).toBe(X)`

### Email Type Naming Convention

Follow this pattern: `{recipient}.{category}.{action}`

| Recipient | Categories |
|-----------|------------|
| `customer` | `subscription`, `payment`, `auth`, `trial` |
| `organization` | `subscription`, `payment`, `notification` |

Examples:
- `customer.subscription.created`
- `customer.payment.failed`
- `customer.trial.ending-soon`
- `organization.payment.succeeded`
- `organization.notification.csv-export-ready`

---

## Step 3: Add Preview Mock Data

### File: `src/email-templates/previews/mockData.ts`

Find the `EMAIL_PREVIEWS` object and add mock data for your email:

```typescript
export const EMAIL_PREVIEWS: EmailPreviewData = {
  // ... existing entries ...
  
  'customer.category.action': {
    // 'default' variant is required
    default: {
      customerName: mockCustomer.name,
      organizationName: mockOrganization.name,
      organizationLogoUrl: mockOrganization.logoUrl,
      organizationId: mockOrganization.id,
      customerId: mockCustomer.id,
      planName: 'Pro Plan',
      price: MOCK_PRICES.PRO_PLAN,
      currency: CurrencyCode.USD,
      livemode: true,
    },
    // Add additional variants for different scenarios
    withDiscount: {
      // ... same props with different values
      discountInfo: {
        discountName: '20% Off',
        discountCode: 'SAVE20',
        discountAmount: 580,
        discountAmountType: 'percent',
      },
    },
  },
}
```

### Available Mock Constants

```typescript
// Use these from mockData.ts
const mockOrganization = {
  name: 'Acme Corp',
  id: 'org_mock123',
  logoUrl: undefined,
}

const mockCustomer = {
  name: 'John Doe',
  email: 'john@example.com',
  id: 'cus_mock123',
  externalId: 'ext_cus_123',
}

const MOCK_PRICES = {
  FREE: 0,
  BASIC_PLAN: 1900,      // $19.00
  PRO_PLAN: 2900,        // $29.00
  PRORATION_AMOUNT: 1000, // $10.00
  ORDER_ITEM_1: 4900,    // $49.00
  ORDER_ITEM_2: 5000,    // $50.00
  TAX_AMOUNT: 232,       // $2.32
}

// For dates, use the helper functions:
const PREVIEW_REFERENCE_DATE = new Date('2026-01-15T12:00:00Z')
const getFutureDate = (daysFromNow: number): Date => // ...
```

---

## Step 4: (Optional) Add Validation Schema

### File: `src/utils/email/validation.ts`

If you want runtime validation of email props:

```typescript
import { z } from 'zod'

// Add your schema
export const YourNewEmailSchema = z.object({
  customerName: z.string().min(1),
  organizationName: z.string().min(1),
  organizationLogoUrl: z.string().url().optional(),
  organizationId: z.string().min(1),
  customerId: z.string().min(1),
  planName: z.string().min(1),
  price: z.number().int().nonnegative(),
  currency: z.nativeEnum(CurrencyCode),
  livemode: z.boolean(),
})

// Add to EMAIL_VALIDATION_SCHEMAS object
export const EMAIL_VALIDATION_SCHEMAS = {
  // ... existing schemas ...
  'customer.category.action': YourNewEmailSchema,
}
```

---

## Step 5: Create a Test File

### File: `src/email-templates/your-template.test.tsx`

```typescript
import { render } from '@testing-library/react'
import { describe, expect, it } from 'bun:test'
import { CurrencyCode } from '@/types'
import { YourEmail } from './your-template'

describe('YourEmail', () => {
  const baseProps = {
    customerName: 'John Doe',
    organizationName: 'Acme Corp',
    organizationLogoUrl: 'https://example.com/logo.png',
    organizationId: 'org_123',
    customerId: 'cus_123',
    planName: 'Pro Plan',
    price: 2900,
    currency: CurrencyCode.USD,
    livemode: true,
  }

  it('renders the customer greeting', () => {
    const { getByText } = render(<YourEmail {...baseProps} />)
    expect(getByText('Hi John Doe,')).toBeInTheDocument()
  })

  it('renders the plan name in detail row', () => {
    const { getByText } = render(<YourEmail {...baseProps} />)
    expect(getByText('Pro Plan')).toBeInTheDocument()
  })

  it('renders organization name in signature', () => {
    const { getByText } = render(<YourEmail {...baseProps} />)
    expect(getByText('Acme Corp')).toBeInTheDocument()
  })

  it('handles missing optional props gracefully', () => {
    const propsWithoutLogo = {
      ...baseProps,
      organizationLogoUrl: undefined,
    }
    const { queryByAltText } = render(
      <YourEmail {...propsWithoutLogo} />
    )
    expect(queryByAltText('Logo')).not.toBeInTheDocument()
  })

  // Add data-testid to components for reliable testing
  it('displays key details in table rows', () => {
    const { getByTestId } = render(<YourEmail {...baseProps} />)
    expect(getByTestId('plan-name')).toHaveTextContent('Pro Plan')
  })
})
```

### Testing Best Practices

1. **Use `@testing-library/react`** - Not `@react-email/render`
2. **Run via `test:frontend`** - React component tests run with happy-dom
3. **Use `getByText` / `getByTestId`** - For reliable element selection
4. **Add `data-testid` props** - To components like `DetailRow` for testing
5. **Test optional props** - Verify graceful handling of missing data

---

## Verification Checklist

After completing all steps, verify:

1. **TypeScript compiles**: Run `bun run check`
2. **Tests pass**: Run `bun run test src/email-templates/your-template.test.tsx`
3. **Preview appears**: Navigate to `/email-preview` and confirm your email is listed
4. **Preview renders**: Click on your email variant and verify it renders correctly

---

## Complete Example: Adding a Trial Ending Email

### 1. Create Template

```typescript
// src/email-templates/customer-trial-ending-soon.tsx
import { Link } from '@react-email/components'
import * as React from 'react'
import { type CurrencyCode } from '@/types'
import core, { formatDate } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import {
  DetailRow,
  DetailTable,
  EmailLayout,
  Footer,
  Header,
  Paragraph,
  Signature,
} from './components/themed'

export interface CustomerTrialEndingSoonProps {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerId: string
  planName: string
  price: number
  currency: CurrencyCode
  trialEndDate: Date
  livemode: boolean
}

export const CustomerTrialEndingSoonEmail = ({
  customerName,
  organizationName,
  organizationLogoUrl,
  organizationId,
  planName,
  price,
  currency,
  trialEndDate,
}: CustomerTrialEndingSoonProps) => {
  const formattedPrice = stripeCurrencyAmountToHumanReadableCurrencyAmount(
    currency,
    price
  )
  
  const billingPortalUrl = core.organizationBillingPortalURL({
    organizationId,
  })

  const previewText = `Your trial ends on ${formatDate(trialEndDate)}`

  return (
    <EmailLayout previewText={previewText}>
      <Header
        title="Trial Ending Soon"
        organizationLogoUrl={organizationLogoUrl}
      />

      <Paragraph>Hi {customerName},</Paragraph>

      <Paragraph>
        Your free trial of {planName} is ending soon. To continue using
        all features, please ensure your payment method is up to date.
      </Paragraph>

      <DetailTable>
        <DetailRow label="Plan" value={planName} />
        <DetailRow label="Price after trial" value={formattedPrice} />
        <DetailRow label="Trial ends" value={formatDate(trialEndDate)} />
      </DetailTable>

      <Paragraph>
        To manage your subscription,{' '}
        <Link
          href={billingPortalUrl}
          style={{ color: '#2563eb', textDecoration: 'underline' }}
        >
          visit your billing portal
        </Link>
        .
      </Paragraph>

      <Signature greeting="Thanks," name={organizationName} />

      <Footer
        organizationName={organizationName}
        variant="customer"
        billingPortalUrl={billingPortalUrl}
      />
    </EmailLayout>
  )
}

export default CustomerTrialEndingSoonEmail
```

### 2. Add to Registry

```typescript
// In src/utils/email/registry.ts

// Add props interface (in the Customer Trial Emails section)
export interface CustomerTrialEndingSoonProps {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerId: string
  planName: string
  price: number
  currency: CurrencyCode
  trialEndDate: Date
  billingPortalUrl?: string
  livemode: boolean
}

// Add to EmailTypeMap
export interface EmailTypeMap {
  // ... existing ...
  'customer.trial.ending-soon': CustomerTrialEndingSoonProps
}

// Add to EMAIL_REGISTRY
'customer.trial.ending-soon': {
  getTemplate: async () => {
    const mod = await import('@/email-templates/customer-trial-ending-soon')
    return mod.CustomerTrialEndingSoonEmail
  },
  defaultSubject: (props) => `Your ${props.planName} trial ends soon`,
  recipientType: 'customer',
  category: 'trial',
  description: 'Sent a few days before a customer trial expires',
  requiresAwait: true,
},
```

### 3. Add Mock Data

```typescript
// In src/email-templates/previews/mockData.ts

'customer.trial.ending-soon': {
  default: {
    customerName: mockCustomer.name,
    organizationName: mockOrganization.name,
    organizationLogoUrl: mockOrganization.logoUrl,
    organizationId: mockOrganization.id,
    customerId: mockCustomer.id,
    planName: 'Pro Plan',
    price: MOCK_PRICES.PRO_PLAN,
    currency: CurrencyCode.USD,
    trialEndDate: getFutureDate(3), // 3 days from now
    billingPortalUrl: 'https://billing.example.com/portal',
    livemode: true,
  },
  noBillingPortal: {
    customerName: mockCustomer.name,
    organizationName: mockOrganization.name,
    organizationId: mockOrganization.id,
    customerId: mockCustomer.id,
    planName: 'Pro Plan',
    price: MOCK_PRICES.PRO_PLAN,
    currency: CurrencyCode.USD,
    trialEndDate: getFutureDate(3),
    livemode: true,
  },
},
```

---

## Common Patterns Reference

### Dynamic Subject Lines

```typescript
// String subject
defaultSubject: 'Your subscription has been confirmed'

// Function subject with props
defaultSubject: (props) => `${props.organizationName}: Payment received`

// Function with conditional logic
defaultSubject: (props) =>
  props.isMoR
    ? `Order Receipt from Flowglad Inc. for ${props.organizationName}`
    : `${props.organizationName} Order Receipt`
```

### Footer Variants

```typescript
// Customer email (org branding + "Powered by Flowglad")
<Footer
  organizationName={organizationName}
  variant="customer"
  billingPortalUrl={billingPortalUrl}
/>

// Organization email (Flowglad branding)
<Footer
  organizationName={organizationName}
  variant="organization"
/>
```

### Formatting Helpers

```typescript
import core, { formatDate } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

// Money: 2900 → "$29.00"
stripeCurrencyAmountToHumanReadableCurrencyAmount(CurrencyCode.USD, 2900)

// Date: Date object → "January 15, 2026"
formatDate(new Date())

// Billing portal URL
core.organizationBillingPortalURL({ organizationId })
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| TypeScript error in registry.ts | Ensure props interface, EmailTypeMap entry, and EMAIL_REGISTRY entry all match |
| Email not appearing in preview | Check that EMAIL_PREVIEWS has an entry with at least a `default` variant |
| Preview shows "not found" | Verify the email type key is identical in all 3 locations |
| Test fails with "not a function" | Ensure your template is exported with both named and default exports |
| Footer not rendering | Import Footer from themed components and include variant prop |
| Test count assertion fails | Update the count in `registry.test.ts` and `mockData.test.ts` |

---

## Files Quick Reference

| Purpose | Path |
|---------|------|
| Registry & types | `src/utils/email/registry.ts` |
| Preview mock data | `src/email-templates/previews/mockData.ts` |
| Validation schemas | `src/utils/email/validation.ts` |
| Themed components | `src/email-templates/components/themed/` |
| Core email utilities | `src/utils/email/` |
| Email preview page | `src/app/email-preview/` |
| Customer templates | `src/email-templates/customer-*.tsx` |
| Organization templates | `src/email-templates/organization/*.tsx` |
