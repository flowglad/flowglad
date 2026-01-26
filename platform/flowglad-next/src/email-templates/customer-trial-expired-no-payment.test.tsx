/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import core from '@/utils/core'
import { CustomerTrialExpiredNoPaymentEmail } from './customer-trial-expired-no-payment'
import { suppressEmailHydrationWarnings } from './test-utils'

describe('CustomerTrialExpiredNoPaymentEmail', () => {
  suppressEmailHydrationWarnings()
  const baseProps = {
    customerName: 'John Doe',
    organizationName: 'Acme Corp',
    organizationLogoUrl: 'https://example.com/logo.png',
    organizationId: 'org_123',
    customerId: 'cus_456',
    productName: 'Pro Plan',
    livemode: true,
  }

  it('renders email with all expected content', () => {
    const { getByTestId, getByText } = render(
      <CustomerTrialExpiredNoPaymentEmail {...baseProps} />
    )

    // Header
    expect(getByTestId('email-title')).toHaveTextContent(
      'Update Your Payment Method'
    )

    // Customer greeting
    expect(
      getByText(`Hi ${baseProps.customerName},`)
    ).toBeInTheDocument()

    // Thanks message with product name
    expect(
      getByText(
        `Thanks for trying ${baseProps.productName}! Your trial period has ended.`
      )
    ).toBeInTheDocument()

    // Add payment method instructions with product name
    expect(
      getByText(
        /Please add a payment method to continue using Pro Plan without interruption\./
      )
    ).toBeInTheDocument()

    // Add payment method button with correct link
    const button = getByTestId('add-payment-method-button')
    expect(button).toHaveTextContent('Add Payment Method →')
    expect(button).toHaveAttribute(
      'href',
      core.customerBillingPortalURL({
        organizationId: baseProps.organizationId,
        customerId: baseProps.customerId,
      })
    )

    // Organization signature
    expect(getByTestId('signature-thanks')).toHaveTextContent(
      'Thanks,'
    )
    expect(getByTestId('signature-org-name')).toHaveTextContent(
      baseProps.organizationName
    )
  })

  it('renders without organization logo when not provided', () => {
    const propsWithoutLogo = {
      ...baseProps,
      organizationLogoUrl: undefined,
    }
    const { queryByAltText } = render(
      <CustomerTrialExpiredNoPaymentEmail {...propsWithoutLogo} />
    )

    expect(queryByAltText('Logo')).not.toBeInTheDocument()
  })
})
