import { describe, expect, it } from 'vitest'
import { CurrencyCode, IntervalUnit } from '@/types'
import {
  CustomerBillingPortalMagicLinkSchema,
  CustomerBillingPortalOTPSchema,
  CustomerOrderReceiptSchema,
  CustomerPaymentFailedSchema,
  CustomerSubscriptionAdjustedSchema,
  CustomerSubscriptionCanceledSchema,
  CustomerSubscriptionCancellationScheduledSchema,
  CustomerSubscriptionCreatedSchema,
  CustomerSubscriptionUpgradedSchema,
  CustomersCsvExportReadySchema,
  CustomerTrialExpiredNoPaymentSchema,
  EMAIL_VALIDATION_SCHEMAS,
  ForgotPasswordSchema,
  OrganizationInvitationSchema,
  OrganizationOnboardingCompletedSchema,
  OrganizationPaymentAwaitingConfirmationSchema,
  OrganizationPaymentFailedSchema,
  OrganizationPaymentSucceededSchema,
  OrganizationPayoutsEnabledSchema,
  OrganizationSubscriptionAdjustedSchema,
  OrganizationSubscriptionCanceledSchema,
  OrganizationSubscriptionCancellationScheduledSchema,
  OrganizationSubscriptionCreatedSchema,
  validateEmailProps,
  validateEmailPropsForType,
} from './validation'

describe('EMAIL_VALIDATION_SCHEMAS', () => {
  it('has schemas for all email types', () => {
    const schemaCount = Object.keys(EMAIL_VALIDATION_SCHEMAS).length
    expect(schemaCount).toBe(23)
  })
})

describe('validateEmailProps', () => {
  describe('CustomerSubscriptionCreatedSchema', () => {
    const validProps = {
      customerName: 'John Doe',
      organizationName: 'Acme Inc',
      organizationId: 'org_123',
      customerExternalId: 'cus_ext_123',
      planName: 'Pro Plan',
      price: 1999,
      currency: CurrencyCode.USD,
    }

    it('validates and returns props correctly when all required fields are provided', () => {
      expect(() =>
        validateEmailProps(
          CustomerSubscriptionCreatedSchema,
          validProps,
          'customer.subscription.created'
        )
      ).not.toThrow()

      const result = validateEmailProps(
        CustomerSubscriptionCreatedSchema,
        validProps,
        'customer.subscription.created'
      )
      expect(result.customerName).toBe('John Doe')
      expect(result.organizationName).toBe('Acme Inc')
      expect(result.planName).toBe('Pro Plan')
      expect(result.price).toBe(1999)
      expect(result.currency).toBe(CurrencyCode.USD)
    })

    it('throws descriptive error for missing required fields', () => {
      const invalidProps = {
        ...validProps,
        customerName: undefined,
      }

      expect(() =>
        validateEmailProps(
          CustomerSubscriptionCreatedSchema,
          invalidProps,
          'customer.subscription.created'
        )
      ).toThrow(/customer.subscription.created/)
    })

    it('validates optional fields correctly', () => {
      const propsWithOptionals = {
        ...validProps,
        organizationLogoUrl: 'https://example.com/logo.png',
        interval: IntervalUnit.Month,
        nextBillingDate: new Date('2025-02-01'),
        paymentMethodLast4: '4242',
        trial: {
          trialEndDate: new Date('2025-02-15'),
          trialDurationDays: 14,
        },
      }

      expect(() =>
        validateEmailProps(
          CustomerSubscriptionCreatedSchema,
          propsWithOptionals,
          'customer.subscription.created'
        )
      ).not.toThrow()
    })

    it('throws error for invalid currency code', () => {
      const invalidProps = {
        ...validProps,
        currency: 'INVALID',
      }

      expect(() =>
        validateEmailProps(
          CustomerSubscriptionCreatedSchema,
          invalidProps,
          'customer.subscription.created'
        )
      ).toThrow(/currency/)
    })

    it('throws error for negative price', () => {
      const invalidProps = {
        ...validProps,
        price: -100,
      }

      expect(() =>
        validateEmailProps(
          CustomerSubscriptionCreatedSchema,
          invalidProps,
          'customer.subscription.created'
        )
      ).toThrow(/price/i)
    })
  })

  describe('CustomerSubscriptionCanceledSchema', () => {
    const validProps = {
      customerName: 'Jane Doe',
      organizationName: 'Acme Inc',
      organizationId: 'org_123',
      customerId: 'cus_123',
      subscriptionName: 'Pro Plan',
      cancellationDate: new Date('2025-01-15'),
      livemode: true,
    }

    it('validates valid props without error', () => {
      expect(() =>
        validateEmailProps(
          CustomerSubscriptionCanceledSchema,
          validProps,
          'customer.subscription.canceled'
        )
      ).not.toThrow()
    })

    it('throws error for missing cancellationDate', () => {
      const invalidProps = {
        ...validProps,
        cancellationDate: undefined,
      }

      expect(() =>
        validateEmailProps(
          CustomerSubscriptionCanceledSchema,
          invalidProps,
          'customer.subscription.canceled'
        )
      ).toThrow(/cancellationDate/)
    })
  })

  describe('CustomerBillingPortalMagicLinkSchema', () => {
    const validProps = {
      email: 'customer@example.com',
      url: 'https://billing.example.com/auth/123',
      organizationName: 'Acme Inc',
      livemode: true,
    }

    it('validates valid props without error', () => {
      expect(() =>
        validateEmailProps(
          CustomerBillingPortalMagicLinkSchema,
          validProps,
          'customer.auth.billing-portal-magic-link'
        )
      ).not.toThrow()
    })

    it('throws error for invalid email', () => {
      const invalidProps = {
        ...validProps,
        email: 'not-an-email',
      }

      expect(() =>
        validateEmailProps(
          CustomerBillingPortalMagicLinkSchema,
          invalidProps,
          'customer.auth.billing-portal-magic-link'
        )
      ).toThrow(/email/i)
    })

    it('throws error for invalid URL', () => {
      const invalidProps = {
        ...validProps,
        url: 'not-a-url',
      }

      expect(() =>
        validateEmailProps(
          CustomerBillingPortalMagicLinkSchema,
          invalidProps,
          'customer.auth.billing-portal-magic-link'
        )
      ).toThrow(/url/i)
    })

    it('allows optional customerName', () => {
      const propsWithName = {
        ...validProps,
        customerName: 'John Doe',
      }

      expect(() =>
        validateEmailProps(
          CustomerBillingPortalMagicLinkSchema,
          propsWithName,
          'customer.auth.billing-portal-magic-link'
        )
      ).not.toThrow()
    })
  })

  describe('OrganizationSubscriptionCreatedSchema', () => {
    const validProps = {
      organizationName: 'Acme Inc',
      subscriptionName: 'Pro Plan',
      customerId: 'cus_123',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      livemode: true,
    }

    it('validates valid props without error', () => {
      expect(() =>
        validateEmailProps(
          OrganizationSubscriptionCreatedSchema,
          validProps,
          'organization.subscription.created'
        )
      ).not.toThrow()
    })

    it('throws error for invalid customer email', () => {
      const invalidProps = {
        ...validProps,
        customerEmail: 'not-an-email',
      }

      expect(() =>
        validateEmailProps(
          OrganizationSubscriptionCreatedSchema,
          invalidProps,
          'organization.subscription.created'
        )
      ).toThrow(/email/i)
    })
  })

  describe('OrganizationPayoutsEnabledSchema', () => {
    it('validates with only organizationName', () => {
      const validProps = {
        organizationName: 'Acme Inc',
      }

      expect(() =>
        validateEmailProps(
          OrganizationPayoutsEnabledSchema,
          validProps,
          'organization.notification.payouts-enabled'
        )
      ).not.toThrow()
    })

    it('throws error for empty organizationName', () => {
      const invalidProps = {
        organizationName: '',
      }

      expect(() =>
        validateEmailProps(
          OrganizationPayoutsEnabledSchema,
          invalidProps,
          'organization.notification.payouts-enabled'
        )
      ).toThrow(/organizationName/)
    })
  })
})

describe('validateEmailPropsForType', () => {
  it('validates props using the correct schema for the email type', () => {
    const validProps = {
      organizationName: 'Acme Inc',
      livemode: true,
    }

    expect(() =>
      validateEmailPropsForType(
        'organization.notification.csv-export-ready',
        validProps
      )
    ).not.toThrow()
  })

  it('throws error for invalid props', () => {
    const invalidProps = {
      organizationName: '',
      livemode: true,
    }

    expect(() =>
      validateEmailPropsForType(
        'organization.notification.csv-export-ready',
        invalidProps
      )
    ).toThrow(/organization.notification.csv-export-ready/)
  })
})

// Test each schema has proper structure
describe('Schema structure validation', () => {
  const schemaTests = [
    {
      name: 'CustomerSubscriptionCancellationScheduledSchema',
      schema: CustomerSubscriptionCancellationScheduledSchema,
    },
    {
      name: 'CustomerSubscriptionAdjustedSchema',
      schema: CustomerSubscriptionAdjustedSchema,
    },
    {
      name: 'CustomerSubscriptionUpgradedSchema',
      schema: CustomerSubscriptionUpgradedSchema,
    },
    {
      name: 'CustomerOrderReceiptSchema',
      schema: CustomerOrderReceiptSchema,
    },
    {
      name: 'CustomerPaymentFailedSchema',
      schema: CustomerPaymentFailedSchema,
    },
    {
      name: 'CustomerTrialExpiredNoPaymentSchema',
      schema: CustomerTrialExpiredNoPaymentSchema,
    },
    {
      name: 'CustomerBillingPortalOTPSchema',
      schema: CustomerBillingPortalOTPSchema,
    },
    { name: 'ForgotPasswordSchema', schema: ForgotPasswordSchema },
    {
      name: 'OrganizationSubscriptionCanceledSchema',
      schema: OrganizationSubscriptionCanceledSchema,
    },
    {
      name: 'OrganizationSubscriptionCancellationScheduledSchema',
      schema: OrganizationSubscriptionCancellationScheduledSchema,
    },
    {
      name: 'OrganizationSubscriptionAdjustedSchema',
      schema: OrganizationSubscriptionAdjustedSchema,
    },
    {
      name: 'OrganizationPaymentSucceededSchema',
      schema: OrganizationPaymentSucceededSchema,
    },
    {
      name: 'OrganizationPaymentFailedSchema',
      schema: OrganizationPaymentFailedSchema,
    },
    {
      name: 'OrganizationPaymentAwaitingConfirmationSchema',
      schema: OrganizationPaymentAwaitingConfirmationSchema,
    },
    {
      name: 'OrganizationOnboardingCompletedSchema',
      schema: OrganizationOnboardingCompletedSchema,
    },
    {
      name: 'OrganizationInvitationSchema',
      schema: OrganizationInvitationSchema,
    },
    {
      name: 'CustomersCsvExportReadySchema',
      schema: CustomersCsvExportReadySchema,
    },
  ]

  for (const { name, schema } of schemaTests) {
    it(`${name} is a valid Zod schema with parse method`, () => {
      expect(typeof schema.parse).toBe('function')
      expect(typeof schema.safeParse).toBe('function')
    })
  }
})
