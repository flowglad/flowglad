# Email Templates Documentation

## What the heck is going on with this directory?

This directory contains Flowglad's email templating system built with **React Email** - a modern approach to creating HTML emails using React components. It provides a type-safe, component-based system for generating transactional emails with two distinct visual themes: customer-facing emails (clean, minimal) and organization-facing emails (business-focused). All emails are built from reusable, tested components ensuring consistent branding and reliable rendering across email clients.

### Why would you use code in this directory?

- **Email Generation**: Creating HTML emails for any transactional purpose
- **Customer Communications**: Invoices, receipts, payment notifications
- **Organization Notifications**: Team invites, payment alerts, subscription updates
- **Email Customization**: Modifying existing templates or creating new ones
- **Testing Email Rendering**: Previewing and testing email output

## Directory Structure

```
email-templates/
├── components/                      # Reusable email components
│   ├── EmailButton.tsx              # CTA button component
│   └── themed/                      # Theme-aware components
│       ├── EmailLayout.tsx          # Main layout wrapper
│       ├── Header.tsx               # Email header with logo
│       ├── Paragraph.tsx            # Text paragraphs
│       ├── DetailSection.tsx        # Key-value sections
│       ├── LineItem.tsx            # Product/service items
│       ├── TotalSection.tsx        # Pricing totals
│       └── Signature.tsx            # Email signature
├── styles/                          
│   └── coreEmailStyles.ts          # Centralized styles
├── customer-*.tsx                   # Customer email templates
├── forgot-password.tsx              # Auth emails
└── organization/                    # Organization emails
    ├── organization-invitation.tsx  # Team invites
    └── organization-payment-*.tsx   # Payment notifications
```

## How to Use

### 1. Sending an Email

```typescript
import { render } from '@react-email/render'
import { CustomerOrderReceipt } from '@/email-templates/customer-order-receipt'
import { sendEmail } from '@/utils/email'  // Your email service

// Render the email to HTML
const html = await render(
  <CustomerOrderReceipt
    organizationName="Acme Corp"
    organizationLogoUrl="https://..."
    customerName="John Doe"
    customerEmail="john@example.com"
    orderDate={new Date()}
    orderItems={[
      {
        name: 'Pro Plan',
        price: '$99.00',
        quantity: 1
      }
    ]}
    subtotal="$99.00"
    total="$99.00"
    currency="USD"
    orderDetailsUrl="https://..."
  />
)

// Send via your email service
await sendEmail({
  to: 'john@example.com',
  subject: 'Your order receipt',
  html
})
```

### 2. Using in Trigger Tasks

```typescript
// In trigger/notifications/send-customer-invoice.ts
import { render } from '@react-email/render'
import { InvoiceNotification } from '@/email-templates/invoice-notification'

export const sendCustomerInvoiceTask = task({
  id: 'send-customer-invoice',
  run: async ({ invoiceId }, { ctx }) => {
    // Fetch invoice data
    const invoice = await getInvoice(invoiceId)
    
    // Render email
    const html = await render(
      <InvoiceNotification
        {...invoice}
        variant="customer"
      />
    )
    
    // Send email
    await emailService.send({
      to: invoice.customerEmail,
      subject: `Invoice #${invoice.number}`,
      html,
      replyTo: invoice.organizationReplyEmail
    })
  }
})
```

### 3. Preview During Development

```typescript
// Create a preview file: email-templates/previews/receipt.tsx
import { CustomerOrderReceipt } from '../customer-order-receipt'

export default function ReceiptPreview() {
  return (
    <CustomerOrderReceipt
      organizationName="Test Company"
      customerName="Test Customer"
      orderItems={[
        { name: 'Test Product', price: '$10.00', quantity: 2 }
      ]}
      subtotal="$20.00"
      total="$20.00"
      // ... other props with test data
    />
  )
}

// Run email dev server
// pnpm email:dev
// Visit http://localhost:3001
```

## How to Modify

### 1. Creating a New Email Template

```typescript
// email-templates/customer-welcome.tsx
import React from 'react'
import { EmailLayout } from './components/themed/EmailLayout'
import { Header } from './components/themed/Header'
import { Paragraph } from './components/themed/Paragraph'
import { EmailButton } from './components/EmailButton'
import { Signature } from './components/themed/Signature'

interface CustomerWelcomeProps {
  organizationName: string
  organizationLogoUrl?: string
  customerName: string
  dashboardUrl: string
  supportEmail: string
}

export const CustomerWelcome: React.FC<CustomerWelcomeProps> = ({
  organizationName,
  organizationLogoUrl,
  customerName,
  dashboardUrl,
  supportEmail
}) => {
  const variant = 'customer'  // or 'organization'
  
  return (
    <EmailLayout 
      previewText={`Welcome to ${organizationName}!`}
      variant={variant}
    >
      <Header
        title={`Welcome to ${organizationName}!`}
        organizationLogoUrl={organizationLogoUrl}
        variant={variant}
      />
      
      <Paragraph variant={variant}>
        Hi {customerName},
      </Paragraph>
      
      <Paragraph variant={variant}>
        We're excited to have you on board! Your account has been 
        successfully created and you're ready to get started.
      </Paragraph>
      
      <EmailButton href={dashboardUrl}>
        Go to Dashboard
      </EmailButton>
      
      <Paragraph variant={variant} style={{ marginTop: '30px' }}>
        If you have any questions, feel free to reach out to us at{' '}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
      </Paragraph>
      
      <Signature
        greeting="Welcome aboard,"
        name={organizationName}
      />
    </EmailLayout>
  )
}
```

### 2. Adding a New Themed Component

```typescript
// components/themed/Alert.tsx
import React from 'react'
import { Text } from '@react-email/components'
import { coreEmailStyles } from '../../styles/coreEmailStyles'

interface AlertProps {
  variant: 'customer' | 'organization'
  type: 'info' | 'warning' | 'error' | 'success'
  children: React.ReactNode
  style?: React.CSSProperties
}

export const Alert: React.FC<AlertProps> = ({ 
  variant, 
  type, 
  children, 
  style 
}) => {
  const variantStyles = coreEmailStyles.variants[variant]
  
  const typeColors = {
    info: '#3b82f6',
    warning: '#f59e0b',
    error: '#ef4444',
    success: '#10b981'
  }
  
  return (
    <Text
      style={{
        ...variantStyles.text,
        backgroundColor: typeColors[type] + '10',  // 10% opacity
        borderLeft: `4px solid ${typeColors[type]}`,
        padding: '12px 16px',
        marginBottom: '20px',
        borderRadius: '4px',
        ...style
      }}
      data-testid="alert"
    >
      {children}
    </Text>
  )
}
```

### 3. Modifying Email Styles

```typescript
// styles/coreEmailStyles.ts
export const coreEmailStyles = {
  // Add new base styles
  button: {
    primary: {
      backgroundColor: '#5046e4',
      color: '#ffffff',
      padding: '12px 24px',
      borderRadius: '6px',
      textDecoration: 'none',
      display: 'inline-block',
      fontWeight: '600'
    },
    secondary: {
      backgroundColor: '#f3f4f6',
      color: '#374151',
      // ... other styles
    }
  },
  
  // Modify variant styles
  variants: {
    customer: {
      container: {
        backgroundColor: '#ffffff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI"'
      },
      // ... other customer styles
    },
    organization: {
      container: {
        backgroundColor: '#f6f9fc',
        borderTop: '4px solid #5046e4',  // Add accent
        // ... other styles
      }
    }
  }
}
```

### 4. Adding Complex Email Sections

```typescript
// For an invoice with multiple sections
export const DetailedInvoice: React.FC<InvoiceProps> = (props) => {
  return (
    <EmailLayout previewText="Invoice" variant="customer">
      {/* Header Section */}
      <Header title={`Invoice #${props.invoiceNumber}`} />
      
      {/* Customer Details */}
      <DetailSection>
        <DetailItem>Bill To:</DetailItem>
        <DetailValue>{props.customerName}</DetailValue>
        <DetailItem>Email:</DetailItem>
        <DetailValue>{props.customerEmail}</DetailValue>
        <DetailItem>Date:</DetailItem>
        <DetailValue>{formatDate(props.invoiceDate)}</DetailValue>
      </DetailSection>
      
      {/* Line Items Table */}
      <table style={{ width: '100%', marginTop: '30px' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Item</th>
            <th style={{ textAlign: 'right' }}>Qty</th>
            <th style={{ textAlign: 'right' }}>Price</th>
            <th style={{ textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {props.lineItems.map((item, index) => (
            <LineItem
              key={index}
              name={item.name}
              quantity={item.quantity}
              price={item.price}
              total={item.total}
            />
          ))}
        </tbody>
      </table>
      
      {/* Totals */}
      <TotalSection
        subtotal={props.subtotal}
        tax={props.tax}
        total={props.total}
        currency={props.currency}
      />
      
      {/* Payment Button */}
      <EmailButton href={props.paymentUrl}>
        Pay Invoice
      </EmailButton>
      
      {/* Footer */}
      <Signature 
        greeting="Thank you for your business,"
        name={props.organizationName}
      />
    </EmailLayout>
  )
}
```

### 5. Adding Email Variants

```typescript
// Support different email versions (e.g., for A/B testing)
interface EmailProps {
  version?: 'default' | 'simplified' | 'detailed'
  // ... other props
}

export const PaymentNotification: React.FC<EmailProps> = ({ 
  version = 'default',
  ...props 
}) => {
  // Render different layouts based on version
  switch (version) {
    case 'simplified':
      return <SimplifiedPaymentEmail {...props} />
    case 'detailed':
      return <DetailedPaymentEmail {...props} />
    default:
      return <StandardPaymentEmail {...props} />
  }
}
```

## Testing Email Templates

```typescript
// email-templates/__tests__/customer-order-receipt.test.tsx
import { render } from '@testing-library/react'
import { CustomerOrderReceipt } from '../customer-order-receipt'

describe('CustomerOrderReceipt', () => {
  const defaultProps = {
    organizationName: 'Test Org',
    customerName: 'John Doe',
    orderItems: [
      { name: 'Product', price: '$10', quantity: 1 }
    ],
    subtotal: '$10',
    total: '$10'
  }
  
  it('renders customer name', () => {
    const { getByTestId } = render(
      <CustomerOrderReceipt {...defaultProps} />
    )
    expect(getByTestId('customer-name')).toHaveTextContent('John Doe')
  })
  
  it('displays all order items', () => {
    const { getAllByTestId } = render(
      <CustomerOrderReceipt {...defaultProps} />
    )
    const items = getAllByTestId('line-item')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('Product')
  })
  
  it('shows correct total', () => {
    const { getByTestId } = render(
      <CustomerOrderReceipt {...defaultProps} />
    )
    expect(getByTestId('total-amount')).toHaveTextContent('$10')
  })
})
```

## Key Conventions to Follow

### 1. **Component Structure**
- Use themed components for consistency
- Always specify the `variant` prop
- Include `data-testid` attributes for testing

### 2. **Styling Guidelines**
- Use inline styles (required for email clients)
- Reference `coreEmailStyles` for consistency
- Keep styles email-safe (no modern CSS features)

### 3. **Content Guidelines**
- Always include preview text
- Use semantic HTML where possible
- Include alt text for images

### 4. **Props Interface**
Define clear TypeScript interfaces:
```typescript
interface EmailProps {
  // Required organization info
  organizationName: string
  organizationLogoUrl?: string
  
  // Required customer info
  customerName: string
  customerEmail: string
  
  // Required action URLs
  actionUrl: string
  
  // Optional customization
  variant?: 'customer' | 'organization'
  includeFooter?: boolean
}
```

### 5. **URL Handling**
Always use absolute URLs:
```typescript
const dashboardUrl = `${process.env.EMAIL_BASE_URL}/dashboard`
```

### 6. **Testing Requirements**
- Test all dynamic content rendering
- Verify conditional sections
- Check URL generation
- Validate data formatting

## Email Client Compatibility

### Supported Features
- ✅ Inline styles
- ✅ Table layouts
- ✅ Basic HTML tags (p, div, span, a)
- ✅ Background colors
- ✅ Border radius (most clients)
- ✅ Web fonts (limited support)

### Avoid These
- ❌ JavaScript
- ❌ External stylesheets
- ❌ CSS Grid/Flexbox
- ❌ SVG (use PNG/JPG)
- ❌ Video/Audio
- ❌ Forms

## Common Patterns

### Conditional Content
```typescript
export const ConditionalEmail: React.FC<Props> = ({ 
  showPromotion,
  promotionDetails,
  ...props 
}) => {
  return (
    <EmailLayout>
      {/* Always shown content */}
      <Header title="Your Order" />
      
      {/* Conditional section */}
      {showPromotion && (
        <Alert type="info" variant="customer">
          Special offer: {promotionDetails}
        </Alert>
      )}
      
      {/* Rest of email */}
    </EmailLayout>
  )
}
```

### Localization Support
```typescript
interface LocalizedEmailProps {
  locale: 'en' | 'es' | 'fr'
  // ... other props
}

export const LocalizedEmail: React.FC<LocalizedEmailProps> = ({ 
  locale,
  ...props 
}) => {
  const t = getTranslations(locale)
  
  return (
    <EmailLayout previewText={t('email.preview')}>
      <Header title={t('email.title')} />
      <Paragraph>{t('email.greeting', { name: props.customerName })}</Paragraph>
      {/* ... */}
    </EmailLayout>
  )
}
```

### Dynamic Tables
```typescript
// For variable-length content
export const DynamicTable: React.FC<{ items: Item[] }> = ({ items }) => {
  if (items.length === 0) {
    return <Paragraph>No items to display</Paragraph>
  }
  
  return (
    <table style={{ width: '100%' }}>
      <tbody>
        {items.map((item, index) => (
          <tr key={index}>
            <td>{item.name}</td>
            <td style={{ textAlign: 'right' }}>{item.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

## Common Pitfalls to Avoid

1. **Don't use external CSS** - Everything must be inline
2. **Don't forget preview text** - Critical for inbox preview
3. **Don't use modern CSS** - Stick to email-safe properties
4. **Don't skip testing** - Test across email clients
5. **Don't hardcode URLs** - Use environment variables
6. **Don't forget alt text** - Important for accessibility
7. **Don't use complex layouts** - Tables are most reliable
8. **Don't ignore mobile** - Use responsive table layouts

## Need Help?

- Review existing templates for patterns
- Check React Email documentation
- Test with email preview tool: `pnpm email:dev`
- Use Litmus or Email on Acid for cross-client testing
- Reference `coreEmailStyles.ts` for approved styles