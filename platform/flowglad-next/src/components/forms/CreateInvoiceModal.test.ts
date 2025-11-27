import { describe, expect, it } from 'vitest'
import { createInvoiceSchema } from '@/db/schema/invoiceLineItems'
import { Organization } from '@/db/schema/organizations'
import { BusinessOnboardingStatus, CurrencyCode } from '@/types'
import { constructInvoiceDefaultValues } from './CreateInvoiceModal'
import { newInvoiceLineItem } from './InvoiceFormLineItemsField'

describe('constructInvoiceDefaultValues', () => {
  it('should construct default values for an invoice that parses with the createInvoiceSchema', () => {
    const now = Date.now()
    const defaultValues = constructInvoiceDefaultValues({
      id: '1',
      name: 'Test Organization',
      createdAt: now,
      updatedAt: now,
      domain: 'test.com',
      countryId: '1',
      logoURL: 'https://test.com/logo.png',
      tagline: 'Test Tagline',
      subdomainSlug: 'test',
      payoutsEnabled: true,
      onboardingStatus: BusinessOnboardingStatus.FullyOnboarded,
      featureFlags: {},
      defaultCurrency: CurrencyCode.USD,
      billingAddress: {
        address: {
          country: 'US',
          line1: '123 Main St',
          line2: 'Apt 1',
          city: 'Anytown',
          state: 'CA',
          postal_code: '12345',
        },
        name: 'Test Organization',
        firstName: 'Test',
        lastName: 'Organization',
      },
      contactEmail: 'test@test.com',
      allowMultipleSubscriptionsPerCustomer: false,
      monthlyBillingVolumeFreeTier: 100000,
    })
    expect(defaultValues).toBeDefined()
    expect(createInvoiceSchema.safeParse(defaultValues).success).toBe(
      true
    )
    const withNewLineItem = {
      ...defaultValues,
      invoiceLineItems: [
        ...defaultValues.invoiceLineItems,
        newInvoiceLineItem,
      ],
    }
    expect(
      createInvoiceSchema.safeParse(withNewLineItem).success
    ).toBe(true)
  })
})
